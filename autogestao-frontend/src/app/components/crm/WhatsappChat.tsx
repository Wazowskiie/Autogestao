// Conversa do WhatsApp oficial dentro do lead: ver e responder sem sair do sistema
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCheck, Send } from 'lucide-react';
import * as crm from '../../../lib/crm-api';
import * as wa from '../../../lib/whatsapp-api';
import { useAuth } from '../../../lib/auth-context';
import { renderTemplate } from './common';
import { WhatsAppSender } from './WhatsAppSender';

const time = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function WhatsappChat({ lead, onChanged }: { lead: crm.CrmLead; onChanged: () => void }) {
  const auth = useAuth();
  const [conv, setConv] = useState<wa.WhatsappConversation | null>(null);
  const [text, setText] = useState('');
  const [templates, setTemplates] = useState<crm.Template[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [fallback, setFallback] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const count = useRef(0);

  const load = useCallback(async () => {
    try {
      const c = await wa.getWhatsappConversation(lead.id);
      setConv(c);
      if (c.items.length !== count.current) { count.current = c.items.length; setTimeout(() => bottom.current?.scrollIntoView({ block: 'end' }), 30); }
    } catch (e) { setError((e as Error).message); }
  }, [lead.id]);
  useEffect(() => {
    void load(); crm.getTemplates().then(setTemplates).catch(() => {});
    const t = setInterval(() => { if (!document.hidden) void load(); }, 8000);
    return () => clearInterval(t);
  }, [load]);

  const send = async (e: FormEvent) => {
    e.preventDefault(); if (!text.trim()) return;
    setBusy(true); setError('');
    try { const c = await wa.sendWhatsapp(lead.id, text); setConv(c); setText(''); count.current = -1; void load(); onChanged(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id); if (!t) return;
    setText(renderTemplate(t.body, {
      name: lead.customer?.name, store: auth.dealership?.name, slug: auth.dealership?.slug, seller: lead.assignedSeller?.name ?? auth.user?.name,
      vehicle: lead.vehicle ? { id: lead.vehicle.id, brand: lead.vehicle.brand, model: lead.vehicle.model, year: lead.vehicle.year, price: lead.vehicle.price } : null,
    }));
  };

  const open = !!conv?.windowOpenUntil;
  return <div className="crm-wa-chat">
    {conv && !conv.connected && <p className="crm-warning">O WhatsApp oficial da loja não está conectado{conv.accountStatus === 'error' ? ' (está com erro)' : ''}. Peça ao dono para conectar em Configurações → Integrações. Enquanto isso, use o botão WhatsApp do lead.</p>}
    <div className="crm-wa-thread">
      {conv?.items.length === 0 && <p className="crm-empty">Nenhuma mensagem do WhatsApp oficial com este cliente ainda.</p>}
      {conv?.items.map((m) => <div key={m.id} className={`crm-wa-bubble ${m.direction}`}>
        <p>{m.body ?? `[${m.type}]`}</p>
        <small>{time(m.sentAt)}{m.direction === 'out' && <> {m.status === 'read' ? <CheckCheck size={13} color="#2563eb" /> : m.status === 'delivered' ? <CheckCheck size={13} /> : m.status === 'failed' ? <AlertCircle size={13} color="#dc2626" /> : <Check size={13} />}</>}</small>
        {m.status === 'failed' && m.error && <small className="crm-wa-error">{m.error}</small>}
      </div>)}
      <div ref={bottom} />
    </div>
    {error && <p className="crm-error">{error}</p>}
    {conv?.connected && (open ? <form className="crm-wa-composer" onSubmit={send}>
      <div className="crm-wa-window">Pode responder até {new Date(conv.windowOpenUntil!).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} (regra de 24h da Meta)
        {templates.length > 0 && <select value="" onChange={(e) => applyTemplate(e.target.value)}><option value="">Usar mensagem pronta…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select>}
      </div>
      <div className="crm-wa-input">
        <textarea rows={2} value={text} maxLength={4096} placeholder="Escreva a resposta…" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }} />
        <button className="primary crm-wa" disabled={busy || !text.trim()} aria-label="Enviar"><Send size={16} /></button>
      </div>
    </form> : <div className="crm-wa-closed">
      <span>{conv.items.some((m) => m.direction === 'in') ? 'Passaram 24h desde a última mensagem do cliente. Pela regra da Meta, chame pelo WhatsApp normal.' : 'O cliente ainda não mandou mensagem no WhatsApp oficial.'}</span>
      <button className="crm-wa-light" onClick={() => setFallback(true)}>Chamar no WhatsApp</button>
    </div>)}
    {fallback && <WhatsAppSender phone={lead.customer?.phone} leadId={lead.id} category="retorno"
      context={{ name: lead.customer?.name, seller: lead.assignedSeller?.name, vehicle: lead.vehicle ? { id: lead.vehicle.id, brand: lead.vehicle.brand, model: lead.vehicle.model, year: lead.vehicle.year, price: lead.vehicle.price } : null }}
      onClose={() => setFallback(false)} onSent={() => { setFallback(false); onChanged(); }} />}
  </div>;
}
