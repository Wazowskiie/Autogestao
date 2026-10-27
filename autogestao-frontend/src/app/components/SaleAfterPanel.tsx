// Depois da venda: resultado real, despesas, financiamento, comissão, pós-venda, garantia e cancelamento
import { useState } from "react";
import { AlertTriangle, Ban, Check, Loader2, Plus, Trash2 } from "lucide-react";
import * as sapi from "../../lib/sales-api";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n = (v: unknown) => Number(v ?? 0) || 0;
const DAY = 24 * 60 * 60 * 1000;

function parseBRL(value: string) {
  const v = value.trim().replace(/[R$\s]/g, "");
  if (!v) return 0;
  const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : NaN;
}
function localToday() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
// Datas guardadas ao meio-dia UTC: mostra o dia certo
const dateBR = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");
const moneyInput = (v: unknown) => (n(v) ? n(v).toFixed(2).replace(".", ",") : "");

const label = { fontSize: 11, color: "#9CA3AF", textTransform: "uppercase" as const, letterSpacing: 0.4, marginBottom: 8, fontWeight: 600 };
const box = { border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 10, overflow: "hidden" as const };
const input = { border: "0.5px solid rgba(0,0,0,0.14)", borderRadius: 8, padding: "7px 10px", fontSize: 13, background: "#fff", outline: "none", width: "100%" };
const smallBtn = (primary = false) => ({
  fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 8, whiteSpace: "nowrap" as const,
  background: primary ? "#185FA5" : "#fff", color: primary ? "#fff" : "#185FA5", border: primary ? "none" : "1px solid #185FA5",
});

function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Algo deu errado."); } finally { setBusy(null); }
  };
  return { busy, error, run };
}

