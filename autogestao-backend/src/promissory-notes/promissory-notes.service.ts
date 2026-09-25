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
      select: { paid: true, dueDate: true, amount: true },
    });

    // Parcela que vence HOJE ainda não conta como vencida
    const today = startOfTodayBrazil();
    const overdue = allNotes.filter((n) => !n.paid && new Date(n.dueDate) < today);
    const pending = allNotes.filter((n) => !n.paid && new Date(n.dueDate) >= today);
    const paid = allNotes.filter((n) => n.paid);

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
      },
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