import { useEffect, useRef, useState } from 'react';
import { Conversation, publicChat } from '../../lib/chat-api';
import { StorefrontVehicle } from '../../lib/api';
import './chat.css';

export function CustomerChat({ slug, vehicles }: { slug: string; vehicles: StorefrontVehicle[] }) {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [contactOpen, setContactOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [consent, setConsent] = useState(false);
  const token = useRef<string | null>(null);
  const pending = useRef<{ content: string; id: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const storageKey = `autogestao-chat:${slug}`;
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [conversation?.messages.length]);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const init = async () => {
      setBusy(true); setError('');
      try {
        try { token.current = sessionStorage.getItem(storageKey); } catch { token.current = null; }
        if (token.current) {
          try { const c = await publicChat<Conversation>(slug, token.current); if (!cancelled) setConversation(c); return; }
          catch (e) { if ((e as { status?: number }).status !== 401) throw e; token.current = null; }
        }
        const result = await publicChat<{ token: string; conversation: Conversation }>(slug, null, '', {});
        token.current = result.token;
        try { sessionStorage.setItem(storageKey, result.token); } catch { /* this tab still keeps the token in memory */ }
        if (!cancelled) setConversation(result.conversation);
      } catch (e) { if (!cancelled) setError((e as Error).message); }
      finally { if (!cancelled) setBusy(false); }
    };
    void init();
    return () => { cancelled = true; };
  }, [open, slug, storageKey]);
  useEffect(() => {
    if (!open || !conversation || conversation.mode === 'closed') return;
    const timer = setInterval(() => {
      if (document.hidden || !token.current) return;
      publicChat<Conversation>(slug, token.current).then(setConversation).catch(() => {});
    }, 6000);
    return () => clearInterval(timer);
  }, [open, slug, conversation?.id, conversation?.mode]);

  const action = async (endpoint: string, body: unknown) => {
    if (!token.current) return;
    setBusy(true); setError('');
    try { setConversation(await publicChat<Conversation>(slug, token.current, endpoint, body)); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (!text.trim() || busy) return;
    if (!pending.current || pending.current.content !== text.trim()) pending.current = { content: text.trim(), id: crypto.randomUUID() };
    if (await action('/messages', { content: pending.current.content, clientMessageId: pending.current.id })) { setText(''); pending.current = null; }
  };
  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await action('/contact', { name, phone: phone.replace(/\D/g, ''), consent, vehicleId: vehicleId || undefined })) setContactOpen(false);
  };
  const restart = () => { try { sessionStorage.removeItem(storageKey); } catch {} token.current = null; setConversation(null); setOpen(false); };

  return <div className="customer-chat">
    {!open && <button className="chat-launch" onClick={() => setOpen(true)}>💬 Conversar com a loja</button>}
    {open && <section className="chat-window" aria-label="Atendimento da loja">
      <header><div><strong>Atendimento da loja</strong><small>{conversation?.mode === 'human' ? 'Equipe • aguardando ou em atendimento' : conversation?.mode === 'closed' ? 'Conversa encerrada' : 'Assistente virtual'}</small></div><button aria-label="Fechar chat" onClick={() => setOpen(false)}>×</button></header>
      <div className="chat-transcript" role="log" aria-live="polite">
        {conversation?.messages.map(m => <div key={m.id} className={`chat-bubble ${m.role}`}><small>{m.role === 'user' ? 'Você' : m.role === 'agent' ? 'Vendedor' : m.role === 'assistant' ? 'Assistente virtual' : ''}</small><div>{m.content}</div></div>)}
        {busy && <p className="chat-note">Aguarde…</p>}<div ref={end} />
      </div>
      {error && <p className="chat-error" role="alert">{error}</p>}
      {conversation?.mode !== 'closed' && <>
        <div className="chat-actions"><button disabled={busy || !conversation} onClick={() => setContactOpen(!contactOpen)}>Deixar contato</button><button disabled={busy || !conversation || conversation.mode === 'human'} onClick={() => action('/handover', {})}>Falar com vendedor</button></div>
        {contactOpen && <form className="chat-contact" onSubmit={saveContact}>
          <input required minLength={2} maxLength={100} placeholder="Seu nome" aria-label="Nome" value={name} onChange={e => setName(e.target.value)} />
          <input required type="tel" placeholder="Telefone com DDD" aria-label="Telefone" value={phone} onChange={e => setPhone(e.target.value)} />
          <select aria-label="Veículo de interesse" value={vehicleId} onChange={e => setVehicleId(e.target.value)}><option value="">Veículo de interesse (opcional)</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model} {v.year}</option>)}</select>
          <label><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} /> Autorizo a loja a usar meu nome e telefone para retornar sobre este atendimento.</label>
          <button disabled={busy}>Registrar interesse</button>
        </form>}
        <form className="chat-compose" onSubmit={send}><input aria-label="Mensagem" maxLength={2000} disabled={busy || !conversation} placeholder="Que veículo você procura?" value={text} onChange={e => setText(e.target.value)} /><button disabled={busy || !conversation || !text.trim()}>Enviar</button></form>
      </>}
      <footer><span>Conversas ficam registradas para atendimento. Evite enviar documentos ou dados bancários.</span><button onClick={restart} disabled={busy}>Novo atendimento</button></footer>
    </section>}
  </div>;
}
