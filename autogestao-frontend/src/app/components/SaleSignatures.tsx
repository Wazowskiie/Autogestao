// Assinatura eletrônica: janela de envio e lista de documentos enviados
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, Plus, Trash2, XCircle } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { salePrintPdf, type SaleDocuments } from "../../lib/sale-documents";
import {
  cancelSignature, refreshSignature, resendSignature, sendForSignature, signatureDownload,
  type SaleSignature, type SignerChannel, type SignerInput, type SignerRole,
} from "../../lib/esign-api";

const ROLE_LABEL: Record<SignerRole, string> = { buyer: "Comprador", store: "Loja", witness: "Testemunha", other: "Outro" };
const STATUS: Record<SaleSignature["status"], { text: string; bg: string; fg: string }> = {
  sending: { text: "Enviando", bg: "#EFF6FF", fg: "#1E40AF" },
  waiting: { text: "Aguardando assinaturas", bg: "#FEF3C7", fg: "#92400E" },
  signed: { text: "Assinado", bg: "#DCFCE7", fg: "#166534" },
  rejected: { text: "Recusado", bg: "#FEE2E2", fg: "#991B1B" },
  canceled: { text: "Cancelado", bg: "#F3F4F6", fg: "#6B7280" },
  error: { text: "Erro no envio", bg: "#FEE2E2", fg: "#991B1B" },
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const input: React.CSSProperties = { border: "1px solid #E5E7EB", borderRadius: 8, padding: "7px 10px", fontSize: 13, width: "100%", background: "#fff" };
const label: React.CSSProperties = { fontSize: 11, color: "#6B7280", display: "block", marginBottom: 3 };

interface Row extends SignerInput { key: number }
let rowKey = 1;

export function SignModal({ saleId, doc, printId, title, onClose, onSent }: {
  saleId: string; doc: SaleDocuments; printId: string; title: string; onClose: () => void; onSent: () => void;
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>(() => [
    { key: rowKey++, role: "buyer", name: doc.customer.name, email: doc.customer.email ?? "", phone: doc.customer.phone ?? "", channel: doc.customer.phone ? "whatsapp" : "email" },
    { key: rowKey++, role: "store", name: user?.name ?? doc.dealership.name, email: user?.email ?? "", phone: "", channel: "email" },
  ]);
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<"form" | "pdf" | "upload">("form");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && step === "form" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  const set = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const send = async () => {
    setError(null);
    for (const r of rows) {
      if (r.name.trim().length < 2) return setError("Preencha o nome de todos que vão assinar.");
      if (r.channel === "email" && !/^\S+@\S+\.\S+$/.test(r.email.trim())) return setError(`Informe um e-mail válido para ${r.name || ROLE_LABEL[r.role]}.`);
      if (r.channel === "whatsapp" && (r.phone ?? "").replace(/\D/g, "").length < 10) return setError(`Informe o WhatsApp de ${r.name} com DDD.`);
    }
    try {
      setStep("pdf");
      const pdf = await salePrintPdf(printId, doc);
      setStep("upload");
      await sendForSignature(saleId, {
        printId, title, message: message.trim() || undefined,
        signers: rows.map(({ key: _k, ...r }) => ({ ...r, name: r.name.trim(), email: r.channel === "email" ? r.email.trim() : "", phone: r.phone?.trim() || undefined })),
        pdf,
      });
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar para assinatura.");
      setStep("form");
    }
  };

  const busy = step !== "form";
  return (
    <div onClick={() => !busy && onClose()} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 680, maxHeight: "92vh", overflowY: "auto", padding: 22, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, color: "#111827" }}>Enviar para assinatura eletrônica</h3>
        <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{title} · contrato nº {doc.contractNumber}</p>
        <p style={{ fontSize: 12, color: "#6B7280", marginTop: 8 }}>
          Cada pessoa recebe um link para ler e assinar pelo celular ou computador. Quando todos assinarem, o documento assinado fica disponível aqui na venda.
        </p>

        <div className="flex flex-col gap-3" style={{ marginTop: 14 }}>
          {rows.map((r) => (
            <div key={r.key} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 12 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <select value={r.role} onChange={(e) => set(r.key, { role: e.target.value as SignerRole })} style={{ ...input, width: "auto", fontWeight: 600 }} disabled={busy}>
                  {(Object.keys(ROLE_LABEL) as SignerRole[]).map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
                </select>
                {rows.length > 1 && (
                  <button onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} disabled={busy} title="Tirar" style={{ color: "#DC2626", padding: 4 }}><Trash2 size={15} /></button>
                )}
              </div>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div><span style={label}>Nome</span><input style={input} value={r.name} disabled={busy} onChange={(e) => set(r.key, { name: e.target.value })} /></div>
                <div><span style={label}>E-mail{r.channel === "whatsapp" ? " (opcional)" : ""}</span><input style={input} value={r.email} disabled={busy} type="email" onChange={(e) => set(r.key, { email: e.target.value })} /></div>
                <div>
                  <span style={label}>Receber o link por</span>
                  <select style={input} value={r.channel} disabled={busy} onChange={(e) => set(r.key, { channel: e.target.value as SignerChannel })}>
                    <option value="email">E-mail</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>
                <div><span style={label}>WhatsApp (com DDD)</span><input style={input} value={r.phone ?? ""} disabled={busy} placeholder="(85) 99999-9999" onChange={(e) => set(r.key, { phone: e.target.value })} /></div>
              </div>
            </div>
          ))}
          {rows.length < 6 && (
            <button onClick={() => setRows((rs) => [...rs, { key: rowKey++, role: "witness", name: "", email: "", phone: "", channel: "email" }])} disabled={busy}
              className="flex items-center gap-1" style={{ color: "#185FA5", fontSize: 13, fontWeight: 600, alignSelf: "flex-start" }}>
              <Plus size={14} /> Adicionar testemunha ou outra pessoa
            </button>
          )}
          <div>
            <span style={label}>Mensagem (opcional)</span>
            <textarea style={{ ...input, minHeight: 60 }} value={message} disabled={busy} maxLength={500}
              placeholder={`${doc.dealership.name} enviou "${title}" para você assinar.`} onChange={(e) => setMessage(e.target.value)} />
          </div>
        </div>

        {error && <p style={{ fontSize: 13, color: "#DC2626", marginTop: 10 }}>{error}</p>}
        <div className="flex items-center justify-end gap-2" style={{ marginTop: 16 }}>
          <button onClick={onClose} disabled={busy} style={{ padding: "8px 16px", borderRadius: 8, background: "#F3F4F6", fontSize: 14 }}>Cancelar</button>
          <button onClick={send} disabled={busy} className="flex items-center gap-2"
            style={{ padding: "8px 16px", borderRadius: 8, background: "#185FA5", color: "#fff", fontSize: 14, fontWeight: 600, opacity: busy ? 0.75 : 1 }}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {step === "pdf" ? "Gerando o PDF..." : step === "upload" ? "Enviando para a Autentique..." : "Enviar para assinar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SignatureList({ signatures, onChanged }: { signatures: SaleSignature[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { user } = useAuth();
  const canCancel = user?.role === "owner" || user?.role === "admin";

  if (!signatures.length) return null;

  const act = async (id: string, kind: "refresh" | "download" | "resend" | "cancel") => {
    setBusy(`${id}:${kind}`); setMsg(null);
    // aba aberta antes da chamada para o navegador não bloquear
    const win = kind === "download" ? window.open("", "_blank") : null;
    try {
      if (kind === "refresh") await refreshSignature(id);
      if (kind === "resend") { const r = await resendSignature(id); setMsg(r.resent ? `Link reenviado para ${r.resent} pessoa(s).` : "Todos já assinaram."); }
      if (kind === "cancel") { if (!confirm("Cancelar este envio? Quem ainda não assinou não vai conseguir mais assinar.")) return; await cancelSignature(id); }
      if (kind === "download") { const r = await signatureDownload(id); if (win) win.location.href = r.url; else window.open(r.url, "_blank"); }
      onChanged();
    } catch (e) {
      win?.close();
      setMsg(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(null);
    }
  };

  const small: React.CSSProperties = { fontSize: 12, padding: "4px 9px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", color: "#374151" };
  return (
    <div style={{ marginTop: 18 }}>
      <h4 style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 6 }}>Assinaturas eletrônicas</h4>
      {msg && <p style={{ fontSize: 12, color: "#1E40AF", marginBottom: 6 }}>{msg}</p>}
      <div className="flex flex-col gap-2">
        {signatures.map((s) => {
          const st = STATUS[s.status];
          const b = (k: string) => busy === `${s.id}:${k}`;
          return (
            <div key={s.id} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: "10px 12px" }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontWeight: 600, fontSize: 14, color: "#111827", flex: 1, minWidth: 180 }}>{s.title}</span>
                <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: st.bg, color: st.fg, fontWeight: 600 }}>{st.text}</span>
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                Enviado em {fmt(s.sentAt ?? s.createdAt)}{s.completedAt ? ` · concluído em ${fmt(s.completedAt)}` : ""}{s.canceledAt ? ` · cancelado em ${fmt(s.canceledAt)}` : ""}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ marginTop: 6 }}>
                {s.signers.map((p, i) => (
                  <span key={i} className="flex items-center gap-1" style={{ fontSize: 12, color: p.signed ? "#166534" : p.rejected ? "#991B1B" : "#6B7280" }}>
                    {p.signed ? <CheckCircle2 size={13} /> : p.rejected || s.status === "canceled" ? <XCircle size={13} /> : <Clock size={13} />}
                    {p.name} ({ROLE_LABEL[p.role]}){p.signed && p.signedAt ? ` · ${fmt(p.signedAt)}` : ""}
                  </span>
                ))}
              </div>
              {s.status === "error" && s.lastError && <p style={{ fontSize: 12, color: "#991B1B", marginTop: 4 }}>{s.lastError}</p>}
              <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
                {s.status === "signed" && <button style={{ ...small, color: "#fff", background: "#166534", borderColor: "#166534" }} onClick={() => act(s.id, "download")} disabled={b("download")}>{b("download") ? "Abrindo..." : "Baixar documento assinado"}</button>}
                {s.status === "waiting" && <>
                  <button style={small} onClick={() => act(s.id, "refresh")} disabled={b("refresh")}>{b("refresh") ? "Atualizando..." : "Atualizar"}</button>
                  <button style={small} onClick={() => act(s.id, "resend")} disabled={b("resend")}>{b("resend") ? "Reenviando..." : "Reenviar link"}</button>
                  <button style={small} onClick={() => act(s.id, "download")} disabled={b("download")}>Ver documento</button>
                  {canCancel && <button style={{ ...small, color: "#DC2626" }} onClick={() => act(s.id, "cancel")} disabled={b("cancel")}>Cancelar envio</button>}
                </>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
