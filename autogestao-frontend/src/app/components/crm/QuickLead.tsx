// Lead rápido: quem chamou no WhatsApp, Instagram, Facebook... em poucos segundos
import { FormEvent, useEffect, useState } from 'react';
import * as crm from '../../../lib/crm-api';
import { sourceLabels } from './common';

const QUICK_SOURCES = ['whatsapp', 'instagram', 'facebook', 'olx', 'webmotors', 'presencial', 'indicacao', 'outro'];

function phoneMask(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function QuickLead({ onClose, onSaved }: { onClose: () => void; onSaved: (lead: crm.CrmLead) => void }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [source, setSource] = useState(() => { try { return localStorage.getItem('crm_quick_source') || 'whatsapp'; } catch { return 'whatsapp'; } });
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicles, setVehicles] = useState<crm.CrmOptions['vehicles']>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [message, setMessage] = useState('');
  const [hot, setHot] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => crm.getOptions(vehicleSearch).then((o) => { if (alive) setVehicles(o.vehicles.filter((v) => v.status !== 'sold')); }).catch(() => {}), 250);
    return () => { alive = false; clearTimeout(t); };
  }, [vehicleSearch]);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError('');
    const digits = phone.replace(/\D/g, '');
    if (digits && (digits.length < 10 || digits.length > 11)) { setError('Telefone com DDD, ex: (85) 99999-9999'); return; }
    if (name.trim().length < 2) { setError('Informe o nome do cliente.'); return; }
    setBusy(true);
    try {
      try { localStorage.setItem('crm_quick_source', source); } catch { /* sem problema */ }
      const lead = await crm.createLead({
        customerName: name.trim(), customerPhone: digits || undefined, source, vehicleId: vehicleId || null,
        temperature: hot ? 'hot' : 'warm', notes: message.trim() || null, stage: 'new',
        nextActionDate: new Date(Date.now() + 30 * 60000).toISOString(), nextActionNote: 'Responder o cliente',
      });
      onSaved(lead);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return <div className="crm-overlay"><section className="crm-modal compact" role="dialog" aria-modal="true" aria-label="Lead rápido">
    <header><div><h3>Lead rápido</h3><p>Quem chamou no WhatsApp, Instagram ou apareceu na loja.</p></div><button type="button" aria-label="Fechar" onClick={onClose}>×</button></header>
    <form onSubmit={submit}><div className="crm-form-body">
      {error && <p className="crm-error" role="alert">{error}</p>}
      <div className="crm-chips">{QUICK_SOURCES.map((s) => <button type="button" key={s} className={source === s ? 'active' : ''} onClick={() => setSource(s)}>{sourceLabels[s]}</button>)}</div>
      <div className="crm-form-grid">
        <label>Telefone (WhatsApp)<input type="tel" autoFocus value={phone} onChange={(e) => setPhone(phoneMask(e.target.value))} placeholder="(85) 99999-9999" /></label>
        <label>Nome<input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Como o cliente se chama" /></label>
        <label>Buscar veículo<input value={vehicleSearch} onChange={(e) => setVehicleSearch(e.target.value)} placeholder="Marca ou modelo" /></label>
        <label>Veículo de interesse<select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}><option value="">Ainda não sabe</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.brand} {v.model} {v.year}{v.status === 'reserved' ? ' • reservado' : ''}</option>)}</select></label>
      </div>
      <label>O que o cliente perguntou<textarea rows={2} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Ex: quer saber se aceita a Fan 2018 na troca e parcela no cartão" /></label>
      <label className="crm-check"><input type="checkbox" checked={hot} onChange={(e) => setHot(e.target.checked)} /> Cliente quente (quer comprar logo)</label>
      <small>Se o telefone já estiver cadastrado, o lead é ligado ao mesmo cliente. Uma tarefa "Responder o cliente" entra na agenda para daqui a 30 minutos.</small>
    </div><footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Criar lead'}</button></footer></form>
  </section></div>;
}
