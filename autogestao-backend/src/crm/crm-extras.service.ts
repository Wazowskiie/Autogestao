import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from './crm.service';
import { CrmFollowupQueryDto, CrmMessageSentDto, CrmReportQueryDto, CrmSettingsDto, CrmTemplateDto, CrmTradeInDto, CrmWishDto } from './crm-extras.dto';
import { generateFollowups, getSettings, scanStockForWish } from './crm-helpers';

const DEFAULT_TEMPLATES: { category: string; title: string; body: string }[] = [
  { category: 'primeiro_contato', title: 'Primeiro contato', body: 'Olá {primeiro_nome}, tudo bem? Aqui é {vendedor}, da {loja}. Vi seu interesse na {veiculo}. Posso te mandar mais fotos, valores ou fazer uma simulação?' },
  { category: 'disponivel', title: 'Veículo disponível', body: 'Oi {primeiro_nome}! A {veiculo} ainda está disponível por {preco}. Veja as fotos: {link}\nQuer agendar uma visita ou fazer uma simulação?' },
  { category: 'proposta', title: 'Proposta', body: '{primeiro_nome}, preparei uma condição especial para a {veiculo}: {preco}. Aceitamos sua moto na troca e parcelamos. Posso te passar os detalhes?' },
  { category: 'retorno', title: 'Retomar contato', body: 'Oi {primeiro_nome}, tudo certo? Ainda está procurando moto? Chegaram novidades aqui na {loja}. Posso te mandar algumas opções?' },
  { category: 'desejo', title: 'Chegou o que você queria', body: '{primeiro_nome}, boa notícia! Chegou uma {veiculo} do jeito que você procurava, por {preco}. Fotos: {link}\nQuer ver pessoalmente?' },
  { category: 'aniversario', title: 'Aniversário', body: 'Feliz aniversário, {primeiro_nome}! A equipe da {loja} te deseja um ótimo dia. Conte sempre com a gente!' },
  { category: 'revisao', title: 'Revisão de 1 ano', body: 'Oi {primeiro_nome}! Já faz 1 ano que você levou sua {veiculo}. Que tal fazer a revisão para manter tudo em dia? Estamos à disposição aqui na {loja}.' },
  { category: 'recompra', title: 'Hora de trocar', body: 'Oi {primeiro_nome}! Já são 2 anos com sua {veiculo}. Avaliamos ela na troca por uma mais nova, com parcelas que cabem no bolso. Quer uma avaliação sem compromisso?' },
];
const FOLLOWUP_INCLUDE = { customer: { select: { id: true, name: true, phone: true } } } as const;
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class CrmExtrasService {
  constructor(private readonly prisma: PrismaService, private readonly crm: CrmService) {}

  private manager(u: AuthenticatedUser) { if (u.role === 'seller') throw new ForbiddenException('Somente o dono ou o administrador pode alterar isso'); }
  private async lead(u: AuthenticatedUser, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { ...this.crm.scope(u), id } });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    return lead;
  }
  private async log(u: AuthenticatedUser, leadId: string, kind: string, content: string, metadata?: Prisma.InputJsonValue) {
    await this.prisma.crmActivity.create({ data: { dealershipId: u.dealershipId, leadId, userId: u.userId, kind, content, metadata } });
  }

  // ---------- Configurações ----------
  async settings(u: AuthenticatedUser) {
    const s = await getSettings(this.prisma, u.dealershipId);
    const sellers = await this.prisma.user.count({ where: { dealershipId: u.dealershipId, role: 'seller', active: true } });
    return { ...s, activeSellers: sellers };
  }
  async updateSettings(u: AuthenticatedUser, dto: CrmSettingsDto) {
    this.manager(u);
    const cur = await getSettings(this.prisma, u.dealershipId);
    const next = {
      ...cur,
      ...(dto.roundRobin !== undefined ? { roundRobin: dto.roundRobin } : {}),
      ...(dto.slaHours !== undefined ? { slaHours: dto.slaHours } : {}),
      postSale: { ...cur.postSale, ...Object.fromEntries(Object.entries(dto.postSale ?? {}).filter(([, v]) => v !== undefined)) },
    };
    await this.prisma.dealership.update({ where: { id: u.dealershipId }, data: { crmSettings: next as unknown as Prisma.InputJsonValue } });
    return this.settings(u);
  }

  // ---------- Mensagens prontas ----------
  async templates(u: AuthenticatedUser) {
    const count = await this.prisma.crmMessageTemplate.count({ where: { dealershipId: u.dealershipId } });
    if (!count) {
      await this.prisma.crmMessageTemplate.createMany({ data: DEFAULT_TEMPLATES.map((t, i) => ({ ...t, dealershipId: u.dealershipId, sort: i })) });
    }
    return this.prisma.crmMessageTemplate.findMany({ where: { dealershipId: u.dealershipId }, orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }] });
  }
  async createTemplate(u: AuthenticatedUser, dto: CrmTemplateDto) {
    this.manager(u);
    return this.prisma.crmMessageTemplate.create({ data: { dealershipId: u.dealershipId, title: dto.title.trim(), body: dto.body.trim(), category: dto.category ?? 'geral', sort: dto.sort ?? 100 } });
  }
  async updateTemplate(u: AuthenticatedUser, id: string, dto: CrmTemplateDto) {
    this.manager(u);
    const t = await this.prisma.crmMessageTemplate.findFirst({ where: { id, dealershipId: u.dealershipId } });
    if (!t) throw new NotFoundException('Mensagem não encontrada');
    return this.prisma.crmMessageTemplate.update({ where: { id }, data: { title: dto.title.trim(), body: dto.body.trim(), ...(dto.category ? { category: dto.category } : {}), ...(dto.sort !== undefined ? { sort: dto.sort } : {}) } });
  }
  async removeTemplate(u: AuthenticatedUser, id: string) {
    this.manager(u);
    const r = await this.prisma.crmMessageTemplate.deleteMany({ where: { id, dealershipId: u.dealershipId } });
    if (!r.count) throw new NotFoundException('Mensagem não encontrada');
    return { success: true };
  }

  /** Mensagem enviada pelo WhatsApp: entra no histórico e conta como contato */
  async messageSent(u: AuthenticatedUser, leadId: string, dto: CrmMessageSentDto) {
    const lead = await this.lead(u, leadId);
    if (lead.archivedAt) throw new ConflictException('Lead arquivado');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.crmActivity.create({
        data: { dealershipId: u.dealershipId, leadId, userId: u.userId, kind: 'whatsapp', content: `${dto.templateTitle ? `[${dto.templateTitle}] ` : ''}${dto.text.trim()}`.slice(0, 4000), occurredAt: now },
      }),
      this.prisma.lead.update({
        where: { id: leadId },
        data: { lastContactAt: now, ...(lead.firstContactAt ? {} : { firstContactAt: now }), ...(lead.stage === 'new' ? { stage: 'contacted' } : {}) },
      }),
    ]);
    return this.crm.detail(u, leadId);
  }

  // ---------- Troca do cliente ----------
  async updateTradeIn(u: AuthenticatedUser, leadId: string, dto: CrmTradeInDto) {
    const lead = await this.lead(u, leadId);
    if (lead.archivedAt) throw new ConflictException('Lead arquivado');
    const { remove, ...rest } = dto;
    const data = remove ? null : {
      ...rest,
      plate: rest.plate ? rest.plate.toUpperCase().replace(/[^A-Z0-9]/g, '') : undefined,
      brand: rest.brand?.trim(), model: rest.model?.trim(), notes: rest.notes?.trim(),
      expectedValue: rest.expectedValue != null ? round2(rest.expectedValue) : undefined,
      evaluatedValue: rest.evaluatedValue != null ? round2(rest.evaluatedValue) : undefined,
    };
    if (data && !data.brand && !data.model && !data.plate) throw new BadRequestException('Informe pelo menos a placa ou a marca e o modelo do veículo da troca.');
    await this.prisma.lead.update({ where: { id: leadId }, data: { tradeIn: data === null ? Prisma.DbNull : (data as Prisma.InputJsonValue) } });
    await this.log(u, leadId, 'trade_in', data ? `Troca: ${[data.brand, data.model, data.year].filter(Boolean).join(' ')}${data.expectedValue ? ` · cliente quer ${data.expectedValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}` : 'Troca removida');
    return this.crm.detail(u, leadId);
  }

  // ---------- Lista de desejos ----------
  private wishData(dto: CrmWishDto) {
    const t = (v?: string | null) => (v == null ? v : v.trim() || null);
    if (dto.yearMin && dto.yearMax && dto.yearMin > dto.yearMax) throw new BadRequestException('O ano mínimo deve ser menor que o máximo.');
    return {
      ...(dto.type !== undefined ? { type: dto.type || null } : {}),
      ...(dto.brand !== undefined ? { brand: t(dto.brand) } : {}),
      ...(dto.model !== undefined ? { model: t(dto.model) } : {}),
      ...(dto.yearMin !== undefined ? { yearMin: dto.yearMin || null } : {}),
      ...(dto.yearMax !== undefined ? { yearMax: dto.yearMax || null } : {}),
      ...(dto.priceMax !== undefined ? { priceMax: dto.priceMax || null } : {}),
      ...(dto.kmMax !== undefined ? { kmMax: dto.kmMax || null } : {}),
      ...(dto.notes !== undefined ? { notes: t(dto.notes) } : {}),
    };
  }
  private wishInclude() {
    return {
      matches: {
        where: { dismissed: false, vehicle: { status: 'available' as const } }, orderBy: { createdAt: 'desc' as const },
        include: { vehicle: { select: { id: true, brand: true, model: true, version: true, year: true, price: true, km: true, plate: true, photos: { take: 1 } } } },
      },
    };
  }
  async wishes(u: AuthenticatedUser, leadId: string) {
    await this.lead(u, leadId);
    return this.prisma.crmWish.findMany({ where: { leadId, dealershipId: u.dealershipId }, include: this.wishInclude(), orderBy: { createdAt: 'desc' } });
  }
  async createWish(u: AuthenticatedUser, leadId: string, dto: CrmWishDto) {
    const lead = await this.lead(u, leadId);
    if (lead.archivedAt) throw new ConflictException('Lead arquivado');
    const data = this.wishData(dto);
    if (!data.brand && !data.model && !data.type && !data.priceMax) throw new BadRequestException('Diga pelo menos o tipo, a marca, o modelo ou o preço máximo.');
    const w = await this.prisma.crmWish.create({ data: { ...data, dealershipId: u.dealershipId, leadId } });
    await scanStockForWish(this.prisma, w.id);
    await this.log(u, leadId, 'wish', `Desejo anotado: ${[data.brand, data.model, data.yearMin ? `a partir de ${data.yearMin}` : '', data.priceMax ? `até ${Number(data.priceMax).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''].filter(Boolean).join(' ')}`);
    return this.wishes(u, leadId);
  }
  async updateWish(u: AuthenticatedUser, id: string, dto: CrmWishDto) {
    const w = await this.prisma.crmWish.findFirst({ where: { id, dealershipId: u.dealershipId } });
    if (!w) throw new NotFoundException('Desejo não encontrado');
    await this.lead(u, w.leadId);
    await this.prisma.crmWish.update({
      where: { id },
      data: { ...this.wishData(dto), ...(dto.status ? { status: dto.status, closedAt: dto.status === 'active' ? null : new Date() } : {}) },
    });
    if ((dto.status ?? w.status) === 'active') await scanStockForWish(this.prisma, id);
    return this.wishes(u, w.leadId);
  }
  async removeWish(u: AuthenticatedUser, id: string) {
    const w = await this.prisma.crmWish.findFirst({ where: { id, dealershipId: u.dealershipId } });
    if (!w) throw new NotFoundException('Desejo não encontrado');
    await this.lead(u, w.leadId);
    await this.prisma.crmWish.delete({ where: { id } });
    return this.wishes(u, w.leadId);
  }
  async dismissMatch(u: AuthenticatedUser, id: string) {
    const m = await this.prisma.crmWishMatch.findFirst({ where: { id, dealershipId: u.dealershipId }, include: { wish: true } });
    if (!m) throw new NotFoundException('Aviso não encontrado');
    await this.lead(u, m.wish.leadId);
    await this.prisma.crmWishMatch.update({ where: { id }, data: { dismissed: true } });
    return { success: true };
  }
  /** Todos os desejos ativos que têm veículo compatível no estoque agora */
  async wishMatches(u: AuthenticatedUser) {
    const items = await this.prisma.crmWishMatch.findMany({
      where: {
        dealershipId: u.dealershipId, dismissed: false, vehicle: { status: 'available' },
        wish: { status: 'active', lead: { ...this.crm.scope(u), archivedAt: null } },
      },
      orderBy: { createdAt: 'desc' }, take: 100,
      include: {
        vehicle: { select: { id: true, brand: true, model: true, version: true, year: true, price: true, km: true, plate: true, photos: { take: 1 } } },
        wish: { select: { id: true, brand: true, model: true, yearMin: true, yearMax: true, priceMax: true, lead: { select: { id: true, stage: true, customer: { select: { name: true, phone: true } }, assignedSeller: { select: { name: true } } } } } },
      },
    });
    return { items, total: items.length };
  }

  // ---------- Pós-venda ----------
  private followupScope(u: AuthenticatedUser): Prisma.CrmFollowupWhereInput {
    return { dealershipId: u.dealershipId, ...(u.role === 'seller' ? { sellerId: u.userId } : {}) };
  }
  async followups(u: AuthenticatedUser, q: CrmFollowupQueryDto) {
    await generateFollowups(this.prisma, u.dealershipId);
    const status = q.status ?? 'open';
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const where: Prisma.CrmFollowupWhereInput = { ...this.followupScope(u), status, ...(status === 'open' ? { dueDate: { lte: until } } : {}) };
    const items = await this.prisma.crmFollowup.findMany({ where, include: FOLLOWUP_INCLUDE, orderBy: { dueDate: status === 'open' ? 'asc' : 'desc' }, take: 200 });
    const today = Date.now();
    return { items, total: items.length, dueNow: items.filter((i) => i.status === 'open' && i.dueDate.getTime() <= today + 12 * 60 * 60 * 1000).length };
  }
  async followupStatus(u: AuthenticatedUser, id: string, status: string) {
    const f = await this.prisma.crmFollowup.findFirst({ where: { ...this.followupScope(u), id } });
    if (!f) throw new NotFoundException('Lembrete não encontrado');
    return this.prisma.crmFollowup.update({ where: { id }, data: { status, doneAt: status === 'open' ? null : new Date() }, include: FOLLOWUP_INCLUDE });
  }
  /** Transforma o lembrete de recompra/revisão numa oportunidade no funil */
  async followupOpportunity(u: AuthenticatedUser, id: string) {
    const f = await this.prisma.crmFollowup.findFirst({ where: { ...this.followupScope(u), id }, include: FOLLOWUP_INCLUDE });
    if (!f) throw new NotFoundException('Lembrete não encontrado');
    if (f.leadId) return { leadId: f.leadId };
    const tag = f.kind === 'upgrade' ? 'recompra' : f.kind === 'review' ? 'revisão' : 'aniversário';
    const leadId = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          dealershipId: u.dealershipId, customerId: f.customerId, assignedSellerId: u.role === 'seller' ? u.userId : f.sellerId ?? u.userId,
          source: 'pos_venda', stage: 'new', temperature: 'warm', tags: ['pós-venda', tag],
          notes: `${f.title}${f.vehicleLabel ? `\nVeículo comprado: ${f.vehicleLabel}` : ''}`,
          nextActionDate: new Date(), nextActionNote: f.kind === 'upgrade' ? 'Oferecer troca por um veículo mais novo' : 'Entrar em contato (pós-venda)',
        },
      });
      await tx.crmActivity.create({ data: { dealershipId: u.dealershipId, leadId: lead.id, userId: u.userId, kind: 'created', content: `Oportunidade criada pelo pós-venda: ${f.title}` } });
      await tx.crmTask.create({
        data: { dealershipId: u.dealershipId, leadId: lead.id, createdById: u.userId, assignedUserId: lead.assignedSellerId, autoFollowup: true, title: lead.nextActionNote!, dueAt: new Date() },
      });
      await tx.crmFollowup.update({ where: { id }, data: { leadId: lead.id, status: 'done', doneAt: new Date() } });
      return lead.id;
    });
    return { leadId };
  }

  // ---------- Relatório ----------
  async report(u: AuthenticatedUser, q: CrmReportQueryDto) {
    const now = new Date();
    const from = q.from ? new Date(q.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = q.to ? new Date(new Date(q.to).getTime() + 86400000) : new Date(now.getTime() + 60000);
    if (from >= to) throw new BadRequestException('A data inicial deve ser anterior à final');
    const leads = await this.prisma.lead.findMany({
      where: { ...this.crm.scope(u), createdAt: { gte: from, lt: to } },
      select: {
        id: true, source: true, stage: true, lostReason: true, createdAt: true, firstContactAt: true, assignedSellerId: true,
        assignedSeller: { select: { name: true } }, sale: { select: { price: true, status: true } },
      },
    });
    type Row = { key: string; label: string; total: number; won: number; lost: number; open: number; revenue: number; responseSum: number; responseCount: number };
    const group = (key: (l: typeof leads[number]) => string, label: (l: typeof leads[number]) => string) => {
      const map = new Map<string, Row>();
      for (const l of leads) {
        const k = key(l);
        const r = map.get(k) ?? { key: k, label: label(l), total: 0, won: 0, lost: 0, open: 0, revenue: 0, responseSum: 0, responseCount: 0 };
        r.total++;
        if (l.stage === 'won') r.won++; else if (l.stage === 'lost') r.lost++; else r.open++;
        if (l.sale && l.sale.status === 'active') r.revenue += Number(l.sale.price);
        if (l.firstContactAt) { r.responseSum += Math.max(0, l.firstContactAt.getTime() - l.createdAt.getTime()) / 60000; r.responseCount++; }
        map.set(k, r);
      }
      return [...map.values()].map(({ responseSum, responseCount, ...r }) => ({
        ...r, revenue: round2(r.revenue), conversion: r.total ? Math.round((r.won / r.total) * 1000) / 10 : 0,
        avgResponseMinutes: responseCount ? Math.round(responseSum / responseCount) : null,
      })).sort((a, b) => b.total - a.total);
    };
    const all = group(() => 'all', () => 'Total')[0] ?? { total: 0, won: 0, lost: 0, open: 0, revenue: 0, conversion: 0, avgResponseMinutes: null };
    const reasons = new Map<string, { reason: string; count: number }>();
    for (const l of leads) {
      if (l.stage !== 'lost' || !l.lostReason) continue;
      const k = l.lostReason.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
      const r = reasons.get(k) ?? { reason: l.lostReason.trim().replace(/[.!]+$/, ''), count: 0 };
      r.count++; reasons.set(k, r);
    }
    return {
      period: { from, to: new Date(to.getTime() - 1) },
      totals: all,
      bySource: group((l) => l.source ?? 'outro', (l) => l.source ?? 'outro'),
      bySeller: group((l) => l.assignedSellerId ?? 'none', (l) => l.assignedSeller?.name ?? 'Sem responsável'),
      lostReasons: [...reasons.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    };
  }
}
