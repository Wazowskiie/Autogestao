const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let accessToken: string | null = null;
export function setAccessToken(token: string | null) { accessToken = token; }

interface RequestOptions { method?: string; body?: unknown; skipAuthRetry?: boolean; }

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
        if (!res.ok) return false;
        const data = await res.json();
        setAccessToken(data.accessToken);
        return true;
      } catch { return false; }
      finally { refreshPromise = null; }
    })();
  }
  return refreshPromise;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401 && !options.skipAuthRetry && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...options, skipAuthRetry: true });
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(" ") : data?.message ?? "Erro inesperado.";
    throw new ApiError(message, res.status);
  }
  return data as T;
}

// ---------- Auth ----------
export type UserRole = "owner" | "admin" | "seller";
export interface AuthUser { id: string; name: string; email: string; role: UserRole; }
export interface Dealership { id: string; name: string; slug: string; }
export interface AuthResponse { accessToken: string; user: AuthUser; dealership: Dealership; }
export interface RegisterInput { dealershipName: string; dealershipSlug: string; ownerName: string; ownerEmail: string; password: string; }

export function register(input: RegisterInput) { return request<AuthResponse>("/auth/register", { method: "POST", body: input }); }
export function login(email: string, password: string) { return request<AuthResponse>("/auth/login", { method: "POST", body: { email, password } }); }
export function logout() { return request<{ success: boolean }>("/auth/logout", { method: "POST" }); }
export function getMe() { return request<{ user: AuthUser; dealership: Dealership }>("/auth/me"); }

// ---------- Veículos ----------
export type VehicleType = "car" | "moto" | "truck";
export type VehicleStatus = "available" | "reserved" | "sold";

export interface VehiclePhoto { id: string; url: string; order: number; }

export interface Vehicle {
  id: string; dealershipId: string;
  brand: string; model: string; version: string | null;
  year: number; km: number;
  color: string | null; plate: string | null;
  fuel: string | null; transmission: string | null;
  doors: number | null; origin: string | null;
  ownerCount: number | null;
  ipvaPaid: boolean | null; acceptsTrade: boolean | null;
  hasSpareKey: boolean | null; hasManual: boolean | null;
  cost: number; price: number;
  status: VehicleStatus; type: VehicleType;
  description: string | null; optionals: string[];
  createdById: string | null; createdAt: string; updatedAt: string;
  photos?: VehiclePhoto[];
}

export interface VehicleListResponse { items: Vehicle[]; total: number; page: number; pageSize: number; }
export interface VehicleListParams { search?: string; status?: VehicleStatus | "all"; type?: VehicleType | "all"; page?: number; pageSize?: number; }

export interface VehicleInput {
  brand: string; model: string; version?: string;
  year: number; km: number;
  color?: string; plate?: string;
  fuel?: string; transmission?: string;
  doors?: number; origin?: string; ownerCount?: number;
  ipvaPaid?: boolean; acceptsTrade?: boolean; hasSpareKey?: boolean; hasManual?: boolean;
  cost: number; price: number;
  type: VehicleType; status?: VehicleStatus;
  description?: string; optionals?: string[];
}

export function listVehicles(params: VehicleListParams = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.status && params.status !== "all") query.set("status", params.status);
  if (params.type && params.type !== "all") query.set("type", params.type);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 50));
  return request<VehicleListResponse>(`/vehicles?${query.toString()}`);
}
export function getVehicle(id: string) { return request<Vehicle>(`/vehicles/${id}`); }
export function createVehicle(input: VehicleInput) { return request<Vehicle>("/vehicles", { method: "POST", body: input }); }
export function updateVehicle(id: string, input: Partial<VehicleInput>) { return request<Vehicle>(`/vehicles/${id}`, { method: "PATCH", body: input }); }
export function deleteVehicle(id: string) { return request<{ success: boolean }>(`/vehicles/${id}`, { method: "DELETE" }); }

// ---------- Clientes ----------
export interface Customer {
  id: string; dealershipId: string;
  name: string; document: string | null;
  phone: string | null; email: string | null; address: string | null;
  birthDate: string | null; gender: string | null;
  howMet: string | null; tags: string[]; notes: string | null;
  createdAt: string; updatedAt: string;
}
export interface CustomerListResponse { items: Customer[]; total: number; page: number; pageSize: number; }
export interface CustomerInput {
  name: string; document?: string; phone?: string; email?: string; address?: string;
  birthDate?: string; gender?: string; howMet?: string; tags?: string[]; notes?: string;
}

