interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const statusConfig: Record<string, { label: string; bg: string; color: string }> = {
  available:       { label: "Disponível",       bg: "#EAF3DE", color: "#27500A" },
  reserved:        { label: "Reservado",         bg: "#EDE9FE", color: "#5B21B6" },
  sold:            { label: "Vendido",           bg: "#F3F4F6", color: "#6B7280" },
  "0km":           { label: "0 km",             bg: "#EAF3DE", color: "#27500A" },
  used:            { label: "Seminovo",          bg: "#FEF3C7", color: "#92400E" },
  new_lead:        { label: "Novo",              bg: "#EBF2FA", color: "#185FA5" },
  negotiating:     { label: "Em negociação",     bg: "#FEF3C7", color: "#92400E" },
  proposal:        { label: "Proposta enviada",  bg: "#EDE9FE", color: "#5B21B6" },
  won:             { label: "Ganho",             bg: "#EAF3DE", color: "#27500A" },
  lost:            { label: "Perdido",           bg: "#FEE2E2", color: "#991B1B" },
};

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const cfg = statusConfig[status] ?? { label: status, bg: "#F3F4F6", color: "#6B7280" };
  return (
    <span
      style={{
        background: cfg.bg,
        color: cfg.color,
        fontSize: size === "sm" ? 11 : 12,
        fontWeight: 500,
        padding: size === "sm" ? "2px 8px" : "3px 10px",
        borderRadius: 99,
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {cfg.label}
    </span>
  );
}
