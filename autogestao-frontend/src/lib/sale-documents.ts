// Contrato de compra e venda e notas promissórias, prontos para imprimir ou salvar em PDF
import { request } from "./api";

export interface SaleDocuments {
  id: string;
  contractNumber: string;
  soldAt: string;
  price: number;
  notes: string | null;
  seller: string;
  dealership: {
    name: string; cnpj: string | null; phone: string | null; logoUrl: string | null;
    street: string | null; number: string | null; district: string | null; zip: string | null;
    city: string | null; state: string | null;
  };
  customer: { name: string; document: string | null; phone: string | null; email: string | null; address: string | null };
  vehicle: {
    type: string; brand: string; model: string; version: string | null; year: number; manufactureYear: number | null;
    color: string | null; plate: string | null; chassis: string | null; renavam: string | null; km: number; fuel: string | null;
  };
  payments: { method: string; amount: number; installments: number | null; notes: string | null }[];
  tradeIns: {
    brand: string; model: string; version: string | null; year: number; manufactureYear: number | null; color: string | null;
    plate: string | null; chassis: string | null; renavam: string | null; km: number; value: number;
  }[];
  promissoryNotes: { id: string; number: number; total: number; amount: number; dueDate: string; paid: boolean; paidAt: string | null }[];
}

export const getSaleDocuments = (saleId: string) => request<SaleDocuments>(`/sales/${saleId}/documents`);

// ---------------- Formatação ----------------

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// Datas salvas ao meio-dia UTC: lendo em UTC o dia nunca "volta" um
const dateParts = (iso: string) => { const d = new Date(iso); return { d: d.getUTCDate(), m: d.getUTCMonth(), y: d.getUTCFullYear() }; };
const shortDate = (iso: string) => { const { d, m, y } = dateParts(iso); return `${String(d).padStart(2, "0")}/${String(m + 1).padStart(2, "0")}/${y}`; };
const longDate = (iso: string) => { const { d, m, y } = dateParts(iso); return `${d} de ${MONTHS[m]} de ${y}`; };
const todayLong = () => { const n = new Date(); return `${n.getDate()} de ${MONTHS[n.getMonth()]} de ${n.getFullYear()}`; };

function esc(v: unknown) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
/** Valor ou uma linha em branco para preencher à mão */
const fill = (v: unknown, width = 180) => (v !== null && v !== undefined && String(v).trim() ? esc(v) : `<span class="blank" style="min-width:${width}px"></span>`);

