// Impressos de saída da venda: contrato, promissórias, recibos, procurações, termos...
// Cada impresso sai em HTML (aba nova), PDF (abre já na tela de imprimir/salvar em PDF) ou DOC (Word).
import { request } from "./api";

export interface SaleDocuments {
  id: string;
  contractNumber: string;
  soldAt: string;
  /** Hora do registro da venda (vendas antigas não têm) */
  createdAt?: string | null;
  price: number;
  notes: string | null;
  transferInfo?: string | null;
  seller: string;
  status?: "active" | "canceled";
  canceledAt?: string | null;
  cancelReason?: string | null;
  refundAmount?: number;
  warrantyDays?: number | null;
  warrantyCoverage?: string | null;
  checklist?: Record<string, { done: boolean; at: string | null } | undefined>;
  dealership: {
    name: string; cnpj: string | null; phone: string | null; logoUrl: string | null;
    street: string | null; number: string | null; district: string | null; zip: string | null;
    city: string | null; state: string | null;
  };
  customer: { name: string; document: string | null; rg?: string | null; phone: string | null; email: string | null; address: string | null };
  vehicle: {
    type: string; brand: string; model: string; version: string | null; year: number; manufactureYear: number | null;
    color: string | null; plate: string | null; chassis: string | null; renavam: string | null; km: number; fuel: string | null;
    engineCc?: number | null; ipvaPaid?: boolean | null; hasSpareKey?: boolean | null; hasManual?: boolean | null;
    photos?: string[];
  };
  payments: {
    method: string; amount: number; installments: number | null; notes: string | null; bank?: string | null;
    installmentAmount?: number | null; paymentDate?: string | null;
  }[];
  tradeIns: {
    brand: string; model: string; version: string | null; year: number; manufactureYear: number | null; color: string | null;
    plate: string | null; chassis: string | null; renavam: string | null; km: number; value: number;
  }[];
  promissoryNotes: { id: string; number: number; total: number; amount: number; dueDate: string; paid: boolean; paidAt: string | null }[];
}

export const getSaleDocuments = (saleId: string) => request<SaleDocuments>(`/sales/${saleId}/documents`);

// ---------------- Formatação ----------------

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Datas salvas ao meio-dia UTC: lendo em UTC o dia nunca "volta" um
const dateParts = (iso: string) => { const d = new Date(iso); return { d: d.getUTCDate(), m: d.getUTCMonth(), y: d.getUTCFullYear() }; };
const shortDate = (iso: string) => { const { d, m, y } = dateParts(iso); return `${String(d).padStart(2, "0")}/${String(m + 1).padStart(2, "0")}/${y}`; };
const longDate = (iso: string) => { const { d, m, y } = dateParts(iso); return `${d} de ${MONTHS[m]} de ${y}`; };
/** Hora local de um instante (ex.: 10:01:51) */
const timeOf = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : null);

function esc(v: unknown) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
/** Valor ou uma linha em branco para preencher à mão */
const fill = (v: unknown, width = 180) => (v !== null && v !== undefined && String(v).trim() ? esc(v) : `<span class="blank" style="min-width:${width}px"></span>`);
const blank = (width = 180) => fill(null, width);

