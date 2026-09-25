import { request, ApiError } from '../../lib/api';

export type RenavePartner = 'Renave Fácil' | 'InfoSimples' | 'SERPRO Direto';

export interface RenaveConfig {
  partner: RenavePartner;
  isExistingClient: boolean;
  active: boolean;
}

export interface SaveRenaveConfigPayload {
  partner: RenavePartner;
  isExistingClient: boolean;
}

export async function getRenaveConfig(): Promise<RenaveConfig | null> {
  try {
    return await request<RenaveConfig | null>('/renave');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function saveRenaveConfig(payload: SaveRenaveConfigPayload) {
  return request<RenaveConfig>('/renave', { method: 'POST', body: payload });
}