export function listCustomers(params: { search?: string; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 50));
  return request<CustomerListResponse>(`/customers?${query.toString()}`);
}
export function createCustomer(input: CustomerInput) { return request<Customer>("/customers", { method: "POST", body: input }); }
export function updateCustomer(id: string, input: Partial<CustomerInput>) { return request<Customer>(`/customers/${id}`, { method: "PATCH", body: input }); }
export function deleteCustomer(id: string) { return request<{ success: boolean }>(`/customers/${id}`, { method: "DELETE" }); }

// ---------- Leads ----------
export type LeadStage = "new" | "contacted" | "negotiating" | "won" | "lost";
export interface LeadCustomer { id: string; name: string; phone: string | null; email: string | null; }
export interface LeadVehicle { id: string; brand: string; model: string; year: number; photos?: { url: string }[]; }
export interface LeadSeller { id: string; name: string; }
export interface Lead { id: string; dealershipId: string; stage: LeadStage; source: string | null; notes: string | null; createdAt: string; updatedAt: string; customer: LeadCustomer | null; vehicle: LeadVehicle | null; assignedSeller: LeadSeller | null; }
export type LeadsGrouped = Record<LeadStage, Lead[]>;
export interface CreateLeadInput { customerId?: string; vehicleId?: string; assignedSellerId?: string; source?: string; notes?: string; customerName?: string; customerPhone?: string; customerEmail?: string; }

export function listLeads() { return request<LeadsGrouped>("/leads"); }
export function createLead(input: CreateLeadInput) { return request<Lead>("/leads", { method: "POST", body: input }); }
export function updateLeadStage(id: string, stage: LeadStage) { return request<Lead>(`/leads/${id}/stage`, { method: "PATCH", body: { stage } }); }
export function deleteLead(id: string) { return request<{ success: boolean }>(`/leads/${id}`, { method: "DELETE" }); }

// ---------- Vendas ----------
export interface SaleVehicle { id: string; brand: string; model: string; year: number; km?: number; color?: string | null; type: string; }
export interface SaleCustomer { id: string; name: string; phone?: string | null; email?: string | null; }
export interface SaleSeller { id: string; name: string; }
export interface SalePromissoryNote { id: string; installmentNumber: number; totalInstallments: number; amount: number; dueDate: string; paid: boolean; paidAt: string | null; }
export interface Sale {
  id: string; dealershipId: string;
  contractNumber?: string;
  price: number; cost: number; profit: number; margin: number;
  paymentMethod: string | null; notes: string | null; soldAt: string;
  vehicle: SaleVehicle; customer: SaleCustomer; seller: SaleSeller;
  promissoryNotes?: SalePromissoryNote[];
}
export interface SaleListResponse { items: Sale[]; total: number; page: number; pageSize: number; }
export interface SaleSummary { count: number; totalRevenue: number; totalCost: number; totalProfit: number; avgMargin: number; }
export interface CreateSaleInput { vehicleId: string; customerId: string; sellerId?: string; price: number; cost: number; paymentMethod?: string; soldAt?: string; notes?: string; }
export interface UpdateSaleInput { notes?: string; paymentMethod?: string; }

export function listSales(params: { month?: string; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (params.month) query.set("month", params.month);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 50));
  return request<SaleListResponse>(`/sales?${query.toString()}`);
}
export function getSaleSummary(month?: string) { return request<SaleSummary>(`/sales/summary${month ? `?month=${month}` : ""}`); }
export function getSale(id: string) { return request<Sale>(`/sales/${id}`); }
export function createSale(input: CreateSaleInput) { return request<Sale>("/sales", { method: "POST", body: input }); }
// Backend só aceita notes e paymentMethod no PATCH — ver sales.service.ts (update)
export function updateSale(id: string, input: UpdateSaleInput) { return request<Sale>(`/sales/${id}`, { method: "PATCH", body: input }); }

// ---------- Vendedores ----------
export interface SellerMetrics { salesCount: number; totalRevenue: number; totalProfit: number; }

export interface Seller {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  metrics: SellerMetrics;
  // Campos opcionais usados pela tela de Vendedores (edição/telefone/cargo/comissão/status).
  // Confirme que o endpoint GET /sellers já retorna estes campos no backend.
  phone?: string;
  jobTitle?: string;
  commissionRate?: number;
  active?: boolean;
}

