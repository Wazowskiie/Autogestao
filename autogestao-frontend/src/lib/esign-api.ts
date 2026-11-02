// Assinatura eletrônica dos impressos de saída (Autentique)
import { request } from "./api";
import { upload } from "./vehicle-details-api";

export type SignerRole = "buyer" | "store" | "witness" | "other";
export type SignerChannel = "email" | "whatsapp";

export interface SignerInput { name: string; email: string; phone?: string; role: SignerRole; channel: SignerChannel }
export interface SignerState extends SignerInput { phone: string | null; signed: boolean; signedAt: string | null; rejected?: boolean }

export interface SaleSignature {
  id: string; saleId: string; printId: string; title: string;
  status: "sending" | "waiting" | "signed" | "rejected" | "canceled" | "error";
  signers: SignerState[]; lastError: string | null;
  sentAt: string | null; completedAt: string | null; canceledAt: string | null; createdAt: string;
}

export interface EsignOverview { configured: boolean; sandbox: boolean; planAllows: boolean; planName: string; limit: number; used: number }

export const getEsignOverview = () => request<EsignOverview>("/esign/overview");
export const listSignatures = (saleId: string) => request<SaleSignature[]>(`/esign/sales/${saleId}`);

export function sendForSignature(saleId: string, input: { printId: string; title: string; message?: string; signers: SignerInput[]; pdf: Blob }) {
  const form = new FormData();
  form.append("printId", input.printId);
  form.append("title", input.title);
  if (input.message) form.append("message", input.message);
  form.append("signers", JSON.stringify(input.signers));
  form.append("file", new File([input.pdf], `${input.printId}.pdf`, { type: "application/pdf" }));
  return upload<SaleSignature>(`/esign/sales/${saleId}`, form);
}

export const refreshSignature = (id: string) => request<SaleSignature>(`/esign/${id}/refresh`, { method: "POST" });
export const signatureDownload = (id: string) => request<{ url: string; signed: boolean }>(`/esign/${id}/download`, { method: "POST" });
export const resendSignature = (id: string) => request<{ resent: number }>(`/esign/${id}/resend`, { method: "POST" });
export const cancelSignature = (id: string) => request<SaleSignature>(`/esign/${id}/cancel`, { method: "POST" });
