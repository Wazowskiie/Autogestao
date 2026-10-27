// Chamadas do painel "Dados do veículo" (abas Arquivos, NF-e, Mídias, Lançamentos...)
import { ApiError, getAccessToken, request } from "./api";

const API_URL: string = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:3000/api/v1";

type Money = number | string; // o backend manda valores em reais como texto ("25000.00")

// ---------- Tipos ----------
export interface VehiclePhoto { id: string; url: string; order: number }

export interface VehicleFull {
  id: string;
  type: "car" | "moto" | "truck" | "other";
  category?: string | null;
  status: "available" | "reserved" | "sold";
  brand: string; model: string; version?: string | null;
  year: number; manufactureYear?: number | null; km: number;
  color?: string | null; plate?: string | null; chassis?: string | null; renavam?: string | null;
  engineCc?: number | null; motorPower?: number | null;
  fuel?: string | null; transmission?: string | null; doors?: number | null;
  origin?: string | null; ownerCount?: number | null;
  ipvaPaid?: boolean | null; acceptsTrade?: boolean | null; hasSpareKey?: boolean | null; hasManual?: boolean | null;
  docStatus?: import("./vehicle-doc-status").DocStatus | null;
  cost: Money; price: Money;
  description?: string | null; optionals?: string[];
  photos?: VehiclePhoto[];
  createdAt: string; updatedAt?: string;
}

export type FileCategory = "vehicle" | "supplier" | "owner_document" | "link";
export interface VehicleFileItem {
  id: string; category: FileCategory; name: string; url: string | null;
  mimeType: string | null; size: number | null; uploadedBy: string | null;
  createdAt: string; downloadable: boolean;
}

export interface VehicleInvoice {
  id: string; direction: "issued" | "received";
  number: string | null; series: string | null; accessKey: string | null;
  operation: string | null; cfop: string | null; type: "entrada" | "saida" | null;
  status: string; issuerName: string | null; issuerDocument: string | null;
  recipientName: string | null; recipientDocument: string | null;
  amount: Money | null; issuedAt: string | null; hasXml: boolean; createdAt: string;
}
export type InvoiceInput = Partial<Omit<VehicleInvoice, "id" | "hasXml" | "createdAt" | "amount">> & {
  direction: "issued" | "received"; amount?: number;
};

export type RenaveStatus = "not_sent" | "pending" | "done" | "error";
export interface RenaveInfo {
  integration: { partner: string | null; status: string; active: boolean } | null;
  record: {
    entryStatus: RenaveStatus; entryAt: string | null; entryProtocol: string | null;
    exitStatus: RenaveStatus; exitAt: string | null; exitProtocol: string | null;
    notes: string | null; updatedAt: string;
  } | null;
}

export type ExpenseKind = "budget" | "expense" | "revenue";
export interface VehicleExpense {
  id: string; kind: ExpenseKind; date: string; description: string;
  supplier: string | null; requester: string | null; amount: Money;
  status: "pending" | "paid" | "approved" | "rejected";
  addToCost: boolean; financialTransactionId: string | null; createdByName: string | null;
}
export interface ExpensesResponse {
  budgets: VehicleExpense[];
  entries: VehicleExpense[];
  totals: { expenses: number; revenues: number; addedToCost: number; balance: number };
}
export interface ExpenseInput {
  kind: ExpenseKind; description: string; amount: number; date?: string;
  supplier?: string; requester?: string; status?: "pending" | "paid"; addToCost?: boolean;
}

