import { useCallback, useEffect, useState } from "react";
import { Plus, TrendingUp, TrendingDown, DollarSign, Trash2, X, Calendar, FileText, ChevronDown, Check, Clock, Car, Repeat } from "lucide-react";
import * as api from "../../lib/api";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Hoje no formato AAAA-MM-DD, no fuso de quem está usando
function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}

// Mostra a data como foi salva, sem o fuso "voltar um dia"
function formatDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function isOverdue(t: api.FinancialTransaction) {
  return !t.paid && t.date.slice(0, 10) < todayISO();
}

function vehicleLabel(v: { brand: string; model: string; year: number; plate?: string | null }) {
  return `${v.brand} ${v.model} ${v.year}${v.plate ? ` (${v.plate})` : ""}`;
}

const CATEGORIES_REVENUE = ["Venda de veículo", "Venda de peça", "Serviço", "Comissão de financiamento", "Outro"];
const CATEGORIES_EXPENSE = ["Estoque", "Preparação", "Manutenção", "Documentação", "Comissão", "Salário", "Aluguel", "Contas", "Marketing", "Impostos", "Outro"];

// Categorias em que normalmente o lançamento é de um veículo específico
const VEHICLE_CATEGORIES = ["Venda de veículo", "Estoque", "Preparação", "Manutenção", "Documentação", "Comissão"];

