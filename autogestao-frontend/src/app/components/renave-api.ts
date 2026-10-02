import { request } from '../../lib/api';

export type RenavePartner = 'Renave Fácil' | 'InfoSimples' | 'SERPRO Direto';

// draft = salvo, ainda não pediu liberação
// requested = e-mail enviado, aguardando o parceiro liberar
// active = integração liberada
export type RenaveStatus = 'draft' | 'requested' | 'active';

export interface RenaveCompanyData {
  cnpj: string;
  legalName: string;
  tradeName: string;
  responsibleName: string;
  mobile: string;
  phone: string;
  email: string;
  city: string;
  uf: string;
}

export interface RenaveConfig {
  partner: RenavePartner;
  isExistingClient: boolean;
  active: boolean;
  status: RenaveStatus;
  requestedAt: string | null;
  cnpj: string | null;
  legalName: string | null;
  tradeName: string | null;
  responsibleName: string | null;
  mobile: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  uf: string | null;
}

export interface RenaveState {
  config: RenaveConfig | null;
  signupUrl: string | null; // link de cadastro de parceiro do Renave Fácil
}

export interface SaveRenaveConfigPayload extends Partial<RenaveCompanyData> {
  partner: RenavePartner;
  isExistingClient: boolean;
}

export function getRenaveState() {
  return request<RenaveState>('/renave');
}

export function saveRenaveConfig(payload: SaveRenaveConfigPayload) {
  return request<RenaveConfig>('/renave', { method: 'POST', body: payload });
}

export function requestRenaveActivation(payload: SaveRenaveConfigPayload) {
  return request<RenaveConfig>('/renave/request-activation', { method: 'POST', body: payload });
}