// Assistente virtual do sistema (Claude)
import { request } from "./api";

export interface AssistantMessage { role: "user" | "assistant"; content: string }
export interface AssistantAction { token: string; tool: string; summary: string }
export interface AssistantReply { reply: string; actions: AssistantAction[]; usedTools: string[] }

export const getAssistantStatus = () =>
  request<{ enabled: boolean; dailyLimit: number }>("/assistant/status");

export const askAssistant = (messages: AssistantMessage[], page?: string) =>
  request<AssistantReply>("/assistant/chat", { method: "POST", body: { messages, page } });

export const confirmAssistantAction = (token: string) =>
  request<{ ok: boolean; message: string }>("/assistant/confirm", { method: "POST", body: { token } });
