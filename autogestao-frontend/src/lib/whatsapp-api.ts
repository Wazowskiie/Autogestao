// WhatsApp oficial (Meta Cloud API)
import { request } from "./api";

export interface WhatsappAccount {
  configured: boolean; status?: "pending" | "connected" | "error"; displayPhone?: string | null; verifiedName?: string | null;
  connectedAt?: string | null; lastWebhookAt?: string | null; lastError?: string | null;
  phoneNumberId?: string; wabaId?: string | null; verifyToken?: string; webhookUrl?: string;
}
export interface WhatsappMessage { id: string; direction: "in" | "out"; type: string; body: string | null; status: string; error: string | null; sentAt: string }
export interface WhatsappConversation { connected: boolean; accountStatus?: string | null; storePhone?: string | null; windowOpenUntil: string | null; items: WhatsappMessage[] }

export const getWhatsappAccount = () => request<WhatsappAccount>("/whatsapp/account");
export const saveWhatsappAccount = (body: { phoneNumberId: string; wabaId?: string; accessToken?: string; appSecret?: string }) =>
  request<WhatsappAccount>("/whatsapp/account", { method: "PUT", body });
export const testWhatsappAccount = () => request<WhatsappAccount>("/whatsapp/account/test", { method: "POST" });
export const removeWhatsappAccount = () => request<{ success: boolean }>("/whatsapp/account", { method: "DELETE" });
export const getWhatsappConversation = (leadId: string) => request<WhatsappConversation>(`/whatsapp/leads/${leadId}`);
export const sendWhatsapp = (leadId: string, text: string) => request<WhatsappConversation>(`/whatsapp/leads/${leadId}/send`, { method: "POST", body: { text } });
export const getWhatsappUnread = () => request<{ count: number }>("/whatsapp/unread");
