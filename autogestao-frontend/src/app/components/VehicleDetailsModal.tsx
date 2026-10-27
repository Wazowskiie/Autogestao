import { DOC_ITEMS, docItemText } from "../../lib/vehicle-doc-status";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  X, Pencil, ImageOff, Car, Bike, Truck, Package, Upload, Trash2, Star, ChevronDown, ChevronRight,
  FileText, Link2, ExternalLink, Plus, Loader2, Check, FileCode2, AlertTriangle, CheckCircle2,
} from "lucide-react";
import * as dv from "../../lib/vehicle-details-api";
import type { VehicleFull } from "../../lib/vehicle-details-api";

// =====================================================================
// Painel "Dados do veículo" (abre ao clicar no veículo do estoque)
// =====================================================================

export type VehicleDetails = VehicleFull;

interface Props {
  vehicle: VehicleFull | null;
  onClose: () => void;
  onEdit?: (vehicle: VehicleFull) => void;
  /** Chamado quando algo muda (fotos, custo...) para atualizar a lista do estoque */
  onChanged?: () => void;
}

// ---------- Cores e estilos do sistema ----------
const C = {
  blue: "#185FA5", blueBg: "#EBF2FA", text: "#0F172A", muted: "#64748B", light: "#94A3B8",
  border: "#E5E7EB", stripe: "#F8FAFC", green: "#27500A", greenBg: "#EAF3DE", red: "#DC2626", redBg: "#FEE2E2",
  amber: "#B45309", amberBg: "#FEF3C7",
};
const inputStyle: CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.12)",
  fontSize: 13, background: "#fff", outline: "none", color: C.text, boxSizing: "border-box",
};

// ---------- Utilitários ----------
const money = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Datas "puras" (sem hora: 2026-10-27 ou ...T00:00:00.000Z) são mostradas como estão, sem o fuso puxar para o dia anterior
const isDateOnly = (iso: string) => /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(iso);
const dateBR = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", isDateOnly(iso) ? { timeZone: "UTC" } : undefined) : "—");
const toInputDate = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const yesNo = (v?: boolean | null) => (v === true ? "Sim" : v === false ? "Não" : "");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado. Tente novamente.");
const fileSize = (b?: number | null) =>
  !b ? "" : b < 1024 * 1024 ? `${Math.ceil(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

// Entende "25000", "25.000", "25.000,50" e "R$ 25.000,00"
function parseBRL(value: string) {
  const s = value.trim().replace(/[R$\s]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  return Number(s);
}
const moneyInput = (v: number | string | null | undefined) =>
  v === null || v === undefined || Number(v) === 0 ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

function formatDoc(doc?: string | null) {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc || "—";
}

const TYPE_ICON = { car: Car, moto: Bike, truck: Truck, other: Package };
const TYPE_LABEL: Record<string, string> = { car: "Carro", moto: "Moto", truck: "Utilitário", other: "Outros" };
const STATUS_LABEL: Record<string, { text: string; bg: string; fg: string }> = {
  available: { text: "Disponível", bg: C.greenBg, fg: C.green },
  reserved: { text: "Reservado", bg: "#F3E8FF", fg: "#7C3AED" },
  sold: { text: "Vendido", bg: "#F1F5F9", fg: C.muted },
};

// ---------- Abas ----------
type Tab = "vehicle" | "files" | "nfe" | "media" | "expenses" | "summary" | "web" | "entry" | "pendencies" | "financial";
const TABS: { id: Tab; label: string }[] = [
  { id: "vehicle", label: "Veículo" },
  { id: "files", label: "Arquivos" },
  { id: "nfe", label: "NF-e / RENAVE" },
  { id: "media", label: "Mídias" },
  { id: "expenses", label: "Lançamentos" },
  { id: "summary", label: "Resumo" },
  { id: "web", label: "Web" },
  { id: "entry", label: "Entrada" },
  { id: "pendencies", label: "Pendências" },
  { id: "financial", label: "Financeiro" },
];

export function VehicleDetailsModal({ vehicle: initial, onClose, onEdit, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>("vehicle");
  const [vehicle, setVehicle] = useState<VehicleFull | null>(initial);

  // Ao abrir: começa na aba Veículo e busca os dados mais recentes
  useEffect(() => {
    setVehicle(initial);
    if (!initial) return;
    setTab("vehicle");
    dv.getVehicle(initial.id).then(setVehicle).catch(() => undefined);
  }, [initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initial) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [initial, onClose]);

  const refresh = useCallback(async () => {
    if (!initial) return;
    try { setVehicle(await dv.getVehicle(initial.id)); } catch { /* mantém o que já tem */ }
    onChanged?.();
  }, [initial, onChanged]);

  if (!initial || !vehicle) return null;
  const v = vehicle;
  const status = STATUS_LABEL[v.status] ?? STATUS_LABEL.available;
  const cover = [...(v.photos ?? [])].sort((a, b) => a.order - b.order)[0];
  const Icon = TYPE_ICON[v.type] ?? Car;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 14, width: "100%", maxWidth: 1100, height: "92vh",
        display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.25)", overflow: "hidden",
      }}>
        {/* Cabeçalho */}
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 16, padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#F4F6F9", display: "flex", alignItems: "center", justifyContent: "center", color: "#CBD5E1" }}>
            {cover ? <img src={cover.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon size={26} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {v.brand} {v.model} {v.version ?? ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, color: C.muted, fontSize: 14, flexWrap: "wrap" }}>
              <span>{v.manufactureYear ? `${v.manufactureYear}/${v.year}` : v.year}</span>
              {v.plate && <span>· {v.plate}</span>}
              <Badge bg={status.bg} fg={status.fg}>{status.text}</Badge>
            </div>
          </div>
          {onEdit && (
            <Btn variant="outline" onClick={() => onEdit(v)}><Pencil size={15} /> Editar</Btn>
          )}
          <button onClick={onClose} aria-label="Fechar" style={{ border: 0, background: "transparent", cursor: "pointer", color: C.muted, padding: 6 }}>
            <X size={22} />
          </button>
        </div>

        {/* Abas (rolam para o lado em telas pequenas) */}
        <div style={{ flexShrink: 0, display: "flex", gap: 2, padding: "0 16px", borderBottom: `1px solid ${C.border}`, overflowX: "auto", overflowY: "hidden" }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flexShrink: 0, padding: "13px 14px", border: 0, background: "transparent", cursor: "pointer",
              fontSize: 14, fontWeight: 500, whiteSpace: "nowrap",
              color: tab === t.id ? C.blue : C.muted,
              borderBottom: `2px solid ${tab === t.id ? C.blue : "transparent"}`,
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 24 }}>
          {tab === "vehicle" && <VehicleTab v={v} />}
          {tab === "files" && <FilesTab v={v} />}
          {tab === "nfe" && <NfeTab v={v} />}
          {tab === "media" && <MediaTab v={v} onChanged={refresh} />}
          {tab === "expenses" && <ExpensesTab v={v} />}
          {tab === "summary" && <SummaryTab v={v} />}
          {tab === "web" && <WebTab v={v} />}
          {tab === "entry" && <EntryTab v={v} onChanged={refresh} />}
          {tab === "pendencies" && <PendenciesTab v={v} />}
          {tab === "financial" && <FinancialTab v={v} />}
        </div>

        {/* Rodapé */}
        <div style={{ flexShrink: 0, padding: "12px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="soft" onClick={onClose}>Fechar</Btn>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Componentes pequenos reaproveitados nas abas
// =====================================================================

function Badge({ bg, fg, children }: { bg: string; fg: string; children: ReactNode }) {
  return <span style={{ background: bg, color: fg, padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{children}</span>;
}

function Btn({ children, onClick, variant = "primary", disabled, type = "button", small }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "outline" | "soft" | "danger" | "success";
  disabled?: boolean; type?: "button" | "submit"; small?: boolean;
}) {
  const styles: Record<string, CSSProperties> = {
    primary: { background: C.blue, color: "#fff", border: "1px solid transparent" },
    success: { background: "#16A34A", color: "#fff", border: "1px solid transparent" },
    outline: { background: "#fff", color: C.text, border: "1px solid #CBD5E1" },
    soft: { background: "#F1F5F9", color: C.text, border: "1px solid transparent" },
    danger: { background: C.redBg, color: C.red, border: "1px solid transparent" },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...styles[variant], display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
      padding: small ? "5px 10px" : "8px 14px", borderRadius: 8, fontSize: small ? 12 : 13, fontWeight: 500,
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
    }}>
      {children}
    </button>
  );
}

function IconBtn({ title, onClick, children, color = C.muted }: { title: string; onClick: () => void; children: ReactNode; color?: string }) {
  return (
    <button title={title} aria-label={title} onClick={onClick} style={{ border: 0, background: "transparent", cursor: "pointer", color, padding: 4, display: "inline-flex" }}>
      {children}
    </button>
  );
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{children}</div>
      {action && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{action}</div>}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: C.light, textTransform: "uppercase", marginBottom: 10 }}>{children}</div>;
}

function Field({ label, children, span }: { label: string; children: ReactNode; span?: boolean }) {
  return (
    <label style={{ display: "block", gridColumn: span ? "1 / -1" : undefined }}>
      <span style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

function Grid({ children, cols = 2 }: { children: ReactNode; cols?: number }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${cols >= 3 ? 180 : 240}px, 1fr))`, gap: 14 }}>{children}</div>;
}

