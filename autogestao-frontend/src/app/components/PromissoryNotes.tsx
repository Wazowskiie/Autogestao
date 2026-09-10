import { useCallback, useEffect, useState } from "react";
import { Plus, Check, AlertTriangle, Clock, Trash2, X, Calendar, Receipt, ChevronDown } from "lucide-react";
import * as api from "../../lib/api";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isOverdue(dueDate: string) {
  return !isNaN(new Date(dueDate).getTime()) && new Date(dueDate) < new Date();
}

export function PromissoryNotes() {
  const [notes, setNotes] = useState<api.PromissoryNote[]>([]);
  const [summary, setSummary] = useState<api.PromissoryListSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "paid" | "overdue">("all");
  const [showModal, setShowModal] = useState(false);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const paid = filter === "paid" ? true : filter === "pending" || filter === "overdue" ? false : undefined;
      const res = await api.listPromissoryNotes({ paid });
      const items = filter === "overdue" ? res.items.filter(n => isOverdue(n.dueDate)) : res.items;
      setNotes(items);
      setTotal(res.total);
      setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar promissórias");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const handlePay = async (note: api.PromissoryNote) => {
    if (!window.confirm(`Dar baixa na parcela ${note.installmentNumber}/${note.totalInstallments} de ${currency(Number(note.amount))}?`)) return;
    try {
      await api.payPromissoryNote(note.id);
      fetchNotes();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao dar baixa");
    }
  };

  const handleDelete = async (note: api.PromissoryNote) => {
    if (!window.confirm("Remover esta promissória?")) return;
    try {
      await api.deletePromissoryNote(note.id);
      fetchNotes();
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
            <h2>Promissórias</h2>
            <span className="px-2 py-0.5 rounded-full" style={{ background: "#EBF2FA", color: "#185FA5", fontSize: 12, fontWeight: 500 }}>{total}</span>
          </div>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg flex items-center gap-2" style={{ background: "var(--primary)", color: "#fff", fontSize: 13 }}>
            <Plus size={16} /> Gerar promissórias
          </button>
        </div>

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="p-4 rounded-xl" style={{ background: "#FEE2E2" }}>
              <div className="flex items-center gap-2 mb-1"><AlertTriangle size={16} style={{ color: "#DC2626" }} /><span style={{ fontSize: 12, color: "#DC2626" }}>Vencidas</span></div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "#DC2626" }}>{summary.overdueCount} · {currency(summary.overdueAmount)}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: "#FEF3C7" }}>
              <div className="flex items-center gap-2 mb-1"><Clock size={16} style={{ color: "#D97706" }} /><span style={{ fontSize: 12, color: "#D97706" }}>A vencer</span></div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "#D97706" }}>{summary.pendingCount} · {currency(summary.pendingAmount)}</div>
            </div>
            <div className="p-4 rounded-xl" style={{ background: "#EAF3DE" }}>
              <div className="flex items-center gap-2 mb-1"><Check size={16} style={{ color: "#27500A" }} /><span style={{ fontSize: 12, color: "#27500A" }}>Pagas</span></div>
              <div style={{ fontSize: 18, fontWeight: 600, color: "#27500A" }}>{summary.paidCount} · {currency(summary.paidAmount)}</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {(["all", "overdue", "pending", "paid"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg"
              style={{ fontSize: 13, fontWeight: filter === f ? 600 : 400, background: filter === f ? "#EBF2FA" : "#F4F6F9", color: filter === f ? "#185FA5" : "#6B7280" }}>
              {f === "all" ? "Todas" : f === "overdue" ? "Vencidas" : f === "pending" ? "A vencer" : "Pagas"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-6 pt-4">
          <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
            <span>{error}</span><button onClick={fetchNotes} style={{ fontWeight: 500 }}>Tentar novamente</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="rounded-xl overflow-hidden" style={{ background: "#fff", border: "1px solid var(--border)" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead style={{ background: "#F9FAFB", borderBottom: "1px solid var(--border)" }}>
              <tr>
                {["Cliente", "Veículo", "Parcela", "Valor", "Vencimento", "Status", "Ações"].map(h => (
                  <th key={h} className="text-left px-4 py-3" style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && notes.length === 0 && (
                <tr><td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#9CA3AF" }}>Nenhuma promissória encontrada.</td></tr>
              )}
              {notes.map((note, i) => {
                const overdue = !note.paid && isOverdue(note.dueDate);
                return (
                  <tr key={note.id} style={{ borderBottom: i < notes.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <td className="px-4 py-3" style={{ fontSize: 13, fontWeight: 500 }}>{note.customer.name}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: "#6B7280" }}>
                      {note.sale.vehicle.brand} {note.sale.vehicle.model} {note.sale.vehicle.year}
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: "#374151" }}>
                      {note.installmentNumber}/{note.totalInstallments}
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, fontWeight: 600 }}>{currency(Number(note.amount))}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: overdue ? "#DC2626" : "#374151", fontWeight: overdue ? 600 : 400 }}>
                      {new Date(note.dueDate).toLocaleDateString("pt-BR")}
                      {overdue && <span style={{ fontSize: 11, marginLeft: 6 }}>VENCIDA</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded" style={{ fontSize: 11, background: note.paid ? "#EAF3DE" : overdue ? "#FEE2E2" : "#FEF3C7", color: note.paid ? "#27500A" : overdue ? "#DC2626" : "#D97706" }}>
                        {note.paid ? "Paga" : overdue ? "Vencida" : "Pendente"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {!note.paid && (
                          <button onClick={() => handlePay(note)} className="p-1.5 rounded" style={{ color: "#27500A", background: "#EAF3DE" }} title="Dar baixa"><Check size={13} /></button>
                        )}
                        <button onClick={() => handleDelete(note)} className="p-1.5 rounded" style={{ color: "#DC2626", background: "#FEE2E2" }}><Trash2 size={13} /></button>
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
        <NewPromissoryModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchNotes(); }} />
      )}
    </div>
  );
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Corrige o "overflow" de meses com menos dias (ex: 31/jan + 1 mês)
  if (d.getDate() !== day) d.setDate(0);
  return d;
}

function NewPromissoryModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [sales, setSales] = useState<api.Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [saleId, setSaleId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [totalInstallments, setTotalInstallments] = useState("1");
  const [totalAmount, setTotalAmount] = useState("");
  const [firstDueDate, setFirstDueDate] = useState(new Date().toISOString().split("T")[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listSales({ pageSize: 100 })
      .then((s) => setSales(s.items))
      .catch(() => setError("Não foi possível carregar as vendas"))
      .finally(() => setSalesLoading(false));
  }, []);

  // Preenche automaticamente o cliente e o valor ao selecionar a venda
  useEffect(() => {
    const sale = sales.find(s => s.id === saleId);
    if (sale) {
      setCustomerId(sale.customer.id);
      setTotalAmount(String(sale.price));
    }
  }, [saleId, sales]);

  const selectedSale = sales.find(s => s.id === saleId);
  const parsedInstallments = Math.max(0, Math.floor(Number(totalInstallments) || 0));
  const parsedAmount = Number(totalAmount) || 0;
  const installmentValue = parsedInstallments > 0 ? parsedAmount / parsedInstallments : 0;

  // Prévia das parcelas: número, vencimento calculado e valor
  const preview = (() => {
    if (parsedInstallments <= 0 || parsedAmount <= 0 || !firstDueDate) return [];
    const first = new Date(firstDueDate + "T00:00:00");
    if (isNaN(first.getTime())) return [];
    return Array.from({ length: Math.min(parsedInstallments, 60) }, (_, i) => ({
      number: i + 1,
      dueDate: addMonths(first, i),
      amount: installmentValue,
    }));
  })();

  function validate() {
    const e: Record<string, string> = {};
    if (!saleId) e.saleId = "Selecione uma venda";
    if (!totalInstallments || parsedInstallments < 1) e.totalInstallments = "Informe ao menos 1 parcela";
    else if (parsedInstallments > 48) e.totalInstallments = "Máximo de 48 parcelas";
    if (!totalAmount || parsedAmount <= 0) e.totalAmount = "Informe um valor maior que zero";
    if (!firstDueDate) e.firstDueDate = "Informe a data de vencimento";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createPromissoryNotes({
        saleId,
        customerId,
        totalInstallments: parsedInstallments,
        totalAmount: parsedAmount,
        firstDueDate,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar promissórias");
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
      <div className="w-full rounded-xl overflow-hidden" style={{ background: "#fff", maxWidth: 520, margin: 16, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div className="relative px-6 py-5 flex-shrink-0" style={{ background: "#0F1923" }}>
          <button onClick={onClose} className="absolute right-5 top-5" style={{ color: "#9CA3AF" }}><X size={20} /></button>
          <div className="flex items-center gap-2">
            <Receipt size={18} style={{ color: "#185FA5" }} />
            <p style={{ fontSize: 11, color: "#185FA5", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>Financeiro</p>
          </div>
          <h3 style={{ color: "#fff", marginTop: 4 }}>Gerar promissórias</h3>
          <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>Parcele uma venda e confira o vencimento de cada nota.</p>
        </div>

        <div className="px-6 py-5 overflow-auto">
          {error && <div className="rounded-lg px-3 py-2 mb-4" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          <div className="flex flex-col gap-4">
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Venda *</label>
              <div className="relative">
                <select value={saleId} onChange={(e) => setSaleId(e.target.value)} disabled={salesLoading}
                  className="w-full rounded-lg px-3 py-2.5 appearance-none" style={{ ...fieldStyle(!!errors.saleId), background: "#fff", paddingRight: 32 }}>
                  <option value="">{salesLoading ? "Carregando vendas..." : "Selecionar venda"}</option>
                  {sales.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.vehicle.brand} {s.vehicle.model} — {s.customer.name} · {currency(s.price)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className="absolute pointer-events-none" style={{ right: 12, top: 12, color: "#9CA3AF" }} />
              </div>
              {errors.saleId && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.saleId}</p>}
              {selectedSale && (
                <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                  Cliente: {selectedSale.customer.name} · Valor da venda: {currency(selectedSale.price)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Nº de parcelas *</label>
                <input type="number" min="1" max="48" placeholder="1" value={totalInstallments} onChange={(e) => setTotalInstallments(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5" style={fieldStyle(!!errors.totalInstallments)} />
                {errors.totalInstallments && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.totalInstallments}</p>}
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Valor total *</label>
                <input type="number" min="0" step="0.01" placeholder="0,00" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5" style={fieldStyle(!!errors.totalAmount)} />
                {errors.totalAmount && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.totalAmount}</p>}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Vencimento da 1ª parcela *</label>
              <input type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5" style={fieldStyle(!!errors.firstDueDate)} />
              {errors.firstDueDate && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.firstDueDate}</p>}
            </div>

            {installmentValue > 0 && (
              <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: "#EBF2FA" }}>
                <span style={{ fontSize: 13, color: "#185FA5" }}>Valor de cada parcela</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#185FA5" }}>{currency(installmentValue)}</span>
              </div>
            )}

            {/* Prévia das parcelas */}
            {preview.length > 0 && (
              <div>
                <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                  <Calendar size={14} style={{ color: "#6B7280" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Prévia das parcelas</span>
                </div>
                <div className="rounded-lg overflow-hidden" style={{ border: "0.5px solid rgba(0,0,0,0.1)", maxHeight: 220, overflowY: "auto" }}>
                  {preview.map((p, i) => (
                    <div key={p.number} className="flex items-center justify-between px-3 py-2"
                      style={{ background: i % 2 === 0 ? "#fff" : "#F9FAFB", borderBottom: i < preview.length - 1 ? "0.5px solid rgba(0,0,0,0.06)" : "none" }}>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center rounded-full flex-shrink-0"
                          style={{ width: 20, height: 20, background: "#EBF2FA", color: "#185FA5", fontSize: 10, fontWeight: 700 }}>
                          {p.number}
                        </span>
                        <span style={{ fontSize: 12, color: "#374151" }}>{p.dueDate.toLocaleDateString("pt-BR")}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#0F1923" }}>{currency(p.amount)}</span>
                    </div>
                  ))}
                </div>
                {parsedInstallments > 60 && (
                  <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>Mostrando as primeiras 60 parcelas.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 flex-shrink-0" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 rounded-lg" style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Gerando..." : "Gerar parcelas"}
          </button>
        </div>
      </div>
    </div>
  );
}