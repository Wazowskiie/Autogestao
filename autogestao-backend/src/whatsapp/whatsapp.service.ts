// WhatsApp oficial (Meta Cloud API): cada mensagem que chega vira lead no CRM e a loja responde de dentro do sistema
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { TokenEncryptionService } from '../common/crypto/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { getSettings, pickNextSeller } from '../crm/crm-helpers';
import { SaveWhatsappAccountDto } from './whatsapp.dto';

const GRAPH = 'https://graph.facebook.com';
const DAY = 24 * 60 * 60 * 1000;
type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

/** Variações de um número brasileiro (com e sem o 9, com e sem 55), para achar o cliente certo */
export function phoneVariants(raw: string) {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  const out = new Set<string>([d]);
  if (d.length === 10 && /[6-9]/.test(d[2])) out.add(`${d.slice(0, 2)}9${d.slice(2)}`);
  if (d.length === 11 && d[2] === '9') out.add(`${d.slice(0, 2)}${d.slice(3)}`);
  for (const v of [...out]) out.add(`55${v}`);
  return [...out];
}

/** Texto curto de cada tipo de mensagem do WhatsApp */
export function messageText(m: any): { type: string; body: string | null } {
  const type = String(m?.type ?? 'unknown');
  switch (type) {
    case 'text': return { type, body: m.text?.body ?? '' };
    case 'image': return { type, body: m.image?.caption ? `[Foto] ${m.image.caption}` : '[Foto]' };
    case 'video': return { type, body: m.video?.caption ? `[Vídeo] ${m.video.caption}` : '[Vídeo]' };
    case 'audio': return { type, body: m.audio?.voice ? '[Áudio de voz]' : '[Áudio]' };
    case 'document': return { type, body: `[Documento] ${m.document?.filename ?? ''}`.trim() };
    case 'sticker': return { type, body: '[Figurinha]' };
    case 'location': return { type, body: `[Localização] ${[m.location?.name, m.location?.address].filter(Boolean).join(' - ')}`.trim() };
    case 'contacts': return { type, body: '[Contato]' };
    case 'button': return { type, body: m.button?.text ?? '[Botão]' };
    case 'interactive': return { type, body: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '[Resposta]' };
    case 'reaction': return { type, body: m.reaction?.emoji ? `Reagiu com ${m.reaction.emoji}` : null };
    default: return { type, body: '[Mensagem que o sistema ainda não mostra]' };
  }
}

