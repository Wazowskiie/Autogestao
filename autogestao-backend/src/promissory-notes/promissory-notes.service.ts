import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromissoryNoteDto } from './dto/create-promissory-note.dto';
import { QueryPromissoryNoteDto } from './dto/query-promissory-note.dto';

const NOTE_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  sale: { include: { vehicle: true } },
} as const;

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

    const installmentAmount = dto.totalAmount / dto.totalInstallments;
    const firstDue = new Date(dto.firstDueDate);

    // Gera todas as parcelas de uma vez
    const notes = await this.prisma.$transaction(
      Array.from({ length: dto.totalInstallments }, (_, i) => {
        const dueDate = new Date(firstDue);
        dueDate.setMonth(dueDate.getMonth() + i);

        return this.prisma.promissoryNote.create({
          data: {
            dealershipId,
            saleId: dto.saleId,
            customerId: dto.customerId,
            installmentNumber: i + 1,
            totalInstallments: dto.totalInstallments,
            amount: installmentAmount,
            dueDate,
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
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
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

    const today = new Date();
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
