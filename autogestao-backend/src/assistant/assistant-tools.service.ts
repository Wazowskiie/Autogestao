import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { VehicleDetailsService } from '../vehicle-details/vehicle-details.service';
import type { LlmTool } from './assistant-llm.service';

type Args = Record<string, any>;
const isManager = (u: AuthenticatedUser) => u.role === 'owner' || u.role === 'admin';
const n = (v: unknown) => Number(v ?? 0);
const brl = (v: unknown) => n(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBR = (d?: Date | null) => (d ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null);
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const limitOf = (v: unknown, def = 15, max = 30) => Math.min(Math.max(Math.floor(n(v)) || def, 1), max);

/** "AAAA-MM" do mês atual no horário de Brasília */
export function currentMonthBR() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
}
function monthRange(month?: string) {
  const m = /^\d{4}-\d{2}$/.test(month ?? '') ? month! : currentMonthBR();
  const [y, mm] = m.split('-').map(Number);
  return { month: m, range: { gte: new Date(Date.UTC(y, mm - 1, 1, 3)), lt: new Date(Date.UTC(y, mm, 1, 3)) } };
}
function todayRangeBR() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const start = new Date(`${today}T03:00:00.000Z`); // 00:00 em Brasília
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

const TYPE_LABEL: Record<string, string> = { car: 'Carro', moto: 'Moto', truck: 'Utilitário', other: 'Outros' };
const STATUS_LABEL: Record<string, string> = { available: 'Disponível', reserved: 'Reservado', sold: 'Vendido' };
const STAGE_LABEL: Record<string, string> = { new: 'Novo', contacted: 'Em contato', negotiating: 'Negociação', won: 'Ganho', lost: 'Perdido' };
const PAYMENT_NAMES: Record<string, string> = {
  pix: 'PIX', cash: 'Dinheiro', transfer: 'Transferência', card_credit: 'Cartão de crédito', card_debit: 'Cartão de débito',
  financing: 'Financiamento', consortium: 'Consórcio', promissory: 'Promissórias', card: 'Cartão', mixed: 'Várias formas',
};

/** Ação que a assistente quer fazer e que precisa da confirmação de quem está usando */
export interface ProposedAction {
  tool: string;
  input: Args;
  summary: string; // texto que aparece no cartão de confirmação
}

// ---------------------------------------------------------------------------
// Ferramentas que a IA pode usar. As de consulta rodam na hora; as de ação só
// preparam um pedido de confirmação (quem executa é a pessoa, clicando em Confirmar).
// ---------------------------------------------------------------------------
export const READ_TOOLS: LlmTool[] = [
  {
    name: 'visao_geral',
    description:
      'Números gerais da loja inteira: quantos clientes (total, novos no mês, que já compraram), veículos por situação e tipo, vendas do mês e do total, leads em aberto por etapa, promissórias, peças e usuários. Use para perguntas como "quantos clientes eu tenho?", "quantas motos tenho no estoque?" ou "como está a loja?".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'buscar_veiculos',
    description:
      'Procura veículos no estoque da loja. Use para perguntas sobre o estoque, veículos parados, disponíveis, vendidos ou para achar o id de um veículo antes de outra ação. Retorna nome, ano, placa, km, preço, status, dias em estoque e o id.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Marca, modelo, versão ou placa. Opcional.' },
        status: { type: 'string', enum: ['available', 'reserved', 'sold'], description: 'available = disponível, reserved = reservado, sold = vendido.' },
        tipo: { type: 'string', enum: ['car', 'moto', 'truck', 'other'] },
        parado_ha_dias_min: { type: 'integer', description: 'Só veículos com pelo menos esse número de dias em estoque.' },
        limite: { type: 'integer', description: 'Quantidade máxima (padrão 15, máximo 30).' },
      },
    },
  },
  {
    name: 'detalhes_veiculo',
    description:
      'Traz todos os dados de um veículo: cadastro, opcionais, observações, pendências abertas, fotos e (para gestores) custo, gastos e lucro previsto. Use antes de escrever anúncio ou responder sobre um veículo específico.',
    input_schema: { type: 'object', properties: { veiculo_id: { type: 'string' } }, required: ['veiculo_id'] },
  },
  {
    name: 'resumo_vendas',
    description:
      'Resumo das vendas de um mês: quantidade, faturamento, lucro (só gestores), quanto entrou por forma de pagamento e a lista de vendas. Vendedores só veem as próprias vendas.',
    input_schema: { type: 'object', properties: { mes: { type: 'string', description: 'Formato AAAA-MM. Se não informar, usa o mês atual.' } } },
  },
  {
    name: 'resumo_financeiro',
    description:
      'Financeiro do mês (só gestores): receitas e despesas pagas e pendentes, saldo e as maiores categorias. Use para perguntas de caixa, saldo, despesas e fechamento do mês.',
    input_schema: { type: 'object', properties: { mes: { type: 'string', description: 'Formato AAAA-MM. Padrão: mês atual.' } } },
  },
  {
    name: 'promissorias',
    description: 'Lista notas promissórias vencidas ou a vencer, com cliente, telefone, valor e vencimento (só gestores).',
    input_schema: {
      type: 'object',
      properties: {
        situacao: { type: 'string', enum: ['vencidas', 'a_vencer'] },
        dias: { type: 'integer', description: 'Para a_vencer: quantos dias à frente olhar (padrão 7).' },
      },
      required: ['situacao'],
    },
  },
  {
    name: 'tarefas_crm',
    description: 'Tarefas do CRM (ligar, retornar, visita...). Vendedores veem só as próprias. Use para "o que tenho pra fazer hoje".',
    input_schema: {
      type: 'object',
      properties: { periodo: { type: 'string', enum: ['hoje', 'vencidas', 'proximas'] } },
      required: ['periodo'],
    },
  },
  {
    name: 'buscar_leads',
    description: 'Procura leads (oportunidades) no CRM por nome, telefone, veículo ou etapa. Retorna o id, cliente, etapa, veículo de interesse e próximo contato.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        etapa: { type: 'string', enum: ['new', 'contacted', 'negotiating', 'won', 'lost'] },
      },
    },
  },
  {
    name: 'buscar_clientes',
    description:
      'Lista ou procura clientes. Sem texto, lista os mais recentes. Com texto, procura por nome, telefone ou e-mail. Sempre devolve o total de clientes encontrados, além dos dados de contato e de quantas compras cada um fez.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Nome, telefone ou e-mail (opcional).' },
        so_quem_comprou: { type: 'boolean', description: 'Só clientes com pelo menos uma compra.' },
        sem_compra: { type: 'boolean', description: 'Só clientes que ainda não compraram.' },
        limite: { type: 'integer', description: 'Quantos mostrar (padrão 15, máximo 30).' },
      },
    },
  },
  {
    name: 'buscar_pecas',
    description: 'Procura peças no estoque de peças por nome, código ou categoria, ou lista as que estão com estoque baixo.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        estoque_ate: { type: 'integer', description: 'Só peças com quantidade menor ou igual a esse número.' },
      },
    },
  },
];