export interface CreateSellerInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
  jobTitle?: string;
  commissionRate?: number;
  active?: boolean;
}

export interface UpdateSellerInput {
  name?: string;
  email?: string;
  password?: string; // opcional: só enviar se o usuário quiser trocar a senha
  phone?: string;
  jobTitle?: string;
  commissionRate?: number;
  active?: boolean;
}

export function listSellers(month?: string) { return request<Seller[]>(`/sellers${month ? `?month=${month}` : ""}`); }
export function createSeller(input: CreateSellerInput) { return request<Omit<Seller, "metrics">>("/sellers", { method: "POST", body: input }); }
export function updateSeller(id: string, input: UpdateSellerInput) { return request<Omit<Seller, "metrics">>(`/sellers/${id}`, { method: "PATCH", body: input }); }
export function deleteSeller(id: string) { return request<{ success: boolean }>(`/sellers/${id}`, { method: "DELETE" }); }

// ---------- Financeiro ----------
export type TransactionType = "revenue" | "expense";
export interface FinancialTransaction { id: string; dealershipId: string; type: TransactionType; category: string; amount: number; date: string; description: string | null; saleId: string | null; }
export interface FinancialListResponse { items: FinancialTransaction[]; total: number; page: number; pageSize: number; }
export interface FinancialSummary { totalRevenue: number; totalExpense: number; balance: number; transactionCount: number; byCategory: Record<string, { revenue: number; expense: number }>; }
export interface CreateTransactionInput { type: TransactionType; category: string; amount: number; date?: string; description?: string; }

export function listTransactions(params: { month?: string; type?: TransactionType; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (params.month) query.set("month", params.month);
  if (params.type) query.set("type", params.type);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 50));
  return request<FinancialListResponse>(`/financial?${query.toString()}`);
}
export function getFinancialSummary(month?: string) { return request<FinancialSummary>(`/financial/summary${month ? `?month=${month}` : ""}`); }
export function createTransaction(input: CreateTransactionInput) { return request<FinancialTransaction>("/financial", { method: "POST", body: input }); }
export function deleteTransaction(id: string) { return request<{ success: boolean }>(`/financial/${id}`, { method: "DELETE" }); }

// ---------- Promissórias ----------
export interface PromissoryCustomer { id: string; name: string; phone: string | null; }
export interface PromissoryVehicle { id: string; brand: string; model: string; year: number; }
export interface PromissoryNote { id: string; dealershipId: string; saleId: string; customerId: string; installmentNumber: number; totalInstallments: number; amount: number; dueDate: string; paid: boolean; paidAt: string | null; customer: PromissoryCustomer; sale: { vehicle: PromissoryVehicle }; }
export interface PromissoryListSummary { overdueCount: number; overdueAmount: number; pendingCount: number; pendingAmount: number; paidCount: number; paidAmount: number; }
export interface PromissoryListResponse { items: PromissoryNote[]; total: number; page: number; pageSize: number; summary: PromissoryListSummary; }
export interface CreatePromissoryInput { saleId: string; customerId: string; totalInstallments: number; totalAmount: number; firstDueDate: string; }

export function listPromissoryNotes(params: { paid?: boolean; month?: string; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.paid !== undefined) query.set("paid", String(params.paid));
  if (params.month) query.set("month", params.month);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", "50");
  return request<PromissoryListResponse>(`/promissory-notes?${query.toString()}`);
}
export function createPromissoryNotes(input: CreatePromissoryInput) { return request<PromissoryNote[]>("/promissory-notes", { method: "POST", body: input }); }
export function payPromissoryNote(id: string) { return request<PromissoryNote>(`/promissory-notes/${id}/pay`, { method: "PATCH" }); }
export function deletePromissoryNote(id: string) { return request<{ success: boolean }>(`/promissory-notes/${id}`, { method: "DELETE" }); }

// ---------- Peças ----------
export interface Part { id: string; dealershipId: string; name: string; sku: string | null; cost: number; price: number; stockQty: number; category: string | null; createdAt: string; }
export interface PartListResponse { items: Part[]; total: number; page: number; pageSize: number; }
export interface CreatePartInput { name: string; sku?: string; cost: number; price: number; stockQty?: number; category?: string; }