@Injectable()
export class WhatsappService {
  private readonly log = new Logger('WhatsApp');
  /** Trocável nos testes */
  fetchImpl: FetchLike = (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<FetchLike>;

  constructor(private readonly prisma: PrismaService, @Optional() private readonly crypto?: TokenEncryptionService) {}

  private get version() { return process.env.META_GRAPH_VERSION || 'v25.0'; }
  private enc(v: string) { if (!this.crypto) throw new Error('TOKEN_ENCRYPTION_KEY não configurada'); return this.crypto.encrypt(v); }
  private dec(v: string) { if (!this.crypto) throw new Error('TOKEN_ENCRYPTION_KEY não configurada'); return this.crypto.decrypt(v); }
  private manager(u: AuthenticatedUser) { if (u.role === 'seller') throw new ForbiddenException('Só o dono ou o administrador pode configurar o WhatsApp.'); }
  webhookUrl() {
    const base = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
    return base ? `${base}/api/v1/whatsapp/webhook` : '/api/v1/whatsapp/webhook';
  }

  // ======================= Configuração =======================
  async account(u: AuthenticatedUser) {
    const a = await this.prisma.whatsappAccount.findUnique({ where: { dealershipId: u.dealershipId } });
    if (!a) return { configured: false, webhookUrl: this.webhookUrl() };
    const base = { configured: true, status: a.status, displayPhone: a.displayPhone, verifiedName: a.verifiedName, connectedAt: a.connectedAt, lastWebhookAt: a.lastWebhookAt, lastError: a.lastError };
    if (u.role === 'seller') return base;
    return { ...base, phoneNumberId: a.phoneNumberId, wabaId: a.wabaId, verifyToken: a.verifyToken, webhookUrl: this.webhookUrl() };
  }

  async saveAccount(u: AuthenticatedUser, dto: SaveWhatsappAccountDto) {
    this.manager(u);
    const cur = await this.prisma.whatsappAccount.findUnique({ where: { dealershipId: u.dealershipId } });
    const phoneNumberId = dto.phoneNumberId.trim();
    const other = await this.prisma.whatsappAccount.findFirst({ where: { phoneNumberId, NOT: { dealershipId: u.dealershipId } }, select: { id: true } });
    if (other) throw new ConflictException('Este número já está ligado a outra loja.');
    if (!cur && (!dto.accessToken?.trim() || !dto.appSecret?.trim())) throw new BadRequestException('Informe o token de acesso e a chave secreta do app.');
    const data = {
      phoneNumberId, wabaId: dto.wabaId?.trim() || null,
      ...(dto.accessToken?.trim() ? { accessTokenEnc: this.enc(dto.accessToken.trim()) } : {}),
      ...(dto.appSecret?.trim() ? { appSecretEnc: this.enc(dto.appSecret.trim()) } : {}),
    };
    if (cur) await this.prisma.whatsappAccount.update({ where: { id: cur.id }, data: { ...data, status: 'pending', lastError: null } });
    else await this.prisma.whatsappAccount.create({
      data: { dealershipId: u.dealershipId, ...data, accessTokenEnc: data.accessTokenEnc!, appSecretEnc: data.appSecretEnc!, verifyToken: randomBytes(20).toString('hex') },
    });
    return this.test(u);
  }

  /** Confere o número e o token na Meta */
  async test(u: AuthenticatedUser) {
    this.manager(u);
    const a = await this.prisma.whatsappAccount.findUnique({ where: { dealershipId: u.dealershipId } });
    if (!a) throw new NotFoundException('WhatsApp ainda não configurado.');
    try {
      const res = await this.fetchImpl(`${GRAPH}/${this.version}/${a.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, {
        headers: { Authorization: `Bearer ${this.dec(a.accessTokenEnc)}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(this.metaError(body));
      await this.prisma.whatsappAccount.update({
        where: { id: a.id },
        data: { status: 'connected', displayPhone: body.display_phone_number ?? null, verifiedName: body.verified_name ?? null, lastError: null, connectedAt: a.connectedAt ?? new Date() },
      });
    } catch (e) {
      await this.prisma.whatsappAccount.update({ where: { id: a.id }, data: { status: 'error', lastError: (e as Error).message.slice(0, 500) } });
    }
    return this.account(u);
  }

  async removeAccount(u: AuthenticatedUser) {
    this.manager(u);
    await this.prisma.whatsappAccount.deleteMany({ where: { dealershipId: u.dealershipId } });
    return { success: true };
  }

  private metaError(body: any) {
    const e = body?.error;
    if (!e) return 'A Meta não respondeu como esperado.';
    if (e.code === 190) return 'Token da Meta expirado ou inválido. Gere um token permanente (usuário do sistema) e salve de novo.';
    if (e.code === 100 && /phone/i.test(e.message ?? '')) return 'Identificação do número (Phone number ID) não encontrada. Confira no painel da Meta.';
    if (e.code === 131047 || e.code === 131026) return 'Fora da janela de 24 horas: o cliente precisa mandar uma mensagem primeiro. Use o botão do WhatsApp normal para chamar.';
    if (e.code === 131030) return 'Este número ainda não pode receber mensagens neste modo de teste da Meta. Adicione-o como destinatário de teste no painel.';
    return `${e.message ?? 'Erro da Meta'}${e.error_data?.details ? ` (${e.error_data.details})` : ''}`.slice(0, 400);
  }

  // ======================= Webhook =======================
  async verify(mode?: string, token?: string, challenge?: string) {
    if (mode !== 'subscribe' || !token || !challenge) throw new ForbiddenException('Verificação inválida');
    const a = await this.prisma.whatsappAccount.findUnique({ where: { verifyToken: token } });
    if (!a) throw new ForbiddenException('Token de verificação não confere');
    await this.prisma.whatsappAccount.update({ where: { id: a.id }, data: { lastWebhookAt: new Date() } });
    return challenge;
  }

  /** Recebe o aviso da Meta. Confere a assinatura com a chave secreta da loja dona do número. */
  async receive(rawBody: Buffer | undefined, signature: string | undefined, body: any) {
    if (body?.object !== 'whatsapp_business_account') return { ignored: true };
    const changes: any[] = (body.entry ?? []).flatMap((e: any) => e.changes ?? []).filter((c: any) => c.field === 'messages' && c.value);
    const phoneId = changes[0]?.value?.metadata?.phone_number_id;
    if (!phoneId) return { ignored: true };
    const account = await this.prisma.whatsappAccount.findUnique({ where: { phoneNumberId: String(phoneId) } });
    if (!account) return { ignored: true };
    if (!rawBody || !signature?.startsWith('sha256=')) throw new UnauthorizedException('Assinatura ausente');
    const expected = createHmac('sha256', this.dec(account.appSecretEnc)).update(rawBody).digest('hex');
    const got = signature.slice(7);
    if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(expected, 'hex'))) {
      this.log.warn(`Assinatura inválida no webhook do número ${phoneId}`);
      throw new UnauthorizedException('Assinatura inválida');
    }
    await this.prisma.whatsappAccount.update({ where: { id: account.id }, data: { lastWebhookAt: new Date(), ...(account.status !== 'connected' ? { status: 'connected', lastError: null, connectedAt: account.connectedAt ?? new Date() } : {}) } });

    let received = 0;
    for (const c of changes) {
      if (String(c.value?.metadata?.phone_number_id) !== account.phoneNumberId) continue;
      const contacts: any[] = c.value.contacts ?? [];
      for (const m of c.value.messages ?? []) {
        const name = contacts.find((x) => x.wa_id === m.from)?.profile?.name ?? null;
        if (await this.inbound(account.dealershipId, m, name)) received++;
      }
      for (const st of c.value.statuses ?? []) await this.status(st);
    }
    return { ok: true, received };
  }

