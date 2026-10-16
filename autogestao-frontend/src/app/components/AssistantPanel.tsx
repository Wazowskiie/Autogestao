import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles, X, Send, Loader2, Copy, Check, RotateCcw, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import * as aapi from "../../lib/assistant-api";
import { useAuth } from "../../lib/auth-context";

// =====================================================================
// Assistente virtual: botão flutuante + conversa, em qualquer tela
// =====================================================================

const PURPLE = "#6D28D9";
const PURPLE_BG = "#F3EEFF";
const STORAGE_KEY = "autogestao_assistente";

type ActionState = "pending" | "running" | "done" | "canceled" | "error";
interface ChatItem {
  id: number;
  role: "user" | "assistant";
  content: string;
  actions?: (aapi.AssistantAction & { state: ActionState; result?: string })[];
  error?: boolean;
}

const SUGGESTIONS_MANAGER = [
  "Como foram as vendas este mês?",
  "Quais veículos estão parados há mais de 60 dias?",
  "Tem promissória vencida?",
  "O que tenho pra fazer hoje no CRM?",
  "Escreve um anúncio para o veículo mais recente",
  "Como registro uma venda com troca?",
];
const SUGGESTIONS_SELLER = [
  "O que tenho pra fazer hoje no CRM?",
  "Quais motos estão disponíveis?",
  "Escreve uma mensagem de WhatsApp para um cliente interessado",
  "Como cadastro um lead novo?",
];

let nextId = 1;

function load(): ChatItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const items = raw ? (JSON.parse(raw) as ChatItem[]) : [];
    nextId = items.reduce((m, i) => Math.max(m, i.id), 0) + 1;
    return items;
  } catch {
    return [];
  }
}
function save(items: ChatItem[]) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-40))); } catch { /* sem problema */ }
}

// ---------- Texto com **negrito**, listas e quebras de linha (sem HTML) ----------
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
      : <Fragment key={`${key}-${i}`}>{part}</Fragment>,
  );
}
function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    out.push(
      <Tag key={`l${out.length}`} style={{ margin: "4px 0 6px", paddingLeft: 20, listStyle: list.ordered ? "decimal" : "disc" }}>
        {list.items.map((it, i) => <li key={i} style={{ margin: "2px 0" }}>{inline(it, `li${out.length}-${i}`)}</li>)}
      </Tag>,
    );
    list = null;
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      const ordered = !!num;
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? num)![1]);
      return;
    }
    flush();
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    if (heading) out.push(<div key={i} style={{ fontWeight: 600, margin: "6px 0 2px" }}>{inline(heading[1], `h${i}`)}</div>);
    else if (line.trim()) out.push(<div key={i} style={{ margin: "2px 0" }}>{inline(line, `p${i}`)}</div>);
    else out.push(<div key={i} style={{ height: 6 }} />);
  });
  flush();
  return <>{out}</>;
}

function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800); } catch { /* sem permissão */ }
      }}
      className="flex items-center gap-1"
      style={{ fontSize: 11, color: ok ? "#27500A" : "#9CA3AF" }}
      title="Copiar resposta"
    >
      {ok ? <Check size={12} /> : <Copy size={12} />} {ok ? "Copiado" : "Copiar"}
    </button>
  );
}

