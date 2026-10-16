import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ChatAiService } from './chat-ai.service';
import { ChatContactDto, SendChatDto } from './chat.dto';
import { Prisma } from '../generated/prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

const PUBLIC_SELECT = { id: true, mode: true, createdAt: true, updatedAt: true,
  messages: { orderBy: { createdAt: 'asc' as const }, take: 200, select: { id: true, role: true, content: true, createdAt: true, clientMessageId: true } },
} as const;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService, private readonly ai: ChatAiService) {}

  async start(slug: string) {
    const shop = await this.prisma.dealership.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!shop) throw new NotFoundException('Loja não encontrada');
    const token = randomBytes(32).toString('hex');
    const conversation = await this.prisma.chatConversation.create({ data: {
      dealershipId: shop.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 7 * 86400000),
      messages: { create: { role: 'assistant', content: `Olá! Sou o assistente virtual da ${shop.name}. Que veículo você procura? Você também pode solicitar um vendedor.` } },
    }, select: PUBLIC_SELECT });
    return { token, conversation };
  }

  private async session(slug: string, token?: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException('Sessão de atendimento inválida');
    const conversation = await this.prisma.chatConversation.findFirst({ where: {
      tokenHash: hash(token), expiresAt: { gt: new Date() }, dealership: { slug },
    } });
    if (!conversation) throw new UnauthorizedException('Sessão de atendimento expirada');
    return conversation;
  }

  async read(slug: string, token?: string) {
    const c = await this.session(slug, token);
    return this.snapshot(c.id);
  }
  private snapshot(id: string) {
    return this.prisma.chatConversation.findUniqueOrThrow({ where: { id }, select: PUBLIC_SELECT });
  }
  private async lock(tx: Prisma.TransactionClient, id: string) {
    const scope=await tx.chatConversation.findUniqueOrThrow({where:{id},select:{dealershipId:true}});
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'crm-write:' + scope.dealershipId}))`;
    await tx.$queryRaw`SELECT id FROM chat_conversations WHERE id = ${id} FOR UPDATE`;
    return tx.chatConversation.findUniqueOrThrow({ where: { id } });
  }

  async send(slug: string, token: string | undefined, dto: SendChatDto) {
    const session = await this.session(slug, token);
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('Digite uma mensagem');
    const generationId = randomUUID();
    const claim = await this.prisma.$transaction(async tx => {
      const c = await this.lock(tx, session.id);
      const existing = await tx.chatMessage.findUnique({ where: { conversationId_clientMessageId: { conversationId: c.id, clientMessageId: dto.clientMessageId } } });
      if (existing) return { generate: false };
      if (c.mode === 'closed') throw new ConflictException('Conversa encerrada. Inicie um novo atendimento.');
      if (c.busyUntil && c.busyUntil > new Date()) throw new ConflictException('Aguarde a resposta anterior');
      if (await tx.chatMessage.count({ where: { conversationId: c.id } }) >= 190) throw new ConflictException('Limite de mensagens atingido. Inicie um novo atendimento.');
      await tx.chatMessage.create({ data: { conversationId: c.id, role: 'user', content, clientMessageId: dto.clientMessageId } });
      await tx.chatConversation.update({ where: { id: c.id }, data: {
        generationId: c.mode === 'bot' ? generationId : null,
        busyUntil: c.mode === 'bot' ? new Date(Date.now() + (this.ai.timeoutMs?.() ?? 25000) + 10000) : null,
      } });
      return { generate: c.mode === 'bot' };
    });
    if (claim.generate) {
      const history = await this.prisma.chatMessage.findMany({ where: { conversationId: session.id }, orderBy: { createdAt: 'desc' }, take: 16 });
      let reply: string;
      try { reply = await this.ai.reply(session.dealershipId, history.reverse()); }
      catch { reply = 'O assistente está temporariamente indisponível. Clique em “Falar com vendedor” para continuar com a equipe.'; }
      await this.prisma.$transaction(async tx => {
        const c = await this.lock(tx, session.id);
        // A handover or a newer generation invalidates the pending AI response.
        if (c.mode !== 'bot' || c.generationId !== generationId) return;
        await tx.chatMessage.create({ data: { conversationId: c.id, role: 'assistant', content: reply } });
        await tx.chatConversation.update({ where: { id: c.id }, data: { generationId: null, busyUntil: null } });
      });
    }
    return this.snapshot(session.id);
  }

  async contact(slug: string, token: string | undefined, dto: ChatContactDto) {
    if (!dto.consent) throw new BadRequestException('Autorize o contato para registrar seus dados');
    if (dto.name.trim().length < 2) throw new BadRequestException('Informe seu nome');
    const session = await this.session(slug, token);
    await this.prisma.$transaction(async tx => {
      const c = await this.lock(tx, session.id);
      if (c.mode === 'closed') throw new ConflictException('Conversa encerrada');
      if (c.leadId) return; // Repeated contact submissions never duplicate leads.
      if (dto.vehicleId && !await tx.vehicle.findFirst({ where: { id: dto.vehicleId, dealershipId: c.dealershipId, status: 'available' }, select: { id: true } })) throw new NotFoundException('Veículo de interesse não disponível');
      // Advisory lock also serializes contacts from separate sessions with the same phone.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${c.dealershipId + ':' + dto.phone}))`;
      let customer = await tx.customer.findFirst({ where: { dealershipId: c.dealershipId, phone: dto.phone } });
      if (!customer) customer = await tx.customer.create({ data: { dealershipId: c.dealershipId, name: dto.name.trim(), phone: dto.phone, howMet: 'Chat do site' } });
      const recent = await tx.chatMessage.findMany({ where: { conversationId: c.id, role: 'user' }, orderBy: { createdAt: 'asc' }, take: 12 });
      const notes = `Interesse registrado pelo chat do site. Conversa: ${c.id}\n` + recent.map(m => m.content).join('\n').slice(0, 3000);
      let lead = await tx.lead.findFirst({ where: { dealershipId: c.dealershipId, customerId: customer.id, source: 'site', archivedAt: null, ...(c.assignedUserId?{assignedSellerId:c.assignedUserId}:{}), stage: { in: ['new', 'contacted', 'negotiating'] } }, orderBy: { createdAt: 'desc' } });
      if (!lead) lead = await tx.lead.create({ data: { dealershipId: c.dealershipId, customerId: customer.id, vehicleId: dto.vehicleId, assignedSellerId: c.assignedUserId, source: 'site', notes, stage: 'new' } });
      else lead = await tx.lead.update({ where: { id: lead.id }, data: { notes: ((lead.notes ?? '') + '\n\n' + notes).slice(-6000), ...(dto.vehicleId ? { vehicleId: dto.vehicleId } : {}) } });
      await tx.chatConversation.update({ where: { id: c.id }, data: { customerId: customer.id, leadId: lead.id, assignedUserId: lead.assignedSellerId } });
      await tx.crmActivity.create({data:{dealershipId:c.dealershipId,leadId:lead.id,kind:'chat',content:'Interesse registrado pelo chat do site',metadata:{conversationId:c.id}}});
      await tx.chatMessage.create({ data: { conversationId: c.id, role: 'system', content: 'Contato registrado com autorização do cliente. A equipe poderá retornar pelo telefone informado.' } });
    });
    return this.snapshot(session.id);
  }

  async handover(slug: string, token?: string) {
    const c = await this.session(slug, token);
    await this.setMode(c.dealershipId, c.id, 'human');
    return this.snapshot(c.id);
  }

  private access(actor?: AuthenticatedUser): Prisma.ChatConversationWhereInput {
    return actor?.role==='seller'?{OR:[{lead:{assignedSellerId:actor.userId,archivedAt:null}},{leadId:null,assignedUserId:actor.userId}]}:{};
  }
  async list(dealershipId: string, page = 1, actor?: AuthenticatedUser) {
    const where = { dealershipId, ...this.access(actor) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.chatConversation.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * 30, take: 30,
        select: { id: true, mode: true, updatedAt: true, leadId: true, customer: { select: { name: true, phone: true } },
          assignedUser: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true } } } }),
      this.prisma.chatConversation.count({ where }),
    ]);
    return { items, total, page, pageSize: 30 };
  }
  private async owned(dealershipId: string, id: string, actor?: AuthenticatedUser) {
    const c = await this.prisma.chatConversation.findFirst({ where: { dealershipId, id, ...this.access(actor) } });
    if (!c) throw new NotFoundException('Conversa não encontrada');
    return c;
  }
  async detail(dealershipId: string, id: string, actor?: AuthenticatedUser) {
    await this.owned(dealershipId, id, actor);
    return this.prisma.chatConversation.findUniqueOrThrow({ where: { id }, select: {
      ...PUBLIC_SELECT, leadId: true, customer: { select: { name: true, phone: true } }, assignedUser: { select: { id: true, name: true } },
    } });
  }
  async setMode(dealershipId: string, id: string, mode: string, userId?: string, actor?: AuthenticatedUser) {
    await this.owned(dealershipId, id, actor);
    await this.prisma.$transaction(async tx => {
      const c = await this.lock(tx, id);
      if(actor?.role==='seller') {
        const permitted=await tx.chatConversation.findFirst({where:{id,dealershipId,...this.access(actor)},select:{id:true}});
        if(!permitted) throw new NotFoundException('Conversa não encontrada');
      }
      if (!userId && c.mode === 'closed') throw new ConflictException('Conversa encerrada');
      if (c.mode === mode && (!userId || c.assignedUserId === userId)) return;
      await tx.chatConversation.update({ where: { id }, data: { mode, generationId: null, busyUntil: null,
        ...(mode === 'human' && userId ? { assignedUserId: userId } : {}) } });
      if(c.leadId && mode==='human' && userId && actor?.role!=='seller') {
        await tx.crmActivity.create({data:{dealershipId,leadId:c.leadId,userId,kind:'chat_assignment',content:'Responsável assumiu o atendimento do chat',metadata:{conversationId:id}}});
      }
      await tx.chatMessage.create({ data: { conversationId: id, role: 'system', content:
        mode === 'human' ? (userId ? 'Um vendedor assumiu o atendimento.' : 'Atendimento encaminhado à equipe. Aguarde um vendedor.') : mode === 'closed' ? 'Atendimento encerrado.' : 'Assistente virtual reativado.' } });
    });
    return this.detail(dealershipId, id, actor);
  }
  async agentReply(dealershipId: string, id: string, userId: string, dto: SendChatDto, actor?: AuthenticatedUser) {
    await this.owned(dealershipId, id, actor);
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('Digite uma mensagem');
    await this.prisma.$transaction(async tx => {
      const c = await this.lock(tx, id);
      if(actor?.role==='seller' && !await tx.chatConversation.findFirst({where:{id,dealershipId,...this.access(actor)},select:{id:true}})) throw new NotFoundException('Conversa não encontrada');
      if (c.mode !== 'human') throw new ConflictException('Assuma o atendimento antes de responder');
      if (c.assignedUserId !== userId) throw new ConflictException('Clique em Assumir para responder como responsável');
      const existing = await tx.chatMessage.findUnique({ where: { conversationId_clientMessageId: { conversationId: id, clientMessageId: dto.clientMessageId } } });
      if (existing) return;
      if (await tx.chatMessage.count({ where: { conversationId: id } }) >= 190) throw new ConflictException('Limite de mensagens atingido');
      await tx.chatMessage.create({ data: { conversationId: id, role: 'agent', content, clientMessageId: dto.clientMessageId } });
      await tx.chatConversation.update({ where: { id }, data: { updatedAt: new Date() } });
    });
    return this.detail(dealershipId, id, actor);
  }
}
