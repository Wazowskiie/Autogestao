import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';

const SALE_INCLUDE = {
  vehicle: true,
  customer: true,
  seller: { select: { id: true, name: true } },
  // Veículos que entraram como parte do pagamento
  tradeIns: { select: { id: true, brand: true, model: true, year: true, plate: true, cost: true, status: true } },
} as const;

// "abc-1d23" -> "ABC1D23"
function normalizePlate(plate?: string | null) {
  if (!plate) return null;
  const p = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return p || null;
}

// Lê "AAAA-MM-DD" e guarda ao meio-dia UTC (a data não "volta um dia" no Brasil)
function parseDateOnly(value?: string) {
  if (!value) return new Date();
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return new Date(value);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private async generateContractNumber(dealershipId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.sale.count({ where: { dealershipId } });
    const seq = String(count + 1).padStart(4, '0');
    return `${year}/${seq}`;
  }

  async create(dealershipId: string, userId: string, dto: CreateSaleDto) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, dealershipId },
    });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado');
    if (vehicle.status === 'sold') throw new BadRequestException('Este veículo já foi vendido');

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, dealershipId },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const tradeIns = dto.tradeIns ?? [];
    const tradeInValue = tradeIns.reduce((sum, t) => sum + Number(t.value), 0);
    if (tradeInValue > dto.price) {
      throw new BadRequestException('O valor dos veículos na troca é maior que o preço da venda.');
    }

    const profit = dto.price - dto.cost;
    const margin = dto.cost > 0 ? (profit / dto.cost) * 100 : 0;
    const soldAt = parseDateOnly(dto.soldAt);
    const contractNumber = await this.generateContractNumber(dealershipId);
    const customerFirstName = customer.name.split(' ')[0];

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          dealershipId,
          vehicleId: dto.vehicleId,
          customerId: dto.customerId,
          sellerId: dto.sellerId ?? userId,
          price: dto.price,
          cost: dto.cost,
          profit,
          margin,
          tradeInValue,
          contractNumber,
          paymentMethod: dto.paymentMethod,
          notes: dto.notes,
          soldAt,
        },
      });

      await tx.vehicle.update({
        where: { id: dto.vehicleId },
        data: { status: 'sold' },
      });

      // Receita da venda (valor cheio)
      await tx.financialTransaction.create({
        data: {
          dealershipId,
          saleId: created.id,
          vehicleId: dto.vehicleId,
          type: 'revenue',
          category: 'Venda de veículo',
          amount: dto.price,
          date: soldAt,
          description: `Venda ${contractNumber}: ${vehicle.brand} ${vehicle.model} ${vehicle.year} — ${customer.name}`,
        },
      });

      // Cada veículo da troca: entra no estoque e vira uma despesa de "Estoque".
      // Assim o saldo do financeiro mostra só o dinheiro que entrou de verdade
      // (preço da venda − valor pago pelos veículos da troca).
      for (const t of tradeIns) {
        const tradeVehicle = await tx.vehicle.create({
          data: {
            dealershipId,
            createdById: userId,
            tradeInSaleId: created.id,
            type: t.type,
            status: 'available',
            brand: t.brand.trim(),
            model: t.model.trim(),
            version: t.version?.trim() || null,
            year: t.year,
            manufactureYear: t.manufactureYear ?? null,
            km: t.km ?? 0,
            color: t.color?.trim() || null,
            plate: normalizePlate(t.plate),
            engineCc: t.engineCc ?? null,
            cost: t.value,
            // Preço de venda começa igual ao custo; a revenda ajusta depois no Estoque
            price: t.value,
            description: `Entrou na troca da venda ${contractNumber} (cliente ${customerFirstName}).`,
            optionals: [],
          },
        });

        await tx.financialTransaction.create({
          data: {
            dealershipId,
            saleId: created.id,
            vehicleId: tradeVehicle.id,
            type: 'expense',
            category: 'Estoque',
            amount: t.value,
            date: soldAt,
            description: `Troca na venda ${contractNumber}: ${tradeVehicle.brand} ${tradeVehicle.model} ${tradeVehicle.year}`,
          },
        });
      }

      return created;
    });

    return this.prisma.sale.findUnique({ where: { id: sale.id }, include: SALE_INCLUDE });
  }

  async findAll(dealershipId: string, query: QuerySaleDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: any = { dealershipId };

    if (query.month) {
      const [year, month] = query.month.split('-').map(Number);
      where.soldAt = { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };
    }
    if (query.sellerId) where.sellerId = query.sellerId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: SALE_INCLUDE,
        orderBy: { soldAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(dealershipId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, dealershipId },
      include: { ...SALE_INCLUDE, promissoryNotes: true },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    return sale;
  }

  async summary(dealershipId: string, month?: string) {
    const where: any = { dealershipId };
    if (month) {
      const [year, m] = month.split('-').map(Number);
      where.soldAt = { gte: new Date(Date.UTC(year, m - 1, 1)), lt: new Date(Date.UTC(year, m, 1)) };
    }

    const sales = await this.prisma.sale.findMany({ where });
    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.price), 0);
    const totalCost = sales.reduce((sum, s) => sum + Number(s.cost), 0);
    const totalProfit = sales.reduce((sum, s) => sum + Number(s.profit), 0);
    const avgMargin = sales.length > 0
      ? sales.reduce((sum, s) => sum + Number(s.margin), 0) / sales.length
      : 0;

    return { count: sales.length, totalRevenue, totalCost, totalProfit, avgMargin };
  }

  // Só owner/admin podem editar — proteção feita no controller via @Roles
  async update(dealershipId: string, id: string, data: Partial<{ notes: string; paymentMethod: string }>) {
    const sale = await this.prisma.sale.findFirst({ where: { id, dealershipId } });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    return this.prisma.sale.update({ where: { id }, data });
  }

  // Só owner/admin podem excluir
  async remove(dealershipId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, dealershipId },
      include: { tradeIns: { select: { id: true, status: true, brand: true, model: true } } },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');

    // Se algum veículo da troca já foi vendido, não dá pra desfazer esta venda com segurança
    const soldTradeIn = sale.tradeIns.find((t) => t.status === 'sold');
    if (soldTradeIn) {
      throw new BadRequestException(
        `Não é possível excluir: o veículo da troca (${soldTradeIn.brand} ${soldTradeIn.model}) já foi vendido.`,
      );
    }

    const tradeInIds = sale.tradeIns.map((t) => t.id);

    await this.prisma.$transaction([
      this.prisma.promissoryNote.deleteMany({ where: { saleId: id } }),
      this.prisma.financialTransaction.deleteMany({ where: { saleId: id } }),
      // Os veículos que entraram na troca saem do estoque junto com a venda
      this.prisma.vehicle.deleteMany({ where: { id: { in: tradeInIds } } }),
      // Reativa o veículo vendido no estoque
      this.prisma.vehicle.update({ where: { id: sale.vehicleId }, data: { status: 'available' } }),
      this.prisma.sale.delete({ where: { id } }),
    ]);

    return { success: true };
  }
}