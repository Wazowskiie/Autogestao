import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';

const SALE_INCLUDE = {
  vehicle: true,
  customer: true,
  seller: { select: { id: true, name: true } },
} as const;

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

    const profit = dto.price - dto.cost;
    const margin = dto.cost > 0 ? (profit / dto.cost) * 100 : 0;
    const soldAt = dto.soldAt ? new Date(dto.soldAt) : new Date();
    const contractNumber = await this.generateContractNumber(dealershipId);

    const [sale] = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          dealershipId,
          vehicleId: dto.vehicleId,
          customerId: dto.customerId,
          sellerId: dto.sellerId ?? userId,
          price: dto.price,
          cost: dto.cost,
          profit,
          margin,
          contractNumber,
          paymentMethod: dto.paymentMethod,
          notes: dto.notes,
          soldAt,
        },
        include: SALE_INCLUDE,
      });

      await tx.vehicle.update({
        where: { id: dto.vehicleId },
        data: { status: 'sold' },
      });

      await tx.financialTransaction.create({
        data: {
          dealershipId,
          saleId: sale.id,
          type: 'revenue',
          category: 'Venda de veículo',
          amount: dto.price,
          date: soldAt,
          description: `Venda ${contractNumber}: ${vehicle.brand} ${vehicle.model} ${vehicle.year} — ${customer.name}`,
        },
      });

      return [sale];
    });

    return sale;
  }

  async findAll(dealershipId: string, query: QuerySaleDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: any = { dealershipId };

    if (query.month) {
      const [year, month] = query.month.split('-').map(Number);
      where.soldAt = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
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
      where.soldAt = { gte: new Date(year, m - 1, 1), lt: new Date(year, m, 1) };
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
    const sale = await this.prisma.sale.findFirst({ where: { id, dealershipId } });
    if (!sale) throw new NotFoundException('Venda não encontrada');

    // Reativa o veículo no estoque
    await this.prisma.$transaction([
      this.prisma.promissoryNote.deleteMany({ where: { saleId: id } }),
      this.prisma.financialTransaction.deleteMany({ where: { saleId: id } }),
      this.prisma.vehicle.update({ where: { id: sale.vehicleId }, data: { status: 'available' } }),
      this.prisma.sale.delete({ where: { id } }),
    ]);

    return { success: true };
  }
}
