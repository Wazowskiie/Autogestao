import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Plus, Car, Bike, Truck, X, FileText, Edit2, Trash2, ChevronDown, UserPlus, RefreshCw, Wallet, Loader2, Printer, CheckCircle2 } from "lucide-react";
import { openSaleDocument } from "../../lib/sale-documents";
import { getSettings } from "../../lib/settings-api";
import * as api from "../../lib/api";
import * as sapi from "../../lib/sales-api";
import { useAuth } from "../../lib/auth-context";
import { CancelSaleModal, SaleAfterPanel } from "./SaleAfterPanel";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// Formas de pagamento aceitas pelo backend (validação do endpoint /sales).
const PAYMENT_LABELS: Record<string, string> = {
  cash: "À vista", financing: "Financiamento", consortium: "Consórcio",
  pix: "PIX", card: "Cartão", transfer: "Transferência", promissory: "Promissórias",
};

// Nomes das formas usadas no pagamento dividido (inclui as antigas acima)
const PAYMENT_NAMES: Record<string, string> = {
  ...PAYMENT_LABELS, cash: "Dinheiro", card_credit: "Cartão de crédito", card_debit: "Cartão de débito", mixed: "Várias formas",
  deposit: "Sinal (reserva)",
};

/** Texto curto da forma de pagamento para a lista (ex.: "PIX + Cartão de crédito + Troca") */
function paymentSummary(sale: api.Sale) {
  const s = sale as sapi.SaleFull;
  const parts = (s.payments ?? []).map(p => PAYMENT_NAMES[p.method] ?? p.method);
  if (s.tradeIns?.length) parts.push("Troca");
  if (parts.length) return Array.from(new Set(parts)).join(" + ");
  return sale.paymentMethod ? (PAYMENT_NAMES[sale.paymentMethod] ?? sale.paymentMethod) : "—";
}