function formatDoc(doc: string | null) {
  const d = (doc ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
}
const docLabel = (doc: string | null) => ((doc ?? "").replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF");
const formatZip = (z: string | null) => ((z ?? "").replace(/\D/g, "").length === 8 ? z!.replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2") : z);
const formatPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return p;
};

function storeAddress(s: SaleDocuments["dealership"]) {
  const line1 = [s.street, s.number].filter(Boolean).join(", ");
  const parts = [line1, s.district, s.city && s.state ? `${s.city}/${s.state}` : s.city || s.state, s.zip ? `CEP ${formatZip(s.zip)}` : null].filter(Boolean);
  return parts.join(" – ");
}
const cityState = (s: SaleDocuments["dealership"]) => (s.city ? `${s.city}${s.state ? `/${s.state}` : ""}` : "");

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

// ---------------- Páginas ----------------

const PAYMENT_NAMES: Record<string, string> = {
  pix: "PIX", cash: "Dinheiro", transfer: "Transferência bancária", card_credit: "Cartão de crédito", card_debit: "Cartão de débito",
  financing: "Financiamento", consortium: "Consórcio", promissory: "Notas promissórias", other: "Outro",
};
const vehicleKind = (t: string) => (t === "moto" ? "motocicleta" : t === "truck" ? "caminhão/utilitário" : "veículo");

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
  .center { text-align: center; }
  .muted { color: #555; font-size: 11px; }
  .sign { display: flex; gap: 40px; margin-top: 46px; }
  .sign div { flex: 1; text-align: center; border-top: 1px solid #111; padding-top: 4px; font-size: 12px; }
  .toolbar { position: sticky; top: 0; background: #185FA5; color: #fff; padding: 10px 16px; display: flex; gap: 12px; align-items: center; font-family: Arial, sans-serif; font-size: 13px; z-index: 10; }
  .toolbar button { background: #fff; color: #185FA5; border: 0; border-radius: 6px; padding: 7px 14px; font-weight: bold; cursor: pointer; }
  .page { max-width: 780px; margin: 0 auto; padding: 24px; }
  @media print { .toolbar { display: none; } .page { padding: 0; max-width: none; } }
`;

function shell(title: string, body: string, extraCss = "") {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${BASE_CSS}${extraCss}</style></head><body>
<div class="toolbar"><span style="flex:1">${esc(title)}</span><button onclick="window.print()">Imprimir / salvar em PDF</button></div>
<div class="page">${body}</div></body></html>`;
}

export function contractHtml(doc: SaleDocuments) {
  const s = doc.dealership, c = doc.customer, v = doc.vehicle;
  const tradeTotal = doc.tradeIns.reduce((a, t) => a + t.value, 0);
  const notes = doc.promissoryNotes;
  const notesTotal = notes.reduce((a, n) => a + n.amount, 0);
  const promissoryPayment = doc.payments.find((p) => p.method === "promissory");
  const vehicleRows = (x: { brand: string; model: string; version: string | null; year: number; manufactureYear: number | null; color: string | null; plate: string | null; chassis: string | null; renavam: string | null; km: number }) => `
    <tr><th style="width:22%">Marca/Modelo</th><td colspan="3">${esc(`${x.brand} ${x.model}${x.version ? ` ${x.version}` : ""}`)}</td></tr>
    <tr><th>Ano fab./modelo</th><td>${x.manufactureYear ? `${x.manufactureYear}/` : ""}${x.year}</td><th style="width:18%">Cor</th><td>${fill(x.color, 100)}</td></tr>
    <tr><th>Placa</th><td>${fill(x.plate, 100)}</td><th>Quilometragem</th><td>${x.km ? `${x.km.toLocaleString("pt-BR")} km` : fill(null, 100)}</td></tr>
    <tr><th>Chassi</th><td>${fill(x.chassis, 160)}</td><th>RENAVAM</th><td>${fill(x.renavam, 120)}</td></tr>`;

  const body = `
  ${s.logoUrl ? `<div class="center" style="margin-bottom:8px"><img src="${esc(s.logoUrl)}" style="max-height:60px;max-width:200px" alt=""></div>` : ""}
  <h1>CONTRATO DE COMPRA E VENDA DE VEÍCULO</h1>
  <p class="center muted">Contrato nº ${esc(doc.contractNumber)}</p>

  <h2>1. Das partes</h2>
  <p><b>VENDEDOR(A):</b> ${esc(s.name)}, inscrita no CNPJ sob o nº ${fill(formatDoc(s.cnpj), 160)}, com sede em ${fill(storeAddress(s), 280)}${s.phone ? `, telefone ${esc(formatPhone(s.phone))}` : ""}.</p>
  <p><b>COMPRADOR(A):</b> ${esc(c.name)}, inscrito(a) no ${docLabel(c.document)} sob o nº ${fill(formatDoc(c.document), 140)}, RG nº ${fill(null, 110)}, residente e domiciliado(a) em ${fill(c.address, 300)}${c.phone ? `, telefone ${esc(formatPhone(c.phone))}` : ""}.</p>
  <p>As partes acima identificadas têm entre si justo e contratado o presente Contrato de Compra e Venda, que se regerá pelas cláusulas seguintes.</p>

  <h2>2. Do objeto</h2>
  <p>Cláusula 1ª – O(A) VENDEDOR(A) vende ao(à) COMPRADOR(A) o(a) ${vehicleKind(v.type)} com as seguintes características:</p>
  <table>${vehicleRows(v)}</table>

  <h2>3. Do preço e da forma de pagamento</h2>
  <p>Cláusula 2ª – O preço total da venda é de <b>${brl(doc.price)}</b> (${moneyInWords(doc.price)}), que será pago da seguinte forma:</p>
  <table>
    <tr><th>Forma de pagamento</th><th style="width:26%">Valor</th></tr>
    ${doc.tradeIns.map((t) => `<tr><td>Veículo recebido na troca: ${esc(`${t.brand} ${t.model} ${t.year}`)}${t.plate ? `, placa ${esc(t.plate)}` : ""}</td><td>${brl(t.value)}</td></tr>`).join("")}
    ${doc.payments.map((p) => `<tr><td>${esc(PAYMENT_NAMES[p.method] ?? p.method)}${p.method === "card_credit" && p.installments && p.installments > 1 ? ` em ${p.installments}x` : ""}${p.method === "promissory" && notes.length ? ` – ${notes.length} parcela(s), conforme quadro abaixo` : ""}${p.notes ? ` (${esc(p.notes)})` : ""}</td><td>${brl(p.amount)}</td></tr>`).join("")}
    <tr><th>Total</th><th>${brl(doc.price)}</th></tr>
  </table>
  ${doc.tradeIns.length ? `
  <p>Cláusula 3ª – Como parte do pagamento, o(a) COMPRADOR(A) entrega ao(à) VENDEDOR(A), pelo valor total de ${brl(tradeTotal)} (${moneyInWords(tradeTotal)}), o(s) veículo(s) abaixo, declarando ser seu legítimo proprietário e que estão livres de ônus, multas, débitos, alienação ou qualquer restrição, responsabilizando-se por débitos anteriores à data deste contrato:</p>
  ${doc.tradeIns.map((t) => `<table>${vehicleRows(t)}</table>`).join("")}` : ""}
  ${notes.length ? `
  <p>Cláusula ${doc.tradeIns.length ? "4ª" : "3ª"} – ${promissoryPayment ? `O valor de ${brl(promissoryPayment.amount)} foi parcelado em notas promissórias, que, com os juros do parcelamento, totalizam` : "O saldo será pago em notas promissórias, que totalizam"} <b>${brl(notesTotal)}</b> (${moneyInWords(notesTotal)}), emitidas pelo(a) COMPRADOR(A) em favor do(a) VENDEDOR(A), com os seguintes vencimentos:</p>
  <table>
    <tr><th style="width:18%">Parcela</th><th>Vencimento</th><th style="width:30%">Valor</th></tr>
    ${notes.map((n) => `<tr><td>${n.number}/${n.total}</td><td>${shortDate(n.dueDate)}</td><td>${brl(n.amount)}</td></tr>`).join("")}
  </table>
  <p>Parágrafo único – O atraso no pagamento de qualquer parcela sujeitará o(a) COMPRADOR(A) à multa de 2% (dois por cento) sobre o valor da parcela e juros de mora de 1% (um por cento) ao mês, calculados dia a dia.</p>` : ""}

  <h2>4. Da entrega e do estado do veículo</h2>
  <p>O veículo é entregue nesta data ao(à) COMPRADOR(A), que declara tê-lo examinado e recebido em perfeito estado de funcionamento e conservação, de acordo com o que foi apresentado. O(A) VENDEDOR(A) assegura a garantia legal prevista no Código de Defesa do Consumidor.</p>

  <h2>5. Da transferência e das responsabilidades</h2>
  <p>O(A) COMPRADOR(A) se compromete a providenciar a transferência do veículo para o seu nome no prazo de 30 (trinta) dias, conforme o art. 123 do Código de Trânsito Brasileiro, arcando com as despesas da transferência. O(A) VENDEDOR(A) fará a comunicação de venda ao órgão de trânsito, conforme o art. 134 do mesmo Código.</p>
  <p>Multas, impostos e débitos referentes a fatos ocorridos até a data e hora deste contrato são de responsabilidade do(a) VENDEDOR(A); os ocorridos a partir da entrega são de responsabilidade do(a) COMPRADOR(A).</p>
  ${doc.notes ? `<h2>6. Observações</h2><p>${esc(doc.notes)}</p>` : ""}

  <h2>${doc.notes ? "7" : "6"}. Do foro</h2>
  <p>As partes elegem o foro da comarca de ${fill(cityState(s), 140)} para dirimir quaisquer dúvidas oriundas deste contrato. E, por estarem justas e contratadas, assinam o presente em 2 (duas) vias de igual teor, na presença das testemunhas abaixo.</p>

  <p style="margin-top:18px">${fill(s.city, 120)}, ${longDate(doc.soldAt)}.</p>

  <div class="sign"><div>${esc(s.name)}<br><span class="muted">VENDEDOR(A)</span></div><div>${esc(c.name)}<br><span class="muted">COMPRADOR(A)</span></div></div>
  <div class="sign"><div>Testemunha 1<br><span class="muted">Nome / CPF</span></div><div>Testemunha 2<br><span class="muted">Nome / CPF</span></div></div>
  <p class="muted" style="margin-top:28px">Vendedor responsável: ${esc(doc.seller)}. Documento gerado pelo AutoGestão. Este é um modelo de contrato: confira os dados antes de assinar.</p>`;

  return shell(`Contrato ${doc.contractNumber} – ${c.name}`, body);
}

export function promissoryHtml(doc: SaleDocuments, opts: { onlyOpen?: boolean } = {}) {
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
          <div><span class="np-label">Avalista:</span> ${fill(null, 230)}</div>
          <div><span class="np-label">CPF:</span> ${fill(null, 130)} &nbsp; <span class="np-label">Endereço:</span> ${fill(null, 150)}</div>
        </div>
        <div class="np-sign"><div>Assinatura do avalista (opcional)</div></div>
      </div>
      ${n.paid ? `<div class="np-paid">PAGA${n.paidAt ? ` em ${shortDate(n.paidAt)}` : ""}</div>` : ""}
    </div>`;
  };

  const css = `
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

  const body = notes.length
    ? notes.map(card).join("")
    : `<p class="center" style="margin-top:40px">Esta venda não tem promissórias ${opts.onlyOpen ? "em aberto" : "cadastradas"}.</p>`;
  return shell(`Promissórias – ${c.name} – contrato ${doc.contractNumber}`, body, css);
}

/**
 * Abre o documento numa aba nova. A aba é aberta antes de buscar os dados
 * para o navegador não bloquear como pop-up.
 */
export async function openSaleDocument(saleId: string, kind: "contract" | "promissory", opts: { onlyOpen?: boolean } = {}) {
  const win = window.open("", "_blank");
  if (!win) throw new Error("O navegador bloqueou a nova aba. Libere os pop-ups para este site e tente de novo.");
  win.document.write(`<p style="font-family:Arial;padding:24px;color:#555">Gerando documento...</p>`);
  try {
    const doc = await getSaleDocuments(saleId);
    const html = kind === "contract" ? contractHtml(doc) : promissoryHtml(doc, opts);
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (e) {
    win.close();
    throw e;
  }
}