export function SaleAfterPanel({ sale, canEdit, onChange }: { sale: sapi.SaleFull; canEdit: boolean; onChange: (s: sapi.SaleFull) => void }) {
  const canceled = sale.status === "canceled";
  const payments = sale.payments ?? [];
  const expenses = sale.expenses ?? [];
  const fees = payments.reduce((t, p) => t + n(p.feeAmount), 0);
  const returns = payments.reduce((t, p) => t + n(p.returnAmount), 0);
  const expTotal = expenses.reduce((t, e) => t + n(e.amount), 0);
  const commission = n(sale.commissionAmount);
  const profit = n(sale.profit);

  const rows: { label: string; value: number; sign?: "-" | "+"; strong?: boolean }[] = [
    { label: "Preço de venda", value: n(sale.price) },
    { label: "Custo do veículo", value: n(sale.cost), sign: "-" },
    ...(fees ? [{ label: "Taxas de cartão", value: fees, sign: "-" as const }] : []),
    ...(expTotal ? [{ label: "Despesas da venda", value: expTotal, sign: "-" as const }] : []),
    ...(commission ? [{ label: "Comissão do vendedor", value: commission, sign: "-" as const }] : []),
    ...(returns ? [{ label: "Retorno do financiamento", value: returns, sign: "+" as const }] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      {canceled && (
        <div className="rounded-lg px-4 py-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <p className="flex items-center gap-2" style={{ fontSize: 13, fontWeight: 600, color: "#991B1B" }}>
            <Ban size={15} /> Venda cancelada em {sale.canceledAt ? new Date(sale.canceledAt).toLocaleDateString("pt-BR") : "—"}
          </p>
          {sale.cancelReason && <p style={{ fontSize: 13, color: "#7F1D1D", marginTop: 4 }}>Motivo: {sale.cancelReason}</p>}
          {n(sale.refundAmount) > 0 && <p style={{ fontSize: 13, color: "#7F1D1D", marginTop: 2 }}>Devolvido ao cliente: {brl(n(sale.refundAmount))}</p>}
        </div>
      )}

      {/* Resultado real */}
      <div>
        <p style={label}>Resultado da venda</p>
        <div style={box}>
          {rows.map((r, i) => (
            <div key={r.label} className="flex items-center justify-between px-4 py-2" style={{ background: i % 2 ? "#FAFBFC" : "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.05)" }}>
              <span style={{ fontSize: 13, color: "#6B7280" }}>{r.sign === "-" ? "(−) " : r.sign === "+" ? "(+) " : ""}{r.label}</span>
              <span style={{ fontSize: 13, color: r.sign === "-" ? "#B91C1C" : r.sign === "+" ? "#15803D" : "#0F1923", fontWeight: 500 }}>{brl(r.value)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2.5" style={{ background: profit >= 0 ? "#F0FDF4" : "#FEF2F2" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#0F1923" }}>Lucro real · margem {n(sale.margin).toFixed(1)}%</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: profit >= 0 ? "#15803D" : "#DC2626" }}>{brl(profit)}</span>
          </div>
        </div>
      </div>

      <ExpensesSection sale={sale} canEdit={canEdit && !canceled} onChange={onChange} />
      {payments.filter((p) => p.method === "financing" || p.method === "consortium").map((p) => (
        <FinancingSection key={p.id} sale={sale} payment={p} canEdit={canEdit && !canceled} onChange={onChange} />
      ))}
      <CommissionSection sale={sale} canEdit={canEdit && !canceled} onChange={onChange} />
      {!canceled && <ChecklistSection sale={sale} onChange={onChange} />}
      <WarrantySection sale={sale} canEdit={canEdit && !canceled} onChange={onChange} />
    </div>
  );
}

// ---------- Despesas ----------
function ExpensesSection({ sale, canEdit, onChange }: { sale: sapi.SaleFull; canEdit: boolean; onChange: (s: sapi.SaleFull) => void }) {
  const expenses = sale.expenses ?? [];
  const { busy, error, run } = useBusy();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localToday());
  const [paid, setPaid] = useState(true);
  if (!canEdit && !expenses.length) return null;

  const add = () => run("add", async () => {
    const value = parseBRL(amount);
    if (!desc.trim()) throw new Error("Descreva a despesa.");
    if (!value || Number.isNaN(value) || value <= 0) throw new Error("Valor inválido. Ex: 250,00");
    onChange(await sapi.addSaleExpense(sale.id, { description: desc.trim(), amount: value, date, paid }));
    setDesc(""); setAmount(""); setOpen(false);
  });

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <p style={{ ...label, marginBottom: 0 }}>Despesas da venda</p>
        {canEdit && !open && <button onClick={() => setOpen(true)} style={{ fontSize: 12, color: "#185FA5", fontWeight: 500 }} className="flex items-center gap-1"><Plus size={13} /> Adicionar</button>}
      </div>
      {expenses.length === 0 && !open && <p style={{ fontSize: 12, color: "#9CA3AF" }}>Transferência, vistoria, revisão, brinde, combustível... tudo o que a loja gastou com esta venda.</p>}
      {expenses.length > 0 && (
        <div style={box}>
          {expenses.map((e, i) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2" style={{ background: i % 2 ? "#FAFBFC" : "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.05)" }}>
              <div className="flex-1" style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, color: "#374151" }}>{e.description}</p>
                <p style={{ fontSize: 11, color: "#9CA3AF" }}>{dateBR(e.date)}</p>
              </div>
              <button disabled={!canEdit || busy !== null} onClick={() => run(e.id, async () => onChange(await sapi.updateSaleExpense(sale.id, e.id, { paid: !e.paid })))}
                className="px-2 py-0.5 rounded-full" title={canEdit ? "Clique para mudar" : undefined}
                style={{ fontSize: 10, fontWeight: 600, background: e.paid ? "#EAF3DE" : "#FEF3C7", color: e.paid ? "#27500A" : "#92400E" }}>
                {e.paid ? "Paga" : "A pagar"}
              </button>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0F1923", minWidth: 90, textAlign: "right" }}>{brl(n(e.amount))}</span>
              {canEdit && (
                <button title="Remover" disabled={busy !== null} onClick={() => run(e.id, async () => onChange(await sapi.removeSaleExpense(sale.id, e.id)))} style={{ color: "#DC2626" }}>
                  {busy === e.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {open && (
        <div className="rounded-lg p-3 mt-2 flex flex-col gap-2" style={{ background: "#F5F9FD", border: "1px dashed #185FA5" }}>
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 120px 140px" }}>
            <input placeholder="Ex: Transferência, vistoria..." value={desc} onChange={(e) => setDesc(e.target.value)} style={input} autoFocus />
            <input placeholder="0,00" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={input} />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={input} />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2" style={{ fontSize: 12, color: "#374151" }}>
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Já foi paga
            </label>
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} style={{ ...smallBtn(), border: "0.5px solid rgba(0,0,0,0.12)", color: "#374151" }}>Cancelar</button>
              <button onClick={add} disabled={busy === "add"} style={smallBtn(true)}>{busy === "add" ? "Salvando..." : "Adicionar despesa"}</button>
            </div>
          </div>
        </div>
      )}
      {error && <p style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{error}</p>}
    </div>
  );
}

// ---------- Financiamento ----------
function FinancingSection({ sale, payment, canEdit, onChange }: { sale: sapi.SaleFull; payment: sapi.SalePaymentItem; canEdit: boolean; onChange: (s: sapi.SaleFull) => void }) {
  const { busy, error, run } = useBusy();
  const [bank, setBank] = useState(payment.bank ?? "");
  const [status, setStatus] = useState<sapi.FinancingStatus>(payment.financingStatus ?? "analysis");
  const [receivedAt, setReceivedAt] = useState(payment.receivedAt ? payment.receivedAt.slice(0, 10) : localToday());
  const [ret, setRet] = useState(moneyInput(payment.returnAmount));
  const [saved, setSaved] = useState(false);
  const current = payment.financingStatus ?? "analysis";
  const colors: Record<sapi.FinancingStatus, [string, string]> = {
    analysis: ["#FEF3C7", "#92400E"], approved: ["#DBEAFE", "#1E40AF"], rejected: ["#FEE2E2", "#991B1B"], paid: ["#DCFCE7", "#166534"],
  };
  const title = payment.method === "consortium" ? "Consórcio" : "Financiamento";

  const save = () => run("save", async () => {
    const r = parseBRL(ret);
    if (Number.isNaN(r) || r < 0) throw new Error("Retorno inválido. Ex: 800,00");
    onChange(await sapi.updateFinancing(sale.id, payment.id, { bank: bank.trim(), status, receivedAt: status === "paid" ? receivedAt : undefined, returnAmount: r }));
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  });

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <p style={{ ...label, marginBottom: 0 }}>{title} · {brl(n(payment.amount))}</p>
        <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: colors[current][0], color: colors[current][1] }}>{sapi.FINANCING_STATUS_LABELS[current]}</span>
      </div>
      {current === "rejected" && (
        <p className="flex items-center gap-1.5 mb-2" style={{ fontSize: 12, color: "#991B1B" }}>
          <AlertTriangle size={13} /> Ficha recusada: o valor não vai entrar. Cancele a venda ou combine outra forma de pagamento.
        </p>
      )}
      {canEdit ? (
        <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "#F9FAFB", border: "0.5px solid rgba(0,0,0,0.06)" }}>
          <div className="grid grid-cols-2 gap-2">
            <label style={{ fontSize: 12, color: "#6B7280" }}>Banco / financeira<input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Ex: Banco Pan" style={{ ...input, marginTop: 4 }} /></label>
            <label style={{ fontSize: 12, color: "#6B7280" }}>Situação da ficha
              <select value={status} onChange={(e) => setStatus(e.target.value as sapi.FinancingStatus)} style={{ ...input, marginTop: 4 }}>
                {(Object.keys(sapi.FINANCING_STATUS_LABELS) as sapi.FinancingStatus[]).map((k) => <option key={k} value={k}>{sapi.FINANCING_STATUS_LABELS[k]}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "#6B7280" }}>Retorno (o banco paga à loja)<input value={ret} onChange={(e) => setRet(e.target.value)} placeholder="0,00" inputMode="decimal" style={{ ...input, marginTop: 4 }} /></label>
            {status === "paid" && (
              <label style={{ fontSize: 12, color: "#6B7280" }}>Data do depósito<input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} style={{ ...input, marginTop: 4 }} /></label>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {saved && <span className="flex items-center gap-1" style={{ fontSize: 12, color: "#15803D" }}><Check size={13} /> Salvo</span>}
            <button onClick={save} disabled={busy === "save"} style={smallBtn(true)}>{busy === "save" ? "Salvando..." : "Salvar financiamento"}</button>
          </div>
          <p style={{ fontSize: 11, color: "#9CA3AF" }}>Quando marcar "Paga pelo banco", o valor e o retorno entram como recebidos no Financeiro.</p>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "#374151" }}>{payment.bank || "Banco não informado"}{n(payment.returnAmount) ? ` · retorno ${brl(n(payment.returnAmount))}` : ""}</p>
      )}
      {error && <p style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{error}</p>}
    </div>
  );
}

// ---------- Comissão ----------
function CommissionSection({ sale, canEdit, onChange }: { sale: sapi.SaleFull; canEdit: boolean; onChange: (s: sapi.SaleFull) => void }) {
  const { busy, error, run } = useBusy();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(moneyInput(sale.commissionAmount));
  const amount = n(sale.commissionAmount);
  const paid = !!sale.commissionPaidAt;
  const rate = sale.commissionRate != null ? n(sale.commissionRate) : null;
  if (!canEdit && !amount) return null;

  return (
    <div>
      <p style={label}>Comissão do vendedor</p>
      <div className="flex items-center gap-3 rounded-lg px-4 py-3" style={{ background: "#F9FAFB", border: "0.5px solid rgba(0,0,0,0.06)" }}>
        <div className="flex-1">
          <p style={{ fontSize: 13, fontWeight: 500, color: "#0F1923" }}>{sale.seller.name}</p>
          <p style={{ fontSize: 12, color: "#6B7280" }}>
            {amount ? `${brl(amount)}${rate ? ` (${rate.toLocaleString("pt-BR")}% do preço)` : ""}` : "Sem comissão nesta venda"}
            {paid && sale.commissionPaidAt ? ` · paga em ${new Date(sale.commissionPaidAt).toLocaleDateString("pt-BR")}` : ""}
          </p>
        </div>
        {amount > 0 && (
          <button disabled={!canEdit || busy !== null} onClick={() => run("paid", async () => onChange(await sapi.updateCommission(sale.id, { paid: !paid })))}
            className="px-2.5 py-1 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: paid ? "#EAF3DE" : "#FEF3C7", color: paid ? "#27500A" : "#92400E" }}>
            {busy === "paid" ? "..." : paid ? "Paga" : canEdit ? "A pagar · marcar paga" : "A pagar"}
          </button>
        )}
        {canEdit && !editing && <button onClick={() => { setValue(moneyInput(sale.commissionAmount)); setEditing(true); }} style={{ fontSize: 12, color: "#185FA5", fontWeight: 500 }}>Alterar</button>}
      </div>
      {editing && (
        <div className="flex items-center gap-2 mt-2">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" inputMode="decimal" style={{ ...input, maxWidth: 160 }} autoFocus />
          <button style={{ ...smallBtn(), border: "0.5px solid rgba(0,0,0,0.12)", color: "#374151" }} onClick={() => setEditing(false)}>Cancelar</button>
          <button style={smallBtn(true)} disabled={busy === "amount"} onClick={() => run("amount", async () => {
            const v = parseBRL(value);
            if (Number.isNaN(v) || v < 0) throw new Error("Valor inválido.");
            onChange(await sapi.updateCommission(sale.id, { amount: v }));
            setEditing(false);
          })}>{busy === "amount" ? "Salvando..." : "Salvar"}</button>
        </div>
      )}
      {error && <p style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{error}</p>}
    </div>
  );
}

// ---------- Pós-venda ----------
function ChecklistSection({ sale, onChange }: { sale: sapi.SaleFull; onChange: (s: sapi.SaleFull) => void }) {
  const { busy, error, run } = useBusy();
  const checklist = sale.deliveryChecklist ?? {};
  const done = sapi.CHECKLIST_ITEMS.filter((i) => checklist[i.key]?.done).length;
  const transferDone = !!checklist.transfer?.done;
  const deadline = new Date(new Date(sale.soldAt).getTime() + 30 * DAY);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / DAY);

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <p style={{ ...label, marginBottom: 0 }}>Pós-venda · {done}/{sapi.CHECKLIST_ITEMS.length}</p>
        {!transferDone && (
          <span className="px-2 py-0.5 rounded-full" style={{
            fontSize: 11, fontWeight: 600,
            background: daysLeft < 0 ? "#FEE2E2" : daysLeft <= 7 ? "#FEF3C7" : "#F3F4F6",
            color: daysLeft < 0 ? "#991B1B" : daysLeft <= 7 ? "#92400E" : "#374151",
          }}>
            {daysLeft < 0 ? `Transferência atrasada ${-daysLeft} dia${daysLeft === -1 ? "" : "s"}` : `Transferir até ${deadline.toLocaleDateString("pt-BR")} (${daysLeft} dias)`}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {sapi.CHECKLIST_ITEMS.map((item) => {
          const c = checklist[item.key];
          return (
            <button key={item.key} disabled={busy !== null}
              onClick={() => run(item.key, async () => onChange(await sapi.updateChecklist(sale.id, { key: item.key, done: !c?.done })))}
              className="flex items-start gap-2 rounded-lg px-3 py-2 text-left"
              style={{ border: c?.done ? "1px solid #86EFAC" : "0.5px solid rgba(0,0,0,0.1)", background: c?.done ? "#F0FDF4" : "#fff" }}>
              <span className="flex items-center justify-center shrink-0" style={{ width: 18, height: 18, borderRadius: 5, marginTop: 1, background: c?.done ? "#16A34A" : "#fff", border: c?.done ? "none" : "1.5px solid #CBD5E1" }}>
                {busy === item.key ? <Loader2 size={11} className="animate-spin" /> : c?.done ? <Check size={12} color="#fff" /> : null}
              </span>
              <span>
                <span style={{ fontSize: 13, color: "#0F1923", display: "block" }}>{item.label}</span>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>{c?.done && c.at ? `feito em ${new Date(c.at).toLocaleDateString("pt-BR")}` : item.help}</span>
              </span>
            </button>
          );
        })}
      </div>
      {error && <p style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{error}</p>}
    </div>
  );
}

// ---------- Garantia ----------
function WarrantySection({ sale, canEdit, onChange }: { sale: sapi.SaleFull; canEdit: boolean; onChange: (s: sapi.SaleFull) => void }) {
  const { busy, error, run } = useBusy();
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState(String(sale.warrantyDays ?? 90));
  const [coverage, setCoverage] = useState(sale.warrantyCoverage ?? "Motor e câmbio");
  const has = !!sale.warrantyDays;
  const until = has ? new Date(new Date(sale.soldAt).getTime() + sale.warrantyDays! * DAY) : null;
  const active = until ? until.getTime() >= Date.now() : false;
  if (!canEdit && !has) return null;

  return (
    <div>
      <p style={label}>Garantia</p>
      {!editing ? (
        <div className="flex items-center gap-3 rounded-lg px-4 py-3" style={{ background: "#F9FAFB", border: "0.5px solid rgba(0,0,0,0.06)" }}>
          <div className="flex-1">
            {has ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#0F1923" }}>{sale.warrantyDays} dias · {sale.warrantyCoverage || "Garantia da loja"}</p>
                <p style={{ fontSize: 12, color: active ? "#15803D" : "#9CA3AF" }}>{active ? "Válida" : "Encerrada"} até {until!.toLocaleDateString("pt-BR")}</p>
              </>
            ) : <p style={{ fontSize: 13, color: "#6B7280" }}>Só a garantia legal (Código de Defesa do Consumidor).</p>}
          </div>
          {canEdit && <button onClick={() => setEditing(true)} style={{ fontSize: 12, color: "#185FA5", fontWeight: 500 }}>{has ? "Alterar" : "Definir garantia"}</button>}
        </div>
      ) : (
        <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: "#F5F9FD", border: "1px dashed #185FA5" }}>
          <div className="grid gap-2" style={{ gridTemplateColumns: "110px 1fr" }}>
            <label style={{ fontSize: 12, color: "#6B7280" }}>Dias<input value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ ...input, marginTop: 4 }} /></label>
            <label style={{ fontSize: 12, color: "#6B7280" }}>O que cobre<input value={coverage} onChange={(e) => setCoverage(e.target.value)} placeholder="Ex: Motor e câmbio" style={{ ...input, marginTop: 4 }} /></label>
          </div>
          <div className="flex justify-end gap-2">
            <button style={{ ...smallBtn(), border: "0.5px solid rgba(0,0,0,0.12)", color: "#374151" }} onClick={() => setEditing(false)}>Cancelar</button>
            <button style={smallBtn(true)} disabled={busy === "w"} onClick={() => run("w", async () => {
              onChange(await sapi.updateWarranty(sale.id, { days: Number(days) || 0, coverage }));
              setEditing(false);
            })}>{busy === "w" ? "Salvando..." : "Salvar garantia"}</button>
          </div>
        </div>
      )}
      {error && <p style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{error}</p>}
    </div>
  );
}

