/* MARKER-MAKE-KIT-INVOKED */
import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { Inventory } from "./components/Inventory";
import { LeadsCRM } from "./components/LeadsCRM";
import { Financial } from "./components/Financial";
import { Plans } from "./components/Plans";
import { Login, Onboarding } from "./components/Login";
import { PublicStorefront } from "./components/PublicStorefront";
import { Sales } from "./components/Sales";
import { Customers } from "./components/Customers";
import { Sellers } from "./components/Sellers";
import { PromissoryNotes } from "./components/PromissoryNotes";
import { PartsStore } from "./components/PartsStore";
import { Globe, Megaphone, Settings, ExternalLink } from "lucide-react";
import { useAuth } from "../lib/auth-context";

type Page =
  | "login" | "onboarding" | "dashboard" | "inventory"
  | "leads" | "financial" | "ads" | "site" | "settings" | "plans" | "storefront"
  | "sales" | "customers" | "sellers" | "promissory" | "parts";

function PlaceholderPage({ title, icon: Icon }: { title: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4" style={{ background: "var(--background)" }}>
      <div className="flex items-center justify-center rounded-2xl" style={{ width: 64, height: 64, background: "#EBF2FA" }}>
        <Icon size={28} style={{ color: "#185FA5" }} />
      </div>
      <h2>{title}</h2>
      <p style={{ fontSize: 14, color: "#6B7280" }}>Esta tela está em construção.</p>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const [page, setPage] = useState<Page>("login");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const navigate = (p: string) => setPage(p as Page);

  // Mantém a navegação coerente com o estado real da sessão: ao restaurar
  // uma sessão válida (reload da página), pula direto pro dashboard; se a
  // sessão cair (ex.: logout, refresh token expirado), volta pro login.
  useEffect(() => {
    if (auth.status === "authenticated" && (page === "login" || page === "onboarding")) {
      setPage("dashboard");
    }
    if (auth.status === "unauthenticated" && page !== "login" && page !== "onboarding") {
      setPage("login");
    }
  }, [auth.status]);

  if (auth.status === "loading") {
    return (
      <div className="size-full flex items-center justify-center" style={{ background: "var(--background)" }}>
        <span style={{ fontSize: 13, color: "#6B7280" }}>Carregando...</span>
      </div>
    );
  }

  const handleLogout = async () => {
    await auth.logout();
    navigate("login");
  };

  // Slug real da loja logada — usado no link/preview do site público.
  const storeSlug = auth.dealership?.slug ?? "";
  const storeUrl = storeSlug ? `${storeSlug}.autogestao.com.br` : "—";

  // Fullscreen pages (no shell)
  if (page === "login") return <Login onNavigate={navigate} />;
  if (page === "onboarding") return <Onboarding onNavigate={navigate} />;
  if (page === "storefront") {
    return (
      <div className="size-full overflow-auto">
        <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-2"
          style={{ background: "#185FA5", color: "#fff" }}
        >
          <span style={{ fontSize: 13 }}>Prévia do site público</span>
          <button
            onClick={() => navigate("dashboard")}
            className="flex items-center gap-1 px-3 py-1 rounded-lg"
            style={{ background: "rgba(255,255,255,0.2)", fontSize: 12 }}
          >
            ← Voltar ao painel
          </button>
        </div>
        <PublicStorefront slug={storeSlug} onNavigate={navigate} />
      </div>
    );
  }

  // Shell layout
  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard onNavigate={navigate} />;
      case "inventory": return <Inventory />;
      case "leads": return <LeadsCRM />;
      case "financial": return <Financial />;
      case "sales": return <Sales />;
      case "customers": return <Customers />;
      case "sellers": return <Sellers />;
      case "promissory": return <PromissoryNotes />;
      case "parts": return <PartsStore />;
      case "plans": return <Plans />;
      case "ads": return <PlaceholderPage title="Anúncios" icon={Megaphone} />;
      case "settings": return <PlaceholderPage title="Configurações" icon={Settings} />;
      case "site":
        return (
          <div className="flex flex-col h-full" style={{ background: "var(--background)" }}>
            <div className="px-6 py-4" style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2>Meu Site</h2>
                  <p style={{ fontSize: 13, color: "#6B7280" }}>{storeUrl}</p>
                </div>
                <button
                  onClick={() => navigate("storefront")}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg"
                  style={{ background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 500 }}
                >
                  <ExternalLink size={15} /> Ver site
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto" style={{ background: "#F4F6F9" }}>
              <div style={{ height: "calc(100% - 0px)", border: "none" }}>
                <PublicStorefront slug={storeSlug} onNavigate={navigate} />
              </div>
            </div>
          </div>
        );
      default: return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <div className="size-full flex overflow-hidden" style={{ background: "var(--background)" }}>
      <Sidebar
        currentPage={page}
        onNavigate={navigate}
        collapsed={sidebarCollapsed}
        userName={auth.user?.name}
        dealershipName={auth.dealership?.name}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top nav strip */}
        <div
          className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
          style={{ background: "#fff", borderBottom: "0.5px solid rgba(0,0,0,0.06)" }}
        >
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded"
            style={{ color: "#6B7280", background: "#F4F6F9" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Breadcrumb / page links */}
          <div className="flex items-center gap-1 flex-1 overflow-x-auto">
            {(["dashboard", "inventory", "sales", "customers", "leads", "sellers", "financial", "promissory", "parts"] as Page[]).map((p, i) => {
              const labels: Record<string, string> = {
                dashboard: "Dashboard",
                inventory: "Estoque",
                sales: "Vendas",
                customers: "Clientes",
                leads: "Leads",
                sellers: "Vendedores",
                financial: "Financeiro",
                promissory: "Promissórias",
                parts: "Peças",
              };
              return (
                <button
                  key={p}
                  onClick={() => navigate(p)}
                  className="px-3 py-1 rounded-lg"
                  style={{
                    fontSize: 12,
                    background: page === p ? "#EBF2FA" : "transparent",
                    color: page === p ? "#185FA5" : "#6B7280",
                    fontWeight: page === p ? 500 : 400,
                  }}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2" style={{ fontSize: 12, color: "#9CA3AF" }}>
            <Globe size={13} />
            <button onClick={() => navigate("storefront")} style={{ color: "#185FA5", fontWeight: 500, fontSize: 12 }}>
              {storeUrl} ↗
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {renderPage()}
        </div>
      </div>
    </div>
  );
}