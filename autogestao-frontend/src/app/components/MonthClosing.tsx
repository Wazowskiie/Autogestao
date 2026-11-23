import { useCallback, useEffect, useRef, useState } from "react";
import { Printer, TrendingUp, Wallet, HandCoins, ShoppingBag, AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, FileSpreadsheet } from "lucide-react";
import * as api from "../../lib/api";
import { PeriodPicker, periodLabel, monthPeriod, type Period } from "./PeriodPicker";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Mostra a data como foi salva, sem o fuso "voltar um dia"
function formatDate(date: string) {
  return new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const METHOD_NAMES: Record<string, string> = {
  pix: "PIX", cash: "Dinheiro", transfer: "Transferência", card_credit: "Cartão de crédito", card_debit: "Cartão de débito",
  card: "Cartão", financing: "Financiamento", consortium: "Consórcio", promissory: "Promissórias", mixed: "Várias formas",
  trade_in: "Veículo na troca",
};

const ORIGIN_NAMES = { purchase: "Compra", trade_in: "Troca", consigned: "Consignado" } as const;

type Tab = "sales" | "sellers" | "cash" | "promissory" | "stock";
const TABS: { id: Tab; label: string }[] = [
  { id: "sales", label: "Vendas" },
  { id: "sellers", label: "Vendedores" },
  { id: "cash", label: "Caixa" },
  { id: "promissory", label: "Promissórias" },
  { id: "stock", label: "Estoque" },
];

const BLUE = "#185FA5";
const box: React.CSSProperties = { background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const th: React.CSSProperties = { fontSize: 11, color: "#6B7280", fontWeight: 500, textAlign: "left", padding: "8px", borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { fontSize: 12, padding: "8px", borderBottom: "1px solid #F3F4F6" };
const num: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };

// ---------- peças pequenas ----------

function Kpi({ icon: Icon, label, value, sub, bg, color }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; label: string; value: string; sub?: string; bg: string; color: string }) {
  return (
    <div className="p-4 rounded-xl" style={{ background: bg }}>
      <div className="flex items-center gap-2 mb-1"><Icon size={16} style={{ color }} /><span style={{ fontSize: 12, color }}>{label}</span></div>
      <div style={{ fontSize: 22, fontWeight: 600, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color, opacity: 0.85, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Stat({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "#fff", border: "1px solid var(--border)" }}>
      <div style={{ fontSize: 12, color: "#6B7280" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: color ?? "#111827", marginTop: 2 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/** Barra horizontal: nome, valor e o tamanho proporcional ao maior item */
function Bars({ items, color = BLUE, showPercent }: { items: { label: string; value: number }[]; color?: string; showPercent?: boolean }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const total = items.reduce((t, i) => t + i.value, 0);
  if (items.length === 0) return <p style={{ fontSize: 12, color: "#9CA3AF" }}>Nada neste período.</p>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <div key={i.label}>
          <div className="flex justify-between" style={{ fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "#374151" }}>{i.label}{showPercent && total > 0 && <span style={{ color: "#9CA3AF" }}> · {Math.round((i.value / total) * 100)}%</span>}</span>
            <span style={{ fontWeight: 600, color: "#111827" }}>{currency(i.value)}</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "#F3F4F6" }}>
            <div style={{ height: 8, borderRadius: 4, width: `${Math.max((i.value / max) * 100, 2)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Junta as categorias menores em "Outros" para não virar uma lista enorme */
function topN(list: { category: string; amount: number }[], n = 5) {
  const top = list.slice(0, n).map((c) => ({ label: c.category, value: c.amount }));
  const rest = list.slice(n).reduce((t, c) => t + c.amount, 0);
  return rest > 0 ? [...top, { label: "Outros", value: rest }] : top;
}

function Toggle({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 no-print" style={{ fontSize: 13, color: BLUE, fontWeight: 500, marginTop: open ? 14 : 0 }}>
      {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {open ? "Esconder" : label}
    </button>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{children}</h3>;
}

// ---------- conteúdo de cada aba ----------

function SalesTab({ d, expanded }: { d: api.MonthClosing; expanded?: boolean }) {
  const [open, setOpen] = useState(false);
  const s = d.sales;
  const show = expanded || open;
  const steps = [
    { label: "Faturamento", value: s.revenue, sign: "" },
    { label: "Custo dos veículos", value: s.cost, sign: "−" },
    { label: "Taxas, despesas e comissões", value: s.cardFees + s.saleExpenses + d.commissions.total, sign: "−" },
    { label: "Retorno dos bancos", value: s.bankReturn, sign: "+" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div style={box}>
          <Title>De onde veio o lucro</Title>
          {steps.map((st) => (
            <div key={st.label} className="flex justify-between" style={{ fontSize: 13, padding: "6px 0", color: "#4B5563" }}>
              <span><span style={{ display: "inline-block", width: 14 }}>{st.sign}</span>{st.label}</span>
              <span style={{ color: "#111827", fontWeight: 500 }}>{currency(st.value)}</span>
            </div>
          ))}
          <div className="flex justify-between mt-2 pt-3" style={{ borderTop: "1px solid var(--border)", fontSize: 15, fontWeight: 700 }}>
            <span>Lucro das vendas</span>
            <span style={{ color: s.profit >= 0 ? "#166534" : "#DC2626" }}>{currency(s.profit)}</span>
          </div>
          <div className="flex gap-4 mt-3" style={{ fontSize: 12, color: "#6B7280" }}>
            <span>Ticket médio {currency(s.avgTicket)}</span>
            {s.canceledCount > 0 && <span style={{ color: "#DC2626" }}>{plural(s.canceledCount, "distrato", "distratos")} · {currency(s.refunds)} devolvido</span>}
          </div>
        </div>
        <div style={box}>
          <Title>Como os clientes pagaram</Title>
          <Bars items={s.byMethod.map((m) => ({ label: METHOD_NAMES[m.method] ?? m.method, value: m.amount }))} showPercent />
        </div>
      </div>

      {s.list.length > 0 && (
        <div style={box}>
          {show && (
            <>
              <Title>Vendas do período ({s.count})</Title>
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>Data</th><th style={th}>Veículo</th><th style={th}>Cliente</th><th style={th}>Vendedor</th>
                  <th style={{ ...th, textAlign: "right" }}>Preço</th><th style={{ ...th, textAlign: "right" }}>Lucro</th>
                </tr></thead>
                <tbody>
                  {s.list.map((v) => (
                    <tr key={v.id}>
                      <td style={td}>{formatDate(v.soldAt)}</td><td style={td}>{v.vehicle}</td><td style={td}>{v.customer}</td><td style={td}>{v.seller}</td>
                      <td style={num}>{currency(v.price)}</td>
                      <td style={{ ...num, color: v.profit < 0 ? "#DC2626" : undefined }}>{currency(v.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {!expanded && <Toggle open={open} onClick={() => setOpen(!open)} label={s.count === 1 ? "Ver a venda do período" : `Ver as ${s.count} vendas do período`} />}
        </div>
      )}
    </div>
  );
}

function CashTab({ d }: { d: api.MonthClosing }) {
  const c = d.cash;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Entrou" value={currency(c.in)} color="#166534" />
        <Stat label="Saiu" value={currency(c.out)} color="#DC2626" />
        <Stat label="Sobrou" value={currency(c.balance)} color={c.balance >= 0 ? "#166534" : "#DC2626"} hint="só o que foi pago ou recebido de verdade" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div style={box}><Title>Para onde foi o dinheiro</Title><Bars items={topN(c.expensesByCategory)} color="#DC2626" /></div>
        <div style={box}><Title>De onde veio o dinheiro</Title><Bars items={topN(c.revenueByCategory)} color="#16A34A" /></div>
      </div>
    </div>
  );
}

const KIND_NAMES: Record<api.SaleKind, string> = { cash: "À vista", financing: "Financiada", promissory: "Promissória" };
const KIND_COLORS: Record<api.SaleKind, { bg: string; fg: string }> = {
  cash: { bg: "#EAF3DE", fg: "#27500A" },
  financing: { bg: "#EBF2FA", fg: BLUE },
  promissory: { bg: "#F3E8FF", fg: "#7C3AED" },
};
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);

/** As porcentagens usadas naquele tipo (promissória pode ter duas, pela entrada) */
function ratesOf(x: api.ClosingSeller, kind: api.SaleKind) {
  const rates = [...new Set(x.sales.filter((v) => v.kind === kind && v.rate != null).map((v) => v.rate as number))].sort((a, b) => a - b);
  return rates.length ? rates.map((r) => pct(r)).join(" / ") : "";
}

/** Planilha dos vendedores (CSV com ";", abre direto no Excel) */
function downloadSellersSheet(d: api.MonthClosing) {
  const money = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows: string[][] = [[`Fechamento dos vendedores - ${periodLabel({ from: d.from, to: d.to })}`], []];
  rows.push(["Vendedor", "Vendas", "Valor vendido", "Despesas das motos", "Valor total", "Comissão", "Salário fixo", "Total a receber", "Comissão já paga", "Falta pagar"]);
  for (const x of d.commissions.bySeller) {
    rows.push([x.name, String(x.count), money(x.revenue), money(x.expenses), money(x.total), money(x.commission), money(x.salary), money(x.toReceive), money(x.commissionPaid), money(x.commissionPending)]);
  }
  rows.push(["Total", String(d.commissions.bySeller.reduce((t, x) => t + x.count, 0)), "", "", "", money(d.commissions.total), money(d.commissions.salaries), money(d.commissions.payroll), money(d.commissions.paid), money(d.commissions.pending)]);
  for (const x of d.commissions.bySeller) {
    rows.push([], [x.name]);
    rows.push(["Data", "Contrato", "Veículo", "Cliente", "Tipo", "Valor da venda", "Despesas da moto", "Valor total", "Comissão %", "Comissão R$", "Paga?"]);
    for (const v of x.sales) {
      rows.push([formatDate(v.soldAt), v.contractNumber ?? "", v.vehicle, v.customer, KIND_NAMES[v.kind], money(v.price), money(v.expenses), money(v.total), v.rate == null ? "" : String(v.rate).replace(".", ","), money(v.commission), v.paid ? "Sim" : "Não"]);
    }
    for (const k of ["cash", "financing", "promissory"] as const) {
      const t = x.byKind[k];
      if (t.count) rows.push(["", "", `${KIND_NAMES[k]}: ${t.count} venda${t.count === 1 ? "" : "s"}`, "", "", money(t.value), "", "", ratesOf(x, k), money(t.commission), ""]);
    }
    rows.push(["", "", "Comissão", "", "", "", "", "", "", money(x.commission), ""]);
    rows.push(["", "", "Salário fixo", "", "", "", "", "", "", money(x.salary), ""]);
    rows.push(["", "", "Total a receber", "", "", "", "", "", "", money(x.toReceive), ""]);
  }
  const csv = "\uFEFF" + rows.map((r) => r.map((c) => cell(c)).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `vendedores-${d.from === d.to ? d.from : `${d.from}_a_${d.to}`}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SellerCard({ x, expanded }: { x: api.ClosingSeller; expanded?: boolean }) {
  const [open, setOpen] = useState(false);
  const show = expanded || open;
  return (
    <div style={box} className="print-block">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{x.name}</div>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{x.count === 0 ? "Nenhuma venda no período" : plural(x.count, "venda", "vendas")}</div>
        </div>
        <div className="text-right">
          <div style={{ fontSize: 12, color: "#6B7280" }}>Total a receber</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>{currency(x.toReceive)}</div>
          <div style={{ fontSize: 11, color: "#6B7280" }}>fixo {currency(x.salary)} + comissão {currency(x.commission)}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mt-4">
        {[
          ["Valor vendido", x.revenue],
          ["Despesas das motos", x.expenses],
          ["Valor total", x.total],
          ["Comissão", x.commission],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg px-3 py-2" style={{ background: "#F9FAFB" }}>
            <div style={{ fontSize: 11, color: "#6B7280" }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{currency(value as number)}</div>
          </div>
        ))}
      </div>

      {x.count > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {(["cash", "financing", "promissory"] as const).filter((k) => x.byKind[k].count > 0).map((k) => (
            <span key={k} className="rounded-full px-3 py-1" style={{ fontSize: 12, background: KIND_COLORS[k].bg, color: KIND_COLORS[k].fg }}>
              <b>{KIND_NAMES[k]}</b> · {plural(x.byKind[k].count, "venda", "vendas")} · {currency(x.byKind[k].value)} · {ratesOf(x, k)} = <b>{currency(x.byKind[k].commission)}</b>
            </span>
          ))}
          {x.commissionPending > 0
            ? <span className="rounded-full px-3 py-1" style={{ fontSize: 12, background: "#FEF3C7", color: "#92400E" }}>Comissão a pagar: <b>{currency(x.commissionPending)}</b></span>
            : <span className="rounded-full px-3 py-1" style={{ fontSize: 12, background: "#F0FDF4", color: "#166534" }}>Comissão paga</span>}
        </div>
      )}

      {x.sales.length > 0 && (
        <>
          {show && (
            <table className="w-full mt-4" style={{ borderCollapse: "collapse" }}>
              <thead><tr>
                <th style={th}>Data</th><th style={th}>Veículo</th><th style={th}>Cliente</th><th style={th}>Tipo</th>
                <th style={{ ...th, textAlign: "right" }}>Venda</th><th style={{ ...th, textAlign: "right" }}>Despesas</th>
                <th style={{ ...th, textAlign: "right" }}>Total</th><th style={{ ...th, textAlign: "right" }}>%</th><th style={{ ...th, textAlign: "right" }}>Comissão</th>
              </tr></thead>
              <tbody>
                {x.sales.map((v) => (
                  <tr key={v.id}>
                    <td style={td}>{formatDate(v.soldAt)}</td><td style={td}>{v.vehicle}</td><td style={td}>{v.customer}</td>
                    <td style={td}><span className="rounded px-1.5 py-0.5" style={{ fontSize: 11, background: KIND_COLORS[v.kind].bg, color: KIND_COLORS[v.kind].fg }}>{KIND_NAMES[v.kind]}</span></td>
                    <td style={num}>{currency(v.price)}</td><td style={num}>{currency(v.expenses)}</td><td style={num}>{currency(v.total)}</td>
                    <td style={num}>{pct(v.rate)}</td><td style={{ ...num, fontWeight: 600 }}>{currency(v.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!expanded && <div className="mt-3"><Toggle open={open} onClick={() => setOpen(!open)} label={x.count === 1 ? `Ver a venda de ${x.name.split(" ")[0]}` : `Ver as ${x.count} vendas de ${x.name.split(" ")[0]}`} /></div>}
        </>
      )}
    </div>
  );
}

function SellersTab({ d, expanded }: { d: api.MonthClosing; expanded?: boolean }) {
  const c = d.commissions;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="Salários fixos" value={currency(c.salaries)} />
        <Stat label="Comissões" value={currency(c.total)} />
        <Stat label="Total a pagar aos vendedores" value={currency(c.payroll)} color={BLUE} />
        <Stat label="Comissão que falta pagar" value={currency(c.pending)} color={c.pending > 0 ? "#B45309" : "#166534"} hint={`já pago ${currency(c.paid)}`} />
      </div>
      {!expanded && (
        <div className="flex justify-end no-print">
          <button onClick={() => downloadSellersSheet(d)} className="px-4 py-2 rounded-lg flex items-center gap-2"
            style={{ background: "#fff", border: "1px solid var(--border)", color: "#166534", fontSize: 13, fontWeight: 500 }}>
            <FileSpreadsheet size={16} /> Baixar planilha (Excel)
          </button>
        </div>
      )}
      {c.bySeller.length === 0 && <p style={{ fontSize: 12, color: "#9CA3AF" }}>Nenhum vendedor cadastrado.</p>}
      {c.bySeller.map((x) => <SellerCard key={x.sellerId} x={x} expanded={expanded} />)}
    </div>
  );
}

function PromissoryTab({ d }: { d: api.MonthClosing }) {
  const p = d.promissory;
  return (
    <div className="grid grid-cols-2 gap-4">
      <Stat label="Recebidas no período" value={currency(p.receivedInMonth)} hint={plural(p.receivedInMonthCount, "parcela", "parcelas")} color="#166534" />
      <Stat label="Venciam no período e não foram pagas" value={currency(p.dueInMonthUnpaid)} hint={`de ${currency(p.dueInMonth)} que venciam no período`} color={p.dueInMonthUnpaid > 0 ? "#B45309" : undefined} />
      <Stat label="Em atraso (todas, até hoje)" value={currency(p.overdue)} hint={plural(p.overdueCount, "parcela", "parcelas")} color={p.overdue > 0 ? "#DC2626" : undefined} />
      <Stat label="A receber nos próximos meses" value={currency(p.future)} hint={plural(p.futureCount, "parcela", "parcelas")} />
    </div>
  );
}

function StockTab({ d, expanded }: { d: api.MonthClosing; expanded?: boolean }) {
  const [open, setOpen] = useState(false);
  const s = d.stock;
  const show = expanded || open;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Veículos em estoque hoje" value={String(s.count)} hint={`${s.available} disponíveis · ${s.reserved} reservados`} />
        <Stat label="Valor em estoque (custo)" value={currency(s.cost)} hint={`anunciado por ${currency(s.price)}`} />
        <Stat label="Entraram no período" value={plural(s.entriesCount, "veículo", "veículos")} hint={currency(s.entriesValue)} />
      </div>
      {s.partsCost > 0 && <div style={{ fontSize: 12, color: "#6B7280" }}>Peças em estoque: {currency(s.partsCost)} de custo.</div>}
      {s.entries.length > 0 && (
        <div style={box}>
          {show && (
            <>
              <Title>Veículos que entraram no período</Title>
              <table className="w-full" style={{ borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Data</th><th style={th}>Veículo</th><th style={th}>Origem</th><th style={{ ...th, textAlign: "right" }}>Valor</th></tr></thead>
                <tbody>
                  {s.entries.map((e, i) => (
                    <tr key={i}><td style={td}>{formatDate(e.date)}</td><td style={td}>{e.vehicle}</td><td style={td}>{ORIGIN_NAMES[e.origin]}</td><td style={num}>{currency(e.value)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {!expanded && <Toggle open={open} onClick={() => setOpen(!open)} label={s.entriesCount === 1 ? "Ver o veículo que entrou" : `Ver os ${s.entriesCount} veículos que entraram`} />}
        </div>
      )}
    </div>
  );
}

function TabContent({ tab, d, expanded }: { tab: Tab; d: api.MonthClosing; expanded?: boolean }) {
  if (tab === "sales") return <SalesTab d={d} expanded={expanded} />;
  if (tab === "cash") return <CashTab d={d} />;
  if (tab === "sellers") return <SellersTab d={d} expanded={expanded} />;
  if (tab === "promissory") return <PromissoryTab d={d} />;
  return <StockTab d={d} expanded={expanded} />;
}

/** Pendências que pedem atenção antes de fechar o mês, numa faixa só */
function Pending({ d }: { d: api.MonthClosing }) {
  const items = [
    d.open.payableOverdue > 0 && `${currency(d.open.payableOverdue)} em contas vencidas`,
    d.promissory.overdue > 0 && `${currency(d.promissory.overdue)} em promissórias atrasadas`,
    d.commissions.pending > 0 && `${currency(d.commissions.pending)} de comissão a pagar`,
    d.open.financingWaiting > 0 && `${currency(d.open.financingWaiting)} aguardando o banco`,
    d.open.payable - d.open.payableOverdue > 0 && `${currency(d.open.payable - d.open.payableOverdue)} a pagar no período`,
  ].filter(Boolean) as string[];
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl px-4 py-3" style={{ background: "#F0FDF4", color: "#166534", fontSize: 13 }}>
        <CheckCircle2 size={16} /> Nada pendente neste período.
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-xl px-4 py-3" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", fontSize: 13 }}>
      <AlertTriangle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
      <span><b>Antes de fechar:</b> {items.join(" · ")}</span>
    </div>
  );
}

function Summary({ d }: { d: api.MonthClosing }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <Kpi icon={ShoppingBag} label="Vendas no período" value={String(d.sales.count)} sub={`Faturamento ${currency(d.sales.revenue)}`} bg="#EBF2FA" color={BLUE} />
      <Kpi icon={TrendingUp} label="Lucro das vendas" value={currency(d.sales.profit)} sub={`Margem média ${d.sales.avgMargin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} bg="#EAF3DE" color="#27500A" />
      <Kpi icon={Wallet} label="Saldo do caixa" value={currency(d.cash.balance)} sub={`Entrou ${currency(d.cash.in)} · saiu ${currency(d.cash.out)}`}
        bg={d.cash.balance >= 0 ? "#F0FDF4" : "#FEF3C7"} color={d.cash.balance >= 0 ? "#166534" : "#D97706"} />
      <Kpi icon={HandCoins} label="Vendedores (fixo + comissão)" value={currency(d.commissions.payroll)} sub={`Comissões ${currency(d.commissions.total)} · falta pagar ${currency(d.commissions.pending)}`} bg="#F3E8FF" color="#7C3AED" />
    </div>
  );
}

// ---------- tela ----------

export function MonthClosing() {
  const [period, setPeriod] = useState<Period>(() => monthPeriod(currentMonth()));
  const [tab, setTab] = useState<Tab>("sales");
  const [data, setData] = useState<api.MonthClosing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getMonthClosing(period));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o fechamento");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // A impressão leva o relatório inteiro (todas as abas, listas abertas) numa janela própria
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) { window.alert("Libere as janelas pop-up deste site para imprimir."); return; }
    w.document.write(`<!doctype html><html><head><base href="${window.location.origin}/">${document.head.innerHTML}
      <title>Fechamento - ${periodLabel(period)}</title>
      <style>html,body{height:auto!important;overflow:visible!important;background:#fff}body{padding:24px}.no-print{display:none!important}.print-block{break-inside:avoid}</style>
      </head><body>${el.innerHTML}</body></html>`);
    w.document.close();
    let printed = false;
    const go = () => { if (!printed && !w.closed) { printed = true; w.focus(); w.print(); } };
    w.onload = go;
    setTimeout(go, 1200);
  };

  return (
    <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Cabeçalho */}
      <div className="px-6 py-4 flex-shrink-0 flex items-center justify-between" style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <h2>Fechamento</h2>
          <span className="px-2 py-0.5 rounded-full" style={{ background: "#EBF2FA", color: BLUE, fontSize: 12, fontWeight: 500 }}>{periodLabel(period)}</span>
        </div>
        <div className="flex items-center gap-3">
          <PeriodPicker value={period} onChange={(p) => p && setPeriod(p)} />
          <button onClick={handlePrint} disabled={!data} className="px-4 py-2 rounded-lg flex items-center gap-2"
            style={{ background: "var(--primary)", color: "#fff", fontSize: 13, opacity: data ? 1 : 0.6 }}>
            <Printer size={16} /> Imprimir / PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading && <p style={{ fontSize: 13, color: "#6B7280" }}>Carregando o fechamento...</p>}
        {error && <p style={{ fontSize: 13, color: "#DC2626" }}>{error}</p>}

        {data && !loading && (
          <div className="flex flex-col gap-4">
            <Summary d={data} />
            <Pending d={data} />

            {/* Abas */}
            <div className="flex gap-1 mt-2" style={{ borderBottom: "1px solid var(--border)" }}>
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} className="px-4 py-2"
                  style={{
                    fontSize: 13, fontWeight: tab === t.id ? 600 : 400, color: tab === t.id ? BLUE : "#6B7280",
                    borderBottom: `2px solid ${tab === t.id ? BLUE : "transparent"}`, marginBottom: -1,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            <TabContent tab={tab} d={data} />
          </div>
        )}
      </div>

      {/* Versão completa só para a impressão (fica escondida na tela) */}
      {data && (
        <div ref={printRef} style={{ display: "none" }}>
          <div className="flex flex-col gap-5">
            <div>
              <h2>Fechamento: {periodLabel({ from: data.from, to: data.to })}</h2>
              <div style={{ fontSize: 12, color: "#6B7280" }}>Gerado em {new Date(data.generatedAt).toLocaleString("pt-BR")}</div>
            </div>
            <div className="print-block"><Summary d={data} /></div>
            <Pending d={data} />
            {TABS.map((t) => (
              <div key={t.id} className="print-block">
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: "8px 0 10px" }}>{t.label}</h3>
                <TabContent tab={t.id} d={data} expanded />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
