import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromissoryNoteDto } from './dto/create-promissory-note.dto';
import { QueryPromissoryNoteDto } from './dto/query-promissory-note.dto';
import { InterestRatesService } from '../interest-rates/interest-rates.service';

const NOTE_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  sale: { include: { vehicle: true } },
} as const;

// Monta a data de vencimento ao MEIO-DIA em UTC.
// Assim, no fuso do Brasil (3h atrás), a data continua no mesmo dia e não "volta um dia".
// Também corrige meses mais curtos: 31/01 + 1 mês vira 28/02 (e não 03/03).
function buildDueDate(year: number, monthIndex: number, day: number, monthsToAdd: number) {
  const date = new Date(Date.UTC(year, monthIndex + monthsToAdd, 1, 12));
  const lastDayOfMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDayOfMonth));
  return date;
}

// Início do dia de hoje no horário de Brasília, para saber o que está vencido
function startOfTodayBrazil() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return new Date(`${today}T00:00:00Z`);
}

@Injectable()
export class PromissoryNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dealershipId: string, dto: CreatePromissoryNoteDto) {
    // Valida que a venda pertence à revenda
    const sale = await this.prisma.sale.findFirst({
      where: { id: dto.saleId, dealershipId },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');

    // Verifica se já existe parcelamento pra essa venda
    const existing = await this.prisma.promissoryNote.count({
      where: { saleId: dto.saleId },
    });
    if (existing > 0) throw new BadRequestException('Esta venda já possui promissórias geradas');

    const totalInstallments = dto.totalInstallments;

    // Parcelas redondas: todas iguais e a última ajusta a diferença
    const { installmentValue, lastInstallmentValue } = InterestRatesService.splitInstallments(
      Number(dto.totalAmount),
      totalInstallments,
    );

    // Lê a data "AAAA-MM-DD" sem deixar o fuso horário mexer nela
    const [year, month, day] = String(dto.firstDueDate).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) throw new BadRequestException('Data do 1º vencimento inválida');

    // Gera todas as parcelas de uma vez
    const notes = await this.prisma.$transaction(
      Array.from({ length: totalInstallments }, (_, i) => {
        const isLast = i === totalInstallments - 1;

        return this.prisma.promissoryNote.create({
          data: {
            dealershipId,
            saleId: dto.saleId,
            customerId: dto.customerId,
            installmentNumber: i + 1,
            totalInstallments,
            amount: isLast ? lastInstallmentValue : installmentValue,
            dueDate: buildDueDate(year, month - 1, day, i),
          },
          include: NOTE_INCLUDE,
        });
      }),
    );

    return notes;
  }

  async findAll(dealershipId: string, query: QueryPromissoryNoteDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    const where: any = { dealershipId };

    if (query.saleId) where.saleId = query.saleId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.paid !== undefined) where.paid = query.paid;

