/**
 * Tabela dos planos do AutoGestão.
 * Para mudar preço, limite ou o que cada plano libera, é só editar aqui:
 * quando o backend liga, ele atualiza a tabela "plans" do banco sozinho.
 */

export type PlanFeature =
  | 'crm'          // CRM de leads (funil, tarefas, histórico)
  | 'chat'         // Atendimentos: chat com clientes no site + caixa de entrada
  | 'nfe'          // Emissão de nota fiscal (Focus NFe)
  | 'renave'       // Integração RENAVE
  | 'assistant'    // Assistente de IA
  | 'priority_support';

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  crm: 'CRM de leads',
  chat: 'Atendimentos (chat com clientes)',
  nfe: 'Nota fiscal (NF-e)',
  renave: 'RENAVE',
  assistant: 'Assistente de IA',
  priority_support: 'Suporte prioritário',
};

/** Use este número para "ilimitado" */
export const UNLIMITED = 99999;

export interface PlanSpec {
  id: string;
  name: string;
  description: string;
  price: number;           // mensal
  yearlyPrice: number;     // valor por mês no plano anual
  vehicleLimit: number;    // veículos em estoque (vendidos não contam)
  userLimit: number;       // usuários ativos (dono + vendedores)
  plateLookupsPerMonth: number;
  nfePerMonth: number;     // 0 = não emite
  assistantPerDay: number; // perguntas por dia para a loja toda; 0 = sem assistente
  features: PlanFeature[];
  highlight?: boolean;
  support: string;
}

export const PLAN_CATALOG: PlanSpec[] = [
  {
    id: 'plan-basico',
    name: 'Básico',
    description: 'Para quem está começando e quer organizar estoque e vendas.',
    price: 149,
    yearlyPrice: 124,
    vehicleLimit: 30,
    userLimit: 2,
    plateLookupsPerMonth: 30,
    nfePerMonth: 0,
    assistantPerDay: 0,
    features: [],
    support: 'Suporte por e-mail e chat',
  },
  {
    id: 'plan-profissional',
    name: 'Profissional',
    description: 'Para a loja que quer vender mais com CRM, chat e nota fiscal.',
    price: 299,
    yearlyPrice: 249,
    vehicleLimit: 100,
    userLimit: 5,
    plateLookupsPerMonth: 100,
    nfePerMonth: 30,
    assistantPerDay: 40,
    features: ['crm', 'chat', 'nfe', 'renave', 'assistant'],
    highlight: true,
    support: 'Suporte por WhatsApp em horário comercial',
  },
  {
    id: 'plan-premium',
    name: 'Premium',
    description: 'Para lojas grandes: tudo liberado e atendimento prioritário.',
    price: 499,
    yearlyPrice: 415,
    vehicleLimit: UNLIMITED,
    userLimit: 15,
    plateLookupsPerMonth: 300,
    nfePerMonth: 100,
    assistantPerDay: 150,
    features: ['crm', 'chat', 'nfe', 'renave', 'assistant', 'priority_support'],
    support: 'WhatsApp prioritário + implantação grátis',
  },
];

/** Plano usado no teste grátis de quem acabou de criar a conta */
export const TRIAL_PLAN_ID = 'plan-profissional';
export const TRIAL_DAYS = 30;

/** Acha o plano pelo id; se for um plano antigo do banco, tenta pelo nome */
export function findSpec(planId?: string | null, planName?: string | null): PlanSpec {
  const byId = PLAN_CATALOG.find((p) => p.id === planId);
  if (byId) return byId;
  const name = (planName ?? '').toLowerCase();
  return PLAN_CATALOG.find((p) => p.name.toLowerCase() === name) ?? PLAN_CATALOG[0];
}

/** Lista de "o que tem" para mostrar no cartão do plano */
export function planHighlights(p: PlanSpec): string[] {
  const n = (v: number) => (v >= UNLIMITED ? 'ilimitados' : `até ${v}`);
  return [
    `Veículos em estoque: ${n(p.vehicleLimit)}`,
    `${p.userLimit} ${p.userLimit === 1 ? 'usuário' : 'usuários'}`,
    'Estoque, painel do veículo, fotos e arquivos',
    'Vendas com troca e várias formas de pagamento',
    'Promissórias com tabela de juros',
    'Financeiro, clientes, peças e site da loja',
    `Consulta de placa: ${p.plateLookupsPerMonth} por mês`,
    ...(p.features.includes('crm') ? ['CRM de leads completo'] : []),
    ...(p.features.includes('chat') ? ['Chat com clientes no site'] : []),
    ...(p.nfePerMonth > 0 ? [`Nota fiscal: ${p.nfePerMonth} notas por mês`] : []),
    ...(p.features.includes('renave') ? ['Integração RENAVE'] : []),
    ...(p.assistantPerDay > 0 ? [`Assistente de IA: ${p.assistantPerDay} perguntas por dia`] : []),
    p.support,
  ];
}
