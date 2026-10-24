import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

const SALE_INCLUDE = {
  vehicle: true,
  customer: true,
  seller: { select: { id: true, name: true } },
  // Veículos que entraram como parte do pagamento
  tradeIns: { select: { id: true, brand: true, model: true, year: true, plate: true, cost: true, status: true } },
  // Formas de pagamento (PIX, dinheiro, cartão...)
  payments: { orderBy: { createdAt: 'asc' } },
} as const;

// Nome de cada forma de pagamento (aparece no Financeiro)
const PAYMENT_NAMES: Record<string, string> = {
  pix: 'PIX', cash: 'Dinheiro', transfer: 'Transferência', card_credit: 'Cartão de crédito',
  card_debit: 'Cartão de débito', financing: 'Financiamento', consortium: 'Consórcio', promissory: 'Promissórias',
};

// Formas em que o dinheiro ainda vai entrar depois (ficam "pendentes" no Financeiro)
const RECEIVED_LATER = ['financing', 'consortium', 'promissory'];

const round2 = (n: number) => Math.round(n * 100) / 100;

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
    // Pega o maior número do ano (contar as vendas repetiria número depois de excluir alguma)
    const used = await this.prisma.sale.findMany({
      where: { dealershipId, contractNumber: { startsWith: `${year}/` } },
      select: { contractNumber: true },
    });
    const max = used.reduce((m, s) => Math.max(m, Number(s.contractNumber?.split('/')[1]) || 0), 0);
    return `${year}/${String(max + 1).padStart(4, '0')}`;
  }

  /** Tudo o que o contrato e as promissórias precisam, numa chamada só */
  async documents(dealershipId: string, id: string, actor?: AuthenticatedUser) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, dealershipId, ...(actor?.role === 'seller' ? { sellerId: actor.userId } : {}) },
      include: {
        vehicle: true,
        customer: true,
        seller: { select: { name: true } },
        payments: { orderBy: { createdAt: 'asc' } },
        tradeIns: {
          select: { brand: true, model: true, version: true, year: true, manufactureYear: true, color: true, plate: true, chassis: true, renavam: true, km: true, cost: true },
        },
        promissoryNotes: { orderBy: { installmentNumber: 'asc' } },
      },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');

    // Vendas antigas sem número de contrato ganham um agora
    let contractNumber = sale.contractNumber;
    if (!contractNumber) {
      contractNumber = await this.generateContractNumber(dealershipId);
      await this.prisma.sale.update({ where: { id }, data: { contractNumber } });
    }

    const d = await this.prisma.dealership.findUniqueOrThrow({ where: { id: dealershipId } });
    const v = sale.vehicle;
    return {
      id: sale.id,
      contractNumber,
      soldAt: sale.soldAt,
      price: Number(sale.price),
      notes: sale.notes,
      seller: sale.seller.name,
      dealership: {
        name: d.name, cnpj: d.cnpj, phone: d.phone, logoUrl: d.logoUrl,
        street: d.focusNfeLogradouro, number: d.focusNfeNumero, district: d.focusNfeBairro, zip: d.focusNfeCep,
        city: d.focusNfeMunicipio || d.city, state: d.focusNfeUf || d.state,
      },
      customer: {
        name: sale.customer.name, document: sale.customer.document, phone: sale.customer.phone,
        email: sale.customer.email, address: sale.customer.address,
      },
      vehicle: {
        type: v.type, brand: v.brand, model: v.model, version: v.version, year: v.year, manufactureYear: v.manufactureYear,
        color: v.color, plate: v.plate, chassis: v.chassis, renavam: v.renavam, km: v.km, fuel: v.fuel,
      },
      payments: sale.payments.map((p) => ({
        method: p.method, amount: Number(p.amount), installments: p.installments, notes: p.notes,
      })),
      tradeIns: sale.tradeIns.map((t) => ({ ...t, value: Number(t.cost) })),
      promissoryNotes: sale.promissoryNotes.map((n) => ({
        id: n.id, number: n.installmentNumber, total: n.totalInstallments, amount: Number(n.amount),
        dueDate: n.dueDate, paid: n.paid, paidAt: n.paidAt,
      })),
    };
  }

  async create(dealershipId: string, userId: string, dto: CreateSaleDto, actor?: AuthenticatedUser) {
    if(actor?.role==='seller' && dto.sellerId && dto.sellerId!==userId) throw new ForbiddenException('Vendedor pode registrar vendas somente para si');
    const seller=await this.prisma.user.findFirst({where:{id:dto.sellerId??userId,dealershipId,active:true},select:{id:true}});
    if(!seller) throw new NotFoundException('Vendedor não encontrado');
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, dealershipId },
    });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado');
    if (vehicle.status === 'sold') throw new BadRequestException('Este veículo já foi vendido');

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, dealershipId, ...(actor?.role==='seller'?{OR:[{createdById:userId},{leads:{some:{assignedSellerId:userId}}},{sales:{some:{sellerId:userId}}}]}:{}) },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const tradeIns = dto.tradeIns ?? [];
    const tradeInValue = round2(tradeIns.reduce((sum, t) => sum + Number(t.value), 0));
    if (tradeInValue > dto.price) {
      throw new BadRequestException('O valor dos veículos na troca é maior que o preço da venda.');
    }

    // Formas de pagamento: somadas com a troca, precisam fechar o preço
    const payments = (dto.payments ?? []).map((p) => {
      const amount = round2(Number(p.amount));
      const isCard = p.method === 'card_credit' || p.method === 'card_debit';
      const feePercent = isCard && p.feePercent ? Number(p.feePercent) : null;
      return {
        method: p.method,
        amount,
        installments: p.method === 'card_credit' ? p.installments ?? 1 : null,
        feePercent,
        feeAmount: feePercent ? round2((amount * feePercent) / 100) : 0,
        notes: p.notes?.trim() || null,
      };
    });
    if (payments.filter((p) => p.method === 'promissory').length > 1) {
      throw new BadRequestException('Use só uma linha de promissórias por venda.');
    }
    if (payments.length) {
      const paid = round2(payments.reduce((sum, p) => sum + p.amount, 0) + tradeInValue);
      const diff = round2(dto.price - paid);
      if (Math.abs(diff) >= 0.01) {
        throw new BadRequestException(
          diff > 0
            ? `O pagamento não fecha o preço da venda: faltam ${diff.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`
            : `O pagamento passa do preço da venda em ${(-diff).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
        );
      }
    }
    const feesTotal = round2(payments.reduce((sum, p) => sum + p.feeAmount, 0));
    const paymentMethod =
      payments.length === 0 ? dto.paymentMethod : payments.length === 1 ? payments[0].method : 'mixed';

    // A taxa da maquininha sai do lucro
    const profit = dto.price - dto.cost - feesTotal;
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
          paymentMethod,
          notes: dto.notes,
          soldAt,
        },
      });

      await tx.vehicle.update({
        where: { id: dto.vehicleId },
        data: { status: 'sold' },
      });

      const saleLabel = `Venda ${contractNumber}: ${vehicle.brand} ${vehicle.model} ${vehicle.year} — ${customer.name}`;

      if (payments.length === 0) {
        // Venda sem formas detalhadas: uma receita com o valor cheio (como antes)
        await tx.financialTransaction.create({
          data: {
            dealershipId, saleId: created.id, vehicleId: dto.vehicleId,
            type: 'revenue', category: 'Venda de veículo', amount: dto.price, date: soldAt,
            description: saleLabel,
          },
        });
      } else {
        // Uma receita para cada forma de pagamento, para o fechamento do mês por PIX, dinheiro, cartão...
        for (const p of payments) {
          await tx.salePayment.create({ data: { dealershipId, saleId: created.id, ...p } });

          const later = RECEIVED_LATER.includes(p.method);
          await tx.financialTransaction.create({
            data: {
              dealershipId, saleId: created.id, vehicleId: dto.vehicleId,
              type: 'revenue', category: `Venda de veículo - ${PAYMENT_NAMES[p.method] ?? p.method}`,
              amount: p.amount, date: soldAt, paid: !later, paidAt: later ? null : soldAt,
              description: `${saleLabel} (${PAYMENT_NAMES[p.method] ?? p.method}${p.installments && p.installments > 1 ? ` em ${p.installments}x` : ''})`,
            },
          });

          // Taxa da maquininha vira uma despesa
          if (p.feeAmount > 0) {
            await tx.financialTransaction.create({
              data: {
                dealershipId, saleId: created.id, vehicleId: dto.vehicleId,
                type: 'expense', category: 'Taxa de cartão',
                amount: p.feeAmount, date: soldAt, paidAt: soldAt,
                description: `Taxa ${p.feePercent}% (${PAYMENT_NAMES[p.method]}) — venda ${contractNumber}`,
              },
            });
          }
        }

        // A parte paga com veículo também conta como receita da venda
        if (tradeInValue > 0) {
          await tx.financialTransaction.create({
            data: {
              dealershipId, saleId: created.id, vehicleId: dto.vehicleId,
              type: 'revenue', category: 'Venda de veículo - Troca', amount: tradeInValue, date: soldAt, paidAt: soldAt,
              description: `${saleLabel} (veículo na troca)`,
            },
          });
        }
      }

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
            chassis: t.chassis?.trim().toUpperCase() || null,
            renavam: t.renavam?.replace(/\D/g, '') || null,
            fuel: t.fuel?.trim() || null,
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

  async findAll(dealershipId: string, query: QuerySaleDto, actor?: AuthenticatedUser) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: any = { dealershipId };

    if (query.month) {
      const [year, month] = query.month.split('-').map(Number);
      where.soldAt = { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };
    }
    if (query.sellerId) where.sellerId = query.sellerId;
    if(actor?.role==='seller') where.sellerId=actor.userId;

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

  async findOne(dealershipId: string, id: string, actor?: AuthenticatedUser) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, dealershipId, ...(actor?.role==='seller'?{sellerId:actor.userId}:{}) },
      include: { ...SALE_INCLUDE, promissoryNotes: true },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    return sale;
  }

  async summary(dealershipId: string, month?: string, actor?: AuthenticatedUser) {
    const where: any = { dealershipId };
    if(actor?.role==='seller') where.sellerId=actor.userId;
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
    return this.prisma.sale.update({ where: { id }, data: { notes: data.notes, paymentMethod: data.paymentMethod } });
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
