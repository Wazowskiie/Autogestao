import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

/**
 * O que o vendedor NÃO pode ver: custo de compra, lucro, margem e despesas.
 * Estas funções tiram esses dados da resposta antes de ela sair do servidor
 * (esconder só na tela não protege: os dados ainda chegariam ao navegador).
 */
export const isSeller = (u?: AuthenticatedUser | null) => u?.role === 'seller';

/** Veículo sem o custo de compra */
export function vehicleForSeller<T>(vehicle: T): T {
  if (!vehicle || typeof vehicle !== 'object') return vehicle;
  return { ...vehicle, cost: null };
}

/** Venda sem custo, lucro, margem, despesas e retorno do banco. A comissão do próprio vendedor fica. */
export function saleForSeller<T>(sale: T): T {
  if (!sale || typeof sale !== 'object') return sale;
  const s = sale as Record<string, unknown>;
  return {
    ...s,
    cost: null,
    profit: null,
    margin: null,
    ...(Array.isArray(s.expenses) ? { expenses: [] } : {}),
    ...(s.vehicle ? { vehicle: vehicleForSeller(s.vehicle) } : {}),
    ...(Array.isArray(s.payments)
      ? { payments: s.payments.map((p) => ({ ...(p as object), returnAmount: null })) }
      : {}),
  } as T;
}
