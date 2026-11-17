import { useEffect, useState } from "react";
import {
  Bike, Car, Eye, EyeOff, ArrowRight, Check, Upload,
  AlertCircle, ArrowLeft, Bookmark, FileCheck2, Info, Loader2, MailCheck, MessageCircle, PackagePlus, ShoppingBag, UserPlus,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import * as api from "../../lib/api";
import { ApiError } from "../../lib/api";
import * as settingsApi from "../../lib/settings-api";
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

/** Lado escuro da tela (marca + cartões animados), usado no login e na senha nova */
function LoginStage() {
  return (
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
  );
}

function MobileBrand() {
  return (
    <div className="login-brand-mobile">
      <span className="login-brand-mark"><Car size={21} color="#fff" /></span>
      <span className="login-brand-name">AutoGestão</span>
    </div>
  );
}

const connectionError = (err: unknown) =>
  err instanceof ApiError ? err.message : "Não foi possível conectar ao servidor. Confira sua internet e tente de novo.";

export function Login({ onNavigate }: PageProps) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"login" | "forgot">("login");
  // O link por e-mail só aparece se o envio de e-mail estiver configurado no servidor
  const [emailReset, setEmailReset] = useState<boolean | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    api.getPasswordResetInfo().then((r) => setEmailReset(r.email)).catch(() => setEmailReset(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.login(email, password);
      onNavigate("dashboard");
    } catch (err) {
      setError(connectionError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email.trim());
      setForgotSent(true);
    } catch (err) {
      setError(connectionError(err));
    } finally {
      setLoading(false);
    }
  };

  const goTo = (v: "login" | "forgot") => { setView(v); setError(null); setForgotSent(false); };

  return (
    <div className="login">
      <LoginStage />
      <main className="login-panel">
        <div className="login-form-wrap">
          <MobileBrand />

          {view === "login" ? (
            <>
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
                  <button type="button" className="login-link" onClick={() => goTo("forgot")}>Esqueci minha senha</button>
                </div>

                <button type="submit" disabled={loading} className="login-submit">
                  {loading ? <><Loader2 size={17} className="login-spin" /> Entrando</> : <>Entrar <ArrowRight size={17} /></>}
                </button>
              </form>

              <p className="login-signup">
                Ainda não usa o AutoGestão?{" "}
                <button type="button" onClick={() => onNavigate("onboarding")} className="login-link" style={{ fontSize: 14 }}>
                  Teste grátis por 30 dias
                </button>
              </p>
            </>
          ) : (
            <>
              <h2 className="login-heading">Esqueci minha senha</h2>
              {emailReset === false ? (
                <>
                  <p className="login-sub">O envio de link por e-mail ainda não está ligado neste sistema.</p>
                  <div className="login-alert login-alert-info">
                    <Info size={16} />
                    <span>Peça ao dono ou administrador da sua loja: ele cadastra uma senha nova em Vendedores. Se você é o dono, fale com o suporte do AutoGestão.</span>
                  </div>
                </>
              ) : forgotSent ? (
                <>
                  <p className="login-sub">Confira sua caixa de entrada.</p>
                  <div className="login-alert login-alert-info" role="status">
                    <MailCheck size={16} />
                    <span>Se <b>{email.trim()}</b> estiver cadastrado, enviamos um link para criar uma senha nova. Ele vale por 1 hora. Não chegou? Olhe também a pasta de spam.</span>
                  </div>
                  <button type="button" className="login-link" style={{ fontSize: 14 }} disabled={loading}
                    onClick={() => setForgotSent(false)}>Mandar de novo</button>
                </>
              ) : (
                <>
                  <p className="login-sub">Informe o e-mail do seu cadastro. Vamos mandar um link para você criar uma senha nova.</p>
                  {error && (
                    <div className="login-alert login-alert-error" role="alert">
                      <AlertCircle size={16} /> <span>{error}</span>
                    </div>
                  )}
                  <form onSubmit={handleForgot}>
                    <label className="login-field">
                      <span className="login-label">E-mail</span>
                      <input type="email" autoComplete="username" inputMode="email" placeholder="voce@sualoja.com.br"
                        value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus className="login-input" />
                    </label>
                    <button type="submit" disabled={loading || emailReset === null} className="login-submit">
                      {loading ? <><Loader2 size={17} className="login-spin" /> Enviando</> : <>Enviar link <ArrowRight size={17} /></>}
                    </button>
                  </form>
                </>
              )}
              <p className="login-signup">
                <button type="button" onClick={() => goTo("login")} className="login-link" style={{ fontSize: 14 }}>
                  <ArrowLeft size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> Voltar para entrar
                </button>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

/** Página do link do e-mail: /redefinir-senha?token=... */
export function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "Este link está incompleto. Abra de novo o link do e-mail ou peça outro em \"Esqueci minha senha\".");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("A senha precisa ter pelo menos 8 caracteres."); return; }
    if (password !== confirm) { setError("As duas senhas não são iguais."); return; }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(connectionError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <LoginStage />
      <main className="login-panel">
        <div className="login-form-wrap">
          <MobileBrand />
          <h2 className="login-heading">{done ? "Senha trocada" : "Criar senha nova"}</h2>
          {done ? (
            <>
              <p className="login-sub">Pronto. Use a senha nova para entrar. Por segurança, quem estava conectado com a senha antiga precisa entrar de novo.</p>
              <a href="/" className="login-submit" style={{ textDecoration: "none" }}>Entrar <ArrowRight size={17} /></a>
            </>
          ) : (
            <>
              <p className="login-sub">Escolha uma senha com pelo menos 8 caracteres.</p>
              {error && (
                <div className="login-alert login-alert-error" role="alert">
                  <AlertCircle size={16} /> <span>{error}</span>
                </div>
              )}
              <form onSubmit={submit}>
                <label className="login-field">
                  <span className="login-label">Senha nova</span>
                  <span className="login-input-box" style={{ display: "block" }}>
                    <input type={showPass ? "text" : "password"} autoComplete="new-password" value={password}
                      onChange={(e) => setPassword(e.target.value)} required minLength={8} autoFocus className="login-input login-input-pass" disabled={!token} />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="login-eye"
                      aria-label={showPass ? "Esconder senha" : "Mostrar senha"} title={showPass ? "Esconder senha" : "Mostrar senha"}>
                      {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>
                <label className="login-field">
                  <span className="login-label">Repita a senha nova</span>
                  <input type={showPass ? "text" : "password"} autoComplete="new-password" value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} required className="login-input" disabled={!token} />
                </label>
                <button type="submit" disabled={loading || !token} className="login-submit">
                  {loading ? <><Loader2 size={17} className="login-spin" /> Salvando</> : <>Salvar senha nova <ArrowRight size={17} /></>}
                </button>
              </form>
              <p className="login-signup"><a href="/" className="login-link" style={{ fontSize: 14 }}>Voltar para entrar</a></p>
            </>
          )}
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

/** Enquanto o cadastro (passos 2 e 3) não termina, o App não pula direto para o painel */
export const onboardingFlow = { active: false };

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const COLORS = ["#185FA5", "#DC2626", "#059669", "#7C3AED", "#D97706", "#0F172A"];
const digits = (v: string) => v.replace(/\D/g, "");
const moneyToNumber = (v: string) => {
  const t = v.replace(/[^\d,.]/g, "");
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/\.(?=\d{3}(\D|$))/g, ""));
};
const phoneMask = (v: string) => {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
};

export function Onboarding({ onNavigate }: PageProps) {
  const auth = useAuth();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Passo 1: loja e acesso
  const [dealershipName, setDealershipName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [phone, setPhone] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  // Passo 2: site
  const [color, setColor] = useState("#185FA5");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);

  // Passo 3: primeiro veículo
  const [vType, setVType] = useState<"car" | "moto">("moto");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [km, setKm] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");

  useEffect(() => () => { onboardingFlow.active = false; }, []);

  const finish = () => { onboardingFlow.active = false; onNavigate("dashboard"); };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (dealershipName.trim().length < 2) return setError("Informe o nome da loja.");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3) return setError("O endereço do site precisa ter pelo menos 3 letras ou números (ex.: auto-silva).");
    if (ownerName.trim().length < 2) return setError("Informe seu nome.");
    if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
    setLoading(true);
    onboardingFlow.active = true;
    try {
      await auth.register({ dealershipName: dealershipName.trim(), dealershipSlug: slug, ownerName: ownerName.trim(), ownerEmail: ownerEmail.trim(), password });
      // Dados extras da loja: se falharem, a conta já existe e dá para completar em Configurações
      await settingsApi.updateStore({ city: city.trim() || undefined, state: uf || undefined, phone: digits(phone) || undefined }).catch(() => {});
      setStep(2);
    } catch (err) {
      onboardingFlow.active = false;
      setError(connectionError(err));
    } finally {
      setLoading(false);
    }
  };

  const pickColor = async (c: string) => {
    setColor(c);
    await settingsApi.updateStore({ primaryColor: c }).catch(() => setError("Não foi possível salvar a cor. Você pode trocar depois em Configurações."));
  };

  const uploadImage = async (kind: "logo" | "cover", file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(kind);
    try {
      const res = await settingsApi.uploadStoreImage(kind, file);
      if (kind === "logo") setLogoUrl(res.dealership?.logoUrl ?? URL.createObjectURL(file));
      else setCoverUrl(res.dealership?.coverUrl ?? URL.createObjectURL(file));
    } catch (err) {
      setError(connectionError(err));
    } finally {
      setUploading(null);
    }
  };

  const createVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const y = Number(digits(year));
    const p = moneyToNumber(price), c = cost ? moneyToNumber(cost) : 0;
    if (!brand.trim() || !model.trim()) return setError("Informe a marca e o modelo.");
    if (y < 1950 || y > new Date().getFullYear() + 1) return setError("Ano inválido.");
    if (!Number.isFinite(p) || p <= 0) return setError("Informe o preço de venda, ex.: 28.000.");
    if (!Number.isFinite(c) || c < 0) return setError("Preço de compra inválido.");
    setLoading(true);
    try {
      await api.createVehicle({ type: vType, brand: brand.trim(), model: model.trim(), year: y, km: Number(digits(km)) || 0, price: p, cost: c });
      finish();
    } catch (err) {
      setError(connectionError(err));
    } finally {
      setLoading(false);
    }
  };

  const steps = ["Sua loja", "Seu site", "Primeiro veículo"];
  const siteHost = window.location.host;

  return (
    <div className="login">
      <LoginStage />
      <main className="login-panel">
        <div className="login-form-wrap" style={{ maxWidth: 440 }}>
          <MobileBrand />
          <ol className="onb-steps" aria-label="Etapas do cadastro">
            {steps.map((label, i) => (
              <li key={label} className={i + 1 < step ? "done" : i + 1 === step ? "current" : ""} aria-current={i + 1 === step ? "step" : undefined}>
                <span className="onb-dot">{i + 1 < step ? <Check size={13} /> : i + 1}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>

          {error && (
            <div className="login-alert login-alert-error" role="alert">
              <AlertCircle size={16} /> <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <form onSubmit={createAccount}>
              <h2 className="login-heading">Teste grátis por 30 dias</h2>
              <p className="login-sub">Sem cartão. Seu site da loja fica pronto na hora.</p>

              <label className="login-field">
                <span className="login-label">Nome da loja</span>
                <input className="login-input" placeholder="Auto Silva Veículos" value={dealershipName} autoFocus required
                  onChange={(e) => { setDealershipName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
              </label>
              <label className="login-field">
                <span className="login-label">Endereço do site</span>
                <span className="onb-prefix">
                  <span>{siteHost}/loja/</span>
                  <input className="login-input" value={slug} required placeholder="auto-silva" aria-label="Endereço do site"
                    onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} />
                </span>
              </label>
              <div className="onb-row">
                <label className="login-field" style={{ flex: 1 }}>
                  <span className="login-label">Cidade</span>
                  <input className="login-input" placeholder="Fortaleza" value={city} onChange={(e) => setCity(e.target.value)} />
                </label>
                <label className="login-field" style={{ width: 96 }}>
                  <span className="login-label">UF</span>
                  <select className="login-input" value={uf} onChange={(e) => setUf(e.target.value)}>
                    <option value="">—</option>
                    {UFS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </label>
              </div>
              <label className="login-field">
                <span className="login-label">WhatsApp da loja</span>
                <input className="login-input" inputMode="tel" placeholder="(85) 99999-9999" value={phone} onChange={(e) => setPhone(phoneMask(e.target.value))} />
              </label>

              <p className="onb-section">Seu acesso</p>
              <label className="login-field">
                <span className="login-label">Seu nome</span>
                <input className="login-input" autoComplete="name" placeholder="João Silva" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
              </label>
              <label className="login-field">
                <span className="login-label">E-mail</span>
                <input className="login-input" type="email" autoComplete="username" placeholder="voce@sualoja.com.br" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required />
              </label>
              <label className="login-field">
                <span className="login-label">Senha</span>
                <span className="login-input-box" style={{ display: "block" }}>
                  <input className="login-input login-input-pass" type={showPass ? "text" : "password"} autoComplete="new-password" placeholder="Pelo menos 8 caracteres"
                    value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="login-eye" aria-label={showPass ? "Esconder senha" : "Mostrar senha"}>
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>

              <button type="submit" disabled={loading} className="login-submit">
                {loading ? <><Loader2 size={17} className="login-spin" /> Criando sua conta</> : <>Criar conta <ArrowRight size={17} /></>}
              </button>
              <p className="login-signup">
                Já tem conta?{" "}
                <button type="button" className="login-link" style={{ fontSize: 14 }} onClick={() => onNavigate("login")}>Entrar</button>
              </p>
            </form>
          )}

          {step === 2 && (
            <div>
              <h2 className="login-heading">Deixe o site com a cara da loja</h2>
              <p className="login-sub">Tudo aqui é opcional e pode ser trocado depois em Configurações.</p>

              <p className="login-label">Logo</p>
              <label className={`onb-drop${logoUrl ? " has" : ""}`}>
                {logoUrl ? <img src={logoUrl} alt="Logo enviada" className="onb-logo" /> : <Upload size={20} />}
                <span>{uploading === "logo" ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar a logo (PNG ou JPG)"}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={!!uploading}
                  onChange={(e) => { uploadImage("logo", e.target.files?.[0]); e.target.value = ""; }} />
              </label>

              <p className="login-label" style={{ marginTop: 16 }}>Cor da loja</p>
              <div className="onb-colors" role="radiogroup" aria-label="Cor da loja">
                {COLORS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => pickColor(c)}
                    className="onb-swatch" style={{ background: c, outlineColor: color === c ? c : "transparent" }} />
                ))}
                <label className="onb-swatch onb-custom" title="Outra cor" style={{ background: COLORS.includes(color) ? undefined : color }}>
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} onBlur={(e) => pickColor(e.target.value)} aria-label="Outra cor" />
                </label>
              </div>

              <p className="login-label" style={{ marginTop: 16 }}>Foto de capa do site</p>
              <label className={`onb-drop onb-cover${coverUrl ? " has" : ""}`} style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}>
                {!coverUrl && <Upload size={20} />}
                <span>{uploading === "cover" ? "Enviando..." : coverUrl ? "Trocar capa" : "Enviar uma foto da loja (larga, ex.: 1440 × 400)"}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={!!uploading}
                  onChange={(e) => { uploadImage("cover", e.target.files?.[0]); e.target.value = ""; }} />
              </label>

              <button type="button" className="login-submit" style={{ marginTop: 20 }} disabled={!!uploading} onClick={() => { setError(null); setStep(3); }}>
                Continuar <ArrowRight size={17} />
              </button>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={createVehicle}>
              <h2 className="login-heading">Cadastre o primeiro veículo</h2>
              <p className="login-sub">Ele já aparece no seu site. Fotos e detalhes você completa depois no Estoque.</p>

              <div className="onb-toggle" role="radiogroup" aria-label="Tipo">
                {([["moto", "Moto", Bike], ["car", "Carro", Car]] as const).map(([t, label, Icon]) => (
                  <button key={t} type="button" role="radio" aria-checked={vType === t} className={vType === t ? "on" : ""} onClick={() => setVType(t)}>
                    <Icon size={16} /> {label}
                  </button>
                ))}
              </div>
              <div className="onb-row">
                <label className="login-field" style={{ flex: 1 }}>
                  <span className="login-label">Marca</span>
                  <input className="login-input" placeholder={vType === "moto" ? "Honda" : "Fiat"} value={brand} onChange={(e) => setBrand(e.target.value)} required />
                </label>
                <label className="login-field" style={{ flex: 1 }}>
                  <span className="login-label">Modelo</span>
                  <input className="login-input" placeholder={vType === "moto" ? "CG 160" : "Argo"} value={model} onChange={(e) => setModel(e.target.value)} required />
                </label>
              </div>
              <div className="onb-row">
                <label className="login-field" style={{ flex: 1 }}>
                  <span className="login-label">Ano</span>
                  <input className="login-input" inputMode="numeric" placeholder="2024" value={year} onChange={(e) => setYear(digits(e.target.value).slice(0, 4))} required />
                </label>
                <label className="login-field" style={{ flex: 1 }}>
                  <span className="login-label">Quilometragem</span>
                  <input className="login-input" inputMode="numeric" placeholder="0" value={km} onChange={(e) => setKm(digits(e.target.value) ? Number(digits(e.target.value)).toLocaleString("pt-BR") : "")} />
                </label>
              </div>
              <div className="onb-row">
                <label className="login-field" style={{ flex: 1 }}>
                  <span className="login-label">Preço de venda (R$)</span>
                  <input className="login-input" inputMode="decimal" placeholder="28.000" value={price} onChange={(e) => setPrice(e.target.value)} required />
                </label>
                <label className="login-field" style={{ flex: 1 }}>
                  <span className="login-label">Quanto pagou (R$)</span>
                  <input className="login-input" inputMode="decimal" placeholder="Opcional" value={cost} onChange={(e) => setCost(e.target.value)} />
                </label>
              </div>

              <button type="submit" disabled={loading} className="login-submit">
                {loading ? <><Loader2 size={17} className="login-spin" /> Salvando</> : <>Salvar e abrir o painel <ArrowRight size={17} /></>}
              </button>
              <p className="login-signup">
                <button type="button" className="login-link" style={{ fontSize: 14 }} onClick={finish}>Pular e abrir o painel</button>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
