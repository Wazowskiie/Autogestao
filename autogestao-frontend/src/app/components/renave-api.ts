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

// Ajuste para o client HTTP que vocês já usam (axios, etc.) se tiverem um central.
const API_BASE_URL = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3000/api/v1';

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('accessToken'); // troque pela chave/estratégia real que vocês usam
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getRenaveConfig(): Promise<RenaveConfig | null> {
  const res = await fetch(`${API_BASE_URL}/renave`, {
    headers: { ...authHeaders() },
    credentials: 'include',
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao carregar configuração do Renave');

  return res.json();
}

export async function saveRenaveConfig(payload: SaveRenaveConfigPayload): Promise<RenaveConfig> {
  const res = await fetch(`${API_BASE_URL}/renave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error('Falha ao salvar configuração do Renave');

  return res.json();
}