function Alert({ kind = "error", children }: { kind?: "error" | "info" | "success"; children: ReactNode }) {
  const map = {
    error: { bg: C.redBg, fg: "#991B1B", icon: <AlertTriangle size={15} /> },
    info: { bg: C.blueBg, fg: C.blue, icon: <AlertTriangle size={15} /> },
    success: { bg: C.greenBg, fg: C.green, icon: <CheckCircle2 size={15} /> },
  }[kind];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: map.bg, color: map.fg, padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>{map.icon}</span><span>{children}</span>
    </div>
  );
}

function Loading() {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.light, fontSize: 14, padding: "24px 0" }}><Loader2 size={16} className="animate-spin" /> Carregando...</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: "14px 16px", fontSize: 13, color: C.light, background: C.stripe, borderRadius: 8 }}>{children}</div>;
}

/** Linhas "Rótulo: valor" com fundo listrado (igual à aba Veículo) */
function InfoRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      {rows.map(([label, value], i) => (
        <div key={label} style={{ display: "grid", gridTemplateColumns: "minmax(130px, 220px) 1fr", gap: 16, padding: "10px 16px", fontSize: 14, background: i % 2 === 0 ? C.stripe : "#fff" }}>
          <span style={{ color: C.muted }}>{label}</span>
          <span style={{ color: value === "" || value === null || value === undefined ? "#CBD5E1" : C.text, wordBreak: "break-word" }}>
            {value === 0 ? "0" : value || "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#F1F5F9" }}>
            {head.map((h) => <th key={h} style={{ textAlign: "left", padding: "9px 12px", color: C.muted, fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length ? children : (
            <tr><td colSpan={head.length} style={{ padding: "14px 12px", color: C.light }}>{empty ?? "Nenhum registro."}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
const td: CSSProperties = { padding: "10px 12px", borderTop: `1px solid ${C.border}`, color: C.text, verticalAlign: "middle" };

/** Botão que abre o seletor de arquivos do computador */
function PickFile({ label, accept, multiple, onPick, busy, variant = "primary" }: {
  label: string; accept?: string; multiple?: boolean; onPick: (files: File[]) => void; busy?: boolean; variant?: "primary" | "outline" | "success";
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" hidden accept={accept} multiple={multiple}
        onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) onPick(f); }} />
      <Btn variant={variant} disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {busy ? "Enviando..." : label}
      </Btn>
    </>
  );
}

/** Carrega os dados de uma aba e guarda erro/carregando */
function useTabData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await load()); setError(null); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); }
  }, [load]);
  useEffect(() => { reload(); }, [reload]);
  return { data, setData, error, setError, loading, reload };
}

/** Executa uma ação (salvar, excluir...) mostrando "ocupado" e erro */
function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); } catch (e) { setError(errMsg(e)); } finally { setBusy(null); }
  }, []);
  return { busy, error, setError, run };
}

