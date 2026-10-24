import { Fragment, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, Printer, TrendingUp, Wallet, CheckCircle2, Percent, MessageCircle, ChevronDown, ChevronRight } from "lucide-react";
import { request } from "../../lib/api";

// ---------- Tipos do relatório ----------
interface ReportMonth { month: string; count: number; due: number; paid: number; open: number; overdue: number }
interface ReportDebtor {
  customerId: string; name: string; phone: string | null; overdueCount: number; overdueAmount: number;
  oldestDueDate: string; daysLate: number; promissories: number; vehicles: string[];
}
interface ReportInstallment {
  customer: string; phone: string | null; vehicle: string; contract: string | null; number: number; total: number;
  dueDate: string; amount: number; status: "paga" | "atrasada" | "a vencer"; paidAt: string | null;
}
export interface PromissoryReportData {
  from: string; to: string;
  period: { dueCount: number; dueAmount: number; paidOfDueAmount: number; openAmount: number; overdueAmount: number; receivedCount: number; receivedAmount: number };
  portfolio: { activePromissories: number; openCount: number; openAmount: number; overdueCount: number; overdueAmount: number; delinquencyRate: number };
  months: ReportMonth[];
  debtors: ReportDebtor[];
  installments: ReportInstallment[];
}

const getReport = (from: string, to: string) => request<PromissoryReportData>(`/promissory-notes/report?from=${from}&to=${to}`);

