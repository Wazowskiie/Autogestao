import {
  LayoutDashboard, Car, Users, DollarSign, Megaphone,
  Globe, Settings, ChevronRight, Plus, LogOut, ShoppingBag,
  UserCheck, FileText, Package
} from "lucide-react";

type Page =
  | "dashboard" | "inventory" | "leads" | "financial"
  | "ads" | "site" | "settings" | "plans" | "login" | "storefront" | "onboarding"
  | "sales" | "customers" | "sellers" | "promissory" | "parts";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  collapsed?: boolean;
  userName?: string;
  dealershipName?: string;
  onLogout?: () => void;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "inventory", label: "Estoque", icon: Car },
  { id: "sales", label: "Vendas", icon: ShoppingBag },
  { id: "customers", label: "Clientes", icon: Users },
  { id: "leads", label: "Leads", icon: Users },
  { id: "sellers", label: "Vendedores", icon: UserCheck },
  { id: "financial", label: "Financeiro", icon: DollarSign },
  { id: "promissory", label: "Promissórias", icon: FileText },
  { id: "parts", label: "Peças", icon: Package },
  { id: "ads", label: "Anúncios", icon: Megaphone },
  { id: "site", label: "Meu Site", icon: Globe },
  { id: "settings", label: "Configurações", icon: Settings },
] as const;

export function Sidebar({
  currentPage,
  onNavigate,
  collapsed = false,
  userName = "Usuário",
  dealershipName = "",
  onLogout,
}: SidebarProps) {
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
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>
            AutoGestão
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1">
        {navItems.map(({ id, label, icon: Icon }) => {
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
              <Icon size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ fontSize: 14 }}>{label}</span>}
              {!collapsed && active && (
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
        <button
          onClick={() => onNavigate("plans")}
          className="w-full rounded-lg px-3 py-2 mb-2 flex items-center gap-2 transition-colors"
          style={{ background: "rgba(24,95,165,0.35)", color: "#93C5FD" }}
        >
          {!collapsed && <span style={{ fontSize: 12 }}>⚡ Upgrade de plano</span>}
          {collapsed && <Plus size={16} />}
        </button>

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
