import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Plus, Car, Bike, Truck, X, FileText, Edit2, Trash2, ChevronDown, UserPlus } from "lucide-react";
import * as api from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

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
  }, [value]);

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
  const [editingSale, setEditingSale] = useState<api.Sale | null>(null);

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
              { label: "Vendas", value: String(summary.count), color: "#185FA5" },
              { label: "Receita", value: currency(summary.totalRevenue), color: "#27500A" },
              { label: "Lucro", value: currency(summary.totalProfit), color: "#7C3AED" },
              { label: "Margem média", value: `${summary.avgMargin.toFixed(1)}%`, color: "#D97706" },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-4 rounded-xl" style={{ background: "#F4F6F9" }}>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color }}>{value}</div>
              </div>
            ))}
          </div>
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
                return (
                  <tr key={s.id} onClick={() => setViewingSaleId(s.id)}
                    className="cursor-pointer hover:bg-[#F9FAFB]"
                    style={{ borderBottom: i < filtered.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none" }}>
                    <td className="px-4 py-3">
                      <span style={{ fontSize: 12, color: "#185FA5", fontWeight: 500, background: "#EBF2FA", padding: "2px 8px", borderRadius: 99 }}>
                        {s.contractNumber ?? "—"}
                      </span>
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
                        {s.paymentMethod ? (PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod) : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, fontWeight: 500 }}>{currency(Number(s.price))}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: Number(s.profit) >= 0 ? "#27500A" : "#DC2626", fontWeight: 500 }}>{currency(Number(s.profit))}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: m > 20 ? "#27500A" : m > 10 ? "#374151" : "#DC2626", fontWeight: 500 }}>{m.toFixed(1)}%</td>
                    {canEdit && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditingSale(s)} className="p-1.5 rounded"
                            style={{ color: "#185FA5", background: "#EBF2FA" }} title="Editar"><Edit2 size={13} /></button>
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
        <NewSaleModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchSales(); }} />
      )}

      {viewingSaleId && (
        <SaleDetailsModal
          saleId={viewingSaleId}
          canEdit={canEdit}
          onClose={() => setViewingSaleId(null)}
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

      {/* Confirmação de exclusão */}
      {deleteId && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="rounded-xl p-6" style={{ background: "#fff", maxWidth: 360, margin: 16 }}>
            <h3 style={{ marginBottom: 8 }}>Excluir venda?</h3>
            <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20 }}>
              Isso vai reverter o veículo para disponível, excluir as promissórias e o lançamento financeiro vinculado. Essa ação não pode ser desfeita.
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
  saleId, canEdit, onClose, onEdit,
}: {
  saleId: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (sale: api.Sale) => void;
}) {
  const [sale, setSale] = useState<api.Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.getSale(saleId)
      .then((s) => { if (active) setSale(s); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Erro ao carregar venda"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [saleId]);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-h-[90vh] overflow-y-auto rounded-xl" style={{ background: "#fff", maxWidth: 560, margin: 16 }}>
        <div className="relative px-6 pt-5 pb-6" style={{ background: "#0F1923" }}>
          <button onClick={onClose} className="absolute right-5 top-5" style={{ color: "#9CA3AF" }}><X size={20} /></button>
          <p style={{ fontSize: 11, color: "#185FA5", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
            Vendas
          </p>
          <h3 style={{ color: "#fff" }}>{sale?.contractNumber ? `Venda ${sale.contractNumber}` : "Detalhes da venda"}</h3>
          {sale && <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>{new Date(sale.soldAt).toLocaleDateString("pt-BR")}</p>}
        </div>

        <div className="px-6 py-5">
          {loading && <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "24px 0" }}>Carregando...</p>}
          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          {sale && (
            <div className="flex flex-col gap-5">
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

              {/* Valores */}
              <div className="rounded-lg overflow-hidden" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                {[
                  { label: "Preço de venda", value: currency(Number(sale.price)) },
                  { label: "Custo", value: currency(Number(sale.cost)) },
                  { label: "Lucro", value: currency(Number(sale.profit)), color: Number(sale.profit) >= 0 ? "#27500A" : "#DC2626" },
                  { label: "Margem", value: `${Number(sale.margin).toFixed(1)}%` },
                  { label: "Forma de pagamento", value: sale.paymentMethod ? (PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod) : "—" },
                ].map((row, i, arr) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderBottom: i < arr.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none", background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
                    <span style={{ fontSize: 13, color: "#6B7280" }}>{row.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: row.color ?? "#0F1923" }}>{row.value}</span>
                  </div>
                ))}
              </div>

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
          <button onClick={onClose} className="px-5 py-2 rounded-lg"
            style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Fechar</button>
          {canEdit && sale && (
            <button onClick={() => onEdit(sale)} className="px-5 py-2 rounded-lg flex items-center gap-2"
              style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500 }}>
              <Edit2 size={14} /> Editar
            </button>
          )}
        </div>
      </div>
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
  const [paymentMethod, setPaymentMethod] = useState(sale.paymentMethod ?? "");
  const [notes, setNotes] = useState(sale.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateSale(sale.id, { paymentMethod: paymentMethod || undefined, notes: notes || undefined });
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

          <div>
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Forma de pagamento</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5" style={fieldStyle}>
              <option value="">Selecionar</option>
              {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

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

function NewSaleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const auth = useAuth();
  const isOwner = auth.user?.role === "owner";

  const [vehicles, setVehicles] = useState<api.Vehicle[]>([]);
  const [customers, setCustomers] = useState<api.Customer[]>([]);
  const [sellers, setSellers] = useState<api.Seller[]>([]);
  const [interestRates, setInterestRates] = useState<any[]>([]);

  const [vehicleId, setVehicleId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [soldAt, setSoldAt] = useState(todayISO());
  const [notes, setNotes] = useState("");

  // Cadastro rápido de cliente novo (quando o cliente ainda não existe no sistema)
  const [customerQuery, setCustomerQuery] = useState("");
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);

  // Promissórias
  const [generateNotes, setGenerateNotes] = useState(false);
  const [entrada, setEntrada] = useState("");
  const [installments, setInstallments] = useState("4");
  const [manualRate, setManualRate] = useState("");
  const [firstDueDate, setFirstDueDate] = useState(todayISO());

  // Taxa livre — visível e editável apenas para o dono (owner)
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [customRate, setCustomRate] = useState("");

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
    ]).then(([v, c, s, ir]) => {
      setVehicles(v.items);
      setCustomers(c.items);
      setSellers(s);
      setInterestRates(ir);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedVehicle) {
      setCost(String(selectedVehicle.cost));
      setPrice(String(selectedVehicle.price));
    }
  }, [vehicleId]);

  function openNewCustomerForm(name: string) {
    setNewCustomerName(name);
    setNewCustomerPhone("");
    setNewCustomerEmail("");
    setNewCustomerError(null);
    setShowNewCustomerForm(true);
  }

  async function handleCreateCustomer() {
    if (!newCustomerName.trim()) {
      setNewCustomerError("Informe o nome do cliente");
      return;
    }
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

  // Cálculo das promissórias
  const vehiclePrice = Number(price);
  const entradaNum = Number(entrada) || 0;
  const installmentsNum = Number(installments) || 0;

  const activeRate = interestRates.find(r =>
    installmentsNum >= r.minInstallments && installmentsNum <= r.maxInstallments
  );
  const ownerOverrideActive = isOwner && useCustomRate && customRate !== "";
  const rate = ownerOverrideActive
    ? Number(customRate)
    : activeRate
      ? Number(activeRate.rate)
      : (isOwner && manualRate ? Number(manualRate) : null);
  // Faixa de parcelas sem taxa configurada — só o dono pode digitar uma taxa manualmente
  const isManualRate = !activeRate && installmentsNum > 0 && !ownerOverrideActive;

  let totalPromissory = 0;
  let installmentValue = 0;
  let lastInstallmentValue = 0;

  // A taxa incide sobre o valor financiado (preço do veículo menos a entrada),
  // não sobre o valor cheio — senão a entrada não reduz nada de fato.
  const financedAmount = Math.max(0, vehiclePrice - entradaNum);

  if (financedAmount > 0 && installmentsNum > 0 && rate !== null) {
    totalPromissory = Math.round(financedAmount * (rate / 100) * 100) / 100;
    const raw = totalPromissory / installmentsNum;
    installmentValue = Math.ceil(raw * 100) / 100;
    lastInstallmentValue = Math.round((totalPromissory - installmentValue * (installmentsNum - 1)) * 100) / 100;
  }
  // Quando o total divide exato entre as parcelas, a "última parcela" fica igual às demais —
  // nesse caso mostramos uma linha só (ex: "20x de R$ 937,50") em vez de separar 19x + 1 igual.
  const lastInstallmentDiffers = Math.abs(lastInstallmentValue - installmentValue) >= 0.01;

  const costNum = Number(cost);
  const priceNum = Number(price);
  const liveMargin = costNum > 0 && priceNum > 0 ? ((priceNum - costNum) / costNum) * 100 : null;

  const handleSubmit = async () => {
    if (!vehicleId || !customerId || !price || !cost) {
      setError(
        !customerId && customerQuery.trim()
          ? `Cliente "${customerQuery.trim()}" não está cadastrado. Clique em "Cadastrar como novo cliente" no campo Cliente.`
          : "Preencha veículo, cliente, preço e custo"
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sale = await api.createSale({
        vehicleId,
        customerId,
        sellerId: sellerId || undefined,
        price: priceNum,
        cost: costNum,
        paymentMethod: paymentMethod || undefined,
        soldAt: soldAt || undefined,
        notes: notes || undefined,
      });

      if (generateNotes && installmentsNum > 0 && totalPromissory > 0) {
        await api.createPromissoryNotes({
          saleId: sale.id,
          customerId,
          totalInstallments: installmentsNum,
          totalAmount: totalPromissory,
          firstDueDate,
        });
      }

      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar venda");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" as const, background: "#FAFAFA" };
  const selectStyle = { ...inputStyle, background: "#fff" };

  const trimmedCustomerQuery = customerQuery.trim();
  const customerExists = customers.some(c => c.name.toLowerCase() === trimmedCustomerQuery.toLowerCase());

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-h-[92vh] overflow-y-auto" style={{ background: "#fff", borderRadius: 16, maxWidth: 580, margin: 16 }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)", zIndex: 1 }}>
          <h3>Registrar Venda</h3>
          <button onClick={onClose} style={{ color: "#6B7280" }}><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

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
                    const exists = customers.some(c => c.name.toLowerCase() === trimmed.toLowerCase());
                    if (exists) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => openNewCustomerForm(trimmed)}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2"
                        style={{ fontSize: 13, color: "#185FA5", fontWeight: 500, background: "#F0F7FF" }}
                      >
                        <UserPlus size={14} />
                        Cadastrar "{trimmed}" como novo cliente
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
                    <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>Nome *</label>
                    <input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff", fontSize: 13 }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>Telefone</label>
                      <input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(formatPhone(e.target.value))} placeholder="(85) 99999-9999"
                        className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff", fontSize: 13 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 4 }}>E-mail</label>
                      <input value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} placeholder="cliente@email.com"
                        className="w-full rounded-lg px-3 py-2" style={{ ...inputStyle, background: "#fff", fontSize: 13 }} />
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

          {/* Vendedor */}
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

          {/* Preços */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Custo *</label>
              <input placeholder="0,00" value={cost} onChange={(e) => setCost(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, background: "#FEF3C7" }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Preço de venda *</label>
              <input placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
            </div>
          </div>

          {liveMargin !== null && (
            <div className="px-3 py-2 rounded-lg" style={{ background: liveMargin >= 0 ? "#EAF3DE" : "#FEE2E2", fontSize: 13, color: liveMargin >= 0 ? "#27500A" : "#DC2626" }}>
              Margem: <strong>{liveMargin.toFixed(1)}%</strong>
              {liveMargin >= 0 ? ` · Lucro estimado: ${currency(priceNum - costNum)}` : " · Preço abaixo do custo!"}
            </div>
          )}

          {/* Pagamento e data */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Forma de pagamento</label>
              <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); if (e.target.value === "promissory") setGenerateNotes(true); }}
                className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                <option value="">Selecionar</option>
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Data da venda</label>
              <input type="date" value={soldAt} onChange={(e) => setSoldAt(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
            </div>
          </div>

          {/* Observações */}
          <div>
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Observações</label>
            <textarea placeholder="Ex: Cliente pagou entrada de R$ 5.000, restante financiado..." rows={2}
              value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, resize: "vertical" as const }} />
          </div>

          {/* Promissórias */}
          <div className="rounded-xl overflow-hidden" style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
            {/* Toggle — mesmo padrão visual do "Conta ativa" no cadastro de vendedor */}
            <button
              type="button"
              onClick={() => setGenerateNotes(!generateNotes)}
              className="w-full flex items-center justify-between px-5 py-4"
              style={{ background: generateNotes ? "#EBF2FA" : "#F9FAFB" }}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 34, height: 34, background: generateNotes ? "#185FA5" : "#fff", border: generateNotes ? "none" : "0.5px solid rgba(0,0,0,0.1)" }}>
                  <FileText size={16} style={{ color: generateNotes ? "#fff" : "#9CA3AF" }} />
                </div>
                <div className="text-left">
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#0F1923" }}>Gerar promissórias</p>
                  <p style={{ fontSize: 12, color: "#6B7280" }}>Parcele o valor da venda em notas promissórias</p>
                </div>
              </div>
              <span className="relative flex-shrink-0" style={{ width: 40, height: 22, borderRadius: 999, background: generateNotes ? "#185FA5" : "#D1D5DB" }}>
                <span className="absolute rounded-full" style={{ top: 2, left: generateNotes ? 20 : 2, width: 18, height: 18, background: "#fff", transition: "left 0.15s" }} />
              </span>
            </button>

            {generateNotes && (
              <div className="px-5 py-5 flex flex-col gap-6" style={{ background: "#fff", borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>

                {/* Entrada e parcelas */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 6 }}>Entrada (opcional)</label>
                    <input placeholder="0,00" value={entrada} onChange={(e) => setEntrada(e.target.value)}
                      className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, background: "#fff", fontSize: 13 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 6 }}>Nº de parcelas</label>
                    <input type="number" min="1" max="18" value={installments} onChange={(e) => setInstallments(e.target.value)}
                      className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, background: "#fff", fontSize: 13 }} />
                  </div>
                </div>

                {/* Tabela de juros */}
                {interestRates.length > 0 && !useCustomRate && (
                  <div>
                    <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 12, color: "#6B7280" }}>Taxa de juros por faixa de parcelas</label>
                      {isOwner && (
                        <button type="button" onClick={() => { setUseCustomRate(true); setCustomRate(String(rate ?? "")); }}
                          style={{ fontSize: 11, color: "#185FA5", fontWeight: 600 }}>
                          Personalizar taxa
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {interestRates.map(r => {
                        const isActive = installmentsNum >= r.minInstallments && installmentsNum <= r.maxInstallments;
                        return (
                          <div key={r.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg"
                            style={{
                              background: isActive ? "#EBF2FA" : "#F9FAFB",
                              border: isActive ? "1.5px solid #185FA5" : "0.5px solid rgba(0,0,0,0.08)",
                            }}>
                            <span style={{ fontSize: 12, color: isActive ? "#185FA5" : "#6B7280", fontWeight: isActive ? 600 : 400 }}>
                              {r.minInstallments}x – {r.maxInstallments}x
                            </span>
                            <span style={{ fontSize: 13, color: isActive ? "#185FA5" : "#374151", fontWeight: 700 }}>
                              {Number(r.rate)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Taxa personalizada — só o dono vê e edita este campo */}
                {isOwner && useCustomRate && (
                  <div className="rounded-lg p-4" style={{ background: "#F0F7FF", border: "1px solid #185FA5" }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                      <p style={{ fontSize: 12, color: "#185FA5", fontWeight: 600 }}>Taxa personalizada (somente dono)</p>
                      <button type="button" onClick={() => { setUseCustomRate(false); setCustomRate(""); }}
                        style={{ fontSize: 11, color: "#6B7280" }}>
                        Usar tabela
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="500"
                        step="0.01"
                        placeholder="Ex: 45"
                        value={customRate}
                        onChange={(e) => setCustomRate(e.target.value)}
                        className="rounded-lg px-3 py-2.5"
                        style={{ ...inputStyle, background: "#fff", width: 120, fontSize: 13 }}
                        autoFocus
                      />
                      <span style={{ fontSize: 13, color: "#374151" }}>% sobre o valor do veículo</span>
                    </div>
                  </div>
                )}

                {/* Vencimento */}
                <div>
                  <label style={{ fontSize: 12, color: "#6B7280", display: "block", marginBottom: 6 }}>1º vencimento</label>
                  <input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5" style={{ ...inputStyle, background: "#fff", fontSize: 13 }} />
                </div>

                {/* Faixa de parcelas fora da tabela */}
                {!activeRate && installmentsNum > 0 && !useCustomRate && (
                  isOwner ? (
                    <div className="rounded-lg p-4" style={{ background: "#FEF3C7" }}>
                      <p style={{ fontSize: 12, color: "#92400E", marginBottom: 10 }}>
                        Número de parcelas fora da tabela configurada — informe a taxa manualmente.
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="500"
                          step="0.01"
                          placeholder="Ex: 90"
                          value={manualRate}
                          onChange={(e) => setManualRate(e.target.value)}
                          className="rounded-lg px-3 py-2.5"
                          style={{ ...inputStyle, background: "#fff", width: 120, fontSize: 13 }}
                        />
                        <span style={{ fontSize: 13, color: "#92400E" }}>% sobre o valor do veículo</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg p-4" style={{ background: "#FEF3C7" }}>
                      <p style={{ fontSize: 12, color: "#92400E" }}>
                        Não há taxa configurada para {installmentsNum}x. Peça para o dono da loja definir a taxa dessa venda.
                      </p>
                    </div>
                  )
                )}

                {entradaNum > 0 && financedAmount === 0 && installmentsNum > 0 && (
                  <div className="rounded-lg px-3 py-2.5" style={{ background: "#EAF3DE", fontSize: 12, color: "#27500A" }}>
                    A entrada cobre o valor total do veículo — não há saldo para gerar promissórias.
                  </div>
                )}

                {/* Resumo do cálculo */}
                {rate !== null && financedAmount > 0 && installmentsNum > 0 && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #185FA5" }}>
                    <div className="px-4 py-3" style={{ background: "#185FA5" }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#fff", letterSpacing: 0.3 }}>RESUMO DAS PROMISSÓRIAS</p>
                    </div>
                    <div className="px-4 py-4 flex flex-col gap-3" style={{ background: "#F7FAFD" }}>
                      <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                        <span style={{ color: "#6B7280" }}>Valor do veículo</span>
                        <span style={{ fontWeight: 500, color: "#374151" }}>{currency(vehiclePrice)}</span>
                      </div>
                      {entradaNum > 0 && (
                        <>
                          <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                            <span style={{ color: "#6B7280" }}>Entrada</span>
                            <span style={{ fontWeight: 500, color: "#27500A" }}>{currency(entradaNum)}</span>
                          </div>
                          <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                            <span style={{ color: "#6B7280" }}>Valor financiado</span>
                            <span style={{ fontWeight: 500, color: "#374151" }}>{currency(financedAmount)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                        <span style={{ color: "#6B7280" }}>Taxa aplicada ({installmentsNum}x){ownerOverrideActive ? " · personalizada" : ""}</span>
                        <span style={{ fontWeight: 500, color: "#374151" }}>{rate}%</span>
                      </div>
                      <div className="flex items-center justify-between pt-3" style={{ fontSize: 13, borderTop: "0.5px solid rgba(24,95,165,0.15)" }}>
                        <span style={{ color: "#185FA5", fontWeight: 600 }}>Total das promissórias</span>
                        <span style={{ fontWeight: 700, color: "#185FA5", fontSize: 15 }}>{currency(totalPromissory)}</span>
                      </div>
                      {lastInstallmentDiffers ? (
                        <>
                          <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                            <span style={{ color: "#6B7280" }}>{installmentsNum - 1}x de</span>
                            <span style={{ fontWeight: 600, color: "#374151" }}>{currency(installmentValue)}</span>
                          </div>
                          <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                            <span style={{ color: "#6B7280" }}>Última parcela</span>
                            <span style={{ fontWeight: 600, color: "#374151" }}>{currency(lastInstallmentValue)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                          <span style={{ color: "#6B7280" }}>{installmentsNum}x de</span>
                          <span style={{ fontWeight: 600, color: "#374151" }}>{currency(installmentValue)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg"
            style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 rounded-lg"
            style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Registrando..." : "Confirmar venda"}
          </button>
        </div>
      </div>
    </div>
  );
}