import { useCallback, useEffect, useState } from "react";
import { Search, Plus, Trophy, TrendingUp, DollarSign, X, User, Mail, Lock, Phone, Briefcase, Percent, Eye, EyeOff, ChevronDown, Pencil, Trash2, AlertTriangle } from "lucide-react";
import * as api from "../../lib/api";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const RANK_COLORS = ["#D97706", "#6B7280", "#92400E"];

export function Sellers() {
  const [sellers, setSellers] = useState<api.Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(currentMonth());
  const [showModal, setShowModal] = useState(false);
  const [editingSeller, setEditingSeller] = useState<api.Seller | null>(null);
  const [deletingSeller, setDeletingSeller] = useState<api.Seller | null>(null);

  const fetchSellers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listSellers(month);
      setSellers([...res].sort((a, b) => b.metrics.totalRevenue - a.metrics.totalRevenue));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar vendedores");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { fetchSellers(); }, [fetchSellers]);

  const filtered = sellers.filter((s) => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  const totalRevenue = sellers.reduce((sum, s) => sum + s.metrics.totalRevenue, 0);
  const totalSales = sellers.reduce((sum, s) => sum + s.metrics.salesCount, 0);

  return (
    <div className="size-full flex flex-col overflow-hidden" style={{ background: "var(--background)" }}>
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0" style={{ background: "#fff", borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2>Vendedores</h2>
            <p style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>Acompanhe a performance da equipe</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg px-3 py-2" style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13 }} />
            <button onClick={() => setShowModal(true)} className="px-4 py-2 rounded-lg flex items-center gap-2" style={{ background: "var(--primary)", color: "#fff", fontSize: 13 }}>
              <Plus size={16} /> Novo Vendedor
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { label: "Vendedores ativos", value: String(sellers.length), icon: Trophy, color: "#185FA5" },
            { label: "Vendas no período", value: String(totalSales), icon: TrendingUp, color: "#27500A" },
            { label: "Receita total", value: currency(totalRevenue), icon: DollarSign, color: "#92400E" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="p-4 rounded-xl" style={{ background: "#F4F6F9" }}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={16} style={{ color }} />
                <span style={{ fontSize: 12, color: "#6B7280" }}>{label}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: "#0F1923" }}>{value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "var(--input-background)" }}>
          <Search size={16} style={{ color: "#9CA3AF" }} />
          <input placeholder="Buscar vendedor..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent outline-none" style={{ fontSize: 13 }} />
        </div>
      </div>

      {error && (
        <div className="px-6 pt-4">
          <div className="rounded-lg px-4 py-3 flex items-center justify-between" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
            <span>{error}</span>
            <button onClick={fetchSellers} style={{ fontWeight: 500 }}>Tentar novamente</button>
          </div>
        </div>
      )}

      {/* Cards */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 16px", fontSize: 13, color: "#9CA3AF" }}>
            Nenhum vendedor cadastrado ainda. Clique em "Novo Vendedor" para começar.
          </div>
        )}
        {/* items-stretch faz os dois lados ocuparem a mesma altura;
            sem maxWidth fixo, a lista de vendedores usa o espaço que sobrar */}
        <div className="flex items-stretch gap-6">
          <div className="grid grid-cols-1 gap-4 flex-1">
            {filtered.map((seller, idx) => {
              const rankColor = RANK_COLORS[idx] ?? "#9CA3AF";
              const initials = seller.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
              return (
                <div key={seller.id} className="group relative p-5 rounded-xl flex items-center gap-5" style={{ background: "#fff", border: "1px solid var(--border)" }}>
                  <div className="relative flex-shrink-0">
                    <div className="flex items-center justify-center rounded-full" style={{ width: 48, height: 48, background: "#EBF2FA", color: "#185FA5", fontSize: 16, fontWeight: 700 }}>
                      {initials}
                    </div>
                    {idx < 3 && (
                      <div className="absolute -top-1 -right-1 flex items-center justify-center rounded-full" style={{ width: 18, height: 18, background: rankColor, color: "#fff", fontSize: 10, fontWeight: 700 }}>
                        {idx + 1}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0F1923" }}>{seller.name}</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>{seller.email}</div>
                    {seller.jobTitle && (
                      <div style={{ fontSize: 11, color: "#185FA5", marginTop: 2 }}>{seller.jobTitle}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-8">
                    {[
                      { label: "Vendas", value: String(seller.metrics.salesCount) },
                      { label: "Receita", value: currency(seller.metrics.totalRevenue) },
                      { label: "Lucro gerado", value: currency(seller.metrics.totalProfit) },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-right">
                        <div style={{ fontSize: 12, color: "#9CA3AF" }}>{label}</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#0F1923" }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Ações: editar / excluir */}
                  <div className="absolute flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ top: 12, right: 12 }}>
                    <button
                      onClick={() => setEditingSeller(seller)}
                      title="Editar vendedor"
                      className="flex items-center justify-center rounded-lg"
                      style={{ width: 30, height: 30, background: "#F4F6F9", color: "#374151" }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeletingSeller(seller)}
                      title="Excluir vendedor"
                      className="flex items-center justify-center rounded-lg"
                      style={{ width: 30, height: 30, background: "#FEE2E2", color: "#DC2626" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {sellers.length > 0 && <RankingPanel sellers={sellers} month={month} />}
        </div>
      </div>

      {showModal && (
        <SellerModal onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); fetchSellers(); }} />
      )}

      {editingSeller && (
        <SellerModal
          seller={editingSeller}
          onClose={() => setEditingSeller(null)}
          onSaved={() => { setEditingSeller(null); fetchSellers(); }}
        />
      )}

      {deletingSeller && (
        <ConfirmDeleteModal
          seller={deletingSeller}
          onClose={() => setDeletingSeller(null)}
          onDeleted={() => { setDeletingSeller(null); fetchSellers(); }}
        />
      )}
    </div>
  );
}

const MEDALHAS = ["🥇", "🥈", "🥉"];

function monthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  const date = new Date(year, m - 1, 1);
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function RankingPanel({ sellers, month }: { sellers: api.Seller[]; month: string }) {
  const top = sellers.slice(0, 5);
  const maxRevenue = Math.max(1, ...top.map((s) => s.metrics.totalRevenue));
  const lider = top[0];

  return (
    // flex: "0 0 42%" faz o card ocupar ~42% da largura total do container,
    // esticando na HORIZONTAL em vez de ter uma largura fixa em px.
    // Ajuste esse percentual (ex: 38%, 45%) conforme preferir o equilíbrio visual.
    <div
      className="rounded-2xl flex flex-col"
      style={{
        flex: "0 0 42%",
        minWidth: 340,
        height: "100%",
        background: "#fff",
        border: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      <div className="px-6 py-5 flex-shrink-0" style={{ background: "#0F1923" }}>
        <div className="flex items-center gap-2">
          <Trophy size={20} style={{ color: "#D97706" }} />
          <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Ranking do mês</span>
        </div>
        <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 3 }}>{monthLabel(month)}</p>

        {lider && lider.metrics.totalRevenue > 0 && (
          <div className="flex items-center gap-3 rounded-xl" style={{ marginTop: 18, padding: 14, background: "rgba(217,119,6,0.12)" }}>
            <span style={{ fontSize: 28 }}>🥇</span>
            <div className="min-w-0">
              <div style={{ fontSize: 11, color: "#F5C177", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Líder de vendas</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lider.name}</div>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-5 flex-1 flex flex-col justify-center gap-4 overflow-auto">
        {top.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "24px 0" }}>
            Nenhum vendedor cadastrado ainda.
          </p>
        ) : (
          top.map((seller, idx) => {
            const initials = seller.name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
            const pct = seller.metrics.totalRevenue > 0 ? Math.max(4, Math.round((seller.metrics.totalRevenue / maxRevenue) * 100)) : 0;
            return (
              <div key={seller.id} className="flex items-center gap-4">
                <div className="flex items-center justify-center flex-shrink-0" style={{ width: 28, fontSize: idx < 3 ? 22 : 15, fontWeight: 700, color: "#9CA3AF" }}>
                  {idx < 3 ? MEDALHAS[idx] : idx + 1}
                </div>
                <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 44, height: 44, background: "#EBF2FA", color: "#185FA5", fontSize: 15, fontWeight: 700 }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0F1923", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {seller.name}
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 6, background: "#F4F6F9", marginTop: 6 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: idx === 0 ? "#D97706" : "var(--primary)", transition: "width 0.3s" }} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0F1923" }}>{currency(seller.metrics.totalRevenue)}</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{seller.metrics.salesCount} venda{seller.metrics.salesCount === 1 ? "" : "s"}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const JOB_TITLES = ["Vendedor", "Vendedor Sênior", "Gerente de Vendas", "Consultor Financeiro"];

function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function initialsOf(name: string) {
  if (!name.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Modal único para criar OU editar vendedor.
 * Se `seller` for passado, entra em modo edição:
 *  - campos vêm pré-preenchidos
 *  - senha é opcional (deixe em branco para manter a atual)
 *  - chama api.updateSeller(seller.id, dados) em vez de api.createSeller
 */
function SellerModal({ seller, onClose, onSaved }: { seller?: api.Seller; onClose: () => void; onSaved: () => void }) {
  const isEditing = !!seller;
  const [name, setName] = useState(seller?.name ?? "");
  const [email, setEmail] = useState(seller?.email ?? "");
  const [phone, setPhone] = useState(seller?.phone ? formatPhone(seller.phone) : "");
  const [jobTitle, setJobTitle] = useState(seller?.jobTitle ?? JOB_TITLES[0]);
  const [jobTitleOpen, setJobTitleOpen] = useState(false);
  const [commissionRate, setCommissionRate] = useState(String(seller?.commissionRate ?? 3));
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [active, setActive] = useState(seller?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = (() => {
    if (!password) return 0;
    let f = 0;
    if (password.length >= 8) f++;
    if (/[A-Z]/.test(password)) f++;
    if (/[0-9]/.test(password)) f++;
    if (/[^A-Za-z0-9]/.test(password)) f++;
    return f;
  })();
  const strengthLabel = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"][strength];
  const strengthColor = ["#DC2626", "#D97706", "#CA8A04", "var(--primary)", "#27500A"][strength];

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().split(/\s+/).length < 2) e.name = "Informe nome e sobrenome";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "E-mail inválido";
    if (phone && phone.replace(/\D/g, "").length < 10) e.phone = "Telefone incompleto";
    // Na edição a senha é opcional: só valida se o usuário digitou algo
    if (!isEditing && password.length < 8) e.password = "Mínimo de 8 caracteres";
    if (isEditing && password && password.length < 8) e.password = "Mínimo de 8 caracteres";
    const c = Number(commissionRate);
    if (Number.isNaN(c) || c < 0 || c > 100) e.commissionRate = "Entre 0 e 100";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        name,
        email,
        phone: phone.replace(/\D/g, ""),
        jobTitle,
        commissionRate: Number(commissionRate),
        active,
      };
      if (password) payload.password = password;

      if (isEditing && seller) {
        await api.updateSeller(seller.id, payload);
      } else {
        await api.createSeller({ ...payload, password });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Erro ao ${isEditing ? "atualizar" : "cadastrar"} vendedor`);
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = (hasError?: boolean) => ({
    border: hasError ? "1px solid #DC2626" : "0.5px solid rgba(0,0,0,0.12)",
    fontSize: 13,
    outline: "none",
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full rounded-xl overflow-hidden" style={{ background: "#fff", maxWidth: 480, margin: 16, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>

        <div className="relative px-6 pt-5 pb-8" style={{ background: "#0F1923" }}>
          <button onClick={onClose} className="absolute right-5 top-5" style={{ color: "#9CA3AF" }}><X size={20} /></button>
          <p style={{ fontSize: 11, color: "#185FA5", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
            Equipe de vendas
          </p>
          <h3 style={{ color: "#fff" }}>{isEditing ? "Editar Vendedor" : "Novo Vendedor"}</h3>
          <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>
            {isEditing ? "Atualize os dados e condições do vendedor." : "Cadastre o acesso e as condições do vendedor."}
          </p>
          <div className="absolute flex items-center justify-center rounded-full"
            style={{ right: 24, bottom: -20, width: 44, height: 44, background: "var(--primary)", color: "#fff", fontWeight: 700, fontSize: 14, border: "3px solid #fff" }}>
            {initialsOf(name)}
          </div>
        </div>

        <div className="px-6 pt-7 pb-5 overflow-auto">
          {error && <div className="rounded-lg px-3 py-2 mb-3" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Nome completo</label>
              <div className="relative">
                <User size={15} className="absolute" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="João Silva"
                  className="w-full rounded-lg pl-9 pr-3 py-2.5" style={fieldStyle(!!errors.name)} />
              </div>
              {errors.name && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.name}</p>}
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>E-mail</label>
              <div className="relative">
                <Mail size={15} className="absolute" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@autogestao.com"
                  className="w-full rounded-lg pl-9 pr-3 py-2.5" style={fieldStyle(!!errors.email)} />
              </div>
              {errors.email && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.email}</p>}
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Telefone</label>
              <div className="relative">
                <Phone size={15} className="absolute" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
                <input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(85) 99999-9999"
                  className="w-full rounded-lg pl-9 pr-3 py-2.5" style={fieldStyle(!!errors.phone)} />
              </div>
              {errors.phone && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.phone}</p>}
            </div>

            <div className="col-span-2 sm:col-span-1 relative">
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Cargo</label>
              <button type="button" onClick={() => setJobTitleOpen((v) => !v)}
                className="w-full rounded-lg pl-9 pr-3 py-2.5 relative text-left"
                style={{ ...fieldStyle(), background: "#fff" }}>
                <Briefcase size={15} className="absolute" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
                {jobTitle}
                <ChevronDown size={15} className="absolute" style={{ right: 11, top: 11, color: "#9CA3AF" }} />
              </button>
              {jobTitleOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-lg overflow-hidden" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.12)", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                  {JOB_TITLES.map((jt) => (
                    <button type="button" key={jt} onClick={() => { setJobTitle(jt); setJobTitleOpen(false); }}
                      className="w-full text-left px-3 py-2"
                      style={{ fontSize: 13, color: jt === jobTitle ? "var(--primary)" : "#374151", background: jt === jobTitle ? "#EBF2FA" : "transparent" }}>
                      {jt}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Comissão por venda (%)</label>
              <div className="relative">
                <Percent size={15} className="absolute" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
                <input type="number" min="0" max="100" step="0.5" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)}
                  className="w-full rounded-lg pl-9 pr-3 py-2.5" style={fieldStyle(!!errors.commissionRate)} />
              </div>
              {errors.commissionRate && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.commissionRate}</p>}
            </div>

            <div className="col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 13, color: "#374151" }}>{isEditing ? "Nova senha (opcional)" : "Senha inicial"}</label>
                <button type="button" onClick={() => setPassword(generatePassword())} style={{ fontSize: 11, color: "var(--primary)", fontWeight: 600 }}>
                  Gerar senha
                </button>
              </div>
              <div className="relative">
                <Lock size={15} className="absolute" style={{ left: 11, top: 11, color: "#9CA3AF" }} />
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEditing ? "Deixe em branco para manter" : "Mínimo 8 caracteres"}
                  className="w-full rounded-lg pl-9 pr-9 py-2.5" style={fieldStyle(!!errors.password)} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute" style={{ right: 11, top: 11, color: "#9CA3AF" }}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {password && (
                <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                  <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: "#F4F6F9" }}>
                    <div style={{ height: "100%", width: `${(strength / 4) * 100}%`, background: strengthColor, transition: "width 0.2s" }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>{strengthLabel}</span>
                </div>
              )}
              {errors.password && <p style={{ fontSize: 11, color: "#DC2626", marginTop: 4 }}>{errors.password}</p>}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ border: "0.5px solid rgba(0,0,0,0.12)", marginTop: 16 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#0F1923" }}>Conta ativa</p>
              <p style={{ fontSize: 11, color: "#9CA3AF" }}>O vendedor poderá acessar o sistema imediatamente.</p>
            </div>
            <button type="button" onClick={() => setActive((v) => !v)}
              className="relative flex-shrink-0" style={{ width: 40, height: 22, borderRadius: 999, background: active ? "var(--primary)" : "#D1D5DB" }}>
              <span className="absolute rounded-full" style={{ top: 2, left: active ? 20 : 2, width: 18, height: 18, background: "#fff", transition: "left 0.15s" }} />
            </button>
          </div>

          <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 12 }}>
            {isEditing ? "Deixe a senha em branco se não quiser alterá-la." : "O vendedor vai usar esse e-mail e senha pra entrar no sistema."}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving} className="px-6 py-2 rounded-lg" style={{ background: "var(--primary)", color: "#fff", fontSize: 13, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Cadastrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({ seller, onClose, onDeleted }: { seller: api.Seller; onClose: () => void; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteSeller(seller.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir vendedor");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full rounded-xl overflow-hidden" style={{ background: "#fff", maxWidth: 400, margin: 16 }}>
        <div className="px-6 pt-6 pb-2 flex items-start gap-3">
          <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 40, height: 40, background: "#FEE2E2", color: "#DC2626" }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <h4 style={{ fontSize: 15, fontWeight: 600, color: "#0F1923" }}>Excluir vendedor</h4>
            <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
              Tem certeza que deseja excluir <strong>{seller.name}</strong>? Essa ação não pode ser desfeita.
            </p>
          </div>
        </div>
        {error && (
          <div className="mx-6 mt-3 rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>
        )}
        <div className="flex items-center justify-end gap-3 px-6 py-5">
          <button onClick={onClose} className="px-5 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="px-5 py-2 rounded-lg" style={{ background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 500, opacity: deleting ? 0.7 : 1 }}>
            {deleting ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}