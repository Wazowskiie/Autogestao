import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import * as api from "./api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
  status: AuthStatus;
  user: api.AuthUser | null;
  dealership: api.Dealership | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (input: api.RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    dealership: null,
  });

  // Ao carregar a página, tenta restaurar a sessão a partir do refresh
  // token (cookie httpOnly) — o access token em si não sobrevive a um
  // reload porque fica só em memória.
  useEffect(() => {
    (async () => {
      try {
        const { user, dealership } = await api.getMe();
        setState({ status: "authenticated", user, dealership });
      } catch {
        setState({ status: "unauthenticated", user: null, dealership: null });
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    api.setAccessToken(res.accessToken);
    setState({ status: "authenticated", user: res.user, dealership: res.dealership });
  }, []);

  const register = useCallback(async (input: api.RegisterInput) => {
    const res = await api.register(input);
    api.setAccessToken(res.accessToken);
    setState({ status: "authenticated", user: res.user, dealership: res.dealership });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // mesmo que a chamada falhe (ex.: sem rede), limpamos a sessão local
    }
    api.setAccessToken(null);
    setState({ status: "unauthenticated", user: null, dealership: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa ser usado dentro de <AuthProvider>");
  return ctx;
}
