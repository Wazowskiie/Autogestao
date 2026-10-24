import { useCallback, useEffect, useRef, useState } from "react";
import {
  Store, Percent, FileText, Plug, UserCircle, Users, Upload, Trash2, Plus, Check, X, Pencil,
  CheckCircle2, AlertCircle, Eye, EyeOff, Image as ImageIcon, Lock,
} from "lucide-react";
import * as s from "../../lib/settings-api";
import { useAuth } from "../../lib/auth-context";
import { usePlan } from "../../lib/plan-context";

type Tab = "loja" | "usuarios" | "juros" | "fiscal" | "integracoes" | "conta";

const BLUE = "#185FA5";
const card: React.CSSProperties = { background: "#fff", border: "1px solid var(--border, rgba(0,0,0,0.08))", borderRadius: 12, padding: 20 };
const inputStyle: React.CSSProperties = { width: "100%", border: "0.5px solid rgba(0,0,0,0.15)", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "#4B5563", fontWeight: 500, display: "block", marginBottom: 4 };
const primaryBtn: React.CSSProperties = { background: BLUE, color: "#fff", fontSize: 13, fontWeight: 500, borderRadius: 8, padding: "8px 16px" };
const ghostBtn: React.CSSProperties = { border: "0.5px solid rgba(0,0,0,0.15)", fontSize: 13, borderRadius: 8, padding: "7px 14px", background: "#fff" };

const msg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");
const onlyDigits = (v: string) => v.replace(/\D/g, "");
const truncPct = (v: number) => Math.floor(v * 100) / 100;
const pct = (v: number) => truncPct(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function maskCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  return d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
}
function maskPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
}
function maskCep(v: string) {
  return onlyDigits(v).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

// ---------- Pequenos componentes ----------
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3, display: "block" }}>{hint}</span>}
    </label>
  );
}

function Notice({ kind, text, onClose }: { kind: "ok" | "error"; text: string; onClose?: () => void }) {
  const ok = kind === "ok";
  return (
    <div className="flex items-center gap-2" style={{
      background: ok ? "#ECFDF5" : "#FEF2F2", color: ok ? "#047857" : "#B91C1C",
      border: `1px solid ${ok ? "#A7F3D0" : "#FECACA"}`, borderRadius: 8, padding: "8px 12px", fontSize: 13,
    }}>
      {ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      <span style={{ flex: 1 }}>{text}</span>
      {onClose && <button onClick={onClose} aria-label="Fechar"><X size={14} /></button>}
    </div>
  );
}

function useNotice() {
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = (kind: "ok" | "error", text: string) => {
    setNotice({ kind, text });
    window.clearTimeout(timer.current);
    if (kind === "ok") timer.current = window.setTimeout(() => setNotice(null), 3500);
  };
  const el = notice ? <Notice kind={notice.kind} text={notice.text} onClose={() => setNotice(null)} /> : null;
  return { show, el };
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{subtitle}</p>}
    </div>
  );
}

