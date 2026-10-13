import { useEffect, useState } from "react";
import { X, Pencil, ImageOff, Car, Bike, Truck, Package } from "lucide-react";

const TYPE_ICON = { car: Car, moto: Bike, truck: Truck, other: Package };

// Formato do veículo como vem do backend (GET /vehicles)
export interface VehicleDetails {
  id: string;
  type: "car" | "moto" | "truck" | "other";
  category?: string | null;
  status: "available" | "reserved" | "sold";
  brand: string;
  model: string;
  version?: string | null;
  year: number;
  manufactureYear?: number | null;
  km: number;
  color?: string | null;
  plate?: string | null;
  chassis?: string | null;
  renavam?: string | null;
  engineCc?: number | null;
  motorPower?: number | null;
  fuel?: string | null;
  transmission?: string | null;
  doors?: number | null;
  origin?: string | null;
  ownerCount?: number | null;
  ipvaPaid?: boolean | null;
  acceptsTrade?: boolean | null;
  hasSpareKey?: boolean | null;
  hasManual?: boolean | null;
  cost: number | string;   // o Prisma manda Decimal como texto
  price: number | string;
  description?: string | null;
  optionals?: string[];
  photos?: { id: string; url: string; order: number }[];
  createdAt: string;
  updatedAt?: string;
}

interface Props {
  vehicle: VehicleDetails | null;
  onClose: () => void;
  onEdit?: (vehicle: VehicleDetails) => void;
}

// ---------- Traduções e formatação ----------
const TYPE_LABEL: Record<string, string> = { car: "Carro", moto: "Moto", truck: "Utilitário", other: "Outros" };
const STATUS_LABEL: Record<string, { text: string; bg: string; fg: string }> = {
  available: { text: "Disponível", bg: "#E8F5E9", fg: "#2E7D32" },
  reserved: { text: "Reservado", bg: "#F3E8FF", fg: "#7C3AED" },
  sold: { text: "Vendido", bg: "#F1F5F9", fg: "#64748B" },
};
const TRANSMISSION_LABEL: Record<string, string> = {
  manual: "Manual", automatic: "Automático", automatico: "Automático",
  cvt: "CVT", semi: "Semi-automático", "semi-automatic": "Semi-automático",
};

const money = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
const yesNo = (v?: boolean | null) => (v === true ? "Sim" : v === false ? "Não" : "");
const daysSince = (iso: string) =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

// ---------- Componente ----------
type Tab = "vehicle" | "media" | "summary";

