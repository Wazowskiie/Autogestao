// Reserva de veículo com sinal
import { useEffect, useState } from "react";
import { Bookmark, Loader2, Search, X } from "lucide-react";
import * as api from "../../lib/api";
import * as sapi from "../../lib/sales-api";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function parseBRL(value: string) {
  const v = value.trim().replace(/[R$\s]/g, "");
  if (!v) return 0;
  const num = Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
  return Number.isFinite(num) ? num : NaN;
}
function localDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const METHODS = [
  { value: "pix", label: "PIX" }, { value: "cash", label: "Dinheiro" }, { value: "transfer", label: "Transferência" },
  { value: "card_debit", label: "Cartão de débito" }, { value: "card_credit", label: "Cartão de crédito" },
];
const input = { border: "0.5px solid rgba(0,0,0,0.14)", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff", outline: "none", width: "100%" };
const lbl = { fontSize: 13, color: "#374151", display: "block", marginBottom: 6 } as const;

export function ReservationModal({ vehicle, canManage, onClose, onChanged, presetCustomer, leadId }: {
  vehicle: Pick<api.Vehicle, "id" | "brand" | "model" | "year" | "price"> & { plate?: string | null };
  canManage: boolean; onClose: () => void; onChanged: () => void;
  presetCustomer?: api.Customer | null; leadId?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<sapi.Reservation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Formulário de nova reserva
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<api.Customer[]>([]);
  const [customer, setCustomer] = useState<api.Customer | null>(presetCustomer ?? null);
  const [deposit, setDeposit] = useState("");
  const [method, setMethod] = useState("pix");
  const [expiresAt, setExpiresAt] = useState(localDate(7));
  const [notes, setNotes] = useState("");
  // Reserva ativa
  const [newDate, setNewDate] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    sapi.listReservations({ vehicleId: vehicle.id, status: "active" })
      .then((l) => { setCurrent(l[0] ?? null); if (l[0]?.expiresAt) setNewDate(l[0].expiresAt.slice(0, 10)); })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar reserva"))
      .finally(() => setLoading(false));
  }, [vehicle.id]);

  useEffect(() => {
    if (customer || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => api.listCustomers({ search: query.trim(), pageSize: 8 }).then((r) => setResults(r.items)).catch(() => setResults([])), 300);
    return () => clearTimeout(t);
  }, [query, customer]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Algo deu errado."); } finally { setBusy(null); }
  };

  const create = () => run("create", async () => {
    let c = customer;
    if (!c) {
      if (query.trim().length < 3) throw new Error("Escolha o cliente ou digite o nome completo para cadastrar.");
      c = await api.createCustomer({ name: query.trim() });
    }
    const value = parseBRL(deposit);
    if (Number.isNaN(value) || value < 0) throw new Error("Valor do sinal inválido. Ex: 1.000,00");
    await sapi.createReservation({ leadId, vehicleId: vehicle.id, customerId: c.id, deposit: value, depositMethod: value > 0 ? method : undefined, expiresAt: expiresAt || undefined, notes: notes.trim() || undefined });
    onChanged();
  });

  const expired = current?.expiresAt ? new Date(current.expiresAt).getTime() < Date.now() : false;
  const dep = Number(current?.deposit ?? 0);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full rounded-xl" style={{ background: "#fff", maxWidth: 480, margin: 16 }}>
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
          <div>
            <h3 className="flex items-center gap-2"><Bookmark size={17} style={{ color: "#185FA5" }} /> {current ? "Reserva" : "Reservar veículo"}</h3>
            <p style={{ fontSize: 12, color: "#6B7280" }}>{vehicle.brand} {vehicle.model} {vehicle.year}{vehicle.plate ? ` · ${vehicle.plate}` : ""} · {brl(Number(vehicle.price))}</p>
          </div>
          <button onClick={onClose} style={{ color: "#6B7280" }}><X size={20} /></button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {loading && <p style={{ fontSize: 13, color: "#9CA3AF" }} className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Carregando...</p>}

          {!loading && current && (
            <>
              <div className="rounded-lg px-4 py-3" style={{ background: expired ? "#FEF2F2" : "#EFF6FF", border: `1px solid ${expired ? "#FECACA" : "#BFDBFE"}` }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: "#0F1923" }}>{current.customer.name}</p>
                <p style={{ fontSize: 12, color: "#374151" }}>
                  {dep > 0 ? `Sinal de ${brl(dep)}${current.depositMethod ? ` (${METHODS.find((m) => m.value === current.depositMethod)?.label ?? current.depositMethod})` : ""}` : "Sem sinal"}
                  {" · reservado em "}{new Date(current.createdAt).toLocaleDateString("pt-BR")}
                </p>
                <p style={{ fontSize: 12, color: expired ? "#991B1B" : "#1E40AF", fontWeight: 500 }}>
                  {current.expiresAt ? `${expired ? "Venceu em" : "Válida até"} ${new Date(current.expiresAt).toLocaleDateString("pt-BR")}` : "Sem data de vencimento"}
                </p>
                {current.notes && <p style={{ fontSize: 12, color: "#6B7280", marginTop: 4, whiteSpace: "pre-wrap" }}>{current.notes}</p>}
              </div>
              <p style={{ fontSize: 12, color: "#6B7280" }}>Para fechar a venda, vá em Vendas → Registrar venda e escolha este veículo: o cliente e o sinal já vêm preenchidos.</p>

              <div>
                <label style={lbl}>Prorrogar até</label>
                <div className="flex gap-2">
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={input} />
                  <button disabled={!newDate || busy !== null} onClick={() => run("extend", async () => {
                    const r = await sapi.updateReservation(current.id, { expiresAt: newDate }); setCurrent({ ...current, ...r }); onChanged();
                  })} className="px-4 rounded-lg shrink-0" style={{ border: "1px solid #185FA5", color: "#185FA5", fontSize: 13, fontWeight: 500 }}>
                    {busy === "extend" ? "Salvando..." : "Salvar data"}
                  </button>
                </div>
              </div>

              {canManage ? (
                <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "#FAFAFA", border: "0.5px solid rgba(0,0,0,0.08)" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#991B1B" }}>Cancelar reserva</p>
                  <input placeholder="Motivo (opcional)" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} style={input} />
                  <div className="flex gap-2 flex-wrap">
                    {dep > 0 ? (
                      <>
                        <button disabled={busy !== null} onClick={() => run("refund", async () => { await sapi.cancelReservation(current.id, { refund: true, reason: cancelReason }); onChanged(); })}
                          className="flex-1 px-3 py-2 rounded-lg" style={{ background: "#DC2626", color: "#fff", fontSize: 12, fontWeight: 500 }}>
                          {busy === "refund" ? "Cancelando..." : `Devolver sinal (${brl(dep)})`}
                        </button>
                        <button disabled={busy !== null} onClick={() => run("keep", async () => { await sapi.cancelReservation(current.id, { refund: false, reason: cancelReason }); onChanged(); })}
                          className="flex-1 px-3 py-2 rounded-lg" style={{ border: "1px solid #DC2626", color: "#DC2626", fontSize: 12, fontWeight: 500 }}>
                          {busy === "keep" ? "Cancelando..." : "Loja fica com o sinal"}
                        </button>
                      </>
                    ) : (
                      <button disabled={busy !== null} onClick={() => run("refund", async () => { await sapi.cancelReservation(current.id, { refund: false, reason: cancelReason }); onChanged(); })}
                        className="px-4 py-2 rounded-lg" style={{ background: "#DC2626", color: "#fff", fontSize: 12, fontWeight: 500 }}>
                        {busy === "refund" ? "Cancelando..." : "Cancelar reserva"}
                      </button>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: "#9CA3AF" }}>O veículo volta a ficar disponível. Devolução do sinal entra como despesa no Financeiro.</p>
                </div>
              ) : <p style={{ fontSize: 12, color: "#9CA3AF" }}>Só o dono ou o administrador pode cancelar a reserva.</p>}
            </>
          )}

          {!loading && !current && (
            <>
              <div>
                <label style={lbl}>Cliente *</label>
                {customer ? (
                  <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ ...input, background: "#F3F4F6" }}>
                    <span>{customer.name}{customer.phone ? ` · ${customer.phone}` : ""}</span>
                    <button onClick={() => { setCustomer(null); setQuery(""); }} style={{ color: "#6B7280" }}><X size={15} /></button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} style={{ position: "absolute", left: 10, top: 11, color: "#9CA3AF" }} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente ou digitar nome novo" style={{ ...input, paddingLeft: 30 }} autoFocus />
                    {results.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1 rounded-lg overflow-hidden" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.12)", boxShadow: "0 8px 24px rgba(0,0,0,0.1)", zIndex: 5 }}>
                        {results.map((c) => (
                          <button key={c.id} onClick={() => setCustomer(c)} className="w-full text-left px-3 py-2 hover:bg-gray-50" style={{ fontSize: 13 }}>
                            {c.name}<span style={{ color: "#9CA3AF", fontSize: 11 }}>{c.phone ? ` · ${c.phone}` : ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {query.trim().length >= 3 && results.length === 0 && <p style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>Não encontrado: será cadastrado como cliente novo.</p>}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label style={lbl}>Valor do sinal</label><input value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0,00" inputMode="decimal" style={input} /></div>
                <div><label style={lbl}>Pago em</label>
                  <select value={method} onChange={(e) => setMethod(e.target.value)} style={input} disabled={!(parseBRL(deposit) > 0)}>
                    {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>Reservado até</label><input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={input} /></div>
              </div>
              <div><label style={lbl}>Observação</label><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: aguardando aprovação do financiamento" style={{ ...input, resize: "vertical" }} /></div>
              <p style={{ fontSize: 12, color: "#6B7280" }}>O veículo fica como "Reservado" e o sinal entra no Financeiro. Na venda, o sinal já entra como parte do pagamento.</p>
            </>
          )}

          {error && <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}
        </div>

        {!loading && !current && (
          <div className="flex justify-end gap-3 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
            <button onClick={onClose} className="px-5 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13 }}>Cancelar</button>
            <button onClick={create} disabled={busy === "create"} className="px-5 py-2 rounded-lg" style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: busy ? 0.7 : 1 }}>
              {busy === "create" ? "Reservando..." : "Confirmar reserva"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