function formatDoc(doc: string | null | undefined) {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc ?? null;
}
const docLabel = (doc: string | null) => ((doc ?? "").replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF");
const formatZip = (z: string | null) => ((z ?? "").replace(/\D/g, "").length === 8 ? z!.replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2") : z);
const formatPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return p;
};
/** OIJ6D27 -> OIJ-6D27 */
const formatPlate = (p: string | null) => {
  const t = (p ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return t.length === 7 ? `${t.slice(0, 3)}-${t.slice(3)}` : p;
};
const FUEL_NAMES: Record<string, string> = {
  flex: "FLEX", gasoline: "GASOLINA", gasolina: "GASOLINA", ethanol: "ETANOL", etanol: "ETANOL", alcool: "ÁLCOOL",
  diesel: "DIESEL", electric: "ELÉTRICO", eletrico: "ELÉTRICO", hybrid: "HÍBRIDO", hibrido: "HÍBRIDO", gnv: "GNV",
};
const fuelName = (f: string | null) => (f ? FUEL_NAMES[f.toLowerCase()] ?? f.toUpperCase() : null);

function storeAddress(s: SaleDocuments["dealership"]) {
  const line1 = [s.street, s.number].filter(Boolean).join(", ");
  const parts = [line1, s.district, s.city && s.state ? `${s.city}/${s.state}` : s.city || s.state, s.zip ? `CEP ${formatZip(s.zip)}` : null].filter(Boolean);
  return parts.join(" – ");
}
const cityState = (s: SaleDocuments["dealership"]) => (s.city ? `${s.city}${s.state ? `/${s.state}` : ""}` : "");
const modelName = (v: { model: string; version: string | null }) => `${v.model}${v.version ? ` ${v.version}` : ""}`;
const yearFabMod = (v: { year: number; manufactureYear: number | null }) => `${v.manufactureYear ?? v.year}/${v.year}`;

// ---------------- Valor por extenso ----------------

const UNITS = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function upTo999(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (r) parts.push(r < 20 ? UNITS[r] : TENS[Math.floor(r / 10)] + (r % 10 ? ` e ${UNITS[r % 10]}` : ""));
  return parts.join(" e ");
}

function integerWords(n: number): string {
  if (n === 0) return "zero";
  const groups = [
    { value: Math.floor(n / 1e9) % 1000, one: "bilhão", many: "bilhões" },
    { value: Math.floor(n / 1e6) % 1000, one: "milhão", many: "milhões" },
    { value: Math.floor(n / 1e3) % 1000, one: "mil", many: "mil" },
    { value: n % 1000, one: "", many: "" },
  ].filter((g) => g.value > 0);
  return groups
    .map((g, i) => {
      let w = g.one === "mil" && g.value === 1 ? "mil" : `${upTo999(g.value)}${g.one ? ` ${g.value === 1 ? g.one : g.many}` : ""}`;
      // "e" antes do último grupo quando ele é < 100 ou centena redonda (ex.: mil e cem, dois mil e cinquenta)
      if (i > 0 && i === groups.length - 1 && (g.value < 100 || g.value % 100 === 0)) w = `e ${w}`;
      return w;
    })
    .join(" ");
}

/** 21000.5 -> "vinte e um mil reais e cinquenta centavos" */
export function moneyInWords(value: number): string {
  const cents = Math.round(value * 100);
  const reais = Math.floor(cents / 100), c = cents % 100;
  const parts: string[] = [];
  if (reais > 0) {
    const w = integerWords(reais);
    const de = reais % 1_000_000 === 0 ? " de" : ""; // "um milhão de reais"
    parts.push(`${w}${de} ${reais === 1 ? "real" : "reais"}`);
  }
  if (c > 0) parts.push(`${integerWords(c)} ${c === 1 ? "centavo" : "centavos"}`);
  return parts.length ? parts.join(" e ") : "zero reais";
}

// ---------------- Pedaços comuns ----------------

const PAYMENT_NAMES: Record<string, string> = {
  pix: "PIX", cash: "Dinheiro", transfer: "Transferência bancária", card_credit: "Cartão de crédito", card_debit: "Cartão de débito",
  financing: "Financiamento", consortium: "Consórcio", promissory: "Notas promissórias", other: "Outro",
  deposit: "Sinal pago na reserva",
};
// Recebido na hora (o resto entra depois: financiamento, consórcio e promissórias)
const RECEIVED_NOW = ["pix", "cash", "transfer", "card_credit", "card_debit", "deposit"];
const DAY = 24 * 60 * 60 * 1000;
const plusDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY).toISOString();
const canceledBanner = (doc: SaleDocuments) => (doc.status === "canceled"
  ? `<p class="center" style="border:2px solid #b91c1c;color:#b91c1c;padding:6px;font-weight:bold;font-family:Arial">VENDA CANCELADA — documento sem validade</p>` : "");
const logo = (s: SaleDocuments["dealership"]) => (s.logoUrl ? `<div class="center" style="margin-bottom:8px"><img src="${esc(s.logoUrl)}" style="max-height:60px;max-width:200px" alt=""></div>` : "");
const head = (doc: SaleDocuments, title: string, sub = `Referente ao contrato nº ${esc(doc.contractNumber)}`) =>
  `${logo(doc.dealership)}${canceledBanner(doc)}<h1>${title}</h1>${sub ? `<p class="center muted">${sub}</p>` : ""}`;
const vehicleLine = (v: SaleDocuments["vehicle"]) =>
  `${esc(`${v.brand} ${modelName(v)}`)}, ano ${yearFabMod(v)}${v.color ? `, cor ${esc(v.color)}` : ""}, placa ${fill(formatPlate(v.plate), 90)}, chassi ${fill(v.chassis, 150)}, RENAVAM ${fill(v.renavam, 110)}`;
const paymentName = (p: { method: string; installments: number | null; bank?: string | null }) =>
  `${PAYMENT_NAMES[p.method] ?? p.method}${p.bank ? ` – ${p.bank}` : ""}${p.method === "card_credit" && p.installments && p.installments > 1 ? ` em ${p.installments}x` : ""}`;
const vehicleKind = (t: string) => (t === "moto" ? "motocicleta" : t === "truck" ? "caminhão/utilitário" : "veículo");
const sellerParty = (s: SaleDocuments["dealership"]) =>
  `<b>${esc(s.name)}</b>, pessoa jurídica de direito privado, inscrita no CNPJ ${fill(formatDoc(s.cnpj), 150)}, com sede em ${fill(storeAddress(s), 280)}`;
const buyerParty = (c: SaleDocuments["customer"]) =>
  `<b>${esc(c.name)}</b>, RG/IE nº ${fill(c.rg, 110)}, inscrito(a) no CPF/CNPJ sob o nº ${fill(formatDoc(c.document), 130)}, com endereço em ${fill(c.address, 280)}${c.phone ? `, telefone ${esc(formatPhone(c.phone))}` : ""}`;
const placeDate = (doc: SaleDocuments) => `<p style="margin-top:18px">${fill(doc.dealership.city, 120)}, ${longDate(doc.soldAt)}.</p>`;
const box = (done?: boolean) => `<span class="box">${done ? "X" : "&nbsp;"}</span>`;

/** Linhas de assinatura em tabela (funciona também no Word) */
function signs(...people: [string, string][]) {
  const rows: string[] = [];
  for (let i = 0; i < people.length; i += 2) {
    const pair = people.slice(i, i + 2);
    rows.push(`<tr>${pair.map(([name, role]) => `<td class="sign-cell"><div class="sign-line">${name}<br><span class="muted">${role}</span></div></td>`).join(pair.length === 1 ? "" : `<td style="width:8%;border:0"></td>`)}</tr>`);
  }
  return `<table class="signs">${rows.join("")}</table>`;
}
const storeSign = (s: SaleDocuments["dealership"], role = "VENDEDOR(A)"): [string, string] => [esc(s.name), `${role}${s.cnpj ? ` – CNPJ ${esc(formatDoc(s.cnpj))}` : ""}`];
const buyerSign = (c: SaleDocuments["customer"], role = "COMPRADOR(A)"): [string, string] => [esc(c.name), `${role}${c.document ? ` – ${docLabel(c.document)} ${esc(formatDoc(c.document))}` : ""}`];

/** Quadro com os dados do veículo */
function vehicleTable(x: { brand: string; model: string; version: string | null; year: number; manufactureYear: number | null; color: string | null; plate: string | null; chassis: string | null; renavam: string | null; km: number; fuel?: string | null }) {
  return `<table>
    <tr><th style="width:20%">Marca/Modelo</th><td colspan="3">${esc(`${x.brand} ${modelName(x)}`)}</td></tr>
    <tr><th>Ano fab./mod.</th><td>${yearFabMod(x)}</td><th style="width:18%">Cor</th><td>${fill(x.color, 100)}</td></tr>
    <tr><th>Placa</th><td>${fill(formatPlate(x.plate), 100)}</td><th>Km</th><td>${x.km ? x.km.toLocaleString("pt-BR") : fill(null, 100)}</td></tr>
    <tr><th>Chassi</th><td>${fill(x.chassis, 160)}</td><th>RENAVAM</th><td>${fill(x.renavam, 120)}</td></tr>
    ${x.fuel !== undefined ? `<tr><th>Combustível</th><td colspan="3">${fill(fuelName(x.fuel ?? null), 100)}</td></tr>` : ""}
  </table>`;
}

const BASE_CSS = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Georgia, serif; color: #111; font-size: 12.5px; line-height: 1.5; margin: 0; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 4px; letter-spacing: .5px; }
  h2 { font-size: 13px; margin: 16px 0 6px; text-transform: uppercase; }
  p { margin: 0 0 8px; text-align: justify; }
  table { width: 100%; border-collapse: collapse; margin: 4px 0 10px; }
  td, th { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; font-size: 12px; }
  th { background: #f1f1f1; font-weight: bold; }
  .blank { display: inline-block; border-bottom: 1px solid #333; height: 1em; vertical-align: bottom; }
  .box { display: inline-block; width: 13px; height: 13px; border: 1px solid #333; margin-right: 6px; vertical-align: -2px; text-align: center; line-height: 12px; font-size: 11px; }
  .center { text-align: center; }
  .muted { color: #555; font-size: 11px; }
  table.signs { margin-top: 40px; }
  table.signs td { border: 0; padding: 0 0 34px; }
  .sign-cell { text-align: center; width: 46%; }
  .sign-line { border-top: 1px solid #111; padding-top: 4px; font-size: 12px; text-align: center; }
  .fields td { border: 0; padding: 1px 0; font-size: 12.5px; }
  .fields td:first-child { width: 150px; }
  .photos { width: 100%; }
  .photos td { border: 0; padding: 4px; width: 50%; }
  .photos img { width: 100%; height: 210px; object-fit: cover; border: 1px solid #ccc; }
  .copy { position: fixed; top: 45%; left: 0; right: 0; text-align: center; font-size: 90px; font-weight: bold; color: rgba(0,0,0,.07); transform: rotate(-25deg); pointer-events: none; }
  .toolbar { position: sticky; top: 0; background: #185FA5; color: #fff; padding: 10px 16px; display: flex; gap: 12px; align-items: center; font-family: Arial, sans-serif; font-size: 13px; z-index: 10; }
  .toolbar button { background: #fff; color: #185FA5; border: 0; border-radius: 6px; padding: 7px 14px; font-weight: bold; cursor: pointer; }
  .page { max-width: 780px; margin: 0 auto; padding: 24px; }
  .page-break { page-break-before: always; break-before: page; }
  @media print { .toolbar { display: none; } .page { padding: 0; max-width: none; } }
`;

function shell(title: string, body: string, extraCss = "", autoPrint = false) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${BASE_CSS}${extraCss}</style></head><body>
<div class="toolbar"><span style="flex:1">${esc(title)}</span><button onclick="window.print()">Imprimir / salvar em PDF</button></div>
<div class="page">${body}</div>
${autoPrint ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},500)});</script>` : ""}
</body></html>`;
}

// ---------------- Contrato de venda (modelo da loja) ----------------

/** Uma forma de pagamento no formato do contrato da loja */
function contractPaymentBlock(doc: SaleDocuments, p: SaleDocuments["payments"][number]) {
  const notes = doc.promissoryNotes;
  const lines: string[] = [];
  let title = `${esc(PAYMENT_NAMES[p.method] ?? p.method)}${p.bank ? ` – ${esc(p.bank)}` : ""} ${brl(p.amount)}`;
  let total: number | null = null;
  if (p.method === "card_credit" && p.installments && p.installments > 1) {
    const per = p.installmentAmount ?? Math.round((p.amount / p.installments) * 100) / 100;
    title += ` em ${p.installments} parcelas de ${brl(per)}`;
    if (p.installmentAmount) total = Math.round(p.installmentAmount * p.installments * 100) / 100;
  }
  if (p.method === "promissory" && notes.length) {
    title += ` em ${notes.length} parcela(s)`;
    total = notes.reduce((a, n) => a + n.amount, 0);
  }
  lines.push(title);
  lines.push(`Data: ${shortDate(p.paymentDate ?? doc.soldAt)}`);
  const desc = [total !== null ? `TOTAL DE ${num2(total)}` : null, p.notes ? esc(p.notes) : null].filter(Boolean).join(" – ");
  if (desc) lines.push(`Descrição: ${desc}`);
  if (p.method === "promissory" && notes.length) {
    lines.push(`Vencimentos: ${notes.map((n) => `${n.number}ª ${shortDate(n.dueDate)} (${brl(n.amount)})`).join("; ")}`);
  }
  return `<p style="margin-bottom:10px">${lines.join("<br>")}</p>`;
}

type ContractVariant = "default" | "noWarranty" | "photos";

function contractBody(doc: SaleDocuments, variant: ContractVariant) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const hour = timeOf(doc.createdAt);
  const field = (label: string, value: string) => `<tr><td>${label}:</td><td>${value}</td></tr>`;
  const extraClauses: string[] = [];
  if (variant === "noWarranty") {
    extraClauses.push(`<h2>6ª CLÁUSULA – DA NÃO GARANTIA</h2>
  <p>O veículo objeto deste contrato é vendido na modalidade REPASSE, no estado em que se encontra, SEM GARANTIA da loja e sem checklist de entrega. O COMPRADOR declara que vistoriou o veículo, que o adquire ciente e de acordo com o seu estado de conservação e funcionamento, e que concorda integralmente com a não garantia da loja.</p>`);
  } else if (doc.warrantyDays) {
    extraClauses.push(`<h2>6ª CLÁUSULA – DA GARANTIA</h2>
  <p>A VENDEDORA concede garantia de ${doc.warrantyDays} (${integerWords(doc.warrantyDays)}) dias, de ${shortDate(doc.soldAt)} até ${shortDate(plusDays(doc.soldAt, doc.warrantyDays))}, cobrindo: ${esc(doc.warrantyCoverage || "defeitos de funcionamento")}, nas condições do Certificado de Garantia que acompanha este contrato.</p>`);
  }
  const photos = (v.photos ?? []).slice(0, 6);

  return `
  ${logo(s)}${canceledBanner(doc)}
  <h1>CONTRATO DE COMPRA E VENDA</h1>
  <p class="center muted">Contrato nº ${esc(doc.contractNumber)}</p>

  <h2>VENDEDOR:</h2>
  <p>${esc(s.name)}, pessoa jurídica de direito privado, inscrita no CNPJ ${fill(formatDoc(s.cnpj), 150)}, com sede em ${fill(cityState(s), 120)}, na ${fill(s.street, 200)}, nº ${fill(s.number, 50)} bairro ${fill(s.district, 120)}.</p>

  <h2>COMPRADOR:</h2>
  <p>${esc(c.name)} RG/IE nº. ${fill(c.rg, 110)} e inscrito no CPF/CNPJ sob o nº. ${fill(formatDoc(c.document), 130)}, com endereço em ${fill(c.address, 300)}, telefone: ${fill(formatPhone(c.phone), 110)}.</p>

  <p>As partes acima referidas e qualificadas resolvem entabular a presente compra e venda na forma e termos a seguir expostos:</p>

  <h2>DO OBJETO</h2>
  <table class="fields">
    ${field("Marca", esc(v.brand.toUpperCase()))}
    ${field("Modelo", esc(modelName(v).toUpperCase()))}
    ${field("Cor", fill(v.color?.toUpperCase(), 100))}
    ${field("Combustível", fill(fuelName(v.fuel), 100))}
    ${field("Vendedor", esc(doc.seller.toUpperCase()))}
    ${field("Data da venda", shortDate(doc.soldAt))}
    ${field("Ano Fab/Mod", yearFabMod(v))}
    ${field("Km", v.km ? v.km.toLocaleString("pt-BR") : blank(80))}
    ${field("Placa", fill(formatPlate(v.plate), 100))}
    ${field("Renavam", fill(v.renavam, 120))}
    ${field("Chassi", fill(v.chassis, 160))}
    ${field("Hora", fill(hour, 80))}
  </table>
  ${doc.tradeIns.length ? `<p><b>Veículo(s) recebido(s) na troca:</b></p>${doc.tradeIns.map((t) => vehicleTable(t)).join("")}` : ""}

  ${doc.notes ? `<h2>OBSERVAÇÕES DE VENDA</h2><p>${esc(doc.notes).replace(/\n/g, "<br>")}</p>` : ""}

  <h2>DO PREÇO E FORMA DE PAGAMENTO</h2>
  <p>${brl(doc.price)} valor da venda</p>
  <p>O pagamento se dará da seguinte forma:</p>
  ${doc.tradeIns.map((t) => `<p style="margin-bottom:10px">Veículo na troca ${esc(`${t.brand} ${modelName(t)} ${yearFabMod(t)}`)}${t.plate ? `, placa ${esc(formatPlate(t.plate))}` : ""} ${brl(t.value)}<br>Data: ${shortDate(doc.soldAt)}</p>`).join("")}
  ${doc.payments.map((p) => contractPaymentBlock(doc, p)).join("")}

  <h2>DOCUMENTAÇÃO</h2>
  <p>Dados da transferencia: ${fill(doc.transferInfo, 200)}</p>

  <h2>1ª CLÁUSULA - DA RESPONSABILIDADE CIVIL E CRIMINAL</h2>
  <p>A partir desta data e hora, o COMPRADOR se responsabiliza por quaisquer danos, seja no âmbito civil ou criminal, decorrente da utilização do veículo ora adquirido, inclusive multas e pontuações na CNH decorrentes de tais infrações, sejam elas de âmbito Municipal, Estadual e ou Federal, bem como, fica responsável também, nos mesmos termos acima, até a presente data e hora , por eventual veículo dado na compra do objeto do presente, respondendo ainda o comprador, pela evicção e eventuais vícios redibitórios do mesmo.</p>

  <h2>2ª CLÁUSULA - INFRAÇÕES E MULTAS</h2>
  <p>A Loja não se responsabiliza, por identificar e informar as multas nos veículos e motocicletas, essa responsabilidade é inteiramente do proprietário comprador, verificar o registro de autuação de multas, para indicar o condutor infrator . Caso ocorrendo registros e não seja indicado o condutor , a multa será duplicada por os órgãos do SENATRAN (DETRAN,DNIT, AMC,PRF e ORGÃOS MUNICIPAIS).</p>

  <h2>3ª CLÁUSULA – DA TRANSFERÊNCIA DO BEM</h2>
  <p>O comprador se compromete em custear todas as taxas de cartório e DETRAN após a quitação da mesma.</p>

  <h2>4ª CLÁUSULA - LEI GERAL DE PROTEÇÃO DE DADOS</h2>
  <p>A empresa VENDEDORA em questão, está em conformidade com a Lei 13.709/2018 – LGPD, protegendo os direitos fundamentais de liberdade e de privacidade e o livre desenvolvimento da personalidade da pessoa natural no que diz respeito às operações realizadas com os dados pessoais armazenados de forma física ou digital ora fornecidos para o fim de elaborar este documento e realizar os trâmites necessários para a perfeita prestação de serviços contratada em questão. Em respeito ao artigo 7º, inciso I e artigo 8º, § 1º da aludida Lei, tais dados serão utilizados somente, e tão somente, com a finalidade de manutenção necessária para este contrato, estando o titular autorizando e dando sua ciência de fornecimento para este fim específico;</p>

  <h2>5ª CLÁUSULA – DA DESISTÊNCIA</h2>
  <p>Em caso de desistência de ambas as partes nos primeiros trinta dias após a compra, haverá uma perca de 20% do valor total do bem, após os trintas dias será feito um cálculo em cima do prazo em que o cliente está com o veículos. Obs: Em casos de devolução, a empresa tem até 30 dias a contar da desistência para fazer o estorno do valor. Somente será concordado a devolução mediante a entrega do veículo a empresa.</p>
  ${extraClauses.join("")}

  <p style="margin-top:18px">Dia ${dateParts(doc.soldAt).d} de ${cap(MONTHS[dateParts(doc.soldAt).m])} de ${dateParts(doc.soldAt).y}.</p>

  <table class="signs" style="width:60%">
    <tr><td class="sign-cell"><div class="sign-line">${esc(c.name)}<br>${fill(formatDoc(c.document), 120)}</div></td></tr>
    <tr><td class="sign-cell"><div class="sign-line">${esc(s.name)}<br>${fill(formatDoc(s.cnpj), 140)}</div></td></tr>
  </table>
  ${variant === "photos" ? `
  <div class="page-break"></div>
  <h2>FOTOS DO VEÍCULO NA DATA DA VENDA</h2>
  <p class="muted">${esc(`${v.brand} ${modelName(v)}`)} – placa ${fill(formatPlate(v.plate), 90)} – contrato nº ${esc(doc.contractNumber)}</p>
  ${photos.length
    ? `<table class="photos">${Array.from({ length: Math.ceil(photos.length / 2) }, (_, i) => `<tr>${photos.slice(i * 2, i * 2 + 2).map((u) => `<td><img src="${esc(u)}" alt=""></td>`).join("")}</tr>`).join("")}</table>`
    : `<p>Este veículo ainda não tem fotos cadastradas. Adicione em Estoque → Dados do veículo → Mídias.</p>`}
  <p style="margin-top:12px">As partes declaram que as fotos acima retratam o estado do veículo no momento da venda.</p>
  ${signs(buyerSign(c), storeSign(s))}` : ""}`;
}

// ---------------- Promissórias e duplicatas ----------------

const NP_CSS = `
  body { font-size: 12px; }
  .np { position: relative; border: 1.5px solid #222; border-radius: 4px; padding: 10px 14px; margin-bottom: 12px; page-break-inside: avoid; break-inside: avoid; min-height: 82mm; }
  .np-head { display: flex; gap: 14px; align-items: center; border-bottom: 1px solid #999; padding-bottom: 6px; margin-bottom: 8px; }
  .np-title { flex: 1; text-align: center; font-weight: bold; font-size: 15px; letter-spacing: 1px; }
  .np-value { border: 1.5px solid #222; padding: 3px 10px; font-weight: bold; font-size: 14px; }
  .np-label { color: #555; font-size: 11px; }
  .np-foot { display: flex; gap: 20px; align-items: flex-end; margin-top: 8px; }
  .np-emit { flex: 1.4; line-height: 1.7; }
  .np-sign { flex: 1; text-align: center; }
  .np-sign div { border-top: 1px solid #111; padding-top: 3px; margin-top: 40px; font-size: 11px; }
  .np-aval { border-top: 1px dashed #bbb; padding-top: 6px; }
  .np-aval .np-sign div { margin-top: 26px; }
  .np-paid { position: absolute; top: 40%; left: 50%; transform: translate(-50%,-50%) rotate(-12deg); font-size: 34px; font-weight: bold; color: rgba(4,120,87,.35); border: 4px solid rgba(4,120,87,.35); padding: 2px 18px; }
  .np:nth-of-type(3n) { page-break-after: always; break-after: page; }
`;

function promissoryBody(doc: SaleDocuments, opts: { onlyOpen?: boolean } = {}) {
  const s = doc.dealership, c = doc.customer;
  const notes = doc.promissoryNotes.filter((n) => !opts.onlyOpen || !n.paid);
  const issueDate = longDate(doc.soldAt);
  const card = (n: SaleDocuments["promissoryNotes"][number]) => {
    const { d, m, y } = dateParts(n.dueDate);
    return `
    <div class="np">
      <div class="np-head">
        <div><span class="np-label">Nº</span> <b>${n.number}/${n.total}</b></div>
        <div class="np-title">NOTA PROMISSÓRIA</div>
        <div><span class="np-label">Vencimento</span> <b>${shortDate(n.dueDate)}</b></div>
        <div class="np-value">${brl(n.amount)}</div>
      </div>
      <p>Ao(s) <b>${d}</b> dia(s) do mês de <b>${MONTHS[m]}</b> do ano de <b>${y}</b>, pagarei por esta única via de <b>NOTA PROMISSÓRIA</b>
      a <b>${esc(s.name)}</b>, CNPJ ${fill(formatDoc(s.cnpj), 140)}, ou à sua ordem, a quantia de
      <b>${esc(moneyInWords(n.amount).toUpperCase())}</b>, em moeda corrente deste país.</p>
      <p>Pagável em ${fill(cityState(s), 120)}. &nbsp; Referente ao contrato nº ${esc(doc.contractNumber)}.</p>
      <div class="np-foot">
        <div class="np-emit">
          <div><span class="np-label">Emitente:</span> ${esc(c.name)}</div>
          <div><span class="np-label">${docLabel(c.document)}:</span> ${fill(formatDoc(c.document), 130)}</div>
          <div><span class="np-label">Endereço:</span> ${fill(c.address, 230)}</div>
          <div><span class="np-label">Emissão:</span> ${fill(s.city, 90)}, ${issueDate}</div>
        </div>
        <div class="np-sign"><div>Assinatura do emitente</div></div>
      </div>
      <div class="np-foot np-aval">
        <div class="np-emit">
          <div><span class="np-label">Avalista:</span> ${blank(230)}</div>
          <div><span class="np-label">CPF:</span> ${blank(130)} &nbsp; <span class="np-label">Endereço:</span> ${blank(150)}</div>
        </div>
        <div class="np-sign"><div>Assinatura do avalista (opcional)</div></div>
      </div>
      ${n.paid ? `<div class="np-paid">PAGA${n.paidAt ? ` em ${shortDate(n.paidAt)}` : ""}</div>` : ""}
    </div>`;
  };
  return notes.length
    ? notes.map(card).join("")
    : `<p class="center" style="margin-top:40px">Esta venda não tem promissórias ${opts.onlyOpen ? "em aberto" : "cadastradas"}.</p>`;
}

/** Duplicata de venda: uma por parcela a prazo (promissórias) ou uma só com o valor a receber */
function duplicataBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const laterTotal = doc.payments.filter((p) => !RECEIVED_NOW.includes(p.method) && p.method !== "promissory").reduce((a, p) => a + p.amount, 0);
  const items = doc.promissoryNotes.length
    ? doc.promissoryNotes.map((n) => ({ ref: `${doc.contractNumber}-${n.number}/${n.total}`, amount: n.amount, due: shortDate(n.dueDate) }))
    : [{ ref: doc.contractNumber, amount: laterTotal || doc.price, due: laterTotal ? "" : shortDate(doc.soldAt) }];
  return items.map((it, i) => `
  <div style="border:1.5px solid #222;padding:12px 14px;margin-bottom:14px;page-break-inside:avoid;${i && i % 2 === 0 ? "page-break-before:always;" : ""}">
    ${i === 0 ? logo(s) : ""}
    <h1>DUPLICATA</h1>
    <table>
      <tr><th>Emitente</th><td colspan="3">${esc(s.name)} – CNPJ ${fill(formatDoc(s.cnpj), 140)}<br>${fill(storeAddress(s), 300)}</td></tr>
      <tr><th style="width:18%">Data de emissão</th><td>${shortDate(doc.soldAt)}</td><th style="width:18%">Nº da duplicata</th><td>${esc(it.ref)}</td></tr>
      <tr><th>Valor</th><td><b>${brl(it.amount)}</b></td><th>Vencimento</th><td>${fill(it.due, 100)}</td></tr>
      <tr><th>Valor por extenso</th><td colspan="3">${esc(moneyInWords(it.amount).toUpperCase())}</td></tr>
      <tr><th>Sacado</th><td colspan="3">${esc(c.name)} – ${docLabel(c.document)} ${fill(formatDoc(c.document), 130)}<br>${fill(c.address, 300)}</td></tr>
      <tr><th>Praça de pagamento</th><td colspan="3">${fill(cityState(s), 140)}</td></tr>
      <tr><th>Referente a</th><td colspan="3">Venda do(a) ${vehicleKind(v.type)} ${esc(`${v.brand} ${modelName(v)}`)}, placa ${fill(formatPlate(v.plate), 90)} – contrato nº ${esc(doc.contractNumber)}</td></tr>
    </table>
    <p>Reconheço(emos) a exatidão desta DUPLICATA DE VENDA MERCANTIL na importância acima, que pagarei(emos) a ${esc(s.name)}, ou à sua ordem, na praça e no vencimento indicados.</p>
    <table class="signs" style="margin-top:26px"><tr><td class="sign-cell" style="width:40%"><div class="sign-line">Data do aceite: ____/____/______</div></td><td style="width:8%"></td><td class="sign-cell"><div class="sign-line">${esc(c.name)}<br><span class="muted">SACADO – ACEITE</span></div></td></tr></table>
  </div>`).join("");
}

// ---------------- Demais impressos ----------------

function warrantyBody(doc: SaleDocuments, copy = false) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const days = doc.warrantyDays ?? 0;
  return `
  ${copy ? `<div class="copy">CÓPIA</div>` : ""}
  ${head(doc, `CERTIFICADO DE GARANTIA${copy ? " (CÓPIA)" : ""}`)}
  <p><b>${esc(s.name)}</b>${s.cnpj ? `, CNPJ ${esc(formatDoc(s.cnpj))}` : ""}, concede ao(à) comprador(a) <b>${esc(c.name)}</b>${c.document ? `, ${docLabel(c.document)} ${esc(formatDoc(c.document))}` : ""}, garantia sobre o(a) ${vehicleKind(v.type)} ${vehicleLine(v)}, com ${v.km ? `${v.km.toLocaleString("pt-BR")} km` : blank(80) + " km"} na data da entrega.</p>
  <h2>1. Prazo</h2>
  <p>${days ? `<b>${days} (${integerWords(days)}) dias</b>, de ${shortDate(doc.soldAt)} até ${shortDate(plusDays(doc.soldAt, days))}` : blank(240)}, sem prejuízo da garantia legal de 90 (noventa) dias prevista no art. 26 do Código de Defesa do Consumidor.</p>
  <h2>2. O que está coberto</h2>
  <p>${esc(doc.warrantyCoverage || "Defeitos de funcionamento")}. A garantia cobre o conserto ou a substituição das peças com defeito, com mão de obra, feitos pela loja ou por oficina indicada por ela.</p>
  <h2>3. O que não está coberto</h2>
  <p>Itens de desgaste natural (pneus, pastilhas e lonas de freio, embreagem, bateria, lâmpadas, velas, correias, kit relação, óleo e filtros); danos por mau uso, acidente, enchente ou falta de manutenção; peças alteradas ou consertos feitos fora sem autorização da loja; acessórios instalados depois da compra.</p>
  <h2>4. Condições</h2>
  <p>O(A) comprador(a) deve avisar a loja assim que perceber o defeito e não continuar usando o veículo se isso puder piorar o problema. A garantia é perdida se o veículo for desmontado ou consertado por terceiros sem autorização, se o hodômetro for alterado ou se as revisões e trocas de óleo não forem feitas nos prazos do fabricante.</p>
  ${placeDate(doc)}
  ${signs(storeSign(s, "LOJA"), buyerSign(c))}`;
}

const CHECKLIST_MOTO = [
  "Partida elétrica / pedal", "Motor (funcionamento e ruídos)", "Embreagem", "Câmbio / marchas", "Freio dianteiro", "Freio traseiro",
  "Pneu dianteiro", "Pneu traseiro", "Kit relação (corrente, coroa e pinhão)", "Suspensão dianteira", "Suspensão traseira",
  "Farol (alto e baixo)", "Lanterna e luz de freio", "Setas / piscas", "Buzina", "Painel e velocímetro", "Retrovisores",
  "Bateria", "Tanque e banco", "Carenagens / plásticos", "Escapamento", "Documento (CRLV)", "Chave reserva", "Manual",
];
const CHECKLIST_CARRO = [
  "Motor (funcionamento e ruídos)", "Câmbio / embreagem", "Freios", "Direção", "Suspensão", "Pneus (4) e estepe",
  "Macaco, chave de roda e triângulo", "Faróis e lanternas", "Setas e luz de freio", "Buzina", "Limpadores e esguichos",
  "Ar-condicionado", "Vidros elétricos", "Travas e alarme", "Som / multimídia", "Painel e luzes de alerta", "Bancos e cintos",
  "Tapetes", "Lataria e pintura", "Para-brisa e vidros", "Bateria", "Documento (CRLV)", "Chave reserva", "Manual",
];

function checklistBody(doc: SaleDocuments, kind: "moto" | "carro") {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const items = kind === "moto" ? CHECKLIST_MOTO : CHECKLIST_CARRO;
  return `
  ${head(doc, `CHECKLIST DE SAÍDA – ${kind === "moto" ? "MOTO" : "CARRO"}`)}
  ${vehicleTable(v)}
  <p><b>Comprador:</b> ${esc(c.name)} &nbsp; <b>Data:</b> ${shortDate(doc.soldAt)} &nbsp; <b>Km na saída:</b> ${v.km ? v.km.toLocaleString("pt-BR") : blank(80)}</p>
  <table>
    <tr><th>Item</th><th style="width:9%" class="center">OK</th><th style="width:11%" class="center">Não OK</th><th style="width:32%">Observação</th></tr>
    ${items.map((t) => `<tr><td>${esc(t)}</td><td class="center">${box()}</td><td class="center">${box()}</td><td></td></tr>`).join("")}
  </table>
  <p>Nível de combustível: ${box()} Reserva &nbsp; ${box()} 1/4 &nbsp; ${box()} 1/2 &nbsp; ${box()} 3/4 &nbsp; ${box()} Cheio</p>
  <p>Avarias / observações: ${blank(560)}</p>
  <p>Declaro que conferi os itens acima junto com a loja e que recebi o veículo nas condições marcadas.</p>
  ${signs(buyerSign(c), [esc(s.name), "LOJA – VISTORIADOR"])}`;
}

function revisionBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const items = v.type === "moto"
    ? ["Troca de óleo do motor", "Filtro de ar", "Vela de ignição", "Regulagem e lubrificação da corrente", "Regulagem dos freios", "Calibragem dos pneus", "Regulagem da embreagem", "Fluido de freio", "Carga da bateria", "Parte elétrica", "Aperto geral de parafusos", "Lavagem"]
    : ["Troca de óleo do motor", "Filtro de óleo", "Filtro de ar", "Filtro de combustível", "Filtro do ar-condicionado", "Velas de ignição", "Fluido de freio", "Pastilhas e discos de freio", "Líquido de arrefecimento", "Correias", "Alinhamento e balanceamento", "Calibragem dos pneus e estepe", "Carga da bateria", "Parte elétrica", "Higienização e lavagem"];
  return `
  ${head(doc, "REVISÃO DE ENTREGA")}
  ${vehicleTable(v)}
  <table>
    <tr><th>Serviço</th><th style="width:10%" class="center">Feito</th><th style="width:14%" class="center">Não se aplica</th><th style="width:30%">Observação</th></tr>
    ${items.map((t) => `<tr><td>${esc(t)}</td><td class="center">${box()}</td><td class="center">${box()}</td><td></td></tr>`).join("")}
  </table>
  <p>Km da revisão: ${v.km ? v.km.toLocaleString("pt-BR") : blank(80)} &nbsp; Próxima revisão em: ${blank(80)} km ou ${blank(30)}/${blank(30)}/${blank(50)}</p>
  <p>Responsável pela revisão: ${blank(260)}</p>
  ${placeDate(doc)}
  ${signs([esc(s.name), "LOJA – RESPONSÁVEL"], buyerSign(c, "COMPRADOR(A) – CIENTE"))}`;
}

function deliveryProtocolBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const ck = doc.checklist ?? {};
  const items: [string, boolean | undefined][] = [
    ["Veículo", true],
    ["Chave principal", true],
    ["Chave reserva", ck.keys?.done ?? (v.hasSpareKey ?? undefined)],
    ["Manual do proprietário", ck.manual?.done ?? (v.hasManual ?? undefined)],
    ["CRLV (documento do veículo)", ck.documents?.done],
    ["ATPV-e (autorização de transferência) assinado", ck.atpv?.done],
    ["Contrato de compra e venda", true],
    ["Nota fiscal de venda", undefined],
    ...(doc.warrantyDays ? [["Certificado de garantia", true] as [string, boolean]] : []),
    ...(doc.promissoryNotes.length ? [["Via do carnê / promissórias", undefined] as [string, undefined]] : []),
  ];
  return `
  ${head(doc, "PROTOCOLO DE ENTREGA DE VEÍCULO E DOCUMENTOS")}
  <p>Eu, <b>${esc(c.name)}</b>${c.document ? `, ${docLabel(c.document)} ${esc(formatDoc(c.document))}` : ""}, declaro que recebi de <b>${esc(s.name)}</b> o(a) ${vehicleKind(v.type)} ${vehicleLine(v)}, e os itens marcados abaixo:</p>
  <table>
    <tr><th>Item entregue</th><th style="width:12%" class="center">Recebido</th></tr>
    ${items.map(([t, d]) => `<tr><td>${esc(t)}</td><td class="center">${box(d)}</td></tr>`).join("")}
  </table>
  <table>
    <tr><th style="width:30%">Data e hora da entrega</th><td>${blank(30)}/${blank(30)}/${blank(50)} às ${blank(30)}:${blank(30)}</td></tr>
    <tr><th>Quilometragem na entrega</th><td>${v.km ? `${v.km.toLocaleString("pt-BR")} km` : blank(120) + " km"}</td></tr>
  </table>
  <p>Declaro que examinei o veículo, que ele está de acordo com o que me foi apresentado e que recebi os documentos listados.</p>
  <p>Observações: ${blank(560)}</p>
  <p style="margin-top:18px">${fill(s.city, 120)}, ${blank(160)}.</p>
  ${signs(buyerSign(c, "COMPRADOR(A) – RECEBI"), [esc(s.name), "LOJA – ENTREGUEI"])}`;
}

function receiptBody(doc: SaleDocuments, noWarranty = false) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const now = doc.payments.filter((p) => RECEIVED_NOW.includes(p.method));
  const later = doc.payments.filter((p) => !RECEIVED_NOW.includes(p.method));
  const tradeTotal = doc.tradeIns.reduce((a, t) => a + t.value, 0);
  const received = now.reduce((a, p) => a + p.amount, 0) + tradeTotal;
  return `
  ${head(doc, `RECIBO DE VENDA${noWarranty ? " – SEM GARANTIA" : ""}`, "")}
  <p class="center" style="font-size:18px;font-weight:bold;margin:10px 0 16px">${brl(received)}</p>
  <p>Recebemos de <b>${esc(c.name)}</b>${c.document ? `, ${docLabel(c.document)} ${esc(formatDoc(c.document))}` : ""}, a importância de <b>${brl(received)}</b> (${moneyInWords(received)}), referente à compra do(a) ${vehicleKind(v.type)} ${vehicleLine(v)}, contrato nº ${esc(doc.contractNumber)}, pago da seguinte forma:</p>
  <table>
    <tr><th>Forma</th><th style="width:28%">Valor</th></tr>
    ${now.map((p) => `<tr><td>${esc(paymentName(p))}</td><td>${brl(p.amount)}</td></tr>`).join("")}
    ${doc.tradeIns.map((t) => `<tr><td>Veículo na troca: ${esc(`${t.brand} ${t.model} ${t.year}`)}${t.plate ? `, placa ${esc(formatPlate(t.plate))}` : ""}</td><td>${brl(t.value)}</td></tr>`).join("")}
    <tr><th>Total recebido</th><th>${brl(received)}</th></tr>
  </table>
  ${later.length ? `<p>Restante do preço total de ${brl(doc.price)}: ${later.map((p) => `${esc(paymentName(p))} de ${brl(p.amount)}`).join("; ")}, a ser recebido conforme o contrato.</p>` : `<p>Com este pagamento, o preço total de ${brl(doc.price)} está quitado.</p>`}
  ${noWarranty ? `<p><b>Veículo vendido na modalidade REPASSE, no estado em que se encontra, SEM GARANTIA da loja.</b> O comprador declara que vistoriou o veículo e que está ciente e de acordo com a não garantia.</p>` : ""}
  <p>Para clareza, firmamos o presente recibo.</p>
  ${placeDate(doc)}
  ${noWarranty ? signs(storeSign(s, "LOJA"), buyerSign(c, "COMPRADOR(A) – CIENTE")) : signs(storeSign(s, "LOJA"))}`;
}

function financedOutsideBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const fin = doc.payments.find((p) => p.method === "financing" || p.method === "consortium");
  return `
  ${head(doc, "DECLARAÇÃO DE VEÍCULO FINANCIADO FORA DA LOJA")}
  <p>Eu, ${buyerParty(c)}, declaro para os devidos fins que o pagamento de ${fin ? `<b>${brl(fin.amount)}</b> (${moneyInWords(fin.amount)})` : `R$ ${blank(120)}`} referente à compra do(a) ${vehicleKind(v.type)} ${vehicleLine(v)}, junto a ${sellerParty(s)}, foi ${fin?.method === "consortium" ? "feito por carta de consórcio" : "financiado"} por minha conta e iniciativa diretamente com ${fill(fin?.bank, 200)}, sem intermediação da loja.</p>
  <p>Declaro estar ciente de que a loja não faz parte do contrato de financiamento, não responde por suas taxas, juros, parcelas, seguros e tarifas, nem pela aprovação ou recusa do crédito, e que a liberação do veículo ou a quitação da venda depende do pagamento integral do valor pela instituição financeira.</p>
  <p>Declaro também que as informações que prestei à instituição financeira são verdadeiras e de minha inteira responsabilidade.</p>
  ${placeDate(doc)}
  ${signs(buyerSign(c, "DECLARANTE"), storeSign(s, "LOJA – CIENTE"))}`;
}

function distratoBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const refund = doc.refundAmount ?? 0;
  return `
  ${logo(s)}
  <h1>DISTRATO DE COMPRA E VENDA</h1>
  <p class="center muted">Referente ao contrato nº ${esc(doc.contractNumber)}, de ${shortDate(doc.soldAt)}</p>
  <p><b>DISTRATANTE VENDEDORA:</b> ${sellerParty(s)}.</p>
  <p><b>DISTRATANTE COMPRADOR(A):</b> ${buyerParty(c)}.</p>
  <p>As partes resolvem, de comum acordo, desfazer o contrato de compra e venda do(a) ${vehicleKind(v.type)} ${vehicleLine(v)}, firmado em ${shortDate(doc.soldAt)} pelo valor de ${brl(doc.price)}, nas condições abaixo:</p>
  <h2>1ª CLÁUSULA – DO MOTIVO</h2>
  <p>${fill(doc.cancelReason, 480)}</p>
  <h2>2ª CLÁUSULA – DA DEVOLUÇÃO DO VEÍCULO</h2>
  <p>O(A) COMPRADOR(A) devolve neste ato o veículo à VENDEDORA, com ${blank(90)} km, juntamente com chaves, documentos e acessórios recebidos, declarando que não há multas, débitos ou ocorrências em seu período de uso, pelos quais continua responsável até a data e hora deste distrato.</p>
  <h2>3ª CLÁUSULA – DOS VALORES</h2>
  <p>A VENDEDORA restituirá ao(à) COMPRADOR(A) o valor de ${refund ? `<b>${brl(refund)}</b> (${moneyInWords(refund)})` : `R$ ${blank(120)}`}, já descontados os valores previstos na cláusula de desistência do contrato original, no prazo de até 30 (trinta) dias a contar da devolução do veículo, por meio de ${blank(180)}.</p>
  <h2>4ª CLÁUSULA – DA QUITAÇÃO</h2>
  <p>Cumprido o disposto acima, as partes dão plena, geral e irrevogável quitação quanto ao contrato distratado, nada mais tendo a reclamar uma da outra a qualquer título.</p>
  <p style="margin-top:18px">${fill(s.city, 120)}, ${doc.canceledAt ? longDate(doc.canceledAt) : blank(200)}.</p>
  ${signs(storeSign(s, "VENDEDORA"), buyerSign(c), ["Testemunha 1", "Nome / CPF"], ["Testemunha 2", "Nome / CPF"])}`;
}

function envelopeBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const docs = ["Contrato de compra e venda", "Recibo de venda", "Promissórias / duplicatas", "Certificado de garantia", "Checklist de saída", "Protocolo de entrega", "Procuração", "Termo de responsabilidade", "Requerimento de ATPV-e", "Cópia do CRLV", "Cópia do RG/CNH do comprador", "Comprovante de endereço do comprador", "Comprovantes de pagamento"];
  return `
  ${logo(s)}
  <div style="border:3px solid #111;padding:20px;margin-top:10px">
    <h1 style="font-size:24px">ENVELOPE DE SAÍDA</h1>
    <p class="center" style="font-size:16px">Contrato nº <b>${esc(doc.contractNumber)}</b> – ${shortDate(doc.soldAt)}</p>
    <table style="font-size:14px;margin-top:14px">
      <tr><th style="width:24%">Comprador</th><td style="font-size:14px"><b>${esc(c.name)}</b> – ${fill(formatDoc(c.document), 120)} – ${fill(formatPhone(c.phone), 100)}</td></tr>
      <tr><th>Veículo</th><td style="font-size:14px"><b>${esc(`${v.brand} ${modelName(v)}`)}</b> ${yearFabMod(v)} – ${esc(v.color ?? "")}</td></tr>
      <tr><th>Placa / Chassi</th><td style="font-size:14px">${fill(formatPlate(v.plate), 90)} / ${fill(v.chassis, 160)}</td></tr>
      <tr><th>Valor da venda</th><td style="font-size:14px">${brl(doc.price)}</td></tr>
      <tr><th>Vendedor</th><td style="font-size:14px">${esc(doc.seller)}</td></tr>
      <tr><th>Transferência</th><td style="font-size:14px">${fill(doc.transferInfo, 200)}</td></tr>
    </table>
    <h2>Documentos neste envelope</h2>
    <table>${Array.from({ length: Math.ceil(docs.length / 2) }, (_, i) => `<tr>${docs.slice(i * 2, i * 2 + 2).map((d) => `<td style="border:0">${box()}${esc(d)}</td>`).join("")}</tr>`).join("")}</table>
    <p>Conferido por: ${blank(240)} &nbsp; Data: ${blank(30)}/${blank(30)}/${blank(50)}</p>
  </div>`;
}

function powerOfAttorneyCommunicationBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  return `
  ${head(doc, "PROCURAÇÃO PARA COMUNICAÇÃO DE VENDA")}
  <p><b>OUTORGANTE:</b> ${sellerParty(s)}, proprietária do veículo abaixo, neste ato representada por ${blank(220)}.</p>
  <p><b>OUTORGADO(A):</b> ${blank(300)}, CPF ${blank(130)}, RG ${blank(110)}, com endereço em ${blank(300)}.</p>
  <p><b>PODERES:</b> para, junto ao DETRAN${s.state ? `-${esc(s.state)}` : ""} e demais órgãos de trânsito, efetuar a COMUNICAÇÃO DE VENDA do(a) ${vehicleKind(v.type)} ${vehicleLine(v)}, vendido em ${shortDate(doc.soldAt)} a <b>${esc(c.name)}</b>, ${docLabel(c.document)} ${fill(formatDoc(c.document), 130)}, podendo para isso assinar requerimentos, declarações e formulários, apresentar e retirar documentos, reconhecer firmas, pagar taxas e emolumentos, e praticar todos os demais atos necessários ao fiel cumprimento deste mandato.</p>
  <p>Validade: 90 (noventa) dias.</p>
  ${placeDate(doc)}
  ${signs(storeSign(s, "OUTORGANTE"))}`;
}

function powerOfAttorneySaleBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  return `
  ${head(doc, "PROCURAÇÃO")}
  <p><b>OUTORGANTE:</b> ${buyerParty(c)}.</p>
  <p><b>OUTORGADA:</b> ${sellerParty(s)}, por seus sócios, funcionários ou despachante por ela indicado.</p>
  <p><b>PODERES:</b> para, junto ao DETRAN${s.state ? `-${esc(s.state)}` : ""}, cartórios, CIRETRAN e demais órgãos de trânsito, tratar da TRANSFERÊNCIA DE PROPRIEDADE para o nome do(a) outorgante do(a) ${vehicleKind(v.type)} ${vehicleLine(v)}, adquirido em ${shortDate(doc.soldAt)}, podendo para isso assinar requerimentos e a ATPV-e, apresentar o veículo à vistoria, requerer emplacamento e placa Mercosul, solicitar a emissão do CRV/CRLV, pagar taxas, impostos e emolumentos, retirar documentos, reconhecer firmas e praticar todos os demais atos necessários ao fiel cumprimento deste mandato.</p>
  <p>Validade: 90 (noventa) dias.</p>
  ${placeDate(doc)}
  ${signs(buyerSign(c, "OUTORGANTE"))}`;
}

function receiptRequestAtpvBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  return `
  ${head(doc, "REQUERIMENTO DE GERAÇÃO DE ATPV-e – SAÍDA", `Autorização para Transferência de Propriedade de Veículo eletrônica`)}
  <p>Ao DEPARTAMENTO ESTADUAL DE TRÂNSITO${s.state ? ` – DETRAN-${esc(s.state)}` : ""}</p>
  <p>${sellerParty(s)}, proprietária do veículo abaixo, vem requerer a geração da ATPV-e (Autorização para Transferência de Propriedade de Veículo em meio eletrônico), em razão da venda a seguir:</p>
  <h2>Veículo</h2>
  ${vehicleTable(v)}
  <h2>Comprador</h2>
  <table>
    <tr><th style="width:24%">Nome</th><td colspan="3">${esc(c.name)}</td></tr>
    <tr><th>CPF/CNPJ</th><td>${fill(formatDoc(c.document), 130)}</td><th style="width:14%">RG/IE</th><td>${fill(c.rg, 110)}</td></tr>
    <tr><th>Endereço</th><td colspan="3">${fill(c.address, 320)}</td></tr>
    <tr><th>Telefone</th><td>${fill(formatPhone(c.phone), 110)}</td><th>E-mail</th><td>${fill(c.email, 150)}</td></tr>
  </table>
  <h2>Venda</h2>
  <table>
    <tr><th style="width:24%">Valor da venda</th><td>${brl(doc.price)} (${moneyInWords(doc.price)})</td></tr>
    <tr><th>Data da venda</th><td>${shortDate(doc.soldAt)}</td></tr>
    <tr><th>Hodômetro</th><td>${v.km ? `${v.km.toLocaleString("pt-BR")} km` : blank(100)}</td></tr>
  </table>
  <p>Declaro, sob as penas da lei, que as informações acima são verdadeiras.</p>
  ${placeDate(doc)}
  ${signs(storeSign(s, "VENDEDORA – REQUERENTE"), buyerSign(c, "COMPRADOR(A) – DE ACORDO"))}`;
}

function retentionOfTitleBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const later = doc.payments.filter((p) => !RECEIVED_NOW.includes(p.method));
  const notes = doc.promissoryNotes;
  const balance = notes.length ? notes.reduce((a, n) => a + n.amount, 0) : later.reduce((a, p) => a + p.amount, 0);
  return `
  ${head(doc, "CONTRATO DE COMPRA E VENDA COM RESERVA DE DOMÍNIO")}
  <p><b>VENDEDORA:</b> ${sellerParty(s)}.</p>
  <p><b>COMPRADOR(A):</b> ${buyerParty(c)}.</p>
  <h2>1ª CLÁUSULA – DO OBJETO</h2>
  <p>O objeto deste contrato é o(a) ${vehicleKind(v.type)} ${vehicleLine(v)}, vendido pelo preço total de ${brl(doc.price)} (${moneyInWords(doc.price)}).</p>
  <h2>2ª CLÁUSULA – DO SALDO A PRAZO</h2>
  <p>O saldo de ${balance ? `<b>${brl(balance)}</b> (${moneyInWords(balance)})` : `R$ ${blank(120)}`} será pago ${notes.length ? `em ${notes.length} parcela(s), representadas por notas promissórias, com os seguintes vencimentos:` : "conforme o contrato de compra e venda."}</p>
  ${notes.length ? `<table><tr><th style="width:18%">Parcela</th><th>Vencimento</th><th style="width:30%">Valor</th></tr>${notes.map((n) => `<tr><td>${n.number}/${n.total}</td><td>${shortDate(n.dueDate)}</td><td>${brl(n.amount)}</td></tr>`).join("")}</table>` : ""}
  <h2>3ª CLÁUSULA – DA RESERVA DE DOMÍNIO</h2>
  <p>Nos termos dos arts. 521 a 528 do Código Civil, a VENDEDORA reserva para si a propriedade do veículo até que o preço esteja integralmente pago. O(A) COMPRADOR(A) recebe a posse do veículo nesta data e responde por ele como depositário, inclusive por multas, impostos, danos e riscos, a partir da entrega.</p>
  <h2>4ª CLÁUSULA – DO INADIMPLEMENTO</h2>
  <p>O atraso no pagamento sujeitará o(a) COMPRADOR(A) à multa de 2% (dois por cento) sobre a parcela e juros de mora de 1% (um por cento) ao mês. Constituído em mora, a VENDEDORA poderá cobrar as parcelas vencidas e vincendas ou recuperar a posse do veículo, na forma da lei.</p>
  <h2>5ª CLÁUSULA – DA TRANSFERÊNCIA</h2>
  <p>A transferência do veículo para o nome do(a) COMPRADOR(A) só será feita após a quitação integral do preço. O(A) COMPRADOR(A) não poderá vender, alugar ou dar o veículo em garantia antes da quitação.</p>
  ${placeDate(doc)}
  ${signs(storeSign(s, "VENDEDORA"), buyerSign(c), ["Testemunha 1", "Nome / CPF"], ["Testemunha 2", "Nome / CPF"])}`;
}

function exitRecordBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  return `
  ${head(doc, "REGISTRO DE SAÍDA DE VEÍCULO")}
  ${vehicleTable(v)}
  <table>
    <tr><th style="width:30%">Motivo da saída</th><td>Venda – contrato nº ${esc(doc.contractNumber)}</td></tr>
    <tr><th>Comprador</th><td>${esc(c.name)} – ${fill(formatDoc(c.document), 130)}</td></tr>
    <tr><th>Vendedor responsável</th><td>${esc(doc.seller)}</td></tr>
    <tr><th>Data e hora da saída</th><td>${blank(30)}/${blank(30)}/${blank(50)} às ${blank(30)}:${blank(30)}</td></tr>
    <tr><th>Km na saída</th><td>${v.km ? v.km.toLocaleString("pt-BR") : blank(100)}</td></tr>
    <tr><th>Combustível</th><td>${box()} Reserva &nbsp; ${box()} 1/4 &nbsp; ${box()} 1/2 &nbsp; ${box()} 3/4 &nbsp; ${box()} Cheio</td></tr>
    <tr><th>Retirado por</th><td>${blank(240)} &nbsp; Doc.: ${blank(120)}</td></tr>
    <tr><th>Saída autorizada por</th><td>${blank(240)}</td></tr>
  </table>
  <p>Observações: ${blank(560)}</p>
  ${signs(["Quem retirou", "Nome / documento"], [esc(s.name), "LOJA – AUTORIZOU"])}`;
}

function returnTermBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  return `
  ${head(doc, "TERMO DE DEVOLUÇÃO DE VEÍCULO")}
  <p>Eu, ${buyerParty(c)}, declaro que DEVOLVO nesta data a ${sellerParty(s)} o(a) ${vehicleKind(v.type)} ${vehicleLine(v)}, adquirido em ${shortDate(doc.soldAt)} pelo contrato acima.</p>
  <table>
    <tr><th style="width:30%">Data e hora da devolução</th><td>${blank(30)}/${blank(30)}/${blank(50)} às ${blank(30)}:${blank(30)}</td></tr>
    <tr><th>Km na devolução</th><td>${blank(120)}</td></tr>
    <tr><th>Motivo</th><td>${fill(doc.cancelReason, 360)}</td></tr>
    <tr><th>Itens devolvidos</th><td>${box()} Chave principal &nbsp; ${box()} Chave reserva &nbsp; ${box()} Manual &nbsp; ${box()} CRLV &nbsp; ${box()} ATPV-e</td></tr>
    <tr><th>Estado do veículo / avarias</th><td>${blank(360)}</td></tr>
  </table>
  <p>Declaro que continuo responsável por multas, débitos e ocorrências do período em que o veículo esteve comigo, até a data e hora desta devolução, e que estou ciente das condições de desistência previstas no contrato de compra e venda (5ª cláusula), inclusive quanto ao prazo de até 30 dias para o estorno do valor.</p>
  <p>Valor a ser restituído: ${doc.refundAmount ? `<b>${brl(doc.refundAmount)}</b> (${moneyInWords(doc.refundAmount)})` : `R$ ${blank(120)}`}</p>
  ${placeDate(doc)}
  ${signs(buyerSign(c, "DEVOLVI"), storeSign(s, "LOJA – RECEBI"))}`;
}

function responsibilityTermBody(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const hour = timeOf(doc.createdAt);
  return `
  ${head(doc, "TERMO DE RESPONSABILIDADE – SAÍDA DE VEÍCULO")}
  <p>Eu, ${buyerParty(c)}, declaro que nesta data, ${shortDate(doc.soldAt)}, às ${fill(hour, 80)}, recebi de ${sellerParty(s)} o(a) ${vehicleKind(v.type)} ${vehicleLine(v)}, com ${v.km ? `${v.km.toLocaleString("pt-BR")} km` : blank(80) + " km"}.</p>
  <p>A partir desta data e hora, assumo integral responsabilidade civil e criminal pelo uso do veículo, por quaisquer danos causados a mim ou a terceiros, e por todas as multas, pontuações na CNH, impostos, taxas e débitos que vierem a ocorrer, em âmbito municipal, estadual ou federal, comprometendo-me a indicar o condutor infrator quando for o caso.</p>
  <p>Comprometo-me ainda a providenciar a transferência do veículo para o meu nome no prazo de 30 (trinta) dias, conforme o art. 123 do Código de Trânsito Brasileiro${doc.transferInfo ? ` (dados da transferência: ${esc(doc.transferInfo)})` : ""}, arcando com as taxas de cartório e DETRAN.</p>
  ${placeDate(doc)}
  ${signs(buyerSign(c, "COMPRADOR(A) – RESPONSÁVEL"), storeSign(s, "LOJA"))}`;
}

// ---------------- Catálogo de impressos ----------------

export interface SalePrint {
  id: string;
  title: string;
  /** Monta o conteúdo; devolve [corpo, css extra] */
  build: (doc: SaleDocuments) => string | [string, string];
  /** Motivo para não gerar (ex.: venda sem promissórias). null = disponível */
  unavailable?: (doc: SaleDocuments) => string | null;
}

const needsWarranty = (doc: SaleDocuments) => (doc.warrantyDays ? null : "Esta venda foi registrada sem garantia da loja.");
const needsNotes = (doc: SaleDocuments) => (doc.promissoryNotes.length ? null : "Esta venda não tem promissórias.");

/** Lista na mesma ordem da tela "Impressos de saída" */
export const SALE_PRINTS: SalePrint[] = [
  { id: "warranty", title: "Certificado de Garantia Saída", build: (d) => warrantyBody(d), unavailable: needsWarranty },
  { id: "warranty-copy", title: "Certificado de Garantia Saída (Cópia)", build: (d) => warrantyBody(d, true), unavailable: needsWarranty },
  { id: "checklist-car", title: "Checklist de Saída - carro", build: (d) => checklistBody(d, "carro") },
  { id: "checklist-moto", title: "Checklist de Saída - moto", build: (d) => checklistBody(d, "moto") },
  { id: "contract", title: "Contrato de venda", build: (d) => contractBody(d, "default") },
  { id: "contract-photos", title: "Contrato de venda com fotos", build: (d) => contractBody(d, "photos") },
  { id: "contract-no-warranty", title: "Contrato de venda sem garantia", build: (d) => contractBody(d, "noWarranty") },
  { id: "financed-outside", title: "Declaração de veículos financiados fora da loja", build: financedOutsideBody },
  { id: "distrato", title: "Distrato de Compra e Venda", build: distratoBody },
  { id: "duplicata", title: "Duplicata", build: duplicataBody },
  { id: "envelope", title: "Envelope de saída", build: envelopeBody },
  { id: "poa-communication", title: "Procuração de Comunicação de Venda", build: powerOfAttorneyCommunicationBody },
  { id: "poa-sale", title: "Procuração na venda", build: powerOfAttorneySaleBody },
  { id: "promissory", title: "Promissória", build: (d) => [promissoryBody(d), NP_CSS], unavailable: needsNotes },
  { id: "delivery", title: "Protocolo de entrega de veículo e documentos", build: deliveryProtocolBody },
  { id: "receipt", title: "Recibo de venda", build: (d) => receiptBody(d) },
  { id: "receipt-no-warranty", title: "Recibo de venda sem garantia", build: (d) => receiptBody(d, true) },
  { id: "exit-record", title: "Registro de saída", build: exitRecordBody },
  { id: "atpv-request", title: "REQUERIMENTO DE GERAÇÃO DE ATPV-e - SAÍDA", build: receiptRequestAtpvBody },
  { id: "retention-of-title", title: "Reserva de domínio", build: retentionOfTitleBody },
  { id: "revision", title: "Revisão de entrega", build: revisionBody },
  { id: "return", title: "Termo de devolução", build: returnTermBody },
  { id: "responsibility", title: "Termo de responsabilidade saida de veículo", build: responsibilityTermBody },
];

export type PrintFormat = "html" | "pdf" | "doc";

function renderPrint(print: SalePrint, doc: SaleDocuments) {
  const out = print.build(doc);
  const [body, css] = Array.isArray(out) ? out : [out, ""];
  return { body, css, title: `${print.title} – ${doc.contractNumber} – ${doc.customer.name}` };
}

/** Versão para o Word: sem a barra, com linhas em branco em sublinhado e sem layout flex */
function wordHtml(title: string, body: string, css: string) {
  const plain = body
    .replace(/<span class="blank" style="min-width:(\d+)px"><\/span>/g, (_, w) => "_".repeat(Math.max(4, Math.round(Number(w) / 7))))
    .replace(/<span class="box">(.*?)<\/span>/g, (_, x) => `[${x === "&nbsp;" ? "&nbsp;&nbsp;" : x}]`)
    .replace(/<div class="copy">.*?<\/div>/g, "");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page WordSection1 { size: 21cm 29.7cm; margin: 1.6cm 1.4cm; }
  div.WordSection1 { page: WordSection1; }
  body { font-family: "Times New Roman", serif; font-size: 12pt; }
  h1 { font-size: 15pt; text-align: center; } h2 { font-size: 12pt; text-transform: uppercase; }
  p { text-align: justify; margin: 0 0 6pt; }
  table { border-collapse: collapse; width: 100%; } td, th { border: 1px solid #999; padding: 3pt 5pt; font-size: 11pt; vertical-align: top; text-align: left; }
  th { background: #f1f1f1; }
  table.signs td, .fields td, .photos td { border: none; }
  .sign-line { border-top: 1px solid #000; text-align: center; padding-top: 3pt; }
  .center { text-align: center; } .muted { color: #555; font-size: 10pt; }
  .np, .np-head, .np-foot { display: block; }
  ${css.includes(".np ") ? ".np { border: 1.5px solid #222; padding: 8pt; margin-bottom: 10pt; } .np-paid { color: #047857; font-weight: bold; }" : ""}
</style></head>
<body><div class="WordSection1">${plain}</div></body></html>`;
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob(["﻿", content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const safeFileName = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- ]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);

/**
 * Gera um impresso da venda.
 * - html: abre numa aba nova
 * - pdf: abre numa aba nova já na janela de impressão (escolha "Salvar como PDF")
 * - doc: baixa um arquivo .doc que abre no Word/LibreOffice
 * A aba é aberta antes de buscar os dados para o navegador não bloquear como pop-up.
 */
export async function openSalePrint(saleId: string, printId: string, format: PrintFormat = "html", docData?: SaleDocuments) {
  const print = SALE_PRINTS.find((p) => p.id === printId);
  if (!print) throw new Error("Impresso não encontrado");
  const win = format === "doc" ? null : window.open("", "_blank");
  if (format !== "doc" && !win) throw new Error("O navegador bloqueou a nova aba. Libere os pop-ups para este site e tente de novo.");
  win?.document.write(`<p style="font-family:Arial;padding:24px;color:#555">Gerando documento...</p>`);
  try {
    const doc = docData ?? (await getSaleDocuments(saleId));
    const reason = print.unavailable?.(doc);
    if (reason) throw new Error(reason);
    const { body, css, title } = renderPrint(print, doc);
    if (format === "doc") {
      downloadFile(`${safeFileName(title)}.doc`, wordHtml(title, body, css), "application/msword");
      return;
    }
    win!.document.open();
    win!.document.write(shell(title, body, css, format === "pdf"));
    win!.document.close();
  } catch (e) {
    win?.close();
    throw e;
  }
}

// ---------------- Compatibilidade com os botões antigos ----------------

export type SaleDocumentKind = "contract" | "promissory" | "warranty" | "delivery" | "receipt";

export async function openSaleDocument(saleId: string, kind: SaleDocumentKind, opts: { onlyOpen?: boolean } = {}) {
  if (kind === "promissory" && opts.onlyOpen) {
    const win = window.open("", "_blank");
    if (!win) throw new Error("O navegador bloqueou a nova aba. Libere os pop-ups para este site e tente de novo.");
    try {
      const doc = await getSaleDocuments(saleId);
      win.document.open();
      win.document.write(shell(`Promissórias em aberto – ${doc.customer.name} – contrato ${doc.contractNumber}`, promissoryBody(doc, opts), NP_CSS));
      win.document.close();
    } catch (e) { win.close(); throw e; }
    return;
  }
  return openSalePrint(saleId, kind, "html");
}

/** Usado pelos testes: HTML completo de um impresso */
export function salePrintHtml(printId: string, doc: SaleDocuments, format: PrintFormat = "html") {
  const print = SALE_PRINTS.find((p) => p.id === printId);
  if (!print) throw new Error("Impresso não encontrado");
  const { body, css, title } = renderPrint(print, doc);
  return format === "doc" ? wordHtml(title, body, css) : shell(title, body, css, format === "pdf");
}
