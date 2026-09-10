import { useCallback, useEffect, useState } from "react";
import { Plus, Phone, X, Clock, Thermometer, Calendar, DollarSign } from "lucide-react";
import * as api from "../../lib/api";

const STAGE_CONFIG: Record<api.LeadStage, { label: string; color: string; bg: string }> = {
  new:         { label: "Novo",          color: "#185FA5", bg: "#EBF2FA" },
  contacted:   { label: "Contactado",    color: "#D97706", bg: "#FEF3C7" },
  negotiating: { label: "Em negociação", color: "#7C3AED", bg: "#EDE9FE" },
  won:         { label: "Ganho",         color: "#27500A", bg: "#EAF3DE" },
  lost:        { label: "Perdido",       color: "#DC2626", bg: "#FEE2E2" },
};

const TEMP_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  hot:  { label: "Quente", color: "#DC2626", emoji: "🔥" },
  warm: { label: "Morno",  color: "#D97706", emoji: "🌤" },
  cold: { label: "Frio",   color: "#185FA5", emoji: "❄️" },
};

const SOURCES = ["whatsapp","instagram","site","indicacao","olx","webmotors","presencial","outro"];
const PAYMENT_INTENTS = ["À vista", "Financiamento", "Consórcio", "PIX", "Ainda não definiu"];
const STAGES: api.LeadStage[] = ["new", "contacted", "negotiating", "won", "lost"];

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function isOverdue(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export function LeadsCRM() {
  const [grouped, setGrouped] = useState<api.LeadsGrouped>({ new: [], contacted: [], negotiating: [], won: [], lost: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<api.Lead | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listLeads();
      setGrouped(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar leads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const totalLeads = STAGES.reduce((sum, s) => sum + (grouped[s]?.length ?? 0), 0);

  const handleDrop = async (leadId: string, newStage: api.LeadStage) => {
    try {
      await api.updateLeadStage(leadId, newStage);
      fetchLeads();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao mover lead");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remover este lead?")) return;
    try {
      await api.deleteLead(id);
      fetchLeads();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao remover lead");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "var(--background)" }}>
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
        <div className="flex items-center gap-3">
          <h2>Leads</h2>
          <span className="px-2 py-0.5 rounded-full" style={{ background: "#EBF2FA", color: "#185FA5", fontSize: 12, fontWeight: 500 }}>{totalLeads}</span>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg"
          style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500 }}>
          <Plus size={16} /> Novo Lead
        </button>
      </div>

      {error && (
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
            <span>{error}</span><button onClick={fetchLeads} style={{ fontWeight: 500 }}>Tentar novamente</button>
          </div>
        </div>
      )}

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 py-4">
        <div className="flex gap-4 h-full" style={{ minWidth: STAGES.length * 270 }}>
          {STAGES.map((stage) => {
            const cfg = STAGE_CONFIG[stage];
            const leads = grouped[stage] ?? [];
            return (
              <div key={stage} className="flex flex-col rounded-xl flex-shrink-0"
                style={{ width: 270, background: "#F9FAFB", border: "0.5px solid rgba(0,0,0,0.08)" }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("leadId");
                  if (id) handleDrop(id, stage);
                }}>
                <div className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                    <span className="px-1.5 py-0.5 rounded-full"
                      style={{ background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600 }}>{leads.length}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                  {leads.length === 0 && !loading && (
                    <div style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", paddingTop: 16 }}>Nenhum lead aqui</div>
                  )}
                  {leads.map((lead) => {
                    const temp = lead.temperature ? TEMP_CONFIG[lead.temperature] : null;
                    const overdueAction = isOverdue(lead.nextActionDate);
                    return (
                      <div key={lead.id} draggable
                        onDragStart={(e) => { e.dataTransfer.setData("leadId", lead.id); setDragging(lead.id); }}
                        onDragEnd={() => setDragging(null)}
                        className="rounded-lg p-3"
                        style={{ background: "#fff", border: overdueAction ? "1px solid #FCA5A5" : "0.5px solid rgba(0,0,0,0.08)", cursor: "grab", opacity: dragging === lead.id ? 0.5 : 1 }}>
                        {/* Header do card */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center justify-center rounded-full flex-shrink-0"
                              style={{ width: 28, height: 28, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700 }}>
                              {lead.customer?.name?.split(" ").map(w => w[0]).slice(0, 2).join("") ?? "?"}
                            </div>
                            <div>
                              <div className="flex items-center gap-1">
                                <span style={{ fontSize: 13, fontWeight: 500, color: "#0F1923" }}>
                                  {lead.customer?.name ?? "Sem cliente"}
                                </span>
                                {temp && <span title={temp.label}>{temp.emoji}</span>}
                              </div>
                              {lead.vehicle && (
                                <div style={{ fontSize: 11, color: "#6B7280" }}>{lead.vehicle.brand} {lead.vehicle.model} {lead.vehicle.year}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => setSelectedLead(lead)}
                              style={{ fontSize: 11, color: "#185FA5", padding: "2px 6px", borderRadius: 4, background: "#EBF2FA" }}>
                              ver
                            </button>
                            <button onClick={() => handleDelete(lead.id)} style={{ color: "#D1D5DB" }}><X size={14} /></button>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex flex-col gap-1">
                          {lead.customer?.phone && (
                            <div className="flex items-center gap-1.5">
                              <Phone size={11} style={{ color: "#9CA3AF" }} />
                              <span style={{ fontSize: 11, color: "#6B7280" }}>{lead.customer.phone}</span>
                            </div>
                          )}
                          {lead.budget && (
                            <div className="flex items-center gap-1.5">
                              <DollarSign size={11} style={{ color: "#9CA3AF" }} />
                              <span style={{ fontSize: 11, color: "#6B7280" }}>Orçamento: {currency(Number(lead.budget))}</span>
                            </div>
                          )}
                          {lead.paymentIntent && (
                            <span className="px-1.5 py-0.5 rounded" style={{ fontSize: 11, background: "#F4F6F9", color: "#6B7280", width: "fit-content" }}>
                              {lead.paymentIntent}
                            </span>
                          )}
                          {lead.nextActionDate && (
                            <div className="flex items-center gap-1.5">
                              <Calendar size={11} style={{ color: overdueAction ? "#DC2626" : "#9CA3AF" }} />
                              <span style={{ fontSize: 11, color: overdueAction ? "#DC2626" : "#6B7280", fontWeight: overdueAction ? 600 : 400 }}>
                                {overdueAction ? "⚠ " : ""}
                                {new Date(lead.nextActionDate).toLocaleDateString("pt-BR")}
                                {lead.nextActionNote ? ` · ${lead.nextActionNote}` : ""}
                              </span>
                            </div>
                          )}
                          {lead.source && (
                            <span className="px-1.5 py-0.5 rounded" style={{ fontSize: 11, background: "#F4F6F9", color: "#6B7280", width: "fit-content" }}>
                              {lead.source}
                            </span>
                          )}
                          {lead.notes && (
                            <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {lead.notes}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 mt-2" style={{ color: "#9CA3AF" }}>
                          <Clock size={11} />
                          <span style={{ fontSize: 11 }}>{timeAgo(lead.createdAt)}</span>
                          {lead.assignedSeller && (
                            <span style={{ fontSize: 11, marginLeft: "auto" }}>· {lead.assignedSeller.name}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <NewLeadModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchLeads(); }} />
      )}
      {selectedLead && (
        <LeadDetailModal lead={selectedLead} onClose={() => setSelectedLead(null)} onSaved={() => { setSelectedLead(null); fetchLeads(); }} />
      )}
    </div>
  );
}

function NewLeadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [vehicles, setVehicles] = useState<api.Vehicle[]>([]);
  const [sellers, setSellers] = useState<api.Seller[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [assignedSellerId, setAssignedSellerId] = useState("");
  const [source, setSource] = useState("");
  const [temperature, setTemperature] = useState<api.LeadTemperature | "">("");
  const [budget, setBudget] = useState("");
  const [paymentIntent, setPaymentIntent] = useState("");
  const [nextActionDate, setNextActionDate] = useState("");
  const [nextActionNote, setNextActionNote] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.listVehicles({ status: "available", pageSize: 100 }),
      api.listSellers(),
    ]).then(([v, s]) => { setVehicles(v.items); setSellers(s); }).catch(() => {});
  }, []);

  const handleSubmit = async () => {
    if (!customerName.trim()) { setError("Nome do cliente é obrigatório"); return; }
    setSaving(true);
    setError(null);
    try {
      await api.createLead({
        customerName: customerName.trim(),
        customerPhone: customerPhone || undefined,
        customerEmail: customerEmail || undefined,
        vehicleId: vehicleId || undefined,
        assignedSellerId: assignedSellerId || undefined,
        source: source || undefined,
        temperature: (temperature as api.LeadTemperature) || undefined,
        budget: budget ? Number(budget) : undefined,
        paymentIntent: paymentIntent || undefined,
        nextActionDate: nextActionDate || undefined,
        nextActionNote: nextActionNote || undefined,
        notes: notes || undefined,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar lead");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" as const, background: "#FAFAFA" };
  const selectStyle = { ...inputStyle, background: "#fff" };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-h-[90vh] overflow-y-auto" style={{ background: "#fff", borderRadius: 16, maxWidth: 500, margin: 16 }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)", zIndex: 1 }}>
          <h3>Novo Lead</h3>
          <button onClick={onClose} style={{ color: "#6B7280" }}><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          {/* Cliente */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Cliente</p>
            <div className="flex flex-col gap-3">
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Nome *</label>
                <input placeholder="Carlos Mendes" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Telefone</label>
                  <input placeholder="(11) 9 9999-9999" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>E-mail</label>
                  <input type="email" placeholder="cliente@email.com" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                </div>
              </div>
            </div>
          </div>

          {/* Interesse */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Interesse</p>
            <div className="flex flex-col gap-3">
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Veículo de interesse</label>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                  <option value="">Selecionar veículo disponível</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} {v.year}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Orçamento disponível</label>
                  <input placeholder="0,00" value={budget} onChange={(e) => setBudget(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Forma de pagamento</label>
                  <select value={paymentIntent} onChange={(e) => setPaymentIntent(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                    <option value="">Selecionar</option>
                    {PAYMENT_INTENTS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Qualificação */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Qualificação</p>
            <div className="flex flex-col gap-3">
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 8 }}>Temperatura</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(TEMP_CONFIG) as [api.LeadTemperature, typeof TEMP_CONFIG[string]][]).map(([key, cfg]) => (
                    <button key={key} onClick={() => setTemperature(temperature === key ? "" : key)}
                      className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg"
                      style={{
                        border: temperature === key ? `1.5px solid ${cfg.color}` : "0.5px solid rgba(0,0,0,0.1)",
                        background: temperature === key ? `${cfg.color}15` : "#FAFAFA",
                        fontSize: 12, fontWeight: temperature === key ? 600 : 400,
                        color: temperature === key ? cfg.color : "#6B7280",
                      }}>
                      {cfg.emoji} {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Origem</label>
                  <select value={source} onChange={(e) => setSource(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                    <option value="">Selecionar</option>
                    {SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Vendedor</label>
                  <select value={assignedSellerId} onChange={(e) => setAssignedSellerId(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5" style={selectStyle}>
                    <option value="">Sem atribuição</option>
                    {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Próxima ação */}
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Próxima ação</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Data</label>
                <input type="date" value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>O que fazer</label>
                <input placeholder="Ligar às 14h" value={nextActionNote} onChange={(e) => setNextActionNote(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5" style={inputStyle} />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Observações</label>
            <textarea placeholder="Interesse em SUV 2022, prefere cor escura..." rows={3}
              value={notes} onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5"
              style={{ ...inputStyle, resize: "vertical" as const }} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg"
            style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 rounded-lg"
            style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando..." : "Criar Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LeadDetailModal({ lead, onClose, onSaved }: { lead: api.Lead; onClose: () => void; onSaved: () => void }) {
  const cfg = STAGE_CONFIG[lead.stage];
  const temp = lead.temperature ? TEMP_CONFIG[lead.temperature] : null;
  const overdueAction = isOverdue(lead.nextActionDate);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-h-[85vh] overflow-y-auto" style={{ background: "#fff", borderRadius: 16, maxWidth: 460, margin: 16 }}>
        <div className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)", zIndex: 1 }}>
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 14, fontWeight: 600 }}>{lead.customer?.name ?? "Lead"}</span>
            {temp && <span>{temp.emoji}</span>}
            <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, background: cfg.bg, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
          </div>
          <button onClick={onClose} style={{ color: "#6B7280" }}><X size={20} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {[
            { label: "Telefone", value: lead.customer?.phone },
            { label: "E-mail", value: lead.customer?.email },
            { label: "Veículo de interesse", value: lead.vehicle ? `${lead.vehicle.brand} ${lead.vehicle.model} ${lead.vehicle.year}` : null },
            { label: "Orçamento", value: lead.budget ? currency(Number(lead.budget)) : null },
            { label: "Pagamento pretendido", value: lead.paymentIntent },
            { label: "Origem", value: lead.source },
            { label: "Vendedor", value: lead.assignedSeller?.name },
            { label: "Observações", value: lead.notes },
          ].filter(({ value }) => value).map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: "#9CA3AF", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{value}</div>
            </div>
          ))}

          {lead.nextActionDate && (
            <div className="rounded-lg px-4 py-3" style={{ background: overdueAction ? "#FEE2E2" : "#EBF2FA" }}>
              <div style={{ fontSize: 11, color: overdueAction ? "#DC2626" : "#185FA5", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {overdueAction ? "⚠ Ação vencida" : "📅 Próxima ação"}
              </div>
              <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>
                {new Date(lead.nextActionDate).toLocaleDateString("pt-BR")}
                {lead.nextActionNote && ` · ${lead.nextActionNote}`}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg"
            style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}