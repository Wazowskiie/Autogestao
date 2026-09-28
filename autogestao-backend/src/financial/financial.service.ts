import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

const TRANSACTION_INCLUDE = {
  sale: { include: { vehicle: true, customer: true } },
  vehicle: { select: { id: true, brand: true, model: true, year: true, plate: true } },
} as const;

// Lê "AAAA-MM-DD" e guarda ao MEIO-DIA em UTC.
// Assim a data não "volta um dia" no fuso do Brasil.
function parseDateOnly(value?: string) {
  const text = value ? String(value).slice(0, 10) : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [year, month, day] = text.split('-').map(Number);
  if (!year || !month || !day) throw new BadRequestException('Data inválida');
  return new Date(Date.UTC(year, month - 1, day, 12));
}

// Soma meses mantendo o dia (31/01 + 1 mês = 28/02, e não 03/03)
function addMonthsUtc(base: Date, months: number) {
  const day = base.getUTCDate();
  const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1, 12));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date;
}

// Intervalo do mês "AAAA-MM" em UTC
function monthRange(month: string) {
  const [year, m] = month.split('-').map(Number);
  return { gte: new Date(Date.UTC(year, m - 1, 1)), lt: new Date(Date.UTC(year, m, 1)) };
}

// Início do dia de hoje no horário de Brasília
function startOfTodayBrazil() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return new Date(`${today}T00:00:00Z`);
}

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dealershipId: string, dto: CreateTransactionDto) {
    // Se veio um veículo, confere se ele é desta revenda
    if (dto.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: dto.vehicleId, dealershipId },
        select: { id: true },
      });
      if (!vehicle) throw new NotFoundException('Veículo não encontrado');
    }

    const baseDate = parseDateOnly(dto.date);
    const paid = dto.paid ?? true;
    const repeat = dto.repeatMonths && dto.repeatMonths > 1 ? dto.repeatMonths : 1;

    const common = {
      dealershipId,
      type: dto.type,
      category: dto.category,
      amount: dto.amount,
      description: dto.description,
      saleId: dto.saleId,
      vehicleId: dto.vehicleId || null,
    };

    // Lançamento único
    if (repeat === 1) {
      return this.prisma.financialTransaction.create({
        data: { ...common, date: baseDate, paid, paidAt: paid ? new Date() : null },
        include: TRANSACTION_INCLUDE,
      });
    }

    // Lançamento que repete todo mês: cria todos de uma vez.
    // O primeiro segue o status escolhido; os próximos ficam "a pagar/a receber".
    const recurrenceId = randomUUID();
    const created = await this.prisma.$transaction(
      Array.from({ length: repeat }, (_, i) => {
        const isFirstAndPaid = i === 0 && paid;
        return this.prisma.financialTransaction.create({
          data: {
            ...common,
            date: addMonthsUtc(baseDate, i),
            paid: isFirstAndPaid,
            paidAt: isFirstAndPaid ? new Date() : null,
            recurrenceId,
            recurrenceIndex: i + 1,
            recurrenceTotal: repeat,
          },
          include: TRANSACTION_INCLUDE,
        });
      }),
    );

    return created[0];
  }

  async findAll(dealershipId: string, query: QueryTransactionDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: any = { dealershipId };

    if (query.month) where.date = monthRange(query.month);
    if (query.type) where.type = query.type;
    if (query.category) where.category = { contains: query.category, mode: 'insensitive' };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.financialTransaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: TRANSACTION_INCLUDE,
      }),
      this.prisma.financialTransaction.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async summary(dealershipId: string, month?: string) {
    const where: any = { dealershipId };
    if (month) where.date = monthRange(month);

    const transactions = await this.prisma.financialTransaction.findMany({ where });

    // Receitas e despesas contam só o que já foi pago/recebido (dinheiro de verdade)
    const paidOnly = transactions.filter((t) => t.paid);
    const open = transactions.filter((t) => !t.paid);

    const sum = (list: typeof transactions) => list.reduce((acc, t) => acc + Number(t.amount), 0);

    const totalRevenue = sum(paidOnly.filter((t) => t.type === 'revenue'));
    const totalExpense = sum(paidOnly.filter((t) => t.type === 'expense'));
    const payableAmount = sum(open.filter((t) => t.type === 'expense'));
    const receivableAmount = sum(open.filter((t) => t.type === 'revenue'));

    const today = startOfTodayBrazil();
    const overdueCount = open.filter((t) => new Date(t.date) < today).length;

    // Agrupa por categoria para o gráfico (só o que foi pago/recebido)
    const byCategory: Record<string, { revenue: number; expense: number }> = {};
    for (const t of paidOnly) {
      if (!byCategory[t.category]) byCategory[t.category] = { revenue: 0, expense: 0 };
      if (t.type === 'revenue') byCategory[t.category].revenue += Number(t.amount);
      else byCategory[t.category].expense += Number(t.amount);
    }

    return {
      totalRevenue,
      totalExpense,
      balance: totalRevenue - totalExpense,
      payableAmount,
      receivableAmount,
      overdueCount,
      transactionCount: transactions.length,
      byCategory,
    };
  }

  // Dar baixa: marca como pago/recebido
  async pay(dealershipId: string, id: string) {
    const transaction = await this.prisma.financialTransaction.findFirst({
      where: { id, dealershipId },
    });
    if (!transaction) throw new NotFoundException('Lançamento não encontrado');
    if (transaction.paid) throw new BadRequestException('Este lançamento já foi baixado');

    return this.prisma.financialTransaction.update({
      where: { id },
      data: { paid: true, paidAt: new Date() },
      include: TRANSACTION_INCLUDE,
    });
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