// =====================================================================
// Aba Veículo
// =====================================================================
function VehicleTab({ v }: { v: VehicleFull }) {
  const motorized = v.type !== "other" || !!v.engineCc;
  const sections: { title: string; rows: [string, ReactNode][] }[] = [
    { title: "Cadastro", rows: [
      ["Data cadastro", dateBR(v.createdAt)],
      ["Última alteração", v.updatedAt ? dateBR(v.updatedAt) : ""],
      ["Tipo", v.type === "other" && v.category ? `Outros · ${v.category}` : TYPE_LABEL[v.type]],
      ["Status", STATUS_LABEL[v.status]?.text],
    ] },
    { title: "Identificação", rows: [
      ["Marca", v.brand], ["Modelo", v.model], ["Versão", v.version],
      ["Ano fabricação", v.manufactureYear], ["Ano modelo", v.year],
      ["Placa", v.plate], ["Chassi", v.chassis], ["Renavam", v.renavam],
    ] },
    { title: "Características", rows: [
      ["Cor", v.color],
      ["Quilometragem", `${Number(v.km ?? 0).toLocaleString("pt-BR")} km`],
      ["Combustível", v.fuel], ["Câmbio", v.transmission],
      ...(motorized ? [["Cilindrada", v.engineCc ? `${v.engineCc} cc` : ""] as [string, ReactNode]] : []),
      ...(v.motorPower ? [["Potência do motor", `${v.motorPower} W`] as [string, ReactNode]] : []),
      ...(v.type === "car" || v.type === "truck" ? [["Portas", v.doors] as [string, ReactNode]] : []),
      ["Procedência", v.origin],
    ] },
    { title: "Histórico e documentação", rows: [
      ["Nº de donos", v.ownerCount], ["IPVA pago", yesNo(v.ipvaPaid)], ["Chave reserva", yesNo(v.hasSpareKey)],
      ["Manual", yesNo(v.hasManual)], ["Aceita troca", yesNo(v.acceptsTrade)],
    ] },
    ...(v.type !== "other" ? [{ title: "Situação do veículo", rows: DOC_ITEMS.map((d) => {
      const it = v.docStatus?.[d.key];
      const text = docItemText(d.key, it);
      return [d.label, it?.status === "pending" ? <span style={{ color: "#B91C1C", fontWeight: 600 }}>⚠ {text}</span>
        : it?.status === "ok" ? <span style={{ color: "#15803D" }}>✓ {text}</span> : <span style={{ color: "#9CA3AF" }}>{text}</span>] as [string, ReactNode];
    }) }] : []),
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {sections.map((s) => <div key={s.title}><Label>{s.title}</Label><InfoRows rows={s.rows} /></div>)}
      {!!v.optionals?.length && (
        <div>
          <Label>Opcionais</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {v.optionals.map((o) => <Badge key={o} bg={C.blueBg} fg={C.blue}>{o}</Badge>)}
          </div>
        </div>
      )}
      {v.description && (
        <div><Label>Observações</Label><p style={{ margin: 0, fontSize: 14, color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{v.description}</p></div>
      )}
    </div>
  );
}

// =====================================================================
// Aba Arquivos
// =====================================================================
function FilesTab({ v }: { v: VehicleFull }) {
  const load = useCallback(() => Promise.all([dv.listFiles(v.id), dv.getAcquisition(v.id)]), [v.id]);
  const { data, setData, error, loading } = useTabData(load);
  const action = useAction();
  const [open, setOpen] = useState<Record<string, boolean>>({ vehicle: true, supplier: false, owner_document: false, link: false });
  const [link, setLink] = useState({ name: "", url: "" });

  if (loading && !data) return <Loading />;
  if (error && !data) return <Alert>{error}</Alert>;
  const [files, acq] = data!;
  const setFiles = (f: dv.VehicleFileItem[]) => setData([f, acq]);

  const groups: { id: dv.FileCategory; title: string }[] = [
    { id: "vehicle", title: `Arquivos do veículo (${v.brand} ${v.model})` },
    { id: "supplier", title: `Arquivos do fornecedor${acq?.supplierName ? ` (${acq.supplierName})` : ""}` },
    { id: "owner_document", title: `Documento em nome de${acq?.documentOwnerName ? ` (${acq.documentOwnerName})` : ""}` },
    { id: "link", title: "Links" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {action.error && <Alert>{action.error}</Alert>}
      {groups.map((g) => {
        const list = files.filter((f) => f.category === g.id);
        const isOpen = open[g.id];
        return (
          <div key={g.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <button onClick={() => setOpen((o) => ({ ...o, [g.id]: !o[g.id] }))} style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", border: 0,
              background: "#F1F5F9", cursor: "pointer", fontSize: 15, fontWeight: 500, color: C.text, textAlign: "left",
            }}>
              {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <span style={{ flex: 1 }}>{g.title}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{list.length}</span>
            </button>
            {isOpen && (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                {list.length === 0 && <Empty>{g.id === "link" ? "Nenhum link salvo." : "Nenhum arquivo enviado."}</Empty>}
                {list.map((f) => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8 }}>
                    <span style={{ color: C.blue }}>{f.category === "link" ? <Link2 size={18} /> : <FileText size={18} />}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                      <div style={{ fontSize: 12, color: C.light }}>
                        {[dateBR(f.createdAt), f.uploadedBy, fileSize(f.size)].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <IconBtn title="Abrir" color={C.blue} onClick={() =>
                      f.category === "link" ? window.open(f.url ?? "", "_blank", "noopener")
                        : action.run(`open-${f.id}`, () => dv.openFile(v.id, f))}>
                      <ExternalLink size={16} />
                    </IconBtn>
                    <IconBtn title="Excluir" color={C.red} onClick={() => {
                      if (window.confirm(`Excluir "${f.name}"?`)) action.run(`del-${f.id}`, async () => setFiles(await dv.deleteFile(v.id, f.id)));
                    }}><Trash2 size={16} /></IconBtn>
                  </div>
                ))}

                {g.id === "link" ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input placeholder="Nome (ex: Laudo cautelar)" value={link.name} onChange={(e) => setLink({ ...link, name: e.target.value })} style={{ ...inputStyle, flex: "1 1 180px" }} />
                    <input placeholder="https://..." value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} style={{ ...inputStyle, flex: "2 1 240px" }} />
                    <Btn disabled={!!action.busy || !link.name.trim() || !link.url.trim()} onClick={() =>
                      action.run("link", async () => { setFiles(await dv.addLink(v.id, link.name, link.url)); setLink({ name: "", url: "" }); })}>
                      <Plus size={15} /> Adicionar link
                    </Btn>
                  </div>
                ) : (
                  <div>
                    <PickFile label="Enviar arquivos" multiple busy={action.busy === `up-${g.id}`}
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.xml,.txt,.doc,.docx,.xls,.xlsx"
                      onPick={(picked) => action.run(`up-${g.id}`, async () => {
                        let last = files;
                        for (const file of picked) last = await dv.uploadFile(v.id, file, g.id as Exclude<dv.FileCategory, "link">);
                        setFiles(last);
                      })} />
                    <span style={{ fontSize: 12, color: C.light, marginLeft: 10 }}>PDF, imagem, XML, Word ou Excel, até 20 MB</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =====================================================================
// Aba NF-e / RENAVE
// =====================================================================
const RENAVE_STATUS: Record<dv.RenaveStatus, { text: string; bg: string; fg: string }> = {
  not_sent: { text: "Não enviado", bg: "#F1F5F9", fg: C.muted },
  pending: { text: "Aguardando", bg: C.amberBg, fg: C.amber },
  done: { text: "Concluído", bg: C.greenBg, fg: C.green },
  error: { text: "Com erro", bg: C.redBg, fg: C.red },
};

function NfeTab({ v }: { v: VehicleFull }) {
  const load = useCallback(() => Promise.all([dv.listInvoices(v.id), dv.getRenave(v.id)]), [v.id]);
  const { data, setData, error, loading } = useTabData(load);
  const action = useAction();
  const [form, setForm] = useState<null | "issued" | "received">(null);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Alert>{error}</Alert>;
  const [invoices, renave] = data!;
  const setInvoices = (list: dv.VehicleInvoice[]) => setData([list, renave]);

  const importXml = (direction: "issued" | "received") => (files: File[]) =>
    action.run(`xml-${direction}`, async () => setInvoices(await dv.importInvoiceXml(v.id, files[0], direction)));

  const invoiceRow = (n: dv.VehicleInvoice, issued: boolean) => (
    <tr key={n.id}>
      <td style={td}>{n.number ?? "—"}{n.series ? `/${n.series}` : ""}</td>
      {issued && <td style={td}>{n.operation ?? "—"}</td>}
      <td style={td}>{n.cfop ?? "—"}</td>
      <td style={td}>{dateBR(n.issuedAt)}</td>
      <td style={{ ...td, fontWeight: 500 }}>{n.amount !== null ? money(n.amount) : "—"}</td>
      <td style={td}>{issued ? n.recipientName ?? "—" : n.issuerName ?? "—"}<div style={{ fontSize: 11, color: C.light }}>{formatDoc(issued ? n.recipientDocument : n.issuerDocument)}</div></td>
      <td style={{ ...td, fontSize: 11, color: C.muted, maxWidth: 160, wordBreak: "break-all" }}>{n.accessKey ?? "—"}</td>
      <td style={td}>
        {n.status === "canceled" ? <Badge bg={C.redBg} fg={C.red}>Cancelada</Badge> : <Badge bg={C.greenBg} fg={C.green}>Autorizada</Badge>}
      </td>
      <td style={{ ...td, whiteSpace: "nowrap" }}>
        {n.hasXml && <IconBtn title="Baixar XML" color={C.blue} onClick={() => action.run(`dl-${n.id}`, () => dv.openInvoiceXml(v.id, n))}><FileCode2 size={16} /></IconBtn>}
        <IconBtn title="Excluir" color={C.red} onClick={() => {
          if (window.confirm("Excluir o registro desta nota? (Isso não cancela a nota na Sefaz.)"))
            action.run(`del-${n.id}`, async () => setInvoices(await dv.deleteInvoice(v.id, n.id)));
        }}><Trash2 size={16} /></IconBtn>
      </td>
    </tr>
  );

  const issued = invoices.filter((n) => n.direction === "issued");
  const received = invoices.filter((n) => n.direction === "received");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {action.error && <Alert>{action.error}</Alert>}

      <RenaveCard v={v} renave={renave} onSaved={(r) => setData([invoices, r])} />

      <div>
        <SectionTitle action={<>
          <PickFile label="Importar XML" accept=".xml" variant="outline" busy={action.busy === "xml-issued"} onPick={importXml("issued")} />
          <Btn onClick={() => setForm("issued")}><Plus size={15} /> Cadastrar nota</Btn>
        </>}>Notas emitidas</SectionTitle>
        {form === "issued" && <InvoiceForm direction="issued" v={v} onCancel={() => setForm(null)} onSaved={(l) => { setInvoices(l); setForm(null); }} />}
        <Table head={["Nº", "Natureza da operação", "CFOP", "Data", "Valor", "Cliente", "Chave", "Status", ""]} empty="Nenhuma nota emitida.">
          {issued.map((n) => invoiceRow(n, true))}
        </Table>
      </div>

      <div>
        <SectionTitle action={<>
          <PickFile label="Importar XML" accept=".xml" variant="success" busy={action.busy === "xml-received"} onPick={importXml("received")} />
          <Btn variant="outline" onClick={() => setForm("received")}><Plus size={15} /> NF-e recebida</Btn>
        </>}>Notas recebidas</SectionTitle>
        {form === "received" && <InvoiceForm direction="received" v={v} onCancel={() => setForm(null)} onSaved={(l) => { setInvoices(l); setForm(null); }} />}
        <Table head={["Nº", "CFOP", "Data", "Valor", "Fornecedor", "Chave", "Status", ""]} empty="Nenhuma nota recebida.">
          {received.map((n) => invoiceRow(n, false))}
        </Table>
        <p style={{ fontSize: 12, color: C.light, margin: "8px 0 0" }}>
          Dica: importe o XML da nota que o fornecedor mandou e os dados são preenchidos sozinhos.
        </p>
      </div>
    </div>
  );
}

function InvoiceForm({ direction, v, onCancel, onSaved }: {
  direction: "issued" | "received"; v: VehicleFull; onCancel: () => void; onSaved: (list: dv.VehicleInvoice[]) => void;
}) {
  const [f, setF] = useState({ number: "", series: "", accessKey: "", operation: "", cfop: "", issuedAt: today(), amount: "", name: "", document: "" });
  const action = useAction();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = () => action.run("save", async () => {
    const amount = f.amount.trim() ? parseBRL(f.amount) : undefined;
    if (amount !== undefined && Number.isNaN(amount)) throw new Error("Valor inválido.");
    const party = direction === "issued"
      ? { recipientName: f.name, recipientDocument: f.document.replace(/\D/g, "") }
      : { issuerName: f.name, issuerDocument: f.document.replace(/\D/g, "") };
    onSaved(await dv.createInvoice(v.id, {
      direction, number: f.number, series: f.series, accessKey: f.accessKey.replace(/\D/g, ""),
      operation: f.operation, cfop: f.cfop, issuedAt: f.issuedAt || undefined, amount,
      type: direction === "issued" ? "saida" : "entrada", ...party,
    }));
  });

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 12, background: C.stripe }}>
      {action.error && <Alert>{action.error}</Alert>}
      <Grid cols={3}>
        <Field label="Número"><input value={f.number} onChange={set("number")} style={inputStyle} /></Field>
        <Field label="Série"><input value={f.series} onChange={set("series")} style={inputStyle} /></Field>
        <Field label="Data de emissão"><input type="date" value={f.issuedAt} onChange={set("issuedAt")} style={inputStyle} /></Field>
        <Field label="Natureza da operação"><input value={f.operation} onChange={set("operation")} placeholder="Ex: Venda de veículo usado" style={inputStyle} /></Field>
        <Field label="CFOP"><input value={f.cfop} onChange={set("cfop")} placeholder="Ex: 5102" style={inputStyle} /></Field>
        <Field label="Valor"><input value={f.amount} onChange={set("amount")} placeholder="Ex: 30.000,00" style={inputStyle} /></Field>
        <Field label={direction === "issued" ? "Cliente" : "Fornecedor"}><input value={f.name} onChange={set("name")} style={inputStyle} /></Field>
        <Field label="CPF/CNPJ"><input value={f.document} onChange={set("document")} style={inputStyle} /></Field>
        <Field label="Chave de acesso (44 números)" span><input value={f.accessKey} onChange={set("accessKey")} style={inputStyle} /></Field>
      </Grid>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <Btn variant="outline" onClick={onCancel}>Cancelar</Btn>
        <Btn onClick={save} disabled={action.busy === "save"}>{action.busy === "save" ? "Salvando..." : "Salvar nota"}</Btn>
      </div>
    </div>
  );
}

function RenaveCard({ v, renave, onSaved }: { v: VehicleFull; renave: dv.RenaveInfo; onSaved: (r: dv.RenaveInfo) => void }) {
  const r = renave.record;
  const [f, setF] = useState({
    entryStatus: r?.entryStatus ?? "not_sent", entryAt: toInputDate(r?.entryAt), entryProtocol: r?.entryProtocol ?? "",
    exitStatus: r?.exitStatus ?? "not_sent", exitAt: toInputDate(r?.exitAt), exitProtocol: r?.exitProtocol ?? "",
    notes: r?.notes ?? "",
  });
  const [editing, setEditing] = useState(false);
  const action = useAction();
  const integ = renave.integration;
  const integText = !integ ? "Não configurada" : integ.active ? `Ativa · ${integ.partner ?? "Renave"}` : `${integ.partner ?? "Renave"} · aguardando liberação`;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = () => action.run("renave", async () => { onSaved(await dv.updateRenave(v.id, f)); setEditing(false); });

  const statusSelect = (k: "entryStatus" | "exitStatus") => (
    <select value={f[k]} onChange={set(k)} style={inputStyle}>
      {Object.entries(RENAVE_STATUS).map(([id, s]) => <option key={id} value={id}>{s.text}</option>)}
    </select>
  );

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
      <SectionTitle action={!editing && <Btn variant="outline" small onClick={() => setEditing(true)}><Pencil size={13} /> Atualizar</Btn>}>
        RENAVE <span style={{ fontSize: 13, fontWeight: 400, color: C.muted, marginLeft: 6 }}>Integração: {integText}</span>
      </SectionTitle>
      {action.error && <Alert>{action.error}</Alert>}

      {!editing ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {[
            { k: "entry", title: "Entrada no estoque", status: r?.entryStatus, at: r?.entryAt, protocol: r?.entryProtocol },
            { k: "exit", title: "Saída (venda)", status: r?.exitStatus, at: r?.exitAt, protocol: r?.exitProtocol },
          ].map((item) => {
            const s = RENAVE_STATUS[item.status ?? "not_sent"];
            return (
              <div key={item.k} style={{ background: C.stripe, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>{item.title}</div>
                <Badge bg={s.bg} fg={s.fg}>{s.text}</Badge>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
                  {item.at ? `Data: ${dateBR(item.at)}` : ""}{item.protocol ? ` · Protocolo: ${item.protocol}` : ""}
                </div>
              </div>
            );
          })}
          {r?.notes && <div style={{ gridColumn: "1 / -1", fontSize: 13, color: "#334155" }}>{r.notes}</div>}
        </div>
      ) : (
        <>
          <Grid cols={3}>
            <Field label="Entrada: situação">{statusSelect("entryStatus")}</Field>
            <Field label="Entrada: data"><input type="date" value={f.entryAt} onChange={set("entryAt")} style={inputStyle} /></Field>
            <Field label="Entrada: protocolo"><input value={f.entryProtocol} onChange={set("entryProtocol")} style={inputStyle} /></Field>
            <Field label="Saída: situação">{statusSelect("exitStatus")}</Field>
            <Field label="Saída: data"><input type="date" value={f.exitAt} onChange={set("exitAt")} style={inputStyle} /></Field>
            <Field label="Saída: protocolo"><input value={f.exitProtocol} onChange={set("exitProtocol")} style={inputStyle} /></Field>
            <Field label="Observações" span><textarea rows={2} value={f.notes} onChange={set("notes")} style={{ ...inputStyle, resize: "vertical" }} /></Field>
          </Grid>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
            <Btn variant="outline" onClick={() => setEditing(false)}>Cancelar</Btn>
            <Btn onClick={save} disabled={action.busy === "renave"}>{action.busy === "renave" ? "Salvando..." : "Salvar"}</Btn>
          </div>
        </>
      )}
      <p style={{ fontSize: 12, color: C.light, margin: "12px 0 0" }}>
        Por enquanto a situação é registrada aqui manualmente. O envio automático pelo Renave Fácil entra assim que eles liberarem a documentação da API.
      </p>
    </div>
  );
}

// =====================================================================
// Aba Mídias
// =====================================================================
function MediaTab({ v, onChanged }: { v: VehicleFull; onChanged: () => void }) {
  const [photos, setPhotos] = useState<dv.VehiclePhoto[]>(() => [...(v.photos ?? [])].sort((a, b) => a.order - b.order));
  const [zoom, setZoom] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const action = useAction();

  useEffect(() => { setPhotos([...(v.photos ?? [])].sort((a, b) => a.order - b.order)); }, [v.photos]);

  const apply = (list: dv.VehiclePhoto[]) => { setPhotos(list); onChanged(); };
  const send = (files: File[]) => {
    const images = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!images.length) { action.setError("Envie fotos em JPG, PNG ou WEBP."); return; }
    action.run("upload", async () => apply(await dv.uploadPhotos(v.id, images.slice(0, 20))));
  };

  return (
    <div>
      {action.error && <Alert>{action.error}</Alert>}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); send(Array.from(e.dataTransfer.files)); }}
        style={{
          border: `2px dashed ${dragging ? C.blue : "#CBD5E1"}`, background: dragging ? C.blueBg : C.stripe,
          borderRadius: 12, padding: "22px 16px", textAlign: "center", marginBottom: 18,
        }}
      >
        <div style={{ fontSize: 14, color: C.muted, marginBottom: 10 }}>Arraste as fotos aqui ou</div>
        <PickFile label="Escolher fotos" accept="image/jpeg,image/png,image/webp" multiple busy={action.busy === "upload"} onPick={send} />
        <div style={{ fontSize: 12, color: C.light, marginTop: 8 }}>JPG, PNG ou WEBP · até 10 MB cada · até 20 por vez</div>
      </div>

      {photos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 16px", color: C.light }}>
          <ImageOff size={32} /><p style={{ margin: "10px 0 0", fontSize: 14 }}>Este veículo ainda não tem fotos.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {photos.map((p, i) => (
            <div key={p.id} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "4 / 3", background: "#F1F5F9" }}>
              <img src={p.url} alt={`Foto ${i + 1}`} onClick={() => setZoom(p.url)} style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }} />
              {i === 0 && <span style={{ position: "absolute", top: 8, left: 8 }}><Badge bg={C.blue} fg="#fff">Capa</Badge></span>}
              <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4 }}>
                {i > 0 && (
                  <button title="Usar como capa" onClick={() => action.run(`cover-${p.id}`, async () => apply(await dv.setCoverPhoto(v.id, p.id)))}
                    style={{ border: 0, borderRadius: 6, background: "rgba(255,255,255,0.92)", padding: 5, cursor: "pointer", color: C.amber, display: "flex" }}>
                    <Star size={15} />
                  </button>
                )}
                <button title="Excluir foto" onClick={() => {
                  if (window.confirm("Excluir esta foto?")) action.run(`del-${p.id}`, async () => apply(await dv.deletePhoto(v.id, p.id)));
                }} style={{ border: 0, borderRadius: 6, background: "rgba(255,255,255,0.92)", padding: 5, cursor: "pointer", color: C.red, display: "flex" }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div onClick={() => setZoom(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, cursor: "zoom-out", padding: 16 }}>
          <img src={zoom} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Aba Lançamentos
// =====================================================================
const EXPENSE_STATUS: Record<string, { text: string; bg: string; fg: string }> = {
  pending: { text: "Pendente", bg: C.amberBg, fg: C.amber },
  paid: { text: "Pago", bg: C.greenBg, fg: C.green },
  approved: { text: "Aprovado", bg: C.greenBg, fg: C.green },
  rejected: { text: "Recusado", bg: "#F1F5F9", fg: C.muted },
};

function ExpensesTab({ v }: { v: VehicleFull }) {
  const load = useCallback(() => dv.listExpenses(v.id), [v.id]);
  const { data, setData, error, loading } = useTabData(load);
  const action = useAction();
  const [showForm, setShowForm] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Alert>{error}</Alert>;
  const d = data!;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div><Btn variant="success" onClick={() => setShowForm(true)}>Incluir <Plus size={15} /></Btn></div>
      {action.error && <Alert>{action.error}</Alert>}
      {showForm && <ExpenseForm v={v} onCancel={() => setShowForm(false)} onSaved={(r) => { setData(r); setShowForm(false); }} />}

      <div>
        <SectionTitle>Orçamentos</SectionTitle>
        <Table head={["Data", "Solicitante", "Descrição", "Fornecedor", "Valor", "Situação", ""]} empty="Nenhum orçamento.">
          {d.budgets.map((b) => (
            <tr key={b.id}>
              <td style={td}>{dateBR(b.date)}</td>
              <td style={td}>{b.requester ?? b.createdByName ?? "—"}</td>
              <td style={td}>{b.description}</td>
              <td style={td}>{b.supplier ?? "—"}</td>
              <td style={{ ...td, fontWeight: 500 }}>{money(b.amount)}</td>
              <td style={td}><Badge bg={EXPENSE_STATUS[b.status].bg} fg={EXPENSE_STATUS[b.status].fg}>{EXPENSE_STATUS[b.status].text}</Badge></td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                {b.status === "pending" && <>
                  <Btn small variant="success" disabled={!!action.busy} onClick={() => action.run(`ap-${b.id}`, async () => setData(await dv.approveBudget(v.id, b.id)))}><Check size={13} /> Aprovar</Btn>{" "}
                  <Btn small variant="soft" disabled={!!action.busy} onClick={() => action.run(`rj-${b.id}`, async () => setData(await dv.updateExpense(v.id, b.id, { status: "rejected" })))}>Recusar</Btn>
                </>}
                <IconBtn title="Excluir" color={C.red} onClick={() => {
                  if (window.confirm("Excluir este orçamento?")) action.run(`del-${b.id}`, async () => setData(await dv.deleteExpense(v.id, b.id)));
                }}><Trash2 size={16} /></IconBtn>
              </td>
            </tr>
          ))}
        </Table>
        <p style={{ fontSize: 12, color: C.light, margin: "8px 0 0" }}>Ao aprovar, o orçamento vira uma despesa do veículo e entra no Financeiro.</p>
      </div>

      <div>
        <SectionTitle>Lançamentos</SectionTitle>
        <Table head={["Data", "Usuário", "Tipo", "Fornecedor", "Descrição", "Soma ao custo", "Status", "Valor", ""]} empty="Nenhum lançamento.">
          {d.entries.map((e) => (
            <tr key={e.id}>
              <td style={td}>{dateBR(e.date)}</td>
              <td style={td}>{e.createdByName ?? "—"}</td>
              <td style={td}>{e.kind === "revenue" ? "Receita" : "Despesa"}</td>
              <td style={td}>{e.supplier ?? "—"}</td>
              <td style={td}>{e.description}</td>
              <td style={td}>{e.kind === "expense" ? (e.addToCost ? "Sim" : "Não") : "—"}</td>
              <td style={td}>
                <button title="Clique para trocar" onClick={() => action.run(`st-${e.id}`, async () =>
                  setData(await dv.updateExpense(v.id, e.id, { status: e.status === "paid" ? "pending" : "paid" })))}
                  style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer" }}>
                  <Badge bg={EXPENSE_STATUS[e.status].bg} fg={EXPENSE_STATUS[e.status].fg}>{EXPENSE_STATUS[e.status].text}</Badge>
                </button>
              </td>
              <td style={{ ...td, fontWeight: 600, color: e.kind === "revenue" ? C.green : C.red }}>
                {e.kind === "revenue" ? "" : "- "}{money(e.amount)}
              </td>
              <td style={td}>
                <IconBtn title="Excluir" color={C.red} onClick={() => {
                  if (window.confirm("Excluir este lançamento? Ele também sai do Financeiro.")) action.run(`del-${e.id}`, async () => setData(await dv.deleteExpense(v.id, e.id)));
                }}><Trash2 size={16} /></IconBtn>
              </td>
            </tr>
          ))}
        </Table>
      </div>

      <div style={{ background: C.stripe, borderRadius: 10, padding: "6px 18px" }}>
        {([
          ["Total de despesas", -d.totals.expenses, C.red],
          ["Adicionado ao custo do veículo", d.totals.addedToCost, C.text],
          ["Total de receitas", d.totals.revenues, C.green],
          ["Saldo", d.totals.balance, d.totals.balance < 0 ? C.red : C.green],
        ] as const).map(([label, value, color]) => (
          <div key={label} style={{ display: "flex", justifyContent: "flex-end", alignItems: "baseline", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, color: C.muted }}>{label}:</span>
            <span style={{ fontSize: 20, fontWeight: 600, color, minWidth: 140, textAlign: "right" }}>{money(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpenseForm({ v, onCancel, onSaved }: { v: VehicleFull; onCancel: () => void; onSaved: (r: dv.ExpensesResponse) => void }) {
  const [f, setF] = useState({ kind: "expense" as dv.ExpenseKind, date: today(), description: "", supplier: "", amount: "", status: "pending" as "pending" | "paid", addToCost: true });
  const action = useAction();

  const save = () => action.run("save", async () => {
    const amount = parseBRL(f.amount);
    if (!f.description.trim()) throw new Error("Informe a descrição.");
    if (Number.isNaN(amount) || amount <= 0) throw new Error("Valor inválido. Ex: 350 ou 1.250,00");
    onSaved(await dv.createExpense(v.id, {
      kind: f.kind, date: f.date, description: f.description, amount,
      supplier: f.supplier || undefined,
      status: f.kind === "budget" ? undefined : f.status,
      addToCost: f.kind === "expense" ? f.addToCost : undefined,
    }));
  });

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, background: C.stripe }}>
      {action.error && <Alert>{action.error}</Alert>}
      <Grid cols={3}>
        <Field label="Tipo">
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as dv.ExpenseKind })} style={inputStyle}>
            <option value="expense">Despesa (gasto com o veículo)</option>
            <option value="revenue">Receita (dinheiro que entrou)</option>
            <option value="budget">Orçamento (ainda não aprovado)</option>
          </select>
        </Field>
        <Field label="Data"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} style={inputStyle} /></Field>
        <Field label="Valor"><input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="Ex: 350,00" style={inputStyle} /></Field>
        <Field label="Descrição" span><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Ex: Troca de pneus, polimento, revisão" style={inputStyle} /></Field>
        <Field label="Fornecedor"><input value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} placeholder="Ex: Oficina do João" style={inputStyle} /></Field>
        {f.kind !== "budget" && (
          <Field label="Situação">
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as "pending" | "paid" })} style={inputStyle}>
              <option value="pending">Pendente</option><option value="paid">Pago</option>
            </select>
          </Field>
        )}
      </Grid>
      {f.kind === "expense" && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: C.text, cursor: "pointer" }}>
          <input type="checkbox" checked={f.addToCost} onChange={(e) => setF({ ...f, addToCost: e.target.checked })} />
          Somar ao custo do veículo (entra no cálculo do lucro)
        </label>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <Btn variant="outline" onClick={onCancel}>Cancelar</Btn>
        <Btn onClick={save} disabled={action.busy === "save"}>{action.busy === "save" ? "Salvando..." : "Salvar"}</Btn>
      </div>
    </div>
  );
}

