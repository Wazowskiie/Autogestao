// Escolhe uma mensagem pronta, preenche com os dados do cliente/veículo e abre o WhatsApp
import { useEffect, useState } from 'react';
import { Copy, MessageCircle } from 'lucide-react';
import * as crm from '../../../lib/crm-api';
import { useAuth } from '../../../lib/auth-context';
import { getSettings } from '../../../lib/settings-api';
import { CATEGORY_LABELS, TemplateContext, renderTemplate, waLink } from './common';

export function WhatsAppSender({ phone, context, leadId, category, onClose, onSent }: {
  phone: string | null | undefined; context: TemplateContext; leadId?: string; category?: string;
  onClose: () => void; onSent?: (lead?: crm.CrmLead) => void;
}) {
  const auth = useAuth();
  // Só sobrescreve o padrão (loja, vendedor logado) com o que veio preenchido
  const [social, setSocial] = useState<{ instagram?: string | null; whatsapp?: string | null }>({});
  const ctx: TemplateContext = { store: auth.dealership?.name, slug: auth.dealership?.slug, seller: auth.user?.name,
    instagram: social.instagram, storeWhatsapp: social.whatsapp,
    ...Object.fromEntries(Object.entries(context).filter(([, v]) => v != null && v !== '')) };
  const [templates, setTemplates] = useState<crm.Template[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([crm.getTemplates(), getSettings().then((d) => d.dealership.socialLinks ?? {}).catch(() => ({}))]).then(([t, links]) => {
      const so = links as { instagram?: string | null; whatsapp?: string | null };
      setSocial(so);
      setTemplates(t);
      const first = t.find((x) => x.category === category) ?? t[0];
      if (first) { setSelected(first.id); setText(renderTemplate(first.body, { ...ctx, instagram: so.instagram, storeWhatsapp: so.whatsapp })); }
    }).catch((e) => setError(e.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (t: crm.Template) => { setSelected(t.id); setText(renderTemplate(t.body, ctx)); };
  const digits = (phone ?? '').replace(/\D/g, '');
  const current = templates.find((t) => t.id === selected);

  const send = async () => {
    if (!text.trim()) { setError('Escreva a mensagem.'); return; }
    setBusy(true); setError('');
    window.open(waLink(phone, text), '_blank', 'noopener');
    try {
      const lead = leadId ? await crm.messageSent(leadId, { text, templateTitle: current?.title }) : undefined;
      onSent?.(lead);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return <div className="crm-overlay"><section className="crm-modal" role="dialog" aria-modal="true" aria-label="Enviar WhatsApp">
    <header><div><h3>Mensagem no WhatsApp</h3><p>{ctx.name ?? 'Cliente'}{digits ? ` · ${phone}` : ' · sem telefone cadastrado'}</p></div><button type="button" aria-label="Fechar" onClick={onClose}>×</button></header>
    <div className="crm-form-body">
      {error && <p className="crm-error">{error}</p>}
      {!digits && <p className="crm-warning">Este cliente não tem telefone. Cadastre na aba Contato ou copie a mensagem.</p>}
      <div className="crm-template-list">
        {templates.map((t) => <button type="button" key={t.id} className={t.id === selected ? 'active' : ''} onClick={() => pick(t)}>
          <strong>{t.title}</strong>{(CATEGORY_LABELS[t.category] ?? t.category) !== t.title && <small>{CATEGORY_LABELS[t.category] ?? t.category}</small>}
        </button>)}
      </div>
      <label>Mensagem (pode editar antes de enviar)<textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} /></label>
      <small>{leadId ? 'Ao abrir o WhatsApp, a mensagem entra no histórico do lead e conta como contato.' : 'O WhatsApp abre com a mensagem pronta.'}</small>
    </div>
    <footer>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setError('Não foi possível copiar.'); } }}><Copy size={14} />{copied ? 'Copiado!' : 'Copiar'}</button>
      <button className="primary crm-wa" disabled={busy || !digits} onClick={send}><MessageCircle size={15} />{busy ? 'Abrindo…' : 'Abrir WhatsApp'}</button>
    </footer>
  </section></div>;
}