// ---------- Cancelamento (distrato) ----------
export function CancelSaleModal({ sale, onClose, onDone }: { sale: sapi.SaleFull; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState("");
  const { busy, error, run } = useBusy();
  const trades = sale.tradeIns ?? [];

  const confirm = () => run("c", async () => {
    if (reason.trim().length < 3) throw new Error("Informe o motivo do cancelamento.");
    const r = parseBRL(refund);
    if (Number.isNaN(r) || r < 0) throw new Error("Valor devolvido inválido. Ex: 5.000,00");
    const res = await sapi.cancelSale(sale.id, { reason: reason.trim(), refundAmount: r });
    const parts = ["Venda cancelada. O veículo voltou para o estoque."];
    if (res.returnedTradeIns.length) parts.push(`Saiu do estoque (voltou para o cliente): ${res.returnedTradeIns.join(", ")}.`);
    if (res.keptTradeIns.length) parts.push(`Já vendido, ficou como está: ${res.keptTradeIns.join(", ")}.`);
    onDone(parts.join(" "));
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)", zIndex: 60 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rounded-xl p-6 w-full" style={{ background: "#fff", maxWidth: 460, margin: 16 }}>
        <h3 style={{ marginBottom: 6 }}>Cancelar venda {sale.contractNumber ?? ""}?</h3>
        <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>A venda continua no histórico, marcada como cancelada. Ao confirmar:</p>
        <ul style={{ fontSize: 13, color: "#374151", marginBottom: 14, paddingLeft: 18, listStyle: "disc", display: "flex", flexDirection: "column", gap: 3 }}>
          <li>{sale.vehicle.brand} {sale.vehicle.model} volta para o estoque como disponível;</li>
          <li>promissórias e valores que ainda não foram recebidos saem do Financeiro;</li>
          {trades.length > 0 && <li>veículo(s) da troca que ainda estão no estoque voltam para o cliente;</li>}
          <li>o valor devolvido ao cliente entra como despesa.</li>
        </ul>
        <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 10 }}>Motivo *
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: cliente desistiu, financiamento recusado..." style={{ ...input, marginTop: 4, resize: "vertical" }} />
        </label>
        <label style={{ fontSize: 13, color: "#374151", display: "block" }}>Valor devolvido ao cliente
          <input value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="0,00" inputMode="decimal" style={{ ...input, marginTop: 4 }} />
        </label>
        {error && <p style={{ fontSize: 12, color: "#DC2626", marginTop: 8 }}>{error}</p>}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-5 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13 }}>Voltar</button>
          <button onClick={confirm} disabled={busy === "c"} className="px-5 py-2 rounded-lg" style={{ background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 500, opacity: busy ? 0.7 : 1 }}>
            {busy ? "Cancelando..." : "Cancelar venda"}
          </button>
        </div>
      </div>
    </div>
  );
}