export function Financial() {
  const [transactions, setTransactions] = useState<api.FinancialTransaction[]>([]);
  const [summary, setSummary] = useState<api.FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(currentMonth());
  const [typeFilter, setTypeFilter] = useState<api.TransactionType | "all">("all");
  const [onlyOpen, setOnlyOpen] = useState(false);
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
      setSummary(sum);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar lançamentos");
    } finally {
      setLoading(false);
    }
  }, [month, typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const visible = onlyOpen ? transactions.filter(t => !t.paid) : transactions;

  const handlePay = async (t: api.FinancialTransaction) => {
    const verb = t.type === "revenue" ? "recebido" : "pago";
    if (!window.confirm(`Marcar ${t.category} de ${currency(Number(t.amount))} como ${verb}?`)) return;
    try {
      await api.payTransaction(t.id);
      fetchData();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao dar baixa");
    }
  };

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
            <span className="px-2 py-0.5 rounded-full" style={{ background: "#EBF2FA", color: "#185FA5", fontSize: 12, fontWeight: 500 }}>{transactions.length} lançamentos</span>
          </div>
          <div className="flex items-center gap-3">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg px-3 py-2" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13 }} />
            <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg flex items-center gap-2" style={{ background: "var(--primary)", color: "#fff", fontSize: 13 }}>
              <Plus size={16} /> Lançamento
            </button>
          </div>
        </div>

        {/* Resumo */}
        {summary && (
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="p-4 rounded-xl" style={{ background: "#EAF3DE" }}>
              <div className="flex items-center gap-2 mb-1"><TrendingUp size={16} style={{ color: "#27500A" }} /><span style={{ fontSize: 12, color: "#27500A" }}>Recebido</span></div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#27500A" }}>{currency(summary.totalRevenue)}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: "#FEE2E2" }}>
              <div className="flex items-center gap-2 mb-1"><TrendingDown size={16} style={{ color: "#DC2626" }} /><span style={{ fontSize: 12, color: "#DC2626" }}>Pago</span></div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#DC2626" }}>{currency(summary.totalExpense)}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: summary.balance >= 0 ? "#EBF2FA" : "#FEF3C7" }}>
              <div className="flex items-center gap-2 mb-1"><DollarSign size={16} style={{ color: summary.balance >= 0 ? "#185FA5" : "#D97706" }} /><span style={{ fontSize: 12, color: summary.balance >= 0 ? "#185FA5" : "#D97706" }}>Saldo</span></div>
              <div style={{ fontSize: 20, fontWeight: 600, color: summary.balance >= 0 ? "#185FA5" : "#D97706" }}>{currency(summary.balance)}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: "#FEF3C7" }}>
              <div className="flex items-center gap-2 mb-1">
                <Clock size={16} style={{ color: "#D97706" }} />
                <span style={{ fontSize: 12, color: "#D97706" }}>A pagar</span>
                {summary.overdueCount > 0 && (
                  <span className="px-1.5 rounded" style={{ fontSize: 10, fontWeight: 600, background: "#DC2626", color: "#fff" }}>{summary.overdueCount} vencido{summary.overdueCount > 1 ? "s" : ""}</span>
                )}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#D97706" }}>{currency(summary.payableAmount)}</div>
              {summary.receivableAmount > 0 && (
                <div style={{ fontSize: 11, color: "#92400E", marginTop: 2 }}>A receber: {currency(summary.receivableAmount)}</div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {(["all", "revenue", "expense"] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className="px-3 py-1.5 rounded-lg"
              style={{ fontSize: 13, fontWeight: typeFilter === t ? 600 : 400, background: typeFilter === t ? "#EBF2FA" : "#F4F6F9", color: typeFilter === t ? "#185FA5" : "#6B7280" }}>
              {t === "all" ? "Todos" : t === "revenue" ? "Receitas" : "Despesas"}
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />
          <button onClick={() => setOnlyOpen(v => !v)}
            className="px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{ fontSize: 13, fontWeight: onlyOpen ? 600 : 400, background: onlyOpen ? "#FEF3C7" : "#F4F6F9", color: onlyOpen ? "#D97706" : "#6B7280" }}>
            <Clock size={13} /> Só em aberto
          </button>
        </div>
      </div>

      {error && (
        <div className="px-6 pt-4">
          <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
            <span>{error}</span><button onClick={fetchData} style={{ fontWeight: 500 }}>Tentar novamente</button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid var(--border)" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead style={{ background: "#F9FAFB", borderBottom: "1px solid var(--border)" }}>
              <tr>
                {["Data", "Tipo", "Categoria", "Veículo", "Descrição", "Valor", "Status", "Ações"].map(h => (
                  <th key={h} className="text-left px-4 py-3" style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && visible.length === 0 && (
                <tr><td colSpan={8} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#9CA3AF" }}>
                  {onlyOpen ? "Nada em aberto neste mês." : "Nenhum lançamento neste mês. Clique em Lançamento para registrar o primeiro."}
                </td></tr>
              )}
              {visible.map((t, i) => {
                const overdue = isOverdue(t);
                const isRevenue = t.type === "revenue";
                const vehicle = t.vehicle ?? (t as any).sale?.vehicle ?? null;
                const status = t.paid
                  ? { label: isRevenue ? "Recebido" : "Pago", bg: "#EAF3DE", color: "#27500A" }
                  : overdue
                    ? { label: "Vencido", bg: "#FEE2E2", color: "#DC2626" }
                    : { label: isRevenue ? "A receber" : "A pagar", bg: "#FEF3C7", color: "#D97706" };

                return (
                  <tr key={t.id} style={{ borderBottom: i < visible.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: overdue ? "#DC2626" : "#6B7280", fontWeight: overdue ? 600 : 400 }}>{formatDate(t.date)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded" style={{ fontSize: 11, background: isRevenue ? "#EAF3DE" : "#FEE2E2", color: isRevenue ? "#27500A" : "#DC2626" }}>
                        {isRevenue ? "Receita" : "Despesa"}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: "#374151" }}>{t.category}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>{vehicle ? vehicleLabel(vehicle) : "—"}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>
                      {t.description ?? "—"}
                      {t.recurrenceTotal && (
                        <span className="inline-flex items-center gap-1 ml-2 px-1.5 rounded" style={{ fontSize: 11, background: "#F4F6F9", color: "#6B7280" }}>
                          <Repeat size={11} /> {t.recurrenceIndex}/{t.recurrenceTotal}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, fontWeight: 600, color: isRevenue ? "#27500A" : "#DC2626" }}>
                      {isRevenue ? "+" : "-"}{currency(Number(t.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded" style={{ fontSize: 11, background: status.bg, color: status.color }}>{status.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!t.paid && (
                          <button onClick={() => handlePay(t)} className="p-1.5 rounded" style={{ color: "#27500A", background: "#EAF3DE" }} title={isRevenue ? "Marcar como recebido" : "Marcar como pago"}><Check size={13} /></button>
                        )}
                        {!t.saleId && (
                          <button onClick={() => handleDelete(t)} className="p-1.5 rounded" style={{ color: "#DC2626", background: "#FEE2E2" }} title="Remover"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
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

function NewTransactionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<api.TransactionType>("expense");
  const [category, setCategory] = useState("");
  const [amountCents, setAmountCents] = useState(0);
  const [paid, setPaid] = useState(true);
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicles, setVehicles] = useState<api.Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [repeat, setRepeat] = useState(false);
  const [repeatMonths, setRepeatMonths] = useState("12");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = type === "revenue" ? CATEGORIES_REVENUE : CATEGORIES_EXPENSE;
  const isRevenue = type === "revenue";
  const suggestsVehicle = VEHICLE_CATEGORIES.includes(category);
  const months = Math.floor(Number(repeatMonths) || 0);

  useEffect(() => {
    api.listVehicles({ pageSize: 100 })
      .then((r) => setVehicles(r.items))
      .catch(() => setVehicles([]))
      .finally(() => setVehiclesLoading(false));
  }, []);

  // Valor em R$: a pessoa digita só números e ele vai formatando (150000 -> 1.500,00)
  const amountDisplay = amountCents > 0
    ? (amountCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";

  // Texto de prévia da repetição (ex.: "de set/2026 até ago/2027")
  const repeatPreview = (() => {
    if (!repeat || months < 2 || !date) return null;
    const start = new Date(date + "T00:00:00");
    if (isNaN(start.getTime())) return null;
    const end = new Date(start.getFullYear(), start.getMonth() + months - 1, 1);
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(". de ", "/").replace(" de ", "/");
    return `Serão criados ${months} lançamentos, de ${fmt(start)} até ${fmt(end)}. Os meses seguintes ficam como "${isRevenue ? "A receber" : "A pagar"}".`;
  })();

  function changeType(next: api.TransactionType) {
    setType(next);
    setCategory("");
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!category) e.category = "Escolha uma categoria";
    if (amountCents <= 0) e.amount = "Informe o valor";
    if (!date) e.date = "Informe a data";
    if (repeat && (months < 2 || months > 24)) e.repeatMonths = "Entre 2 e 24 meses";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createTransaction({
        type,
        category,
        amount: amountCents / 100,
        date,
        description: description.trim() || undefined,
        vehicleId: vehicleId || undefined,
        paid,
        repeatMonths: repeat ? months : undefined,
      });
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

  const labelStyle = { fontSize: 13, color: "#374151", display: "block", marginBottom: 6 } as const;
  const accent = isRevenue ? { border: "#27500A", bg: "#EAF3DE", color: "#27500A" } : { border: "#DC2626", bg: "#FEE2E2", color: "#DC2626" };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full rounded-xl overflow-hidden" style={{ background: "#fff", maxWidth: 520, margin: 16, maxHeight: "92vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div className="relative px-6 pt-5 pb-6 flex-shrink-0" style={{ background: "#0F1923" }}>
          <button onClick={onClose} className="absolute right-5 top-5" style={{ color: "#9CA3AF" }}><X size={20} /></button>
          <p style={{ fontSize: 11, color: "#185FA5", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>Financeiro</p>
          <h3 style={{ color: "#fff" }}>Novo lançamento</h3>
          <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>Registre uma receita ou despesa, paga ou em aberto.</p>
        </div>

        <div className="px-6 pt-5 pb-5 overflow-auto flex flex-col gap-4">
          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          {/* Tipo */}
          <div>
            <label style={labelStyle}>Tipo</label>
            <div className="grid grid-cols-2 gap-3">
              {(["revenue", "expense"] as const).map((t) => {
                const active = type === t;
                const c = t === "revenue" ? { border: "#27500A", bg: "#EAF3DE", color: "#27500A" } : { border: "#DC2626", bg: "#FEE2E2", color: "#DC2626" };
                return (
                  <button key={t} type="button" onClick={() => changeType(t)}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-lg"
                    style={{ border: active ? `1.5px solid ${c.border}` : "0.5px solid rgba(0,0,0,0.1)", background: active ? c.bg : "#FAFAFA", color: active ? c.color : "#6B7280", fontSize: 13, fontWeight: 600 }}>
                    {t === "revenue" ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                    {t === "revenue" ? "Receita" : "Despesa"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Categoria em botões */}
          <div>
            <label style={labelStyle}>Categoria *</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const active = c === category;
                return (
                  <button key={c} type="button" onClick={() => setCategory(c)}
                    className="px-3 py-1.5 rounded-full"
                    style={{ fontSize: 12, fontWeight: active ? 600 : 400, border: active ? `1.5px solid ${accent.border}` : "0.5px solid rgba(0,0,0,0.12)", background: active ? accent.bg : "#fff", color: active ? accent.color : "#374151" }}>
                    {c}
                  </button>
                );
              })}
            </div>
            {errors.category && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.category}</p>}
          </div>

          {/* Valor */}
          <div>
            <label style={labelStyle}>Valor *</label>
            <div className="relative">
              <span className="absolute" style={{ left: 12, top: 10, fontSize: 13, color: "#6B7280", fontWeight: 500 }}>R$</span>
              <input placeholder="0,00" value={amountDisplay} inputMode="numeric"
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                  setAmountCents(Number(digits || 0));
                }}
                className="w-full rounded-lg pr-3 py-2.5" style={{ ...fieldStyle(!!errors.amount), paddingLeft: 38, fontSize: 15, fontWeight: 600 }} />
            </div>
            {errors.amount && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.amount}</p>}
          </div>

          {/* Status + data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={labelStyle}>Status</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setPaid(true)}
                  className="py-2.5 rounded-lg flex items-center justify-center gap-1.5"
                  style={{ fontSize: 12, fontWeight: 600, border: paid ? "1.5px solid #27500A" : "0.5px solid rgba(0,0,0,0.1)", background: paid ? "#EAF3DE" : "#FAFAFA", color: paid ? "#27500A" : "#6B7280" }}>
                  <Check size={13} /> {isRevenue ? "Recebido" : "Pago"}
                </button>
                <button type="button" onClick={() => setPaid(false)}
                  className="py-2.5 rounded-lg flex items-center justify-center gap-1.5"
                  style={{ fontSize: 12, fontWeight: 600, border: !paid ? "1.5px solid #D97706" : "0.5px solid rgba(0,0,0,0.1)", background: !paid ? "#FEF3C7" : "#FAFAFA", color: !paid ? "#D97706" : "#6B7280" }}>
                  <Clock size={13} /> {isRevenue ? "A receber" : "A pagar"}
                </button>
              </div>
            </div>
            <div>
              <label style={labelStyle}>{paid ? (isRevenue ? "Data do recebimento" : "Data do pagamento") : "Vencimento"}</label>
              <div className="relative">
                <Calendar size={15} className="absolute pointer-events-none" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg pl-9 pr-3 py-2.5" style={fieldStyle(!!errors.date)} />
              </div>
              {errors.date && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.date}</p>}
            </div>
          </div>

          {/* Veículo */}
          <div>
            <label style={labelStyle}>
              Veículo <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(opcional)</span>
            </label>
            <div className="relative">
              <Car size={15} className="absolute pointer-events-none" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={vehiclesLoading}
                className="w-full rounded-lg pl-9 py-2.5 appearance-none" style={{ ...fieldStyle(), background: "#fff", paddingRight: 32, color: vehicleId ? "#0F1923" : "#9CA3AF" }}>
                <option value="">{vehiclesLoading ? "Carregando veículos..." : "Nenhum veículo"}</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id} style={{ color: "#0F1923" }}>{vehicleLabel(v)}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute pointer-events-none" style={{ right: 12, top: 12, color: "#9CA3AF" }} />
            </div>
            {suggestsVehicle && !vehicleId && (
              <p style={{ fontSize: 11, color: "#185FA5", marginTop: 4 }}>
                Ligue ao veículo para que este valor entre no lucro real dele.
              </p>
            )}
          </div>

          {/* Descrição */}
          <div>
            <label style={labelStyle}>Descrição</label>
            <div className="relative">
              <FileText size={15} className="absolute" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
              <input placeholder="Ex.: funilaria no para-choque" value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg pl-9 pr-3 py-2.5" style={fieldStyle()} />
            </div>
          </div>

          {/* Repetir todo mês */}
          <div className="rounded-lg px-3 py-3" style={{ background: repeat ? "#EBF2FA" : "#F9FAFB", border: "0.5px solid rgba(0,0,0,0.08)" }}>
            <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
              <Repeat size={14} style={{ color: repeat ? "#185FA5" : "#6B7280" }} />
              <span style={{ fontSize: 13, color: repeat ? "#185FA5" : "#374151", fontWeight: repeat ? 600 : 400 }}>Repetir todo mês</span>
            </label>
            {repeat && (
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13, color: "#374151" }}>Por</span>
                  <input type="number" min={2} max={24} value={repeatMonths} onChange={(e) => setRepeatMonths(e.target.value)}
                    className="rounded-lg px-3 py-1.5" style={{ ...fieldStyle(!!errors.repeatMonths), width: 72 }} />
                  <span style={{ fontSize: 13, color: "#374151" }}>meses</span>
                </div>
                {errors.repeatMonths && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.repeatMonths}</p>}
                {repeatPreview && <p style={{ fontSize: 11, color: "#185FA5", marginTop: 6 }}>{repeatPreview}</p>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 flex-shrink-0" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 rounded-lg" style={{ background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando..." : repeat && months >= 2 ? `Lançar ${months} meses` : "Lançar"}
          </button>
        </div>
      </div>
    </div>
  );
}