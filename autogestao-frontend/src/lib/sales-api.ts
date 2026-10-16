// Venda com troca e várias formas de pagamento
import { request } from "./api";
import type { Sale, VehicleType } from "./api";

export type SalePaymentMethod =
  | "pix" | "cash" | "transfer" | "card_credit" | "card_debit" | "financing" | "consortium" | "promissory";

export interface SalePaymentInput {
  method: SalePaymentMethod;
  amount: number;
  installments?: number; // cartão de crédito
  feePercent?: number;   // taxa da maquininha (%)
}

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
}

export interface SalePaymentItem {
  id: string; method: SalePaymentMethod; amount: number | string;
  installments: number | null; feePercent: number | string | null; feeAmount: number | string;
}

export interface SaleTradeInItem {
  id: string; brand: string; model: string; year: number; plate: string | null; cost: number | string; status: string;
}

/** Venda com as formas de pagamento e os veículos da troca */
export type SaleFull = Sale & {
  tradeInValue?: number | string;
  tradeIns?: SaleTradeInItem[];
  payments?: SalePaymentItem[];
};

export const createSaleFull = (body: CreateSaleFullInput) =>
  request<SaleFull>("/sales", { method: "POST", body });