    if (query.month) {
      const [year, month] = query.month.split('-').map(Number);
      where.dueDate = {
        gte: new Date(Date.UTC(year, month - 1, 1)),
        lt: new Date(Date.UTC(year, month, 1)),
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.promissoryNote.findMany({
        where,
        include: NOTE_INCLUDE,
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.promissoryNote.count({ where }),
    ]);

    // Resumo de vencidas, a vencer e pagas
    const allNotes = await this.prisma.promissoryNote.findMany({
      where: { dealershipId },
      select: { paid: true, dueDate: true, amount: true, saleId: true },
    });

    // Parcela que vence HOJE ainda não conta como vencida
    const today = startOfTodayBrazil();
    const overdue = allNotes.filter((n) => !n.paid && new Date(n.dueDate) < today);
    const pending = allNotes.filter((n) => !n.paid && new Date(n.dueDate) >= today);
    const paid = allNotes.filter((n) => n.paid);
    // Contagem por promissória (uma venda = uma promissória, com várias parcelas)
    const salesOf = (list: { saleId: string }[]) => new Set(list.map((n) => n.saleId)).size;
    const openSales = new Set(allNotes.filter((n) => !n.paid).map((n) => n.saleId));
    const settledSales = new Set(allNotes.filter((n) => !openSales.has(n.saleId)).map((n) => n.saleId));

    return {
      items,
      total,
      page,
      pageSize,
      summary: {
        overdueCount: overdue.length,
        overdueAmount: overdue.reduce((sum, n) => sum + Number(n.amount), 0),
        pendingCount: pending.length,
        pendingAmount: pending.reduce((sum, n) => sum + Number(n.amount), 0),
        paidCount: paid.length,
        paidAmount: paid.reduce((sum, n) => sum + Number(n.amount), 0),
        overdueSales: salesOf(overdue),   // promissórias com alguma parcela atrasada
        pendingSales: salesOf(pending),   // promissórias com parcelas a vencer
        settledSales: settledSales.size,  // promissórias quitadas (todas as parcelas pagas)
      },
    };
  }

  /**
   * Relatório das promissórias de um período (pelo vencimento das parcelas):
   * quanto vence, quanto já entrou, o que está atrasado, mês a mês, e quem está devendo.
   */
  async report(dealershipId: string, fromStr?: string, toStr?: string) {
    const parse = (v: string | undefined, fallback: Date) => {
      if (!v) return fallback;
      const [y, m, d] = v.slice(0, 10).split('-').map(Number);
      if (!y || !m || !d) throw new BadRequestException('Data inválida no relatório');
      return new Date(Date.UTC(y, m - 1, d));
    };
    const today = startOfTodayBrazil();
    const from = parse(fromStr, new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
    const to = parse(toStr, new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 6, 0)));
    if (to < from) throw new BadRequestException('A data final precisa ser depois da inicial');
    const toEnd = new Date(to.getTime() + 86_400_000 - 1); // fim do dia
    // pagamentos são gravados no horário real: o dia de Brasília começa às 03:00 UTC
    const paidFrom = new Date(from.getTime() + 3 * 3_600_000);
    const paidTo = new Date(toEnd.getTime() + 3 * 3_600_000);

    const notes = await this.prisma.promissoryNote.findMany({
      where: { dealershipId },
      select: {
        id: true, saleId: true, amount: true, dueDate: true, paid: true, paidAt: true,
        installmentNumber: true, totalInstallments: true,
        customer: { select: { id: true, name: true, phone: true } },
        sale: { select: { contractNumber: true, vehicle: { select: { brand: true, model: true, year: true, plate: true } } } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const amt = (n: { amount: unknown }) => Number(n.amount);
    const isOverdue = (n: { paid: boolean; dueDate: Date }) => !n.paid && n.dueDate < today;
    const inPeriod = notes.filter((n) => n.dueDate >= from && n.dueDate <= toEnd);

    // Mês a mês (pelo vencimento)
    const months = new Map<string, { month: string; count: number; due: number; paid: number; open: number; overdue: number }>();
    for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= toEnd; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      months.set(key, { month: key, count: 0, due: 0, paid: 0, open: 0, overdue: 0 });
    }
    for (const n of inPeriod) {
      const key = `${n.dueDate.getUTCFullYear()}-${String(n.dueDate.getUTCMonth() + 1).padStart(2, '0')}`;
      const m = months.get(key);
      if (!m) continue;
      m.count += 1;
      m.due += amt(n);
      if (n.paid) m.paid += amt(n);
      else if (isOverdue(n)) m.overdue += amt(n);
      else m.open += amt(n);
    }

    // Quem está devendo (todas as parcelas atrasadas, de qualquer data)
    const debtors = new Map<string, {
      customerId: string; name: string; phone: string | null; overdueCount: number; overdueAmount: number;
      oldestDueDate: Date; daysLate: number; sales: Set<string>; vehicles: Set<string>;
    }>();
    for (const n of notes.filter(isOverdue)) {
      const v = n.sale.vehicle;
      const key = n.customer.id;
      const days = Math.floor((today.getTime() - Date.UTC(n.dueDate.getUTCFullYear(), n.dueDate.getUTCMonth(), n.dueDate.getUTCDate())) / 86_400_000);
      const d = debtors.get(key) ?? {
        customerId: key, name: n.customer.name, phone: n.customer.phone, overdueCount: 0, overdueAmount: 0,
        oldestDueDate: n.dueDate, daysLate: 0, sales: new Set<string>(), vehicles: new Set<string>(),
      };
      d.overdueCount += 1;
      d.overdueAmount += amt(n);
      if (n.dueDate < d.oldestDueDate) d.oldestDueDate = n.dueDate;
      d.daysLate = Math.max(d.daysLate, days);
      d.sales.add(n.saleId);
      d.vehicles.add(`${v.brand} ${v.model} ${v.year}${v.plate ? ` (${v.plate})` : ''}`);
      debtors.set(key, d);
    }

    // Carteira: tudo que ainda falta receber
    const open = notes.filter((n) => !n.paid);
    const overdueAll = notes.filter(isOverdue);
    // Inadimplência: do que já venceu até hoje, quanto não foi pago
    const dueUntilToday = notes.filter((n) => n.dueDate < today);
    const dueUntilTodayAmount = dueUntilToday.reduce((sum, n) => sum + amt(n), 0);
    const overdueAmount = overdueAll.reduce((sum, n) => sum + amt(n), 0);

    const receivedInPeriod = notes.filter((n) => n.paid && n.paidAt && n.paidAt >= paidFrom && n.paidAt <= paidTo);

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      period: {
        dueCount: inPeriod.length,
        dueAmount: r2(inPeriod.reduce((sum, n) => sum + amt(n), 0)),
        paidOfDueAmount: r2(inPeriod.filter((n) => n.paid).reduce((sum, n) => sum + amt(n), 0)),
        openAmount: r2(inPeriod.filter((n) => !n.paid && !isOverdue(n)).reduce((sum, n) => sum + amt(n), 0)),
        overdueAmount: r2(inPeriod.filter(isOverdue).reduce((sum, n) => sum + amt(n), 0)),
        receivedCount: receivedInPeriod.length,
        receivedAmount: r2(receivedInPeriod.reduce((sum, n) => sum + amt(n), 0)),
      },
      portfolio: {
        activePromissories: new Set(open.map((n) => n.saleId)).size,
        openCount: open.length,
        openAmount: r2(open.reduce((sum, n) => sum + amt(n), 0)),
        overdueCount: overdueAll.length,
        overdueAmount: r2(overdueAmount),
        delinquencyRate: dueUntilTodayAmount > 0 ? r2((overdueAmount / dueUntilTodayAmount) * 100) : 0,
      },
      months: [...months.values()].map((m) => ({ ...m, due: r2(m.due), paid: r2(m.paid), open: r2(m.open), overdue: r2(m.overdue) })),
      debtors: [...debtors.values()]
        .sort((a, b) => b.daysLate - a.daysLate || b.overdueAmount - a.overdueAmount)
        .map((d) => ({
          customerId: d.customerId, name: d.name, phone: d.phone, overdueCount: d.overdueCount,
          overdueAmount: r2(d.overdueAmount), oldestDueDate: d.oldestDueDate, daysLate: d.daysLate,
          promissories: d.sales.size, vehicles: [...d.vehicles],
        })),
      // Parcelas do período, para exportar em planilha
      installments: inPeriod.map((n) => ({
        customer: n.customer.name, phone: n.customer.phone,
        vehicle: `${n.sale.vehicle.brand} ${n.sale.vehicle.model} ${n.sale.vehicle.year}`,
        contract: n.sale.contractNumber, number: n.installmentNumber, total: n.totalInstallments,
        dueDate: n.dueDate, amount: amt(n), status: n.paid ? 'paga' : isOverdue(n) ? 'atrasada' : 'a vencer', paidAt: n.paidAt,
      })),
    };
  }

  async pay(dealershipId: string, id: string) {
    const note = await this.prisma.promissoryNote.findFirst({
      where: { id, dealershipId },
    });
    if (!note) throw new NotFoundException('Promissória não encontrada');
    if (note.paid) throw new BadRequestException('Esta promissória já foi baixada');

    return this.prisma.promissoryNote.update({
      where: { id },
      data: { paid: true, paidAt: new Date() },
      include: NOTE_INCLUDE,
    });
  }

  async remove(dealershipId: string, id: string) {
    const note = await this.prisma.promissoryNote.findFirst({
      where: { id, dealershipId },
    });
    if (!note) throw new NotFoundException('Promissória não encontrada');
    await this.prisma.promissoryNote.delete({ where: { id } });
    return { success: true };
  }
}