import { openSaleDocument } from "../../lib/sale-documents";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Check, AlertTriangle, Clock, Trash2, X, Calendar, Receipt, ChevronDown, ChevronRight, Printer, BarChart3, List, Search, CheckCircle2, MessageCircle } from "lucide-react";
import * as api from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { PromissoryReport } from "./PromissoryReport";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Data de hoje no formato AAAA-MM-DD, no fuso de quem está usando o sistema
function todayISO() {
  return new Date().toLocaleDateString("en-CA");
}

// Compara só a data (sem horário): a parcela que vence hoje ainda não está vencida
function isOverdue(dueDate: string) {
  return dueDate.slice(0, 10) < todayISO();
}

// Mostra a data exatamente como foi salva, sem o fuso "voltar um dia"
function formatDate(dueDate: string) {
  return new Date(dueDate).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// "vence em 5 dias", "vence hoje", "atrasada há 3 dias"
function relativeDue(dueDate: string) {
  const [y, m, d] = dueDate.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = todayISO().split("-").map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  if (diff === 0) return "vence hoje";
  if (diff === 1) return "vence amanhã";
  if (diff > 1) return `vence em ${diff} dias`;
  return `atrasada há ${-diff} ${diff === -1 ? "dia" : "dias"}`;
}

// Mesma regra do backend: parcelas iguais, arredondadas para cima em múltiplos de R$ 10 (699 -> 700)
function splitInstallments(total: number, installments: number) {
  const n = Math.max(1, Math.floor(installments));
  const raw = Math.round((total / n) * 100) / 100;
  const value = raw <= 0 ? 0 : Math.ceil(raw / 10) * 10;
  return { value, last: value };
}

// ---------- Agrupamento: uma linha por venda ----------
interface SaleGroup {
  saleId: string;
  customerName: string;
  vehicleLabel: string;
  notes: api.PromissoryNote[];
}

function groupBySale(notes: api.PromissoryNote[]): SaleGroup[] {
  const map = new Map<string, SaleGroup>();
  for (const note of notes) {
    let group = map.get(note.saleId);
    if (!group) {
      const v = note.sale.vehicle;
      group = {
        saleId: note.saleId,
        customerName: note.customer.name,
        vehicleLabel: `${v.brand} ${v.model} ${v.year}`,
        notes: [],
      };
      map.set(note.saleId, group);
    }
    group.notes.push(note);
  }
  for (const g of map.values()) g.notes.sort((a, b) => a.installmentNumber - b.installmentNumber);
  return Array.from(map.values());
}

export function PromissoryNotes() {
  const [notes, setNotes] = useState<api.PromissoryNote[]>([]);
  const [summary, setSummary] = useState<api.PromissoryListSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "paid" | "overdue">("all");
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const auth = useAuth();
  const canSeeReport = auth.user?.role === "owner" || auth.user?.role === "admin";
  const [view, setView] = useState<"list" | "report">("list");
  const [search, setSearch] = useState("");

  const groups = useMemo(() => groupBySale(notes), [notes]);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const paid = filter === "paid" ? true : filter === "pending" || filter === "overdue" ? false : undefined;
      const res = await api.listPromissoryNotes({ paid });
      let items = res.items;
      if (filter === "overdue") items = items.filter(n => isOverdue(n.dueDate));
      if (filter === "pending") items = items.filter(n => !isOverdue(n.dueDate));
      setNotes(items);
      setSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar promissórias");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const toggle = (saleId: string) => setExpanded(prev => ({ ...prev, [saleId]: !prev[saleId] }));

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
    if (!window.confirm(`Remover a parcela ${note.installmentNumber}/${note.totalInstallments}?`)) return;
    try {
      await api.deletePromissoryNote(note.id);
      fetchNotes();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao remover");
    }
  };

  // Remove todas as parcelas de uma venda de uma vez
  const handleDeleteGroup = async (group: SaleGroup) => {
    if (!window.confirm(`Remover todas as ${group.notes.length} parcelas de ${group.customerName} (${group.vehicleLabel})?`)) return;
    try {
      await Promise.all(group.notes.map(n => api.deletePromissoryNote(n.id)));
      fetchNotes();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao remover parcelamento");
      fetchNotes();
    }
  };

  const viewToggle = canSeeReport ? (
    <div className="flex rounded-lg p-0.5" style={{ background: "#F4F6F9" }}>
      {([["list", "Parcelas", List], ["report", "Relatório", BarChart3]] as const).map(([v, label, Icon]) => (
        <button key={v} onClick={() => setView(v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md"
          style={{ fontSize: 13, fontWeight: view === v ? 600 : 400, background: view === v ? "#fff" : "transparent", color: view === v ? "#185FA5" : "#6B7280", boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  ) : null;

  if (view === "report") {
    return (
      <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
        <div className="px-6 py-4 flex-shrink-0 flex items-center justify-between gap-3 flex-wrap" style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3"><h2>Promissórias</h2>{viewToggle}</div>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5"><PromissoryReport /></div>
      </div>
    );
  }

  // Busca por cliente ou veículo
  const q = search.trim().toLowerCase();
  const visibleGroups = q ? groups.filter(g => `${g.customerName} ${g.vehicleLabel}`.toLowerCase().includes(q)) : groups;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  return (
    <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Cabeçalho (igual ao do relatório) */}
      <div className="px-6 py-4 flex-shrink-0 flex items-center justify-between gap-3 flex-wrap" style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <h2>Promissórias</h2>
          {viewToggle}
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg flex items-center gap-2" style={{ background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 500 }}>
          <Plus size={16} /> Gerar promissórias
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="flex flex-col gap-4">
          {/* Indicadores (clique para filtrar) */}
          {summary && (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
              {[
                { f: "overdue" as const, icon: AlertTriangle, color: "#DC2626", label: "Vencidas", value: currency(summary.overdueAmount),
                  sub: `${plural(summary.overdueSales ?? summary.overdueCount, "promissória", "promissórias")} · ${plural(summary.overdueCount, "parcela", "parcelas")}` },
                { f: "pending" as const, icon: Clock, color: "#D97706", label: "A vencer", value: currency(summary.pendingAmount),
                  sub: `${plural(summary.pendingSales ?? summary.pendingCount, "promissória", "promissórias")} · ${plural(summary.pendingCount, "parcela", "parcelas")}` },
                { f: "paid" as const, icon: CheckCircle2, color: "#27500A", label: "Recebido", value: currency(summary.paidAmount),
                  sub: `${plural(summary.paidCount, "parcela paga", "parcelas pagas")} · ${plural(summary.settledSales ?? 0, "quitada", "quitadas")}` },
              ].map((k) => {
                const active = filter === k.f;
                return (
                  <button key={k.f} onClick={() => setFilter(active ? "all" : k.f)} className="text-left"
                    style={{ background: "#fff", borderRadius: 12, padding: 16, border: active ? `1.5px solid ${k.color}` : "1px solid rgba(0,0,0,0.08)", boxShadow: active ? `0 0 0 3px ${k.color}1A` : "none", transition: "box-shadow .15s" }}>
                    <div className="flex items-center gap-2" style={{ fontSize: 12, color: k.color }}><k.icon size={15} /> {k.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#0F1923", marginTop: 4 }}>{k.value}</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>{k.sub}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Filtros e busca */}
          <div className="flex items-center gap-3 flex-wrap" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 10 }}>
            <div className="flex rounded-lg p-0.5" style={{ background: "#F4F6F9" }}>
              {(["all", "overdue", "pending", "paid"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className="px-3 py-1.5 rounded-md"
                  style={{ fontSize: 13, fontWeight: filter === f ? 600 : 400, background: filter === f ? "#fff" : "transparent", color: filter === f ? "#185FA5" : "#6B7280", boxShadow: filter === f ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>
                  {f === "all" ? "Todas" : f === "overdue" ? "Vencidas" : f === "pending" ? "A vencer" : "Pagas"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-1" style={{ minWidth: 200, background: "#F9FAFB", borderRadius: 8, padding: "6px 10px", border: "0.5px solid rgba(0,0,0,0.08)" }}>
              <Search size={15} style={{ color: "#9CA3AF" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente ou veículo"
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13 }} />
            </div>
            <span style={{ fontSize: 12, color: "#6B7280" }}>{plural(visibleGroups.length, "promissória", "promissórias")}</span>
          </div>

          {error && (
            <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
              <span>{error}</span><button onClick={fetchNotes} style={{ fontWeight: 500 }}>Tentar novamente</button>
            </div>
          )}
          {loading && groups.length === 0 && <p style={{ fontSize: 13, color: "#6B7280" }}>Carregando...</p>}
          {!loading && visibleGroups.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12" style={{ background: "#fff", borderRadius: 12, border: "1px dashed rgba(0,0,0,0.12)", color: "#9CA3AF", fontSize: 13 }}>
              <Receipt size={28} />
              {q ? "Nenhuma promissória para essa busca." : "Nenhuma promissória por aqui."}
            </div>
          )}

          {/* Uma linha por promissória (venda) */}
          {visibleGroups.map((g) => {
            const isOpen = !!expanded[g.saleId];
            const totalInstallments = g.notes[0]?.totalInstallments ?? g.notes.length;
            const paidNotes = g.notes.filter(n => n.paid);
            const totalValue = g.notes.reduce((sum, n) => sum + Number(n.amount), 0);
            const remaining = g.notes.filter(n => !n.paid).reduce((sum, n) => sum + Number(n.amount), 0);
            const nextNote = g.notes.find(n => !n.paid);
            const overdueNotes = g.notes.filter(n => !n.paid && isOverdue(n.dueDate));
            const status = !nextNote
              ? { label: "Quitada", bg: "#EAF3DE", color: "#27500A" }
              : overdueNotes.length
                ? { label: `${overdueNotes.length} em atraso`, bg: "#FEE2E2", color: "#DC2626" }
                : { label: "Em dia", bg: "#EBF2FA", color: "#185FA5" };
            const progress = filter === "all" ? (paidNotes.length / Math.max(1, totalInstallments)) * 100 : 0;
            const initials = g.customerName.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("");
            const phone = (g.notes[0]?.customer.phone ?? "").replace(/\D/g, "");
            const overdueTotal = overdueNotes.reduce((sum, n) => sum + Number(n.amount), 0);

            return (
              <div key={g.saleId} style={{ background: "#fff", borderRadius: 12, border: overdueNotes.length ? "1px solid #FECACA" : "1px solid rgba(0,0,0,0.08)", overflow: "hidden" }}>
                <div onClick={() => toggle(g.saleId)} className="flex items-center gap-4 flex-wrap" style={{ padding: "14px 16px", cursor: "pointer" }}>
                  <div className="flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, borderRadius: 99, background: status.bg, color: status.color, fontWeight: 700, fontSize: 14 }}>
                    {initials || "?"}
                  </div>
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0F1923" }}>{g.customerName}</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>{g.vehicleLabel}</div>
                  </div>
                  {filter === "all" ? (
                    <div style={{ flex: "1 1 180px" }}>
                      <div className="flex justify-between" style={{ fontSize: 12, color: "#6B7280", marginBottom: 4 }}>
                        <span>{paidNotes.length}/{totalInstallments} pagas</span><span>{Math.round(progress)}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 99, background: "#EEF1F5", overflow: "hidden" }}>
                        <div style={{ width: `${progress}%`, height: "100%", background: !nextNote ? "#16A34A" : "#185FA5" }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ flex: "1 1 180px", fontSize: 12, color: "#6B7280" }}>{plural(g.notes.length, "parcela", "parcelas")}</div>
                  )}
                  <div style={{ flex: "0 0 130px" }}>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{filter === "all" && nextNote ? "Falta receber" : "Valor"}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0F1923" }}>{currency(filter === "all" && nextNote ? remaining : totalValue)}</div>
                    {filter === "all" && nextNote && <div style={{ fontSize: 11, color: "#9CA3AF" }}>de {currency(totalValue)}</div>}
                  </div>
                  <div style={{ flex: "0 0 130px" }}>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>Próximo vencimento</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: overdueNotes.length ? "#DC2626" : "#0F1923" }}>{nextNote ? formatDate(nextNote.dueDate) : "—"}</div>
                    {nextNote && <div style={{ fontSize: 11, color: overdueNotes.length ? "#DC2626" : "#9CA3AF" }}>{relativeDue(nextNote.dueDate)}</div>}
                  </div>
                  <span className="px-2.5 py-1 rounded-full" style={{ fontSize: 12, fontWeight: 600, background: status.bg, color: status.color, whiteSpace: "nowrap" }}>{status.label}</span>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {overdueNotes.length > 0 && phone.length >= 10 && (
                      <a href={`https://wa.me/55${phone}?text=${encodeURIComponent(`Olá, ${g.customerName.split(" ")[0]}! Tudo bem? Passando para lembrar que há ${overdueNotes.length} parcela(s) da sua promissória em aberto, no total de ${currency(overdueTotal)}. Podemos combinar o pagamento?`)}`}
                        target="_blank" rel="noreferrer" title="Cobrar pelo WhatsApp" className="p-2 rounded-lg" style={{ color: "#166534", background: "#DCFCE7" }}>
                        <MessageCircle size={14} />
                      </a>
                    )}
                    <button onClick={() => openSaleDocument(g.saleId, "promissory").catch((err) => alert(err instanceof Error ? err.message : "Erro ao gerar promissórias"))}
                      className="p-2 rounded-lg" style={{ color: "#185FA5", background: "#EBF2FA" }} title="Imprimir promissórias">
                      <Printer size={14} />
                    </button>
                    {filter === "all" && canSeeReport && (
                      <button onClick={() => handleDeleteGroup(g)} className="p-2 rounded-lg" style={{ color: "#DC2626", background: "#FEE2E2" }} title="Remover todas as parcelas">
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button onClick={() => toggle(g.saleId)} className="p-2 rounded-lg" style={{ color: "#6B7280", background: "#F4F6F9" }} title={isOpen ? "Esconder parcelas" : "Ver parcelas"}>
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  </div>
                </div>

                {/* Parcelas em cartõezinhos */}
                {isOpen && (
                  <div className="grid gap-2" style={{ padding: "12px 16px 16px", background: "#F9FAFB", borderTop: "1px solid rgba(0,0,0,0.06)", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
                    {g.notes.map((note) => {
                      const overdue = !note.paid && isOverdue(note.dueDate);
                      const c = note.paid ? { bg: "#F0FDF4", border: "#BBF7D0", color: "#15803D", label: "Paga" }
                        : overdue ? { bg: "#FEF2F2", border: "#FECACA", color: "#DC2626", label: "Vencida" }
                        : { bg: "#fff", border: "rgba(0,0,0,0.08)", color: "#B45309", label: "A vencer" };
                      return (
                        <div key={note.id} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px" }}>
                          <div className="flex items-center justify-between">
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>{note.installmentNumber}/{note.totalInstallments}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: c.color }}>{c.label}</span>
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#0F1923", marginTop: 2 }}>{currency(Number(note.amount))}</div>
                          <div className="flex items-center gap-1" style={{ fontSize: 12, color: overdue ? "#DC2626" : "#6B7280" }}>
                            <Calendar size={12} /> {formatDate(note.dueDate)}
                          </div>
                          {note.paid && note.paidAt && <div style={{ fontSize: 11, color: "#15803D" }}>pago em {new Date(note.paidAt).toLocaleDateString("pt-BR")}</div>}
                          <div className="flex items-center gap-1.5" style={{ marginTop: 8 }}>
                            {!note.paid && (
                              <button onClick={() => handlePay(note)} className="flex items-center gap-1 px-2 py-1 rounded-md flex-1 justify-center"
                                style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: "#16A34A" }}>
                                <Check size={12} /> Dar baixa
                              </button>
                            )}
                            {canSeeReport && (
                              <button onClick={() => handleDelete(note)} className="p-1 rounded-md" style={{ color: "#DC2626", background: "#FEE2E2" }} title="Remover parcela"><Trash2 size={12} /></button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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
  const [firstDueDate, setFirstDueDate] = useState(todayISO());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listSales({ pageSize: 100 })
      .then((s) => setSales(s.items.filter((x) => (x as { status?: string }).status !== "canceled")))
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
  const split = parsedInstallments > 0 ? splitInstallments(parsedAmount, parsedInstallments) : { value: 0, last: 0 };

  // Prévia das parcelas: número, vencimento calculado e valor
  const preview = (() => {
    if (parsedInstallments <= 0 || parsedAmount <= 0 || !firstDueDate) return [];
    const first = new Date(firstDueDate + "T00:00:00");
    if (isNaN(first.getTime())) return [];
    return Array.from({ length: Math.min(parsedInstallments, 60) }, (_, i) => ({
      number: i + 1,
      dueDate: addMonths(first, i),
      amount: i === parsedInstallments - 1 ? split.last : split.value,
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

            {split.value > 0 && (
              <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: "#EBF2FA" }}>
                <span style={{ fontSize: 13, color: "#185FA5" }}>
                  {parsedInstallments > 1 && split.last !== split.value
                    ? `${parsedInstallments - 1}x de ${currency(split.value)} + última de ${currency(split.last)}`
                    : "Valor de cada parcela"}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#185FA5" }}>{currency(split.value)}</span>
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