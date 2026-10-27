import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CancelReservationDto, CreateReservationDto, QueryReservationDto, UpdateReservationDto } from './reservations.dto';

const METHOD_NAMES: Record<string, string> = {
  pix: 'PIX', cash: 'Dinheiro', transfer: 'Transferência', card_credit: 'Cartão de crédito', card_debit: 'Cartão de débito',
};
const INCLUDE = {
  vehicle: { select: { id: true, brand: true, model: true, year: true, plate: true, price: true, status: true } },
  customer: { select: { id: true, name: true, phone: true } },
} as const;
const round2 = (n: number) => Math.round(n * 100) / 100;

// "AAAA-MM-DD" guardado no fim do dia (horário de Brasília)
function endOfDay(value: string) {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23 + 3, 59)); // 23:59 em UTC-3
}

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(dealershipId: string, q: QueryReservationDto) {
    const items = await this.prisma.vehicleReservation.findMany({
      where: { dealershipId, ...(q.status ? { status: q.status } : {}), ...(q.vehicleId ? { vehicleId: q.vehicleId } : {}) },
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const now = Date.now();
    return items.map((r) => ({ ...r, expired: r.status === 'active' && !!r.expiresAt && r.expiresAt.getTime() < now }));
  }

  async create(dealershipId: string, userId: string, dto: CreateReservationDto, actor?: AuthenticatedUser) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: dto.vehicleId, dealershipId } });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado');
    if (vehicle.status === 'sold') throw new BadRequestException('Este veículo já foi vendido.');
    const active = await this.prisma.vehicleReservation.findFirst({ where: { dealershipId, vehicleId: vehicle.id, status: 'active' }, include: { customer: { select: { name: true } } } });
    if (active) throw new BadRequestException(`Este veículo já está reservado para ${active.customer.name}.`);

    const customer = await this.prisma.customer.findFirst({
      where: {
        id: dto.customerId, dealershipId,
        ...(actor?.role === 'seller'
          ? { OR: [{ createdById: userId }, { leads: { some: { assignedSellerId: userId } } }, { sales: { some: { sellerId: userId } } }] }
          : {}),
      },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    const deposit = round2(Number(dto.deposit ?? 0));
    if (deposit > Number(vehicle.price)) throw new BadRequestException('O sinal não pode ser maior que o preço do veículo.');
    const method = dto.depositMethod ?? 'pix';
    const now = new Date();

    const reservation = await this.prisma.$transaction(async (tx) => {
      let financialTransactionId: string | null = null;
      if (deposit > 0) {
        const t = await tx.financialTransaction.create({
          data: {
            dealershipId, vehicleId: vehicle.id, type: 'revenue', category: 'Sinal de reserva', amount: deposit,
            date: now, paid: true, paidAt: now,
            description: `Sinal (${METHOD_NAMES[method]}) — ${vehicle.brand} ${vehicle.model} ${vehicle.year} — ${customer.name}`,
          },
        });
        financialTransactionId = t.id;
      }
      const r = await tx.vehicleReservation.create({
        data: {
          dealershipId, vehicleId: vehicle.id, customerId: customer.id, sellerId: userId,
          deposit, depositMethod: deposit > 0 ? method : null,
          expiresAt: dto.expiresAt ? endOfDay(dto.expiresAt) : null,
          notes: dto.notes?.trim() || null, financialTransactionId,
        },
        include: INCLUDE,
      });
      await tx.vehicle.update({ where: { id: vehicle.id }, data: { status: 'reserved' } });
      return r;
    });
    return reservation;
  }

  async update(dealershipId: string, id: string, dto: UpdateReservationDto) {
    const r = await this.prisma.vehicleReservation.findFirst({ where: { id, dealershipId, status: 'active' } });
    if (!r) throw new NotFoundException('Reserva não encontrada');
    return this.prisma.vehicleReservation.update({
      where: { id },
      data: {
        ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt ? endOfDay(dto.expiresAt) : null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
      include: INCLUDE,
    });
  }

  async cancel(dealershipId: string, id: string, dto: CancelReservationDto) {
    const r = await this.prisma.vehicleReservation.findFirst({ where: { id, dealershipId }, include: INCLUDE });
    if (!r) throw new NotFoundException('Reserva não encontrada');
    if (r.status !== 'active') throw new BadRequestException('Esta reserva não está mais ativa.');
    const deposit = Number(r.deposit);
    const now = new Date();
    const label = `${r.vehicle.brand} ${r.vehicle.model} ${r.vehicle.year} — ${r.customer.name}`;

    await this.prisma.$transaction(async (tx) => {
      if (deposit > 0) {
        if (dto.refund) {
          await tx.financialTransaction.create({
            data: {
              dealershipId, vehicleId: r.vehicleId, type: 'expense', category: 'Devolução de sinal', amount: deposit,
              date: now, paid: true, paidAt: now, description: `Sinal devolvido — ${label}`,
            },
          });
        } else if (r.financialTransactionId) {
          await tx.financialTransaction.updateMany({
            where: { id: r.financialTransactionId, dealershipId },
            data: { category: 'Sinal retido', description: `Sinal retido (reserva cancelada) — ${label}` },
          });
        }
      }
      const reason = dto.reason?.trim();
      await tx.vehicleReservation.update({
        where: { id },
        data: {
          status: 'canceled', closedAt: now,
          notes: reason ? [r.notes, `Cancelada: ${reason}${deposit > 0 ? dto.refund ? ' (sinal devolvido)' : ' (sinal retido)' : ''}`].filter(Boolean).join('\n') : r.notes,
        },
      });
      if (r.vehicle.status === 'reserved') await tx.vehicle.update({ where: { id: r.vehicleId }, data: { status: 'available' } });
    });
    return { success: true };
  }
}
