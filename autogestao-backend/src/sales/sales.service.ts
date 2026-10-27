import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { QuerySaleDto } from './dto/query-sale.dto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { Prisma } from '../generated/prisma/client';
import { scanWishesForVehicle } from '../crm/crm-helpers';
import { CancelSaleDto, ChecklistKey, SaleExpenseDto, UpdateChecklistDto, UpdateCommissionDto, UpdateFinancingDto, UpdateSaleExpenseDto, UpdateWarrantyDto } from './dto/sale-extras.dto';

const SALE_INCLUDE = {
  vehicle: true,
  customer: true,
  seller: { select: { id: true, name: true } },
  // Veículos que entraram como parte do pagamento
  tradeIns: { select: { id: true, brand: true, model: true, year: true, plate: true, cost: true, status: true } },
  // Formas de pagamento (PIX, dinheiro, cartão...)
  payments: { orderBy: { createdAt: 'asc' } },
  expenses: { orderBy: { date: 'asc' } },
} as const;

// Nome de cada forma de pagamento (aparece no Financeiro)
const PAYMENT_NAMES: Record<string, string> = {
  pix: 'PIX', cash: 'Dinheiro', transfer: 'Transferência', card_credit: 'Cartão de crédito',
  card_debit: 'Cartão de débito', financing: 'Financiamento', consortium: 'Consórcio', promissory: 'Promissórias',
  deposit: 'Sinal (reserva)',
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Formas em que o dinheiro ainda vai entrar depois (ficam "pendentes" no Financeiro)
const RECEIVED_LATER = ['financing', 'consortium', 'promissory'];

const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 24 * 60 * 60 * 1000;
// Prazo legal para o comprador transferir o veículo (CTB art. 123)
const TRANSFER_DEADLINE_DAYS = 30;
const CHECKLIST_LABELS: Record<ChecklistKey, string> = {
  atpv: 'ATPV-e assinado', communication: 'Comunicação de venda', transfer: 'Transferência concluída',
  keys: 'Chave reserva entregue', manual: 'Manual entregue', documents: 'Documentos entregues',
};
type Checklist = Partial<Record<ChecklistKey, { done: boolean; at: string | null }>>;

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
      status: sale.status,
      warrantyDays: sale.warrantyDays,
      warrantyCoverage: sale.warrantyCoverage,
      checklist: (sale.deliveryChecklist ?? {}) as Record<string, { done: boolean; at: string | null }>,
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
        method: p.method, amount: Number(p.amount), installments: p.installments, notes: p.notes, bank: p.bank,
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
    const seller=await this.prisma.user.findFirst({where:{id:dto.sellerId??userId,dealershipId,active:true},select:{id:true,name:true,commissionRate:true}});
    if(!seller) throw new NotFoundException('Vendedor não encontrado');
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, dealershipId },
    });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado');
    if (vehicle.status === 'sold') throw new BadRequestException('Este veículo já foi vendido');

    const reservation = await this.prisma.vehicleReservation.findFirst({
      where: { dealershipId, vehicleId: dto.vehicleId, status: 'active' },
      include: { customer: { select: { id: true, name: true } } },
    });
    if (reservation && reservation.customerId !== dto.customerId) {
      throw new BadRequestException(`Este veículo está reservado para ${reservation.customer.name}. Cancele a reserva antes de vender para outro cliente.`);
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, dealershipId, ...(actor?.role==='seller'?{OR:[{createdById:userId},{leads:{some:{assignedSellerId:userId}}},{sales:{some:{sellerId:userId}}},{reservations:{some:{vehicleId:dto.vehicleId,status:'active'}}}]}:{}) },
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
      const isFinancing = p.method === 'financing' || p.method === 'consortium';
      const financingStatus = isFinancing ? p.financingStatus ?? 'analysis' : null;
      return {
        method: p.method,
        amount,
        installments: p.method === 'card_credit' ? p.installments ?? 1 : null,
        feePercent,
        feeAmount: feePercent ? round2((amount * feePercent) / 100) : 0,
        notes: p.notes?.trim() || null,
        bank: isFinancing ? p.bank?.trim() || null : null,
        financingStatus,
        returnAmount: isFinancing && p.returnAmount ? round2(Number(p.returnAmount)) : 0,
      };
    });
    // Sinal da reserva: precisa entrar como forma de pagamento (já está no caixa)
    const depositLines = payments.filter((p) => p.method === 'deposit');
    if (depositLines.length > 1) throw new BadRequestException('Use só uma linha de sinal por venda.');
    const reservedDeposit = reservation ? round2(Number(reservation.deposit)) : 0;
    if (depositLines.length && reservedDeposit <= 0) {
      throw new BadRequestException('Não há sinal de reserva para este veículo. Use outra forma de pagamento.');
    }
    if (reservedDeposit > 0) {
      if (!depositLines.length) throw new BadRequestException(`Inclua o sinal de ${brl(reservedDeposit)} pago na reserva nas formas de pagamento.`);
      if (Math.abs(depositLines[0].amount - reservedDeposit) >= 0.01) {
        throw new BadRequestException(`O sinal pago na reserva foi de ${brl(reservedDeposit)}. Use esse valor na linha do sinal.`);
      }
    }
    if (payments.filter((p) => p.method === 'promissory').length > 1) {
      throw new BadRequestException('Use só uma linha de promissórias por venda.');
    }

    // Entrada mínima da loja (vale para vendas com promissória)
    const promissory = payments.find((p) => p.method === 'promissory');
    if (promissory && dto.price > 0) {
      const shop = await this.prisma.dealership.findUnique({ where: { id: dealershipId }, select: { minDownPaymentPercent: true } });
      const minPct = shop?.minDownPaymentPercent != null ? Number(shop.minDownPaymentPercent) : 0;
      const entry = round2(dto.price - promissory.amount);
      const required = round2((dto.price * minPct) / 100);
      if (minPct > 0 && entry + 0.009 < required) {
        const manager = !actor || actor.role === 'owner' || actor.role === 'admin';
        if (!manager) {
          throw new ForbiddenException(
            `A entrada (${brl(entry)}) está abaixo do mínimo de ${minPct}% (${brl(required)}). Faltam ${brl(round2(required - entry))}. Só o dono ou o administrador pode liberar esta venda.`,
          );
        }
        if (!dto.allowBelowMinDownPayment) {
          throw new BadRequestException(`A entrada está abaixo do mínimo de ${minPct}% (${brl(required)}). Confirme a liberação para continuar.`);
        }
      }
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

    // Despesas da venda e comissão do vendedor também saem do lucro; o retorno do banco entra
    const expenses = (dto.expenses ?? []).map((e) => ({
      description: e.description.trim(), amount: round2(Number(e.amount)),
      date: e.date ? parseDateOnly(e.date) : null, paid: e.paid ?? true,
    }));
    const expensesTotal = round2(expenses.reduce((t, e) => t + e.amount, 0));
    const commissionRate = seller.commissionRate ?? 0;
    const commissionAmount = dto.commissionAmount != null
      ? round2(Number(dto.commissionAmount))
      : round2((dto.price * commissionRate) / 100);
    const returnsTotal = round2(payments.reduce((t, p) => t + p.returnAmount, 0));

    const profit = round2(dto.price - dto.cost - feesTotal - expensesTotal - commissionAmount + returnsTotal);
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
          commissionRate: dto.commissionAmount != null ? null : commissionRate,
          commissionAmount,
          warrantyDays: dto.warrantyDays ?? null,
          warrantyCoverage: dto.warrantyCoverage?.trim() || null,
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
          const name = PAYMENT_NAMES[p.method] ?? p.method;
          let financialTransactionId: string | null = null;
          let returnTransactionId: string | null = null;

          if (p.method === 'deposit' && reservation) {
            // O sinal já entrou no caixa na reserva: só passa a fazer parte da venda
            if (reservation.financialTransactionId) {
              await tx.financialTransaction.updateMany({
                where: { id: reservation.financialTransactionId, dealershipId },
                data: { saleId: created.id, category: 'Venda de veículo - Sinal', description: `${saleLabel} (sinal pago na reserva)` },
              });
              financialTransactionId = reservation.financialTransactionId;
            }
          } else {
            const financingPaid = p.financingStatus === 'paid';
            const later = RECEIVED_LATER.includes(p.method) && !financingPaid;
            const t = await tx.financialTransaction.create({
              data: {
                dealershipId, saleId: created.id, vehicleId: dto.vehicleId,
                type: 'revenue', category: `Venda de veículo - ${name}`,
                amount: p.amount, date: soldAt, paid: !later, paidAt: later ? null : soldAt,
                description: `${saleLabel} (${name}${p.bank ? ` - ${p.bank}` : ''}${p.installments && p.installments > 1 ? ` em ${p.installments}x` : ''})`,
              },
            });
            financialTransactionId = t.id;
            if (p.returnAmount > 0) {
              const r = await tx.financialTransaction.create({
                data: {
                  dealershipId, saleId: created.id, vehicleId: dto.vehicleId,
                  type: 'revenue', category: 'Retorno de financiamento', amount: p.returnAmount, date: soldAt,
                  paid: financingPaid, paidAt: financingPaid ? soldAt : null,
                  description: `Retorno ${p.bank ?? 'do banco'} — venda ${contractNumber}`,
                },
              });
              returnTransactionId = r.id;
            }
          }

          await tx.salePayment.create({
            data: {
              dealershipId, saleId: created.id, ...p,
              receivedAt: p.financingStatus === 'paid' ? soldAt : null,
              financialTransactionId, returnTransactionId,
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

      // Despesas da venda
      for (const e of expenses) {
        const date = e.date ?? soldAt;
        const t = await tx.financialTransaction.create({
          data: {
            dealershipId, saleId: created.id, vehicleId: dto.vehicleId,
            type: 'expense', category: 'Despesa de venda', amount: e.amount, date,
            paid: e.paid, paidAt: e.paid ? date : null, description: `${e.description} — venda ${contractNumber}`,
          },
        });
        await tx.saleExpense.create({
          data: { dealershipId, saleId: created.id, description: e.description, amount: e.amount, date, paid: e.paid, financialTransactionId: t.id },
        });
      }

      // Comissão do vendedor: fica a pagar no Financeiro
      if (commissionAmount > 0) {
        const t = await tx.financialTransaction.create({
          data: {
            dealershipId, saleId: created.id, vehicleId: dto.vehicleId,
            type: 'expense', category: 'Comissão de vendedor', amount: commissionAmount, date: soldAt, paid: false,
            description: `Comissão de ${seller.name} — venda ${contractNumber}`,
          },
        });
        await tx.sale.update({ where: { id: created.id }, data: { commissionTransactionId: t.id } });
      }

      // CRM: o lead deste cliente vai para "Ganhos" ligado à venda
      const lead = dto.leadId
        ? await tx.lead.findFirst({ where: { id: dto.leadId, dealershipId } })
        : await tx.lead.findFirst({
            where: { dealershipId, customerId: dto.customerId, archivedAt: null, saleId: null, stage: { in: ['new', 'contacted', 'negotiating'] }, OR: [{ vehicleId: dto.vehicleId }, { vehicleId: null }] },
            orderBy: { updatedAt: 'desc' },
          });
      if (dto.leadId && (!lead || lead.customerId !== dto.customerId)) throw new BadRequestException('Este lead não é do cliente da venda.');
      if (lead && !lead.saleId) {
        await tx.lead.update({
          where: { id: lead.id },
          data: { saleId: created.id, vehicleId: dto.vehicleId, stage: 'won', closedAt: new Date(), lostReason: null, nextActionDate: null, nextActionNote: null },
        });
        await tx.crmTask.updateMany({ where: { leadId: lead.id, status: 'open' }, data: { status: 'canceled' } });
        await tx.crmActivity.create({
          data: { dealershipId, leadId: lead.id, userId, kind: 'sale', content: `Venda ${contractNumber} registrada: lead marcado como ganho`, metadata: { saleId: created.id } },
        });
      }

      // A reserva vira venda
      if (reservation) {
        await tx.vehicleReservation.update({
          where: { id: reservation.id },
          data: { status: 'converted', saleId: created.id, closedAt: new Date() },
        });
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

    // Veículos da troca entraram no estoque: podem ser o que algum cliente procura
    const trades = await this.prisma.vehicle.findMany({ where: { tradeInSaleId: sale.id }, select: { id: true } });
    for (const t of trades) await scanWishesForVehicle(this.prisma, t.id).catch(() => 0);

    return this.prisma.sale.findUnique({ where: { id: sale.id }, include: SALE_INCLUDE });
  }

  // =====================================================================
  // Depois da venda: despesas, financiamento, comissão, pós-venda, garantia e cancelamento
  // =====================================================================

  private async saleFor(dealershipId: string, id: string, actor?: AuthenticatedUser) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, dealershipId, ...(actor?.role === 'seller' ? { sellerId: actor.userId } : {}) },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (sale.status === 'canceled') throw new BadRequestException('Esta venda está cancelada.');
    return sale;
  }

  /** Lucro real = preço − custo − taxas de cartão − despesas da venda − comissão + retorno do banco */
  private async recomputeProfit(tx: Prisma.TransactionClient, saleId: string) {
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { payments: true, expenses: true } });
    const fees = sale.payments.reduce((t, p) => t + Number(p.feeAmount), 0);
    const returns = sale.payments.reduce((t, p) => t + Number(p.returnAmount), 0);
    const expenses = sale.expenses.reduce((t, e) => t + Number(e.amount), 0);
    const cost = Number(sale.cost);
    const profit = round2(Number(sale.price) - cost - fees - expenses - Number(sale.commissionAmount) + returns);
    await tx.sale.update({ where: { id: saleId }, data: { profit, margin: cost > 0 ? (profit / cost) * 100 : 0 } });
  }

  private label(sale: { contractNumber: string | null }) {
    return sale.contractNumber ? `venda ${sale.contractNumber}` : 'venda';
  }

  async addExpense(dealershipId: string, saleId: string, dto: SaleExpenseDto) {
    const sale = await this.saleFor(dealershipId, saleId);
    const amount = round2(Number(dto.amount));
    const date = dto.date ? parseDateOnly(dto.date) : new Date();
    const paid = dto.paid ?? true;
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.financialTransaction.create({
        data: {
          dealershipId, saleId, vehicleId: sale.vehicleId, type: 'expense', category: 'Despesa de venda',
          amount, date, paid, paidAt: paid ? date : null, description: `${dto.description.trim()} — ${this.label(sale)}`,
        },
      });
      await tx.saleExpense.create({ data: { dealershipId, saleId, description: dto.description.trim(), amount, date, paid, financialTransactionId: t.id } });
      await this.recomputeProfit(tx, saleId);
    });
    return this.findOne(dealershipId, saleId);
  }

  async updateExpense(dealershipId: string, saleId: string, expenseId: string, dto: UpdateSaleExpenseDto) {
    await this.saleFor(dealershipId, saleId);
    const e = await this.prisma.saleExpense.findFirst({ where: { id: expenseId, saleId, dealershipId } });
    if (!e) throw new NotFoundException('Despesa não encontrada');
    if (dto.paid !== undefined) {
      await this.prisma.$transaction([
        this.prisma.saleExpense.update({ where: { id: e.id }, data: { paid: dto.paid } }),
        ...(e.financialTransactionId
          ? [this.prisma.financialTransaction.updateMany({ where: { id: e.financialTransactionId, dealershipId }, data: { paid: dto.paid, paidAt: dto.paid ? new Date() : null } })]
          : []),
      ]);
    }
    return this.findOne(dealershipId, saleId);
  }

  async removeExpense(dealershipId: string, saleId: string, expenseId: string) {
    await this.saleFor(dealershipId, saleId);
    const e = await this.prisma.saleExpense.findFirst({ where: { id: expenseId, saleId, dealershipId } });
    if (!e) throw new NotFoundException('Despesa não encontrada');
    await this.prisma.$transaction(async (tx) => {
      if (e.financialTransactionId) await tx.financialTransaction.deleteMany({ where: { id: e.financialTransactionId, dealershipId } });
      await tx.saleExpense.delete({ where: { id: e.id } });
      await this.recomputeProfit(tx, saleId);
    });
    return this.findOne(dealershipId, saleId);
  }

  /** Banco, situação da ficha, depósito e retorno do financiamento */
  async updateFinancing(dealershipId: string, saleId: string, paymentId: string, dto: UpdateFinancingDto) {
    const sale = await this.saleFor(dealershipId, saleId);
    const p = await this.prisma.salePayment.findFirst({ where: { id: paymentId, saleId, dealershipId } });
    if (!p) throw new NotFoundException('Forma de pagamento não encontrada');
    if (p.method !== 'financing' && p.method !== 'consortium') throw new BadRequestException('Esta forma de pagamento não é financiamento.');

    const status = dto.status ?? (p.financingStatus as string | null) ?? 'analysis';
    const bank = dto.bank !== undefined ? dto.bank.trim() || null : p.bank;
    const returnAmount = dto.returnAmount !== undefined ? round2(Number(dto.returnAmount)) : Number(p.returnAmount);
    const paid = status === 'paid';
    const receivedAt = paid ? (dto.receivedAt ? parseDateOnly(dto.receivedAt) : p.receivedAt ?? new Date()) : null;
    const name = PAYMENT_NAMES[p.method];

    await this.prisma.$transaction(async (tx) => {
      // Receita do financiamento: fica paga quando o banco deposita
      let revenueId = p.financialTransactionId;
      if (!revenueId) {
        const found = await tx.financialTransaction.findFirst({
          where: { dealershipId, saleId, type: 'revenue', category: `Venda de veículo - ${name}`, amount: p.amount },
        });
        revenueId = found?.id ?? null;
      }
      if (revenueId) {
        await tx.financialTransaction.updateMany({ where: { id: revenueId, dealershipId }, data: { paid, paidAt: receivedAt } });
      }

      // Retorno (comissão do banco para a loja)
      let returnId = p.returnTransactionId;
      if (returnAmount > 0) {
        const data = { amount: returnAmount, paid, paidAt: receivedAt, description: `Retorno ${bank ?? 'do banco'} — ${this.label(sale)}` };
        if (returnId) await tx.financialTransaction.updateMany({ where: { id: returnId, dealershipId }, data });
        else {
          const r = await tx.financialTransaction.create({
            data: { dealershipId, saleId, vehicleId: sale.vehicleId, type: 'revenue', category: 'Retorno de financiamento', date: sale.soldAt, ...data },
          });
          returnId = r.id;
        }
      } else if (returnId) {
        await tx.financialTransaction.deleteMany({ where: { id: returnId, dealershipId } });
        returnId = null;
      }

      await tx.salePayment.update({
        where: { id: p.id },
        data: { bank, financingStatus: status, receivedAt, returnAmount, financialTransactionId: revenueId, returnTransactionId: returnId },
      });
      await this.recomputeProfit(tx, saleId);
    });
    return this.findOne(dealershipId, saleId);
  }

  /** Comissão do vendedor nesta venda: valor e se já foi paga */
  async updateCommission(dealershipId: string, saleId: string, dto: UpdateCommissionDto) {
    const sale = await this.saleFor(dealershipId, saleId);
    const seller = await this.prisma.user.findUnique({ where: { id: sale.sellerId }, select: { name: true } });
    const amount = dto.amount !== undefined ? round2(Number(dto.amount)) : Number(sale.commissionAmount);
    const paid = dto.paid !== undefined ? dto.paid : !!sale.commissionPaidAt;
    const paidAt = paid ? sale.commissionPaidAt ?? new Date() : null;

    await this.prisma.$transaction(async (tx) => {
      let tId = sale.commissionTransactionId;
      if (amount > 0) {
        const data = { amount, paid, paidAt, description: `Comissão de ${seller?.name ?? 'vendedor'} — ${this.label(sale)}` };
        if (tId) await tx.financialTransaction.updateMany({ where: { id: tId, dealershipId }, data });
        else {
          const t = await tx.financialTransaction.create({
            data: { dealershipId, saleId, vehicleId: sale.vehicleId, type: 'expense', category: 'Comissão de vendedor', date: sale.soldAt, ...data },
          });
          tId = t.id;
        }
      } else if (tId) {
        await tx.financialTransaction.deleteMany({ where: { id: tId, dealershipId } });
        tId = null;
      }
      await tx.sale.update({
        where: { id: saleId },
        data: {
          commissionAmount: amount, commissionPaidAt: amount > 0 ? paidAt : null, commissionTransactionId: tId,
          ...(dto.amount !== undefined ? { commissionRate: null } : {}),
        },
      });
      await this.recomputeProfit(tx, saleId);
    });
    return this.findOne(dealershipId, saleId);
  }

  /** Marca/desmarca um item do pós-venda (ATPV-e, transferência, chave reserva...) */
  async updateChecklist(dealershipId: string, saleId: string, dto: UpdateChecklistDto, actor?: AuthenticatedUser) {
    const sale = await this.saleFor(dealershipId, saleId, actor);
    const checklist: Checklist = { ...((sale.deliveryChecklist as Checklist | null) ?? {}) };
    checklist[dto.key] = { done: dto.done, at: dto.done ? new Date().toISOString() : null };
    await this.prisma.sale.update({ where: { id: saleId }, data: { deliveryChecklist: checklist } });
    return this.findOne(dealershipId, saleId, actor);
  }

  async updateWarranty(dealershipId: string, saleId: string, dto: UpdateWarrantyDto) {
    await this.saleFor(dealershipId, saleId);
    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        ...(dto.days !== undefined ? { warrantyDays: dto.days || null } : {}),
        ...(dto.coverage !== undefined ? { warrantyCoverage: dto.coverage.trim() || null } : {}),
      },
    });
    return this.findOne(dealershipId, saleId);
  }

  /** Financiamentos que ainda não foram pagos pelo banco */
  async financingPending(dealershipId: string, actor?: AuthenticatedUser) {
    const items = await this.prisma.salePayment.findMany({
      where: {
        dealershipId, method: { in: ['financing', 'consortium'] },
        OR: [{ financingStatus: null }, { financingStatus: { in: ['analysis', 'approved', 'rejected'] } }],
        sale: { status: 'active', ...(actor?.role === 'seller' ? { sellerId: actor.userId } : {}) },
      },
      orderBy: { createdAt: 'asc' },
      include: { sale: { select: { id: true, contractNumber: true, soldAt: true, customer: { select: { name: true, phone: true } }, vehicle: { select: { brand: true, model: true, year: true } }, seller: { select: { name: true } } } } },
    });
    const now = Date.now();
    const list = items.map((p) => ({
      paymentId: p.id, saleId: p.sale.id, contractNumber: p.sale.contractNumber, soldAt: p.sale.soldAt,
      customer: p.sale.customer.name, phone: p.sale.customer.phone, seller: p.sale.seller.name,
      vehicle: `${p.sale.vehicle.brand} ${p.sale.vehicle.model} ${p.sale.vehicle.year}`,
      method: p.method, bank: p.bank, status: (p.financingStatus ?? 'analysis') as string,
      amount: Number(p.amount), returnAmount: Number(p.returnAmount),
      days: Math.floor((now - p.sale.soldAt.getTime()) / DAY),
    }));
    return {
      items: list,
      analysis: list.filter((i) => i.status === 'analysis').length,
      approved: list.filter((i) => i.status === 'approved').length,
      rejected: list.filter((i) => i.status === 'rejected').length,
      waitingAmount: Math.round(list.filter((i) => i.status !== 'rejected').reduce((t, i) => t + i.amount, 0) * 100) / 100,
    };
  }

  /** Vendas com transferência ainda não concluída (prazo de 30 dias) */
  async afterSales(dealershipId: string, actor?: AuthenticatedUser) {
    const since = new Date(Date.now() - 180 * DAY);
    const sales = await this.prisma.sale.findMany({
      where: { dealershipId, status: 'active', soldAt: { gte: since }, ...(actor?.role === 'seller' ? { sellerId: actor.userId } : {}) },
      orderBy: { soldAt: 'asc' },
      include: {
        customer: { select: { name: true, phone: true } },
        vehicle: { select: { brand: true, model: true, year: true, plate: true } },
      },
    });
    const now = Date.now();
    const items = sales
      .map((s) => {
        const checklist = (s.deliveryChecklist as Checklist | null) ?? {};
        const deadline = new Date(s.soldAt.getTime() + TRANSFER_DEADLINE_DAYS * DAY);
        return {
          id: s.id, contractNumber: s.contractNumber, soldAt: s.soldAt,
          customer: s.customer.name, phone: s.customer.phone,
          vehicle: `${s.vehicle.brand} ${s.vehicle.model} ${s.vehicle.year}`, plate: s.vehicle.plate,
          deadline, daysLeft: Math.ceil((deadline.getTime() - now) / DAY),
          pendingItems: (Object.keys(CHECKLIST_LABELS) as ChecklistKey[]).filter((k) => !checklist[k]?.done).map((k) => CHECKLIST_LABELS[k]),
          transferDone: !!checklist.transfer?.done,
        };
      })
      .filter((s) => !s.transferDone)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    return { items, overdue: items.filter((s) => s.daysLeft < 0).length, dueSoon: items.filter((s) => s.daysLeft >= 0 && s.daysLeft <= 7).length };
  }

  /**
   * Cancelamento (distrato): a venda fica no histórico como cancelada.
   * O veículo volta ao estoque, o que ainda não foi recebido sai do Financeiro,
   * os veículos da troca que ainda não foram vendidos voltam para o cliente
   * e o valor devolvido ao cliente vira uma despesa.
   */
  async cancel(dealershipId: string, id: string, dto: CancelSaleDto) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, dealershipId },
      include: { tradeIns: { select: { id: true, status: true, brand: true, model: true, year: true, cost: true } }, vehicle: { select: { status: true } } },
    });
    if (!sale) throw new NotFoundException('Venda não encontrada');
    if (sale.status === 'canceled') throw new BadRequestException('Esta venda já foi cancelada.');

    const refund = round2(Number(dto.refundAmount ?? 0));
    const returned = sale.tradeIns.filter((t) => t.status !== 'sold');
    const kept = sale.tradeIns.filter((t) => t.status === 'sold');
    const returnedValue = round2(returned.reduce((t, v) => t + Number(v.cost), 0));
    const canceledAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      // O que ainda não entrou/saiu do caixa deixa de existir
      await tx.promissoryNote.deleteMany({ where: { saleId: id, paid: false } });
      await tx.financialTransaction.deleteMany({ where: { saleId: id, paid: false } });
      await tx.saleExpense.deleteMany({ where: { saleId: id, paid: false } });

      // Veículos da troca que ainda estão no estoque voltam para o cliente
      if (returned.length) {
        const ids = returned.map((t) => t.id);
        await tx.financialTransaction.deleteMany({ where: { saleId: id, vehicleId: { in: ids }, category: 'Estoque' } });
        const tradeRevenue = await tx.financialTransaction.findFirst({ where: { saleId: id, category: 'Venda de veículo - Troca' } });
        if (tradeRevenue) {
          const left = round2(Number(tradeRevenue.amount) - returnedValue);
          if (left > 0) await tx.financialTransaction.update({ where: { id: tradeRevenue.id }, data: { amount: left } });
          else await tx.financialTransaction.delete({ where: { id: tradeRevenue.id } });
        }
        await tx.vehicle.deleteMany({ where: { id: { in: ids }, dealershipId } });
      }

      if (refund > 0) {
        await tx.financialTransaction.create({
          data: {
            dealershipId, saleId: id, vehicleId: sale.vehicleId, type: 'expense', category: 'Distrato de venda',
            amount: refund, date: canceledAt, paid: true, paidAt: canceledAt,
            description: `Devolução ao cliente — ${this.label(sale)} cancelada`,
          },
        });
      }

      const commissionPaid = !!sale.commissionPaidAt;
      await tx.sale.update({
        where: { id },
        data: {
          status: 'canceled', canceledAt, cancelReason: dto.reason.trim(), refundAmount: refund,
          ...(commissionPaid ? {} : { commissionAmount: 0, commissionTransactionId: null }),
        },
      });
      if (sale.vehicle.status === 'sold') {
        await tx.vehicle.update({ where: { id: sale.vehicleId }, data: { status: 'available' } });
      }
      // CRM: o lead que tinha virado esta venda passa para "Perdidos"
      const lead = await tx.lead.findFirst({ where: { saleId: id, dealershipId } });
      if (lead) {
        await tx.lead.update({ where: { id: lead.id }, data: { saleId: null, stage: 'lost', lostReason: `Venda cancelada: ${dto.reason.trim()}`.slice(0, 500), closedAt: canceledAt } });
        await tx.crmActivity.create({ data: { dealershipId, leadId: lead.id, kind: 'sale_canceled', content: `Venda ${sale.contractNumber ?? ''} cancelada: ${dto.reason.trim()}` } });
      }
    });

    return {
      sale: await this.findOne(dealershipId, id),
      returnedTradeIns: returned.map((t) => `${t.brand} ${t.model} ${t.year}`),
      keptTradeIns: kept.map((t) => `${t.brand} ${t.model} ${t.year}`),
    };
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
    if (query.status) where.status = query.status;
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

    const canceledCount = await this.prisma.sale.count({ where: { ...where, status: 'canceled' } });
    const sales = await this.prisma.sale.findMany({ where: { ...where, status: 'active' } });
    const totalRevenue = sales.reduce((sum, s) => sum + Number(s.price), 0);
    const totalCost = sales.reduce((sum, s) => sum + Number(s.cost), 0);
    const totalProfit = sales.reduce((sum, s) => sum + Number(s.profit), 0);
    const avgMargin = sales.length > 0
      ? sales.reduce((sum, s) => sum + Number(s.margin), 0) / sales.length
      : 0;

    const totalCommission = sales.reduce((sum, s) => sum + Number(s.commissionAmount), 0);
    return { count: sales.length, totalRevenue, totalCost, totalProfit, avgMargin, totalCommission, canceledCount };
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
