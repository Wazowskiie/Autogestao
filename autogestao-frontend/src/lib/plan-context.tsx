// Plano da loja: o que está liberado no sistema e quanto já foi usado
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { request } from "./api";
import { useAuth } from "./auth-context";

export type PlanFeature = "crm" | "chat" | "nfe" | "renave" | "assistant" | "priority_support";

export interface PlanSpec {
  id: string; name: string; description: string;
  price: number; yearlyPrice: number;
  vehicleLimit: number; userLimit: number;
  plateLookupsPerMonth: number; nfePerMonth: number; assistantPerDay: number;
  features: PlanFeature[]; highlight?: boolean; support: string; highlights: string[];
}

export interface CurrentPlan {
  plan: PlanSpec;
  status: "trialing" | "active" | "past_due" | "canceled";
  trialActive: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number;
  canSwitchFree: boolean;
  features: PlanFeature[];
  usage: { vehicles: number; users: number; plateLookups: number; nfe: number; assistant: number };
}

export const UNLIMITED = 99999;

export const listPlanCatalog = () => request<PlanSpec[]>("/plans");
export const getCurrentPlan = () => request<CurrentPlan>("/plans/current");
export const changePlan = (planId: string) => request<CurrentPlan>("/plans/change", { method: "POST", body: { planId } });

interface PlanContextValue {
  current: CurrentPlan | null;
  /** O recurso está no plano? Enquanto carrega (ou se falhar), mostra tudo: quem bloqueia de verdade é o servidor */
  has: (feature: PlanFeature) => boolean;
  refresh: () => Promise<void>;
  setCurrent: (c: CurrentPlan) => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [current, setCurrent] = useState<CurrentPlan | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCurrent(await getCurrentPlan());
    } catch {
      // sem plano carregado: não esconde nada
    }
  }, []);

  useEffect(() => {
    if (auth.status === "authenticated") refresh();
    else setCurrent(null);
  }, [auth.status, auth.dealership?.id, refresh]);

  const has = useCallback((f: PlanFeature) => (current ? current.features.includes(f) : true), [current]);

  return <PlanContext.Provider value={{ current, has, refresh, setCurrent }}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan precisa ser usado dentro de <PlanProvider>");
  return ctx;
}
