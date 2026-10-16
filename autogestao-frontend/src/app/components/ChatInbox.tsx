import { useEffect, useRef, useState } from 'react';
import { Conversation, ConversationList, getChat, listChats, sendAgentMessage, setChatMode } from '../../lib/chat-api';
import './chat.css';

const labels = { bot: 'IA ativa', human: 'Atendimento humano', closed: 'Encerrada' };
export function ChatInbox({initialId,onOpenLead}:{initialId?:string|null;onOpenLead?:(id:string)=>void}) {
  const [list, setList] = useState<ConversationList | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(initialId??null);
  useEffect(()=>{if(initialId)setSelected(initialId);},[initialId]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ content: string; id: string } | null>(null);
  const load = () => listChats(page).then(setList).catch(e => setError(e.message));
  useEffect(() => {
    let active = true;
    const update = () => { if (!document.hidden) listChats(page).then(data => { if (active) setList(data); }).catch(e => { if (active) setError(e.message); }); };
    update(); const timer = setInterval(update, 6000);
    return () => { active = false; clearInterval(timer); };
  }, [page]);
  useEffect(() => {
    setConversation(null); setText(''); pending.current = null;
    if (!selected) return;
    let active = true;
    const update = () => getChat(selected).then(c => { if (active) setConversation(c); }).catch(e => { if (active) setError(e.message); });
    update(); const timer = setInterval(() => { if (!document.hidden) update(); }, 6000);
    return () => { active = false; clearInterval(timer); };
  }, [selected]);
  const mode = async (next: Conversation['mode']) => {
    if (!selected) return; setBusy(true); setError('');
    try { setConversation(await setChatMode(selected, next)); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selected || !text.trim() || busy) return;
    if (!pending.current || pending.current.content !== text.trim()) pending.current = { content: text.trim(), id: crypto.randomUUID() };
    setBusy(true); setError('');
    try { setConversation(await sendAgentMessage(selected, pending.current.content, pending.current.id)); setText(''); pending.current = null; await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="chat-inbox">
    <h2>Atendimentos</h2><p>Converse com os visitantes da loja e acompanhe os interesses registrados no CRM.</p>
    {error && <p className="chat-error" role="alert">{error}</p>}
    <div className="inbox-columns">
      <aside><div className="inbox-list">{list?.items.map(c => <button key={c.id} className={selected === c.id ? 'selected' : ''} onClick={() => setSelected(c.id)}>
        <strong>{c.customer?.name ?? 'Visitante'}</strong><small>{labels[c.mode]}</small><span>{c.messages[0]?.content.slice(0, 100)}</span>
      </button>)}{list?.total === 0 && <p>Nenhum atendimento ainda. Abra o site da loja para testar.</p>}</div>
      <div className="chat-actions"><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page}</span><button disabled={!list || page * 30 >= list.total} onClick={() => setPage(p => p + 1)}>Próxima</button></div></aside>
      <section>{conversation ? <>
        <header><div><strong>{conversation.customer?.name ?? 'Visitante'}</strong><small>{conversation.customer?.phone ?? 'Contato ainda não informado'} • {labels[conversation.mode]}</small>{conversation.leadId && <small>Lead registrado no CRM</small>}{conversation.assignedUser && <small>Responsável: {conversation.assignedUser.name}</small>}</div></header>
        <div className="chat-actions"><button disabled={busy} onClick={() => mode('human')}>Assumir</button><button disabled={busy || conversation.mode === 'bot'} onClick={() => mode('bot')}>Reativar IA</button><button disabled={busy || conversation.mode === 'closed'} onClick={() => mode('closed')}>Encerrar</button>{conversation.leadId&&<button onClick={()=>onOpenLead?.(conversation.leadId!)}>Abrir lead no CRM</button>}</div>
        <div className="chat-transcript" role="log">{conversation.messages.map(m => <div key={m.id} className={`chat-bubble ${m.role}`}><small>{m.role === 'user' ? 'Cliente' : m.role === 'assistant' ? 'Assistente virtual' : m.role === 'agent' ? 'Vendedor' : ''} {new Date(m.createdAt).toLocaleTimeString('pt-BR')}</small><div>{m.content}</div></div>)}</div>
        <form className="chat-compose" onSubmit={send}><input maxLength={2000} aria-label="Resposta ao cliente" placeholder={conversation.mode === 'human' ? 'Escreva sua resposta' : 'Clique em Assumir para responder'} disabled={busy || conversation.mode !== 'human'} value={text} onChange={e => setText(e.target.value)} /><button disabled={busy || !text.trim() || conversation.mode !== 'human'}>Enviar</button></form>
      </> : <p className="inbox-empty">Selecione uma conversa para acompanhar o histórico e assumir o atendimento.</p>}</section>
    </div>
  </div>;
}