export const ACTION_TOOLS: LlmTool[] = [
  {
    name: 'criar_lead',
    description:
      'PREPARA a criação de um lead no CRM. Não cria na hora: a pessoa vai ver um cartão e confirmar. Antes, use buscar_veiculos se ela citar um veículo, para mandar o veiculo_id.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string' },
        telefone: { type: 'string' },
        veiculo_id: { type: 'string' },
        temperatura: { type: 'string', enum: ['hot', 'warm', 'cold'] },
        origem: { type: 'string', enum: ['whatsapp', 'instagram', 'site', 'indicacao', 'olx', 'webmotors', 'presencial', 'outro'] },
        observacoes: { type: 'string' },
      },
      required: ['nome'],
    },
  },
  {
    name: 'criar_tarefa_crm',
    description: 'PREPARA uma tarefa (lembrete) num lead do CRM, com data e hora. Precisa do lead_id (use buscar_leads antes).',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        titulo: { type: 'string' },
        vencimento: { type: 'string', description: 'Data e hora em ISO 8601 com fuso de Brasília, ex.: 2026-10-17T10:00:00-03:00' },
        prioridade: { type: 'string', enum: ['low', 'normal', 'high'] },
      },
      required: ['lead_id', 'titulo', 'vencimento'],
    },
  },
  {
    name: 'registrar_contato',
    description: 'PREPARA o registro de um contato feito com o cliente de um lead (ligação, WhatsApp, e-mail, visita ou anotação).',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        tipo: { type: 'string', enum: ['call', 'whatsapp', 'email', 'visit', 'note'] },
        resumo: { type: 'string' },
      },
      required: ['lead_id', 'tipo', 'resumo'],
    },
  },
  {
    name: 'mudar_etapa_lead',
    description: 'PREPARA a mudança de etapa de um lead no funil. Para "lost" (perdido) é obrigatório informar o motivo.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        etapa: { type: 'string', enum: ['new', 'contacted', 'negotiating', 'won', 'lost'] },
        motivo_perda: { type: 'string' },
      },
      required: ['lead_id', 'etapa'],
    },
  },
  {
    name: 'adicionar_pendencia',
    description: 'PREPARA uma pendência no veículo (ex.: trocar óleo, buscar 2ª via do documento).',
    input_schema: {
      type: 'object',
      properties: { veiculo_id: { type: 'string' }, descricao: { type: 'string' } },
      required: ['veiculo_id', 'descricao'],
    },
  },
  {
    name: 'concluir_pendencia',
    description: 'PREPARA marcar uma pendência do veículo como resolvida. Pegue o pendencia_id em detalhes_veiculo.',
    input_schema: {
      type: 'object',
      properties: { veiculo_id: { type: 'string' }, pendencia_id: { type: 'string' } },
      required: ['veiculo_id', 'pendencia_id'],
    },
  },
  {
    name: 'lancar_despesa_veiculo',
    description: 'PREPARA uma despesa num veículo (ex.: pneus, polimento) na aba Lançamentos, que também entra no Financeiro. Só gestores.',
    input_schema: {
      type: 'object',
      properties: {
        veiculo_id: { type: 'string' },
        descricao: { type: 'string' },
        valor: { type: 'number' },
        fornecedor: { type: 'string' },
        somar_ao_custo: { type: 'boolean', description: 'Padrão: sim' },
        pago: { type: 'boolean', description: 'Padrão: não (fica pendente)' },
      },
      required: ['veiculo_id', 'descricao', 'valor'],
    },
  },
  {
    name: 'alterar_preco_veiculo',
    description: 'PREPARA a troca do preço de venda de um veículo. Só gestores.',
    input_schema: {
      type: 'object',
      properties: { veiculo_id: { type: 'string' }, novo_preco: { type: 'number' } },
      required: ['veiculo_id', 'novo_preco'],
    },
  },
];

