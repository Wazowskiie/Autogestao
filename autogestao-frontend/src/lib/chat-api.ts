import { request } from './api';
export interface ChatMessage { id: string; role: 'user' | 'assistant' | 'agent' | 'system'; content: string; createdAt: string; clientMessageId: string | null; }
export interface Conversation { id: string; mode: 'bot' | 'human' | 'closed'; updatedAt: string; messages: ChatMessage[]; leadId?: string | null; customer?: { name: string; phone: string | null } | null; assignedUser?: { id: string; name: string } | null; }
export interface ConversationList { items: Conversation[]; total: number; page: number; pageSize: number; }
const URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
export async function publicChat<T>(slug: string, token: string | null, endpoint = '', body?: unknown): Promise<T> {
  const response = await fetch(`${URL}/storefront/${encodeURIComponent(slug)}/chat${endpoint}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Chat-Token': token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message ?? 'Falha no atendimento') as Error & { status: number };
    error.status = response.status; throw error;
  }
  return data as T;
}
export const listChats = (page: number) => request<ConversationList>(`/chat?page=${page}`);
export const getChat = (id: string) => request<Conversation>(`/chat/${id}`);
export const setChatMode = (id: string, mode: Conversation['mode']) => request<Conversation>(`/chat/${id}/mode`, { method: 'PATCH', body: { mode } });
export const sendAgentMessage = (id: string, content: string, clientMessageId: string) => request<Conversation>(`/chat/${id}/messages`, { method: 'POST', body: { content, clientMessageId } });
