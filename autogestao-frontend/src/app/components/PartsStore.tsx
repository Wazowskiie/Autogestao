import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Edit2, Trash2, X, Package, AlertTriangle } from "lucide-react";
import * as api from "../../lib/api";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PartsStore() {
  const [parts, setParts] = useState<api.Part[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [modal, setModal] = useState<api.Part | "new" | null>(null);
  const [adjustModal, setAdjustModal] = useState<api.Part | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchParts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listParts({ search: debouncedSearch || undefined, lowStock: lowStock || undefined, pageSize: 100 });
      setParts(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar peças");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, lowStock]);

  useEffect(() => { fetchParts(); }, [fetchParts]);

  const handleDelete = async (part: api.Part) => {
    if (!window.confirm(`Remover ${part.name}?`)) return;
    try {
      await api.deletePart(part.id);
      fetchParts();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao remover");
    }
  };

  const lowStockCount = parts.filter(p => p.stockQty <= 2).length;

  return (
    <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0" style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2>Peças</h2>
            <span className="px-2 py-0.5 rounded-full" style={{ background: "#EBF2FA", color: "#185FA5", fontSize: 12, fontWeight: 500 }}>{total}</span>
            {lowStockCount > 0 && (
              <span className="px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: "#FEE2E2", color: "#DC2626", fontSize: 12, fontWeight: 500 }}>
                <AlertTriangle size={11} /> {lowStockCount} estoque baixo
              </span>
            )}
          </div>
          <button onClick={() => setModal("new")} className="px-4 py-2 rounded-lg flex items-center gap-2" style={{ background: "var(--primary)", color: "#fff", fontSize: 13 }}>
            <Plus size={16} /> Nova peça
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1" style={{ background: "var(--input-background)" }}>
            <Search size={16} style={{ color: "#9CA3AF" }} />
            <input placeholder="Buscar por nome, SKU ou categoria..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none" style={{ fontSize: 13 }} />
          </div>
          <button onClick={() => setLowStock(!lowStock)}
            className="px-3 py-2 rounded-lg flex items-center gap-2"
            style={{ fontSize: 13, background: lowStock ? "#FEE2E2" : "#F4F6F9", color: lowStock ? "#DC2626" : "#6B7280", border: lowStock ? "1px solid #FCA5A5" : "none" }}>
            <AlertTriangle size={14} /> Estoque baixo
          </button>
        </div>
      </div>

      {error && (
        <div className="px-6 pt-4">
          <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
            <span>{error}</span><button onClick={fetchParts} style={{ fontWeight: 500 }}>Tentar novamente</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid var(--border)" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead style={{ background: "#F9FAFB", borderBottom: "1px solid var(--border)" }}>
              <tr>
                {["Peça", "SKU", "Categoria", "Custo", "Preço", "Estoque", "Margem", "Ações"].map(h => (
                  <th key={h} className="text-left px-4 py-3" style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && parts.length === 0 && (
                <tr><td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#9CA3AF" }}>Nenhuma peça encontrada.</td></tr>
              )}
              {parts.map((p, i) => {
                const margin = p.cost > 0 ? ((Number(p.price) - Number(p.cost)) / Number(p.cost)) * 100 : 0;
                const stockLow = p.stockQty <= 2;
                return (
                  <tr key={p.id} style={{ borderBottom: i < parts.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: "#F4F6F9", flexShrink: 0 }}>
                          <Package size={14} style={{ color: "#CBD5E1" }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>{p.sku ?? "—"}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>{p.category ?? "—"}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>{currency(Number(p.cost))}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, fontWeight: 500 }}>{currency(Number(p.price))}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 13, fontWeight: 600, color: stockLow ? "#DC2626" : "#374151" }}>{p.stockQty}</span>
                        <button onClick={() => setAdjustModal(p)}
                          className="px-2 py-0.5 rounded text-xs" style={{ background: "#F4F6F9", color: "#6B7280", fontSize: 11 }}>
                          ajustar
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: margin > 20 ? "#27500A" : "#374151", fontWeight: 500 }}>{margin.toFixed(1)}%</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setModal(p)} className="p-1.5 rounded" style={{ color: "#6B7280", background: "#F4F6F9" }}><Edit2 size={13} /></button>
                        <button onClick={() => handleDelete(p)} className="p-1.5 rounded" style={{ color: "#DC2626", background: "#FEE2E2" }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal !== null && (
        <PartModal key={modal === "new" ? "new" : modal.id} initial={modal === "new" ? null : modal}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); fetchParts(); }} />
      )}
      {adjustModal !== null && (
        <AdjustStockModal part={adjustModal} onClose={() => setAdjustModal(null)} onSaved={() => { setAdjustModal(null); fetchParts(); }} />
      )}
    </div>
  );
}

function PartModal({ initial, onClose, onSaved }: { initial: api.Part | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [cost, setCost] = useState(initial ? String(initial.cost) : "");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [stockQty, setStockQty] = useState(initial ? String(initial.stockQty) : "0");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name || !cost || !price) { setError("Nome, custo e preço são obrigatórios"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: api.CreatePartInput = { name, sku: sku || undefined, cost: Number(cost), price: Number(price), stockQty: Number(stockQty) || 0, category: category || undefined };
      if (initial) await api.updatePart(initial.id, payload);
      else await api.createPart(payload);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full rounded-xl" style={{ background: "#fff", maxWidth: 460, margin: 16 }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
          <h3>{initial ? "Editar peça" : "Nova peça"}</h3>
          <button onClick={onClose} style={{ color: "#6B7280" }}><X size={20} /></button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3">
          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Nome *</label>
              <input placeholder="Ex: Filtro de óleo" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>SKU</label>
              <input placeholder="ABC-001" value={sku} onChange={(e) => setSku(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Categoria</label>
              <input placeholder="Filtros" value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Custo *</label>
              <input placeholder="0,00" value={cost} onChange={(e) => setCost(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none", background: "#FEF3C7" }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Preço de venda *</label>
              <input placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Estoque inicial</label>
              <input type="number" min="0" placeholder="0" value={stockQty} onChange={(e) => setStockQty(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }} />
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 rounded-lg" style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando..." : initial ? "Salvar" : "Cadastrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AdjustStockModal({ part, onClose, onSaved }: { part: api.Part; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (direction: 1 | -1) => {
    if (!qty || Number(qty) <= 0) { setError("Informe uma quantidade"); return; }
    setSaving(true);
    setError(null);
    try {
      await api.adjustPartStock(part.id, direction * Number(qty));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao ajustar estoque");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full rounded-xl" style={{ background: "#fff", maxWidth: 360, margin: 16 }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
          <h3>Ajustar estoque</h3>
          <button onClick={onClose} style={{ color: "#6B7280" }}><X size={20} /></button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <p style={{ fontSize: 13, color: "#374151" }}><strong>{part.name}</strong> — estoque atual: <strong>{part.stockQty}</strong></p>
          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}
          <div>
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Quantidade</label>
            <input type="number" min="1" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={() => handleSubmit(-1)} disabled={saving} className="px-4 py-2 rounded-lg" style={{ background: "#FEE2E2", color: "#DC2626", fontSize: 13, fontWeight: 500 }}>− Saída</button>
          <button onClick={() => handleSubmit(1)} disabled={saving} className="px-4 py-2 rounded-lg" style={{ background: "#EAF3DE", color: "#27500A", fontSize: 13, fontWeight: 500 }}>+ Entrada</button>
        </div>
      </div>
    </div>
  );
}
