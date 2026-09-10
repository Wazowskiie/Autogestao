import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dealershipId: string, dto: CreateTransactionDto) {
    return this.prisma.financialTransaction.create({
      data: {
        dealershipId,
        type: dto.type,
        category: dto.category,
        amount: dto.amount,
        date: dto.date ? new Date(dto.date) : new Date(),
        description: dto.description,
        saleId: dto.saleId,
      },
    });
  }

  async findAll(dealershipId: string, query: QueryTransactionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: any = { dealershipId };

    if (query.month) {
      const [year, month] = query.month.split('-').map(Number);
      where.date = {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      };
    }

    if (query.type) where.type = query.type;
    if (query.category) where.category = { contains: query.category, mode: 'insensitive' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.financialTransaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { sale: { include: { vehicle: true, customer: true } } },
      }),
      this.prisma.financialTransaction.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async summary(dealershipId: string, month?: string) {
    const where: any = { dealershipId };

    if (month) {
      const [year, m] = month.split('-').map(Number);
      where.date = {
        gte: new Date(year, m - 1, 1),
        lt: new Date(year, m, 1),
      };
    }

    const transactions = await this.prisma.financialTransaction.findMany({ where });

    const totalRevenue = transactions
      .filter((t) => t.type === 'revenue')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const totalExpense = transactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const balance = totalRevenue - totalExpense;

    // Agrupa por categoria para o gráfico
    const byCategory: Record<string, { revenue: number; expense: number }> = {};
    for (const t of transactions) {
      if (!byCategory[t.category]) byCategory[t.category] = { revenue: 0, expense: 0 };
      if (t.type === 'revenue') byCategory[t.category].revenue += Number(t.amount);
      else byCategory[t.category].expense += Number(t.amount);
    }

    return {
      totalRevenue,
      totalExpense,
      balance,
      transactionCount: transactions.length,
      byCategory,
    };
  }

  async remove(dealershipId: string, id: string) {
    const transaction = await this.prisma.financialTransaction.findFirst({
      where: { id, dealershipId },
    });
    if (!transaction) throw new NotFoundException('Lançamento não encontrado');
    await this.prisma.financialTransaction.delete({ where: { id } });
    return { success: true };
  }
}
