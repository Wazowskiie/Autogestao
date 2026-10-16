import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PrismaService } from '../prisma/prisma.service';
import { LeadStage, Prisma } from '../generated/prisma/client';
import { CrmActivityDto, CrmContactDto, CrmLeadDto, CrmQueryDto, CrmTaskDto, CrmTaskQueryDto } from './crm.dto';

const STAGES: LeadStage[] = ['new','contacted','negotiating','won','lost'];
const STAGE_NAMES:Record<LeadStage,string>={new:'Novo',contacted:'Em contato',negotiating:'Em negociação',won:'Ganho',lost:'Perdido'};
const LEAD_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true, email: true, tags: true } },
  vehicle: { select: { id: true, brand: true, model: true, year: true, price: true, status: true, photos: { take: 1 } } },
  assignedSeller: { select: { id: true, name: true, active: true } },
  tasks: { where: { status: 'open' }, orderBy: { dueAt: 'asc' as const }, take: 1, select: { id: true, title: true, dueAt: true, priority: true } },
} as const;
const TASK_INCLUDE = {
  lead: { select: { id: true, stage: true, archivedAt: true, customer: { select: { name: true } } } },
  assignedUser: { select: { id: true, name: true } },
} as const;
type Tx = Prisma.TransactionClient;
const clean = (text?: string | null) => text == null ? text : text.trim();

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}
  private manager(u: AuthenticatedUser) { if (u.role === 'seller') throw new ForbiddenException('Somente gestores podem executar esta ação'); }
  scope(u: AuthenticatedUser): Prisma.LeadWhereInput {
    return { dealershipId: u.dealershipId, ...(u.role === 'seller' ? { assignedSellerId: u.userId } : {}) };
  }
  private where(u: AuthenticatedUser, q: CrmQueryDto): Prisma.LeadWhereInput {
    if (q.from && q.to && new Date(q.from) > new Date(q.to)) throw new BadRequestException('A data inicial deve ser anterior à final');
    const where: Prisma.LeadWhereInput = { ...this.scope(u), archivedAt: q.archived ? { not: null } : null };
    if (q.stage) where.stage = q.stage as LeadStage;
    if (q.source) where.source = q.source;
    if (q.temperature) where.temperature = q.temperature;
    if (q.assignedSellerId && u.role !== 'seller') where.assignedSellerId = q.assignedSellerId;
    if (q.unassigned && u.role !== 'seller') where.assignedSellerId = null;
    if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(new Date(q.to).getTime() + 86400000) } : {}) };
    if (q.overdue) where.tasks = { some: { status: 'open', dueAt: { lt: new Date() } } };
    if (q.search?.trim()) {
      const text = q.search.trim();
      where.OR = [
        { customer: { name: { contains: text, mode: 'insensitive' } } },
        { customer: { email: { contains: text, mode: 'insensitive' } } },
        { customer: { phone: { contains: text.replace(/[^\d+]/g, '') || text } } },
        { vehicle: { model: { contains: text, mode: 'insensitive' } } },
        { vehicle: { brand: { contains: text, mode: 'insensitive' } } },
        { tags: { has: text } },
      ];
    }
    return where;
  }
  async list(u: AuthenticatedUser, q: CrmQueryDto) {
    const where = this.where(u, q), page = q.page ?? 1, pageSize = q.pageSize ?? 30;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({ where, include: LEAD_INCLUDE, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: (page-1)*pageSize, take: pageSize }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
  async board(u: AuthenticatedUser, q: CrmQueryDto) {
    const where = this.where(u, q);
    const columns = await Promise.all(STAGES.map(async stage => {
      const filter: Prisma.LeadWhereInput = { AND: [where, { stage }] };
      const [items, total] = await this.prisma.$transaction([
        this.prisma.lead.findMany({ where: filter, include: LEAD_INCLUDE, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: 20 }),
        this.prisma.lead.count({ where: filter }),
      ]);
      return { stage, items, total, page: 1 };
    }));
    return { columns };
  }
  async legacyGrouped(u: AuthenticatedUser) {
    const items = await this.prisma.lead.findMany({ where: { ...this.scope(u), archivedAt: null }, include: LEAD_INCLUDE, orderBy: { createdAt: 'desc' }, take: 1000 });
    return Object.fromEntries(STAGES.map(stage => [stage, items.filter(item => item.stage === stage)]));
  }
  async summary(u: AuthenticatedUser, q: CrmQueryDto) {
    const where = this.where(u, q);
    const [stages, count, overdue, unassigned, won, active] = await this.prisma.$transaction([
      this.prisma.lead.groupBy({ by: ['stage'], where, orderBy:{stage:'asc'}, _count: true, _sum: { budget: true } }),
      this.prisma.lead.count({ where }),
      this.prisma.crmTask.count({ where: { status: 'open', dueAt: { lt: new Date() }, lead: where, ...(u.role==='seller'?{assignedUserId:u.userId}:{}) } }),
      this.prisma.lead.count({ where: { AND: [where, { assignedSellerId: null }] } }),
      this.prisma.lead.count({ where: { AND: [where, { stage: 'won' }] } }),
      this.prisma.lead.aggregate({ where: { AND: [where, { stage: { in: ['new','contacted','negotiating'] } }] }, _sum: { budget: true } }),
    ]);
    return { total: count, overdueTasks: overdue, unassigned, won, conversionRate: count ? Math.round(won/count*1000)/10 : 0,
      pipelineValue: Number(active._sum.budget ?? 0), stages: stages.map(s => ({ stage: s.stage, count: s._count, value: Number(s._sum?.budget ?? 0) })) };
  }
  private async locked(tx: Tx, u: AuthenticatedUser, id: string) {
    // Shared write order with chat: tenant gate before lead/conversation row locks.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'crm-write:' + u.dealershipId}))`;
    await tx.$queryRaw`SELECT id FROM leads WHERE id = ${id} AND dealership_id = ${u.dealershipId}
      AND (${u.role} <> 'seller' OR assigned_seller_id = ${u.userId}) FOR UPDATE`;
    const lead = await tx.lead.findFirst({ where: { ...this.scope(u), id } });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    return lead;
  }
  private async relations(tx: Tx, u: AuthenticatedUser, dto: CrmLeadDto) {
    if (dto.customerId && !await tx.customer.findFirst({ where: { id: dto.customerId, dealershipId: u.dealershipId, ...(u.role==='seller'?{OR:[{createdById:u.userId},{leads:{some:{assignedSellerId:u.userId}}}]}:{}) }, select: { id: true } })) throw new NotFoundException('Cliente não encontrado');
    if (dto.vehicleId && !await tx.vehicle.findFirst({ where: { id: dto.vehicleId, dealershipId: u.dealershipId }, select: { id: true } })) throw new NotFoundException('Veículo não encontrado');
    if (dto.assignedSellerId && !await tx.user.findFirst({ where: { id: dto.assignedSellerId, dealershipId: u.dealershipId, active: true }, select: { id: true } })) throw new NotFoundException('Responsável não encontrado');
  }
  private async event(tx: Tx, u: AuthenticatedUser, leadId: string, kind: string, content: string, metadata?: Prisma.InputJsonValue) {
    await tx.crmActivity.create({ data: { dealershipId: u.dealershipId, leadId, userId: u.userId, kind, content, metadata } });
    await tx.auditLog.create({ data: { dealershipId: u.dealershipId, userId: u.userId, action: kind, entity: 'lead', entityId: leadId, metadata } });
  }
  private fields(dto: CrmLeadDto): Prisma.LeadUncheckedUpdateInput {
    return {
      ...(dto.vehicleId !== undefined ? { vehicleId: dto.vehicleId } : {}),
      ...(dto.assignedSellerId !== undefined ? { assignedSellerId: dto.assignedSellerId } : {}),
      ...(dto.source !== undefined ? { source: clean(dto.source) } : {}),
      ...(dto.temperature !== undefined ? { temperature: dto.temperature } : {}),
      ...(dto.budget !== undefined ? { budget: dto.budget } : {}),
      ...(dto.paymentIntent !== undefined ? { paymentIntent: clean(dto.paymentIntent) } : {}),
      ...(dto.notes !== undefined ? { notes: clean(dto.notes) } : {}),
      ...(dto.tags !== undefined ? { tags: [...new Set(dto.tags.map(t=>t.trim()).filter(Boolean))] } : {}),
      ...(dto.nextActionDate !== undefined ? { nextActionDate: dto.nextActionDate ? new Date(dto.nextActionDate) : null } : {}),
      ...(dto.nextActionNote !== undefined ? { nextActionNote: clean(dto.nextActionNote) } : {}),
    };
  }
  async create(u: AuthenticatedUser, dto: CrmLeadDto) {
    if (u.role === 'seller' && dto.assignedSellerId && dto.assignedSellerId !== u.userId) throw new ForbiddenException('Você pode criar leads somente para si');
    const assignedSellerId = u.role === 'seller' ? u.userId : dto.assignedSellerId;
    const id = await this.prisma.$transaction(async tx => {
      await this.relations(tx, u, dto);
      let customerId = dto.customerId;
      if (!customerId) {
        if (!dto.customerName?.trim() || dto.customerName.trim().length < 2) throw new BadRequestException('Informe um cliente ou nome válido');
        const phone = (dto.customerPhone ?? '').replace(/\D/g,''), email = (dto.customerEmail ?? '').trim().toLowerCase();
        if (phone && (phone.length < 10 || phone.length > 13)) throw new BadRequestException('Telefone inválido, informe com DDD');
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${u.dealershipId + ':' + (phone || email || dto.customerName)}))`;
        const matches = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM customers WHERE dealership_id = ${u.dealershipId}
          AND ((${phone} <> '' AND regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = ${phone}) OR (${email} <> '' AND lower(trim(coalesce(email,''))) = ${email})) LIMIT 2`;
        if (matches.length > 1) throw new ConflictException('Telefone/e-mail correspondem a mais de um cliente. Selecione um cliente existente.');
        if (matches.length) customerId = matches[0].id;
        else customerId = (await tx.customer.create({ data: { dealershipId: u.dealershipId, createdById: u.userId, name: dto.customerName.trim(), phone: phone || null, email: email || null, howMet: dto.source ?? 'outro' } })).id;
      }
      const stage = dto.stage ?? 'new';
      if (stage === 'lost' && !dto.lostReason?.trim()) throw new BadRequestException('Informe o motivo da perda');
      const lead = await tx.lead.create({ data: {
        dealershipId: u.dealershipId, customerId, assignedSellerId, vehicleId: dto.vehicleId,
        source: dto.source ?? 'outro', stage, temperature: dto.temperature, budget: dto.budget,
        paymentIntent: dto.paymentIntent, notes: clean(dto.notes), tags: dto.tags ?? [],
        nextActionDate: !['won','lost'].includes(stage) && dto.nextActionDate ? new Date(dto.nextActionDate) : null, nextActionNote: ['won','lost'].includes(stage)?null:dto.nextActionNote,
        lostReason: stage === 'lost' ? clean(dto.lostReason) : null, closedAt: ['won','lost'].includes(stage) ? new Date() : null,
      } });
      await this.event(tx, u, lead.id, 'created', 'Lead criado');
      await this.followup(tx, u, lead);
      return lead.id;
    });
    return this.detail(u, id);
  }
  async detail(u: AuthenticatedUser, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { ...this.scope(u), id }, include: {
      ...LEAD_INCLUDE,
      sale: { select: { id: true, contractNumber: true, price: true, soldAt: true } },
      chatConversations: { orderBy: { updatedAt: 'desc' }, select: { id: true, mode: true, updatedAt: true } },
    } });
    if (!lead) throw new NotFoundException('Lead não encontrado');
    return lead;
  }
  async update(u: AuthenticatedUser, id: string, dto: CrmLeadDto) {
    await this.prisma.$transaction(async tx => {
      const lead = await this.locked(tx,u,id);
      if (lead.archivedAt) throw new ConflictException('Restaure o lead antes de editar');
      if (u.role === 'seller' && dto.assignedSellerId !== undefined && dto.assignedSellerId !== lead.assignedSellerId) throw new ForbiddenException('Somente gestores podem reatribuir leads');
      await this.relations(tx,u,dto);
      const data = this.fields(dto);
      const stage = dto.stage ?? lead.stage;
      const lossReason=dto.lostReason!==undefined?dto.lostReason:lead.lostReason;
      if (lead.saleId && stage !== 'won') throw new ConflictException('Lead vinculado a venda deve permanecer ganho');
      if (stage === 'lost' && !lossReason?.trim()) throw new BadRequestException('Informe o motivo da perda');
      if (dto.stage !== undefined) Object.assign(data, { stage, closedAt: ['won','lost'].includes(stage) ? (stage!==lead.stage?new Date():lead.closedAt??new Date()) : null,
        lostReason: stage === 'lost' ? clean(lossReason) : null });
      else if (dto.lostReason !== undefined) data.lostReason = stage === 'lost' ? clean(dto.lostReason) : null;
      if(['won','lost'].includes(stage)) Object.assign(data,{nextActionDate:null,nextActionNote:null});
      const updated = await tx.lead.update({ where: { id }, data });
      const changed = Object.keys(data).filter(key => JSON.stringify((lead as any)[key]) !== JSON.stringify((updated as any)[key]));
      if (changed.length) await this.event(tx,u,id, 'updated', 'Lead atualizado', { fields: changed });
      if (lead.stage !== updated.stage) await this.event(tx,u,id,'stage', `Etapa alterada: ${STAGE_NAMES[lead.stage]} → ${STAGE_NAMES[updated.stage]}`, { from: lead.stage, to: updated.stage, lostReason: updated.lostReason });
      if (lead.assignedSellerId !== updated.assignedSellerId) {
        await tx.crmTask.updateMany({ where: { leadId: id, status: 'open', assignedUserId: lead.assignedSellerId }, data: { assignedUserId: updated.assignedSellerId } });
        await tx.chatConversation.updateMany({ where: { leadId: id }, data: { assignedUserId: updated.assignedSellerId } });
        await this.event(tx,u,id,'assignment','Responsável alterado', { responsibleId: updated.assignedSellerId });
      }
      await this.followup(tx,u,updated);
      if(lead.stage!==updated.stage && ['won','lost'].includes(updated.stage)) {
        const canceled=await tx.crmTask.updateMany({where:{leadId:id,status:'open'},data:{status:'canceled'}});
        if(canceled.count) await this.event(tx,u,id,'tasks_canceled','Tarefas pendentes canceladas ao concluir o lead',{count:canceled.count});
      }
    });
    return this.detail(u,id);
  }
  private async followup(tx: Tx, u: AuthenticatedUser, lead: { id: string; stage: string; nextActionDate: Date | null; nextActionNote: string | null; assignedSellerId: string | null }) {
    const task = await tx.crmTask.findFirst({ where: { leadId: lead.id, autoFollowup: true, status: 'open' } });
    if (!lead.nextActionDate || ['won','lost'].includes(lead.stage)) {
      if (task) await tx.crmTask.update({ where: { id: task.id }, data: { status: 'canceled' } });
      return;
    }
    const data = { title: lead.nextActionNote?.trim() || 'Retornar ao cliente', dueAt: lead.nextActionDate, assignedUserId: lead.assignedSellerId };
    if (task) await tx.crmTask.update({ where: { id: task.id }, data });
    else await tx.crmTask.create({ data: { ...data, leadId: lead.id, dealershipId: u.dealershipId, createdById: u.userId, autoFollowup: true } });
  }
  async contact(u: AuthenticatedUser, id: string, dto: CrmContactDto) {
    if (dto.name.trim().length < 2) throw new BadRequestException('Nome inválido');
    const phone = dto.phone == null ? dto.phone : dto.phone.replace(/\D/g,'');
    if (phone && (phone.length < 10 || phone.length > 13)) throw new BadRequestException('Telefone inválido');
    await this.prisma.$transaction(async tx => {
      const lead = await this.locked(tx,u,id);
      if(lead.archivedAt) throw new ConflictException('Lead arquivado');
      if (!lead.customerId) throw new BadRequestException('Lead sem cliente');
      const match = await tx.customer.findFirst({ where: { id: lead.customerId, dealershipId: u.dealershipId }, select: { id: true } });
      if (!match) throw new NotFoundException('Cliente não encontrado');
      await tx.customer.update({ where: { id: lead.customerId }, data: { name: dto.name.trim(), phone, email: dto.email === undefined ? undefined : dto.email?.trim().toLowerCase() ?? null } });
      await this.event(tx,u,id,'contact_updated','Dados de contato atualizados');
    });
    return this.detail(u,id);
  }
  async archive(u: AuthenticatedUser, id: string, archived: boolean) {
    this.manager(u);
    await this.prisma.$transaction(async tx => {
      const lead = await this.locked(tx,u,id);
      if (!!lead.archivedAt === archived) return;
      await tx.lead.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
      await this.event(tx,u,id,archived ? 'archived' : 'restored',archived ? 'Lead arquivado' : 'Lead restaurado');
    });
    return this.detail(u,id);
  }
  async activity(u: AuthenticatedUser, id: string, dto: CrmActivityDto) {
    if (!dto.content.trim()) throw new BadRequestException('Informe o registro');
    await this.prisma.$transaction(async tx => {
      const lead = await this.locked(tx,u,id);
      if (lead.archivedAt) throw new ConflictException('Lead arquivado');
      const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
      if (occurredAt > new Date(Date.now()+60000)) throw new BadRequestException('Um contato realizado não pode estar no futuro');
      await tx.crmActivity.create({ data: { dealershipId: u.dealershipId, leadId: id, userId: u.userId, kind: dto.kind, content: dto.content.trim(), occurredAt } });
      if (dto.kind !== 'note') await tx.lead.update({ where: { id }, data: { lastContactAt: !lead.lastContactAt || occurredAt > lead.lastContactAt ? occurredAt : lead.lastContactAt } });
      await tx.auditLog.create({ data: { dealershipId: u.dealershipId, userId: u.userId, action: 'crm_contact', entity: 'lead', entityId: id } });
    });
    return this.detail(u,id);
  }
  async history(u: AuthenticatedUser, id: string, page = 1) {
    await this.detail(u,id);
    const where = { leadId: id, dealershipId: u.dealershipId };
    const [items,total] = await this.prisma.$transaction([
      this.prisma.crmActivity.findMany({ where, orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }], skip: (page-1)*20, take: 20, include: { user: { select: { id: true, name: true } } } }),
      this.prisma.crmActivity.count({ where }),
    ]);
    return { items,total,page,pageSize:20 };
  }
  private taskScope(u: AuthenticatedUser): Prisma.CrmTaskWhereInput {
    return { dealershipId: u.dealershipId, lead: { ...this.scope(u), archivedAt: null }, ...(u.role==='seller'?{assignedUserId:u.userId}:{}) };
  }
  async tasks(u: AuthenticatedUser, q: CrmTaskQueryDto) {
    const where: Prisma.CrmTaskWhereInput = this.taskScope(u);
    if(q.status) where.status=q.status;
    if(q.leadId) { await this.detail(u,q.leadId); where.leadId=q.leadId; }
    if(q.assignedUserId && u.role!=='seller') where.assignedUserId=q.assignedUserId;
    const now=new Date();
    if(q.period==='overdue') where.dueAt={lt:now};
    if(q.period==='upcoming') where.dueAt={gte:now};
    if(q.period==='today') {
      if(!q.dayStart || !q.dayEnd || new Date(q.dayEnd)<=new Date(q.dayStart) || new Date(q.dayEnd).getTime()-new Date(q.dayStart).getTime()>90000000) throw new BadRequestException('Informe um intervalo de dia válido');
      where.dueAt={gte:new Date(q.dayStart),lt:new Date(q.dayEnd)};
    }
    const page=q.page??1,pageSize=q.pageSize??30;
    const [items,total]=await this.prisma.$transaction([
      this.prisma.crmTask.findMany({where,include:TASK_INCLUDE,orderBy:[{dueAt:'asc'},{id:'asc'}],skip:(page-1)*pageSize,take:pageSize}),
      this.prisma.crmTask.count({where}),
    ]);
    return {items,total,page,pageSize};
  }
  async reminders(u: AuthenticatedUser) {
    const where: Prisma.CrmTaskWhereInput={...this.taskScope(u),status:'open',OR:[{dueAt:{lte:new Date()}},{remindAt:{lte:new Date()}}]};
    const [items,total]=await this.prisma.$transaction([
      this.prisma.crmTask.findMany({where,include:TASK_INCLUDE,orderBy:{dueAt:'asc'},take:10}),this.prisma.crmTask.count({where}),
    ]);
    return {items,total};
  }
  async saveTask(u: AuthenticatedUser, leadId: string, dto: CrmTaskDto, taskId?: string) {
    if(dto.title.trim().length<2) throw new BadRequestException('Título inválido');
    if(dto.remindAt && new Date(dto.remindAt)>new Date(dto.dueAt)) throw new BadRequestException('O lembrete deve ocorrer até o vencimento');
    const id=await this.prisma.$transaction(async tx=>{
      const lead=await this.locked(tx,u,leadId);
      if(lead.archivedAt || ['won','lost'].includes(lead.stage)) throw new ConflictException('Tarefas exigem um lead ativo');
      let old=null;
      if(taskId) {
        old=await tx.crmTask.findFirst({where:{id:taskId,leadId,...this.taskScope(u)}});
        if(!old) throw new NotFoundException('Tarefa não encontrada');
        if(old.status!=='open') throw new ConflictException('Reabra a tarefa para editar');
      }
      const assignedUserId=u.role==='seller'?u.userId:dto.assignedUserId===undefined?lead.assignedSellerId??u.userId:dto.assignedUserId;
      if(u.role==='seller' && dto.assignedUserId && dto.assignedUserId!==u.userId) throw new ForbiddenException('Você pode criar tarefas somente para si');
      if(assignedUserId) {
        const staff=await tx.user.findFirst({where:{id:assignedUserId,dealershipId:u.dealershipId,active:true},select:{role:true}});
        if(!staff) throw new NotFoundException('Responsável não encontrado');
        if(staff.role==='seller' && assignedUserId!==lead.assignedSellerId) throw new BadRequestException('A tarefa deve pertencer ao responsável pelo lead ou a um gestor');
      }
      const data={title:dto.title.trim(),notes:clean(dto.notes),dueAt:new Date(dto.dueAt),remindAt:dto.remindAt?new Date(dto.remindAt):null,assignedUserId,priority:dto.priority??'normal'};
      const task=old?await tx.crmTask.update({where:{id:old.id},data}):await tx.crmTask.create({data:{...data,dealershipId:u.dealershipId,leadId,createdById:u.userId}});
      if(old?.autoFollowup) await tx.lead.update({where:{id:leadId},data:{nextActionDate:task.dueAt,nextActionNote:task.title}});
      await this.event(tx,u,leadId,'task',old?'Tarefa atualizada':'Tarefa criada',{taskId:task.id,title:task.title});
      return task.id;
    });
    return this.prisma.crmTask.findUniqueOrThrow({where:{id},include:TASK_INCLUDE});
  }
  async taskStatus(u: AuthenticatedUser, id: string, status: string) {
    const old=await this.prisma.crmTask.findFirst({where:{id,...this.taskScope(u)}});
    if(!old) throw new NotFoundException('Tarefa não encontrada');
    await this.prisma.$transaction(async tx=>{
      const lead=await this.locked(tx,u,old.leadId);
      const task=await tx.crmTask.findFirst({where:{id,...this.taskScope(u)}});
      if(!task) throw new NotFoundException('Tarefa não encontrada');
      if(status==='open' && ['won','lost'].includes(lead.stage)) throw new ConflictException('Reabra o lead antes da tarefa');
      if(status==='open' && task.autoFollowup && task.status!=='open' && await tx.crmTask.findFirst({where:{leadId:lead.id,autoFollowup:true,status:'open',id:{not:id}},select:{id:true}})) throw new ConflictException('Já existe outra tarefa de retorno aberta');
      if(task.status===status) return;
      await tx.crmTask.update({where:{id},data:{status,completedAt:status==='done'?new Date():null}});
      if(task.autoFollowup) await tx.lead.update({where:{id:lead.id},data:{nextActionDate:status==='open'?task.dueAt:null,nextActionNote:status==='open'?task.title:null}});
      await this.event(tx,u,lead.id,'task_status',`Tarefa ${status==='done'?'concluída':status==='open'?'reaberta':'cancelada'}: ${task.title}`,{taskId:id,status});
    });
    return this.prisma.crmTask.findUniqueOrThrow({where:{id},include:TASK_INCLUDE});
  }
  async options(u: AuthenticatedUser, search='') {
    const text=search.trim().slice(0,100);
    const customerScope: Prisma.CustomerWhereInput = { dealershipId:u.dealershipId,
      ...(u.role==='seller'?{OR:[{createdById:u.userId},{leads:{some:{assignedSellerId:u.userId}}}]}:{}) };
    const [customers,vehicles,staff]=await this.prisma.$transaction([
      this.prisma.customer.findMany({where:{AND:[customerScope,text?{OR:[{name:{contains:text,mode:'insensitive'}},{phone:{contains:text}},{email:{contains:text,mode:'insensitive'}}]}:{}]},select:{id:true,name:true,phone:true,email:true},orderBy:{name:'asc'},take:30}),
      this.prisma.vehicle.findMany({where:{dealershipId:u.dealershipId,...(text?{OR:[{brand:{contains:text,mode:'insensitive'}},{model:{contains:text,mode:'insensitive'}}]}:{})},select:{id:true,brand:true,model:true,year:true,status:true},orderBy:{createdAt:'desc'},take:50}),
      this.prisma.user.findMany({where:{dealershipId:u.dealershipId,active:true,...(u.role==='seller'?{id:u.userId}:{})},select:{id:true,name:true,role:true},orderBy:{name:'asc'}}),
    ]);
    return {customers,vehicles,staff};
  }
  async eligibleSales(u: AuthenticatedUser,id:string) {
    const lead=await this.detail(u,id);
    if(!lead.customerId) return [];
    return this.prisma.sale.findMany({where:{dealershipId:u.dealershipId,customerId:lead.customerId,...(lead.vehicleId?{vehicleId:lead.vehicleId}:{}),...(u.role==='seller'?{sellerId:u.userId}:{}),crmLead:null},
      select:{id:true,contractNumber:true,price:true,soldAt:true,vehicle:{select:{brand:true,model:true,year:true}}},orderBy:{soldAt:'desc'},take:50});
  }
  async linkSale(u: AuthenticatedUser,id:string,saleId:string) {
    await this.prisma.$transaction(async tx=>{
      const lead=await this.locked(tx,u,id);
      if(lead.archivedAt) throw new ConflictException('Lead arquivado');
      const sale=await tx.sale.findFirst({where:{id:saleId,dealershipId:u.dealershipId,...(u.role==='seller'?{sellerId:u.userId}:{})}});
      if(!sale || sale.customerId!==lead.customerId || (lead.vehicleId && sale.vehicleId!==lead.vehicleId)) throw new BadRequestException('A venda deve ser do mesmo cliente e veículo');
      await tx.$queryRaw`SELECT id FROM sales WHERE id = ${saleId} FOR UPDATE`;
      const linked=await tx.lead.findFirst({where:{saleId,id:{not:id}},select:{id:true}});
      if(linked || (lead.saleId && lead.saleId!==saleId)) throw new ConflictException('Venda já vinculada');
      if(lead.saleId===saleId) return;
      const updated=await tx.lead.update({where:{id},data:{saleId,vehicleId:sale.vehicleId,stage:'won',closedAt:new Date(),lostReason:null,nextActionDate:null,nextActionNote:null}});
      await this.followup(tx,u,updated);
      await tx.crmTask.updateMany({where:{leadId:id,status:'open'},data:{status:'canceled'}});
      await this.event(tx,u,id,'sale','Venda existente vinculada e lead marcado como ganho',{saleId});
    });
    return this.detail(u,id);
  }
  async exportCsv(u: AuthenticatedUser,q:CrmQueryDto) {
    const where=this.where(u,q);
    const total=await this.prisma.lead.count({where});
    if(total>10000) throw new BadRequestException('A exportação aceita até 10.000 leads. Aplique filtros para reduzir o conjunto.');
    const items=await this.prisma.lead.findMany({where,include:LEAD_INCLUDE,orderBy:{createdAt:'desc'},take:10000});
    const escape=(value:unknown)=>{
      let text=value==null?'':String(value);
      if(/^[\s]*[=+@-]/.test(text)) text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const rows=[['Cliente','Telefone','E-mail','Veículo','Etapa','Temperatura','Origem','Responsável','Orçamento','Criado em','Último contato','Motivo da perda'],
      ...items.map(l=>[l.customer?.name,l.customer?.phone,l.customer?.email,l.vehicle?`${l.vehicle.brand} ${l.vehicle.model} ${l.vehicle.year}`:'',l.stage,l.temperature,l.source,l.assignedSeller?.name,l.budget?.toString(),l.createdAt.toISOString(),l.lastContactAt?.toISOString(),l.lostReason])];
    return {filename:`crm-${new Date().toISOString().slice(0,10)}.csv`,rows:items.length,content:'\uFEFF'+rows.map(r=>r.map(escape).join(';')).join('\r\n')};
  }
}