export interface Acquisition {
  entryDate: string; ownershipType: "own" | "consigned";
  supplierName: string | null; supplierDocument: string | null; supplierPhone: string | null;
  documentOwnerName: string | null; documentOwnerDocument: string | null;
  purchaseValue: Money; payoffValue: Money; debtsValue: Money; notes: string | null;
  intermediary?: string | null; entryChannel?: EntryChannel | null; debts?: AcquisitionDebt[] | null;
}
export type EntryChannel = "cliente" | "cliente_final" | "consignados" | "corretor" | "repasse";
export const ENTRY_CHANNELS: { value: EntryChannel; label: string }[] = [
  { value: "cliente", label: "CLIENTE" },
  { value: "cliente_final", label: "CLIENTE FINAL" },
  { value: "consignados", label: "CONSIGNADOS" },
  { value: "corretor", label: "CORRETOR" },
  { value: "repasse", label: "REPASSE" },
];
export const entryChannelLabel = (c?: string | null) => ENTRY_CHANNELS.find((x) => x.value === c)?.label ?? "";
export interface AcquisitionDebt { date?: string | null; description: string; amount: number }
export interface AcquisitionInput {
  entryDate?: string; ownershipType?: "own" | "consigned";
  supplierName?: string; supplierDocument?: string; supplierPhone?: string;
  documentOwnerName?: string; documentOwnerDocument?: string;
  purchaseValue?: number; payoffValue?: number; debtsValue?: number; notes?: string;
  intermediary?: string; entryChannel?: EntryChannel; debts?: AcquisitionDebt[];
}

export interface Pendency { id: string; description: string; done: boolean; doneAt: string | null; createdAt: string }

export interface WebInfo {
  web: {
    title: string | null; description: string | null; webPrice: Money | null; promoPrice: Money | null;
    youtubeUrl: string | null; featured: boolean; published: boolean;
  } | null;
  defaultTitle: string;
  fipe: { code: string | null; label: string | null; value: number | null; reference: string | null } | null;
}
export interface WebInput {
  title?: string; description?: string; webPrice?: number | null; promoPrice?: number | null;
  youtubeUrl?: string; featured?: boolean; published?: boolean;
}

export interface FinancialItem {
  id: string; type: "revenue" | "expense"; category: string; amount: Money;
  date: string; description: string | null; paid: boolean; saleId: string | null;
}

export interface VehicleSummary {
  purchase: number; addedToCost: number; totalCost: number; revenues: number;
  price: number; sold: boolean; profit: number; margin: number; daysInStock: number;
  pendingCount: number; filesCount: number; photosCount: number;
}

// ---------- Envio de arquivos e downloads (precisam do login) ----------
async function authedFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: "include",
  });
  // Sessão expirada: o request() renova o login sozinho, depois tenta de novo
  if (res.status === 401 && retry) {
    await request("/auth/me").catch(() => undefined);
    return authedFetch(path, init, false);
  }
  return res;
}

export async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await authedFetch(path, { method: "POST", body: form });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(" ") : data?.message;
    throw new ApiError(
      res.status === 413 ? "Arquivo grande demais." : message ?? "Não foi possível enviar o arquivo.",
      res.status,
    );
  }
  return data as T;
}

