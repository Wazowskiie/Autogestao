// Chamadas da tela de Configurações
import { request } from "./api";
import { upload } from "./vehicle-details-api";

export interface StoreInfo {
  name: string; slug: string; cnpj: string | null; phone: string | null;
  city: string | null; state: string | null;
  logoUrl: string | null; coverUrl: string | null; primaryColor: string | null;
  street: string | null; number: string | null; district: string | null; zip: string | null;
  minDownPaymentPercent: number | null;
  socialLinks?: SocialLinks;
}
export interface SocialLinks { whatsapp?: string | null; instagram?: string | null; facebook?: string | null; tiktok?: string | null; youtube?: string | null; website?: string | null }

export interface FiscalInfo {
  configured: boolean;
  ambiente: "homologacao" | "producao" | null;
  cnpj: string | null; inscricaoEstadual: string | null; regimeTributario: number | null;
  logradouro: string | null; numero: string | null; bairro: string | null;
  municipio: string | null; uf: string | null; cep: string | null;
}

export interface SettingsData {
  me: { id: string; name: string; email: string; role: "owner" | "admin" | "seller" };
  canEdit: boolean;
  dealership: StoreInfo;
  fiscal: FiscalInfo | null;
  integrations: {
    nfe: { configured: boolean; ambiente: string | null; enabled: boolean };
    renave: { partner: string | null; status: string; active: boolean } | null;
    assistant: { enabled: boolean; model: string };
    plateLookup: { enabled: boolean };
    chat: { provider: string };
  };
}

export interface InterestBand { id: string; minInstallments: number; maxInstallments: number; rate: number | string }
export interface BandInput { minInstallments: number; maxInstallments: number; rate: number }

export interface FiscalInput {
  token?: string; cnpj: string; ambiente: "homologacao" | "producao";
  inscricaoEstadual?: string; regimeTributario?: number;
  logradouro: string; numero: string; bairro: string; municipio: string; uf: string; cep: string;
}

export const getSettings = () => request<SettingsData>("/settings");

export const updateStore = (data: Partial<Omit<StoreInfo, "logoUrl" | "coverUrl" | "socialLinks">> & { socialLinks?: Record<string, string | null> }) =>
  request<SettingsData>("/settings/dealership", { method: "PATCH", body: data });

export function uploadStoreImage(kind: "logo" | "cover", file: File) {
  const form = new FormData();
  form.append("file", file);
  return upload<SettingsData>(`/settings/dealership/${kind}`, form);
}
export const removeStoreImage = (kind: "logo" | "cover") =>
  request<SettingsData>(`/settings/dealership/${kind}`, { method: "DELETE" });

export const updateMe = (name: string) => request<SettingsData>("/settings/me", { method: "PATCH", body: { name } });
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<{ ok: true }>("/settings/me/password", { method: "POST", body: { currentPassword, newPassword } });

export const updateFiscal = (data: FiscalInput) => request<SettingsData>("/settings/fiscal", { method: "PUT", body: data });

// A lista usa /interest-rates, que cria a tabela padrão na primeira vez
export const listBands = () => request<InterestBand[]>("/interest-rates");
export const createBand = (b: BandInput) => request<InterestBand[]>("/settings/interest-rates", { method: "POST", body: b });
export const updateBand = (id: string, b: BandInput) =>
  request<InterestBand[]>(`/settings/interest-rates/${id}`, { method: "PUT", body: b });
export const deleteBand = (id: string) => request<InterestBand[]>(`/settings/interest-rates/${id}`, { method: "DELETE" });

// ---------- Usuários da loja ----------
export interface StoreUser {
  id: string; name: string; email: string; role: "owner" | "admin" | "seller";
  active: boolean; createdAt: string; jobTitle: string | null;
}
export interface UsersData { users: StoreUser[]; activeCount: number; limit: number | null; planName: string | null }

export const listUsers = () => request<UsersData>("/settings/users");
export const updateUser = (id: string, data: { active?: boolean; role?: "admin" | "seller" }) =>
  request<UsersData>(`/settings/users/${id}`, { method: "PATCH", body: data });
