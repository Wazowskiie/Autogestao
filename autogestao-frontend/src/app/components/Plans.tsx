import { useEffect, useState } from "react";
import { Check, Copy, QrCode, FileText, CreditCard, AlertTriangle, X, Sparkles, CheckCircle2 } from "lucide-react";
import * as api from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { changePlan, listPlanCatalog, usePlan, UNLIMITED, type PlanSpec } from "../../lib/plan-context";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const BLUE = "#185FA5";
const lim = (n: number) => (n >= UNLIMITED ? "Ilimitado" : String(n));

// Linhas da comparação: o mesmo "o que tem" em todos os cartões, alinhado
type Row = { label: string; value: (p: PlanSpec) => string | boolean };
const ROWS: Row[] = [
  { label: "Veículos em estoque", value: (p) => lim(p.vehicleLimit) },
  { label: "Usuários", value: (p) => String(p.userLimit) },
  { label: "Estoque, painel do veículo e fotos", value: () => true },
  { label: "Vendas com troca e várias formas de pagamento", value: () => true },
  { label: "Promissórias com tabela de juros", value: () => true },
  { label: "Financeiro, clientes, peças e site", value: () => true },
  { label: "Consulta de placa", value: (p) => `${p.plateLookupsPerMonth}/mês` },
  { label: "CRM de leads", value: (p) => p.features.includes("crm") },
  { label: "Chat com clientes (Atendimentos)", value: (p) => p.features.includes("chat") },
  { label: "Nota fiscal (NF-e)", value: (p) => (p.nfePerMonth > 0 ? `${p.nfePerMonth} notas/mês` : false) },
  { label: "Integração RENAVE", value: (p) => p.features.includes("renave") },
  { label: "Assistente de IA", value: (p) => (p.assistantPerDay > 0 ? `${p.assistantPerDay} perguntas/dia` : false) },
  { label: "Suporte prioritário", value: (p) => p.features.includes("priority_support") },
];

