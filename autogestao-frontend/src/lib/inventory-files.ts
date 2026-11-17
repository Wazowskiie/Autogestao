// Estoque: relatório em PDF e planilha (exportar/importar).
// A planilha é CSV com ";" (abre direto no Excel em português) e serve também para importar.
import type * as api from "./api";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const today = () => new Date().toISOString().slice(0, 10);
const TYPE_LABEL: Record<string, string> = { car: "Carro", moto: "Moto", truck: "Utilitário", other: "Outro" };
const STATUS_LABEL: Record<string, string> = { available: "Disponível", reserved: "Reservado", sold: "Vendido" };
export const daysInStock = (createdAt: string) => Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------- Planilha ----------------
const COLUMNS = [
  "Tipo", "Marca", "Modelo", "Versão", "Ano fabricação", "Ano modelo", "Km", "Cor", "Placa",
  "Combustível", "Câmbio", "Custo", "Preço", "Status", "Filial", "Dias em estoque",
] as const;

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const num = (n: number) => String(n).replace(".", ",");

export function exportInventoryCsv(vehicles: api.Vehicle[], storeName: string) {
  const rows = vehicles.map((v) => [
    TYPE_LABEL[v.type] ?? v.type, v.brand, v.model, v.version, v.manufactureYear, v.year, v.km, v.color, v.plate,
    v.fuel, v.transmission, num(Number(v.cost)), num(Number(v.price)), STATUS_LABEL[v.status] ?? v.status, v.unit?.name, daysInStock(v.createdAt),
  ].map(cell).join(";"));
  // BOM no início: o Excel reconhece os acentos
  const csv = "﻿" + [COLUMNS.join(";"), ...rows].join("\r\n");
  const slug = storeName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "estoque";
  download(`${slug}-estoque-${today()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const sep = (text.split(/\r?\n/)[0].match(/;/g)?.length ?? 0) >= (text.split(/\r?\n/)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const money = (s: string) => {
  const t = s.replace(/[^\d,.-]/g, "");
  if (!t) return NaN;
  // "30.000,50" ou "30000,50" (padrão brasileiro) ou "30000.50"
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};
const TYPE_FROM: Record<string, api.VehicleType> = { carro: "car", car: "car", moto: "moto", motocicleta: "moto", utilitario: "truck", caminhao: "truck", truck: "truck", outro: "other", other: "other" };

export interface ImportRow { line: number; input?: api.VehicleInput; error?: string; warning?: string; label: string }

/** Lê a planilha e devolve o que será cadastrado (sem cadastrar ainda) */
export function readInventoryCsv(text: string, units: api.StoreUnit[], existingPlates: Set<string>): ImportRow[] {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length < 2) return [];
  const head = rows[0].map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.map(norm).includes(h));
  const idx = {
    type: col("Tipo"), brand: col("Marca"), model: col("Modelo"), version: col("Versão", "Versao"),
    manufactureYear: col("Ano fabricação", "Ano fabricacao", "Ano fab"), year: col("Ano modelo", "Ano"),
    km: col("Km", "Quilometragem"), color: col("Cor"), plate: col("Placa"), fuel: col("Combustível", "Combustivel"),
    transmission: col("Câmbio", "Cambio"), cost: col("Custo", "Preço de custo"), price: col("Preço", "Preco", "Preço de venda", "Valor"),
    unit: col("Filial", "Loja"),
  };
  const unitByName = new Map(units.map((u) => [norm(u.name), u.id]));
  const seen = new Set<string>();
  return rows.slice(1).map((r, i) => {
    const get = (k: keyof typeof idx) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
    const line = i + 2;
    const brand = get("brand"), model = get("model");
    const label = [brand, model, get("plate")].filter(Boolean).join(" ") || `Linha ${line}`;
    const year = Number(get("year").replace(/\D/g, "").slice(0, 4));
    const price = money(get("price")), cost = money(get("cost"));
    const plate = get("plate").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const type = TYPE_FROM[norm(get("type"))] ?? (norm(get("type")) ? undefined : "car");
    if (!brand || !model) return { line, label, error: "Falta marca ou modelo" };
    if (!type) return { line, label, error: `Tipo "${get("type")}" não reconhecido (use Carro, Moto, Utilitário ou Outro)` };
    if (!year || year < 1900) return { line, label, error: "Ano modelo inválido" };
    if (!Number.isFinite(price) || price <= 0) return { line, label, error: "Preço inválido" };
    if (plate && existingPlates.has(plate)) return { line, label, error: `Placa ${plate} já está no estoque` };
    if (plate && seen.has(plate)) return { line, label, error: `Placa ${plate} aparece mais de uma vez na planilha` };
    if (plate) seen.add(plate);
    const unitName = get("unit");
    const unitId = unitName ? unitByName.get(norm(unitName)) ?? null : null;
    const mf = Number(get("manufactureYear").replace(/\D/g, "").slice(0, 4));
    return {
      line, label,
      ...(unitName && !unitId ? { warning: `Filial "${unitName}" não cadastrada: entra sem filial` } : {}),
      input: {
        type, brand, model, version: get("version") || null, year, manufactureYear: mf >= 1900 ? mf : null,
        km: Number(get("km").replace(/\D/g, "")) || 0, color: get("color") || null, plate: plate || null,
        fuel: get("fuel") || null, transmission: get("transmission") || null,
        cost: Number.isFinite(cost) && cost >= 0 ? cost : 0, price,
        unitId,
      },
    };
  });
}

// ---------------- PDF ----------------
export async function exportInventoryPdf(opts: {
  storeName: string; vehicles: api.Vehicle[]; units: api.StoreUnit[];
  monthSales: { count: number; revenue: number } | null; filterLabel: string;
}) {
  // Carrega a biblioteca só quando alguém pede o PDF (não pesa na abertura da tela)
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF();
  const available = opts.vehicles.filter((v) => v.status === "available");
  const value = available.reduce((s, v) => s + Number(v.price), 0);
  const stalled = available.filter((v) => daysInStock(v.createdAt) > 30);

  doc.setFontSize(18); doc.text(opts.storeName, 105, 18, { align: "center" });
  doc.setFontSize(12); doc.text("Relatório de estoque", 105, 26, { align: "center" });
  doc.setFontSize(9); doc.setTextColor(110);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}${opts.filterLabel ? ` · ${opts.filterLabel}` : ""}`, 105, 32, { align: "center" });
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 40, theme: "grid", headStyles: { fillColor: [220, 38, 38] },
    head: [["Resumo", ""]],
    body: [
      ["Veículos disponíveis", String(available.length)],
      ["Valor do estoque (preço de venda)", brl(value)],
      ["Reservados", String(opts.vehicles.filter((v) => v.status === "reserved").length)],
      ["Parados há mais de 30 dias", String(stalled.length)],
      ...(opts.monthSales ? [["Vendas no mês", `${opts.monthSales.count} · ${brl(opts.monthSales.revenue)}`]] : []),
    ],
  });

  if (opts.units.length) {
    const noUnit = available.filter((v) => !v.unitId);
    autoTable(doc, {
      theme: "grid", headStyles: { fillColor: [30, 41, 59] },
      head: [["Filial", "Disponíveis", "Valor"]],
      body: [
        ...opts.units.map((u) => {
          const list = available.filter((v) => v.unitId === u.id);
          return [u.name, String(list.length), brl(list.reduce((s, v) => s + Number(v.price), 0))];
        }),
        ...(noUnit.length ? [["Sem filial", String(noUnit.length), brl(noUnit.reduce((s, v) => s + Number(v.price), 0))]] : []),
      ],
    });
  }

  autoTable(doc, {
    theme: "striped", headStyles: { fillColor: [30, 41, 59] }, styles: { fontSize: 8 },
    head: [["Veículo", "Ano", "Km", "Placa", "Filial", "Status", "Dias", "Preço"]],
    body: opts.vehicles.map((v) => [
      [v.brand, v.model, v.version].filter(Boolean).join(" "),
      v.manufactureYear && v.manufactureYear !== v.year ? `${v.manufactureYear}/${v.year}` : String(v.year),
      v.km.toLocaleString("pt-BR"), v.plate ?? "", v.unit?.name ?? "", STATUS_LABEL[v.status] ?? v.status,
      String(daysInStock(v.createdAt)), brl(Number(v.price)),
    ]),
    columnStyles: { 7: { halign: "right" } },
  });

  doc.save(`relatorio-estoque-${today()}.pdf`);
}