// =====================================================================
export function Settings({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const auth = useAuth();
  const plan = usePlan();
  const [data, setData] = useState<s.SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const d = await s.getSettings();
      setData(d);
      setTab((t) => t ?? (d.canEdit ? "loja" : "conta"));
    } catch (e) {
      setError(msg(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onSaved = (d: s.SettingsData) => {
    setData(d);
    auth.refresh(); // atualiza o nome da loja/usuário no menu lateral
  };

  const tabs: { id: Tab; label: string; icon: typeof Store; managerOnly?: boolean }[] = [
    { id: "loja", label: "Loja", icon: Store, managerOnly: true },
    { id: "juros", label: "Juros das promissórias", icon: Percent },
    { id: "fiscal", label: "Nota fiscal", icon: FileText, managerOnly: true },
    { id: "integracoes", label: "Integrações", icon: Plug, managerOnly: true },
    { id: "usuarios", label: "Usuários", icon: Users, managerOnly: true },
    { id: "conta", label: "Minha conta", icon: UserCircle },
  ];
  // A aba de nota fiscal só aparece se o plano tiver NF-e
  const visibleTabs = tabs.filter((t) => (!t.managerOnly || data?.canEdit) && (t.id !== "fiscal" || plan.has("nfe")));

  return (
    <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      <div className="px-6 pt-4 flex-shrink-0" style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <h2>Configurações</h2>
        <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
          {data?.canEdit ? "Dados da loja, juros, nota fiscal e sua conta" : "Seus dados de acesso e a tabela de juros"}
        </p>
        <div className="flex gap-1 mt-3" style={{ overflowX: "auto" }}>
          {visibleTabs.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className="flex items-center gap-2"
                style={{
                  padding: "10px 14px", fontSize: 13, whiteSpace: "nowrap", flexShrink: 0,
                  color: active ? BLUE : "#6B7280", fontWeight: active ? 600 : 400,
                  borderBottom: `2px solid ${active ? BLUE : "transparent"}`,
                }}>
                <t.icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          {error && <Notice kind="error" text={error} />}
          {!data && !error && <p style={{ fontSize: 13, color: "#6B7280" }}>Carregando...</p>}
          {data && tab === "loja" && <StoreTab data={data} onSaved={onSaved} />}
          {data && tab === "juros" && <InterestTab canEdit={data.canEdit} store={data.dealership} onSaved={onSaved} />}
          {data && tab === "fiscal" && data.fiscal && <FiscalTab fiscal={data.fiscal} onSaved={onSaved} />}
          {data && tab === "integracoes" && <IntegrationsTab data={data} onNavigate={onNavigate} onGo={setTab} has={plan.has} />}
          {data && tab === "usuarios" && <UsersTab me={data.me} onNavigate={onNavigate} />}
          {data && tab === "conta" && <AccountTab data={data} onSaved={onSaved} />}
        </div>
      </div>
    </div>
  );
}

// =========================== Loja ===========================
function StoreTab({ data, onSaved }: { data: s.SettingsData; onSaved: (d: s.SettingsData) => void }) {
  const d = data.dealership;
  const [form, setForm] = useState({
    name: d.name, cnpj: maskCnpj(d.cnpj ?? ""), phone: maskPhone(d.phone ?? ""),
    city: d.city ?? "", state: d.state ?? "", primaryColor: d.primaryColor ?? BLUE,
    street: d.street ?? "", number: d.number ?? "", district: d.district ?? "", zip: maskCep(d.zip ?? ""),
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);
  const n = useNotice();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await s.updateStore({
        name: form.name, cnpj: onlyDigits(form.cnpj), phone: onlyDigits(form.phone),
        city: form.city, state: form.state.toUpperCase(), primaryColor: form.primaryColor,
        street: form.street, number: form.number, district: form.district, zip: onlyDigits(form.zip),
      }));
      n.show("ok", "Dados da loja salvos.");
    } catch (e) { n.show("error", msg(e)); } finally { setSaving(false); }
  };

  const sendImage = async (kind: "logo" | "cover", file?: File) => {
    if (!file) return;
    setUploading(kind);
    try {
      onSaved(await s.uploadStoreImage(kind, file));
      n.show("ok", kind === "logo" ? "Logo atualizada." : "Capa atualizada.");
    } catch (e) { n.show("error", msg(e)); } finally { setUploading(null); }
  };

  const removeImage = async (kind: "logo" | "cover") => {
    if (!confirm(kind === "logo" ? "Remover a logo?" : "Remover a capa?")) return;
    try { onSaved(await s.removeStoreImage(kind)); } catch (e) { n.show("error", msg(e)); }
  };

  return (
    <div className="flex flex-col gap-4">
      {n.el}
      <div style={card}>
        <SectionTitle title="Dados da loja" subtitle="Aparecem no sistema, no site, no contrato de venda e nas promissórias" />
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Field label="Nome da loja"><input style={inputStyle} value={form.name} onChange={set("name")} /></Field>
          <Field label="CNPJ"><input style={inputStyle} value={form.cnpj} placeholder="00.000.000/0000-00"
            onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })} /></Field>
          <Field label="Telefone / WhatsApp"><input style={inputStyle} value={form.phone} placeholder="(00) 00000-0000"
            onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })} /></Field>
          <Field label="CEP"><input style={inputStyle} value={form.zip} placeholder="00000-000" onChange={(e) => setForm({ ...form, zip: maskCep(e.target.value) })} /></Field>
          <Field label="Rua"><input style={inputStyle} value={form.street} onChange={set("street")} /></Field>
          <Field label="Número"><input style={inputStyle} value={form.number} onChange={set("number")} /></Field>
          <Field label="Bairro"><input style={inputStyle} value={form.district} onChange={set("district")} /></Field>
          <Field label="Cidade"><input style={inputStyle} value={form.city} onChange={set("city")} /></Field>
          <Field label="UF"><input style={inputStyle} value={form.state} maxLength={2} placeholder="SP"
            onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} /></Field>
          <Field label="Endereço do site" hint="Não pode ser alterado">
            <input style={{ ...inputStyle, background: "#F9FAFB", color: "#6B7280" }} value={`${d.slug}.autogestao.com.br`} readOnly />
          </Field>
        </div>
        <div className="flex items-end gap-3 mt-3">
          <Field label="Cor principal (site)">
            <div className="flex items-center gap-2">
              <input type="color" value={form.primaryColor} onChange={set("primaryColor")}
                style={{ width: 40, height: 34, border: "none", background: "none", padding: 0, cursor: "pointer" }} />
              <input style={{ ...inputStyle, width: 110 }} value={form.primaryColor} onChange={set("primaryColor")} />
            </div>
          </Field>
          <div style={{ flex: 1 }} />
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div style={card}>
        <SectionTitle title="Logo e capa" subtitle="JPG, PNG ou WEBP de até 10 MB" />
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          <ImageSlot label="Logo" url={d.logoUrl} square busy={uploading === "logo"}
            onPick={(f) => sendImage("logo", f)} onRemove={() => removeImage("logo")} />
          <ImageSlot label="Capa do site" url={d.coverUrl} busy={uploading === "cover"}
            onPick={(f) => sendImage("cover", f)} onRemove={() => removeImage("cover")} />
        </div>
      </div>
    </div>
  );
}