export function Plans() {
  const auth = useAuth();
  const plan = usePlan();
  const [catalog, setCatalog] = useState<PlanSpec[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<PlanSpec | null>(null);
  const canManage = auth.user?.role === "owner" || auth.user?.role === "admin";
  const current = plan.current;

  useEffect(() => {
    listPlanCatalog().then(setCatalog).catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar planos"));
    plan.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = async (p: PlanSpec) => {
    setError(null); setSuccess(null);
    if (!current?.canSwitchFree) { setCheckoutPlan(p); return; }
    setSwitching(p.id);
    try {
      plan.setCurrent(await changePlan(p.id)); // o menu do sistema muda na hora
      setSuccess(`Pronto! Agora a loja está no plano ${p.name}. O menu já mostra só o que esse plano tem.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível trocar de plano");
    } finally {
      setSwitching(null);
    }
  };

  const usage = current?.usage;
  const spec = current?.plan;
  const bars = spec && usage ? [
    { label: "Veículos em estoque", used: usage.vehicles, max: spec.vehicleLimit },
    { label: "Usuários", used: usage.users, max: spec.userLimit },
    { label: "Consultas de placa (mês)", used: usage.plateLookups, max: spec.plateLookupsPerMonth },
    ...(spec.nfePerMonth > 0 ? [{ label: "Notas fiscais (mês)", used: usage.nfe, max: spec.nfePerMonth }] : []),
    ...(spec.assistantPerDay > 0 ? [{ label: "Perguntas à assistente (hoje)", used: usage.assistant, max: spec.assistantPerDay }] : []),
  ] : [];

  return (
    <div className="size-full overflow-auto" style={{ background: "var(--background)" }}>
      <div className="px-6 py-6" style={{ maxWidth: 1180, margin: "0 auto" }}>
        <h2 style={{ marginBottom: 4 }}>Planos e assinatura</h2>
        <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20 }}>Escolha o plano ideal pra sua revenda</p>

        {current && <StatusBanner current={current} />}

        {error && (
          <div className="rounded-lg px-4 py-3 mb-4 flex items-center gap-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
            <AlertTriangle size={15} /> {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg px-4 py-3 mb-4 flex items-center gap-2" style={{ background: "#ECFDF5", color: "#047857", fontSize: 13, border: "1px solid #A7F3D0" }}>
            <CheckCircle2 size={15} /> {success}
          </div>
        )}

        {bars.length > 0 && (
          <div className="rounded-xl p-5 mb-6" style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Uso do plano {spec?.name}</div>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
              {bars.map((b) => {
                const unlimited = b.max >= UNLIMITED;
                const pct = unlimited ? 0 : Math.min(100, (b.used / Math.max(1, b.max)) * 100);
                const color = pct >= 100 ? "#DC2626" : pct >= 80 ? "#D97706" : BLUE;
                return (
                  <div key={b.label}>
                    <div className="flex justify-between" style={{ fontSize: 12, color: "#4B5563", marginBottom: 4 }}>
                      <span>{b.label}</span>
                      <span style={{ fontWeight: 600, color: "#111827" }}>{b.used} / {unlimited ? "∞" : b.max}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: "#EEF1F5", overflow: "hidden" }}>
                      <div style={{ width: `${unlimited ? 4 : pct}%`, height: "100%", background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
          {catalog.map((p) => {
            const isCurrent = current?.plan.id === p.id;
            return (
              <div key={p.id} className="rounded-xl p-6 flex flex-col" style={{
                background: "#fff", position: "relative",
                border: isCurrent ? `2px solid ${BLUE}` : p.highlight ? "1.5px solid #93C5FD" : "1px solid rgba(0,0,0,0.08)",
              }}>
                {p.highlight && !isCurrent && (
                  <span className="flex items-center gap-1" style={{ position: "absolute", top: -11, left: 20, background: BLUE, color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99 }}>
                    <Sparkles size={12} /> Mais escolhido
                  </span>
                )}
                {isCurrent && (
                  <span style={{ position: "absolute", top: -11, left: 20, background: "#047857", color: "#fff", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99 }}>
                    Seu plano
                  </span>
                )}
                <h3 style={{ fontSize: 17, fontWeight: 600 }}>{p.name}</h3>
                <p style={{ fontSize: 13, color: "#6B7280", marginTop: 4, minHeight: 38 }}>{p.description}</p>
                <div style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 30, fontWeight: 700, color: BLUE }}>{currency(p.price)}</span>
                  <span style={{ fontSize: 13, color: "#6B7280" }}>/mês</span>
                </div>
                <p style={{ fontSize: 12, color: "#6B7280", marginBottom: 16 }}>ou {currency(p.yearlyPrice)}/mês no plano anual</p>

                <ul className="flex flex-col" style={{ fontSize: 13, flex: 1 }}>
                  {ROWS.map((r) => {
                    const v = r.value(p);
                    const off = v === false;
                    return (
                      <li key={r.label} className="flex items-start gap-2" style={{ padding: "6px 0", borderTop: "1px solid rgba(0,0,0,0.05)", color: off ? "#9CA3AF" : "#1F2937" }}>
                        {off ? <X size={15} style={{ color: "#D1D5DB", marginTop: 2, flexShrink: 0 }} /> : <Check size={15} style={{ color: "#16A34A", marginTop: 2, flexShrink: 0 }} />}
                        <span style={{ flex: 1 }}>{r.label}</span>
                        {typeof v === "string" && <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{v}</span>}
                      </li>
                    );
                  })}
                </ul>
                <p style={{ fontSize: 12, color: "#6B7280", marginTop: 10 }}>{p.support}</p>

                {canManage ? (
                  <button onClick={() => choose(p)} disabled={isCurrent || switching !== null}
                    className="w-full py-3 rounded-lg mt-4"
                    style={{
                      background: isCurrent ? "#F4F6F9" : BLUE, color: isCurrent ? "#6B7280" : "#fff",
                      fontSize: 14, fontWeight: 500, opacity: switching && switching !== p.id ? 0.6 : 1,
                    }}>
                    {isCurrent ? "Plano atual" : switching === p.id ? "Trocando..." : current?.canSwitchFree ? "Usar este plano" : "Assinar este plano"}
                  </button>
                ) : (
                  <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 16, textAlign: "center" }}>Só o dono pode trocar de plano</p>
                )}
              </div>
            );
          })}
        </div>

        {current?.canSwitchFree && (
          <p style={{ fontSize: 12, color: "#6B7280", marginTop: 16 }}>
            Durante o teste grátis você pode trocar de plano quantas vezes quiser, sem pagar. Quando decidir, clique em
            “Assinar” no plano escolhido.
            {current.trialActive && (
              <button onClick={() => current && setCheckoutPlan(current.plan)} style={{ color: BLUE, fontWeight: 500, marginLeft: 4 }}>
                Assinar o plano {current.plan.name} agora
              </button>
            )}
          </p>
        )}
      </div>

      {checkoutPlan && (
        <CheckoutModal
          plan={{ id: checkoutPlan.id, name: checkoutPlan.name, price: checkoutPlan.price, vehicleLimit: checkoutPlan.vehicleLimit, userLimit: checkoutPlan.userLimit, features: checkoutPlan.highlights }}
          onClose={() => setCheckoutPlan(null)}
          onPaid={() => { setCheckoutPlan(null); plan.refresh(); }}
        />
      )}
    </div>
  );
}

function StatusBanner({ current }: { current: NonNullable<ReturnType<typeof usePlan>["current"]> }) {
  let bg = "#EBF2FA", color = BLUE, title = "", text = "";
  if (current.trialActive) {
    title = `Teste grátis — ${current.trialDaysLeft === 1 ? "falta 1 dia" : `faltam ${current.trialDaysLeft} dias`}`;
    text = `Você está testando o plano ${current.plan.name}. Clique em outro plano para ver como o sistema fica nele.`;
  } else if (current.status === "trialing") {
    bg = "#FEF3C7"; color = "#B45309";
    title = "Seu teste grátis terminou";
    text = `Para continuar, assine um plano. Plano atual: ${current.plan.name} — ${currency(current.plan.price)}/mês`;
  } else if (current.status === "active") {
    bg = "#EAF3DE"; color = "#27500A";
    title = "Assinatura ativa";
    text = `Plano ${current.plan.name} — ${currency(current.plan.price)}/mês`;
  } else if (current.status === "past_due") {
    bg = "#FEE2E2"; color = "#DC2626";
    title = "Pagamento atrasado";
    text = `Plano ${current.plan.name}. Regularize para não perder o acesso.`;
  } else {
    bg = "#F4F6F9"; color = "#6B7280";
    title = "Assinatura cancelada";
    text = `Último plano: ${current.plan.name}`;
  }
  return (
    <div className="rounded-xl px-5 py-4 mb-6" style={{ background: bg }}>
      <span style={{ fontSize: 13, color, fontWeight: 600 }}>{title}</span>
      <p style={{ fontSize: 14, color: "#374151", marginTop: 2 }}>{text}</p>
    </div>
  );
}

function CheckoutModal({ plan, onClose, onPaid }: { plan: api.Plan; onClose: () => void; onPaid: () => void }) {
  const [billingType, setBillingType] = useState<api.BillingType>("PIX");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<api.CheckoutResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.checkout(plan.id, billingType);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar cobrança");
    } finally {
      setLoading(false);
    }
  };

  const copyPix = () => {
    if (!result?.pix) return;
    navigator.clipboard.writeText(result.pix.payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full rounded-xl" style={{ background: "#fff", maxWidth: 440, margin: 16 }}>
        <div className="px-6 py-4" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
          <h3>Assinar {plan.name}</h3>
          <p style={{ fontSize: 13, color: "#6B7280" }}>{currency(Number(plan.price))}/mês</p>
        </div>

        <div className="px-6 py-5">
          {error && <div className="rounded-lg px-3 py-2 mb-4" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>}

          {!result && (
            <>
              <p style={{ fontSize: 13, color: "#374151", marginBottom: 10 }}>Forma de pagamento</p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {([
                  { value: "PIX" as const, label: "PIX", icon: QrCode },
                  { value: "BOLETO" as const, label: "Boleto", icon: FileText },
                  { value: "CREDIT_CARD" as const, label: "Cartão", icon: CreditCard },
                ]).map(({ value, label, icon: Icon }) => (
                  <button key={value} onClick={() => setBillingType(value)}
                    className="flex flex-col items-center gap-2 py-4 rounded-xl"
                    style={{
                      border: billingType === value ? "1.5px solid #185FA5" : "0.5px solid rgba(0,0,0,0.1)",
                      background: billingType === value ? "#EBF2FA" : "#FAFAFA",
                      color: billingType === value ? "#185FA5" : "#6B7280",
                    }}>
                    <Icon size={20} />
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
                  </button>
                ))}
              </div>
              <button onClick={handleCheckout} disabled={loading}
                className="w-full py-3 rounded-lg" style={{ background: "#185FA5", color: "#fff", fontSize: 14, fontWeight: 500, opacity: loading ? 0.7 : 1 }}>
                {loading ? "Gerando cobrança..." : "Gerar cobrança"}
              </button>
            </>
          )}

          {result && (
            <div className="flex flex-col items-center gap-4">
              {result.pix && (
                <>
                  <img src={`data:image/png;base64,${result.pix.encodedImage}`} alt="QR Code PIX" style={{ width: 200, height: 200 }} />
                  <button onClick={copyPix} className="flex items-center gap-2 px-4 py-2 rounded-lg w-full justify-center"
                    style={{ background: "#F4F6F9", fontSize: 13, color: "#374151" }}>
                    <Copy size={14} /> {copied ? "Copiado!" : "Copiar código PIX"}
                  </button>
                </>
              )}
              {!result.pix && result.payment && (
                <a href={result.payment.bankSlipUrl ?? result.payment.invoiceUrl} target="_blank" rel="noreferrer"
                  className="w-full text-center py-3 rounded-lg" style={{ background: "#185FA5", color: "#fff", fontSize: 14, fontWeight: 500 }}>
                  Abrir fatura
                </a>
              )}
              <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>
                Assim que o pagamento for confirmado pelo Asaas, sua assinatura é ativada automaticamente.
              </p>
              <button onClick={onPaid} style={{ fontSize: 13, color: "#185FA5", fontWeight: 500 }}>Concluir</button>
            </div>
          )}
        </div>

        {!result && (
          <div className="flex items-center justify-end px-6 py-4" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }}>
            <button onClick={onClose} className="px-5 py-2 rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.1)", fontSize: 13, color: "#374151" }}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}