// Autocomplete genérico
function Autocomplete<T extends { id: string }>({
  items, value, onChange, getLabel, placeholder, onQueryChange, footer,
}: {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  getLabel: (item: T) => string;
  placeholder: string;
  onQueryChange?: (query: string) => void;
  /** Renderizado no rodapé do dropdown, mesmo quando não há resultados. Útil para ações como "cadastrar novo". */
  footer?: (query: string) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = items.find(i => i.id === value);

  useEffect(() => {
    if (selected) setQuery(getLabel(selected));
  }, [value, !!selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = query
    ? items.filter(i => getLabel(i).toLowerCase().includes(query.toLowerCase()))
    : items;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const footerNode = footer ? footer(query) : null;
  const showDropdown = open && (filtered.length > 0 || !!footerNode);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange("");
            onQueryChange?.(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg px-3 py-2.5 pr-8"
          style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none", background: "#FAFAFA" }}
        />
        <ChevronDown size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
      </div>
      {showDropdown && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "0.5px solid rgba(0,0,0,0.12)", borderRadius: 8, zIndex: 100, maxHeight: 240, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", marginTop: 2 }}>
          {filtered.map(item => (
            <button key={item.id} type="button" onClick={() => { onChange(item.id); setQuery(getLabel(item)); onQueryChange?.(getLabel(item)); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 hover:bg-blue-50"
              style={{ fontSize: 13, color: "#374151", borderBottom: "0.5px solid rgba(0,0,0,0.04)" }}>
              {getLabel(item)}
            </button>
          ))}
          {filtered.length === 0 && !footerNode && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "#9CA3AF" }}>Nenhum resultado.</div>
          )}
          {footerNode}
        </div>
      )}
    </div>
  );
}

export function Sales() {
  const auth = useAuth();
  const canEdit = auth.user?.role === "owner" || auth.user?.role === "admin";

  const [sales, setSales] = useState<api.Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<api.SaleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewingSaleId, setViewingSaleId] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState(false);
  const [editingSale, setEditingSale] = useState<api.Sale | null>(null);
  const [afterSales, setAfterSales] = useState<{ items: sapi.AfterSaleItem[]; overdue: number; dueSoon: number } | null>(null);
  const [showAfterSales, setShowAfterSales] = useState(false);
  const [financing, setFinancing] = useState<Awaited<ReturnType<typeof sapi.getFinancingPending>> | null>(null);
  const [showFinancing, setShowFinancing] = useState(false);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, sum] = await Promise.all([
        api.listSales({ month, pageSize: 100 }),
        api.getSaleSummary(month),
      ]);
      setSales(res.items);
      setTotal(res.total);
      setSummary(sum);
      sapi.getAfterSales().then(setAfterSales).catch(() => setAfterSales(null));
      sapi.getFinancingPending().then(setFinancing).catch(() => setFinancing(null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar vendas");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  const filtered = sales.filter((s) => {
    const q = search.toLowerCase();
    return !q || s.customer.name.toLowerCase().includes(q) ||
      `${s.vehicle.brand} ${s.vehicle.model}`.toLowerCase().includes(q) ||
      ((s as any).contractNumber ?? "").toLowerCase().includes(q);
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.deleteSale(deleteId);
      setDeleteId(null);
      fetchSales();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao excluir venda");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      <div className="px-6 py-4 flex-shrink-0" style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2>Vendas</h2>
            <span className="px-2 py-0.5 rounded-full" style={{ background: "#EBF2FA", color: "#185FA5", fontSize: 12, fontWeight: 500 }}>{total}</span>
          </div>
          <div className="flex items-center gap-3">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg px-3 py-2" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13 }} />
            <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg flex items-center gap-2"
              style={{ background: "#185FA5", color: "#fff", fontSize: 13 }}>
              <Plus size={16} /> Registrar venda
            </button>
          </div>
        </div>

        {summary && (
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { label: summary.canceledCount ? `Vendas · ${summary.canceledCount} cancelada${summary.canceledCount > 1 ? "s" : ""}` : "Vendas", value: String(summary.count), color: "#185FA5" },
              { label: "Receita", value: currency(summary.totalRevenue), color: "#27500A" },
              { label: "Lucro real", value: currency(summary.totalProfit), color: "#7C3AED" },
              { label: "Margem média", value: `${summary.avgMargin.toFixed(1)}%`, color: "#D97706" },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-4 rounded-xl" style={{ background: "#F4F6F9" }}>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {financing && financing.items.length > 0 && (
          <button onClick={() => setShowFinancing(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-left"
            style={{ background: financing.rejected ? "#FEF2F2" : "#EFF6FF", border: `1px solid ${financing.rejected ? "#FECACA" : "#BFDBFE"}`, fontSize: 13, color: financing.rejected ? "#991B1B" : "#1E40AF" }}>
            <Wallet size={14} />
            <span className="flex-1">
              <b>Financiamentos:</b>{" "}
              {[financing.analysis ? `${financing.analysis} em análise` : null, financing.approved ? `${financing.approved} aprovado${financing.approved > 1 ? "s" : ""} esperando o depósito` : null, financing.rejected ? `${financing.rejected} recusado${financing.rejected > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}
              {financing.waitingAmount > 0 ? ` · ${currency(financing.waitingAmount)} a receber dos bancos` : ""}
            </span>
            <span style={{ fontWeight: 600 }}>Ver lista</span>
          </button>
        )}

        {afterSales && afterSales.items.length > 0 && (
          <button onClick={() => setShowAfterSales(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-3 text-left"
            style={{ background: afterSales.overdue ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${afterSales.overdue ? "#FECACA" : "#FDE68A"}`, fontSize: 13, color: afterSales.overdue ? "#991B1B" : "#92400E" }}>
            <RefreshCw size={14} />
            <span className="flex-1">
              <b>Pós-venda:</b> {afterSales.items.length} transferência{afterSales.items.length > 1 ? "s" : ""} pendente{afterSales.items.length > 1 ? "s" : ""}
              {afterSales.overdue ? ` · ${afterSales.overdue} atrasada${afterSales.overdue > 1 ? "s" : ""}` : ""}
              {afterSales.dueSoon ? ` · ${afterSales.dueSoon} vence${afterSales.dueSoon > 1 ? "m" : ""} em até 7 dias` : ""}
            </span>
            <span style={{ fontWeight: 600 }}>Ver lista</span>
          </button>
        )}

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#F4F6F9" }}>
          <Search size={16} style={{ color: "#9CA3AF" }} />
          <input placeholder="Buscar por cliente, veículo ou nº do contrato..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="flex-1 bg-transparent outline-none" style={{ fontSize: 13 }} />
        </div>
      </div>

      {error && (
        <div className="px-6 pt-4">
          <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
            <span>{error}</span><button onClick={fetchSales} style={{ fontWeight: 500 }}>Tentar novamente</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead style={{ background: "#F9FAFB", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
              <tr>
                {["Contrato", "Data", "Veículo", "Cliente", "Vendedor", "Pagamento", "Preço", "Lucro", "Margem", ...(canEdit ? ["Ações"] : [])].map(h => (
                  <th key={h} className="text-left px-4 py-3" style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={canEdit ? 10 : 9} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#9CA3AF" }}>Nenhuma venda encontrada.</td></tr>
              )}
              {filtered.map((s, i) => {
                const Icon = s.vehicle.type === "moto" ? Bike : s.vehicle.type === "truck" ? Truck : Car;
                const m = Number(s.margin);
                const canceled = (s as sapi.SaleFull).status === "canceled";
                return (
                  <tr key={s.id} onClick={() => setViewingSaleId(s.id)}
                    className="cursor-pointer hover:bg-[#F9FAFB]"
                    style={{ borderBottom: i < filtered.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none", opacity: canceled ? 0.6 : 1 }}>
                    <td className="px-4 py-3">
                      <span style={{ fontSize: 12, color: "#185FA5", fontWeight: 500, background: "#EBF2FA", padding: "2px 8px", borderRadius: 99 }}>
                        {s.contractNumber ?? "—"}
                      </span>
                      {canceled && <span style={{ display: "block", marginTop: 4, fontSize: 10, fontWeight: 600, color: "#DC2626" }}>CANCELADA</span>}
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>{new Date(s.soldAt).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: "#F4F6F9", flexShrink: 0 }}>
                          <Icon size={14} style={{ color: "#CBD5E1" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{s.vehicle.brand} {s.vehicle.model}</div>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>{s.vehicle.year}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: "#374151" }}>{s.customer.name}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>{s.seller.name}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded" style={{ fontSize: 11, background: "#F4F6F9", color: "#374151" }}>
                        {paymentSummary(s)}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, fontWeight: 500, textDecoration: canceled ? "line-through" : undefined }}>{currency(Number(s.price))}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: Number(s.profit) >= 0 ? "#27500A" : "#DC2626", fontWeight: 500 }}>{currency(Number(s.profit))}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: m > 20 ? "#27500A" : m > 10 ? "#374151" : "#DC2626", fontWeight: 500 }}>{m.toFixed(1)}%</td>
                    {canEdit && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openSaleDocument(s.id, "contract").catch((e) => alert(e instanceof Error ? e.message : "Erro ao gerar contrato"))}
                            className="p-1.5 rounded" style={{ color: "#374151", background: "#F4F6F9" }} title="Imprimir contrato"><Printer size={13} /></button>
                          {!canceled && (
                            <button onClick={() => setEditingSale(s)} className="p-1.5 rounded"
                              style={{ color: "#185FA5", background: "#EBF2FA" }} title="Editar"><Edit2 size={13} /></button>
                          )}
                          <button onClick={() => setDeleteId(s.id)} className="p-1.5 rounded"
                            style={{ color: "#DC2626", background: "#FEE2E2" }} title="Excluir"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <NewSaleModal onClose={() => setShowModal(false)} onSaved={(saleId) => {
          setShowModal(false); fetchSales();
          // Abre a venda recém-criada já com os botões de contrato e promissórias
          if (saleId) { setJustCreated(true); setViewingSaleId(saleId); }
        }} />
      )}

      {viewingSaleId && (
        <SaleDetailsModal
          saleId={viewingSaleId}
          canEdit={canEdit}
          justCreated={justCreated}
          onClose={() => { setViewingSaleId(null); setJustCreated(false); }}
          onChanged={fetchSales}
          onEdit={(sale) => { setViewingSaleId(null); setEditingSale(sale); }}
        />
      )}

      {editingSale && (
        <EditSaleModal
          sale={editingSale}
          onClose={() => setEditingSale(null)}
          onSaved={() => { setEditingSale(null); fetchSales(); }}
        />
      )}

      {showFinancing && financing && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && setShowFinancing(false)}>
          <div className="w-full max-h-[85vh] overflow-y-auto rounded-xl" style={{ background: "#fff", maxWidth: 680, margin: 16 }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
              <div>
                <h3>Financiamentos aguardando o banco</h3>
                <p style={{ fontSize: 12, color: "#6B7280" }}>Quando o banco aprovar ou depositar, abra a venda e atualize a situação da ficha.</p>
              </div>
              <button onClick={() => setShowFinancing(false)} style={{ color: "#6B7280" }}><X size={20} /></button>
            </div>
            <div className="px-6 py-4 flex flex-col gap-2">
              {financing.items.map((f) => {
                const st = { analysis: ["Em análise", "#FEF3C7", "#92400E"], approved: ["Aprovada · falta o depósito", "#DBEAFE", "#1E40AF"], rejected: ["Recusada", "#FEE2E2", "#991B1B"], paid: ["Paga", "#DCFCE7", "#166534"] }[f.status] ?? ["Em análise", "#FEF3C7", "#92400E"];
                const late = f.status === "analysis" && f.days > 3;
                return (
                  <button key={f.paymentId} onClick={() => { setShowFinancing(false); setViewingSaleId(f.saleId); }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#F9FAFB]" style={{ border: `0.5px solid ${late ? "#FCA5A5" : "rgba(0,0,0,0.08)"}` }}>
                    <div className="flex-1" style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "#0F1923" }}>{f.customer} · {f.vehicle}</p>
                      <p style={{ fontSize: 12, color: "#6B7280" }}>{f.bank || "Banco não informado"} · {currency(f.amount)}{f.returnAmount ? ` + retorno ${currency(f.returnAmount)}` : ""} · venda {f.contractNumber ?? ""} ({f.seller})</p>
                      <p style={{ fontSize: 11, color: late ? "#B91C1C" : "#9CA3AF" }}>{f.days === 0 ? "Vendido hoje" : `Há ${f.days} dia${f.days > 1 ? "s" : ""}`}{late ? " · cobre o banco/correspondente" : ""}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full shrink-0" style={{ fontSize: 11, fontWeight: 600, background: st[1], color: st[2] }}>{st[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showAfterSales && afterSales && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && setShowAfterSales(false)}>
          <div className="w-full max-h-[85vh] overflow-y-auto rounded-xl" style={{ background: "#fff", maxWidth: 640, margin: 16 }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
              <div>
                <h3>Transferências pendentes</h3>
                <p style={{ fontSize: 12, color: "#6B7280" }}>O comprador tem 30 dias para transferir o veículo. Clique para abrir a venda.</p>
              </div>
              <button onClick={() => setShowAfterSales(false)} style={{ color: "#6B7280" }}><X size={20} /></button>
            </div>
            <div className="px-6 py-4 flex flex-col gap-2">
              {afterSales.items.map((a) => (
                <button key={a.id} onClick={() => { setShowAfterSales(false); setViewingSaleId(a.id); }}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#F9FAFB]" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                  <div className="flex-1" style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "#0F1923" }}>{a.vehicle}{a.plate ? ` · ${a.plate}` : ""}</p>
                    <p style={{ fontSize: 12, color: "#6B7280" }}>{a.customer}{a.phone ? ` · ${formatPhone(a.phone)}` : ""} · venda {a.contractNumber ?? ""} de {new Date(a.soldAt).toLocaleDateString("pt-BR")}</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF" }}>Falta: {a.pendingItems.join(", ")}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full shrink-0" style={{
                    fontSize: 11, fontWeight: 600,
                    background: a.daysLeft < 0 ? "#FEE2E2" : a.daysLeft <= 7 ? "#FEF3C7" : "#F3F4F6",
                    color: a.daysLeft < 0 ? "#991B1B" : a.daysLeft <= 7 ? "#92400E" : "#374151",
                  }}>{a.daysLeft < 0 ? `${-a.daysLeft}d atrasada` : `${a.daysLeft}d restantes`}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {deleteId && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="rounded-xl p-6" style={{ background: "#fff", maxWidth: 360, margin: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Excluir venda?</h3>
            <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20 }}>
              Isso vai reverter o veículo para disponível, excluir as promissórias e o lançamento financeiro vinculado. Essa ação não pode ser desfeita.
            </p>
            <p style={{ fontSize: 12, color: "#92400E", background: "#FFFBEB", borderRadius: 8, padding: "8px 10px", marginBottom: 20, marginTop: -8 }}>
              Excluir é para venda lançada errado ou de teste. Se o cliente desistiu, abra a venda e use <b>Cancelar venda</b>: o histórico fica guardado.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-5 py-2 rounded-lg"
                style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13 }}>Cancelar</button>
              <button onClick={handleDelete} disabled={deleting} className="px-5 py-2 rounded-lg"
                style={{ background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 500, opacity: deleting ? 0.7 : 1 }}>
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SaleDetailsModal({
  saleId, canEdit, onClose, onEdit, onChanged, justCreated = false,
}: {
  saleId: string;
  canEdit: boolean;
  justCreated?: boolean;
  onClose: () => void;
  onEdit: (sale: api.Sale) => void;
  onChanged?: () => void;
}) {
  const [sale, setSaleState] = useState<sapi.SaleFull | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = useRef(false);
  // Toda mudança feita aqui (despesa, comissão, pós-venda...) atualiza a lista quando fechar
  const setSale = (s: sapi.SaleFull) => { setSaleState((prev) => ({ ...prev, ...s })); dirty.current = true; };
  const close = () => { if (dirty.current) onChanged?.(); onClose(); };
  const isCanceled = sale?.status === "canceled";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    sapi.getSaleFull(saleId)
      .then((s) => { if (active) setSaleState(s); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Erro ao carregar venda"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [saleId]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="w-full max-h-[90vh] overflow-y-auto rounded-xl" style={{ background: "#fff", maxWidth: 680, margin: 16 }}>
        <div className="relative px-6 pt-5 pb-6" style={{ background: "#0F1923" }}>
          <button onClick={close} className="absolute right-5 top-5" style={{ color: "#9CA3AF" }}><X size={20} /></button>
          <p style={{ fontSize: 11, color: "#185FA5", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
            Vendas
          </p>
          <h3 style={{ color: "#fff" }} className="flex items-center gap-2">
            {sale?.contractNumber ? `Venda ${sale.contractNumber}` : "Detalhes da venda"}
            {isCanceled && <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, background: "#DC2626", color: "#fff", fontWeight: 600 }}>Cancelada</span>}
          </h3>
          {sale && <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>{new Date(sale.soldAt).toLocaleDateString("pt-BR")}</p>}
        </div>

        <div className="px-6 py-5">
          {loading && <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "24px 0" }}>Carregando...</p>}
          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          {sale && (
            <div className="flex flex-col gap-5">
              {justCreated && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#ECFDF5", color: "#047857", fontSize: 13, border: "1px solid #A7F3D0" }}>
                  <CheckCircle2 size={15} /> Venda registrada! Imprima o contrato e as promissórias para o cliente assinar.
                </div>
              )}
              {notice && (
                <div className="rounded-lg px-3 py-2" style={{ background: "#EFF6FF", color: "#1E40AF", fontSize: 13, border: "1px solid #BFDBFE" }}>{notice}</div>
              )}
              {/* Documentos para imprimir */}
              <div className="flex flex-wrap gap-2">
                <DocButton label="Contrato de venda" onClick={() => openSaleDocument(sale.id, "contract")} />
                {((sale as { promissoryNotes?: unknown[] }).promissoryNotes?.length ?? 0) > 0 && (
                  <DocButton label="Notas promissórias" onClick={() => openSaleDocument(sale.id, "promissory")} />
                )}
                {!!sale.warrantyDays && <DocButton label="Termo de garantia" onClick={() => openSaleDocument(sale.id, "warranty")} />}
                <DocButton label="Termo de entrega" onClick={() => openSaleDocument(sale.id, "delivery")} />
                <DocButton label="Recibo" onClick={() => openSaleDocument(sale.id, "receipt")} />
              </div>
              {/* Veículo */}
              <div className="rounded-lg p-4" style={{ background: "#F4F6F9" }}>
                <p style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Veículo</p>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#0F1923" }}>{sale.vehicle.brand} {sale.vehicle.model}</p>
                <p style={{ fontSize: 12, color: "#6B7280" }}>
                  {sale.vehicle.year}
                  {sale.vehicle.km != null ? ` · ${sale.vehicle.km.toLocaleString("pt-BR")} km` : ""}
                  {sale.vehicle.color ? ` · ${sale.vehicle.color}` : ""}
                </p>
              </div>

              {/* Cliente / Vendedor */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Cliente</p>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "#0F1923" }}>{sale.customer.name}</p>
                  {(sale.customer.phone || sale.customer.email) && (
                    <p style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                      {[sale.customer.phone, sale.customer.email].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div>
                  <p style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Vendedor</p>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "#0F1923" }}>{sale.seller.name}</p>
                </div>
              </div>

              <SaleAfterPanel sale={sale} canEdit={canEdit} onChange={setSale} />

              {/* Como foi pago */}
              {!!(sale as sapi.SaleFull).payments?.length && (
                <div>
                  <p style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Pagamento</p>
                  <div className="flex flex-col gap-2">
                    {(sale as sapi.SaleFull).payments!.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                        style={{ background: "#F9FAFB", border: "0.5px solid rgba(0,0,0,0.06)" }}>
                        <div>
                          <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{PAYMENT_NAMES[p.method] ?? p.method}</span>
                          {p.bank && <span style={{ fontSize: 12, color: "#6B7280" }}> · {p.bank}</span>}
                          {p.installments && p.installments > 1 && <span style={{ fontSize: 12, color: "#6B7280" }}> · {p.installments}x</span>}
                          {Number(p.feeAmount) > 0 && (
                            <span style={{ fontSize: 11, color: "#B45309", marginLeft: 6 }}>
                              taxa {Number(p.feePercent)}% = {currency(Number(p.feeAmount))}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#0F1923" }}>{currency(Number(p.amount))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Veículos que entraram na troca */}
              {!!(sale as sapi.SaleFull).tradeIns?.length && (
                <div>
                  <p style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>Entrou na troca</p>
                  <div className="flex flex-col gap-2">
                    {(sale as sapi.SaleFull).tradeIns!.map((t) => (
                      <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                        style={{ background: "#F9FAFB", border: "0.5px solid rgba(0,0,0,0.06)" }}>
                        <div>
                          <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{t.brand} {t.model} {t.year}</span>
                          {t.plate && <span style={{ fontSize: 12, color: "#6B7280" }}> · {t.plate}</span>}
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#0F1923" }}>{currency(Number(t.cost))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Observações */}
              {sale.notes && (
                <div>
                  <p style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Observações</p>
                  <p style={{ fontSize: 13, color: "#374151", background: "#F4F6F9", borderRadius: 8, padding: 12 }}>{sale.notes}</p>
                </div>
              )}

              {/* Promissórias */}
              {sale.promissoryNotes && sale.promissoryNotes.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                    Promissórias ({sale.promissoryNotes.length})
                  </p>
                  <div className="flex flex-col gap-2">
                    {sale.promissoryNotes
                      .slice()
                      .sort((a, b) => a.installmentNumber - b.installmentNumber)
                      .map((n) => (
                        <div key={n.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                          style={{ background: "#F9FAFB", border: "0.5px solid rgba(0,0,0,0.06)" }}>
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 12, color: "#6B7280" }}>{n.installmentNumber}/{n.totalInstallments}</span>
                            <span style={{ fontSize: 12, color: "#9CA3AF" }}>vence {new Date(n.dueDate).toLocaleDateString("pt-BR")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>{currency(Number(n.amount))}</span>
                            <span className="px-2 py-0.5 rounded-full"
                              style={{ fontSize: 10, fontWeight: 600, background: n.paid ? "#EAF3DE" : "#FEF3C7", color: n.paid ? "#27500A" : "#92400E" }}>
                              {n.paid ? "Paga" : "Pendente"}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          {canEdit && sale && !isCanceled && (
            <button onClick={() => setCanceling(true)} className="px-4 py-2 rounded-lg mr-auto"
              style={{ border: "1px solid #FCA5A5", color: "#DC2626", fontSize: 13, fontWeight: 500 }}>Cancelar venda</button>
          )}
          <button onClick={close} className="px-5 py-2 rounded-lg"
            style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Fechar</button>
          {canEdit && sale && !isCanceled && (
            <button onClick={() => onEdit(sale)} className="px-5 py-2 rounded-lg flex items-center gap-2"
              style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500 }}>
              <Edit2 size={14} /> Editar
            </button>
          )}
        </div>
      </div>
      {canceling && sale && (
        <CancelSaleModal sale={sale} onClose={() => setCanceling(false)} onDone={async (msg) => {
          setCanceling(false); setNotice(msg); dirty.current = true;
          setSaleState(await sapi.getSaleFull(sale.id));
        }} />
      )}
    </div>
  );
}

/**
 * Edita uma venda já registrada.
 * O backend (sales.service.ts) só aceita alterar `notes` e `paymentMethod` — preço, custo,
 * veículo e cliente não são editáveis depois de criada a venda (mexeria em estoque, financeiro
 * e cálculo de margem já lançados). Por isso o formulário se limita a esses dois campos.
 */
function EditSaleModal({ sale, onClose, onSaved }: { sale: api.Sale; onClose: () => void; onSaved: () => void }) {
  const hasSplitPayments = !!(sale as sapi.SaleFull).payments?.length;
  const [paymentMethod, setPaymentMethod] = useState(hasSplitPayments ? "" : sale.paymentMethod ?? "");
  const [notes, setNotes] = useState(sale.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateSale(sale.id, { paymentMethod: hasSplitPayments ? undefined : paymentMethod || undefined, notes: notes || undefined });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar alterações");
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = { border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" as const, background: "#fff" };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full rounded-xl overflow-hidden" style={{ background: "#fff", maxWidth: 440, margin: 16 }}>
        <div className="relative px-6 pt-5 pb-6" style={{ background: "#0F1923" }}>
          <button onClick={onClose} className="absolute right-5 top-5" style={{ color: "#9CA3AF" }}><X size={20} /></button>
          <p style={{ fontSize: 11, color: "#185FA5", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
            Vendas
          </p>
          <h3 style={{ color: "#fff" }}>Editar venda{sale.contractNumber ? ` ${sale.contractNumber}` : ""}</h3>
          <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>
            {sale.vehicle.brand} {sale.vehicle.model} · {sale.customer.name}
          </p>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          <div className="rounded-lg px-3 py-2.5" style={{ background: "#F4F6F9", fontSize: 12, color: "#6B7280" }}>
            Por enquanto só é possível editar a forma de pagamento e as observações. Preço, custo, veículo e cliente ficam travados
            depois que a venda é registrada — exclua e registre novamente se precisar corrigi-los.
          </div>

          {hasSplitPayments ? (
            <div className="rounded-lg px-3 py-2.5" style={{ background: "#F4F6F9", fontSize: 12, color: "#6B7280" }}>
              Forma de pagamento: <strong style={{ color: "#374151" }}>{paymentSummary(sale)}</strong>. Para mudar os valores, exclua e registre a venda de novo.
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Forma de pagamento</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={fieldStyle}>
                <option value="">Selecionar</option>
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Observações</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5" style={{ ...fieldStyle, resize: "vertical" as const }} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg"
            style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 rounded-lg"
            style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Registrar venda: troca + várias formas de pagamento
// =====================================================================

// Entende "25000", "25.000", "25.000,50", "25000.50" e "R$ 25.000,00"
function parseBRL(value: string) {
  const s = String(value ?? "").trim().replace(/[R$\s]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s);
}
const toMoneyText = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => { const n = parseBRL(s); return Number.isFinite(n) ? n : 0; };

// Formas que podem ser combinadas numa venda
const SALE_PAYMENT_OPTIONS: { value: sapi.SalePaymentMethod; label: string }[] = [
  { value: "pix", label: "PIX" },
  { value: "cash", label: "Dinheiro" },
  { value: "transfer", label: "Transferência" },
  { value: "card_credit", label: "Cartão de crédito" },
  { value: "card_debit", label: "Cartão de débito" },
  { value: "financing", label: "Financiamento" },
  { value: "consortium", label: "Consórcio" },
  { value: "promissory", label: "Promissórias" },
];
const isCard = (m: string) => m === "card_credit" || m === "card_debit";

// Lembra a última taxa da maquininha usada (só neste navegador)
function lastFee(method: string) {
  try { return localStorage.getItem(`fee_${method}`) ?? ""; } catch { return ""; }
}
function rememberFee(method: string, value: string) {
  try { if (value) localStorage.setItem(`fee_${method}`, value); } catch { /* sem problema */ }
}

interface PaymentForm { key: number; method: sapi.SalePaymentMethod; amount: string; installments: string; feePercent: string; bank?: string; returnAmount?: string }
interface ExpenseForm { key: number; description: string; amount: string; paid: boolean }
const isFinancing = (m: string) => m === "financing" || m === "consortium";

// Última garantia usada (só neste navegador)
function lastWarranty() {
  try {
    const raw = localStorage.getItem("sale_warranty");
    if (raw) { const w = JSON.parse(raw); return { days: String(w.days ?? ""), coverage: String(w.coverage ?? "") }; }
  } catch { /* sem problema */ }
  return { days: "90", coverage: "Motor e câmbio" };
}
function rememberWarranty(days: string, coverage: string) {
  try { localStorage.setItem("sale_warranty", JSON.stringify({ days, coverage })); } catch { /* sem problema */ }
}
interface TradeInForm {
  key: number; type: api.VehicleType; plate: string; brand: string; model: string; version: string;
  year: string; manufactureYear: string; color: string; km: string; engineCc: string; fuel: string; value: string;
  lookup: "idle" | "loading" | "done" | "error"; lookupMessage?: string; fipe?: number | null;
}

let formKey = 1;
const newTradeIn = (): TradeInForm => ({
  key: formKey++, type: "moto", plate: "", brand: "", model: "", version: "", year: "", manufactureYear: "",
  color: "", km: "", engineCc: "", fuel: "", value: "", lookup: "idle",
});

// Venda aberta a partir de um lead do CRM: cliente, veículo, vendedor e troca já preenchidos
export interface SalePrefill {
  leadId?: string; vehicleId?: string | null; sellerId?: string | null;
  customer?: { id: string; name: string; phone?: string | null; email?: string | null } | null;
  tradeIn?: { type?: string; plate?: string; brand?: string; model?: string; year?: number; km?: number; color?: string; expectedValue?: number; evaluatedValue?: number } | null;
}

export function NewSaleModal({ onClose, onSaved, prefill }: { onClose: () => void; onSaved: (saleId?: string) => void; prefill?: SalePrefill }) {
  const auth = useAuth();
  const isOwner = auth.user?.role === "owner";
  const isManager = isOwner || auth.user?.role === "admin";
  // Entrada mínima da loja (Configurações → Juros das promissórias)
  const [minDownPct, setMinDownPct] = useState(0);
  useEffect(() => { getSettings().then((d) => setMinDownPct(Number(d.dealership.minDownPaymentPercent) || 0)).catch(() => {}); }, []);

  const [vehicles, setVehicles] = useState<api.Vehicle[]>([]);
  const [customers, setCustomers] = useState<api.Customer[]>([]);
  const [sellers, setSellers] = useState<api.Seller[]>([]);
  const [interestRates, setInterestRates] = useState<any[]>([]);

  const [vehicleId, setVehicleId] = useState(prefill?.vehicleId ?? "");
  const [customerId, setCustomerId] = useState(prefill?.customer?.id ?? "");
  const [sellerId, setSellerId] = useState(prefill?.sellerId ?? "");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [soldAt, setSoldAt] = useState(todayISO());
  const [notes, setNotes] = useState("");

  // Cadastro rápido de cliente novo
  const [customerQuery, setCustomerQuery] = useState("");
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);

  // Troca e formas de pagamento
  const [tradeIns, setTradeIns] = useState<TradeInForm[]>(() => {
    const t = prefill?.tradeIn;
    if (!t || !(t.brand || t.model || t.plate)) return [];
    const value = t.evaluatedValue || t.expectedValue;
    return [{
      ...newTradeIn(), type: (t.type as api.VehicleType) || "moto", plate: t.plate ?? "", brand: t.brand ?? "", model: t.model ?? "",
      year: t.year ? String(t.year) : "", color: t.color ?? "", km: t.km ? String(t.km) : "", value: value ? toMoneyText(value) : "",
    }];
  });
  const [payments, setPayments] = useState<PaymentForm[]>([]);

  // Promissórias (quando uma das formas é "Promissórias")
  const [installments, setInstallments] = useState("4");
  const [manualRate, setManualRate] = useState("");
  const [firstDueDate, setFirstDueDate] = useState(todayISO());
  const [useCustomRate, setUseCustomRate] = useState(false);
  // Entrada digitada direto no quadro das promissórias (o resto vira promissória)
  const [entryText, setEntryText] = useState("");
  const [entryFocused, setEntryFocused] = useState(false);
  const [entryMethod, setEntryMethod] = useState<sapi.SalePaymentMethod>("cash");
  const [entryKey, setEntryKey] = useState<number | null>(null); // linha de pagamento criada para a entrada
  const [customRate, setCustomRate] = useState("");

  // Reserva do veículo (o sinal entra como forma de pagamento)
  const [reservation, setReservation] = useState<sapi.Reservation | null>(null);
  // Despesas da venda, comissão e garantia
  const [saleExpenses, setSaleExpenses] = useState<ExpenseForm[]>([]);
  const [commissionText, setCommissionText] = useState<string | null>(null); // null = automática
  const [warrantyDays, setWarrantyDays] = useState(() => lastWarranty().days);
  const [warrantyCoverage, setWarrantyCoverage] = useState(() => lastWarranty().coverage);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedVehicle = vehicles.find(v => v.id === vehicleId) ?? null;
  const selectedCustomer = customers.find(c => c.id === customerId) ?? null;

  useEffect(() => {
    Promise.all([
      api.listVehicles({ status: "available", pageSize: 200 }),
      api.listCustomers({ pageSize: 200 }),
      api.listSellers(),
      api.listInterestRates(),
      api.listVehicles({ status: "reserved", pageSize: 200 }).catch(() => ({ items: [] as api.Vehicle[] })),
    ]).then(([v, c, s, ir, reserved]) => {
      setVehicles([...v.items, ...reserved.items]);
      const pc = prefill?.customer;
      setCustomers(pc && !c.items.some(x => x.id === pc.id) ? [...c.items, pc as api.Customer] : c.items);
      setSellers(s);
      setInterestRates(ir);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedVehicle) {
      setCost(toMoneyText(Number(selectedVehicle.cost)));
      setPrice(toMoneyText(Number(selectedVehicle.price)));
    }
    // Veículo reservado: já escolhe o cliente da reserva e coloca o sinal no pagamento
    setPayments(prev => prev.filter(p => p.method !== "deposit"));
    setReservation(null);
    if (!vehicleId) return;
    let alive = true;
    sapi.listReservations({ vehicleId, status: "active" }).then((list) => {
      const r = list[0];
      if (!alive || !r) return;
      setReservation(r);
      setCustomers(prev => (prev.some(c => c.id === r.customerId) ? prev : [...prev, { id: r.customerId, name: r.customer.name, phone: r.customer.phone } as api.Customer]));
      setCustomerId(r.customerId);
      const deposit = Number(r.deposit);
      if (deposit > 0) {
        setPayments(prev => [{ key: formKey++, method: "deposit", amount: toMoneyText(deposit), installments: "1", feePercent: "" }, ...prev.filter(p => p.method !== "deposit")]);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [vehicleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Veio do CRM com o veículo escolhido: preenche custo e preço quando a lista carregar
  useEffect(() => {
    if (selectedVehicle && !price) {
      setCost(toMoneyText(Number(selectedVehicle.cost)));
      setPrice(toMoneyText(Number(selectedVehicle.price)));
    }
  }, [vehicles]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNewCustomerForm(name: string) {
    setNewCustomerName(name);
    setNewCustomerPhone("");
    setNewCustomerEmail("");
    setNewCustomerError(null);
    setShowNewCustomerForm(true);
  }

  async function handleCreateCustomer() {
    if (!newCustomerName.trim()) { setNewCustomerError("Informe o nome do cliente"); return; }
    setCreatingCustomer(true);
    setNewCustomerError(null);
    try {
      const customer = await api.createCustomer({
        name: newCustomerName.trim(),
        phone: newCustomerPhone ? newCustomerPhone.replace(/\D/g, "") : undefined,
        email: newCustomerEmail || undefined,
      });
      setCustomers(prev => [...prev, customer]);
      setCustomerId(customer.id);
      setCustomerQuery(customer.name);
      setShowNewCustomerForm(false);
    } catch (e) {
      setNewCustomerError(e instanceof Error ? e.message : "Erro ao cadastrar cliente");
    } finally {
      setCreatingCustomer(false);
    }
  }

  // ---------- Contas ----------
  const priceNum = parseBRL(price);
  const costNum = parseBRL(cost);
  const tradeInTotal = round2(tradeIns.reduce((s, t) => s + num(t.value), 0));
  const paidTotal = round2(payments.reduce((s, p) => s + num(p.amount), 0));
  const remaining = Number.isFinite(priceNum) ? round2(priceNum - tradeInTotal - paidTotal) : 0;
  const feesTotal = round2(payments.reduce((s, p) => s + (isCard(p.method) ? (num(p.amount) * num(p.feePercent)) / 100 : 0), 0));
  const expensesTotal = round2(saleExpenses.reduce((s, e) => s + num(e.amount), 0));
  const returnsTotal = round2(payments.reduce((s, p) => s + (isFinancing(p.method) ? num(p.returnAmount ?? "") : 0), 0));
  // Comissão: % do vendedor sobre o preço (o dono/admin pode mudar o valor)
  const sellerForCommission = sellers.find(x => x.id === (sellerId || auth.user?.id));
  const commissionRate = Number(sellerForCommission?.commissionRate ?? 0);
  const autoCommission = Number.isFinite(priceNum) ? round2((priceNum * commissionRate) / 100) : 0;
  const commissionAmount = commissionText !== null ? num(commissionText) : autoCommission;
  const profit = Number.isFinite(priceNum) && Number.isFinite(costNum)
    ? round2(priceNum - costNum - feesTotal - expensesTotal - commissionAmount + returnsTotal) : null;
  const liveMargin = profit !== null && costNum > 0 ? (profit / costNum) * 100 : null;

  // Promissórias: a taxa incide sobre o valor da linha "Promissórias"
  const promissoryLine = payments.find(p => p.method === "promissory") ?? null;
  const financedAmount = promissoryLine ? num(promissoryLine.amount) : 0;

  // Entrada = valor do veículo − promissórias, e quanto ela representa do valor.
  // Ex.: veículo de 20.000 com 10.000 em promissórias = entrada de 10.000 = 50%
  const downPayment = Number.isFinite(priceNum) && priceNum > 0 ? Math.max(0, round2(priceNum - financedAmount)) : 0;
  const downPaymentPct = Number.isFinite(priceNum) && priceNum > 0 ? (downPayment / priceNum) * 100 : 0;
  // Parte da entrada que já foi lançada em alguma forma (troca, PIX, dinheiro, cartão...)
  const downPaymentLaunched = round2(tradeInTotal + payments.filter(p => p.method !== "promissory").reduce((s, p) => s + num(p.amount), 0));
  const pctText = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const installmentsNum = Number(installments) || 0;
  const activeRate = interestRates.find(r => installmentsNum >= r.minInstallments && installmentsNum <= r.maxInstallments);
  const ownerOverrideActive = isOwner && useCustomRate && customRate !== "";
  const rate = ownerOverrideActive
    ? Number(customRate)
    : activeRate ? Number(activeRate.rate) : (isOwner && manualRate ? Number(manualRate) : null);

  let totalPromissory = 0;
  let installmentValue = 0;
  let lastInstallmentValue = 0;
  let calculatedPromissory = 0; // total antes de arredondar as parcelas
  if (financedAmount > 0 && installmentsNum > 0 && rate !== null) {
    // Total = valor em promissórias + juros. Ex.: 10.000 a 75% = 17.500
    calculatedPromissory = Math.round(financedAmount * (1 + rate / 100));
    // Parcelas iguais, arredondadas para cima em múltiplos de R$ 10 (699 -> 700), igual ao backend
    const raw = Math.round((calculatedPromissory / installmentsNum) * 100) / 100;
    installmentValue = Math.ceil(raw / 10) * 10;
    lastInstallmentValue = installmentValue;
    totalPromissory = installmentValue * installmentsNum;
  }
  const roundingAmount = round2(totalPromissory - calculatedPromissory);
  // Juros ao mês como na tabela da loja: taxa da faixa ÷ maior nº de parcelas da faixa
  // (40% em 4x a 6x = 6,66% a.m.). Taxa personalizada/manual: taxa ÷ nº de parcelas.
  const truncPct = (v: number) => `${(Math.floor(v * 100) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const monthlyOf = (r: { rate: number | string; maxInstallments: number }) => Number(r.rate) / r.maxInstallments;
  const monthlyRate = rate === null || installmentsNum <= 0 ? null
    : !ownerOverrideActive && activeRate ? monthlyOf(activeRate) : rate / installmentsNum;
  const interestAmount = calculatedPromissory > 0 ? round2(calculatedPromissory - financedAmount) : 0;
  const lastInstallmentDiffers = Math.abs(lastInstallmentValue - installmentValue) >= 0.01;

  // ---------- Formas de pagamento ----------
  function addPayment(method: sapi.SalePaymentMethod = "pix") {
    setPayments(prev => [...prev, {
      key: formKey++, method,
      amount: remaining > 0 ? toMoneyText(remaining) : "",
      installments: "1", feePercent: isCard(method) ? lastFee(method) : "",
    }]);
  }
  function updatePayment(key: number, patch: Partial<PaymentForm>) {
    setPayments(prev => prev.map(p => {
      if (p.key !== key) return p;
      const next = { ...p, ...patch };
      if (patch.method && isCard(patch.method) && !p.feePercent) next.feePercent = lastFee(patch.method);
      return next;
    }));
  }
  const removePayment = (key: number) => setPayments(prev => prev.filter(p => p.key !== key));

  // ---------- Entrada x promissórias ----------
  // A pessoa digita quanto o cliente dá de entrada; o que falta do valor do veículo vai para a promissória.
  // A parte da entrada que ainda não foi lançada (troca, PIX...) vira uma linha na forma escolhida (padrão: dinheiro).
  function applyEntry(entry: number, method: sapi.SalePaymentMethod = entryMethod) {
    if (!promissoryLine || !Number.isFinite(priceNum) || priceNum <= 0) return;
    const e = Math.min(Math.max(0, round2(entry)), priceNum);
    // calcula fora do setState (sem efeitos colaterais dentro do updater)
    const prev = payments;
    const linked = prev.find(p => p.key === entryKey && p.method !== "promissory");
    const launchedElsewhere = round2(tradeInTotal + prev
      .filter(p => p.method !== "promissory" && p.key !== linked?.key)
      .reduce((sum, p) => sum + num(p.amount), 0));
    const gap = round2(e - launchedElsewhere);
    let next = prev.map(p => (p.method === "promissory" ? { ...p, amount: toMoneyText(round2(priceNum - e)) } : p));
    if (gap > 0) {
      if (linked) {
        next = next.map(p => (p.key === linked.key ? { ...p, amount: toMoneyText(gap), method } : p));
      } else {
        const key = formKey++;
        setEntryKey(key);
        // a entrada aparece antes da linha das promissórias
        const line: PaymentForm = { key, method, amount: toMoneyText(gap), installments: "1", feePercent: isCard(method) ? lastFee(method) : "" };
        const idx = next.findIndex(p => p.method === "promissory");
        next = [...next.slice(0, idx), line, ...next.slice(idx)];
      }
    } else if (linked) {
      next = next.filter(p => p.key !== linked.key);
      setEntryKey(null);
    }
    setPayments(next);
  }
  const entryLine = payments.find(p => p.key === entryKey && p.method !== "promissory") ?? null;
  const entryMissing = round2(downPayment - downPaymentLaunched);
  // Quanto a entrada precisa ter pela regra da loja e quanto falta para chegar lá
  const requiredEntry = minDownPct > 0 && Number.isFinite(priceNum) ? round2((priceNum * minDownPct) / 100) : 0;
  const belowMinEntry = !!promissoryLine && requiredEntry > 0 && downPayment + 0.009 < requiredEntry;
  const missingToMin = belowMinEntry ? round2(requiredEntry - downPayment) : 0;

  // ---------- Troca ----------
  function updateTradeIn(key: number, patch: Partial<TradeInForm>) {
    setTradeIns(prev => prev.map(t => (t.key === key ? { ...t, ...patch } : t)));
  }

  async function lookupTradeIn(t: TradeInForm) {
    const plate = t.plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) {
      updateTradeIn(t.key, { lookup: "error", lookupMessage: "Placa inválida. Use ABC1234 ou ABC1D23." });
      return;
    }
    updateTradeIn(t.key, { lookup: "loading", lookupMessage: undefined });
    try {
      const r = await api.lookupPlate(plate);
      updateTradeIn(t.key, {
        plate,
        type: r.type ?? t.type,
        brand: r.brand || t.brand,
        model: r.model || t.model,
        version: r.version ?? t.version,
        year: r.year ? String(r.year) : t.year,
        manufactureYear: r.manufactureYear ? String(r.manufactureYear) : t.manufactureYear,
        color: r.color ?? t.color,
        engineCc: r.engineCc ? String(r.engineCc) : t.engineCc,
        fuel: r.fuel ?? t.fuel,
        fipe: r.fipe?.value ?? null,
        lookup: "done",
        lookupMessage: r.cached ? "Dados preenchidos (já consultada antes, sem custo)." : "Dados preenchidos pela placa.",
      });
    } catch (e) {
      updateTradeIn(t.key, { lookup: "error", lookupMessage: e instanceof Error ? e.message : "Não foi possível consultar a placa." });
    }
  }

  // ---------- Confirmar ----------
  const handleSubmit = async () => {
    setError(null);
    if (!vehicleId || !customerId || !price || !cost) {
      setError(
        !customerId && customerQuery.trim()
          ? `Cliente "${customerQuery.trim()}" não está cadastrado. Clique em "Cadastrar como novo cliente" no campo Cliente.`
          : "Preencha veículo, cliente, preço e custo",
      );
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) { setError("Preço de venda inválido. Ex: 28.000,00"); return; }
    if (!Number.isFinite(costNum) || costNum < 0) { setError("Custo inválido. Ex: 25.000,00"); return; }

    for (const [i, t] of tradeIns.entries()) {
      const label = tradeIns.length > 1 ? ` (veículo ${i + 1})` : "";
      if (!t.brand.trim() || !t.model.trim()) { setError(`Informe marca e modelo do veículo da troca${label}.`); return; }
      const y = Number(t.year);
      if (!y || y < 1950 || y > new Date().getFullYear() + 1) { setError(`Ano do veículo da troca inválido${label}.`); return; }
      if (!(num(t.value) > 0)) { setError(`Informe o valor da avaliação do veículo da troca${label}.`); return; }
    }

    if (payments.length === 0 && tradeIns.length === 0) {
      setError("Adicione pelo menos uma forma de pagamento.");
      return;
    }
    if (payments.some(p => !(num(p.amount) > 0))) { setError("Informe o valor de cada forma de pagamento."); return; }
    for (const e of saleExpenses) {
      if (!e.description.trim() && !e.amount.trim()) continue;
      if (!e.description.trim()) { setError("Descreva cada despesa da venda."); return; }
      if (!(num(e.amount) > 0)) { setError(`Informe o valor da despesa "${e.description}".`); return; }
    }
    if (commissionText !== null && !(Number.isFinite(parseBRL(commissionText)) && parseBRL(commissionText) >= 0)) { setError("Valor da comissão inválido."); return; }
    if (payments.filter(p => p.method === "promissory").length > 1) { setError("Use só uma linha de promissórias."); return; }
    if (Math.abs(remaining) >= 0.01) {
      setError(remaining > 0
        ? `O pagamento não fecha: faltam ${currency(remaining)}.`
        : `O pagamento passa do preço em ${currency(-remaining)}. Confira os valores.`);
      return;
    }
    if (promissoryLine && (installmentsNum <= 0 || rate === null || totalPromissory <= 0)) {
      setError("Confira as promissórias: número de parcelas e taxa.");
      return;
    }
    let allowBelowMin = false;
    if (belowMinEntry) {
      if (!isManager) {
        setError(`A entrada está abaixo do mínimo de ${pctText(minDownPct)} (faltam ${currency(missingToMin)}). Só o dono ou o administrador pode liberar esta venda.`);
        return;
      }
      if (!window.confirm(`A entrada (${currency(downPayment)}) está abaixo do mínimo de ${pctText(minDownPct)} (${currency(requiredEntry)}). Liberar esta venda mesmo assim?`)) return;
      allowBelowMin = true;
    }

    setSaving(true);
    try {
      payments.filter(p => isCard(p.method)).forEach(p => rememberFee(p.method, p.feePercent));
      const sale = await sapi.createSaleFull({
        vehicleId,
        customerId,
        sellerId: sellerId || undefined,
        price: round2(priceNum),
        cost: round2(costNum),
        soldAt: soldAt || undefined,
        notes: notes || undefined,
        allowBelowMinDownPayment: allowBelowMin || undefined,
        tradeIns: tradeIns.map(t => ({
          type: t.type,
          brand: t.brand.trim(), model: t.model.trim(), version: t.version.trim() || undefined,
          year: Number(t.year),
          manufactureYear: t.manufactureYear ? Number(t.manufactureYear) : undefined,
          color: t.color.trim() || undefined,
          plate: t.plate.trim() || undefined,
          fuel: t.fuel.trim() || undefined,
          km: t.km ? Number(t.km.replace(/\D/g, "")) : undefined,
          engineCc: t.engineCc ? Number(t.engineCc.replace(/\D/g, "")) : undefined,
          value: round2(num(t.value)),
        })),
        payments: payments.map(p => ({
          method: p.method,
          amount: round2(num(p.amount)),
          installments: p.method === "card_credit" ? Number(p.installments) || 1 : undefined,
          feePercent: isCard(p.method) && p.feePercent ? num(p.feePercent) : undefined,
          bank: isFinancing(p.method) && p.bank?.trim() ? p.bank.trim() : undefined,
          returnAmount: isFinancing(p.method) && num(p.returnAmount ?? "") > 0 ? round2(num(p.returnAmount ?? "")) : undefined,
        })),
        expenses: saleExpenses.filter(e => e.description.trim()).map(e => ({ description: e.description.trim(), amount: round2(num(e.amount)), paid: e.paid })),
        commissionAmount: commissionText !== null ? round2(num(commissionText)) : undefined,
        leadId: prefill?.leadId,
        warrantyDays: Number(warrantyDays) > 0 ? Number(warrantyDays) : undefined,
        warrantyCoverage: Number(warrantyDays) > 0 ? warrantyCoverage.trim() || undefined : undefined,
      });
      rememberWarranty(warrantyDays, warrantyCoverage);

      if (promissoryLine && totalPromissory > 0) {
        await api.createPromissoryNotes({
          saleId: sale.id,
          customerId,
          totalInstallments: installmentsNum,
          totalAmount: totalPromissory,
          firstDueDate,
        });
      }
      onSaved(sale.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar venda");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" as const, background: "#FAFAFA" };
  const selectStyle = { ...inputStyle, background: "#fff" };
  const smallLabel = { fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 } as const;
  const sectionTitle = { fontSize: 13, fontWeight: 600, color: "#0F1923" } as const;

  const trimmedCustomerQuery = customerQuery.trim();
  const customerExists = customers.some(c => c.name.toLowerCase() === trimmedCustomerQuery.toLowerCase());

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-h-[92vh] overflow-y-auto" style={{ background: "#fff", borderRadius: 16, maxWidth: 640, margin: 16 }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)", zIndex: 2 }}>
          <h3>Registrar Venda</h3>
          <button onClick={onClose} style={{ color: "#6B7280" }}><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Veículo */}
          <div>
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Veículo *</label>
            <Autocomplete
              items={vehicles}
              value={vehicleId}
              onChange={setVehicleId}
              getLabel={v => `${v.brand} ${v.model} ${(v as any).version ?? ""} ${v.year}`.trim()}
              placeholder="Digite para buscar..."
            />
            {selectedVehicle && (
              <div className="mt-2 px-3 py-2 rounded-lg flex items-center gap-3" style={{ background: "#F4F6F9", fontSize: 12, color: "#6B7280" }}>
                <Car size={14} style={{ color: "#9CA3AF" }} />
                <span>{selectedVehicle.year} · {selectedVehicle.km.toLocaleString("pt-BR")} km{selectedVehicle.color ? ` · ${selectedVehicle.color}` : ""}</span>
                <span style={{ marginLeft: "auto", fontWeight: 500, color: "#374151" }}>Tabela: {currency(Number(selectedVehicle.price))}</span>
              </div>
            )}
            {reservation && (
              <div className="mt-2 px-3 py-2 rounded-lg" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", fontSize: 12, color: "#1E40AF" }}>
                Reservado para <b>{reservation.customer.name}</b>
                {Number(reservation.deposit) > 0 ? <> com sinal de <b>{currency(Number(reservation.deposit))}</b> (já está nas formas de pagamento)</> : ""}
                {reservation.expiresAt ? ` · até ${new Date(reservation.expiresAt).toLocaleDateString("pt-BR")}` : ""}.
                {" "}Para vender a outro cliente, cancele a reserva no Estoque.
              </div>
            )}
          </div>

          {/* Cliente */}
          <div>
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Cliente *</label>
            {!showNewCustomerForm ? (
              <>
                <Autocomplete
                  items={customers}
                  value={customerId}
                  onChange={setCustomerId}
                  getLabel={c => c.name}
                  placeholder="Digite o nome para buscar ou cadastrar..."
                  onQueryChange={setCustomerQuery}
                  footer={(query) => {
                    const trimmed = query.trim();
                    if (!trimmed) return null;
                    if (customers.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) return null;
                    return (
                      <button type="button" onClick={() => openNewCustomerForm(trimmed)}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2"
                        style={{ fontSize: 13, color: "#185FA5", fontWeight: 500, background: "#F0F7FF" }}>
                        <UserPlus size={14} /> Cadastrar "{trimmed}" como novo cliente
                      </button>
                    );
                  }}
                />
                {selectedCustomer && (selectedCustomer.phone || selectedCustomer.email) && (
                  <div className="mt-2 px-3 py-2 rounded-lg" style={{ background: "#F4F6F9", fontSize: 12, color: "#6B7280" }}>
                    {[selectedCustomer.phone, selectedCustomer.email].filter(Boolean).join(" · ")}
                  </div>
                )}
                {!customerId && trimmedCustomerQuery && !customerExists && (
                  <p style={{ fontSize: 11, color: "#D97706", marginTop: 6 }}>
                    Esse cliente ainda não está cadastrado. Use a opção "Cadastrar como novo cliente" acima.
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-lg p-4" style={{ background: "#F0F7FF", border: "1px solid #185FA5" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 600, color: "#185FA5" }}>
                    <UserPlus size={14} /> Novo cliente
                  </p>
                  <button type="button" onClick={() => setShowNewCustomerForm(false)} style={{ color: "#6B7280" }}><X size={16} /></button>
                </div>
                {newCustomerError && (
                  <div className="rounded-lg px-3 py-2 mb-3" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 12 }}>{newCustomerError}</div>
                )}
                <div className="space-y-3">
                  <div>
                    <label style={smallLabel}>Nome *</label>
                    <input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={smallLabel}>Telefone</label>
                      <input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(formatPhone(e.target.value))} placeholder="(85) 99999-9999"
                        className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} />
                    </div>
                    <div>
                      <label style={smallLabel}>E-mail</label>
                      <input value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} placeholder="cliente@email.com"
                        className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} />
                    </div>
                  </div>
                  <button type="button" onClick={handleCreateCustomer} disabled={creatingCustomer}
                    className="w-full rounded-lg py-2.5" style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: creatingCustomer ? 0.7 : 1 }}>
                    {creatingCustomer ? "Cadastrando..." : "Cadastrar e usar este cliente"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Vendedor e data */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Vendedor responsável</label>
              <Autocomplete
                items={[{ id: "", name: "Usuário logado (padrão)" } as any, ...sellers]}
                value={sellerId}
                onChange={setSellerId}
                getLabel={s => s.name}
                placeholder="Usuário logado (padrão)"
              />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Data da venda</label>
              <input type="date" value={soldAt} onChange={(e) => setSoldAt(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
            </div>
          </div>

          {/* Preços */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Custo *</label>
              <input placeholder="0,00" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal"
                className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, background: "#FEF3C7" }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Preço de venda *</label>
              <input placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal"
                className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
            </div>
          </div>

          {/* ================= Veículo na troca ================= */}
          <div className="rounded-xl" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ background: "#F9FAFB", borderRadius: tradeIns.length ? "12px 12px 0 0" : 12 }}>
              <div className="flex items-center gap-2">
                <RefreshCw size={15} style={{ color: "#185FA5" }} />
                <span style={sectionTitle}>Veículo na troca</span>
                {tradeInTotal > 0 && <span style={{ fontSize: 12, color: "#6B7280" }}>· {currency(tradeInTotal)}</span>}
              </div>
              {tradeIns.length < 5 && (
                <button type="button" onClick={() => setTradeIns(prev => [...prev, newTradeIn()])}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg" style={{ fontSize: 12, fontWeight: 500, color: "#185FA5", background: "#EBF2FA" }}>
                  <Plus size={13} /> {tradeIns.length ? "Outro veículo" : "Adicionar"}
                </button>
              )}
            </div>

            {tradeIns.map((t, i) => (
              <div key={t.key} className="px-4 py-4 space-y-3" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>VEÍCULO {i + 1}</span>
                  <button type="button" onClick={() => setTradeIns(prev => prev.filter(x => x.key !== t.key))}
                    className="flex items-center gap-1" style={{ fontSize: 12, color: "#DC2626" }}><Trash2 size={13} /> Remover</button>
                </div>

                <div className="flex gap-2">
                  {(["moto", "car", "truck", "other"] as api.VehicleType[]).map(tp => (
                    <button key={tp} type="button" onClick={() => updateTradeIn(t.key, { type: tp })}
                      className="px-3 py-1.5 rounded-lg" style={{
                        fontSize: 12, fontWeight: t.type === tp ? 600 : 400,
                        border: t.type === tp ? "1.5px solid #185FA5" : "0.5px solid rgba(0,0,0,0.12)",
                        background: t.type === tp ? "#EBF2FA" : "#fff", color: t.type === tp ? "#185FA5" : "#374151",
                      }}>
                      {{ moto: "Moto", car: "Carro", truck: "Utilitário", other: "Outros" }[tp]}
                    </button>
                  ))}
                </div>

                <div>
                  <label style={smallLabel}>Placa</label>
                  <div className="flex gap-2">
                    <input value={t.plate} maxLength={8} placeholder="ABC1D23"
                      onChange={(e) => updateTradeIn(t.key, { plate: e.target.value.toUpperCase() })}
                      onKeyDown={(e) => { if (e.key === "Enter") lookupTradeIn(t); }}
                      className="flex-1 rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600 }} />
                    <button type="button" onClick={() => lookupTradeIn(t)} disabled={t.lookup === "loading"}
                      className="flex items-center gap-1.5 px-3 rounded-lg" style={{ background: "#185FA5", color: "#fff", fontSize: 12, fontWeight: 500, opacity: t.lookup === "loading" ? 0.7 : 1 }}>
                      {t.lookup === "loading" ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Buscar
                    </button>
                  </div>
                  {t.lookupMessage && (
                    <p style={{ fontSize: 11, marginTop: 4, color: t.lookup === "error" ? "#DC2626" : "#27500A" }}>{t.lookupMessage}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div><label style={smallLabel}>Marca *</label>
                    <input value={t.brand} onChange={(e) => updateTradeIn(t.key, { brand: e.target.value })} placeholder="Ex: Honda"
                      className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} /></div>
                  <div><label style={smallLabel}>Modelo *</label>
                    <input value={t.model} onChange={(e) => updateTradeIn(t.key, { model: e.target.value })} placeholder="Ex: CG 160"
                      className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} /></div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div><label style={smallLabel}>Ano modelo *</label>
                    <input value={t.year} maxLength={4} inputMode="numeric" onChange={(e) => updateTradeIn(t.key, { year: e.target.value.replace(/\D/g, "") })} placeholder="2020"
                      className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} /></div>
                  <div><label style={smallLabel}>Cor</label>
                    <input value={t.color} onChange={(e) => updateTradeIn(t.key, { color: e.target.value })} placeholder="Preta"
                      className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} /></div>
                  <div><label style={smallLabel}>Km</label>
                    <input value={t.km} inputMode="numeric" onChange={(e) => updateTradeIn(t.key, { km: e.target.value })} placeholder="0"
                      className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} /></div>
                  <div><label style={smallLabel}>Avaliação *</label>
                    <input value={t.value} inputMode="decimal" onChange={(e) => updateTradeIn(t.key, { value: e.target.value })} placeholder="0,00"
                      className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#FEF3C7" }} /></div>
                </div>
                {t.fipe ? (
                  <p style={{ fontSize: 11, color: "#6B7280" }}>
                    Tabela FIPE: <strong>{currency(t.fipe)}</strong>{" "}
                    <button type="button" onClick={() => updateTradeIn(t.key, { value: toMoneyText(t.fipe!) })} style={{ color: "#185FA5", fontWeight: 600 }}>usar como avaliação</button>
                  </p>
                ) : null}
              </div>
            ))}
            {tradeIns.length > 0 && (
              <p className="px-4 pb-3" style={{ fontSize: 11, color: "#9CA3AF" }}>
                Ao confirmar, cada veículo entra no Estoque com custo = avaliação. O resto dos dados você completa depois, no painel dele.
              </p>
            )}
          </div>

          {/* ================= Formas de pagamento ================= */}
          <div className="rounded-xl" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ background: "#F9FAFB", borderRadius: "12px 12px 0 0" }}>
              <div className="flex items-center gap-2">
                <Wallet size={15} style={{ color: "#185FA5" }} />
                <span style={sectionTitle}>Formas de pagamento</span>
              </div>
              <button type="button" onClick={() => addPayment()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg" style={{ fontSize: 12, fontWeight: 500, color: "#185FA5", background: "#EBF2FA" }}>
                <Plus size={13} /> Adicionar forma
              </button>
            </div>

            <div className="px-4 py-3 space-y-3" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
              {payments.length === 0 && (
                <p style={{ fontSize: 12, color: "#9CA3AF" }}>
                  Adicione como o cliente pagou. Dá pra combinar várias formas, por exemplo PIX + dinheiro + cartão.
                </p>
              )}

              {payments.map(p => {
                const fee = isCard(p.method) ? (num(p.amount) * num(p.feePercent)) / 100 : 0;
                const perInstallment = p.method === "card_credit" && Number(p.installments) > 1 ? num(p.amount) / Number(p.installments) : 0;
                return (
                  <div key={p.key} className="rounded-lg p-3" style={{ background: "#FAFBFC", border: "0.5px solid rgba(0,0,0,0.06)" }}>
                    <div className="flex items-end gap-2">
                      <div style={{ flex: 1.2 }}>
                        <label style={smallLabel}>Forma</label>
                        {p.method === "deposit" ? (
                          <div className="w-full rounded-lg px-3 py-2" style={{ ...selectStyle, background: "#EFF6FF", color: "#1E40AF", fontWeight: 500 }}>Sinal pago na reserva</div>
                        ) : (
                          <select value={p.method} onChange={(e) => updatePayment(p.key, { method: e.target.value as sapi.SalePaymentMethod })}
                            className="w-full rounded-lg px-3 py-2" style={selectStyle}>
                            {SALE_PAYMENT_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}
                                disabled={o.value === "promissory" && p.method !== "promissory" && !!promissoryLine}>{o.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={smallLabel}>{p.method === "promissory" ? "Valor parcelado" : p.key === entryKey ? "Valor (entrada)" : "Valor"}</label>
                        <input value={p.amount} inputMode="decimal" placeholder="0,00" onChange={(e) => updatePayment(p.key, { amount: e.target.value })}
                          readOnly={p.method === "deposit"}
                          className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: p.method === "deposit" ? "#F3F4F6" : "#fff" }} />
                      </div>
                      {p.method === "card_credit" && (
                        <div style={{ width: 82 }}>
                          <label style={smallLabel}>Parcelas</label>
                          <select value={p.installments} onChange={(e) => updatePayment(p.key, { installments: e.target.value })}
                            className="w-full rounded-lg px-2 py-2" style={selectStyle}>
                            {Array.from({ length: 21 }, (_, n) => n + 1).map(n => <option key={n} value={n}>{n}x</option>)}
                          </select>
                        </div>
                      )}
                      {isCard(p.method) && (
                        <div style={{ width: 82 }}>
                          <label style={smallLabel}>Taxa %</label>
                          <input value={p.feePercent} inputMode="decimal" placeholder="0" onChange={(e) => updatePayment(p.key, { feePercent: e.target.value })}
                            className="w-full rounded-lg px-2 py-2" style={{ ...inputStyle, background: "#fff" }} />
                        </div>
                      )}
                      {p.method !== "deposit" ? (
                        <button type="button" title="Remover" onClick={() => removePayment(p.key)} className="p-2 rounded-lg" style={{ color: "#DC2626" }}>
                          <Trash2 size={15} />
                        </button>
                      ) : <span style={{ width: 31 }} />}
                    </div>
                    {isFinancing(p.method) && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <label style={smallLabel}>Banco / financeira</label>
                          <input value={p.bank ?? ""} placeholder="Ex: Banco Pan, Santander..." onChange={(e) => updatePayment(p.key, { bank: e.target.value })}
                            className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} />
                        </div>
                        <div>
                          <label style={smallLabel}>Retorno (o banco paga à loja)</label>
                          <input value={p.returnAmount ?? ""} inputMode="decimal" placeholder="0,00" onChange={(e) => updatePayment(p.key, { returnAmount: e.target.value })}
                            className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} />
                        </div>
                        <p className="col-span-2" style={{ fontSize: 11, color: "#9CA3AF" }}>A ficha começa "Em análise". Quando o banco aprovar ou depositar, atualize na própria venda.</p>
                      </div>
                    )}
                    {(fee > 0 || perInstallment > 0 || (remaining !== 0 && Math.abs(remaining) >= 0.01)) && (
                      <div className="flex items-center gap-3 mt-2 flex-wrap" style={{ fontSize: 11, color: "#6B7280" }}>
                        {perInstallment > 0 && <span>{p.installments}x de {currency(perInstallment)}</span>}
                        {fee > 0 && <span style={{ color: "#B45309" }}>Taxa da maquininha: {currency(fee)} · a loja recebe {currency(num(p.amount) - fee)}</span>}
                        {remaining > 0 && (
                          <button type="button" onClick={() => updatePayment(p.key, { amount: toMoneyText(round2(num(p.amount) + remaining)) })}
                            style={{ color: "#185FA5", fontWeight: 600 }}>+ completar o que falta</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Promissórias: configuração quando a forma "Promissórias" está na lista */}
              {promissoryLine && (
                <div className="rounded-lg p-4 space-y-4" style={{ background: "#fff", border: "1px solid rgba(24,95,165,0.25)" }}>
                  <div className="flex items-center gap-2">
                    <FileText size={15} style={{ color: "#185FA5" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#185FA5" }}>Promissórias sobre {currency(financedAmount)}</span>
                  </div>

                  {/* Entrada e porcentagem dela sobre o valor do veículo */}
                  {Number.isFinite(priceNum) && priceNum > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg px-3 py-2" style={{ background: "#F9FAFB", border: "0.5px solid rgba(0,0,0,0.06)" }}>
                        <div style={{ fontSize: 11, color: "#6B7280" }}>Valor do veículo</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F1923" }}>{currency(priceNum)}</div>
                      </div>
                      <label className="rounded-lg px-3 py-2" style={{ background: "#fff", border: "1px solid #185FA5", cursor: "text" }}>
                        <div style={{ fontSize: 11, color: "#185FA5", fontWeight: 600 }}>Entrada do cliente (R$)</div>
                        <input inputMode="decimal" placeholder="0,00"
                          value={entryFocused ? entryText : (downPayment > 0 ? toMoneyText(downPayment) : "")}
                          onFocus={() => { setEntryFocused(true); setEntryText(downPayment > 0 ? toMoneyText(downPayment) : ""); }}
                          onBlur={() => setEntryFocused(false)}
                          onChange={(e) => { setEntryText(e.target.value); applyEntry(num(e.target.value)); }}
                          style={{ width: "100%", fontSize: 13, fontWeight: 700, color: "#0F1923", border: "none", outline: "none", padding: 0, background: "transparent" }} />
                      </label>
                      <div className="rounded-lg px-3 py-2" style={{ background: "#EBF2FA", border: "1px solid #185FA5" }}>
                        <div style={{ fontSize: 11, color: "#6B7280" }}>Entrada (%)</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#185FA5" }}>{pctText(downPaymentPct)}</div>
                      </div>
                    </div>
                  )}
                  {Number.isFinite(priceNum) && financedAmount > priceNum && (
                    <p style={{ fontSize: 11, color: "#DC2626" }}>O valor em promissórias passou do valor do veículo. Confira.</p>
                  )}
                  <p style={{ fontSize: 11, color: "#6B7280", marginTop: -6 }}>
                    Digite a entrada do cliente: o que falta para o valor do veículo vai automaticamente para as promissórias.
                  </p>
                  {requiredEntry > 0 && (
                    belowMinEntry ? (
                      <div className="rounded-lg px-3 py-2" style={{ background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 12, color: "#991B1B" }}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span>
                            Entrada mínima da loja: <b>{pctText(minDownPct)}</b> = <b>{currency(requiredEntry)}</b>.
                            {" "}Faltam <b>{currency(missingToMin)}</b> para atingir.
                          </span>
                          <button type="button" onClick={() => applyEntry(requiredEntry)}
                            className="px-3 py-1 rounded-lg" style={{ background: "#fff", border: "1px solid #FCA5A5", color: "#991B1B", fontWeight: 600 }}>
                            Usar entrada mínima
                          </button>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          {isManager
                            ? "Você pode liberar esta venda: vamos pedir confirmação ao finalizar."
                            : "Com essa entrada só o dono ou o administrador pode fechar a venda."}
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: "#27500A" }}>✓ Entrada acima do mínimo da loja ({pctText(minDownPct)} = {currency(requiredEntry)}).</p>
                    )
                  )}
                  {(entryLine || (downPayment > 0 && entryMissing >= 0.01)) && (
                    <div className="flex items-center gap-2 flex-wrap rounded-lg px-3 py-2"
                      style={{ background: entryMissing >= 0.01 ? "#FFFBEB" : "#F9FAFB", border: `0.5px solid ${entryMissing >= 0.01 ? "#FCD34D" : "rgba(0,0,0,0.06)"}`, fontSize: 12 }}>
                      <span style={{ color: entryMissing >= 0.01 ? "#92400E" : "#374151" }}>
                        {entryMissing >= 0.01 ? `Entrada de ${currency(entryMissing)} ainda sem forma de pagamento.` : "Entrada paga em"}
                      </span>
                      <select value={entryLine?.method ?? entryMethod}
                        onChange={(e) => {
                          const m = e.target.value as sapi.SalePaymentMethod;
                          setEntryMethod(m);
                          if (entryLine) updatePayment(entryLine.key, { method: m });
                        }}
                        className="rounded-lg px-2 py-1" style={{ ...selectStyle, width: "auto" }}>
                        {SALE_PAYMENT_OPTIONS.filter(o => o.value !== "promissory" && o.value !== "financing" && o.value !== "consortium").map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {entryMissing >= 0.01 && (
                        <button type="button" onClick={() => applyEntry(downPayment)}
                          className="px-3 py-1 rounded-lg" style={{ background: "#185FA5", color: "#fff", fontWeight: 600 }}>
                          Lançar entrada
                        </button>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={smallLabel}>Nº de parcelas</label>
                      <input type="number" min="1" max="36" value={installments} onChange={(e) => setInstallments(e.target.value)}
                        className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} />
                    </div>
                    <div>
                      <label style={smallLabel}>1º vencimento</label>
                      <input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)}
                        className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} />
                    </div>
                  </div>

                  {interestRates.length > 0 && !useCustomRate && (
                    <div>
                      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: "#6B7280" }}>Taxa por faixa de parcelas</span>
                        {isOwner && (
                          <button type="button" onClick={() => { setUseCustomRate(true); setCustomRate(String(rate ?? "")); }}
                            style={{ fontSize: 11, color: "#185FA5", fontWeight: 600 }}>Personalizar taxa</button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {interestRates.map(r => {
                          const active = installmentsNum >= r.minInstallments && installmentsNum <= r.maxInstallments;
                          return (
                            <div key={r.id} className="flex items-center justify-between px-2.5 py-2 rounded-lg"
                              style={{ background: active ? "#EBF2FA" : "#F9FAFB", border: active ? "1.5px solid #185FA5" : "0.5px solid rgba(0,0,0,0.08)" }}>
                              <span style={{ fontSize: 11, color: active ? "#185FA5" : "#6B7280" }}>{r.minInstallments}–{r.maxInstallments}x</span>
                              <span className="text-right" style={{ lineHeight: 1.2 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: active ? "#185FA5" : "#374151", display: "block" }}>{Number(r.rate)}%</span>
                                <span style={{ fontSize: 10, color: active ? "#185FA5" : "#9CA3AF" }}>{truncPct(monthlyOf(r))} a.m.</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isOwner && useCustomRate && (
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" max="500" step="0.01" value={customRate} onChange={(e) => setCustomRate(e.target.value)}
                        className="rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff", width: 110 }} autoFocus />
                      <span style={{ fontSize: 12, color: "#374151" }}>% sobre o valor em promissórias</span>
                      <button type="button" onClick={() => { setUseCustomRate(false); setCustomRate(""); }} style={{ fontSize: 11, color: "#6B7280", marginLeft: "auto" }}>Usar tabela</button>
                    </div>
                  )}

                  {!activeRate && installmentsNum > 0 && !useCustomRate && (
                    isOwner ? (
                      <div className="flex items-center gap-2 rounded-lg p-3" style={{ background: "#FEF3C7" }}>
                        <span style={{ fontSize: 12, color: "#92400E" }}>Sem taxa para {installmentsNum}x. Informe:</span>
                        <input type="number" min="0" max="500" step="0.01" value={manualRate} onChange={(e) => setManualRate(e.target.value)}
                          className="rounded-lg px-3 py-1.5" style={{ ...inputStyle, background: "#fff", width: 90 }} />
                        <span style={{ fontSize: 12, color: "#92400E" }}>%</span>
                      </div>
                    ) : (
                      <div className="rounded-lg p-3" style={{ background: "#FEF3C7", fontSize: 12, color: "#92400E" }}>
                        Não há taxa configurada para {installmentsNum}x. Peça para o dono da loja definir a taxa.
                      </div>
                    )
                  )}

                  {rate !== null && financedAmount > 0 && installmentsNum > 0 && (
                    <div className="rounded-lg px-3 py-2.5 space-y-1" style={{ background: "#F7FAFD", fontSize: 12 }}>
                      <div className="flex justify-between"><span style={{ color: "#6B7280" }}>Valor em promissórias</span><span>{currency(financedAmount)}</span></div>
                      <div className="flex justify-between"><span style={{ color: "#6B7280" }}>Taxa ({installmentsNum}x){ownerOverrideActive ? " · personalizada" : ""}</span><span>{rate}%{monthlyRate !== null ? ` · ${truncPct(monthlyRate)} ao mês` : ""}</span></div>
                      <div className="flex justify-between"><span style={{ color: "#6B7280" }}>Juros</span><span>+ {currency(interestAmount)}</span></div>
                      {roundingAmount >= 0.01 && (
                        <div className="flex justify-between"><span style={{ color: "#6B7280" }}>Arredondamento das parcelas</span><span>+ {currency(roundingAmount)}</span></div>
                      )}
                      <div className="flex justify-between pt-1" style={{ borderTop: "0.5px solid rgba(24,95,165,0.15)" }}><span style={{ color: "#185FA5", fontWeight: 600 }}>Total das promissórias</span><span style={{ color: "#185FA5", fontWeight: 700 }}>{currency(totalPromissory)}</span></div>
                      {lastInstallmentDiffers ? (
                        <div className="flex justify-between"><span style={{ color: "#6B7280" }}>{installmentsNum - 1}x de {currency(installmentValue)} + última</span><span>{currency(lastInstallmentValue)}</span></div>
                      ) : (
                        <div className="flex justify-between"><span style={{ color: "#6B7280" }}>{installmentsNum}x de</span><span style={{ fontWeight: 600 }}>{currency(installmentValue)}</span></div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ================= Despesas, comissão e garantia ================= */}
          <div className="rounded-xl" style={{ border: "0.5px solid rgba(0,0,0,0.1)" }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ background: "#F9FAFB", borderRadius: "12px 12px 0 0" }}>
              <div className="flex items-center gap-2">
                <FileText size={15} style={{ color: "#185FA5" }} />
                <span style={sectionTitle}>Despesas da venda</span>
                {expensesTotal > 0 && <span style={{ fontSize: 12, color: "#6B7280" }}>· {currency(expensesTotal)}</span>}
              </div>
              <button type="button" onClick={() => setSaleExpenses(prev => [...prev, { key: formKey++, description: "", amount: "", paid: true }])}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg" style={{ fontSize: 12, fontWeight: 500, color: "#185FA5", background: "#EBF2FA" }}>
                <Plus size={13} /> Adicionar
              </button>
            </div>
            <div className="px-4 py-3 space-y-2" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
              {saleExpenses.length === 0 && <p style={{ fontSize: 12, color: "#9CA3AF" }}>Transferência, vistoria, revisão, brinde, combustível... Entram no Financeiro e saem do lucro. Dá para lançar depois, na venda.</p>}
              {saleExpenses.map(e => (
                <div key={e.key} className="flex items-center gap-2">
                  <input value={e.description} placeholder="Descrição" onChange={(ev) => setSaleExpenses(prev => prev.map(x => x.key === e.key ? { ...x, description: ev.target.value } : x))}
                    className="flex-1 rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} />
                  <input value={e.amount} placeholder="0,00" inputMode="decimal" onChange={(ev) => setSaleExpenses(prev => prev.map(x => x.key === e.key ? { ...x, amount: ev.target.value } : x))}
                    className="rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff", width: 110 }} />
                  <label className="flex items-center gap-1" style={{ fontSize: 12, color: "#374151", whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={e.paid} onChange={(ev) => setSaleExpenses(prev => prev.map(x => x.key === e.key ? { ...x, paid: ev.target.checked } : x))} /> Paga
                  </label>
                  <button type="button" onClick={() => setSaleExpenses(prev => prev.filter(x => x.key !== e.key))} className="p-2" style={{ color: "#DC2626" }}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 grid grid-cols-2 gap-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
              <div>
                <label style={smallLabel}>Comissão do vendedor{sellerForCommission ? ` (${sellerForCommission.name})` : ""}</label>
                {isManager ? (
                  <input value={commissionText ?? (autoCommission ? toMoneyText(autoCommission) : "")} inputMode="decimal" placeholder="0,00"
                    onChange={(e) => setCommissionText(e.target.value)}
                    className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff" }} />
                ) : (
                  <div className="rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#F3F4F6" }}>{currency(commissionAmount)}</div>
                )}
                <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                  {commissionText === null ? `${commissionRate.toLocaleString("pt-BR")}% do preço, cadastrado no vendedor.` : <>Valor alterado. <button type="button" onClick={() => setCommissionText(null)} style={{ color: "#185FA5", fontWeight: 600 }}>Voltar ao automático</button></>}
                </p>
              </div>
              <div>
                <label style={smallLabel}>Garantia da loja</label>
                <div className="flex gap-2">
                  <input value={warrantyDays} onChange={(e) => setWarrantyDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0"
                    className="rounded-lg px-3 py-2 shrink-0" style={{ ...inputStyle, background: "#fff", width: 70 }} title="Dias de garantia (0 = sem garantia da loja)" />
                  <input value={warrantyCoverage} onChange={(e) => setWarrantyCoverage(e.target.value)} placeholder="O que cobre" disabled={!(Number(warrantyDays) > 0)}
                    className="flex-1 min-w-0 rounded-lg px-3 py-2" style={{ ...inputStyle, background: Number(warrantyDays) > 0 ? "#fff" : "#F3F4F6" }} />
                </div>
                <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{Number(warrantyDays) > 0 ? `${warrantyDays} dias. Sai no contrato e no termo de garantia.` : "0 = só a garantia legal."}</p>
              </div>
            </div>
          </div>

          {/* ================= Resumo ================= */}
          {Number.isFinite(priceNum) && priceNum > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${Math.abs(remaining) < 0.01 ? "#27500A" : "#185FA5"}` }}>
              <div className="px-4 py-3 space-y-1.5" style={{ background: "#F7FAFD", fontSize: 13 }}>
                <div className="flex justify-between"><span style={{ color: "#6B7280" }}>Preço da venda</span><span style={{ fontWeight: 600 }}>{currency(priceNum)}</span></div>
                {tradeIns.map((t, i) => num(t.value) > 0 && (
                  <div key={t.key} className="flex justify-between">
                    <span style={{ color: "#6B7280" }}>(−) Troca: {[t.brand, t.model, t.year].filter(Boolean).join(" ") || `veículo ${i + 1}`}</span>
                    <span>{currency(num(t.value))}</span>
                  </div>
                ))}
                {payments.map(p => num(p.amount) > 0 && (
                  <div key={p.key} className="flex justify-between">
                    <span style={{ color: "#6B7280" }}>
                      (−) {PAYMENT_NAMES[p.method] ?? p.method}
                      {p.method === "card_credit" && Number(p.installments) > 1 ? ` em ${p.installments}x` : ""}
                    </span>
                    <span>{currency(num(p.amount))}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between px-4 py-3" style={{
                background: Math.abs(remaining) < 0.01 ? "#EAF3DE" : remaining > 0 ? "#FEF3C7" : "#FEE2E2",
                color: Math.abs(remaining) < 0.01 ? "#27500A" : remaining > 0 ? "#92400E" : "#991B1B",
                fontSize: 14, fontWeight: 600,
              }}>
                <span>{Math.abs(remaining) < 0.01 ? "✓ Pagamento fechado" : remaining > 0 ? "Falta" : "Passou do preço"}</span>
                <span>{Math.abs(remaining) < 0.01 ? currency(priceNum) : currency(Math.abs(remaining))}</span>
              </div>
            </div>
          )}

          {liveMargin !== null && profit !== null && (
            <div className="px-3 py-2 rounded-lg" style={{ background: profit >= 0 ? "#EAF3DE" : "#FEE2E2", fontSize: 13, color: profit >= 0 ? "#27500A" : "#DC2626" }}>
              Margem: <strong>{liveMargin.toFixed(1)}%</strong> · Lucro real: {currency(profit)}
              {(feesTotal > 0 || expensesTotal > 0 || commissionAmount > 0 || returnsTotal > 0) && (
                <span style={{ color: "#6B7280" }}> ({[
                  feesTotal > 0 ? `− taxa cartão ${currency(feesTotal)}` : null,
                  expensesTotal > 0 ? `− despesas ${currency(expensesTotal)}` : null,
                  commissionAmount > 0 ? `− comissão ${currency(commissionAmount)}` : null,
                  returnsTotal > 0 ? `+ retorno ${currency(returnsTotal)}` : null,
                ].filter(Boolean).join(" ")})</span>
              )}
            </div>
          )}

          {/* Observações */}
          <div>
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Observações</label>
            <textarea placeholder="Alguma informação extra sobre a negociação..." rows={2}
              value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, resize: "vertical" as const }} />
          </div>

          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 sticky bottom-0" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", background: "#fff" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg"
            style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving || (belowMinEntry && !isManager)} className="px-6 py-2 rounded-lg"
            title={belowMinEntry && !isManager ? "Entrada abaixo do mínimo: peça ao dono ou administrador" : undefined}
            style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: saving || (belowMinEntry && !isManager) ? 0.5 : 1 }}>
            {saving ? "Registrando..." : belowMinEntry && isManager ? "Liberar e confirmar venda" : "Confirmar venda"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocButton({ label, onClick }: { label: string; onClick: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <button disabled={busy}
        onClick={async () => { setErr(null); setBusy(true); try { await onClick(); } catch (e) { setErr(e instanceof Error ? e.message : "Erro ao gerar documento"); } finally { setBusy(false); } }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: busy ? 0.7 : 1 }}>
        <Printer size={14} /> {busy ? "Gerando..." : label}
      </button>
      {err && <p style={{ fontSize: 12, color: "#DC2626", marginTop: 4 }}>{err}</p>}
    </div>
  );
}
