// Funções do CRM usadas também por outros módulos (estoque, vendas e site da loja)
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;
const DAY = 24 * 60 * 60 * 1000;

// ---------------- Configurações ----------------
export interface CrmSettings {
  roundRobin: boolean;            // distribuir leads novos entre os vendedores
  slaHours: number;               // horas para o primeiro contato antes do alerta
  lastAssignedSellerId?: string | null;
  postSale: { birthday: boolean; review: boolean; upgrade: boolean; reviewDays: number; upgradeDays: number };
}
export const DEFAULT_CRM_SETTINGS: CrmSettings = {
  roundRobin: false, slaHours: 2, lastAssignedSellerId: null,
  postSale: { birthday: true, review: true, upgrade: true, reviewDays: 365, upgradeDays: 730 },
};
export function readSettings(raw: unknown): CrmSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<CrmSettings>;
  return {
    ...DEFAULT_CRM_SETTINGS, ...r,
    postSale: { ...DEFAULT_CRM_SETTINGS.postSale, ...(r.postSale ?? {}) },
  };
}
export async function getSettings(db: Db, dealershipId: string) {
  const d = await db.dealership.findUnique({ where: { id: dealershipId }, select: { crmSettings: true } });
  return readSettings(d?.crmSettings);
}

/** Rodízio: próximo vendedor ativo depois do último que recebeu lead. null se o rodízio estiver desligado. */
export async function pickNextSeller(tx: Prisma.TransactionClient, dealershipId: string): Promise<string | null> {
  const settings = await getSettings(tx, dealershipId);
  if (!settings.roundRobin) return null;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'crm-rr:' + dealershipId}))`;
  const sellers = await tx.user.findMany({ where: { dealershipId, role: 'seller', active: true }, select: { id: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  if (!sellers.length) return null;
  const fresh = await getSettings(tx, dealershipId);
  const idx = sellers.findIndex((s) => s.id === fresh.lastAssignedSellerId);
  const next = sellers[(idx + 1) % sellers.length].id;
  await tx.dealership.update({ where: { id: dealershipId }, data: { crmSettings: { ...fresh, lastAssignedSellerId: next } as unknown as Prisma.InputJsonValue } });
  return next;
}

// ---------------- Lista de desejos ----------------
type WishLike = { type: string | null; brand: string | null; model: string | null; yearMin: number | null; yearMax: number | null; priceMax: Prisma.Decimal | number | null; kmMax: number | null };
type VehicleLike = { type: string; brand: string; model: string; version?: string | null; year: number; price: Prisma.Decimal | number; km: number; status: string };
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function wishMatches(w: WishLike, v: VehicleLike) {
  if (v.status !== 'available') return false;
  if (w.type && w.type !== v.type) return false;
  if (w.brand && !norm(v.brand).includes(norm(w.brand))) return false;
  if (w.model && !norm(`${v.model} ${v.version ?? ''}`).includes(norm(w.model))) return false;
  if (w.yearMin && v.year < w.yearMin) return false;
  if (w.yearMax && v.year > w.yearMax) return false;
  if (w.priceMax != null && Number(v.price) > Number(w.priceMax)) return false;
  if (w.kmMax != null && v.km > w.kmMax) return false;
  return true;
}

/**
 * Veículo entrou (ou mudou) no estoque: procura desejos compatíveis.
 * Cada combinação nova vira um aviso e uma tarefa para o vendedor do lead.
 */
export async function scanWishesForVehicle(prisma: PrismaService, vehicleId: string) {
  const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!v || v.status !== 'available') return 0;
  const wishes = await prisma.crmWish.findMany({
    where: { dealershipId: v.dealershipId, status: 'active' },
    include: { lead: { select: { id: true, stage: true, archivedAt: true, assignedSellerId: true, customer: { select: { name: true } } } } },
  });
  let created = 0;
  for (const w of wishes) {
    if (!wishMatches(w, v)) continue;
    const exists = await prisma.crmWishMatch.findUnique({ where: { wishId_vehicleId: { wishId: w.id, vehicleId: v.id } } });
    if (exists) continue;
    await prisma.$transaction(async (tx) => {
      await tx.crmWishMatch.create({ data: { dealershipId: v.dealershipId, wishId: w.id, vehicleId: v.id } });
      const label = `${v.brand} ${v.model} ${v.year}`;
      await tx.crmActivity.create({
        data: { dealershipId: v.dealershipId, leadId: w.leadId, kind: 'wish_match', content: `Chegou no estoque: ${label}, que combina com o que o cliente procura.`, metadata: { vehicleId: v.id, wishId: w.id } },
      });
      if (!w.lead.archivedAt && !['won', 'lost'].includes(w.lead.stage)) {
        await tx.crmTask.create({
          data: {
            dealershipId: v.dealershipId, leadId: w.leadId, assignedUserId: w.lead.assignedSellerId,
            title: `Avisar ${w.lead.customer?.name?.split(' ')[0] ?? 'cliente'}: chegou ${label}`,
            notes: 'Veículo compatível com a lista de desejos do cliente.', dueAt: new Date(), priority: 'high',
          },
        });
      }
    });
    created++;
  }
  return created;
}

/** Desejo novo ou editado: procura no estoque atual (sem criar tarefa, só a lista de compatíveis). */
export async function scanStockForWish(prisma: PrismaService, wishId: string) {
  const w = await prisma.crmWish.findUnique({ where: { id: wishId } });
  if (!w || w.status !== 'active') return 0;
  const stock = await prisma.vehicle.findMany({ where: { dealershipId: w.dealershipId, status: 'available' } });
  let n = 0;
  for (const v of stock) {
    if (!wishMatches(w, v)) continue;
    await prisma.crmWishMatch.upsert({
      where: { wishId_vehicleId: { wishId: w.id, vehicleId: v.id } },
      create: { dealershipId: w.dealershipId, wishId: w.id, vehicleId: v.id }, update: {},
    });
    n++;
  }
  return n;
}

// ---------------- Pós-venda ----------------
const lastRun = new Map<string, number>();
const startOfDayUTC = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));

/** Cria os lembretes de aniversário, revisão e recompra que estão chegando (roda no máximo a cada 10 min por loja). */
export async function generateFollowups(prisma: PrismaService, dealershipId: string, force = false) {
  const now = Date.now();
  if (!force && (lastRun.get(dealershipId) ?? 0) > now - 10 * 60 * 1000) return;
  lastRun.set(dealershipId, now);
  const s = (await getSettings(prisma, dealershipId)).postSale;
  const today = startOfDayUTC(new Date());
  const ahead = new Date(today.getTime() + 7 * DAY);
  const since = new Date(today.getTime() - 30 * DAY);
  const rows: Prisma.CrmFollowupCreateManyInput[] = [];

  if (s.birthday) {
    const customers = await prisma.customer.findMany({
      where: { dealershipId, birthDate: { not: null } },
      select: { id: true, name: true, birthDate: true, createdById: true, sales: { where: { status: 'active' }, orderBy: { soldAt: 'desc' }, take: 1, select: { sellerId: true } } },
    });
    for (const c of customers) {
      const b = c.birthDate!;
      for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
        const due = new Date(Date.UTC(year, b.getUTCMonth(), b.getUTCDate(), 12));
        if (due < new Date(today.getTime() - DAY) || due > ahead) continue;
        rows.push({ dealershipId, customerId: c.id, sellerId: c.sales[0]?.sellerId ?? c.createdById, kind: 'birthday', key: `birthday:${c.id}:${year}`, title: `Aniversário de ${c.name}`, dueDate: due });
      }
    }
  }
  for (const [kind, days, on] of [['review', s.reviewDays, s.review], ['upgrade', s.upgradeDays, s.upgrade]] as const) {
    if (!on || !days) continue;
    const sales = await prisma.sale.findMany({
      where: { dealershipId, status: 'active', soldAt: { gte: new Date(since.getTime() - days * DAY), lte: new Date(ahead.getTime() - days * DAY) } },
      select: { id: true, soldAt: true, sellerId: true, customerId: true, customer: { select: { name: true } }, vehicle: { select: { brand: true, model: true, year: true } } },
    });
    for (const sale of sales) {
      const label = `${sale.vehicle.brand} ${sale.vehicle.model} ${sale.vehicle.year}`;
      const years = Math.round(days / 365);
      rows.push({
        dealershipId, customerId: sale.customerId, sellerId: sale.sellerId, saleId: sale.id, kind, key: `${kind}:${sale.id}`,
        vehicleLabel: label, dueDate: startOfDayUTC(new Date(sale.soldAt.getTime() + days * DAY)),
        title: kind === 'review'
          ? `Revisão de ${years} ano${years > 1 ? 's' : ''}: ${label} (${sale.customer.name})`
          : `${years} anos com a ${label}: oferecer troca a ${sale.customer.name}`,
      });
    }
  }
  if (rows.length) await prisma.crmFollowup.createMany({ data: rows, skipDuplicates: true });
}

// ---------------- Formulário "Tenho interesse" do site ----------------
export interface PublicLeadInput { name: string; phone: string; email?: string; vehicleId?: string; message?: string; kind?: 'interest' | 'financing' | 'visit'; tradeIn?: string }
const KIND_TEXT = { interest: 'Tenho interesse', financing: 'Quero simular o financiamento', visit: 'Quero agendar uma visita' };

export async function createPublicLead(prisma: PrismaService, dealershipId: string, dto: PublicLeadInput) {
  const phone = (dto.phone ?? '').replace(/\D/g, '');
  if (phone.length < 10 || phone.length > 13) throw new BadRequestException('Informe um telefone com DDD.');
  const name = dto.name.trim();
  if (name.length < 2) throw new BadRequestException('Informe seu nome.');
  const vehicle = dto.vehicleId ? await prisma.vehicle.findFirst({ where: { id: dto.vehicleId, dealershipId }, select: { id: true, brand: true, model: true, year: true } }) : null;
  const settings = await getSettings(prisma, dealershipId);
  const kindText = KIND_TEXT[dto.kind ?? 'interest'];

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dealershipId + ':' + phone}))`;
    const found = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM customers WHERE dealership_id = ${dealershipId}
      AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ${phone} LIMIT 1`;
    const customerId = found[0]?.id ?? (await tx.customer.create({
      data: { dealershipId, name, phone, email: dto.email?.trim().toLowerCase() || null, howMet: 'site' },
    })).id;

    // Se o cliente já tem uma oportunidade aberta, junta nela
    let lead = await tx.lead.findFirst({
      where: { dealershipId, customerId, archivedAt: null, stage: { in: ['new', 'contacted', 'negotiating'] }, ...(vehicle ? { OR: [{ vehicleId: vehicle.id }, { vehicleId: null }] } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
    const text = [`${kindText}${vehicle ? `: ${vehicle.brand} ${vehicle.model} ${vehicle.year}` : ''}.`, dto.tradeIn?.trim() ? `Tem para troca: ${dto.tradeIn.trim()}.` : '', dto.message?.trim() ?? ''].filter(Boolean).join(' ');
    if (!lead) {
      const assignedSellerId = await pickNextSeller(tx, dealershipId);
      lead = await tx.lead.create({
        data: {
          dealershipId, customerId, vehicleId: vehicle?.id, assignedSellerId, source: 'site', stage: 'new',
          temperature: dto.kind === 'financing' || dto.kind === 'visit' ? 'hot' : 'warm',
          paymentIntent: dto.kind === 'financing' ? 'financiamento' : null, notes: text.slice(0, 6000),
          tags: ['site'],
        },
      });
      await tx.crmActivity.create({ data: { dealershipId, leadId: lead.id, kind: 'created', content: 'Lead criado pelo formulário do site' } });
    } else if (vehicle && !lead.vehicleId) {
      await tx.lead.update({ where: { id: lead.id }, data: { vehicleId: vehicle.id } });
    }
    await tx.crmActivity.create({ data: { dealershipId, leadId: lead.id, kind: 'site_form', content: text.slice(0, 4000) } });
    await tx.crmTask.create({
      data: {
        dealershipId, leadId: lead.id, assignedUserId: lead.assignedSellerId, priority: 'high',
        title: `Responder ${name.split(' ')[0]} (site)`, notes: text.slice(0, 2000),
        dueAt: new Date(Date.now() + settings.slaHours * 60 * 60 * 1000),
      },
    });
    await tx.lead.update({ where: { id: lead.id }, data: { updatedAt: new Date() } });
    return { ok: true };
  });
}