// ---------- Formatação ----------
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const monthLabel = (key: string) => { const [y, m] = key.split("-").map(Number); return `${MONTHS[m - 1]}/${y}`; };
const dateBR = (iso: string) => { const d = new Date(iso); return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; };
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const phoneBR = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return p ?? "";
};
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function presetRange(kind: "month" | "next6" | "last6" | "year") {
  const t = new Date();
  if (kind === "month") return { from: isoDate(new Date(t.getFullYear(), t.getMonth(), 1)), to: isoDate(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
  if (kind === "next6") return { from: isoDate(new Date(t.getFullYear(), t.getMonth(), 1)), to: isoDate(new Date(t.getFullYear(), t.getMonth() + 6, 0)) };
  if (kind === "last6") return { from: isoDate(new Date(t.getFullYear(), t.getMonth() - 5, 1)), to: isoDate(new Date(t.getFullYear(), t.getMonth() + 1, 0)) };
  return { from: isoDate(new Date(t.getFullYear(), 0, 1)), to: isoDate(new Date(t.getFullYear(), 11, 31)) };
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 12, padding: 16 };
const th: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 500, color: "#6B7280", textAlign: "left" };
const td: React.CSSProperties = { padding: "9px 10px", fontSize: 13, borderTop: "1px solid rgba(0,0,0,0.06)" };

// =====================================================================
export function PromissoryReport() {
  const [range, setRange] = useState(presetRange("next6"));
  const [data, setData] = useState<PromissoryReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null); // mês aberto na tabela

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getReport(range.from, range.to)); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar o relatório"); }
    finally { setLoading(false); }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const maxMonth = Math.max(1, ...(data?.months.map((m) => m.due) ?? [0]));

  return (
    <div className="flex flex-col gap-4">
      {/* Período */}
      <div className="flex items-end gap-3 flex-wrap" style={card}>
        <label style={{ fontSize: 12, color: "#4B5563" }}>De<br />
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })}
            className="rounded-lg px-3 py-2" style={{ border: "0.5px solid rgba(0,0,0,0.15)", fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 12, color: "#4B5563" }}>Até<br />
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })}
            className="rounded-lg px-3 py-2" style={{ border: "0.5px solid rgba(0,0,0,0.15)", fontSize: 13 }} />
        </label>
        <div className="flex gap-1 flex-wrap">
          {([["month", "Este mês"], ["next6", "Próximos 6 meses"], ["last6", "Últimos 6 meses"], ["year", "Este ano"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setRange(presetRange(k))} className="px-3 py-2 rounded-lg"
              style={{ fontSize: 12, background: "#F4F6F9", color: "#374151" }}>{label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button disabled={!data} onClick={() => data && printReport(data)} className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ fontSize: 13, border: "0.5px solid rgba(0,0,0,0.15)", background: "#fff" }}>
          <Printer size={14} /> Imprimir / PDF
        </button>
        <button disabled={!data} onClick={() => data && exportCsv(data)} className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ fontSize: 13, background: "#185FA5", color: "#fff", fontWeight: 500 }}>
          <Download size={14} /> Exportar planilha
        </button>
      </div>

      {error && <div className="rounded-lg px-4 py-3" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}
      {loading && !data && <p style={{ fontSize: 13, color: "#6B7280" }}>Carregando relatório...</p>}

      {data && (
        <>
          {/* Indicadores */}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", opacity: loading ? 0.6 : 1 }}>
            <Kpi icon={TrendingUp} color="#185FA5" label="Vence no período" value={brl(data.period.dueAmount)} sub={`${data.period.dueCount} parcelas`} />
            <Kpi icon={CheckCircle2} color="#27500A" label="Recebido no período" value={brl(data.period.receivedAmount)} sub={`${data.period.receivedCount} parcelas pagas`} />
            <Kpi icon={Wallet} color="#D97706" label="Carteira a receber" value={brl(data.portfolio.openAmount)} sub={`${data.portfolio.activePromissories} promissórias · ${data.portfolio.openCount} parcelas`} />
            <Kpi icon={AlertTriangle} color="#DC2626" label="Em atraso (total)" value={brl(data.portfolio.overdueAmount)} sub={`${data.portfolio.overdueCount} parcelas atrasadas`} />
            <Kpi icon={Percent} color={data.portfolio.delinquencyRate > 10 ? "#DC2626" : "#27500A"} label="Inadimplência"
              value={`${data.portfolio.delinquencyRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} sub="do que já venceu, não foi pago" />
          </div>

          {/* Mês a mês */}
          <div style={card}>
            <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 8 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Mês a mês (pelo vencimento)</h3>
                <p style={{ fontSize: 12, color: "#6B7280" }}>Soma das parcelas de todos os clientes. Clique num mês para ver de quem é cada parcela.</p>
              </div>
              <div className="flex gap-3" style={{ fontSize: 11, color: "#6B7280" }}>
                <Legend color="#16A34A" label="Pago" /><Legend color="#F59E0B" label="A vencer" /><Legend color="#DC2626" label="Atrasado" />
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={th}>Mês</th><th style={th}>Parcelas</th><th style={th}>Vence</th><th style={th}>Pago</th><th style={th}>A vencer</th><th style={th}>Atrasado</th><th style={{ ...th, width: "28%" }}></th></tr></thead>
                <tbody>
                  {data.months.map((m) => {
                    const isOpen = openMonth === m.month;
                    const rows = isOpen ? data.installments
                      .filter((i) => i.dueDate.slice(0, 7) === m.month)
                      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.customer.localeCompare(b.customer)) : [];
                    return (
                    <Fragment key={m.month}>
                    <tr onClick={() => m.count > 0 && setOpenMonth(isOpen ? null : m.month)}
                      style={{ cursor: m.count > 0 ? "pointer" : "default", background: isOpen ? "#F8FBFF" : undefined }}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        <span className="inline-flex items-center gap-1">
                          {m.count > 0 ? (isOpen ? <ChevronDown size={14} style={{ color: "#185FA5" }} /> : <ChevronRight size={14} style={{ color: "#9CA3AF" }} />) : <span style={{ width: 14 }} />}
                          {monthLabel(m.month)}
                        </span>
                      </td>
                      <td style={td}>{m.count}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{brl(m.due)}</td>
                      <td style={{ ...td, color: "#15803D" }}>{brl(m.paid)}</td>
                      <td style={{ ...td, color: "#B45309" }}>{brl(m.open)}</td>
                      <td style={{ ...td, color: m.overdue > 0 ? "#DC2626" : "#9CA3AF" }}>{brl(m.overdue)}</td>
                      <td style={td}>
                        <div className="flex" style={{ height: 10, borderRadius: 99, overflow: "hidden", background: "#EEF1F5", width: `${Math.max(4, (m.due / maxMonth) * 100)}%` }}>
                          {m.due > 0 && <>
                            <div style={{ width: `${(m.paid / m.due) * 100}%`, background: "#16A34A" }} />
                            <div style={{ width: `${(m.open / m.due) * 100}%`, background: "#F59E0B" }} />
                            <div style={{ width: `${(m.overdue / m.due) * 100}%`, background: "#DC2626" }} />
                          </>}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ padding: "4px 10px 14px 34px", background: "#F8FBFF" }}>
                          <div style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead><tr style={{ background: "#F9FAFB" }}>
                                <th style={th}>Cliente</th><th style={th}>Veículo</th><th style={th}>Parcela</th><th style={th}>Vencimento</th><th style={th}>Valor</th><th style={th}>Situação</th><th style={th}></th>
                              </tr></thead>
                              <tbody>
                                {rows.map((i, idx) => {
                                  const st = i.status === "paga" ? { bg: "#DCFCE7", color: "#166534", label: i.paidAt ? `Paga em ${new Date(i.paidAt).toLocaleDateString("pt-BR")}` : "Paga" }
                                    : i.status === "atrasada" ? { bg: "#FEE2E2", color: "#991B1B", label: "Atrasada" }
                                    : { bg: "#FEF3C7", color: "#92400E", label: "A vencer" };
                                  const wa = (i.phone ?? "").replace(/\D/g, "");
                                  return (
                                    <tr key={idx}>
                                      <td style={td}><b>{i.customer}</b>{i.phone && <div style={{ fontSize: 12, color: "#6B7280" }}>{phoneBR(i.phone)}</div>}</td>
                                      <td style={{ ...td, color: "#4B5563" }}>{i.vehicle}</td>
                                      <td style={td}>{i.number}/{i.total}</td>
                                      <td style={td}>{dateBR(i.dueDate)}</td>
                                      <td style={{ ...td, fontWeight: 600 }}>{brl(i.amount)}</td>
                                      <td style={td}><span className="px-2 py-0.5 rounded" style={{ fontSize: 12, fontWeight: 600, background: st.bg, color: st.color, whiteSpace: "nowrap" }}>{st.label}</span></td>
                                      <td style={td}>
                                        {i.status !== "paga" && wa.length >= 10 && (
                                          <a href={`https://wa.me/55${wa}?text=${encodeURIComponent(i.status === "atrasada"
                                              ? `Olá, ${i.customer.split(" ")[0]}! Tudo bem? A parcela ${i.number}/${i.total} da sua promissória (${brl(i.amount)}) venceu em ${dateBR(i.dueDate)}. Podemos combinar o pagamento?`
                                              : `Olá, ${i.customer.split(" ")[0]}! Tudo bem? Passando para lembrar que a parcela ${i.number}/${i.total} da sua promissória (${brl(i.amount)}) vence em ${dateBR(i.dueDate)}.`)}`}
                                            target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg"
                                            style={{ fontSize: 12, background: "#DCFCE7", color: "#166534", fontWeight: 600, whiteSpace: "nowrap" }}>
                                            <MessageCircle size={13} /> {i.status === "atrasada" ? "Cobrar" : "Lembrar"}
                                          </a>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quem está devendo */}
          <div style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Clientes em atraso</h3>
            <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>Todas as parcelas atrasadas, de qualquer data. Quem está há mais tempo aparece primeiro.</p>
            {data.debtors.length === 0 ? (
              <p style={{ fontSize: 13, color: "#27500A", padding: "12px 0" }}>Nenhum cliente em atraso. 🎉</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={th}>Cliente</th><th style={th}>Veículo</th><th style={th}>Parcelas atrasadas</th><th style={th}>Valor</th><th style={th}>Desde</th><th style={th}>Atraso</th><th style={th}></th></tr></thead>
                  <tbody>
                    {data.debtors.map((d) => {
                      const wa = (d.phone ?? "").replace(/\D/g, "");
                      return (
                        <tr key={d.customerId}>
                          <td style={td}><b>{d.name}</b>{d.phone && <div style={{ fontSize: 12, color: "#6B7280" }}>{phoneBR(d.phone)}</div>}</td>
                          <td style={{ ...td, color: "#4B5563" }}>{d.vehicles.join(", ")}</td>
                          <td style={td}>{d.overdueCount}</td>
                          <td style={{ ...td, fontWeight: 600, color: "#DC2626" }}>{brl(d.overdueAmount)}</td>
                          <td style={td}>{dateBR(d.oldestDueDate)}</td>
                          <td style={td}>
                            <span className="px-2 py-0.5 rounded" style={{ fontSize: 12, fontWeight: 600, background: d.daysLate > 30 ? "#FEE2E2" : "#FEF3C7", color: d.daysLate > 30 ? "#991B1B" : "#92400E" }}>
                              {d.daysLate} {d.daysLate === 1 ? "dia" : "dias"}
                            </span>
                          </td>
                          <td style={td}>
                            {wa.length >= 10 && (
                              <a href={`https://wa.me/55${wa}?text=${encodeURIComponent(`Olá, ${d.name.split(" ")[0]}! Tudo bem? Passando para lembrar que há ${d.overdueCount} parcela(s) da sua promissória em aberto, no total de ${brl(d.overdueAmount)}. Podemos combinar o pagamento?`)}`}
                                target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg"
                                style={{ fontSize: 12, background: "#DCFCE7", color: "#166534", fontWeight: 600 }}>
                                <MessageCircle size={13} /> Cobrar
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, color, label, value, sub }: { icon: typeof Wallet; color: string; label: string; value: string; sub: string }) {
  return (
    <div style={card}>
      <div className="flex items-center gap-2" style={{ fontSize: 12, color }}><Icon size={15} /> {label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#0F1923", marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6B7280" }}>{sub}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />{label}</span>;
}

// ---------- Planilha (abre no Excel com acentos e colunas certas) ----------
function exportCsv(d: PromissoryReportData) {
  const num = (v: number) => v.toFixed(2).replace(".", ",");
  const rows: (string | number)[][] = [
    ["Cliente", "Telefone", "Veículo", "Contrato", "Parcela", "Vencimento", "Valor", "Situação", "Pago em"],
    ...d.installments.map((i) => [
      i.customer, phoneBR(i.phone), i.vehicle, i.contract ?? "", `${i.number}/${i.total}`, dateBR(i.dueDate), num(i.amount), i.status,
      i.paidAt ? new Date(i.paidAt).toLocaleDateString("pt-BR") : "",
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `promissorias_${d.from}_a_${d.to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- Versão para imprimir / salvar em PDF ----------
function printReport(d: PromissoryReportData) {
  const win = window.open("", "_blank");
  if (!win) { alert("O navegador bloqueou a nova aba. Libere os pop-ups para este site."); return; }
  const p = d.period, c = d.portfolio;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de promissórias</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 12px; margin: 0; }
    .page { max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 18px; margin: 0; } h2 { font-size: 14px; margin: 18px 0 6px; }
    .muted { color: #666; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
    .kpi { border: 1px solid #ccc; border-radius: 6px; padding: 8px; } .kpi b { display: block; font-size: 15px; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; } th, td { border-bottom: 1px solid #ddd; padding: 5px 6px; text-align: left; }
    th { background: #f3f3f3; font-size: 11px; }
    .toolbar { position: sticky; top: 0; background: #185FA5; color: #fff; padding: 10px 16px; display: flex; justify-content: space-between; align-items: center; }
    .toolbar button { background: #fff; color: #185FA5; border: 0; border-radius: 6px; padding: 7px 14px; font-weight: bold; cursor: pointer; }
    @media print { .toolbar { display: none; } .page { padding: 0; } }
  </style></head><body>
  <div class="toolbar"><span>Relatório de promissórias</span><button onclick="window.print()">Imprimir / salvar em PDF</button></div>
  <div class="page">
    <h1>Relatório de promissórias</h1>
    <div class="muted">Período (vencimento): ${dateBR(d.from + "T12:00:00Z")} a ${dateBR(d.to + "T12:00:00Z")} · gerado em ${new Date().toLocaleString("pt-BR")}</div>
    <div class="kpis">
      <div class="kpi">Vence no período<b>${brl(p.dueAmount)}</b><span class="muted">${p.dueCount} parcelas</span></div>
      <div class="kpi">Recebido no período<b>${brl(p.receivedAmount)}</b><span class="muted">${p.receivedCount} parcelas</span></div>
      <div class="kpi">Carteira a receber<b>${brl(c.openAmount)}</b><span class="muted">${c.activePromissories} promissórias</span></div>
      <div class="kpi">Em atraso (total)<b>${brl(c.overdueAmount)}</b><span class="muted">${c.overdueCount} parcelas</span></div>
      <div class="kpi">Inadimplência<b>${c.delinquencyRate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b><span class="muted">do que já venceu</span></div>
    </div>
    <h2>Mês a mês</h2>
    <table><tr><th>Mês</th><th>Parcelas</th><th>Vence</th><th>Pago</th><th>A vencer</th><th>Atrasado</th></tr>
      ${d.months.map((m) => `<tr><td>${monthLabel(m.month)}</td><td>${m.count}</td><td>${brl(m.due)}</td><td>${brl(m.paid)}</td><td>${brl(m.open)}</td><td>${brl(m.overdue)}</td></tr>`).join("")}
    </table>
    <h2>Clientes em atraso</h2>
    ${d.debtors.length ? `<table><tr><th>Cliente</th><th>Telefone</th><th>Veículo</th><th>Parcelas</th><th>Valor</th><th>Desde</th><th>Atraso</th></tr>
      ${d.debtors.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(phoneBR(x.phone))}</td><td>${esc(x.vehicles.join(", "))}</td><td>${x.overdueCount}</td><td>${brl(x.overdueAmount)}</td><td>${dateBR(x.oldestDueDate)}</td><td>${x.daysLate} dias</td></tr>`).join("")}
    </table>` : `<p>Nenhum cliente em atraso.</p>`}
  </div></body></html>`;
  win.document.open(); win.document.write(html); win.document.close();
}