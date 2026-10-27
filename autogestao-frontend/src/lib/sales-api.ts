// Venda com troca e várias formas de pagamento
import { request } from "./api";
import type { Sale, VehicleType } from "./api";

export type SalePaymentMethod =
  | "pix" | "cash" | "transfer" | "card_credit" | "card_debit" | "financing" | "consortium" | "promissory" | "deposit";

export type FinancingStatus = "analysis" | "approved" | "rejected" | "paid";
export const FINANCING_STATUS_LABELS: Record<FinancingStatus, string> = {
  analysis: "Em análise", approved: "Aprovada", rejected: "Recusada", paid: "Paga pelo banco",
};

export interface SalePaymentInput {
  method: SalePaymentMethod;
  amount: number;
  installments?: number; // cartão de crédito
  feePercent?: number;   // taxa da maquininha (%)
  bank?: string;            // financiamento
  financingStatus?: FinancingStatus;
  returnAmount?: number;    // retorno que o banco paga à loja
}

export interface SaleExpenseInput { description: string; amount: number; date?: string; paid?: boolean }

export interface TradeInInput {
  type: VehicleType;
  brand: string; model: string; version?: string;
  year: number; manufactureYear?: number;
  color?: string; plate?: string; chassis?: string; renavam?: string; fuel?: string;
  km?: number; engineCc?: number;
  value: number; // valor da avaliação
}

export interface CreateSaleFullInput {
  vehicleId: string; customerId: string; sellerId?: string;
  price: number; cost: number; soldAt?: string; notes?: string;
  tradeIns?: TradeInInput[];
  payments?: SalePaymentInput[];
  /** Dono/admin liberou a venda com entrada abaixo do mínimo */
  allowBelowMinDownPayment?: boolean;
  expenses?: SaleExpenseInput[];
  commissionAmount?: number;
  warrantyDays?: number;
  warrantyCoverage?: string;
  leadId?: string;
}

export interface SalePaymentItem {
  id: string; method: SalePaymentMethod; amount: number | string;
  installments: number | null; feePercent: number | string | null; feeAmount: number | string;
  bank?: string | null; financingStatus?: FinancingStatus | null; receivedAt?: string | null; returnAmount?: number | string;
}

export interface SaleExpenseItem { id: string; description: string; amount: number | string; date: string; paid: boolean }

export type ChecklistKey = "atpv" | "communication" | "transfer" | "keys" | "manual" | "documents";
export const CHECKLIST_ITEMS: { key: ChecklistKey; label: string; help: string }[] = [
  { key: "atpv", label: "ATPV-e assinado", help: "Autorização de transferência preenchida e assinada" },
  { key: "communication", label: "Comunicação de venda", help: "Venda comunicada ao Detran" },
  { key: "transfer", label: "Transferência concluída", help: "Veículo já está no nome do comprador" },
  { key: "keys", label: "Chave reserva entregue", help: "" },
  { key: "manual", label: "Manual entregue", help: "" },
  { key: "documents", label: "Documentos entregues", help: "CRLV, nota, contrato" },
];
export type Checklist = Partial<Record<ChecklistKey, { done: boolean; at: string | null }>>;

export interface SaleTradeInItem {
  id: string; brand: string; model: string; year: number; plate: string | null; cost: number | string; status: string;
}

/** Venda com as formas de pagamento e os veículos da troca */
export type SaleFull = Sale & {
  tradeInValue?: number | string;
  tradeIns?: SaleTradeInItem[];
  payments?: SalePaymentItem[];
  expenses?: SaleExpenseItem[];
  status?: "active" | "canceled";
  canceledAt?: string | null; cancelReason?: string | null; refundAmount?: number | string;
  sellerId?: string;
  commissionRate?: number | string | null; commissionAmount?: number | string; commissionPaidAt?: string | null;
  warrantyDays?: number | null; warrantyCoverage?: string | null;
  deliveryChecklist?: Checklist | null;
};

