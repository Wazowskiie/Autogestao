import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardCheck, Printer, TrendingUp, Wallet, HandCoins, ShoppingBag, AlertTriangle } from "lucide-react";
import * as api from "../../lib/api";

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

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

const METHOD_NAMES: Record<string, string> = {
  pix: "PIX", cash: "Dinheiro", transfer: "Transferência", card_credit: "Cartão de crédito", card_debit: "Cartão de débito",
  card: "Cartão", financing: "Financiamento", consortium: "Consórcio", promissory: "Promissórias", mixed: "Várias formas",
  trade_in: "Veículo na troca",
};

const ORIGIN_NAMES = { purchase: "Compra", trade_in: "Troca", consigned: "Consignado" } as const;

const card: React.CSSProperties = { background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 16 };
const th: React.CSSProperties = { fontSize: 11, color: "#6B7280", fontWeight: 500, textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { fontSize: 12, padding: "6px 8px", borderBottom: "1px solid #F3F4F6" };
const num: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={card} className="closing-section">
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>{title}</h3>
      {children}
    </div>
  );
}

function Line({ label, value, strong, color, hint, sub }: { label: string; value: string; strong?: boolean; color?: string; hint?: string; sub?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3" style={{ padding: "5px 0", borderBottom: "1px solid #F3F4F6" }}>
      <span style={{ fontSize: sub ? 12 : 13, color: strong ? "#111827" : sub ? "#6B7280" : "#4B5563", fontWeight: strong ? 600 : 400, paddingLeft: sub ? 14 : 0 }}>
        {label}{hint && <span style={{ fontSize: 11, color: "#9CA3AF" }}> · {hint}</span>}
      </span>
      <span style={{ fontSize: 13, fontWeight: strong ? 700 : 500, color: color ?? "#111827", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, bg, color }: { icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; label: string; value: string; sub?: string; bg: string; color: string }) {
  return (
    <div className="p-4 rounded-xl" style={{ background: bg }}>
      <div className="flex items-center gap-2 mb-1"><Icon size={16} style={{ color }} /><span style={{ fontSize: 12, color }}>{label}</span></div>
      <div style={{ fontSize: 20, fontWeight: 600, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color, opacity: 0.85, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function MonthClosing() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<api.MonthClosing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getMonthClosing(month));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar o fechamento");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // Abre só o relatório numa janela própria para imprimir ou salvar em PDF
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) { window.alert("Libere as janelas pop-up deste site para imprimir."); return; }
    w.document.write(`<!doctype html><html><head><base href="${window.location.origin}/">${document.head.innerHTML}
      <title>Fechamento - ${monthLabel(month)}</title>
      <style>html,body{height:auto!important;overflow:visible!important;background:#fff}body{padding:24px}.closing-section{break-inside:avoid}</style>
      </head><body>${el.outerHTML}</body></html>`);
    w.document.close();
    w.onload = () => { w.focus(); w.print(); };
    setTimeout(() => { if (!w.closed) { w.focus(); w.print(); } }, 1200);
  };

  const s = data?.sales;
  const totalPaymentMethods = s ? s.byMethod.reduce((t, m) => t + m.amount, 0) : 0;

  return (
    <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Cabeçalho */}
      <div className="px-6 py-4 flex-shrink-0 flex items-center justify-between" style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <h2>Fechamento do mês</h2>
          <span className="px-2 py-0.5 rounded-full" style={{ background: "#EBF2FA", color: "#185FA5", fontSize: 12, fontWeight: 500 }}>{monthLabel(month)}</span>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="rounded-lg px-3 py-2" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13 }} />
          <button onClick={handlePrint} disabled={!data} className="px-4 py-2 rounded-lg flex items-center gap-2"
            style={{ background: "var(--primary)", color: "#fff", fontSize: 13, opacity: data ? 1 : 0.6 }}>
            <Printer size={16} /> Imprimir / PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        {loading && <p style={{ fontSize: 13, color: "#6B7280" }}>Carregando o fechamento...</p>}
        {error && <p style={{ fontSize: 13, color: "#DC2626" }}>{error}</p>}

        {data && s && !loading && (
          <div ref={printRef} className="flex flex-col gap-4">
            <div className="flex items-center gap-2" style={{ fontSize: 12, color: "#6B7280" }}>
              <ClipboardCheck size={14} /> Fechamento de {monthLabel(data.month)} · gerado em {new Date(data.generatedAt).toLocaleString("pt-BR")}
            </div>

            {/* Números principais */}
            <div className="grid grid-cols-4 gap-4">
              <Kpi icon={ShoppingBag} label="Vendas no mês" value={String(s.count)} sub={`Faturamento ${currency(s.revenue)}`} bg="#EBF2FA" color="#185FA5" />
              <Kpi icon={TrendingUp} label="Lucro das vendas" value={currency(s.profit)} sub={`Margem média ${s.avgMargin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} bg="#EAF3DE" color="#27500A" />
              <Kpi icon={Wallet} label="Saldo do caixa" value={currency(data.cash.balance)} sub={`Entrou ${currency(data.cash.in)} · saiu ${currency(data.cash.out)}`}
                bg={data.cash.balance >= 0 ? "#F0FDF4" : "#FEF3C7"} color={data.cash.balance >= 0 ? "#166534" : "#D97706"} />
              <Kpi icon={HandCoins} label="Comissões do mês" value={currency(data.commissions.total)} sub={`A pagar ${currency(data.commissions.pending)}`} bg="#F3E8FF" color="#7C3AED" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Resultado das vendas */}
              <Section title="Resultado das vendas">
                <Line label="Faturamento" value={currency(s.revenue)} hint={`${s.count} venda${s.count === 1 ? "" : "s"}`} />
                <Line label="(−) Custo dos veículos" value={currency(s.cost)} />
                <Line label="(−) Taxas de cartão" value={currency(s.cardFees)} />
                <Line label="(−) Despesas das vendas" value={currency(s.saleExpenses)} />
                <Line label="(−) Comissões" value={currency(data.commissions.total)} />
                <Line label="(+) Retorno dos bancos" value={currency(s.bankReturn)} />
                <Line label="= Lucro das vendas" value={currency(s.profit)} strong color={s.profit >= 0 ? "#166534" : "#DC2626"} />
                <Line label="Ticket médio" value={currency(s.avgTicket)} />
                {s.canceledCount > 0 && <Line label="Distratos no mês" value={currency(s.refunds)} hint={`${s.canceledCount} cancelada${s.canceledCount === 1 ? "" : "s"}, valor devolvido`} color="#DC2626" />}
              </Section>

              {/* Formas de pagamento */}
              <Section title="Como as vendas foram pagas">
                {s.byMethod.length === 0 && <p style={{ fontSize: 12, color: "#9CA3AF" }}>Nenhuma venda no mês.</p>}
                {s.byMethod.map((m) => (
                  <Line key={m.method} label={METHOD_NAMES[m.method] ?? m.method} value={currency(m.amount)}
                    hint={totalPaymentMethods > 0 ? `${Math.round((m.amount / totalPaymentMethods) * 100)}%` : undefined} />
                ))}
              </Section>

              {/* Caixa */}
              <Section title="Caixa do mês (Financeiro, só o que foi pago/recebido)">
                <Line label="Entradas" value={currency(data.cash.in)} color="#166534" />
                {data.cash.revenueByCategory.map((c) => <Line key={`r-${c.category}`} label={c.category} sub value={currency(c.amount)} />)}
                <Line label="Saídas" value={currency(data.cash.out)} color="#DC2626" />
                {data.cash.expensesByCategory.map((c) => <Line key={`e-${c.category}`} label={c.category} sub value={currency(c.amount)} />)}
                <Line label="Saldo" value={currency(data.cash.balance)} strong color={data.cash.balance >= 0 ? "#166534" : "#DC2626"} />
              </Section>

              {/* Pendências */}
              <Section title="O que ficou em aberto">
                <Line label="Contas a pagar do mês" value={currency(data.open.payable)} hint={`${data.open.payableCount} lançamento${data.open.payableCount === 1 ? "" : "s"}`} />
                {data.open.payableOverdue > 0 && <Line label="vencidas" sub value={currency(data.open.payableOverdue)} color="#DC2626" />}
                <Line label="Contas a receber do mês" value={currency(data.open.receivable)} hint={`${data.open.receivableCount} lançamento${data.open.receivableCount === 1 ? "" : "s"}`} />
                <Line label="Financiamentos aguardando o banco" value={currency(data.open.financingWaiting)} hint={`${data.open.financingWaitingCount} no total`} />
                <Line label="Comissões ainda não pagas (vendas do mês)" value={currency(data.commissions.pending)} />
                {(data.open.payableOverdue > 0 || data.promissory.overdue > 0) && (
                  <div className="flex items-center gap-2 mt-2" style={{ fontSize: 12, color: "#B45309" }}>
                    <AlertTriangle size={14} /> Há valores vencidos. Confira antes de fechar o mês.
                  </div>
                )}
              </Section>

              {/* Promissórias */}
              <Section title="Promissórias">
                <Line label="Recebidas no mês" value={currency(data.promissory.receivedInMonth)} hint={`${data.promissory.receivedInMonthCount} parcela${data.promissory.receivedInMonthCount === 1 ? "" : "s"}`} color="#166534" />
                <Line label="Vencendo no mês" value={currency(data.promissory.dueInMonth)} />
                <Line label="ainda não pagas" sub value={currency(data.promissory.dueInMonthUnpaid)} />
                <Line label="Em atraso (todas, até hoje)" value={currency(data.promissory.overdue)} hint={`${data.promissory.overdueCount} parcela${data.promissory.overdueCount === 1 ? "" : "s"}`} color={data.promissory.overdue > 0 ? "#DC2626" : undefined} />
                <Line label="A receber nos próximos meses" value={currency(data.promissory.future)} hint={`${data.promissory.futureCount} parcela${data.promissory.futureCount === 1 ? "" : "s"}`} />
              </Section>

              {/* Estoque */}
              <Section title="Estoque">
                <Line label="Veículos em estoque hoje" value={String(data.stock.count)} hint={`${data.stock.available} disponíveis, ${data.stock.reserved} reservados`} />
                <Line label="Valor de custo" value={currency(data.stock.cost)} />
                <Line label="Valor de venda (anunciado)" value={currency(data.stock.price)} />
                <Line label="Entradas no mês" value={currency(data.stock.entriesValue)} hint={`${data.stock.entriesCount} veículo${data.stock.entriesCount === 1 ? "" : "s"}`} />
                {data.stock.partsCost > 0 && <Line label="Peças em estoque (custo)" value={currency(data.stock.partsCost)} />}
              </Section>
            </div>

            {/* Comissões por vendedor */}
            <Section title="Vendas e comissões por vendedor">
              {data.commissions.bySeller.length === 0 ? <p style={{ fontSize: 12, color: "#9CA3AF" }}>Nenhuma venda no mês.</p> : (
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={th}>Vendedor</th><th style={{ ...th, textAlign: "right" }}>Vendas</th><th style={{ ...th, textAlign: "right" }}>Faturamento</th>
                    <th style={{ ...th, textAlign: "right" }}>Lucro</th><th style={{ ...th, textAlign: "right" }}>Comissão</th>
                    <th style={{ ...th, textAlign: "right" }}>Paga</th><th style={{ ...th, textAlign: "right" }}>A pagar</th>
                  </tr></thead>
                  <tbody>
                    {data.commissions.bySeller.map((x) => (
                      <tr key={x.sellerId}>
                        <td style={td}>{x.name}</td><td style={num}>{x.count}</td><td style={num}>{currency(x.revenue)}</td>
                        <td style={num}>{currency(x.profit)}</td><td style={num}>{currency(x.commission)}</td>
                        <td style={num}>{currency(x.commissionPaid)}</td>
                        <td style={{ ...num, color: x.commissionPending > 0 ? "#B45309" : undefined, fontWeight: x.commissionPending > 0 ? 600 : 400 }}>{currency(x.commissionPending)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Lista das vendas */}
            <Section title={`Vendas do mês (${s.count})`}>
              {s.list.length === 0 ? <p style={{ fontSize: 12, color: "#9CA3AF" }}>Nenhuma venda no mês.</p> : (
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead><tr>
                    <th style={th}>Data</th><th style={th}>Contrato</th><th style={th}>Veículo</th><th style={th}>Cliente</th><th style={th}>Vendedor</th>
                    <th style={{ ...th, textAlign: "right" }}>Preço</th><th style={{ ...th, textAlign: "right" }}>Custo</th>
                    <th style={{ ...th, textAlign: "right" }}>Lucro</th><th style={{ ...th, textAlign: "right" }}>Comissão</th>
                  </tr></thead>
                  <tbody>
                    {s.list.map((v) => (
                      <tr key={v.id}>
                        <td style={td}>{formatDate(v.soldAt)}</td><td style={td}>{v.contractNumber ?? "—"}</td><td style={td}>{v.vehicle}</td>
                        <td style={td}>{v.customer}</td><td style={td}>{v.seller}</td>
                        <td style={num}>{currency(v.price)}</td><td style={num}>{currency(v.cost)}</td>
                        <td style={{ ...num, color: v.profit < 0 ? "#DC2626" : undefined }}>{currency(v.profit)}</td><td style={num}>{currency(v.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Entradas no estoque */}
            {data.stock.entries.length > 0 && (
              <Section title={`Veículos que entraram no mês (${data.stock.entriesCount})`}>
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Data</th><th style={th}>Veículo</th><th style={th}>Origem</th><th style={{ ...th, textAlign: "right" }}>Valor de entrada</th></tr></thead>
                  <tbody>
                    {data.stock.entries.map((e, i) => (
                      <tr key={i}><td style={td}>{formatDate(e.date)}</td><td style={td}>{e.vehicle}</td><td style={td}>{ORIGIN_NAMES[e.origin]}</td><td style={num}>{currency(e.value)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
