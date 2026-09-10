
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { PublicStorefront } from "./app/components/PublicStorefront";
  import { AuthProvider } from "./lib/auth-context";
  import "./styles/index.css";

  // Roteamento mínimo: a vitrine pública (/loja/:slug) não precisa de login
  // nem do AuthProvider redirecionando pra tela de login. Tudo o mais cai
  // no sistema interno normal.
  const pathMatch = window.location.pathname.match(/^\/loja\/([^/]+)/);

  const root = createRoot(document.getElementById("root")!);

  if (pathMatch) {
    root.render(<PublicStorefront slug={pathMatch[1]} />);
  } else {
    root.render(
      <AuthProvider>
        <App />
      </AuthProvider>,
    );
  }
  