export function AssistantPanel({ currentPage }: { currentPage?: string }) {
  const auth = useAuth();
  const isManager = auth.user?.role === "owner" || auth.user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChatItem[]>(load);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { save(items); }, [items]);
  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [items, open, busy]);
  useEffect(() => {
    if (!open || enabled !== null) return;
    aapi.getAssistantStatus().then((s) => setEnabled(s.enabled)).catch(() => setEnabled(false));
  }, [open, enabled]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  async function send(question?: string) {
    const content = (question ?? text).trim();
    if (!content || busy) return;
    setText("");
    const userItem: ChatItem = { id: nextId++, role: "user", content };
    const next = [...items, userItem];
    setItems(next);
    setBusy(true);
    try {
      // Envia só os textos (sem as mensagens de erro)
      const history = next.filter((i) => !i.error).map((i) => ({ role: i.role, content: i.content }));
      const res = await aapi.askAssistant(history, currentPage);
      setItems((prev) => [...prev, {
        id: nextId++, role: "assistant", content: res.reply,
        actions: res.actions.map((a) => ({ ...a, state: "pending" as ActionState })),
      }]);
    } catch (e) {
      setItems((prev) => [...prev, { id: nextId++, role: "assistant", content: e instanceof Error ? e.message : "Não consegui responder agora.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function setAction(itemId: number, token: string, patch: { state: ActionState; result?: string }) {
    setItems((prev) => prev.map((i) => i.id !== itemId ? i : {
      ...i, actions: i.actions?.map((a) => (a.token === token ? { ...a, ...patch } : a)),
    }));
  }

  async function confirm(itemId: number, token: string) {
    setAction(itemId, token, { state: "running" });
    try {
      const r = await aapi.confirmAssistantAction(token);
      setAction(itemId, token, { state: "done", result: r.message });
    } catch (e) {
      setAction(itemId, token, { state: "error", result: e instanceof Error ? e.message : "Não foi possível concluir." });
    }
  }

  const suggestions = isManager ? SUGGESTIONS_MANAGER : SUGGESTIONS_SELLER;
  const firstName = auth.user?.name?.split(" ")[0] ?? "";

  return (
    <>
      {/* Botão flutuante */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed flex items-center gap-2 rounded-full"
          style={{ right: 20, bottom: 20, zIndex: 900, background: PURPLE, color: "#fff", padding: "12px 18px", fontSize: 14, fontWeight: 600, boxShadow: "0 8px 24px rgba(109,40,217,0.35)" }}
          title="Abrir assistente"
        >
          <Sparkles size={18} /> Assistente
        </button>
      )}

      {/* Painel */}
      {open && (
        <div
          className="fixed flex flex-col"
          style={{
            right: 16, bottom: 16, zIndex: 900, width: "min(420px, calc(100vw - 32px))", height: "min(640px, calc(100vh - 32px))",
            background: "#fff", borderRadius: 16, boxShadow: "0 20px 50px rgba(15,23,42,0.28)", overflow: "hidden", border: "0.5px solid rgba(0,0,0,0.08)",
          }}
        >
          <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ background: PURPLE, color: "#fff" }}>
            <div className="flex items-center justify-center rounded-full" style={{ width: 32, height: 32, background: "rgba(255,255,255,0.18)" }}>
              <Sparkles size={17} />
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 14, fontWeight: 600 }}>Assistente AutoGestão</div>
              <div style={{ fontSize: 11, opacity: 0.8 }}>Pergunte sobre a loja ou peça ajuda com o sistema</div>
            </div>
            {items.length > 0 && (
              <button onClick={() => setItems([])} title="Nova conversa" className="p-1.5 rounded" style={{ color: "#fff", opacity: 0.85 }}>
                <RotateCcw size={16} />
              </button>
            )}
            <button onClick={() => setOpen(false)} title="Fechar" className="p-1.5 rounded" style={{ color: "#fff" }}>
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4" style={{ background: "#FAFAFB" }}>
            {enabled === false && (
              <div className="rounded-lg p-3 mb-3 flex gap-2" style={{ background: "#FEF3C7", color: "#92400E", fontSize: 12 }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  A assistente ainda não está ligada.{" "}
                  {isManager ? "Coloque a ANTHROPIC_API_KEY no .env do backend e reinicie o servidor." : "Peça para o dono da loja ativar."}
                </span>
              </div>
            )}

            {items.length === 0 && (
              <div>
                <p style={{ fontSize: 14, color: "#0F1923", fontWeight: 600, marginBottom: 4 }}>Oi{firstName ? `, ${firstName}` : ""}! 👋</p>
                <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 14 }}>
                  Posso consultar os dados da loja, escrever anúncios e mensagens, fazer tarefas pra você (sempre pedindo sua confirmação) e explicar como usar o sistema.
                </p>
                <div className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => send(s)} disabled={busy || enabled === false}
                      className="text-left rounded-lg px-3 py-2"
                      style={{ fontSize: 13, color: PURPLE, background: PURPLE_BG, border: "0.5px solid rgba(109,40,217,0.15)", opacity: enabled === false ? 0.6 : 1 }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {items.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div style={{ maxWidth: "88%" }}>
                    <div
                      className="rounded-2xl px-3.5 py-2.5"
                      style={{
                        fontSize: 13, lineHeight: 1.5, wordBreak: "break-word",
                        ...(m.role === "user"
                          ? { background: PURPLE, color: "#fff", borderBottomRightRadius: 6, whiteSpace: "pre-wrap" as const }
                          : m.error
                            ? { background: "#FEE2E2", color: "#991B1B", borderBottomLeftRadius: 6 }
                            : { background: "#fff", color: "#1F2937", border: "0.5px solid rgba(0,0,0,0.08)", borderBottomLeftRadius: 6 }),
                      }}
                    >
                      {m.role === "user" ? m.content : <RichText text={m.content} />}
                    </div>

                    {m.actions?.map((a) => (
                      <div key={a.token} className="rounded-xl mt-2 overflow-hidden" style={{ border: `1px solid ${a.state === "done" ? "#B7D99A" : "rgba(109,40,217,0.3)"}`, background: "#fff" }}>
                        <div className="px-3 py-2.5" style={{ fontSize: 13, color: "#1F2937", lineHeight: 1.5 }}>
                          <RichText text={a.summary} />
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2" style={{ background: a.state === "done" ? "#EAF3DE" : a.state === "error" ? "#FEE2E2" : "#F9FAFB", borderTop: "0.5px solid rgba(0,0,0,0.06)" }}>
                          {a.state === "pending" && (
                            <>
                              <button onClick={() => confirm(m.id, a.token)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg" style={{ background: PURPLE, color: "#fff", fontSize: 12, fontWeight: 600 }}>
                                <Check size={13} /> Confirmar
                              </button>
                              <button onClick={() => setAction(m.id, a.token, { state: "canceled" })} className="px-3 py-1.5 rounded-lg" style={{ fontSize: 12, color: "#6B7280" }}>
                                Cancelar
                              </button>
                            </>
                          )}
                          {a.state === "running" && <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: "#6B7280" }}><Loader2 size={13} className="animate-spin" /> Fazendo...</span>}
                          {a.state === "done" && <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: "#27500A", fontWeight: 500 }}><CheckCircle2 size={14} /> {a.result ?? "Feito!"}</span>}
                          {a.state === "canceled" && <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: "#9CA3AF" }}><XCircle size={14} /> Cancelado</span>}
                          {a.state === "error" && (
                            <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: "#991B1B" }}>
                              <AlertTriangle size={14} /> {a.result}
                              <button onClick={() => confirm(m.id, a.token)} style={{ marginLeft: 6, fontWeight: 600, color: PURPLE }}>Tentar de novo</button>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {m.role === "assistant" && !m.error && m.content.length > 60 && (
                      <div className="mt-1 pl-1"><CopyButton text={m.content} /></div>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-3.5 py-2.5 flex items-center gap-2" style={{ background: "#fff", border: "0.5px solid rgba(0,0,0,0.08)", fontSize: 13, color: "#6B7280" }}>
                    <Loader2 size={14} className="animate-spin" /> Pensando...
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="flex items-end gap-2 px-3 py-3 flex-shrink-0" style={{ borderTop: "0.5px solid rgba(0,0,0,0.08)", background: "#fff" }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Escreva sua pergunta..."
              disabled={enabled === false}
              className="flex-1 rounded-xl px-3 py-2.5"
              style={{ fontSize: 13, border: "0.5px solid rgba(0,0,0,0.15)", outline: "none", resize: "none", maxHeight: 120, background: "#FAFAFA" }}
            />
            <button onClick={() => send()} disabled={busy || !text.trim() || enabled === false}
              className="flex items-center justify-center rounded-xl"
              style={{ width: 40, height: 40, background: PURPLE, color: "#fff", opacity: busy || !text.trim() ? 0.5 : 1 }} title="Enviar">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
