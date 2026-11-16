// Início do vendedor: só os números dele (vendas, comissão, leads e tarefas).
// Não mostra nada de custo, lucro ou financeiro da loja.
import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlarmClock, Car, ChevronRight, HandCoins, MessageSquare, Plus, ShoppingBag, Users, Wallet } from "lucide-react";
import * as api from "../../lib/api";
import * as crm from "../../lib/crm-api";
import type { SaleFull } from "../../lib/sales-api";
import { useAuth } from "../../lib/auth-context";
import { usePlan } from "../../lib/plan-context";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Mês "AAAA-MM" de N meses atrás (dia 1 para não pular mês curto)
function monthAt(offset: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return { param: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MONTHS[d.getMonth()] };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const card = { background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)", borderRadius: 12 } as const;

export function SellerDashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const auth = useAuth();
  const plan = usePlan();
  const hasCrm = plan.has("crm");
  const hasChat = plan.has("chat");

  const [summary, setSummary] = useState<api.SaleSummary | null>(null);
  const [pendingCommission, setPendingCommission] = useState<number | null>(null);
  const [commissionRate, setCommissionRate] = useState<number | null>(null);
  const [chart, setChart] = useState<{ month: string; vendas: number }[]>([]);
  const [recent, setRecent] = useState<SaleFull[]>([]);
  const [available, setAvailable] = useState<number | null>(null);
  const [leads, setLeads] = useState<crm.CrmSummary | null>(null);
  const [tasks, setTasks] = useState<crm.CrmTask[]>([]);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const months = [5, 4, 3, 2, 1, 0].map(monthAt);
    // Cada bloco carrega sozinho: se um falhar, os outros continuam aparecendo
    const results = await Promise.allSettled([
      Promise.all(months.map((m) => api.getSaleSummary(m.param))).then((list) => {
        setSummary(list[list.length - 1]);
        setChart(list.map((s, i) => ({ month: months[i].label, vendas: s.count })));
      }),
      // Para o vendedor, /sellers devolve só ele mesmo
      api.listSellers().then((list) => {
        const me = list.find((s) => s.id === auth.user?.id) ?? list[0];
        setPendingCommission(Number(me?.metrics?.commissionPending ?? 0));
        setCommissionRate(me?.commissionRate ?? null);
      }),
      api.listSales({ pageSize: 5 }).then((r) => setRecent(r.items as unknown as SaleFull[])),
      api.listVehicles({ status: "available", pageSize: 1 }).then((r) => setAvailable(r.total)),
      hasCrm ? crm.getSummary({}).then(setLeads) : Promise.resolve(),
      hasCrm ? crm.getReminders().then((r) => setTasks(r.items.slice(0, 5))) : Promise.resolve(),
    ]);
    if (results.some((r) => r.status === "rejected")) setFailed(true);
  }, [auth.user?.id, hasCrm]);

  useEffect(() => { load(); }, [load]);

  const firstName = auth.user?.name?.split(" ")[0] ?? "";
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const dash = "—";

  const stats = [
    { label: "Minhas vendas no mês", value: summary ? String(summary.count) : dash, hint: summary?.canceledCount ? `${summary.canceledCount} cancelada(s)` : "vendas ativas", icon: ShoppingBag, bg: "#EBF2FA", color: "#185FA5" },
    { label: "Valor vendido no mês", value: summary ? brl(summary.totalRevenue) : dash, hint: "soma das minhas vendas", icon: Wallet, bg: "#EAF3DE", color: "#27500A" },
    { label: "Minha comissão no mês", value: summary ? brl(Number(summary.totalCommission ?? 0)) : dash, hint: commissionRate != null ? `${commissionRate.toLocaleString("pt-BR")}% por venda` : "sobre as minhas vendas", icon: HandCoins, bg: "#F3E8FF", color: "#7C3AED" },
    { label: "Comissão a receber", value: pendingCommission != null ? brl(pendingCommission) : dash, hint: "ainda não paga pela loja", icon: AlarmClock, bg: "#FEF3C7", color: "#92400E" },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ background: "var(--background)" }}>
      <div className="flex items-center justify-between gap-4 px-6 py-5 flex-shrink-0 flex-wrap" style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
        <div>
          <h2>{greeting()}, {firstName} 👋</h2>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{today.charAt(0).toUpperCase() + today.slice(1)} · Área do vendedor</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onNavigate("inventory")} className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: "#fff", color: "#185FA5", border: "1px solid #185FA5", fontSize: 13, fontWeight: 500 }}>
            <Car size={16} /> Ver estoque
          </button>
          <button onClick={() => onNavigate("sales")} className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500 }}>
            <Plus size={16} /> Registrar venda
          </button>
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col gap-4">
        {failed && (
          <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: "#FEF3C7", color: "#92400E", fontSize: 13 }}>
            <span>Alguns números não carregaram.</span>
            <button onClick={load} style={{ fontWeight: 600 }}>Tentar novamente</button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, hint, icon: Icon, bg, color }) => (
            <div key={label} className="p-4" style={card}>
              <div className="flex items-start justify-between">
                <span style={{ fontSize: 13, color: "#6B7280" }}>{label}</span>
                <span className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: bg }}><Icon size={16} style={{ color }} /></span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, color: "#0F1923", marginTop: 8 }}>{value}</div>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{hint}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="p-5 lg:col-span-2" style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Minhas vendas — últimos 6 meses</h3>
            <div style={{ height: 220, marginTop: 12 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#F4F6F9" }} formatter={(v) => [`${v} venda(s)`, ""]} separator="" />
                  <Bar dataKey="vendas" fill="#185FA5" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="p-5 flex flex-col gap-3" style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>Atalhos</h3>
            {[
              { page: "inventory", icon: Car, title: "Estoque", text: available != null ? `${available} veículo(s) disponíveis` : "Consultar veículos e preços" },
              ...(hasCrm ? [{ page: "leads", icon: Users, title: "Meus leads", text: leads ? `${leads.total} em andamento${leads.unattended ? ` · ${leads.unattended} sem atendimento` : ""}` : "Acompanhar negociações" }] : []),
              ...(hasChat ? [{ page: "chat", icon: MessageSquare, title: "Atendimentos", text: "Conversas com clientes" }] : []),
              { page: "customers", icon: Users, title: "Meus clientes", text: "Cadastro e histórico" },
            ].map(({ page, icon: Icon, title, text }) => (
              <button key={page} onClick={() => onNavigate(page)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#F9FAFB]"
                style={{ border: "0.5px solid rgba(0,0,0,0.08)" }}>
                <span className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 34, height: 34, background: "#EBF2FA" }}><Icon size={16} style={{ color: "#185FA5" }} /></span>
                <span className="flex-1 min-w-0">
                  <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#0F1923" }}>{title}</span>
                  <span style={{ display: "block", fontSize: 12, color: "#6B7280" }}>{text}</span>
                </span>
                <ChevronRight size={15} style={{ color: "#9CA3AF" }} />
              </button>
            ))}
          </div>
        </div>

        <div className={`grid grid-cols-1 ${hasCrm ? "lg:grid-cols-2" : ""} gap-4`}>
          <div className="p-5" style={card}>
            <div className="flex items-center justify-between">
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>Minhas últimas vendas</h3>
              <button onClick={() => onNavigate("sales")} style={{ fontSize: 13, color: "#185FA5", fontWeight: 500 }}>Ver todas →</button>
            </div>
            {recent.length === 0 ? (
              <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 12 }}>Você ainda não registrou vendas.</p>
            ) : (
              <div className="flex flex-col" style={{ marginTop: 8 }}>
                {recent.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: i ? "0.5px solid rgba(0,0,0,0.06)" : "none", opacity: s.status === "canceled" ? 0.55 : 1 }}>
                    <div className="min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#0F1923" }}>{s.vehicle.brand} {s.vehicle.model} {s.vehicle.year}</div>
                      <div style={{ fontSize: 12, color: "#6B7280" }}>{s.customer.name} · {new Date(s.soldAt).toLocaleDateString("pt-BR")}{s.status === "canceled" ? " · cancelada" : ""}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#0F1923" }}>{brl(Number(s.price))}</div>
                      {Number(s.commissionAmount) > 0 && (
                        <div style={{ fontSize: 12, color: s.commissionPaidAt ? "#15803D" : "#92400E" }}>
                          comissão {brl(Number(s.commissionAmount))}{s.commissionPaidAt ? " · paga" : " · a receber"}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {hasCrm && (
            <div className="p-5" style={card}>
              <div className="flex items-center justify-between">
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>Minhas tarefas</h3>
                <button onClick={() => onNavigate("leads")} style={{ fontSize: 13, color: "#185FA5", fontWeight: 500 }}>Abrir CRM →</button>
              </div>
              {leads && leads.overdueTasks > 0 && (
                <p style={{ fontSize: 12, color: "#B91C1C", marginTop: 6 }}>{leads.overdueTasks} tarefa(s) atrasada(s)</p>
              )}
              {tasks.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 12 }}>Nenhum lembrete pendente agora.</p>
              ) : (
                <div className="flex flex-col" style={{ marginTop: 8 }}>
                  {tasks.map((t, i) => {
                    const late = new Date(t.dueAt).getTime() < Date.now();
                    return (
                      <div key={t.id} className="flex items-center justify-between gap-3 py-2.5" style={{ borderTop: i ? "0.5px solid rgba(0,0,0,0.06)" : "none" }}>
                        <span style={{ fontSize: 13, color: "#0F1923" }}>{t.title}</span>
                        <span style={{ fontSize: 12, color: late ? "#B91C1C" : "#6B7280", whiteSpace: "nowrap" }}>
                          {new Date(t.dueAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
