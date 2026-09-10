import { useCallback, useEffect, useState } from "react";
import { Plus, TrendingUp, TrendingDown, DollarSign, Trash2, X, Tag, Calendar, FileText, ChevronDown } from "lucide-react";
import * as api from "../../lib/api";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const CATEGORIES_REVENUE = ["Venda de veículo", "Venda de peça", "Serviço", "Outro"];
const CATEGORIES_EXPENSE = ["Estoque", "Manutenção", "Salário", "Aluguel", "Marketing", "Impostos", "Outro"];

export function Financial() {
  const [transactions, setTransactions] = useState<api.FinancialTransaction[]>([]);
  const [summary, setSummary] = useState<api.FinancialSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [typeFilter, setTypeFilter] = useState<api.TransactionType | "all">("all");
  const [showModal, setShowModal] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, sum] = await Promise.all([
        api.listTransactions({ month, type: typeFilter === "all" ? undefined : typeFilter, pageSize: 100 }),
        api.getFinancialSummary(month),
      ]);
      setTransactions(res.items);
      setTotal(res.total);
      setSummary(sum);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar lançamentos");
    } finally {
      setLoading(false);
    }
  }, [month, typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (t: api.FinancialTransaction) => {
    if (!window.confirm("Remover este lançamento?")) return;
    try {
      await api.deleteTransaction(t.id);
      fetchData();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao remover");
    }
  };

  return (
    <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0" style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2>Financeiro</h2>
            <span className="px-2 py-0.5 rounded-full" style={{ background: "#EBF2FA", color: "#185FA5", fontSize: 12, fontWeight: 500 }}>{total} lançamentos</span>
          </div>
          <div className="flex items-center gap-3">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg px-3 py-2" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13 }} />
            <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg flex items-center gap-2" style={{ background: "var(--primary)", color: "#fff", fontSize: 13 }}>
              <Plus size={16} /> Lançamento
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-4 rounded-xl" style={{ background: "#EAF3DE" }}>
              <div className="flex items-center gap-2 mb-1"><TrendingUp size={16} style={{ color: "#27500A" }} /><span style={{ fontSize: 12, color: "#27500A" }}>Receitas</span></div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#27500A" }}>{currency(summary.totalRevenue)}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: "#FEE2E2" }}>
              <div className="flex items-center gap-2 mb-1"><TrendingDown size={16} style={{ color: "#DC2626" }} /><span style={{ fontSize: 12, color: "#DC2626" }}>Despesas</span></div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#DC2626" }}>{currency(summary.totalExpense)}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: summary.balance >= 0 ? "#EBF2FA" : "#FEF3C7" }}>
              <div className="flex items-center gap-2 mb-1"><DollarSign size={16} style={{ color: summary.balance >= 0 ? "#185FA5" : "#D97706" }} /><span style={{ fontSize: 12, color: summary.balance >= 0 ? "#185FA5" : "#D97706" }}>Saldo</span></div>
              <div style={{ fontSize: 20, fontWeight: 600, color: summary.balance >= 0 ? "#185FA5" : "#D97706" }}>{currency(summary.balance)}</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          {(["all", "revenue", "expense"] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className="px-3 py-1.5 rounded-lg"
              style={{ fontSize: 13, fontWeight: typeFilter === t ? 600 : 400, background: typeFilter === t ? "#EBF2FA" : "#F4F6F9", color: typeFilter === t ? "#185FA5" : "#6B7280" }}>
              {t === "all" ? "Todos" : t === "revenue" ? "Receitas" : "Despesas"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-6 pt-4">
          <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
            <span>{error}</span><button onClick={fetchData} style={{ fontWeight: 500 }}>Tentar novamente</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid var(--border)" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead style={{ background: "#F9FAFB", borderBottom: "1px solid var(--border)" }}>
              <tr>
                {["Data", "Tipo", "Categoria", "Descrição", "Valor", "Ações"].map(h => (
                  <th key={h} className="text-left px-4 py-3" style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && transactions.length === 0 && (
                <tr><td colSpan={6} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#9CA3AF" }}>Nenhum lançamento encontrado.</td></tr>
              )}
              {transactions.map((t, i) => (
                <tr key={t.id} style={{ borderBottom: i < transactions.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>{new Date(t.date).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded" style={{ fontSize: 11, background: t.type === "revenue" ? "#EAF3DE" : "#FEE2E2", color: t.type === "revenue" ? "#27500A" : "#DC2626" }}>
                      {t.type === "revenue" ? "Receita" : "Despesa"}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: "#374151" }}>{t.category}</td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>{t.description ?? "—"}</td>
                  <td className="px-4 py-3" style={{ fontSize: 13, fontWeight: 600, color: t.type === "revenue" ? "#27500A" : "#DC2626" }}>
                    {t.type === "revenue" ? "+" : "-"}{currency(Number(t.amount))}
                  </td>
                  <td className="px-4 py-3">
                    {!t.saleId && (
                      <button onClick={() => handleDelete(t)} className="p-1.5 rounded" style={{ color: "#DC2626", background: "#FEE2E2" }}><Trash2 size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <NewTransactionModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchData(); }} />
      )}
    </div>
  );
}

function formatAmountInput(v: string) {
  // Mantém só dígitos e vírgula/ponto, evita múltiplos separadores
  const cleaned = v.replace(/[^\d.,]/g, "");
  return cleaned;
}

function NewTransactionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<api.TransactionType>("expense");
  const [category, setCategory] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = type === "revenue" ? CATEGORIES_REVENUE : CATEGORIES_EXPENSE;
  const isRevenue = type === "revenue";

  function validate() {
    const e: Record<string, string> = {};
    if (!category) e.category = "Selecione uma categoria";
    const normalized = amount.replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    if (!amount || Number.isNaN(n) || n <= 0) e.amount = "Informe um valor válido";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const normalized = amount.replace(/\./g, "").replace(",", ".");
      await api.createTransaction({ type, category, amount: Number(normalized), date, description: description || undefined });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = (hasError?: boolean) => ({
    border: hasError ? "1px solid #DC2626" : "0.5px solid rgba(0,0,0,0.12)",
    fontSize: 13,
    outline: "none",
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full rounded-xl overflow-hidden" style={{ background: "#fff", maxWidth: 460, margin: 16, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        {/* Header escuro, no padrão dos outros modais do sistema */}
        <div className="relative px-6 pt-5 pb-6" style={{ background: "#0F1923" }}>
          <button onClick={onClose} className="absolute right-5 top-5" style={{ color: "#9CA3AF" }}><X size={20} /></button>
          <p style={{ fontSize: 11, color: "#185FA5", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
            Financeiro
          </p>
          <h3 style={{ color: "#fff" }}>Novo lançamento</h3>
          <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>Registre uma receita ou despesa do período.</p>
        </div>

        <div className="px-6 pt-6 pb-5 overflow-auto">
          {error && <div className="rounded-lg px-3 py-2 mb-3" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          {/* Tipo */}
          <div className="mb-4">
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 8 }}>Tipo</label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => { setType("revenue"); setCategory(""); }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg"
                style={{
                  border: isRevenue ? "1.5px solid #27500A" : "0.5px solid rgba(0,0,0,0.1)",
                  background: isRevenue ? "#EAF3DE" : "#FAFAFA",
                  color: isRevenue ? "#27500A" : "#6B7280",
                  fontSize: 13, fontWeight: 600,
                }}>
                <TrendingUp size={15} /> Receita
              </button>
              <button type="button" onClick={() => { setType("expense"); setCategory(""); }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-lg"
                style={{
                  border: !isRevenue ? "1.5px solid #DC2626" : "0.5px solid rgba(0,0,0,0.1)",
                  background: !isRevenue ? "#FEE2E2" : "#FAFAFA",
                  color: !isRevenue ? "#DC2626" : "#6B7280",
                  fontSize: 13, fontWeight: 600,
                }}>
                <TrendingDown size={15} /> Despesa
              </button>
            </div>
          </div>

          {/* Categoria — dropdown customizado, no padrão do campo "Cargo" do modal de vendedor */}
          <div className="mb-4 relative">
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Categoria *</label>
            <button type="button" onClick={() => setCategoryOpen((v) => !v)}
              className="w-full rounded-lg pl-9 pr-3 py-2.5 relative text-left"
              style={{ ...fieldStyle(!!errors.category), background: "#fff", color: category ? "#0F1923" : "#9CA3AF" }}>
              <Tag size={15} className="absolute" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
              {category || "Selecionar"}
              <ChevronDown size={15} className="absolute" style={{ right: 11, top: 11, color: "#9CA3AF" }} />
            </button>
            {categoryOpen && (
              <div className="absolute z-10 mt-1 w-full rounded-lg overflow-hidden" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.12)", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", maxHeight: 220, overflowY: "auto" }}>
                {categories.map((c) => (
                  <button type="button" key={c} onClick={() => { setCategory(c); setCategoryOpen(false); }}
                    className="w-full text-left px-3 py-2"
                    style={{ fontSize: 13, color: c === category ? "var(--primary)" : "#374151", background: c === category ? "#EBF2FA" : "transparent" }}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            {errors.category && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.category}</p>}
          </div>

          {/* Valor e Data */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Valor *</label>
              <div className="relative">
                <DollarSign size={15} className="absolute" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
                <input placeholder="0,00" value={amount} onChange={(e) => setAmount(formatAmountInput(e.target.value))} inputMode="decimal"
                  className="w-full rounded-lg pl-9 pr-3 py-2.5" style={fieldStyle(!!errors.amount)} />
              </div>
              {errors.amount && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.amount}</p>}
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Data</label>
              <div className="relative">
                <Calendar size={15} className="absolute pointer-events-none" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg pl-9 pr-3 py-2.5" style={fieldStyle()} />
              </div>
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Descrição</label>
            <div className="relative">
              <FileText size={15} className="absolute" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
              <input placeholder="Descrição opcional..." value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg pl-9 pr-3 py-2.5" style={fieldStyle()} />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 rounded-lg" style={{ background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando..." : "Lançar"}
          </button>
        </div>
      </div>
    </div>
  );
}