export function listParts(params: { search?: string; category?: string; lowStock?: boolean; page?: number } = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.category) query.set("category", params.category);
  if (params.lowStock) query.set("lowStock", "true");
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", "50");
  return request<PartListResponse>(`/parts?${query.toString()}`);
}
export function createPart(input: CreatePartInput) { return request<Part>("/parts", { method: "POST", body: input }); }
export function updatePart(id: string, input: Partial<CreatePartInput>) { return request<Part>(`/parts/${id}`, { method: "PATCH", body: input }); }
export function adjustPartStock(id: string, qty: number) { return request<Part>(`/parts/${id}/stock`, { method: "PATCH", body: { qty } }); }
export function deletePart(id: string) { return request<{ success: boolean }>(`/parts/${id}`, { method: "DELETE" }); }

// ---------- Cobrança ----------
export interface Plan { id: string; name: string; price: number; vehicleLimit: number; userLimit: number; features: string[]; }
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled";
export interface Subscription { id: string; dealershipId: string; planId: string; status: SubscriptionStatus; currentPeriodEnd: string | null; plan: Plan; }
export type BillingType = "PIX" | "BOLETO" | "CREDIT_CARD";
export interface CheckoutPayment { id: string; status: string; invoiceUrl: string; bankSlipUrl: string | null; }
export interface CheckoutPix { encodedImage: string; payload: string; }
export interface CheckoutResponse { subscription: Subscription; payment: CheckoutPayment | null; pix: CheckoutPix | null; }

export function listPlans() { return request<Plan[]>("/billing/plans"); }
export function getBillingStatus() { return request<Subscription>("/billing/status"); }
export function checkout(planId: string, billingType: BillingType) { return request<CheckoutResponse>("/billing/checkout", { method: "POST", body: { planId, billingType } }); }

// ---------- Vitrine pública ----------
export interface StorefrontDealership { id: string; name: string; slug: string; city: string | null; state: string | null; phone: string | null; logoUrl: string | null; coverUrl: string | null; primaryColor: string | null; vehicleCount: number; }
export interface StorefrontVehicle { id: string; brand: string; model: string; year: number; km: number; price: number; status: VehicleStatus; type: VehicleType; description: string | null; optionals: string[]; createdAt: string; updatedAt: string; photos?: VehiclePhoto[]; }
export interface StorefrontVehicleListResponse { items: StorefrontVehicle[]; total: number; page: number; pageSize: number; }
export interface StorefrontVehicleParams { search?: string; type?: VehicleType | "all"; minPrice?: number; maxPrice?: number; page?: number; pageSize?: number; }

async function publicRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.message ?? "Erro ao carregar dados da loja", res.status);
  return data as T;
}
export function getStorefrontDealership(slug: string) { return publicRequest<StorefrontDealership>(`/storefront/${slug}`); }
export function listStorefrontVehicles(slug: string, params: StorefrontVehicleParams = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.type && params.type !== "all") query.set("type", params.type);
  if (params.minPrice !== undefined) query.set("minPrice", String(params.minPrice));
  if (params.maxPrice !== undefined) query.set("maxPrice", String(params.maxPrice));
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 24));
  return publicRequest<StorefrontVehicleListResponse>(`/storefront/${slug}/vehicles?${query.toString()}`);
}
export function getStorefrontVehicle(slug: string, vehicleId: string) { return publicRequest<StorefrontVehicle>(`/storefront/${slug}/vehicles/${vehicleId}`); }

// ---------- Taxas de juros ----------
export interface InterestRate {
  id: string;
  dealershipId: string;
  minInstallments: number;
  maxInstallments: number;
  rate: number;
}

export interface InterestCalculation {
  rate: number;
  totalPromissory: number;
  installmentValue: number;
  lastInstallmentValue: number;
  installments: number;
}

export function listInterestRates() {
  return request<InterestRate[]>('/interest-rates');
}

export function updateInterestRate(id: string, rate: number) {
  return request<InterestRate>(`/interest-rates/${id}`, { method: 'PATCH', body: { rate } });
}

export function calculateInterest(vehiclePrice: number, installments: number) {
  return request<InterestCalculation>(`/interest-rates/calculate?vehiclePrice=${vehiclePrice}&installments=${installments}`);
}

// ---------- Deletar venda (owner/admin) ----------
export function deleteSale(id: string) {
  return request<{ success: boolean }>(`/sales/${id}`, { method: 'DELETE' });
}