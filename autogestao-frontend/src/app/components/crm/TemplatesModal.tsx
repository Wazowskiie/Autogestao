// Mensagens prontas: a loja escreve uma vez e usa em todos os leads
import { FormEvent, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as crm from '../../../lib/crm-api';
import { useAuth } from '../../../lib/auth-context';
import { CATEGORY_LABELS, TEMPLATE_VARS, renderTemplate } from './common';

export function TemplatesModal({ onClose }: { onClose: () => void }) {
  const auth = useAuth(), manager = auth.user?.role !== 'seller';
  const [items, setItems] = useState<crm.Template[]>([]);
  const [editing, setEditing] = useState<crm.Template | 'new' | null>(null);
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [category, setCategory] = useState('geral');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = () => crm.getTemplates().then(setItems).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);

  const open = (t: crm.Template | 'new') => {
    setEditing(t); setError('');
    setTitle(t === 'new' ? '' : t.title); setBody(t === 'new' ? '' : t.body); setCategory(t === 'new' ? 'geral' : t.category);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (editing === 'new') await crm.createTemplate({ title, body, category });
      else if (editing) await crm.updateTemplate(editing.id, { title, body, category });
      setEditing(null); await load();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const remove = async (t: crm.Template) => {
    if (!window.confirm(`Excluir a mensagem "${t.title}"?`)) return;
    try { await crm.deleteTemplate(t.id); await load(); } catch (e) { setError((e as Error).message); }
  };
  const sample = { name: 'Maria Souza', vehicle: { id: 'exemplo', brand: 'Honda', model: 'CG 160 Fan', year: 2023, price: 15900 }, store: auth.dealership?.name, slug: auth.dealership?.slug, seller: auth.user?.name };

  return <div className="crm-overlay"><section className="crm-modal" role="dialog" aria-modal="true" aria-label="Mensagens prontas">
    <header><div><h3>Mensagens prontas</h3><p>Usadas no botão WhatsApp de cada lead. As palavras entre chaves são trocadas pelos dados do cliente.</p></div><button type="button" aria-label="Fechar" onClick={onClose}>×</button></header>
    {editing ? <form onSubmit={save}><div className="crm-form-body">
      {error && <p className="crm-error">{error}</p>}
      <div className="crm-form-grid">
        <label>Nome da mensagem<input required minLength={2} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Tipo<select value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <label>Texto<textarea required rows={5} minLength={2} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <div className="crm-vars">{TEMPLATE_VARS.map(([v, d]) => <button type="button" key={v} title={d} onClick={() => setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}${v}`)}>{v}</button>)}</div>
      <div className="crm-preview"><small>Como fica (exemplo):</small><p>{renderTemplate(body || '…', sample)}</p></div>
    </div><footer><button type="button" onClick={() => setEditing(null)}>Voltar</button><button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar mensagem'}</button></footer></form>
      : <div className="crm-form-body">
        {error && <p className="crm-error">{error}</p>}
        {items.map((t) => <article key={t.id} className="crm-template-row">
          <div><strong>{t.title}</strong><small>{CATEGORY_LABELS[t.category] ?? t.category}</small><p>{t.body}</p></div>
          {manager && <div className="crm-task-actions"><button onClick={() => open(t)} title="Editar"><Pencil size={13} /></button><button onClick={() => remove(t)} title="Excluir"><Trash2 size={13} /></button></div>}
        </article>)}
        {manager ? <button className="primary" onClick={() => open('new')}><Plus size={14} />Nova mensagem</button> : <small>Só o dono ou o administrador pode editar as mensagens.</small>}
      </div>}
  </section></div>;
}
