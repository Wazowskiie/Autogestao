import { useState } from "react";
import { Car, Eye, EyeOff, ArrowRight, Check, Upload, ChevronRight } from "lucide-react";
import { useAuth } from "../../lib/auth-context";

type PageProps = { onNavigate: (page: string) => void };

export function Login({ onNavigate }: PageProps) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.login(email, password);
      onNavigate("dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: "#F4F6F9" }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 w-1/2" style={{ background: "#0F1923" }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center rounded-lg" style={{ width: 36, height: 36, background: "#185FA5" }}>
            <Car size={20} color="#fff" />
          </div>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 16 }}>AutoGestão</span>
        </div>

        <div>
          <h1 style={{ color: "#fff", fontSize: 32, marginBottom: 16, lineHeight: 1.3 }}>
            A plataforma que<br />revendas modernas<br />precisam.
          </h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, lineHeight: 1.7 }}>
            Gerencie estoque, leads e financeiro em um só lugar.<br />
            Site da loja gerado automaticamente.
          </p>

          <div className="mt-10 space-y-3">
            {[
              "Cadastro de veículos com fotos",
              "CRM Kanban de leads",
              "Site público automático",
              "Relatórios financeiros em tempo real",
            ].map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="flex items-center justify-center rounded-full" style={{ width: 20, height: 20, background: "#27500A" }}>
                  <Check size={11} color="#fff" />
                </div>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>
          © 2026 AutoGestão · Todos os direitos reservados
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full" style={{ maxWidth: 380 }}>
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="flex items-center justify-center rounded-lg" style={{ width: 32, height: 32, background: "#185FA5" }}>
              <Car size={18} color="#fff" />
            </div>
            <span style={{ fontWeight: 600, fontSize: 15 }}>AutoGestão</span>
          </div>

          <h2 style={{ marginBottom: 4 }}>Entrar na sua conta</h2>
          <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 24 }}>
            Acesse o painel da sua revenda
          </p>

          <div className="space-y-3">
            {error && (
              <div
                className="rounded-lg px-3 py-2"
                style={{ background: "#FEE2E2", color: "#991B1B", fontSize: 13 }}
              >
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>E-mail</label>
              <input
                type="email"
                placeholder="joao@autosilva.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg px-3 py-2.5"
                style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none", background: "#fff" }}
              />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#374151", display: "block", marginBottom: 6 }}>Senha</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-lg px-3 py-2.5 pr-10"
                  style={{ border: "0.5px solid rgba(0,0,0,0.12)", fontSize: 13, outline: "none", background: "#fff" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "#9CA3AF" }}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" style={{ fontSize: 13, color: "#185FA5" }}>Esqueci minha senha</button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg flex items-center justify-center gap-2"
              style={{ background: "#185FA5", color: "#fff", fontSize: 14, fontWeight: 500, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Entrando..." : "Entrar"} {!loading && <ArrowRight size={16} />}
            </button>
            </form>

            <div className="flex items-center gap-3">
              <div className="flex-1" style={{ height: 1, background: "rgba(0,0,0,0.08)" }} />
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>ou</span>
              <div className="flex-1" style={{ height: 1, background: "rgba(0,0,0,0.08)" }} />
            </div>

            <button
              type="button"
              className="w-full py-2.5 rounded-lg flex items-center justify-center gap-2"
              style={{ border: "0.5px solid rgba(0,0,0,0.12)", background: "#fff", fontSize: 13, color: "#374151" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Entrar com Google
            </button>
          </div>

          <p style={{ textAlign: "center", fontSize: 13, color: "#6B7280", marginTop: 24 }}>
            Não tem conta?{" "}
            <button
              onClick={() => onNavigate("onboarding")}
              style={{ color: "#185FA5", fontWeight: 500 }}
            >
              Criar conta grátis por 14 dias →
            </button>
          </p>
        </div>
      </div>
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
                    <span style={{ fontSize: 13, color: "#9CA3AF", padding: "10px 0 10px 12px", whiteSpace: "nowrap" }}>autogestao.com.br/</span>
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