/** Abre (PDF/imagem) ou baixa um arquivo protegido */
export async function openProtected(path: string, fileName: string) {
  const res = await authedFetch(path);
  if (!res.ok) throw new ApiError("Não foi possível abrir o arquivo.", res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const inline = blob.type === "application/pdf" || blob.type.startsWith("image/");
  if (inline && window.open(url, "_blank")) {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const base = (vehicleId: string) => `/vehicles/${vehicleId}`;

// ---------- Veículo ----------
export const getVehicle = (id: string) => request<VehicleFull>(base(id));

// ---------- Mídias ----------
export function uploadPhotos(vehicleId: string, files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return upload<VehiclePhoto[]>(`${base(vehicleId)}/photos`, form);
}
export const setCoverPhoto = (vehicleId: string, photoId: string) =>
  request<VehiclePhoto[]>(`${base(vehicleId)}/photos/${photoId}/cover`, { method: "PATCH" });
export const deletePhoto = (vehicleId: string, photoId: string) =>
  request<VehiclePhoto[]>(`${base(vehicleId)}/photos/${photoId}`, { method: "DELETE" });

// ---------- Arquivos ----------
export const listFiles = (vehicleId: string) => request<VehicleFileItem[]>(`${base(vehicleId)}/files`);
export function uploadFile(vehicleId: string, file: File, category: Exclude<FileCategory, "link">) {
  const form = new FormData();
  form.append("category", category);
  form.append("file", file);
  return upload<VehicleFileItem[]>(`${base(vehicleId)}/files`, form);
}
export const addLink = (vehicleId: string, name: string, url: string) =>
  request<VehicleFileItem[]>(`${base(vehicleId)}/links`, { method: "POST", body: { name, url } });
export const deleteFile = (vehicleId: string, fileId: string) =>
  request<VehicleFileItem[]>(`${base(vehicleId)}/files/${fileId}`, { method: "DELETE" });
export const openFile = (vehicleId: string, file: VehicleFileItem) =>
  openProtected(`${base(vehicleId)}/files/${file.id}/download`, file.name);

// ---------- NF-e e RENAVE ----------
export const listInvoices = (vehicleId: string) => request<VehicleInvoice[]>(`${base(vehicleId)}/invoices`);
export const createInvoice = (vehicleId: string, body: InvoiceInput) =>
  request<VehicleInvoice[]>(`${base(vehicleId)}/invoices`, { method: "POST", body });
export function importInvoiceXml(vehicleId: string, file: File, direction: "issued" | "received") {
  const form = new FormData();
  form.append("direction", direction);
  form.append("file", file);
  return upload<VehicleInvoice[]>(`${base(vehicleId)}/invoices/xml`, form);
}
export const deleteInvoice = (vehicleId: string, invoiceId: string) =>
  request<VehicleInvoice[]>(`${base(vehicleId)}/invoices/${invoiceId}`, { method: "DELETE" });
export const openInvoiceXml = (vehicleId: string, invoice: VehicleInvoice) =>
  openProtected(`${base(vehicleId)}/invoices/${invoice.id}/xml`, `NFe-${invoice.number ?? invoice.id}.xml`);

export const getRenave = (vehicleId: string) => request<RenaveInfo>(`${base(vehicleId)}/renave`);
export const updateRenave = (vehicleId: string, body: Record<string, unknown>) =>
  request<RenaveInfo>(`${base(vehicleId)}/renave`, { method: "PUT", body });

// ---------- Lançamentos ----------
export const listExpenses = (vehicleId: string) => request<ExpensesResponse>(`${base(vehicleId)}/expenses`);
export const createExpense = (vehicleId: string, body: ExpenseInput) =>
  request<ExpensesResponse>(`${base(vehicleId)}/expenses`, { method: "POST", body });
export const updateExpense = (vehicleId: string, expenseId: string, body: Partial<Omit<ExpenseInput, "status">> & { status?: "pending" | "paid" | "approved" | "rejected" }) =>
  request<ExpensesResponse>(`${base(vehicleId)}/expenses/${expenseId}`, { method: "PATCH", body });
export const approveBudget = (vehicleId: string, expenseId: string) =>
  request<ExpensesResponse>(`${base(vehicleId)}/expenses/${expenseId}/approve`, { method: "POST" });
export const deleteExpense = (vehicleId: string, expenseId: string) =>
  request<ExpensesResponse>(`${base(vehicleId)}/expenses/${expenseId}`, { method: "DELETE" });

// ---------- Entrada ----------
export const getAcquisition = (vehicleId: string) => request<Acquisition | null>(`${base(vehicleId)}/acquisition`);
export const saveAcquisition = (vehicleId: string, body: AcquisitionInput) =>
  request<Acquisition>(`${base(vehicleId)}/acquisition`, { method: "PUT", body });

// ---------- Pendências ----------
export const listPendencies = (vehicleId: string) => request<Pendency[]>(`${base(vehicleId)}/pendencies`);
export const createPendency = (vehicleId: string, description: string) =>
  request<Pendency[]>(`${base(vehicleId)}/pendencies`, { method: "POST", body: { description } });
export const updatePendency = (vehicleId: string, id: string, body: { done?: boolean; description?: string }) =>
  request<Pendency[]>(`${base(vehicleId)}/pendencies/${id}`, { method: "PATCH", body });
export const deletePendency = (vehicleId: string, id: string) =>
  request<Pendency[]>(`${base(vehicleId)}/pendencies/${id}`, { method: "DELETE" });

// ---------- Web, Financeiro, Resumo ----------
export const getWeb = (vehicleId: string) => request<WebInfo>(`${base(vehicleId)}/web`);
export const saveWeb = (vehicleId: string, body: WebInput) =>
  request<WebInfo>(`${base(vehicleId)}/web`, { method: "PUT", body });
export const listFinancial = (vehicleId: string) => request<FinancialItem[]>(`${base(vehicleId)}/financial`);
export const getSummary = (vehicleId: string) => request<VehicleSummary>(`${base(vehicleId)}/summary`);
