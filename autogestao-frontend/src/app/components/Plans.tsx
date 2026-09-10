import { useEffect, useState } from "react";
import { Check, Copy, QrCode, FileText, CreditCard, AlertTriangle } from "lucide-react";
import * as api from "../../lib/api";

function currency(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<api.SubscriptionStatus, { label: string; color: string; bg: string }> = {
  trialing: { label: "Aguardando pagamento", color: "#D97706", bg: "#FEF3C7" },
  active: { label: "Ativa", color: "#27500A", bg: "#EAF3DE" },
  past_due: { label: "Pagamento atrasado", color: "#DC2626", bg: "#FEE2E2" },
  canceled: { label: "Cancelada", color: "#6B7280", bg: "#F4F6F9" },
};

export function Plans() {
  const [plans, setPlans] = useState<api.Plan[]>([]);
  const [subscription, setSubscription] = useState<api.Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<api.Plan | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, statusRes] = await Promise.all([
        api.listPlans(),
        api.getBillingStatus().catch(() => null), // pode não ter assinatura ainda
      ]);
      setPlans(plansRes);
      setSubscription(statusRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar planos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const statusInfo = subscription ? STATUS_LABELS[subscription.status] : null;

  return (
    <div className="size-full overflow-y-auto" style={{ background: "var(--background)" }}>
      <div className="px-6 py-6" style={{ maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ marginBottom: 4 }}>Planos e assinatura</h2>
        <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20 }}>Escolha o plano ideal pra sua revenda</p>

        {subscription && statusInfo && (
          <div className="rounded-xl p-4 flex items-center justify-between mb-6" style={{ background: statusInfo.bg }}>
            <div>
              <span style={{ fontSize: 12, color: statusInfo.color, fontWeight: 600 }}>{statusInfo.label}</span>
              <p style={{ fontSize: 14, color: "#374151", marginTop: 2 }}>
                Plano atual: <strong>{subscription.plan.name}</strong> — {currency(Number(subscription.plan.price))}/mês
              </p>
              {subscription.currentPeriodEnd && (
                <p style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                  Próxima cobrança: {new Date(subscription.currentPeriodEnd).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
            {subscription.status === "past_due" && <AlertTriangle size={24} style={{ color: "#DC2626" }} />}
          </div>
        )}

        {error && (
          <div className="rounded-lg px-4 py-3 mb-4" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>{error}</div>
        )}

        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          {plans.map((plan) => {
            const isCurrent = subscription?.planId === plan.id && subscription.status === "active";
            return (
              <div key={plan.id} className="rounded-xl p-6" style={{ background: "#fff", border: isCurrent ? "1.5px solid #185FA5" : "1px solid rgba(0,0,0,0.08)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>{plan.name}</h3>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#185FA5", marginTop: 8 }}>
                  {currency(Number(plan.price))}<span style={{ fontSize: 13, fontWeight: 400, color: "#6B7280" }}>/mês</span>
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
                  Até {plan.vehicleLimit} veículos · {plan.userLimit} {plan.userLimit === 1 ? "usuário" : "usuários"}
                </div>

                {Array.isArray(plan.features) && plan.features.length > 0 && (
                  <div className="flex flex-col gap-2 mt-4">
                    {plan.features.map((f) => (
                      <div key={f} className="flex items-center gap-2">
                        <Check size={14} style={{ color: "#27500A" }} />
                        <span style={{ fontSize: 13, color: "#374151" }}>{f}</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setCheckoutPlan(plan)}
                  disabled={isCurrent}
                  className="w-full mt-6 py-2.5 rounded-lg"
                  style={{
                    background: isCurrent ? "#F4F6F9" : "#185FA5",
                    color: isCurrent ? "#9CA3AF" : "#fff",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {isCurrent ? "Plano atual" : "Assinar este plano"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {checkoutPlan && (
        <CheckoutModal plan={checkoutPlan} onClose={() => setCheckoutPlan(null)} onPaid={() => { setCheckoutPlan(null); fetchData(); }} />
      )}
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