export const ACTION_NAMES = new Set(ACTION_TOOLS.map((t) => t.name));

@Injectable()
export class AssistantToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly details: VehicleDetailsService,
  ) {}

  // =================== Consultas ===================

  async runRead(u: AuthenticatedUser, name: string, a: Args): Promise<unknown> {
    switch (name) {
      case 'buscar_veiculos': return this.searchVehicles(u, a);
      case 'detalhes_veiculo': return this.vehicleDetails(u, str(a.veiculo_id, 60));
      case 'resumo_vendas': return this.salesSummary(u, a.mes);
      case 'resumo_financeiro': return this.financialSummary(u, a.mes);
      case 'promissorias': return this.promissory(u, a);
      case 'tarefas_crm': return this.crmTasks(u, a.periodo);
      case 'buscar_leads': return this.searchLeads(u, a);
      case 'visao_geral': return this.overview(u);
      case 'buscar_clientes': return this.searchCustomers(u, a);
      case 'buscar_pecas': return this.searchParts(u, a);
      default: throw new BadRequestException(`Ferramenta desconhecida: ${name}`);
    }
  }

  private needManager(u: AuthenticatedUser, what: string) {
    if (!isManager(u)) throw new ForbiddenException(`Só o dono ou o administrador pode ver ${what}.`);
  }

  private async vehicle(u: AuthenticatedUser, id: string) {
    const v = id ? await this.prisma.vehicle.findFirst({ where: { id, dealershipId: u.dealershipId } }) : null;
    if (!v) throw new NotFoundException('Veículo não encontrado. Use buscar_veiculos para achar o id certo.');
    return v;
  }

  private vehicleName(v: { brand: string; model: string; version?: string | null; year: number; plate?: string | null }) {
    return [v.brand, v.model, v.version, v.year].filter(Boolean).join(' ') + (v.plate ? ` (${v.plate})` : '');
  }

  private async searchVehicles(u: AuthenticatedUser, a: Args) {
    const text = str(a.texto, 60);
    const where: Prisma.VehicleWhereInput = { dealershipId: u.dealershipId };
    if (['available', 'reserved', 'sold'].includes(a.status)) where.status = a.status;
    if (['car', 'moto', 'truck', 'other'].includes(a.tipo)) where.type = a.tipo;
    if (n(a.parado_ha_dias_min) > 0) where.createdAt = { lte: new Date(Date.now() - n(a.parado_ha_dias_min) * 86_400_000) };
    if (text) {
      const plate = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
      where.OR = [
        { brand: { contains: text, mode: 'insensitive' } },
        { model: { contains: text, mode: 'insensitive' } },
        { version: { contains: text, mode: 'insensitive' } },
        ...(plate ? [{ plate: { contains: plate } }] : []),
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({ where, orderBy: { createdAt: 'asc' }, take: limitOf(a.limite) }),
      this.prisma.vehicle.count({ where }),
    ]);
    return {
      total,
      mostrando: items.length,
      veiculos: items.map((v) => ({
        id: v.id,
        veiculo: this.vehicleName(v),
        tipo: TYPE_LABEL[v.type] ?? v.type,
        status: STATUS_LABEL[v.status] ?? v.status,
        km: v.km,
        cor: v.color,
        preco: brl(v.price),
        ...(isManager(u) ? { custo: brl(v.cost) } : {}),
        dias_em_estoque: Math.floor((Date.now() - v.createdAt.getTime()) / 86_400_000),
      })),
    };
  }

  private async vehicleDetails(u: AuthenticatedUser, id: string) {
    const v = await this.vehicle(u, id);
    const [pendencies, photos, web] = await Promise.all([
      this.prisma.vehiclePendency.findMany({ where: { vehicleId: v.id, done: false }, orderBy: { createdAt: 'asc' } }),
      this.prisma.vehiclePhoto.count({ where: { vehicleId: v.id } }),
      this.prisma.vehicleWeb.findUnique({ where: { vehicleId: v.id } }),
    ]);
    const summary = isManager(u) ? await this.details.summary(u.dealershipId, v.id) : null;
    return {
      id: v.id,
      veiculo: this.vehicleName(v),
      tipo: v.type === 'other' && v.category ? `Outros (${v.category})` : TYPE_LABEL[v.type],
      status: STATUS_LABEL[v.status],
      ano_fabricacao: v.manufactureYear,
      ano_modelo: v.year,
      km: v.km,
      cor: v.color,
      combustivel: v.fuel,
      cambio: v.transmission,
      portas: v.doors,
      cilindrada: v.engineCc,
      procedencia: v.origin,
      donos: v.ownerCount,
      ipva_pago: v.ipvaPaid,
      // licenciamento, multas, Renajud, recall e devolução (ok = em dia / pending = com problema)
      situacao_documento: v.docStatus ?? 'não informada',
      chave_reserva: v.hasSpareKey,
      manual: v.hasManual,
      aceita_troca: v.acceptsTrade,
      opcionais: v.optionals,
      observacoes: v.description,
      preco: brl(v.price),
      fotos: photos,
      anuncio_web: web ? { titulo: web.title, preco_web: web.webPrice ? brl(web.webPrice) : null, descricao: web.description } : null,
      pendencias_abertas: pendencies.map((p) => ({ pendencia_id: p.id, descricao: p.description })),
      ...(summary
        ? {
            custo_compra: brl(summary.purchase),
            gastos_somados_ao_custo: brl(summary.addedToCost),
            custo_total: brl(summary.totalCost),
            lucro_previsto: brl(summary.profit),
            margem: `${summary.margin.toFixed(1)}%`,
            dias_em_estoque: summary.daysInStock,
          }
        : {}),
    };
  }

  private async salesSummary(u: AuthenticatedUser, mes?: string) {
    const { month, range } = monthRange(mes);
    const where: Prisma.SaleWhereInput = { dealershipId: u.dealershipId, status: 'active', soldAt: range, ...(isManager(u) ? {} : { sellerId: u.userId }) };
    const sales = await this.prisma.sale.findMany({
      where,
      orderBy: { soldAt: 'desc' },
      include: {
        vehicle: { select: { brand: true, model: true, year: true, plate: true } },
        customer: { select: { name: true } },
        seller: { select: { name: true } },
        payments: true,
        tradeIns: { select: { cost: true } },
      },
    });
    const byMethod: Record<string, number> = {};
    for (const s of sales) {
      if (s.payments.length) s.payments.forEach((p) => (byMethod[p.method] = (byMethod[p.method] ?? 0) + n(p.amount)));
      else if (s.paymentMethod) byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] ?? 0) + n(s.price) - n(s.tradeInValue);
      if (n(s.tradeInValue) > 0) byMethod.troca = (byMethod.troca ?? 0) + n(s.tradeInValue);
    }
    const revenue = sales.reduce((t, s) => t + n(s.price), 0);
    const profit = sales.reduce((t, s) => t + n(s.profit), 0);
    return {
      mes: month,
      ...(isManager(u) ? {} : { observacao: 'Somente as vendas deste vendedor.' }),
      quantidade: sales.length,
      faturamento: brl(revenue),
      ...(isManager(u) ? { lucro: brl(profit), margem_media: sales.length ? `${(sales.reduce((t, s) => t + n(s.margin), 0) / sales.length).toFixed(1)}%` : '0%' } : {}),
      por_forma_de_pagamento: Object.fromEntries(Object.entries(byMethod).map(([k, v]) => [k === 'troca' ? 'Veículo na troca' : PAYMENT_NAMES[k] ?? k, brl(v)])),
      vendas: sales.slice(0, 20).map((s) => ({
        contrato: s.contractNumber,
        data: dateBR(s.soldAt),
        veiculo: this.vehicleName(s.vehicle),
        cliente: s.customer.name,
        vendedor: s.seller.name,
        preco: brl(s.price),
        ...(isManager(u) ? { lucro: brl(s.profit) } : {}),
      })),
    };
  }

  private async financialSummary(u: AuthenticatedUser, mes?: string) {
    this.needManager(u, 'o financeiro');
    const { month, range } = monthRange(mes);
    const items = await this.prisma.financialTransaction.findMany({ where: { dealershipId: u.dealershipId, date: range } });
    const sum = (f: (t: (typeof items)[number]) => boolean) => items.filter(f).reduce((t, x) => t + n(x.amount), 0);
    const byCat: Record<string, number> = {};
    items.filter((t) => t.type === 'expense').forEach((t) => (byCat[t.category] = (byCat[t.category] ?? 0) + n(t.amount)));
    const revPaid = sum((t) => t.type === 'revenue' && t.paid);
    const expPaid = sum((t) => t.type === 'expense' && t.paid);
    return {
      mes: month,
      receitas_recebidas: brl(revPaid),
      receitas_a_receber: brl(sum((t) => t.type === 'revenue' && !t.paid)),
      despesas_pagas: brl(expPaid),
      despesas_a_pagar: brl(sum((t) => t.type === 'expense' && !t.paid)),
      saldo_do_que_ja_entrou_e_saiu: brl(revPaid - expPaid),
      maiores_despesas_por_categoria: Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c, v]) => ({ categoria: c, total: brl(v) })),
      lancamentos: items.length,
    };
  }

  private async promissory(u: AuthenticatedUser, a: Args) {
    this.needManager(u, 'as promissórias');
    const now = new Date();
    const overdue = a.situacao !== 'a_vencer';
    const days = Math.min(Math.max(Math.floor(n(a.dias)) || 7, 1), 90);
    const notes = await this.prisma.promissoryNote.findMany({
      where: {
        dealershipId: u.dealershipId,
        paid: false,
        dueDate: overdue ? { lt: now } : { gte: now, lt: new Date(now.getTime() + days * 86_400_000) },
      },
      orderBy: { dueDate: 'asc' },
      take: 40,
      include: { customer: { select: { name: true, phone: true } } },
    });
    return {
      situacao: overdue ? 'vencidas' : `a vencer nos próximos ${days} dias`,
      quantidade: notes.length,
      total: brl(notes.reduce((t, x) => t + n(x.amount), 0)),
      notas: notes.map((x) => ({
        cliente: x.customer.name,
        telefone: x.customer.phone,
        parcela: `${x.installmentNumber}/${x.totalInstallments}`,
        valor: brl(x.amount),
        vencimento: dateBR(x.dueDate),
        ...(overdue ? { dias_em_atraso: Math.floor((now.getTime() - x.dueDate.getTime()) / 86_400_000) } : {}),
      })),
    };
  }

  private async crmTasks(u: AuthenticatedUser, periodo?: string) {
    const { start, end } = todayRangeBR();
    const q: any = { status: 'open', page: 1, pageSize: 30 };
    if (periodo === 'vencidas') q.period = 'overdue';
    else if (periodo === 'proximas') q.period = 'upcoming';
    else Object.assign(q, { period: 'today', dayStart: start.toISOString(), dayEnd: end.toISOString() });
    const res = await this.crm.tasks(u, q);
    return {
      periodo: periodo ?? 'hoje',
      total: res.total,
      tarefas: res.items.map((t: any) => ({
        titulo: t.title,
        vencimento: t.dueAt ? new Date(t.dueAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : null,
        prioridade: t.priority,
        cliente: t.lead?.customer?.name,
        lead_id: t.lead?.id,
        responsavel: t.assignedUser?.name,
      })),
    };
  }

  private async searchLeads(u: AuthenticatedUser, a: Args) {
    const res = await this.crm.list(u, {
      search: str(a.texto, 80) || undefined,
      stage: ['new', 'contacted', 'negotiating', 'won', 'lost'].includes(a.etapa) ? a.etapa : undefined,
      page: 1,
      pageSize: 15,
    } as any);
    return {
      total: res.total,
      leads: res.items.map((l: any) => ({
        lead_id: l.id,
        cliente: l.customer?.name,
        telefone: l.customer?.phone,
        etapa: STAGE_LABEL[l.stage] ?? l.stage,
        temperatura: l.temperature,
        veiculo_interesse: l.vehicle ? `${l.vehicle.brand} ${l.vehicle.model}` : null,
        responsavel: l.assignedSeller?.name ?? null,
        proximo_contato: l.nextActionDate ? dateBR(new Date(l.nextActionDate)) : null,
        ultimo_contato: l.lastContactAt ? dateBR(new Date(l.lastContactAt)) : null,
      })),
    };
  }

  /** Clientes que o vendedor pode ver (dono/admin veem todos) */
  private customerScope(u: AuthenticatedUser): Prisma.CustomerWhereInput {
    return isManager(u)
      ? { dealershipId: u.dealershipId }
      : { dealershipId: u.dealershipId, OR: [{ createdById: u.userId }, { leads: { some: { assignedSellerId: u.userId } } }, { sales: { some: { sellerId: u.userId } } }] };
  }

  private async searchCustomers(u: AuthenticatedUser, a: Args) {
    const text = str(a.texto, 100);
    const digits = text.replace(/\D/g, '');
    const and: Prisma.CustomerWhereInput[] = [this.customerScope(u)];
    if (text) {
      and.push({
        OR: [
          { name: { contains: text, mode: 'insensitive' } },
          { email: { contains: text, mode: 'insensitive' } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        ],
      });
    }
    if (a.so_quem_comprou) and.push({ sales: { some: { status: 'active' } } });
    if (a.sem_compra) and.push({ sales: { none: { status: 'active' } } });
    const where: Prisma.CustomerWhereInput = { AND: and };
    const [total, items] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({ where, take: limitOf(a.limite), orderBy: { createdAt: 'desc' }, include: { _count: { select: { sales: true } } } }),
    ]);
    return {
      total,
      mostrando: items.length,
      ...(isManager(u) ? {} : { aviso: 'Como vendedor, você vê só os seus clientes.' }),
      clientes: items.map((c) => ({ nome: c.name, telefone: c.phone, email: c.email, compras: c._count.sales, cadastrado_em: dateBR(c.createdAt), observacoes: c.notes })),
    };
  }

  /** Números gerais da loja */
  private async overview(u: AuthenticatedUser) {
    const d = u.dealershipId;
    const manager = isManager(u);
    const { month, range } = monthRange();
    const customerWhere = this.customerScope(u);
    const saleWhere: Prisma.SaleWhereInput = { dealershipId: d, status: 'active', ...(manager ? {} : { sellerId: u.userId }) };
    const leadWhere: Prisma.LeadWhereInput = { dealershipId: d, archivedAt: null, stage: { notIn: ['won', 'lost'] }, ...(manager ? {} : { assignedSellerId: u.userId }) };

    const [
      customers, newCustomers, buyers, vehiclesByStatus, stockByType, stockValue,
      salesMonth, salesTotal, leadsByStage, openNotes, overdueNotes, parts, lowParts, users, sub,
    ] = await Promise.all([
      this.prisma.customer.count({ where: customerWhere }),
      this.prisma.customer.count({ where: { AND: [customerWhere, { createdAt: range }] } }),
      this.prisma.customer.count({ where: { AND: [customerWhere, { sales: { some: { status: 'active' } } }] } }),
      this.prisma.vehicle.groupBy({ by: ['status'], where: { dealershipId: d }, _count: { _all: true } }),
      this.prisma.vehicle.groupBy({ by: ['type'], where: { dealershipId: d, status: { not: 'sold' } }, _count: { _all: true } }),
      this.prisma.vehicle.aggregate({ where: { dealershipId: d, status: { not: 'sold' } }, _sum: { price: true, cost: true } }),
      this.prisma.sale.aggregate({ where: { ...saleWhere, soldAt: range }, _count: { _all: true }, _sum: { price: true, profit: true } }),
      this.prisma.sale.count({ where: saleWhere }),
      this.prisma.lead.groupBy({ by: ['stage'], where: leadWhere, _count: { _all: true } }),
      manager ? this.prisma.promissoryNote.findMany({ where: { dealershipId: d, paid: false }, select: { saleId: true, amount: true } }) : Promise.resolve([]),
      manager ? this.prisma.promissoryNote.aggregate({ where: { dealershipId: d, paid: false, dueDate: { lt: todayRangeBR().start } }, _count: { _all: true }, _sum: { amount: true } }) : Promise.resolve(null),
      this.prisma.part.count({ where: { dealershipId: d } }),
      this.prisma.part.count({ where: { dealershipId: d, stockQty: { lte: 2 } } }),
      this.prisma.user.groupBy({ by: ['role'], where: { dealershipId: d, active: true }, _count: { _all: true } }),
      this.prisma.subscription.findUnique({ where: { dealershipId: d }, select: { status: true, plan: { select: { name: true } } } }),
    ]);

    const count = <T extends { _count: { _all: number } }>(rows: T[], key: keyof T, value: string) => rows.find((r) => r[key] === value)?._count._all ?? 0;
    return {
      mes_de_referencia: month,
      clientes: {
        total: customers,
        novos_no_mes: newCustomers,
        ja_compraram: buyers,
        ainda_nao_compraram: customers - buyers,
        ...(manager ? {} : { aviso: 'Contagem só dos seus clientes (vendedor).' }),
      },
      veiculos: {
        disponiveis: count(vehiclesByStatus, 'status', 'available'),
        reservados: count(vehiclesByStatus, 'status', 'reserved'),
        vendidos: count(vehiclesByStatus, 'status', 'sold'),
        em_estoque_por_tipo: Object.fromEntries(stockByType.map((r) => [TYPE_LABEL[r.type] ?? r.type, r._count._all])),
        valor_do_estoque_preco_de_venda: brl(stockValue._sum.price),
        ...(manager ? { custo_do_estoque: brl(stockValue._sum.cost) } : {}),
      },
      vendas: {
        no_mes: salesMonth._count._all,
        faturamento_no_mes: brl(salesMonth._sum.price),
        ...(manager ? { lucro_no_mes: brl(salesMonth._sum.profit) } : {}),
        total_desde_o_inicio: salesTotal,
      },
      leads_em_aberto: Object.fromEntries(leadsByStage.map((r) => [STAGE_LABEL[r.stage] ?? r.stage, r._count._all])),
      ...(manager
        ? {
            promissorias: {
              em_aberto: new Set((openNotes as { saleId: string }[]).map((x) => x.saleId)).size,
              parcelas_em_aberto: openNotes.length,
              a_receber: brl((openNotes as { amount: unknown }[]).reduce((s, x) => s + n(x.amount), 0)),
              parcelas_atrasadas: overdueNotes?._count._all ?? 0,
              valor_atrasado: brl(overdueNotes?._sum.amount),
            },
          }
        : {}),
      pecas: { itens_cadastrados: parts, com_estoque_baixo_ate_2: lowParts },
      usuarios_ativos: {
        dono: count(users, 'role', 'owner'), administradores: count(users, 'role', 'admin'), vendedores: count(users, 'role', 'seller'),
      },
      plano: sub ? `${sub.plan.name} (${sub.status === 'trialing' ? 'teste grátis' : sub.status === 'active' ? 'ativo' : sub.status})` : null,
    };
  }

  private async searchParts(u: AuthenticatedUser, a: Args) {
    const text = str(a.texto, 60);
    const where: Prisma.PartWhereInput = { dealershipId: u.dealershipId };
    if (text) where.OR = [{ name: { contains: text, mode: 'insensitive' } }, { sku: { contains: text, mode: 'insensitive' } }, { category: { contains: text, mode: 'insensitive' } }];
    if (a.estoque_ate !== undefined && a.estoque_ate !== null) where.stockQty = { lte: Math.floor(n(a.estoque_ate)) };
    const items = await this.prisma.part.findMany({ where, orderBy: { stockQty: 'asc' }, take: 25 });
    return {
      pecas: items.map((p) => ({ nome: p.name, codigo: p.sku, categoria: p.category, quantidade: p.stockQty, preco: brl(p.price), ...(isManager(u) ? { custo: brl(p.cost) } : {}) })),
    };
  }

  // =================== Ações (preparar e executar) ===================

  /** Confere a ação e monta o texto do cartão de confirmação. Não muda nada no banco. */
  async prepare(u: AuthenticatedUser, name: string, a: Args): Promise<ProposedAction> {
    switch (name) {
      case 'criar_lead': {
        const nome = str(a.nome, 100);
        if (nome.length < 2) throw new BadRequestException('Informe o nome do cliente.');
        const v = a.veiculo_id ? await this.vehicle(u, str(a.veiculo_id, 60)) : null;
        const input = {
          nome, telefone: str(a.telefone, 30) || undefined, veiculo_id: v?.id,
          temperatura: ['hot', 'warm', 'cold'].includes(a.temperatura) ? a.temperatura : undefined,
          origem: ['whatsapp', 'instagram', 'site', 'indicacao', 'olx', 'webmotors', 'presencial', 'outro'].includes(a.origem) ? a.origem : undefined,
          observacoes: str(a.observacoes, 2000) || undefined,
        };
        return {
          tool: name, input,
          summary: [`Criar lead para **${nome}**`, input.telefone && `Telefone: ${input.telefone}`, v && `Interesse: ${this.vehicleName(v)}`, input.observacoes && `Obs.: ${input.observacoes}`].filter(Boolean).join('\n'),
        };
      }
      case 'criar_tarefa_crm': {
        const lead = await this.crm.detail(u, str(a.lead_id, 60)) as any;
        const due = new Date(str(a.vencimento, 40));
        if (Number.isNaN(due.getTime())) throw new BadRequestException('Data da tarefa inválida.');
        const titulo = str(a.titulo, 150);
        if (titulo.length < 2) throw new BadRequestException('Informe o título da tarefa.');
        const input = { lead_id: lead.id, titulo, vencimento: due.toISOString(), prioridade: ['low', 'normal', 'high'].includes(a.prioridade) ? a.prioridade : 'normal' };
        return {
          tool: name, input,
          summary: `Criar tarefa **${titulo}** para ${lead.customer?.name ?? 'o lead'}\nQuando: ${due.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}`,
        };
      }
      case 'registrar_contato': {
        const lead = await this.crm.detail(u, str(a.lead_id, 60)) as any;
        const tipos: Record<string, string> = { call: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', visit: 'Visita', note: 'Anotação' };
        if (!tipos[a.tipo]) throw new BadRequestException('Tipo de contato inválido.');
        const resumo = str(a.resumo, 4000);
        if (resumo.length < 2) throw new BadRequestException('Descreva o contato.');
        return { tool: name, input: { lead_id: lead.id, tipo: a.tipo, resumo }, summary: `Registrar ${tipos[a.tipo].toLowerCase()} com **${lead.customer?.name ?? 'o cliente'}**\n"${resumo}"` };
      }
      case 'mudar_etapa_lead': {
        const lead = await this.crm.detail(u, str(a.lead_id, 60)) as any;
        if (!STAGE_LABEL[a.etapa]) throw new BadRequestException('Etapa inválida.');
        const motivo = str(a.motivo_perda, 500);
        if (a.etapa === 'lost' && motivo.length < 3) throw new BadRequestException('Para marcar como perdido, informe o motivo.');
        return {
          tool: name, input: { lead_id: lead.id, etapa: a.etapa, motivo_perda: motivo || undefined },
          summary: `Mover **${lead.customer?.name ?? 'lead'}** de ${STAGE_LABEL[lead.stage]} para **${STAGE_LABEL[a.etapa]}**${motivo ? `\nMotivo: ${motivo}` : ''}`,
        };
      }
      case 'adicionar_pendencia': {
        const v = await this.vehicle(u, str(a.veiculo_id, 60));
        const descricao = str(a.descricao, 300);
        if (descricao.length < 2) throw new BadRequestException('Descreva a pendência.');
        return { tool: name, input: { veiculo_id: v.id, descricao }, summary: `Adicionar pendência em **${this.vehicleName(v)}**\n"${descricao}"` };
      }
      case 'concluir_pendencia': {
        const v = await this.vehicle(u, str(a.veiculo_id, 60));
        const p = await this.prisma.vehiclePendency.findFirst({ where: { id: str(a.pendencia_id, 60), vehicleId: v.id } });
        if (!p) throw new NotFoundException('Pendência não encontrada. Use detalhes_veiculo para ver as pendências.');
        return { tool: name, input: { veiculo_id: v.id, pendencia_id: p.id }, summary: `Marcar como resolvida em **${this.vehicleName(v)}**\n"${p.description}"` };
      }
      case 'lancar_despesa_veiculo': {
        this.needManager(u, 'e lançar despesas');
        const v = await this.vehicle(u, str(a.veiculo_id, 60));
        const valor = Math.round(n(a.valor) * 100) / 100;
        if (!(valor > 0)) throw new BadRequestException('Informe o valor da despesa.');
        const descricao = str(a.descricao, 300);
        if (descricao.length < 2) throw new BadRequestException('Descreva a despesa.');
        const input = { veiculo_id: v.id, descricao, valor, fornecedor: str(a.fornecedor, 120) || undefined, somar_ao_custo: a.somar_ao_custo !== false, pago: a.pago === true };
        return {
          tool: name, input,
          summary: `Lançar despesa de **${brl(valor)}** em **${this.vehicleName(v)}**\n${descricao}${input.fornecedor ? ` · ${input.fornecedor}` : ''}\n${input.somar_ao_custo ? 'Soma ao custo do veículo' : 'Não soma ao custo'} · ${input.pago ? 'Já paga' : 'Pendente'}`,
        };
      }
      case 'alterar_preco_veiculo': {
        this.needManager(u, 'e alterar preços');
        const v = await this.vehicle(u, str(a.veiculo_id, 60));
        const preco = Math.round(n(a.novo_preco) * 100) / 100;
        if (!(preco > 0)) throw new BadRequestException('Informe o novo preço.');
        return { tool: name, input: { veiculo_id: v.id, novo_preco: preco }, summary: `Mudar o preço de **${this.vehicleName(v)}**\nDe ${brl(v.price)} para **${brl(preco)}**` };
      }
      default:
        throw new BadRequestException(`Ação desconhecida: ${name}`);
    }
  }

  /** Executa a ação depois que a pessoa confirmou. Repete as checagens de permissão. */
  async execute(u: AuthenticatedUser, name: string, a: Args): Promise<string> {
    // Prepara de novo: garante que tudo ainda existe e que a pessoa ainda pode fazer isso
    const p = await this.prepare(u, name, a);
    const i = p.input;
    switch (name) {
      case 'criar_lead': {
        await this.crm.create(u, {
          customerName: i.nome, customerPhone: i.telefone, vehicleId: i.veiculo_id,
          temperature: i.temperatura, source: i.origem, notes: i.observacoes,
        } as any);
        return `Lead de ${i.nome} criado no CRM.`;
      }
      case 'criar_tarefa_crm':
        await this.crm.saveTask(u, i.lead_id, { title: i.titulo, dueAt: i.vencimento, priority: i.prioridade } as any);
        return `Tarefa "${i.titulo}" criada.`;
      case 'registrar_contato':
        await this.crm.activity(u, i.lead_id, { kind: i.tipo, content: i.resumo } as any);
        return 'Contato registrado no histórico do lead.';
      case 'mudar_etapa_lead':
        await this.crm.update(u, i.lead_id, { stage: i.etapa, ...(i.motivo_perda ? { lostReason: i.motivo_perda } : {}) } as any);
        return `Lead movido para ${STAGE_LABEL[i.etapa]}.`;
      case 'adicionar_pendencia':
        await this.details.createPendency(u.dealershipId, i.veiculo_id, { description: i.descricao });
        return 'Pendência adicionada ao veículo.';
      case 'concluir_pendencia':
        await this.details.updatePendency(u.dealershipId, i.veiculo_id, i.pendencia_id, { done: true });
        return 'Pendência marcada como resolvida.';
      case 'lancar_despesa_veiculo':
        await this.details.createExpense(u.dealershipId, i.veiculo_id, u.userId, {
          kind: 'expense', description: i.descricao, amount: i.valor, supplier: i.fornecedor,
          addToCost: i.somar_ao_custo, status: i.pago ? 'paid' : 'pending',
        });
        return `Despesa de ${brl(i.valor)} lançada no veículo.`;
      case 'alterar_preco_veiculo':
        await this.prisma.vehicle.update({ where: { id: i.veiculo_id }, data: { price: i.novo_preco } });
        return `Preço alterado para ${brl(i.novo_preco)}.`;
      default:
        throw new BadRequestException(`Ação desconhecida: ${name}`);
    }
  }
}
