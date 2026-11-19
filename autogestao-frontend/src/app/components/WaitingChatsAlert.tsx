import { useEffect, useRef, useState } from "react";
import { BellRing, X } from "lucide-react";
import { getWaitingChats, WaitingChats } from "../../lib/chat-api";

/** Toca um aviso curto (dois bipes) sem precisar de arquivo de som */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.22].forEach((t, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = i ? 1046 : 784;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch { /* navegador sem áudio */ }
}

/**
 * Fila aberta do chat: confere a cada 15s se tem cliente esperando vendedor.
 * Quando chega um novo, toca o aviso, mostra o alerta na tela (e no Windows/celular, se permitido).
 */
export function useWaitingChats(enabled: boolean) {
  const [data, setData] = useState<WaitingChats | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<WaitingChats["items"][number] | null>(null);
  useEffect(() => {
    if (!enabled) { setData(null); seen.current = null; return; }
    let active = true;
    const check = () => getWaitingChats().then((d) => {
      if (!active) return;
      setData(d);
      const ids = new Set(d.items.map((i) => i.id));
      if (seen.current) {
        const novo = d.items.find((i) => !seen.current!.has(i.id));
        if (novo) {
          setFresh(novo); chime();
          if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
            try { new Notification("Cliente esperando atendimento", { body: `${novo.name}${novo.lastMessage ? `: ${novo.lastMessage}` : ""}`, tag: novo.id }); } catch { /* ignora */ }
          }
        }
      }
      seen.current = ids;
    }).catch(() => {});
    check();
    const t = setInterval(check, 15000);
    // Atualiza na hora quando alguém assume pela tela de Atendimentos
    window.addEventListener("chat-waiting-refresh", check);
    return () => { active = false; clearInterval(t); window.removeEventListener("chat-waiting-refresh", check); };
  }, [enabled]);
  return { count: data?.count ?? 0, fresh, dismiss: () => setFresh(null) };
}

export function WaitingChatsToast({ item, count, onOpen, onClose }: {
  item: WaitingChats["items"][number]; count: number; onOpen: (id: string) => void; onClose: () => void;
}) {
  const [canNotify, setCanNotify] = useState(() => "Notification" in window && Notification.permission === "default");
  return (
    <div role="alert" style={{ position: "fixed", top: 16, right: 16, zIndex: 60, width: 340, background: "#fff", borderRadius: 12, boxShadow: "0 12px 32px rgba(15,30,51,0.22)", border: "1px solid #FCD9A6", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 10, padding: "14px 14px 10px", alignItems: "flex-start" }}>
        <span style={{ width: 34, height: 34, borderRadius: 17, background: "#FEF3C7", color: "#B45309", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><BellRing size={17} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>Cliente esperando vendedor</div>
          <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}><b>{item.name}</b>{item.lastMessage ? ` — “${item.lastMessage}”` : ""}</div>
          {count > 1 && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{count} clientes na fila</div>}
        </div>
        <button aria-label="Fechar aviso" onClick={onClose} style={{ color: "#9CA3AF", padding: 2 }}><X size={16} /></button>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "0 14px 14px" }}>
        <button onClick={() => onOpen(item.id)} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, background: "#185FA5", color: "#fff", fontSize: 13, fontWeight: 600 }}>Atender agora</button>
        {canNotify && <button onClick={() => Notification.requestPermission().then(() => setCanNotify(false))} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, color: "#374151" }}>Avisar fora da aba</button>}
      </div>
    </div>
  );
}
