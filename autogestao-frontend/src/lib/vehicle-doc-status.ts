// Situação do veículo: licenciamento, multas, Renajud, recall e devolução
export type DocKey = "licensing" | "fines" | "renajud" | "recall" | "returned";
export type DocItemStatus = "ok" | "pending" | "unknown";
export interface DocItem { status: DocItemStatus; year?: number | null; amount?: number | null; note?: string | null }
export type DocStatus = Partial<Record<DocKey, DocItem>>;

export const DOC_ITEMS: { key: DocKey; label: string; ok: string; pending: string; help: string }[] = [
  { key: "licensing", label: "Licenciamento", ok: "Em dia", pending: "Atrasado", help: "Licenciamento anual (CRLV) pago?" },
  { key: "fines", label: "Multas", ok: "Sem multas", pending: "Com multas", help: "Multas em aberto no Detran" },
  { key: "renajud", label: "Renajud", ok: "Sem restrição", pending: "Com restrição", help: "Restrição judicial no Renajud" },
  { key: "recall", label: "Recall", ok: "Sem recall pendente", pending: "Recall pendente", help: "Chamado de recall do fabricante" },
  { key: "returned", label: "Devolução", ok: "Não é devolução", pending: "Veículo de devolução", help: "Veículo que voltou de um cliente (devolução/retomada)" },
];

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Texto curto para mostrar no painel do veículo */
export function docItemText(key: DocKey, item?: DocItem | null) {
  const def = DOC_ITEMS.find((d) => d.key === key)!;
  if (!item || item.status === "unknown") return "Não verificado";
  const base = item.status === "ok" ? def.ok : def.pending;
  const extra = [
    key === "licensing" && item.year ? `exercício ${item.year}` : null,
    key === "fines" && item.status === "pending" && item.amount ? brl(item.amount) : null,
    item.note || null,
  ].filter(Boolean);
  return extra.length ? `${base} · ${extra.join(" · ")}` : base;
}

/** Itens com problema (para avisos no estoque) */
export function docProblems(doc?: DocStatus | null) {
  if (!doc) return [];
  return DOC_ITEMS.filter((d) => doc[d.key]?.status === "pending").map((d) => d.pending);
}
