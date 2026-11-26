// Janela "Conectar WhatsApp" da Meta (cadastro incorporado). Abre o login da Meta e devolve o código e os IDs do número.
declare global {
  interface Window { FB?: any; fbAsyncInit?: () => void }
}

export interface EmbeddedSignupResult { code: string; phoneNumberId: string; wabaId: string; businessId?: string }

let sdk: Promise<void> | null = null;

/** Carrega o SDK do Facebook uma vez só. Chamado já ao abrir a tela, para o clique abrir a janela na hora (sem bloqueio de pop-up). */
export function loadSdk(appId: string, version: string) {
  if (sdk) return sdk;
  sdk = new Promise<void>((resolve, reject) => {
    const init = () => { window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version }); resolve(); };
    if (window.FB) { init(); return; }
    window.fbAsyncInit = init;
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true; s.defer = true; s.crossOrigin = "anonymous";
    s.onerror = () => { sdk = null; reject(new Error("Não deu para abrir a janela da Meta. Confira a internet ou se algum bloqueador de anúncios está ativo.")); };
    document.body.appendChild(s);
  });
  return sdk;
}

/** Abre a janela da Meta e espera a loja terminar. Precisa ser chamado direto do clique (senão o navegador bloqueia o pop-up). */
export async function launchEmbeddedSignup(cfg: { appId: string; configId: string; graphVersion?: string }): Promise<EmbeddedSignupResult> {
  await loadSdk(cfg.appId, cfg.graphVersion || "v25.0");
  return new Promise<EmbeddedSignupResult>((resolve, reject) => {
    let ids: { phoneNumberId?: string; wabaId?: string; businessId?: string } = {};
    let code: string | null = null, settled = false;
    const finish = (fn: () => void) => { if (settled) return; settled = true; window.removeEventListener("message", onMessage); fn(); };
    const tryResolve = () => {
      if (code && ids.phoneNumberId && ids.wabaId) finish(() => resolve({ code: code!, phoneNumberId: ids.phoneNumberId!, wabaId: ids.wabaId!, businessId: ids.businessId }));
    };
    // A janela da Meta avisa por mensagem quais conta e número a loja escolheu
    const onMessage = (e: MessageEvent) => {
      let host = "";
      try { host = new URL(e.origin).hostname; } catch { return; }
      if (!/(^|\.)facebook\.com$/.test(host)) return;
      let data: any;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (String(data.event).startsWith("FINISH")) {
        ids = { phoneNumberId: data.data?.phone_number_id, wabaId: data.data?.waba_id, businessId: data.data?.business_id };
        if (!ids.phoneNumberId) finish(() => reject(new Error("A Meta terminou sem um número de telefone. Conecte de novo e escolha ou cadastre o número da loja.")));
        else tryResolve();
      } else if (data.event === "CANCEL") {
        finish(() => reject(new Error("Conexão cancelada antes de terminar.")));
      } else if (data.event === "ERROR") {
        finish(() => reject(new Error(`A Meta mostrou um erro: ${data.data?.error_message ?? "tente de novo"}`)));
      }
    };
    window.addEventListener("message", onMessage);
    window.FB.login((res: any) => {
      code = res?.authResponse?.code ?? null;
      if (!code) { finish(() => reject(new Error("Conexão cancelada antes de terminar."))); return; }
      tryResolve();
      // Se o aviso com os IDs não chegar, não fica esperando para sempre
      setTimeout(() => finish(() => reject(new Error("A Meta não informou qual número foi escolhido. Tente conectar de novo."))), 15000);
    }, {
      config_id: cfg.configId,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
    });
  });
}