// =====================================================================
// Aba Resumo
// =====================================================================
function SummaryTab({ v }: { v: VehicleFull }) {
  const load = useCallback(() => dv.getSummary(v.id), [v.id]);
  const { data: s, error, loading } = useTabData(load);
  if (loading && !s) return <Loading />;
  if (error && !s) return <Alert>{error}</Alert>;

  const cards: { label: string; value: string; color?: string; hint?: string }[] = [
    { label: "Valor de compra", value: money(s!.purchase), color: C.muted },
    { label: "Gastos somados ao custo", value: money(s!.addedToCost), color: C.muted, hint: "Lançamentos marcados como 'soma ao custo'" },
    { label: "Custo total", value: money(s!.totalCost) },
    { label: s!.sold ? "Vendido por" : "Preço de venda", value: money(s!.price) },
    { label: s!.sold ? "Lucro" : "Lucro previsto", value: money(s!.profit), color: s!.profit >= 0 ? C.green : C.red, hint: s!.revenues ? `Inclui ${money(s!.revenues)} de receitas` : undefined },
    { label: "Margem", value: `${s!.margin.toFixed(1).replace(".", ",")}%`, color: s!.margin < 15 ? C.red : C.green },
    { label: "Dias em estoque", value: `${s!.daysInStock} ${s!.daysInStock === 1 ? "dia" : "dias"}`, color: s!.daysInStock > 60 ? C.red : C.text },
    { label: "Pendências abertas", value: String(s!.pendingCount), color: s!.pendingCount ? C.amber : C.text },
    { label: "Fotos / arquivos", value: `${s!.photosCount} / ${s!.filesCount}` },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
      {cards.map((c) => (
        <div key={c.label} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, color: C.muted }}>{c.label}</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: c.color ?? C.text, marginTop: 6 }}>{c.value}</div>
          {c.hint && <div style={{ fontSize: 11, color: C.light, marginTop: 4 }}>{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// Aba Web
// =====================================================================
function WebTab({ v }: { v: VehicleFull }) {
  const load = useCallback(() => dv.getWeb(v.id), [v.id]);
  const { data, setData, error, loading } = useTabData(load);
  const action = useAction();
  const [f, setF] = useState<null | { title: string; description: string; webPrice: string; promoPrice: string; youtubeUrl: string; featured: boolean; published: boolean }>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    const w = data.web;
    setF({
      title: w?.title ?? data.defaultTitle, description: w?.description ?? v.description ?? "",
      webPrice: moneyInput(w?.webPrice), promoPrice: moneyInput(w?.promoPrice),
      youtubeUrl: w?.youtubeUrl ?? "", featured: w?.featured ?? false, published: w?.published ?? true,
    });
  }, [data, v.description]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Alert>{error}</Alert>;
  if (!f) return null;

  const save = () => action.run("save", async () => {
    const webPrice = f.webPrice.trim() ? parseBRL(f.webPrice) : null;
    const promoPrice = f.promoPrice.trim() ? parseBRL(f.promoPrice) : null;
    if (Number.isNaN(webPrice) || Number.isNaN(promoPrice)) throw new Error("Preço inválido. Ex: 28.500,00");
    setData(await dv.saveWeb(v.id, { ...f, webPrice, promoPrice }));
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  });
  const fipe = data!.fipe;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <SectionTitle>Publicação na web <span style={{ fontSize: 13, fontWeight: 400, color: C.muted }}>/ informações para o anúncio na internet</span></SectionTitle>
        <InfoRows rows={[
          ["Tabela FIPE", fipe?.value ? `${money(fipe.value)}${fipe.reference ? ` (${fipe.reference})` : ""}` : "Faça a consulta pela placa no cadastro para ver o valor"],
          ["Modelo FIPE", fipe?.label ? `${fipe.label}${fipe.code ? ` (${fipe.code})` : ""}` : ""],
          ["Preço de venda (loja)", money(v.price)],
          ["Quilometragem", `${Number(v.km ?? 0).toLocaleString("pt-BR")} km`],
        ]} />
      </div>

      <div>
        <SectionTitle>Dados do anúncio</SectionTitle>
        {action.error && <Alert>{action.error}</Alert>}
        {saved && <Alert kind="success">Anúncio salvo.</Alert>}
        <Grid>
          <Field label="Título do anúncio" span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={inputStyle} /></Field>
          <Field label="Preço web (deixe vazio para usar o preço da loja)"><input value={f.webPrice} onChange={(e) => setF({ ...f, webPrice: e.target.value })} placeholder={money(v.price)} style={inputStyle} /></Field>
          <Field label="Preço promocional"><input value={f.promoPrice} onChange={(e) => setF({ ...f, promoPrice: e.target.value })} placeholder="Opcional" style={inputStyle} /></Field>
          <Field label="Vídeo do YouTube" span><input value={f.youtubeUrl} onChange={(e) => setF({ ...f, youtubeUrl: e.target.value })} placeholder="https://youtube.com/..." style={inputStyle} /></Field>
          <Field label="Detalhes do veículo (aparece no anúncio)" span>
            <textarea rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
        </Grid>
        <div style={{ display: "flex", gap: 20, marginTop: 12, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Mostrar no site
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} /> Destaque
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <Btn onClick={save} disabled={action.busy === "save"}>{action.busy === "save" ? "Salvando..." : "Salvar anúncio"}</Btn>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Aba Entrada
// =====================================================================
function EntryTab({ v, onChanged }: { v: VehicleFull; onChanged: () => void }) {
  const load = useCallback(() => dv.getAcquisition(v.id), [v.id]);
  const { data, setData, error, loading } = useTabData(load);
  const [editing, setEditing] = useState(false);
  const action = useAction();
  const blank = useCallback((a: dv.Acquisition | null) => ({
    entryDate: toInputDate(a?.entryDate ?? v.createdAt), ownershipType: (a?.ownershipType ?? "own") as "own" | "consigned",
    supplierName: a?.supplierName ?? "", supplierDocument: a?.supplierDocument ?? "", supplierPhone: a?.supplierPhone ?? "",
    documentOwnerName: a?.documentOwnerName ?? "", documentOwnerDocument: a?.documentOwnerDocument ?? "",
    purchaseValue: moneyInput(a ? a.purchaseValue : v.cost), payoffValue: moneyInput(a?.payoffValue), debtsValue: moneyInput(a?.debtsValue),
    notes: a?.notes ?? "", intermediary: a?.intermediary ?? "",
    entryChannel: (a?.entryChannel ?? (a?.ownershipType === "consigned" ? "consignados" : "")) as dv.EntryChannel | "",
    debts: (a?.debts?.length ? a.debts.map((d) => ({ date: d.date ?? "", description: d.description, amount: moneyInput(d.amount) }))
      : a && Number(a.debtsValue) ? [{ date: "", description: "Débitos", amount: moneyInput(a.debtsValue) }] : []) as { date: string; description: string; amount: string }[],
  }), [v.createdAt, v.cost]);
  const [f, setF] = useState(() => blank(null));

  useEffect(() => { if (!loading) { setF(blank(data)); if (!data) setEditing(true); } }, [data, loading, blank]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <Alert>{error}</Alert>;

  const n = (s: string) => (s.trim() ? parseBRL(s) : 0);
  const debtsSum = f.debts.reduce((s2, d) => s2 + (n(d.amount) || 0), 0);
  const net = (n(f.purchaseValue) || 0) - (n(f.payoffValue) || 0) - debtsSum;
  const setDebt = (i: number, patch: Partial<{ date: string; description: string; amount: string }>) =>
    setF({ ...f, debts: f.debts.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = () => action.run("save", async () => {
    const values = { purchaseValue: n(f.purchaseValue), payoffValue: n(f.payoffValue) };
    if (Object.values(values).some((x) => Number.isNaN(x))) throw new Error("Algum valor está inválido. Ex: 30.000,00");
    const debts = f.debts.filter((d) => d.description.trim() || d.amount.trim()).map((d) => {
      if (!d.description.trim()) throw new Error("Preencha a descrição de todos os débitos.");
      const amount = n(d.amount);
      if (Number.isNaN(amount) || amount < 0) throw new Error(`Valor inválido no débito "${d.description}".`);
      return { date: d.date || null, description: d.description.trim(), amount };
    });
    const { debtsValue: _old, entryChannel, ...rest } = f;
    void _old;
    setData(await dv.saveAcquisition(v.id, {
      ...rest, ...values, debts,
      entryChannel: entryChannel || undefined,
      ownershipType: entryChannel ? (entryChannel === "consignados" ? "consigned" : "own") : f.ownershipType,
    }));
    setEditing(false);
    onChanged();
  });

  if (!editing && data) {
    const a = data;
    const netValue = Number(a.purchaseValue) - Number(a.payoffValue) - Number(a.debtsValue);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <SectionTitle action={<Btn variant="outline" onClick={() => setEditing(true)}><Pencil size={15} /> Editar entrada</Btn>}>Dados do fornecedor</SectionTitle>
        <div style={{ marginTop: -12 }}>
          <InfoRows rows={[["Data de entrada", dateBR(a.entryDate)], ["Nome", a.supplierName], ["CPF/CNPJ", formatDoc(a.supplierDocument)], ["Telefone", a.supplierPhone],
            ["Intermediário", a.intermediary ?? ""], ["Canal da entrada", dv.entryChannelLabel(a.entryChannel)]]} />
        </div>
        <div><Label>Documento em nome de</Label><InfoRows rows={[["Nome", a.documentOwnerName], ["CPF/CNPJ", formatDoc(a.documentOwnerDocument)]]} /></div>
        <div><Label>Organização</Label><InfoRows rows={[["Chave reserva", yesNo(v.hasSpareKey)], ["Manual", yesNo(v.hasManual)]]} /></div>
        <div>
          <Label>Dados da compra</Label>
          <InfoRows rows={[
            ["Tipo do veículo", a.ownershipType === "consigned" ? "Consignado" : "Próprio"],
            ["Valor de entrada", money(a.purchaseValue)],
            ["Valor de quitação", money(a.payoffValue)],
            ["Valor de débitos", money(a.debtsValue)],
            ...(a.debts?.length ? a.debts.map((d) => [`  · ${d.description}${d.date ? ` (${dateBR(d.date)})` : ""}`, money(d.amount)] as [string, string]) : []),
            ["Valor líquido (pago ao fornecedor)", money(netValue)],
            ["Valor de venda", money(v.price)],
            ["Observação da entrada", a.notes ? <span style={{ whiteSpace: "pre-wrap" }}>{a.notes}</span> : ""],
          ]} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {!data && <Alert kind="info">Ainda não há dados de entrada para este veículo. Preencha abaixo.</Alert>}
      {action.error && <Alert>{action.error}</Alert>}
      <div>
        <Label>Dados do fornecedor</Label>
        <Grid cols={3}>
          <Field label="Data de entrada"><input type="date" value={f.entryDate} onChange={set("entryDate")} style={inputStyle} /></Field>
          <Field label="Nome do fornecedor"><input value={f.supplierName} onChange={set("supplierName")} style={inputStyle} /></Field>
          <Field label="CPF/CNPJ"><input value={f.supplierDocument} onChange={set("supplierDocument")} style={inputStyle} /></Field>
          <Field label="Telefone"><input value={f.supplierPhone} onChange={set("supplierPhone")} style={inputStyle} /></Field>
          <Field label="Intermediário"><input value={f.intermediary} onChange={set("intermediary")} style={inputStyle} /></Field>
          <Field label="Canal da entrada">
            <select value={f.entryChannel} onChange={(e) => setF({ ...f, entryChannel: e.target.value as dv.EntryChannel | "" })} style={inputStyle}>
              <option value="">Selecione</option>
              {dv.ENTRY_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
        </Grid>
      </div>
      <div>
        <Label>Documento em nome de</Label>
        <Grid>
          <Field label="Nome (como está no CRLV)"><input value={f.documentOwnerName} onChange={set("documentOwnerName")} style={inputStyle} /></Field>
          <Field label="CPF/CNPJ"><input value={f.documentOwnerDocument} onChange={set("documentOwnerDocument")} style={inputStyle} /></Field>
        </Grid>
      </div>
      <div>
        <Label>Dados da compra</Label>
        <Grid cols={3}>
          <Field label="Valor de entrada"><input value={f.purchaseValue} onChange={set("purchaseValue")} placeholder="Ex: 30.000,00" style={inputStyle} /></Field>
          <Field label="Valor de quitação (financiamento)"><input value={f.payoffValue} onChange={set("payoffValue")} placeholder="0,00" style={inputStyle} /></Field>
          <Field label="Valor de débitos (soma da lista)"><input value={money(debtsSum)} readOnly style={{ ...inputStyle, background: C.stripe }} /></Field>
          <Field label="Valor líquido (pago ao fornecedor)"><input value={Number.isNaN(net) ? "—" : money(net)} readOnly style={{ ...inputStyle, background: C.stripe }} /></Field>
        </Grid>
        <div style={{ marginTop: 14 }}>
          <Label>Débitos</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {f.debts.map((d, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 130px 32px", gap: 8, alignItems: "center" }}>
                <input type="date" value={d.date} onChange={(e) => setDebt(i, { date: e.target.value })} style={inputStyle} />
                <input placeholder="Descrição (IPVA, multa...)" value={d.description} onChange={(e) => setDebt(i, { description: e.target.value })} style={inputStyle} />
                <input placeholder="0,00" value={d.amount} onChange={(e) => setDebt(i, { amount: e.target.value })} style={inputStyle} />
                <button type="button" title="Remover" onClick={() => setF({ ...f, debts: f.debts.filter((_, j) => j !== i) })}
                  style={{ border: "none", background: "none", color: "#DC2626", cursor: "pointer" }}><Trash2 size={16} /></button>
              </div>
            ))}
            <div><Btn variant="outline" onClick={() => setF({ ...f, debts: [...f.debts, { date: today(), description: "", amount: "" }] })}><Plus size={14} /> Adicionar débito</Btn></div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <Field label="Observação da entrada"><textarea rows={3} value={f.notes} onChange={set("notes")} style={{ ...inputStyle, resize: "vertical" }} /></Field>
        </div>
        <p style={{ fontSize: 12, color: C.light, margin: "10px 0 0" }}>
          {f.entryChannel ? f.entryChannel !== "consignados" : f.ownershipType === "own"
            ? "Ao salvar, o valor de compra vira o custo do veículo e entra no Financeiro como \"Compra\"."
            : "Veículo consignado não gera lançamento de compra no Financeiro."}
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {data && <Btn variant="outline" onClick={() => { setF(blank(data)); setEditing(false); }}>Cancelar</Btn>}
        <Btn onClick={save} disabled={action.busy === "save"}>{action.busy === "save" ? "Salvando..." : "Salvar entrada"}</Btn>
      </div>
    </div>
  );
}

// =====================================================================
// Aba Pendências
// =====================================================================
function PendenciesTab({ v }: { v: VehicleFull }) {
  const load = useCallback(() => dv.listPendencies(v.id), [v.id]);
  const { data, setData, error, loading } = useTabData(load);
  const action = useAction();
  const [text, setText] = useState("");

  if (loading && !data) return <Loading />;
  if (error && !data) return <Alert>{error}</Alert>;
  const list = data!;
  const add = () => {
    if (!text.trim()) return;
    action.run("add", async () => { setData(await dv.createPendency(v.id, text)); setText(""); });
  };

  return (
    <div style={{ maxWidth: 720 }}>
      {action.error && <Alert>{action.error}</Alert>}
      {list.length === 0 && <p style={{ fontSize: 14, color: C.muted, marginTop: 0 }}>Nenhuma pendência para esse veículo.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {list.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: p.done ? C.stripe : "#fff" }}>
            <input type="checkbox" checked={p.done} style={{ width: 16, height: 16, cursor: "pointer" }}
              onChange={() => action.run(`t-${p.id}`, async () => setData(await dv.updatePendency(v.id, p.id, { done: !p.done })))} />
            <span style={{ flex: 1, fontSize: 14, color: p.done ? C.light : C.text, textDecoration: p.done ? "line-through" : "none" }}>{p.description}</span>
            <span style={{ fontSize: 12, color: C.light }}>{p.done && p.doneAt ? `Resolvida em ${dateBR(p.doneAt)}` : dateBR(p.createdAt)}</span>
            <IconBtn title="Excluir" color={C.red} onClick={() => action.run(`d-${p.id}`, async () => setData(await dv.deletePendency(v.id, p.id)))}><Trash2 size={15} /></IconBtn>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Ex: Trocar óleo, buscar 2ª via do CRLV, consertar retrovisor..." style={{ ...inputStyle, flex: 1 }} />
        <Btn onClick={add} disabled={action.busy === "add" || !text.trim()}><Plus size={15} /> Adicionar</Btn>
      </div>
    </div>
  );
}

// =====================================================================
// Aba Financeiro
// =====================================================================
function FinancialTab({ v }: { v: VehicleFull }) {
  const load = useCallback(() => dv.listFinancial(v.id), [v.id]);
  const { data, error, loading } = useTabData(load);
  if (loading && !data) return <Loading />;
  if (error && !data) return <Alert>{error}</Alert>;

  const kindLabel = (t: dv.FinancialItem) =>
    /compra/i.test(t.category) ? "Compra" : t.saleId ? "Venda" : t.type === "revenue" ? "Receita" : "Despesa";

  return (
    <div>
      <Table head={["Tipo", "Data", "Categoria", "Descrição", "Status", "Valor"]} empty="Nenhum lançamento financeiro para este veículo.">
        {data!.map((t) => (
          <tr key={t.id}>
            <td style={td}>{kindLabel(t)}</td>
            <td style={td}>{dateBR(t.date)}</td>
            <td style={td}>{t.category}</td>
            <td style={{ ...td, maxWidth: 420 }}>{t.description ?? "—"}</td>
            <td style={td}>{t.paid ? <Badge bg={C.greenBg} fg={C.green}>Pago</Badge> : <Badge bg={C.amberBg} fg={C.amber}>Pendente</Badge>}</td>
            <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap", color: t.type === "revenue" ? C.green : C.red }}>
              {t.type === "revenue" ? "" : "- "}{money(t.amount)}
            </td>
          </tr>
        ))}
      </Table>
      <p style={{ fontSize: 12, color: C.light, margin: "8px 0 0" }}>
        Aqui aparecem a compra (aba Entrada), os lançamentos do veículo e a venda. Tudo também está no módulo Financeiro.
      </p>
    </div>
  );
}
