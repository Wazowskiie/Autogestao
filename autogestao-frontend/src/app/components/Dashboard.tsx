import { useCallback, useEffect, useState } from "react";
import { Bell, Plus, TrendingUp, Car, Users, DollarSign, AlertTriangle, Clock } from "lucide-react";
import {
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart
} from "recharts";
import { StatusBadge } from "./StatusBadge";
import * as api from "../../lib/api";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthLabel(offset: number): string {
  const labels = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return labels[d.getMonth()];
}

function monthParam(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function timeAgo(dateStr: string): string {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < 60) return `há ${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d}d`;
}

type PageProps = { onNavigate: (page: string) => void };

export function Dashboard({ onNavigate }: PageProps) {
  const today = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const todayFormatted = today.charAt(0).toUpperCase() + today.slice(1);

  const [userName, setUserName] = useState("...");
  const [vehicleTotal, setVehicleTotal] = useState<number | null>(null);
  const [leadsTotal, setLeadsTotal] = useState<number | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<api.SaleSummary | null>(null);
  const [financialSummary, setFinancialSummary] = useState<api.FinancialSummary | null>(null);
  const [recentLeads, setRecentLeads] = useState<api.Lead[]>([]);
  const [staleVehicles, setStaleVehicles] = useState<api.Vehicle[]>([]);
  const [chartData, setChartData] = useState<{ month: string; vendas: number; receita: number }[]>([]);

  const fetchAll = useCallback(async () => {
    const currentMonth = monthParam(0);

    try {
      const [
        vehiclesRes,
        leadsRes,
        salesSum,
        finSum,
        chartMonths,
      ] = await Promise.all([
        api.listVehicles({ status: "available", pageSize: 1 }),
        api.listLeads(),
        api.getSaleSummary(currentMonth),
        api.getFinancialSummary(currentMonth),
        Promise.all(
          [5,4,3,2,1,0].map(async (offset) => {
            const m = monthParam(offset);
            const s = await api.getSaleSummary(m).catch(() => ({ count: 0, totalRevenue: 0 } as api.SaleSummary));
            return { month: monthLabel(offset), vendas: s.count, receita: s.totalRevenue };
          })
        ),
      ]);

      setVehicleTotal(vehiclesRes.total);

      const allLeads = Object.values(leadsRes).flat() as api.Lead[];
      setLeadsTotal(allLeads.length);
      setRecentLeads(allLeads.slice(0, 5));

      setMonthlySummary(salesSum);
      setFinancialSummary(finSum);
      setChartData(chartMonths);
    } catch {
      // erros silenciosos — cada card fica com null e mostra "—"
    }

    // Veículos parados: disponíveis mais antigos (mais de 30 dias)
    try {
      const stale = await api.listVehicles({ status: "available", pageSize: 100 });
      const sorted = stale.items
        .filter(v => daysAgo(v.createdAt) > 30)
        .sort((a, b) => daysAgo(b.createdAt) - daysAgo(a.createdAt))
        .slice(0, 3);
      setStaleVehicles(sorted);
    } catch {}

    // Nome do usuário logado
    try {
      const me = await api.getMe();
      setUserName(me.user.name.split(" ")[0]);
    } catch {}
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const receita = financialSummary?.totalRevenue ?? 0;
  const receitaK = receita >= 1000 ? `R$ ${(receita / 1000).toFixed(0)}k` : currency(receita);

  const STAGE_STATUS: Record<string, string> = {
    new: "new_lead",
    contacted: "contacted",
    negotiating: "negotiating",
    won: "won",
    lost: "lost",
  };

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>Bom dia, {userName} 👋</h2>
          <p style={{ fontSize: 13, color: "#6B7280" }}>{todayFormatted}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-lg" style={{ background: "#F4F6F9" }}>
            <Bell size={18} style={{ color: "#374151" }} />
            <span className="absolute top-1 right-1 rounded-full" style={{ width: 8, height: 8, background: "#DC2626" }} />
          </button>
          <button onClick={() => onNavigate("inventory")} className="flex items-center gap-2 px-4 py-2 rounded-lg"
            style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500 }}>
            <Plus size={16} /> Adicionar veículo
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Metric cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: "Veículos em estoque", value: vehicleTotal !== null ? String(vehicleTotal) : "—", delta: "disponíveis", icon: Car, color: "#185FA5", bg: "#EBF2FA" },
            { label: "Leads este mês", value: leadsTotal !== null ? String(leadsTotal) : "—", delta: "ativos no funil", icon: Users, color: "#27500A", bg: "#EAF3DE" },
            { label: "Vendas este mês", value: monthlySummary !== null ? String(monthlySummary.count) : "—", delta: `Lucro: ${monthlySummary ? currency(monthlySummary.totalProfit) : "—"}`, icon: TrendingUp, color: "#D97706", bg: "#FEF3C7" },
            { label: "Receita do mês", value: receitaK, delta: `Saldo: ${financialSummary ? currency(financialSummary.balance) : "—"}`, icon: DollarSign, color: "#185FA5", bg: "#EBF2FA" },
          ].map(({ label, value, delta, icon: Icon, color, bg }) => (
            <div key={label} className="rounded-xl p-4" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)" }}>
              <div className="flex items-center justify-between mb-3">
                <span style={{ fontSize: 12, color: "#6B7280" }}>{label}</span>
                <div className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: bg }}>
                  <Icon size={16} style={{ color }} />
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>{value}</div>
              <div style={{ fontSize: 11, color: "#9CA3AF" }}>{delta}</div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="rounded-xl p-5" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)" }}>
          <div className="flex items-center justify-between mb-4">
            <h3>Vendas & Receita — últimos 6 meses</h3>
            <div className="flex items-center gap-4" style={{ fontSize: 12, color: "#6B7280" }}>
              <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: "#185FA5", display: "inline-block" }} /> Vendas</span>
              <span className="flex items-center gap-1.5"><span style={{ width: 10, height: 2, background: "#27500A", display: "inline-block" }} /> Receita</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={30} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={60}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "0.5px solid rgba(0,0,0,0.08)", fontSize: 13 }}
                formatter={(value: number, name: string) => [
                  name === "vendas" ? `${value} vendas` : currency(value),
                  name === "vendas" ? "Vendas" : "Receita",
                ]} />
              <Bar yAxisId="left" dataKey="vendas" fill="#185FA5" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Line yAxisId="right" type="monotone" dataKey="receita" stroke="#27500A" strokeWidth={2} dot={{ fill: "#27500A", r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Two panels */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Leads recentes */}
          <div className="rounded-xl p-5" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3>Leads recentes</h3>
              <button onClick={() => onNavigate("leads")} style={{ fontSize: 13, color: "#185FA5", fontWeight: 500 }}>Ver todos →</button>
            </div>
            {recentLeads.length === 0 && (
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Nenhum lead cadastrado ainda.</p>
            )}
            <div className="space-y-3">
              {recentLeads.map((lead) => {
                const name = lead.customer?.name ?? "Sem cliente";
                const initials = name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
                const vehicle = lead.vehicle ? `${lead.vehicle.brand} ${lead.vehicle.model}` : lead.source ?? "—";
                return (
                  <div key={lead.id} className="flex items-center gap-3">
                    <div className="flex items-center justify-center rounded-full flex-shrink-0"
                      style={{ width: 34, height: 34, background: "#EBF2FA", color: "#185FA5", fontSize: 12, fontWeight: 600 }}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
                      <div style={{ fontSize: 12, color: "#6B7280" }}>{vehicle}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={STAGE_STATUS[lead.stage] ?? lead.stage} />
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>{timeAgo(lead.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Veículos parados */}
          <div className="rounded-xl p-5" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3>Veículos parados</h3>
              <span style={{ fontSize: 12, color: "#D97706", fontWeight: 500, background: "#FEF3C7", padding: "2px 8px", borderRadius: 99 }}>+30 dias</span>
            </div>
            {staleVehicles.length === 0 && (
              <p style={{ fontSize: 13, color: "#9CA3AF" }}>Nenhum veículo parado há mais de 30 dias.</p>
            )}
            <div className="space-y-3">
              {staleVehicles.map((v) => (
                <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#FAFAFA", border: "0.5px solid rgba(0,0,0,0.06)" }}>
                  <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 40, height: 40, background: "#F4F6F9" }}>
                    <Car size={18} style={{ color: "#CBD5E1" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{v.brand} {v.model} {v.year}</div>
                    <div style={{ fontSize: 12, color: "#D97706" }}>{daysAgo(v.createdAt)} dias sem movimentação</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{currency(Number(v.price))}</div>
                    <button onClick={() => onNavigate("inventory")} style={{ fontSize: 11, color: "#185FA5", fontWeight: 500 }}>Ajustar preço</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { icon: AlertTriangle, color: "#D97706", bg: "#FEF3C7", title: "Anúncios", desc: "Configure anúncios na aba Anúncios" },
            { icon: Clock, color: "#DC2626", bg: "#FEE2E2", title: "Promissórias vencidas", desc: "Verifique promissórias em atraso" },
            { icon: Car, color: "#185FA5", bg: "#EBF2FA", title: "Estoque disponível", desc: `${vehicleTotal ?? "—"} veículos disponíveis para venda` },
          ].map(({ icon: Icon, color, bg, title, desc }) => (
            <div key={title} className="flex items-start gap-3 rounded-xl p-4"
              style={{ background: "#fff", border: `0.5px solid ${bg}` }}>
              <div className="flex items-center justify-center rounded-lg flex-shrink-0" style={{ width: 34, height: 34, background: bg }}>
                <Icon size={16} style={{ color }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{title}</div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}