  private async inbound(dealershipId: string, m: any, profileName: string | null) {
    const waMessageId = String(m.id ?? '');
    if (!waMessageId || !m.from) return false;
    if (await this.prisma.whatsappMessage.findUnique({ where: { waMessageId } })) return false; // a Meta reenvia avisos
    const { type, body } = messageText(m);
    if (type === 'reaction' && !body) return false;
    const sentAt = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date();
    const waId = String(m.from).replace(/\D/g, '');
    const settings = await getSettings(this.prisma, dealershipId);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'wa:' + dealershipId + ':' + waId}))`;
      if (await tx.whatsappMessage.findUnique({ where: { waMessageId } })) return;
      const variants = phoneVariants(waId);
      const found = await tx.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM customers WHERE dealership_id = ${dealershipId}
        AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ANY(${variants}) ORDER BY created_at ASC LIMIT 1`;
      const local = variants.find((v) => !v.startsWith('55') && v.length === 11) ?? variants[0];
      const customer = found[0] ?? await tx.customer.create({
        data: { dealershipId, name: (profileName?.trim() || `WhatsApp ${local}`).slice(0, 100), phone: local, howMet: 'whatsapp' },
        select: { id: true, name: true },
      });

      let lead = await tx.lead.findFirst({
        where: { dealershipId, customerId: customer.id, archivedAt: null, stage: { in: ['new', 'contacted', 'negotiating'] } },
        orderBy: { updatedAt: 'desc' },
      });
      if (!lead) {
        const assignedSellerId = await pickNextSeller(tx, dealershipId);
        lead = await tx.lead.create({
          data: { dealershipId, customerId: customer.id, assignedSellerId, source: 'whatsapp', stage: 'new', temperature: 'warm', tags: ['whatsapp'], notes: body?.slice(0, 2000) ?? null },
        });
        await tx.crmActivity.create({ data: { dealershipId, leadId: lead.id, kind: 'created', content: 'Lead criado por mensagem no WhatsApp' } });
      }
      await tx.whatsappMessage.create({
        data: { dealershipId, customerId: customer.id, leadId: lead.id, waMessageId, waId, direction: 'in', type, body, status: 'received', sentAt },
      });
      await tx.crmActivity.create({ data: { dealershipId, leadId: lead.id, kind: 'whatsapp_in', content: (body ?? '').slice(0, 4000) || '[mensagem]', occurredAt: sentAt } });
      const pending = await tx.crmTask.findFirst({ where: { leadId: lead.id, status: 'open', title: { startsWith: 'Responder' } }, select: { id: true } });
      if (!pending) {
        await tx.crmTask.create({
          data: { dealershipId, leadId: lead.id, assignedUserId: lead.assignedSellerId, priority: 'high', title: `Responder ${customer.name.split(' ')[0]} (WhatsApp)`, dueAt: new Date(Date.now() + settings.slaHours * 3600000) },
        });
      }
      await tx.lead.update({ where: { id: lead.id }, data: { updatedAt: new Date() } });
    });
    return true;
  }

  private async status(st: any) {
    if (!st?.id || !st?.status) return;
    const order = ['sent', 'delivered', 'read', 'failed'];
    const msg = await this.prisma.whatsappMessage.findUnique({ where: { waMessageId: String(st.id) } });
    if (!msg || msg.direction !== 'out') return;
    // não volta de "lido" para "entregue" se os avisos chegarem fora de ordem
    if (st.status !== 'failed' && order.indexOf(st.status) <= order.indexOf(msg.status)) return;
    await this.prisma.whatsappMessage.update({
      where: { id: msg.id },
      data: { status: st.status, ...(st.status === 'failed' ? { error: this.metaError({ error: st.errors?.[0] ?? { message: 'Falha no envio' } }) } : {}) },
    });
  }

  // ======================= Conversa no lead =======================
  private async leadFor(u: AuthenticatedUser, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, dealershipId: u.dealershipId, ...(u.role === 'seller' ? { assignedSellerId: u.userId } : {}) },
      include: { customer: { select: { id: true, name: true, phone: true } } },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    return lead;
  }

  async conversation(u: AuthenticatedUser, leadId: string) {
    const lead = await this.leadFor(u, leadId);
    const account = await this.prisma.whatsappAccount.findUnique({ where: { dealershipId: u.dealershipId }, select: { status: true, displayPhone: true } });
    if (!lead.customerId) return { connected: !!account, items: [], windowOpenUntil: null };
    const items = await this.prisma.whatsappMessage.findMany({
      where: { dealershipId: u.dealershipId, customerId: lead.customerId }, orderBy: { sentAt: 'desc' }, take: 200,
    });
    await this.prisma.whatsappMessage.updateMany({ where: { dealershipId: u.dealershipId, customerId: lead.customerId, direction: 'in', readAt: null }, data: { readAt: new Date() } });
    const lastIn = items.find((m) => m.direction === 'in');
    const until = lastIn ? new Date(lastIn.sentAt.getTime() + DAY) : null;
    return {
      connected: account?.status === 'connected', accountStatus: account?.status ?? null, storePhone: account?.displayPhone ?? null,
      windowOpenUntil: until && until.getTime() > Date.now() ? until : null,
      items: items.reverse().map((m) => ({ id: m.id, direction: m.direction, type: m.type, body: m.body, status: m.status, error: m.error, sentAt: m.sentAt })),
    };
  }

  async send(u: AuthenticatedUser, leadId: string, text: string) {
    const body = text.trim();
    if (!body) throw new BadRequestException('Escreva a mensagem.');
    const lead = await this.leadFor(u, leadId);
    if (!lead.customer) throw new BadRequestException('Lead sem cliente.');
    const account = await this.prisma.whatsappAccount.findUnique({ where: { dealershipId: u.dealershipId } });
    if (!account || account.status !== 'connected') throw new BadRequestException('O WhatsApp oficial da loja não está conectado. Veja em Configurações → Integrações.');
    const lastIn = await this.prisma.whatsappMessage.findFirst({ where: { dealershipId: u.dealershipId, customerId: lead.customer.id, direction: 'in' }, orderBy: { sentAt: 'desc' } });
    if (!lastIn || lastIn.sentAt.getTime() < Date.now() - DAY) {
      throw new BadRequestException('Fora da janela de 24 horas: pela regra da Meta, só dá para responder até 24h depois da última mensagem do cliente. Use o botão do WhatsApp normal para chamar.');
    }
    const to = lastIn.waId;
    const res = await this.fetchImpl(`${GRAPH}/${this.version}/${account.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.dec(account.accessTokenEnc)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: true, body } }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = this.metaError(json);
      if (json?.error?.code === 190) await this.prisma.whatsappAccount.update({ where: { id: account.id }, data: { status: 'error', lastError: error } });
      throw new BadRequestException(error);
    }
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.whatsappMessage.create({
        data: { dealershipId: u.dealershipId, customerId: lead.customer.id, leadId: lead.id, waMessageId: json?.messages?.[0]?.id ?? null, waId: to, direction: 'out', type: 'text', body, status: 'sent', sentById: u.userId, sentAt: now },
      }),
      this.prisma.crmActivity.create({ data: { dealershipId: u.dealershipId, leadId: lead.id, userId: u.userId, kind: 'whatsapp', content: body.slice(0, 4000), occurredAt: now } }),
      this.prisma.lead.update({
        where: { id: lead.id },
        data: { lastContactAt: now, ...(lead.firstContactAt ? {} : { firstContactAt: now }), ...(lead.stage === 'new' ? { stage: 'contacted' } : {}) },
      }),
      // Respondeu: a tarefa "Responder" está feita
      this.prisma.crmTask.updateMany({ where: { leadId: lead.id, status: 'open', title: { startsWith: 'Responder' } }, data: { status: 'done', completedAt: now } }),
    ]);
    return this.conversation(u, leadId);
  }

  /** Quantas mensagens não lidas (para o aviso no menu) */
  async unread(u: AuthenticatedUser) {
    const count = await this.prisma.whatsappMessage.count({
      where: { dealershipId: u.dealershipId, direction: 'in', readAt: null, ...(u.role === 'seller' ? { lead: { assignedSellerId: u.userId } } : {}) },
    });
    return { count };
  }
}