export function VehicleDetailsModal({ vehicle, onClose, onEdit }: Props) {
  const [tab, setTab] = useState<Tab>("vehicle");

  // Sempre abre na aba "Veículo" e fecha com Esc
  useEffect(() => {
    if (!vehicle) return;
    setTab("vehicle");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vehicle, onClose]);

  if (!vehicle) return null;
  const v = vehicle;
  const status = STATUS_LABEL[v.status] ?? STATUS_LABEL.available;

  const tabs: { id: Tab; label: string }[] = [
    { id: "vehicle", label: "Veículo" },
    { id: "media", label: `Mídias${v.photos?.length ? ` (${v.photos.length})` : ""}` },
    { id: "summary", label: "Resumo" },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, width: "100%", maxWidth: 980,
          maxHeight: "92vh", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 50px rgba(0,0,0,0.25)", overflow: "hidden",
        }}
      >
        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px 24px", borderBottom: "1px solid #E5E7EB" }}>
          <div style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
            {v.photos?.[0] ? (
              <img src={v.photos[0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F6F9", color: "#CBD5E1" }}>
                {(() => { const Icon = TYPE_ICON[v.type] ?? Car; return <Icon size={26} />; })()}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "#0F172A" }}>
              {v.brand} {v.model} {v.version ?? ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, color: "#64748B", fontSize: 14, flexWrap: "wrap" }}>
              <span>{v.manufactureYear ? `${v.manufactureYear}/${v.year}` : v.year}</span>
              {v.plate && <span>· {v.plate}</span>}
              <span style={{ background: status.bg, color: status.fg, padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                {status.text}
              </span>
            </div>
          </div>
          {onEdit && (
            <button
              onClick={() => onEdit(v)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "9px 14px",
                borderRadius: 8, border: "1px solid #CBD5E1", background: "#fff",
                color: "#0F172A", fontWeight: 500, cursor: "pointer",
              }}
            >
              <Pencil size={15} /> Editar
            </button>
          )}
          <button onClick={onClose} aria-label="Fechar" style={{ border: 0, background: "transparent", cursor: "pointer", color: "#64748B", padding: 6 }}>
            <X size={22} />
          </button>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 4, padding: "0 24px", borderBottom: "1px solid #E5E7EB", overflowX: "auto" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "14px 16px", border: 0, background: "transparent", cursor: "pointer",
                fontSize: 14, fontWeight: 500, whiteSpace: "nowrap",
                color: tab === t.id ? "#185FA5" : "#64748B",
                borderBottom: `2px solid ${tab === t.id ? "#185FA5" : "transparent"}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div style={{ overflowY: "auto", padding: 24, flex: 1 }}>
          {tab === "vehicle" && <VehicleTab v={v} />}
          {tab === "media" && <MediaTab v={v} />}
          {tab === "summary" && <SummaryTab v={v} />}
        </div>

        {/* Rodapé */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #E5E7EB", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "9px 20px", borderRadius: 8, border: 0, background: "#F1F5F9", color: "#0F172A", fontWeight: 500, cursor: "pointer" }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Aba Veículo ----------
function VehicleTab({ v }: { v: VehicleDetails }) {
  const isMotorized = v.type !== "other" || !!v.engineCc;

  const sections: { title: string; rows: [string, React.ReactNode][] }[] = [
    {
      title: "Cadastro",
      rows: [
        ["Data cadastro", date(v.createdAt)],
        ["Última alteração", date(v.updatedAt)],
        ["Tipo", v.type === "other" && v.category ? `Outros · ${v.category}` : TYPE_LABEL[v.type]],
        ["Status", STATUS_LABEL[v.status]?.text],
      ],
    },
    {
      title: "Identificação",
      rows: [
        ["Marca", v.brand],
        ["Modelo", v.model],
        ["Versão", v.version],
        ["Ano fabricação", v.manufactureYear],
        ["Ano modelo", v.year],
        ["Placa", v.plate],
        ["Chassi", v.chassis],
        ["Renavam", v.renavam],
      ],
    },
    {
      title: "Características",
      rows: [
        ["Cor", v.color],
        ["Quilometragem", `${Number(v.km ?? 0).toLocaleString("pt-BR")} km`],
        ["Combustível", v.fuel],
        ["Câmbio", v.transmission ? TRANSMISSION_LABEL[v.transmission.toLowerCase()] ?? v.transmission : null],
        ...(isMotorized ? [["Cilindrada", v.engineCc ? `${v.engineCc} cc` : null] as [string, React.ReactNode]] : []),
        ...(v.motorPower ? [["Potência do motor", `${v.motorPower} W`] as [string, React.ReactNode]] : []),
        ...(v.type === "car" || v.type === "truck" ? [["Portas", v.doors] as [string, React.ReactNode]] : []),
        ["Procedência", v.origin],
      ],
    },
    {
      title: "Histórico e documentação",
      rows: [
        ["Nº de donos", v.ownerCount],
        ["IPVA pago", yesNo(v.ipvaPaid)],
        ["Chave reserva", yesNo(v.hasSpareKey)],
        ["Manual", yesNo(v.hasManual)],
        ["Aceita troca", yesNo(v.acceptsTrade)],
      ],
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {sections.map((s) => (
        <div key={s.title}>
          <SectionTitle>{s.title}</SectionTitle>
          <div style={{ border: "1px solid #E5E7EB", borderRadius: 10, overflow: "hidden" }}>
            {s.rows.map(([label, value], i) => (
              <div
                key={label}
                style={{
                  display: "grid", gridTemplateColumns: "minmax(140px, 220px) 1fr", gap: 16,
                  padding: "10px 16px", fontSize: 14,
                  background: i % 2 === 0 ? "#F8FAFC" : "#fff",
                }}
              >
                <span style={{ color: "#64748B" }}>{label}</span>
                <span style={{ color: value ? "#0F172A" : "#CBD5E1", wordBreak: "break-word" }}>
                  {value === 0 ? "0" : value || "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {!!v.optionals?.length && (
        <div>
          <SectionTitle>Opcionais</SectionTitle>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {v.optionals.map((o) => (
              <span key={o} style={{ background: "#EBF2FA", color: "#185FA5", padding: "5px 12px", borderRadius: 999, fontSize: 13 }}>
                {o}
              </span>
            ))}
          </div>
        </div>
      )}

      {v.description && (
        <div>
          <SectionTitle>Observações</SectionTitle>
          <p style={{ margin: 0, fontSize: 14, color: "#334155", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{v.description}</p>
        </div>
      )}
    </div>
  );
}

// ---------- Aba Mídias ----------
function MediaTab({ v }: { v: VehicleDetails }) {
  const [open, setOpen] = useState<string | null>(null);
  const photos = [...(v.photos ?? [])].sort((a, b) => a.order - b.order);

  if (!photos.length) {
    return (
      <div style={{ textAlign: "center", padding: "48px 16px", color: "#94A3B8" }}>
        <ImageOff size={36} />
        <p style={{ margin: "12px 0 0", fontSize: 14 }}>Este veículo ainda não tem fotos.</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        {photos.map((p, i) => (
          <button
            key={p.id}
            onClick={() => setOpen(p.url)}
            style={{ position: "relative", padding: 0, border: 0, borderRadius: 10, overflow: "hidden", cursor: "zoom-in", aspectRatio: "4 / 3", background: "#F1F5F9" }}
          >
            <img src={p.url} alt={`Foto ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {i === 0 && (
              <span style={{ position: "absolute", top: 8, left: 8, background: "#185FA5", color: "#fff", fontSize: 11, padding: "2px 8px", borderRadius: 999 }}>
                Capa
              </span>
            )}
          </button>
        ))}
      </div>
      {open && (
        <div
          onClick={() => setOpen(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, cursor: "zoom-out", padding: 16 }}
        >
          <img src={open} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}

// ---------- Aba Resumo ----------
function SummaryTab({ v }: { v: VehicleDetails }) {
  const cost = Number(v.cost ?? 0);
  const price = Number(v.price ?? 0);
  const profit = price - cost;
  const margin = cost > 0 ? (profit / cost) * 100 : 0;
  const days = daysSince(v.createdAt);

  const cards = [
    { label: "Preço de custo", value: money(cost), color: "#64748B" },
    { label: "Preço de venda", value: money(price), color: "#0F172A" },
    { label: "Lucro previsto", value: money(profit), color: profit >= 0 ? "#2E7D32" : "#DC2626" },
    { label: "Margem", value: `${margin.toFixed(1).replace(".", ",")}%`, color: margin < 15 ? "#DC2626" : "#2E7D32" },
    { label: "Dias em estoque", value: `${days} ${days === 1 ? "dia" : "dias"}`, color: days > 60 ? "#DC2626" : "#0F172A" },
    { label: "Status", value: STATUS_LABEL[v.status]?.text ?? v.status, color: "#0F172A" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
      {cards.map((c) => (
        <div key={c.label} style={{ border: "1px solid #E5E7EB", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 13, color: "#64748B" }}>{c.label}</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: c.color, marginTop: 6 }}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, color: "#94A3B8", textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </div>
  );
}