function ImageSlot({ label, url, square, busy, onPick, onRemove }: {
  label: string; url: string | null; square?: boolean; busy: boolean;
  onPick: (f?: File) => void; onRemove: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <span style={labelStyle}>{label}</span>
      <div className="flex items-center justify-center overflow-hidden"
        style={{ height: 130, width: square ? 130 : "100%", borderRadius: 10, background: "#F4F6F9", border: "1px dashed rgba(0,0,0,0.15)" }}>
        {url ? <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: square ? "contain" : "cover" }} />
          : <ImageIcon size={28} style={{ color: "#9CA3AF" }} />}
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={(e) => { onPick(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="flex gap-2 mt-2">
        <button onClick={() => ref.current?.click()} disabled={busy} className="flex items-center gap-1" style={ghostBtn}>
          <Upload size={14} /> {busy ? "Enviando..." : url ? "Trocar" : "Enviar"}
        </button>
        {url && <button onClick={onRemove} className="flex items-center gap-1" style={{ ...ghostBtn, color: "#B91C1C" }}><Trash2 size={14} /> Remover</button>}
      </div>
    </div>
  );
}

// =========================== Juros ===========================
type BandRow = { min: string; max: string; rate: string };

function InterestTab({ canEdit, store, onSaved }: { canEdit: boolean; store: s.StoreInfo; onSaved: (d: s.SettingsData) => void }) {
  const [bands, setBands] = useState<s.InterestBand[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // id ou "new"
  const [row, setRow] = useState<BandRow>({ min: "", max: "", rate: "" });
  const [busy, setBusy] = useState(false);
  const n = useNotice();

  useEffect(() => {
    s.listBands().then((b) => setBands(b.sort((a, c) => a.minInstallments - c.minInstallments))).catch((e) => n.show("error", msg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNew = () => {
    const lastMax = bands?.length ? Math.max(...bands.map((b) => b.maxInstallments)) : 0;
    setRow({ min: String(lastMax + 1), max: String(lastMax + 3), rate: "" });
    setEditing("new");
  };
  const startEdit = (b: s.InterestBand) => {
    setRow({ min: String(b.minInstallments), max: String(b.maxInstallments), rate: String(Number(b.rate)).replace(".", ",") });
    setEditing(b.id);
  };

  const save = async () => {
    const input = { minInstallments: parseInt(row.min, 10), maxInstallments: parseInt(row.max, 10), rate: Number(row.rate.replace(",", ".")) };
    if (!input.minInstallments || !input.maxInstallments || !Number.isFinite(input.rate) || row.rate.trim() === "") {
      n.show("error", "Preencha as parcelas (de / até) e a porcentagem.");
      return;
    }
    setBusy(true);
    try {
      const list = editing === "new" ? await s.createBand(input) : await s.updateBand(editing!, input);
      setBands(list);
      setEditing(null);
      n.show("ok", "Tabela de juros salva. Já vale para as próximas vendas.");
    } catch (e) { n.show("error", msg(e)); } finally { setBusy(false); }
  };

  const remove = async (b: s.InterestBand) => {
    if (!confirm(`Apagar a faixa de ${b.minInstallments}x a ${b.maxInstallments}x?`)) return;
    try { setBands(await s.deleteBand(b.id)); n.show("ok", "Faixa apagada."); } catch (e) { n.show("error", msg(e)); }
  };

  const preview = (() => {
    const max = parseInt(row.max, 10); const rate = Number(row.rate.replace(",", "."));
    return max > 0 && Number.isFinite(rate) && row.rate ? `${pct(rate / max)}% ao mês` : "—";
  })();

  const editRow = (
    <tr style={{ background: "#F8FBFF" }}>
      <td style={td}>
        <div className="flex items-center gap-1">
          <input style={{ ...inputStyle, width: 56 }} inputMode="numeric" value={row.min} onChange={(e) => setRow({ ...row, min: onlyDigits(e.target.value) })} />
          <span style={{ color: "#6B7280" }}>a</span>
          <input style={{ ...inputStyle, width: 56 }} inputMode="numeric" value={row.max} onChange={(e) => setRow({ ...row, max: onlyDigits(e.target.value) })} />
          <span style={{ color: "#6B7280" }}>x</span>
        </div>
      </td>
      <td style={td}>
        <div className="flex items-center gap-1">
          <input style={{ ...inputStyle, width: 80 }} inputMode="decimal" placeholder="Ex.: 95" value={row.rate}
            onChange={(e) => setRow({ ...row, rate: e.target.value.replace(/[^\d,.]/g, "") })} autoFocus />
          <span style={{ color: "#6B7280" }}>%</span>
        </div>
      </td>
      <td style={{ ...td, color: "#6B7280" }}>{preview}</td>
      <td style={{ ...td, textAlign: "right" }}>
        <div className="flex justify-end gap-1">
          <button onClick={save} disabled={busy} title="Salvar" style={{ ...iconBtn, background: BLUE, color: "#fff" }}><Check size={15} /></button>
          <button onClick={() => setEditing(null)} title="Cancelar" style={iconBtn}><X size={15} /></button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-4">
      {n.el}
      <MinDownPaymentCard canEdit={canEdit} store={store} onSaved={onSaved} />
      <div style={card}>
        <SectionTitle title="Juros das promissórias"
          subtitle="O juro é aplicado sobre o valor parcelado: total = valor × (1 + juros). O vendedor vê essa tabela na hora da venda." />
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "#6B7280", textAlign: "left" }}>
                <th style={th}>Parcelas</th><th style={th}>Juros total</th><th style={th}>Equivale a</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {bands === null && <tr><td style={td} colSpan={4}>Carregando...</td></tr>}
              {bands?.map((b) => editing === b.id ? <FragmentRow key={b.id}>{editRow}</FragmentRow> : (
                <tr key={b.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <td style={td}><strong>{b.minInstallments}x</strong> a <strong>{b.maxInstallments}x</strong></td>
                  <td style={td}>{pct(Number(b.rate))}%</td>
                  <td style={{ ...td, color: "#6B7280" }}>{pct(Number(b.rate) / b.maxInstallments)}% ao mês</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {canEdit && editing === null && (
                      <div className="flex justify-end gap-1">
                        <button onClick={() => startEdit(b)} title="Editar" style={iconBtn}><Pencil size={14} /></button>
                        <button onClick={() => remove(b)} title="Apagar" style={{ ...iconBtn, color: "#B91C1C" }}><Trash2 size={14} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {editing === "new" && editRow}
            </tbody>
          </table>
        </div>
        {canEdit ? (
          editing === null && (
            <button onClick={startNew} className="flex items-center gap-1 mt-3" style={ghostBtn}>
              <Plus size={14} /> Adicionar faixa (ex.: 19x a 21x)
            </button>
          )
        ) : (
          <p className="flex items-center gap-1 mt-3" style={{ fontSize: 12, color: "#6B7280" }}>
            <Lock size={13} /> Só o dono ou o administrador pode mudar a tabela.
          </p>
        )}
        <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 12 }}>
          Exemplo: faixa de 4x a 6x com 40% → R$ 10.000,00 parcelado vira R$ 14.000,00. Para quantidades de parcelas fora da tabela,
          o dono pode digitar o juros na hora da venda.
        </p>
      </div>
    </div>
  );
}

const FragmentRow = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const th: React.CSSProperties = { padding: "8px 10px", fontWeight: 500, fontSize: 12 };
const td: React.CSSProperties = { padding: "10px" };
const iconBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: "0.5px solid rgba(0,0,0,0.12)", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#fff" };

// =========================== Nota fiscal ===========================
function FiscalTab({ fiscal, onSaved }: { fiscal: s.FiscalInfo; onSaved: (d: s.SettingsData) => void }) {
  const [form, setForm] = useState({
    token: "", cnpj: maskCnpj(fiscal.cnpj ?? ""), ambiente: (fiscal.ambiente ?? "homologacao") as "homologacao" | "producao",
    inscricaoEstadual: fiscal.inscricaoEstadual ?? "", regimeTributario: fiscal.regimeTributario ? String(fiscal.regimeTributario) : "1",
    logradouro: fiscal.logradouro ?? "", numero: fiscal.numero ?? "", bairro: fiscal.bairro ?? "",
    municipio: fiscal.municipio ?? "", uf: fiscal.uf ?? "", cep: maskCep(fiscal.cep ?? ""),
  });
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const n = useNotice();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    if (form.ambiente === "producao" && !confirm("Em PRODUÇÃO as notas têm valor fiscal de verdade. Confirmar?")) return;
    setSaving(true);
    try {
      onSaved(await s.updateFiscal({
        ...form, token: form.token.trim() || undefined, cnpj: onlyDigits(form.cnpj),
        regimeTributario: Number(form.regimeTributario), uf: form.uf.toUpperCase(),
        inscricaoEstadual: form.inscricaoEstadual || undefined,
      }));
      setForm((f) => ({ ...f, token: "" }));
      n.show("ok", "Configuração da nota fiscal salva.");
    } catch (e) { n.show("error", msg(e)); } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      {n.el}
      <div style={card}>
        <SectionTitle title="Nota fiscal (Focus NFe)" subtitle="Dados usados para emitir as notas de entrada e saída dos veículos" />
        <div className="flex items-center gap-2 mb-4" style={{
          fontSize: 13, padding: "8px 12px", borderRadius: 8,
          background: fiscal.configured ? "#ECFDF5" : "#FFFBEB", color: fiscal.configured ? "#047857" : "#92400E",
        }}>
          {fiscal.configured ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {fiscal.configured
            ? `Conectado — ambiente de ${fiscal.ambiente === "producao" ? "produção" : "homologação (testes)"}`
            : "Ainda não configurado. Pegue o token no painel da Focus NFe."}
        </div>

        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Field label="Token da Focus NFe" hint={fiscal.configured ? "Deixe em branco para manter o atual" : undefined}>
            <div style={{ position: "relative" }}>
              <input style={{ ...inputStyle, paddingRight: 34 }} type={showToken ? "text" : "password"} autoComplete="off"
                value={form.token} onChange={set("token")} placeholder={fiscal.configured ? "•••••••• (guardado)" : "Cole o token aqui"} />
              <button type="button" onClick={() => setShowToken(!showToken)} style={{ position: "absolute", right: 8, top: 8, color: "#6B7280" }}
                aria-label="Mostrar token">{showToken ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </Field>
          <Field label="Ambiente">
            <select style={inputStyle} value={form.ambiente} onChange={set("ambiente")}>
              <option value="homologacao">Homologação (testes)</option>
              <option value="producao">Produção (notas reais)</option>
            </select>
          </Field>
          <Field label="CNPJ"><input style={inputStyle} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })} /></Field>
          <Field label="Inscrição estadual"><input style={inputStyle} value={form.inscricaoEstadual} onChange={set("inscricaoEstadual")} /></Field>
          <Field label="Regime tributário">
            <select style={inputStyle} value={form.regimeTributario} onChange={set("regimeTributario")}>
              <option value="1">Simples Nacional</option>
              <option value="2">Simples Nacional – excesso de sublimite</option>
              <option value="3">Regime normal</option>
            </select>
          </Field>
          <Field label="CEP"><input style={inputStyle} value={form.cep} placeholder="00000-000" onChange={(e) => setForm({ ...form, cep: maskCep(e.target.value) })} /></Field>
          <Field label="Rua"><input style={inputStyle} value={form.logradouro} onChange={set("logradouro")} /></Field>
          <Field label="Número"><input style={inputStyle} value={form.numero} onChange={set("numero")} /></Field>
          <Field label="Bairro"><input style={inputStyle} value={form.bairro} onChange={set("bairro")} /></Field>
          <Field label="Cidade"><input style={inputStyle} value={form.municipio} onChange={set("municipio")} /></Field>
          <Field label="UF"><input style={inputStyle} value={form.uf} maxLength={2} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} /></Field>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

// =========================== Integrações ===========================
function IntegrationsTab({ data, onNavigate, onGo, has }: {
  data: s.SettingsData; onNavigate?: (p: string) => void; onGo: (t: Tab) => void; has: (f: "nfe" | "renave" | "assistant" | "chat") => boolean;
}) {
  const i = data.integrations;
  const notInPlan = { ok: false, text: "Não faz parte do seu plano", action: onNavigate ? { label: "Ver planos", run: () => onNavigate("plans") } : undefined };
  const all = [
    {
      name: "Nota fiscal (Focus NFe)", ok: i.nfe.configured,
      text: i.nfe.configured ? `Conectado (${i.nfe.ambiente === "producao" ? "produção" : "homologação"})` : "Não configurado",
      action: { label: "Configurar", run: () => onGo("fiscal") },
    },
    {
      name: "RENAVE", ok: !!i.renave?.active,
      text: i.renave ? `${i.renave.partner ?? "Parceiro"} — ${i.renave.active ? "ativo" : i.renave.status}` : "Não configurado",
      action: onNavigate ? { label: "Abrir RENAVE", run: () => onNavigate("renave") } : undefined,
    },
    {
      name: "Assistente de IA", ok: i.assistant.enabled,
      text: i.assistant.enabled ? "Ligada" : "Desligada — falta a ANTHROPIC_API_KEY no .env do backend",
    },
    {
      name: "Consulta de placa", ok: i.plateLookup.enabled,
      text: i.plateLookup.enabled ? "Ligada" : "Desligada — falta o PLACAS_API_TOKEN no .env do backend",
    },
    {
      name: "Chat com clientes", ok: i.chat.provider !== "demo",
      text: i.chat.provider === "demo" ? "Modo demonstração" : `Conectado (${i.chat.provider})`,
    },
  ];
  const FEATURE_OF: Record<string, "nfe" | "renave" | "assistant" | "chat" | undefined> = {
    "Nota fiscal (Focus NFe)": "nfe", RENAVE: "renave", "Assistente de IA": "assistant", "Chat com clientes": "chat",
  };
  const items = all.map((it) => {
    const f = FEATURE_OF[it.name];
    return f && !has(f) ? { ...it, ...notInPlan } : it;
  });
  return (
    <div style={card}>
      <SectionTitle title="Integrações" subtitle="O que está ligado no sistema. Chaves secretas ficam só no servidor, nunca aparecem aqui." />
      <div className="flex flex-col">
        {items.map((it) => (
          <div key={it.name} className="flex items-center gap-3" style={{ padding: "12px 0", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: it.ok ? "#10B981" : "#D1D5DB", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{it.name}</div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{it.text}</div>
            </div>
            {it.action && <button onClick={it.action.run} style={ghostBtn}>{it.action.label}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================== Minha conta ===========================
const ROLE_NAMES = { owner: "Dono", admin: "Administrador", seller: "Vendedor" } as const;

function AccountTab({ data, onSaved }: { data: s.SettingsData; onSaved: (d: s.SettingsData) => void }) {
  const [name, setName] = useState(data.me.name);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const n = useNotice();

  const saveName = async () => {
    setSavingName(true);
    try { onSaved(await s.updateMe(name)); n.show("ok", "Nome atualizado."); }
    catch (e) { n.show("error", msg(e)); } finally { setSavingName(false); }
  };

  const savePw = async () => {
    if (pw.next.length < 8) return n.show("error", "A nova senha precisa ter pelo menos 8 caracteres.");
    if (pw.next !== pw.confirm) return n.show("error", "A confirmação não bate com a nova senha.");
    setSavingPw(true);
    try {
      await s.changePassword(pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      n.show("ok", "Senha trocada com sucesso.");
    } catch (e) { n.show("error", msg(e)); } finally { setSavingPw(false); }
  };

  return (
    <div className="flex flex-col gap-4">
      {n.el}
      <div style={card}>
        <SectionTitle title="Meus dados" />
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Field label="Nome"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="E-mail de acesso"><input style={{ ...inputStyle, background: "#F9FAFB", color: "#6B7280" }} value={data.me.email} readOnly /></Field>
          <Field label="Função"><input style={{ ...inputStyle, background: "#F9FAFB", color: "#6B7280" }} value={ROLE_NAMES[data.me.role]} readOnly /></Field>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={saveName} disabled={savingName || name.trim().length < 2} style={{ ...primaryBtn, opacity: savingName ? 0.6 : 1 }}>
            {savingName ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div style={card}>
        <SectionTitle title="Trocar senha" subtitle="Mínimo de 8 caracteres" />
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Field label="Senha atual"><input style={inputStyle} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
          <Field label="Nova senha"><input style={inputStyle} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="Repita a nova senha"><input style={inputStyle} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
        </div>
        <div className="flex justify-end mt-4">
          <button onClick={savePw} disabled={savingPw || !pw.current || !pw.next} style={{ ...primaryBtn, opacity: savingPw || !pw.current || !pw.next ? 0.6 : 1 }}>
            {savingPw ? "Trocando..." : "Trocar senha"}
          </button>
        </div>
      </div>
    </div>
  );
}

// =========================== Usuários ===========================
function UsersTab({ me, onNavigate }: { me: s.SettingsData["me"]; onNavigate?: (p: string) => void }) {
  const [data, setData] = useState<s.UsersData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const n = useNotice();
  const plan = usePlan();

  useEffect(() => { s.listUsers().then(setData).catch((e) => n.show("error", msg(e))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const change = async (u: s.StoreUser, patch: { active?: boolean; role?: "admin" | "seller" }, question?: string) => {
    if (question && !confirm(question)) return;
    setBusy(u.id);
    try {
      setData(await s.updateUser(u.id, patch));
      plan.refresh(); // atualiza a contagem de usuários na tela de Planos
      n.show("ok", patch.active === false ? `${u.name} foi desativado e não consegue mais entrar.` : patch.active ? `${u.name} foi reativado.` : "Função alterada.");
    } catch (e) { n.show("error", msg(e)); } finally { setBusy(null); }
  };

  const full = data?.limit != null && data.activeCount >= data.limit;

  return (
    <div className="flex flex-col gap-4">
      {n.el}
      <div style={card}>
        <div className="flex items-start justify-between gap-3 flex-wrap" style={{ marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Usuários da loja</h3>
            <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
              Todo mundo que acessa o sistema conta no limite do plano: você (dono), administradores e vendedores.
            </p>
          </div>
          {data?.limit != null && (
            <span style={{
              fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 99, whiteSpace: "nowrap",
              background: full ? "#FEF3C7" : "#EBF2FA", color: full ? "#B45309" : BLUE,
            }}>
              {data.activeCount} de {data.limit} usuários ativos · plano {data.planName}
            </span>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: "#6B7280", textAlign: "left" }}>
                <th style={th}>Nome</th><th style={th}>E-mail</th><th style={th}>Função</th><th style={th}>Situação</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {!data && <tr><td style={td} colSpan={5}>Carregando...</td></tr>}
              {data?.users.map((u) => {
                const locked = u.role === "owner" || u.id === me.id;
                const canEditRole = me.role === "owner" && !locked;
                const canToggle = !locked && (me.role === "owner" || u.role === "seller");
                return (
                  <tr key={u.id} style={{ borderTop: "1px solid rgba(0,0,0,0.06)", opacity: u.active ? 1 : 0.55 }}>
                    <td style={td}>
                      <strong>{u.name}</strong>{u.id === me.id && <span style={{ color: "#6B7280" }}> (você)</span>}
                      {u.jobTitle && <div style={{ fontSize: 12, color: "#6B7280" }}>{u.jobTitle}</div>}
                    </td>
                    <td style={{ ...td, color: "#4B5563" }}>{u.email}</td>
                    <td style={td}>
                      {canEditRole ? (
                        <select value={u.role} disabled={busy === u.id} style={{ ...inputStyle, width: "auto", padding: "5px 8px" }}
                          onChange={(e) => change(u, { role: e.target.value as "admin" | "seller" },
                            e.target.value === "admin" ? `${u.name} vai poder mexer em tudo da loja (menos no plano e nos administradores). Confirmar?` : undefined)}>
                          <option value="admin">Administrador</option>
                          <option value="seller">Vendedor</option>
                        </select>
                      ) : ROLE_NAMES[u.role]}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 12, fontWeight: 500, padding: "3px 8px", borderRadius: 99,
                        background: u.active ? "#ECFDF5" : "#F3F4F6", color: u.active ? "#047857" : "#6B7280" }}>
                        {u.active ? "Ativo" : "Desativado"}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {canToggle && (u.active ? (
                        <button disabled={busy === u.id} style={{ ...ghostBtn, color: "#B91C1C" }}
                          onClick={() => change(u, { active: false }, `Desativar ${u.name}? Ele perde o acesso na hora, mas as vendas dele continuam no histórico.`)}>
                          Desativar
                        </button>
                      ) : (
                        <button disabled={busy === u.id || full} title={full ? "O plano está no limite de usuários" : undefined}
                          style={{ ...ghostBtn, opacity: full ? 0.5 : 1 }} onClick={() => change(u, { active: true })}>
                          Reativar
                        </button>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 12 }}>
          Para cadastrar um vendedor novo, use a tela{" "}
          {onNavigate ? <button onClick={() => onNavigate("sellers")} style={{ color: BLUE, fontWeight: 500 }}>Vendedores</button> : "Vendedores"}.
          {" "}Usuários desativados não contam no limite do plano.
        </p>
      </div>
    </div>
  );
}

// Entrada mínima exigida nas vendas com promissória
function MinDownPaymentCard({ canEdit, store, onSaved }: { canEdit: boolean; store: s.StoreInfo; onSaved: (d: s.SettingsData) => void }) {
  const current = store.minDownPaymentPercent;
  const [value, setValue] = useState(current != null ? String(current).replace(".", ",") : "");
  const [saving, setSaving] = useState(false);
  const n = useNotice();
  const pctNum = Number(value.replace(",", "."));
  const example = value && Number.isFinite(pctNum) ? (20000 * pctNum) / 100 : null;

  const save = async () => {
    if (value && (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100)) return n.show("error", "Digite uma porcentagem entre 0 e 100.");
    setSaving(true);
    try {
      onSaved(await s.updateStore({ minDownPaymentPercent: value ? pctNum : null }));
      n.show("ok", value ? `Entrada mínima de ${value}% salva.` : "Entrada mínima removida.");
    } catch (e) { n.show("error", msg(e)); } finally { setSaving(false); }
  };

  return (
    <div style={card}>
      <SectionTitle title="Entrada mínima"
        subtitle="Porcentagem do valor do veículo que o cliente precisa dar de entrada para parcelar em promissória. Abaixo disso, o vendedor não consegue fechar a venda: só o dono ou o administrador libera." />
      {n.el && <div style={{ marginBottom: 12 }}>{n.el}</div>}
      <div className="flex items-end gap-3 flex-wrap">
        <Field label="Entrada mínima (%)">
          <div className="flex items-center gap-1">
            <input style={{ ...inputStyle, width: 100 }} inputMode="decimal" placeholder="Sem mínimo" disabled={!canEdit}
              value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d,.]/g, ""))} />
            <span style={{ color: "#6B7280" }}>%</span>
          </div>
        </Field>
        {canEdit && (
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? "Salvando..." : "Salvar"}</button>
        )}
        {example !== null && (
          <span style={{ fontSize: 12, color: "#6B7280", paddingBottom: 8 }}>
            Ex.: moto de R$ 20.000,00 → entrada mínima de {example.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        )}
      </div>
    </div>
  );
}
