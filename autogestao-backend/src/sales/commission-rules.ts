/**
 * Comissão definida pela loja, igual para todos os vendedores.
 * Promissória: entrada a partir de promissoryHighMinDown% paga promissoryHigh; abaixo, promissoryLow
 * (a entrada mínima da loja continua bloqueando vendas abaixo do mínimo).
 */
export type CommissionRules = { cash: number; financing: number; promissoryHigh: number; promissoryHighMinDown: number; promissoryLow: number };
export function parseCommissionRules(v: unknown): CommissionRules | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const keys = ['cash', 'financing', 'promissoryHigh', 'promissoryHighMinDown', 'promissoryLow'] as const;
  if (!keys.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number))) return null;
  return Object.fromEntries(keys.map((k) => [k, r[k] as number])) as CommissionRules;
}
/** Percentual da comissão pela regra da loja. downPercent = entrada / preço × 100 (tudo que não é promissória) */
export function commissionRateByRules(rules: CommissionRules, kind: 'financing' | 'promissory' | 'cash', downPercent: number) {
  if (kind === 'financing') return rules.financing;
  if (kind === 'promissory') return downPercent + 1e-9 >= rules.promissoryHighMinDown ? rules.promissoryHigh : rules.promissoryLow;
  return rules.cash;
}

