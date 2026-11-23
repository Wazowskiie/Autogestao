import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Fechamento do mês: junta numa resposta só o que o dono precisa para fechar
 * o mês da loja (vendas, caixa, comissões, promissórias, contas em aberto,
 * financiamentos e estoque). Só leitura — não altera nada.
 *
 * Datas seguem o mesmo padrão do Financeiro e de Vendas: o dia é salvo em UTC
 * meia-noite, então o mês vai de 1º 00:00 UTC até o 1º do mês seguinte.
 */

const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

function monthRange(month: string) {
  const [year, m] = month.split('-').map(Number);
  return { gte: new Date(Date.UTC(year, m - 1, 1)), lt: new Date(Date.UTC(year, m, 1)) };
}

function currentMonthBR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
}

function startOfTodayBrazil() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return new Date(`${today}T00:00:00Z`);
}

const vehicleName = (v: { brand: string; model: string; year: number; plate?: string | null }) =>
  `${v.brand} ${v.model} ${v.year}${v.plate ? ` (${v.plate})` : ''}`;

@Injectable()
export class ClosingService {
  constructor(private readonly prisma: PrismaService) {}

  async monthClosing(dealershipId: string, monthParam?: string) {
    const month = monthParam ?? currentMonthBR();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Mês inválido. Use AAAA-MM.');
    const range = monthRange(month);
    const today = startOfTodayBrazil();

    const [sales, canceledSales, transactions, notesPaidInMonth, notesDueInMonth, notesOverdue, notesFuture, financingOpen, stock, parts, entries] =
      await Promise.all([
        this.prisma.sale.findMany({
          where: { dealershipId, status: 'active', soldAt: range },
          orderBy: { soldAt: 'asc' },
          include: {
            vehicle: { select: { brand: true, model: true, year: true, plate: true } },
            customer: { select: { name: true } },
            seller: { select: { id: true, name: true } },
            payments: { select: { method: true, amount: true, feeAmount: true, returnAmount: true } },
            expenses: { select: { amount: true } },
          },
        }),
        this.prisma.sale.findMany({
          where: { dealershipId, status: 'canceled', canceledAt: range },
          select: { refundAmount: true },
        }),
        this.prisma.financialTransaction.findMany({
          where: { dealershipId, date: range },
          select: { type: true, category: true, amount: true, paid: true, date: true },
        }),
        this.prisma.promissoryNote.findMany({
          where: { dealershipId, paid: true, paidAt: range },
          select: { amount: true },
        }),
        this.prisma.promissoryNote.findMany({
          where: { dealershipId, dueDate: range },
          select: { amount: true, paid: true },
        }),
        this.prisma.promissoryNote.findMany({
          where: { dealershipId, paid: false, dueDate: { lt: today } },
          select: { amount: true },
        }),
        this.prisma.promissoryNote.findMany({
          where: { dealershipId, paid: false, dueDate: { gte: today } },
          select: { amount: true },
        }),
        this.prisma.salePayment.findMany({
          where: {
            dealershipId,
            method: { in: ['financing', 'consortium'] },
            OR: [{ financingStatus: null }, { financingStatus: { in: ['analysis', 'approved'] } }],
            sale: { status: 'active' },
          },
          select: { amount: true },
        }),
        this.prisma.vehicle.findMany({
          where: { dealershipId, status: { in: ['available', 'reserved'] } },
          select: { status: true, cost: true, price: true },
        }),
        this.prisma.part.findMany({ where: { dealershipId }, select: { cost: true, price: true, stockQty: true } }),
        this.prisma.vehicle.findMany({
          where: {
            dealershipId,
            OR: [{ acquisition: { entryDate: range } }, { acquisition: null, createdAt: range }],
          },
          select: {
            brand: true, model: true, year: true, plate: true, cost: true, tradeInSaleId: true, createdAt: true,
            acquisition: { select: { entryDate: true, purchaseValue: true, ownershipType: true } },
          },
        }),
      ]);

    // ---- Vendas ----
    const revenue = sales.reduce((t, s) => t + n(s.price), 0);
    const cost = sales.reduce((t, s) => t + n(s.cost), 0);
    const profit = sales.reduce((t, s) => t + n(s.profit), 0);
    const cardFees = sales.reduce((t, s) => t + s.payments.reduce((a, p) => a + n(p.feeAmount), 0), 0);
    const bankReturn = sales.reduce((t, s) => t + s.payments.reduce((a, p) => a + n(p.returnAmount), 0), 0);
    const saleExpenses = sales.reduce((t, s) => t + s.expenses.reduce((a, e) => a + n(e.amount), 0), 0);

    // Como o dinheiro das vendas entrou (o veículo na troca conta à parte)
    const byMethod: Record<string, number> = {};
    for (const s of sales) {
      if (s.payments.length) s.payments.forEach((p) => (byMethod[p.method] = (byMethod[p.method] ?? 0) + n(p.amount)));
      else if (s.paymentMethod) byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] ?? 0) + n(s.price) - n(s.tradeInValue);
      if (n(s.tradeInValue) > 0) byMethod.trade_in = (byMethod.trade_in ?? 0) + n(s.tradeInValue);
    }

    // ---- Comissões por vendedor ----
    const sellers = new Map<string, { sellerId: string; name: string; count: number; revenue: number; profit: number; commission: number; commissionPaid: number }>();
    for (const s of sales) {
      const row = sellers.get(s.seller.id) ?? { sellerId: s.seller.id, name: s.seller.name, count: 0, revenue: 0, profit: 0, commission: 0, commissionPaid: 0 };
      row.count += 1;
      row.revenue += n(s.price);
      row.profit += n(s.profit);
      row.commission += n(s.commissionAmount);
      if (s.commissionPaidAt) row.commissionPaid += n(s.commissionAmount);
      sellers.set(s.seller.id, row);
    }
    const bySeller = [...sellers.values()]
      .map((x) => ({ ...x, revenue: r2(x.revenue), profit: r2(x.profit), commission: r2(x.commission), commissionPaid: r2(x.commissionPaid), commissionPending: r2(x.commission - x.commissionPaid) }))
      .sort((a, b) => b.revenue - a.revenue);
    const commissionTotal = bySeller.reduce((t, x) => t + x.commission, 0);
    const commissionPaid = bySeller.reduce((t, x) => t + x.commissionPaid, 0);

    // ---- Caixa (Financeiro): só o que foi pago/recebido de verdade ----
    const paid = transactions.filter((t) => t.paid);
    const open = transactions.filter((t) => !t.paid);
    const sum = (list: typeof transactions) => list.reduce((t, x) => t + n(x.amount), 0);
    const cashIn = sum(paid.filter((t) => t.type === 'revenue'));
    const cashOut = sum(paid.filter((t) => t.type === 'expense'));
    const expensesByCategory: Record<string, number> = {};
    const revenueByCategory: Record<string, number> = {};
    for (const t of paid) {
      const bucket = t.type === 'expense' ? expensesByCategory : revenueByCategory;
      bucket[t.category] = (bucket[t.category] ?? 0) + n(t.amount);
    }
    const toList = (o: Record<string, number>) =>
      Object.entries(o).map(([category, amount]) => ({ category, amount: r2(amount) })).sort((a, b) => b.amount - a.amount);

    const openExpenses = open.filter((t) => t.type === 'expense');
    const openRevenues = open.filter((t) => t.type === 'revenue');

    // ---- Estoque (posição de hoje) ----
    const stockCost = stock.reduce((t, v) => t + n(v.cost), 0);
    const stockPrice = stock.reduce((t, v) => t + n(v.price), 0);
    const partsCost = parts.reduce((t, p) => t + n(p.cost) * p.stockQty, 0);
    const partsPrice = parts.reduce((t, p) => t + n(p.price) * p.stockQty, 0);

    const entryList = entries.map((v) => ({
      vehicle: vehicleName(v),
      date: (v.acquisition?.entryDate ?? v.createdAt).toISOString(),
      value: r2(v.acquisition && n(v.acquisition.purchaseValue) > 0 ? n(v.acquisition.purchaseValue) : n(v.cost)),
      origin: v.tradeInSaleId ? 'trade_in' : v.acquisition?.ownershipType === 'consigned' ? 'consigned' : 'purchase',
    })).sort((a, b) => a.date.localeCompare(b.date));

    return {
      month,
      generatedAt: new Date().toISOString(),
      sales: {
        count: sales.length,
        revenue: r2(revenue),
        cost: r2(cost),
        profit: r2(profit),
        avgMargin: sales.length ? r2(sales.reduce((t, s) => t + n(s.margin), 0) / sales.length) : 0,
        avgTicket: sales.length ? r2(revenue / sales.length) : 0,
        cardFees: r2(cardFees),
        bankReturn: r2(bankReturn),
        saleExpenses: r2(saleExpenses),
        canceledCount: canceledSales.length,
        refunds: r2(canceledSales.reduce((t, s) => t + n(s.refundAmount), 0)),
        byMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, amount: r2(amount) })).sort((a, b) => b.amount - a.amount),
        list: sales.map((s) => ({
          id: s.id,
          contractNumber: s.contractNumber,
          soldAt: s.soldAt.toISOString(),
          vehicle: vehicleName(s.vehicle),
          customer: s.customer.name,
          seller: s.seller.name,
          price: r2(n(s.price)),
          cost: r2(n(s.cost)),
          profit: r2(n(s.profit)),
          commission: r2(n(s.commissionAmount)),
        })),
      },
      commissions: {
        total: r2(commissionTotal),
        paid: r2(commissionPaid),
        pending: r2(commissionTotal - commissionPaid),
        bySeller,
      },
      cash: {
        in: r2(cashIn),
        out: r2(cashOut),
        balance: r2(cashIn - cashOut),
        revenueByCategory: toList(revenueByCategory),
        expensesByCategory: toList(expensesByCategory),
      },
      open: {
        payable: r2(sum(openExpenses)),
        payableCount: openExpenses.length,
        payableOverdue: r2(sum(openExpenses.filter((t) => t.date < today))),
        receivable: r2(sum(openRevenues)),
        receivableCount: openRevenues.length,
        financingWaiting: r2(financingOpen.reduce((t, p) => t + n(p.amount), 0)),
        financingWaitingCount: financingOpen.length,
      },
      promissory: {
        receivedInMonth: r2(notesPaidInMonth.reduce((t, x) => t + n(x.amount), 0)),
        receivedInMonthCount: notesPaidInMonth.length,
        dueInMonth: r2(notesDueInMonth.reduce((t, x) => t + n(x.amount), 0)),
        dueInMonthUnpaid: r2(notesDueInMonth.filter((x) => !x.paid).reduce((t, x) => t + n(x.amount), 0)),
        overdue: r2(notesOverdue.reduce((t, x) => t + n(x.amount), 0)),
        overdueCount: notesOverdue.length,
        future: r2(notesFuture.reduce((t, x) => t + n(x.amount), 0)),
        futureCount: notesFuture.length,
      },
      stock: {
        count: stock.length,
        available: stock.filter((v) => v.status === 'available').length,
        reserved: stock.filter((v) => v.status === 'reserved').length,
        cost: r2(stockCost),
        price: r2(stockPrice),
        partsCost: r2(partsCost),
        partsPrice: r2(partsPrice),
        entriesCount: entryList.length,
        entriesValue: r2(entryList.reduce((t, e) => t + e.value, 0)),
        entries: entryList,
      },
    };
  }
}