const sale = (id: string) => `/sales/${id}`;
export const getSaleFull = (id: string) => request<SaleFull>(sale(id));
export const cancelSale = (id: string, body: { reason: string; refundAmount?: number }) =>
  request<{ sale: SaleFull; returnedTradeIns: string[]; keptTradeIns: string[] }>(`${sale(id)}/cancel`, { method: "POST", body });
export const addSaleExpense = (id: string, body: SaleExpenseInput) => request<SaleFull>(`${sale(id)}/expenses`, { method: "POST", body });
export const updateSaleExpense = (id: string, expenseId: string, body: { paid: boolean }) =>
  request<SaleFull>(`${sale(id)}/expenses/${expenseId}`, { method: "PATCH", body });
export const removeSaleExpense = (id: string, expenseId: string) => request<SaleFull>(`${sale(id)}/expenses/${expenseId}`, { method: "DELETE" });
export const updateFinancing = (id: string, paymentId: string, body: { bank?: string; status?: FinancingStatus; receivedAt?: string; returnAmount?: number }) =>
  request<SaleFull>(`${sale(id)}/payments/${paymentId}/financing`, { method: "PATCH", body });
export const updateCommission = (id: string, body: { amount?: number; paid?: boolean }) =>
  request<SaleFull>(`${sale(id)}/commission`, { method: "PATCH", body });
export const updateChecklist = (id: string, body: { key: ChecklistKey; done: boolean }) =>
  request<SaleFull>(`${sale(id)}/checklist`, { method: "PATCH", body });
export const updateWarranty = (id: string, body: { days?: number; coverage?: string }) =>
  request<SaleFull>(`${sale(id)}/warranty`, { method: "PATCH", body });

export interface AfterSaleItem {
  id: string; contractNumber: string | null; soldAt: string; customer: string; phone: string | null;
  vehicle: string; plate: string | null; deadline: string; daysLeft: number; pendingItems: string[];
}
export interface FinancingPendingItem {
  paymentId: string; saleId: string; contractNumber: string | null; soldAt: string; customer: string; phone: string | null; seller: string;
  vehicle: string; method: string; bank: string | null; status: FinancingStatus; amount: number; returnAmount: number; days: number;
}
export const getFinancingPending = () =>
  request<{ items: FinancingPendingItem[]; analysis: number; approved: number; rejected: number; waitingAmount: number }>("/sales/financing-pending");
export const getAfterSales = () => request<{ items: AfterSaleItem[]; overdue: number; dueSoon: number }>("/sales/after-sales");

// ---------- Reservas ----------
export interface Reservation {
  id: string; vehicleId: string; customerId: string; sellerId: string | null;
  deposit: number | string; depositMethod: string | null; expiresAt: string | null; notes: string | null;
  status: "active" | "converted" | "canceled"; createdAt: string; expired?: boolean;
  vehicle: { id: string; brand: string; model: string; year: number; plate: string | null; price: number | string; status: string };
  customer: { id: string; name: string; phone: string | null };
}
export const listReservations = (params: { status?: string; vehicleId?: string } = {}) => {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.vehicleId) q.set("vehicleId", params.vehicleId);
  return request<Reservation[]>(`/reservations${q.toString() ? `?${q}` : ""}`);
};
export const createReservation = (body: { leadId?: string; vehicleId: string; customerId: string; deposit?: number; depositMethod?: string; expiresAt?: string; notes?: string }) =>
  request<Reservation>("/reservations", { method: "POST", body });
export const updateReservation = (id: string, body: { expiresAt?: string; notes?: string }) =>
  request<Reservation>(`/reservations/${id}`, { method: "PATCH", body });
export const cancelReservation = (id: string, body: { refund: boolean; reason?: string }) =>
  request<{ success: boolean }>(`/reservations/${id}/cancel`, { method: "POST", body });

export const createSaleFull = (body: CreateSaleFullInput) =>
  request<SaleFull>("/sales", { method: "POST", body });
