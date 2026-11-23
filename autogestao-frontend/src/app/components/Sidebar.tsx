import {
  LayoutDashboard, Car, Users, DollarSign, Megaphone,
  Globe, Settings, ChevronRight, Plus, LogOut, ShoppingBag,
  UserCheck, FileText, Package, Plug, MessageSquare, ClipboardCheck
} from "lucide-react";

type Page =
  | "dashboard" | "inventory" | "leads" | "financial"
  | "ads" | "site" | "settings" | "plans" | "login" | "storefront" | "onboarding"
  | "sales" | "customers" | "sellers" | "promissory" | "parts" | "renave" | "chat" | "closing";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  collapsed?: boolean;
  userName?: string;
  dealershipName?: string;
  onLogout?: () => void;
  /** Telas que não fazem parte do plano da loja (somem do menu) */
  hiddenPages?: string[];
  /** Nome do plano atual, mostrado no rodapé */
  planName?: string;
  /** Menu do vendedor: só as áreas dele, com nomes próprios e sem o botão de plano */
  variant?: "manager" | "seller";
  /** Contadores ao lado do item do menu (ex.: clientes esperando em Atendimentos) */
  badges?: Partial<Record<string, number>>;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "inventory", label: "Estoque", icon: Car },
  { id: "sales", label: "Vendas", icon: ShoppingBag },
  { id: "customers", label: "Clientes", icon: Users },
  { id: "leads", label: "CRM", icon: Users },
  { id: "chat", label: "Atendimentos", icon: MessageSquare },
  { id: "sellers", label: "Vendedores", icon: UserCheck },
  { id: "financial", label: "Financeiro", icon: DollarSign },
  { id: "closing", label: "Fechamento", icon: ClipboardCheck },
  { id: "promissory", label: "Promissórias", icon: FileText },
  { id: "parts", label: "Peças", icon: Package },
  { id: "renave", label: "Renave", icon: Plug },
  { id: "ads", label: "Anúncios", icon: Megaphone },
  { id: "site", label: "Meu Site", icon: Globe },
  { id: "settings", label: "Configurações", icon: Settings },
] as const;

// O que o vendedor enxerga (o servidor também bloqueia o resto para ele)
export const sellerNavItems = [
  { id: "dashboard", label: "Início", icon: LayoutDashboard },
  { id: "inventory", label: "Estoque", icon: Car },
  { id: "leads", label: "Meus leads", icon: Users },
  { id: "chat", label: "Atendimentos", icon: MessageSquare },
  { id: "sales", label: "Minhas vendas", icon: ShoppingBag },
  { id: "customers", label: "Meus clientes", icon: UserCheck },
  { id: "settings", label: "Minha conta", icon: Settings },
] as const;

export function Sidebar({
  currentPage,
  onNavigate,
  collapsed = false,
  userName = "Usuário",
  dealershipName = "",
  onLogout,
  hiddenPages = [],
  planName,
  variant = "manager",
  badges = {},
}: SidebarProps) {
  const isSeller = variant === "seller";
  const items: readonly { id: string; label: string; icon: typeof Car }[] = isSeller ? sellerNavItems : navItems;
  const initials = userName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
  return (
    <aside
      className="flex flex-col h-full"
      style={{
        width: collapsed ? 60 : 224,
        background: "var(--sidebar)",
        borderRight: "1px solid var(--sidebar-border)",
        transition: "width 0.2s",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-4 py-5"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0"
          style={{ width: 32, height: 32, background: "var(--primary)" }}
        >
          <Car size={18} color="#fff" />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
              AutoGestão
            </span>
            {isSeller && (
              <span style={{ color: "#93C5FD", fontSize: 11, fontWeight: 500, lineHeight: 1.3 }}>Área do vendedor</span>
            )}
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1">
        {items.filter(({ id }) => !hiddenPages.includes(id)).map(({ id, label, icon: Icon }) => {
          const active = currentPage === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id as Page)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 w-full text-left transition-colors"
              style={{
                background: active ? "var(--primary)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.65)",
              }}
            >
              <span style={{ position: "relative", display: "inline-flex" }}>
                <Icon size={18} style={{ flexShrink: 0 }} />
                {collapsed && !!badges[id] && <span aria-hidden style={{ position: "absolute", top: -4, right: -5, width: 9, height: 9, borderRadius: 9, background: "#F59E0B", boxShadow: "0 0 0 2px #0F1E33" }} />}
              </span>
              {!collapsed && <span style={{ fontSize: 14 }}>{label}</span>}
              {!collapsed && !!badges[id] && (
                <span title={`${badges[id]} cliente(s) esperando`} className="ml-auto" style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: "#F59E0B", color: "#1F1300", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  {badges[id]}
                </span>
              )}
              {!collapsed && active && !badges[id] && (
                <ChevronRight size={14} className="ml-auto" style={{ opacity: 0.7 }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="px-2 py-3"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        {!isSeller && (
        <button
          onClick={() => onNavigate("plans")}
          className="w-full rounded-lg px-3 py-2 mb-2 flex items-center gap-2 transition-colors"
          style={{ background: "rgba(24,95,165,0.35)", color: "#93C5FD" }}
        >
          {!collapsed && <span style={{ fontSize: 12 }}>⚡ {planName ? `Plano ${planName} · mudar` : "Upgrade de plano"}</span>}
          {collapsed && <Plus size={16} />}
        </button>
        )}

        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{ width: 30, height: 30, background: "var(--primary)", color: "#fff", fontSize: 12, fontWeight: 600 }}
          >
            {initials}
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0 flex-1">
              <span style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>{userName}</span>
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>{dealershipName}</span>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={onLogout}
              title="Sair"
              aria-label="Sair"
              style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }}
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
