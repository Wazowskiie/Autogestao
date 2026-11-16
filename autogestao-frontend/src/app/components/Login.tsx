import { useEffect, useState } from "react";
import {
  Car, Eye, EyeOff, ArrowRight, Check, Upload, ChevronRight,
  AlertCircle, Bookmark, FileCheck2, Info, Loader2, MessageCircle, PackagePlus, ShoppingBag, UserPlus,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { ApiError } from "../../lib/api";
import "./login.css";

type PageProps = { onNavigate: (page: string) => void };

// Exemplos do que acontece numa revenda durante o dia (ilustração, não são dados reais)
const SHOP_MOMENTS = [
  { icon: ShoppingBag, what: "Venda registrada", detail: "Honda CG 160 Fan por R$ 16.500" },
  { icon: UserPlus, what: "Novo lead pelo site", detail: "Marcos quer saber da Biz 125" },
  { icon: FileCheck2, what: "Promissória paga", detail: "Parcela 3 de 10, R$ 480" },
  { icon: Bookmark, what: "Veículo reservado", detail: "Yamaha Fazer 250 com sinal de R$ 1.000" },
  { icon: MessageCircle, what: "Mensagem no WhatsApp", detail: "“Ainda tem a Pop 110 vermelha?”" },
  { icon: PackagePlus, what: "Entrada no estoque", detail: "Fiat Argo Drive 2024, 12.000 km" },
];
const MOMENT_AGES = ["agora", "há 4 min", "há 11 min", "há 26 min"];

function ShopFeed() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // Quem pede menos animação no sistema vê a lista parada
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 3400);
    return () => window.clearInterval(id);
  }, []);
  const n = SHOP_MOMENTS.length;
  // O mais novo entra em cima; os outros descem uma posição
  const visible = [0, 1, 2, 3].map((i) => SHOP_MOMENTS[(((tick - i) % n) + n) % n]);
  return (
    <div aria-hidden="true">
      <div className="login-feed">
        <div className="login-feed-list" key={tick}>
          {visible.map(({ icon: Icon, what, detail }, i) => (
            <div className="login-feed-item" key={what}>
              <span className="login-feed-icon"><Icon size={18} /></span>
              <span className="login-feed-text">
                <span className="login-feed-what">{what}</span>
                <span className="login-feed-detail">{detail}</span>
              </span>
              <span className="login-feed-when">{MOMENT_AGES[i]}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="login-feed-note">Exemplos do dia a dia de uma revenda.</p>
    </div>
  );
}

export function Login({ onNavigate }: PageProps) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.login(email, password);
      onNavigate("dashboard");
    } catch (err) {
      // Erro do servidor já vem em português; o resto é falha de conexão
      setError(err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor. Confira sua internet e tente de novo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <aside className="login-stage">
        <div className="login-brand">
          <span className="login-brand-mark"><Car size={21} color="#fff" /></span>
          <span className="login-brand-name">AutoGestão</span>
        </div>

        <div>
          <h1 className="login-title">Sua revenda inteira em uma tela.</h1>
          <p className="login-lede">Estoque, vendas, clientes, promissórias e o site da loja no mesmo lugar.</p>
          <ShopFeed />
        </div>

        <div className="login-foot">© {new Date().getFullYear()} AutoGestão. Todos os direitos reservados.</div>
      </aside>

      <main className="login-panel">
        <div className="login-form-wrap">
          <div className="login-brand-mobile">
            <span className="login-brand-mark"><Car size={21} color="#fff" /></span>
            <span className="login-brand-name">AutoGestão</span>
          </div>

          <h2 className="login-heading">Entrar</h2>
          <p className="login-sub">Dono, administrador ou vendedor: use o e-mail e a senha do seu cadastro na loja.</p>

          {error && (
            <div className="login-alert login-alert-error" role="alert">
              <AlertCircle size={16} /> <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <label className="login-field">
              <span className="login-label">E-mail</span>
              <input
                type="email" autoComplete="username" inputMode="email" placeholder="voce@sualoja.com.br"
                value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
                className="login-input"
              />
            </label>

            <label className="login-field">
              <span className="login-label">Senha</span>
              <span className="login-input-box" style={{ display: "block" }}>
                <input
                  type={showPass ? "text" : "password"} autoComplete="current-password" placeholder="Sua senha"
                  value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="login-input login-input-pass"
                />
                <button type="button" onClick={() => setShowPass(!showPass)} className="login-eye"
                  aria-label={showPass ? "Esconder senha" : "Mostrar senha"} title={showPass ? "Esconder senha" : "Mostrar senha"}>
                  {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>

            <div className="login-row">
              <button type="button" className="login-link" aria-expanded={showForgot} onClick={() => setShowForgot((v) => !v)}>
                Esqueci minha senha
              </button>
            </div>

            {showForgot && (
              <div className="login-alert login-alert-info">
                <Info size={16} />
                <span>Peça ao dono ou administrador da sua loja: ele cadastra uma senha nova em Vendedores. Se você é o dono, fale com o suporte do AutoGestão.</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="login-submit">
              {loading ? <><Loader2 size={17} className="login-spin" /> Entrando</> : <>Entrar <ArrowRight size={17} /></>}
            </button>
          </form>

          <p className="login-signup">
            Ainda não usa o AutoGestão?{" "}
            <button type="button" onClick={() => onNavigate("onboarding")} className="login-link" style={{ fontSize: 14 }}>
              Teste grátis por 14 dias
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function Onboarding({ onNavigate }: PageProps) {
  const auth = useAuth();
  const [step, setStep] = useState(1);
  const [dealershipName, setDealershipName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleNameChange = (value: string) => {
    setDealershipName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleNext = async () => {
    if (step === 1) {
      setError(null);
      if (!dealershipName || !slug || !ownerName || !ownerEmail || !password) {
        setError("Preencha nome da loja, seu nome, e-mail e senha para continuar.");
        return;
      }
      setLoading(true);
      try {
        await auth.register({ dealershipName, dealershipSlug: slug, ownerName, ownerEmail, password });
        setStep(2);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível criar a conta");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    onNavigate("dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "#F4F6F9" }}>
      <div className="w-full" style={{ maxWidth: 520 }}>
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: "#185FA5" }}>
            <Car size={18} color="#fff" />
          </div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>AutoGestão</span>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="flex items-center justify-center rounded-full"
                style={{
                  width: 28, height: 28,
                  background: s < step ? "#27500A" : s === step ? "#185FA5" : "#E5E7EB",
                  color: s <= step ? "#fff" : "#9CA3AF",
                  fontSize: 12, fontWeight: 500,
                }}
              >
                {s < step ? <Check size={13} /> : s}
              </div>
              <span style={{ fontSize: 12, color: s === step ? "#185FA5" : "#9CA3AF" }}>
                {s === 1 ? "Sua loja" : s === 2 ? "Personalização" : "Primeiro veículo"}
              </span>
              {s < 3 && <ChevronRight size={14} style={{ color: "#CBD5E1" }} />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-6" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)" }}>
          {step === 1 && (
            <div className="space-y-4">
              <h3>Dados da sua loja</h3>
              <p style={{ fontSize: 13, color: "#6B7280" }}>Configure as informações básicas da sua revenda</p>

              {error && (
                <div className="rounded-lg px-3 py-2" style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}>
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Nome da loja</label>
                  <input
                    placeholder="Auto Silva Veículos"
                    value={dealershipName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    className="w-full rounded-lg px-3 py-2.5"
                    style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }}
                  />
                </div>
                <div className="col-span-2">
                  <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>
                    Endereço do seu site <span style={{ fontSize: 11, color: "#9CA3AF" }}>(pode editar)</span>
                  </label>
                  <div className="flex items-center rounded-lg" style={{ border: "0.5px solid rgba(0,0,0,0.12)", overflow: "hidden" }}>
                    <span style={{ fontSize: 13, color: "#9CA3AF", padding: "10px 0 10px 12px", whiteSpace: "nowrap" }}>{window.location.host}/loja/</span>
                    <input
                      placeholder="auto-silva"
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(slugify(e.target.value));
                      }}
                      className="w-full px-1 py-2.5"
                      style={{ border: "none", outline: "none", fontSize: 13 }}
                    />
                  </div>
                </div>
                {[
                  { label: "CNPJ", placeholder: "00.000.000/0001-00" },
                  { label: "Cidade", placeholder: "São Paulo" },
                  { label: "Estado", placeholder: "SP" },
                  { label: "Telefone / WhatsApp", placeholder: "(11) 9 9999-9999" },
                ].map(({ label, placeholder }) => (
                  <div key={label}>
                    <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>{label}</label>
                    <input
                      placeholder={placeholder}
                      className="w-full rounded-lg px-3 py-2.5"
                      style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", paddingTop: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 12 }}>Seus dados de acesso</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Seu nome</label>
                    <input
                      placeholder="João Silva"
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      className="w-full rounded-lg px-3 py-2.5"
                      style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>E-mail</label>
                    <input
                      type="email"
                      placeholder="joao@autosilva.com.br"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      className="w-full rounded-lg px-3 py-2.5"
                      style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }}
                    />
                  </div>
                  <div className="col-span-2">
                    <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Senha</label>
                    <input
                      type="password"
                      placeholder="Mínimo de 8 caracteres"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg px-3 py-2.5"
                      style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 8 }}>Segmento</label>
                <div className="flex gap-3">
                  {["Carros", "Motos", "Ambos"].map((s) => (
                    <button
                      key={s}
                      className="flex-1 py-2.5 rounded-lg"
                      style={{
                        border: s === "Ambos" ? "1.5px solid #185FA5" : "0.5px solid rgba(0,0,0,0.1)",
                        background: s === "Ambos" ? "#EBF2FA" : "#FAFAFA",
                        color: s === "Ambos" ? "#185FA5" : "#374151",
                        fontSize: 13, fontWeight: 500,
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3>Personalize seu site</h3>
              <p style={{ fontSize: 13, color: "#6B7280" }}>Como seus clientes vão te ver online</p>
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 8 }}>Logo da loja</label>
                <div
                  className="flex flex-col items-center gap-2 rounded-xl py-6"
                  style={{ border: "1.5px dashed rgba(0,0,0,0.12)", background: "#FAFAFA", cursor: "pointer" }}
                >
                  <Upload size={20} style={{ color: "#9CA3AF" }} />
                  <span style={{ fontSize: 13, color: "#374151" }}>Fazer upload da logo</span>
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>PNG, SVG até 2MB</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 8 }}>Cor principal da loja</label>
                <div className="flex items-center gap-3">
                  {["#185FA5", "#DC2626", "#059669", "#7C3AED", "#D97706", "#0F172A"].map((c) => (
                    <button
                      key={c}
                      className="rounded-full border-2"
                      style={{
                        width: 28, height: 28, background: c,
                        borderColor: c === "#185FA5" ? "#185FA5" : "transparent",
                        outline: c === "#185FA5" ? "2px solid #185FA5" : "none",
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                  <input type="color" style={{ width: 28, height: 28, borderRadius: "50%", cursor: "pointer", border: "none" }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 8 }}>Foto de capa</label>
                <div
                  className="flex flex-col items-center gap-2 rounded-xl py-8"
                  style={{ border: "1.5px dashed rgba(0,0,0,0.12)", background: "#FAFAFA", cursor: "pointer" }}
                >
                  <Upload size={20} style={{ color: "#9CA3AF" }} />
                  <span style={{ fontSize: 13, color: "#374151" }}>Adicionar foto de capa</span>
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>Recomendado: 1440 × 400px</span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3>Cadastre seu primeiro veículo</h3>
              <p style={{ fontSize: 13, color: "#6B7280" }}>Vamos popular seu site agora mesmo</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Marca", placeholder: "Honda" },
                  { label: "Modelo", placeholder: "Civic" },
                  { label: "Ano", placeholder: "2022" },
                  { label: "Quilometragem", placeholder: "28.000" },
                  { label: "Preço de venda", placeholder: "R$ 142.900" },
                ].map(({ label, placeholder }) => (
                  <div key={label}>
                    <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>{label}</label>
                    <input
                      placeholder={placeholder}
                      className="w-full rounded-lg px-3 py-2.5"
                      style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none" }}
                    />
                  </div>
                ))}
              </div>
              <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "#EBF2FA", border: "0.5px solid #185FA5" }}>
                <Car size={20} style={{ color: "#185FA5", flexShrink: 0 }} />
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: "#185FA5", fontWeight: 500 }}>Preview ao vivo: </span>
                  <span style={{ color: "#374151" }}>seu site já está sendo gerado em tempo real</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
            <button
              onClick={() => step > 1 ? setStep(step - 1) : onNavigate("login")}
              style={{ fontSize: 13, color: "#6B7280" }}
            >
              {step > 1 ? "← Voltar" : "← Fazer login"}
            </button>
            <button
              onClick={handleNext}
              disabled={loading}
              className="px-6 py-2.5 rounded-lg flex items-center gap-2"
              style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Criando conta..." : step < 3 ? "Próximo" : "Acessar painel"} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
