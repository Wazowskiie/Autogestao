// Abas "Troca" e "Desejos" dentro do lead
import { FormEvent, useEffect, useState } from 'react';
import { Car, Check, MessageCircle, Search, Trash2, X } from 'lucide-react';
import * as crm from '../../../lib/crm-api';
import * as api from '../../../lib/api';
import { money } from './common';
import { WhatsAppSender } from './WhatsAppSender';

const TYPES = [['moto', 'Moto'], ['car', 'Carro'], ['truck', 'Utilitário'], ['other', 'Outros']];
const num = (v: string) => { const t = v.trim().replace(/[R$\s]/g, ''); if (!t) return undefined; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); return Number.isFinite(n) ? n : NaN; };
const moneyText = (v?: number | null) => (v ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

// ---------------- Troca ----------------
export function TradeInTab({ lead, onSaved }: { lead: crm.CrmLead; onSaved: (l: crm.CrmLead) => void }) {
  const t = lead.tradeIn ?? {};
  const [type, setType] = useState(t.type ?? 'moto');
  const [plate, setPlate] = useState(t.plate ?? ''), [brand, setBrand] = useState(t.brand ?? ''), [model, setModel] = useState(t.model ?? '');
  const [year, setYear] = useState(t.year ? String(t.year) : ''), [km, setKm] = useState(t.km ? String(t.km) : ''), [color, setColor] = useState(t.color ?? '');
  const [expected, setExpected] = useState(moneyText(t.expectedValue)), [evaluated, setEvaluated] = useState(moneyText(t.evaluatedValue));
  const [notes, setNotes] = useState(t.notes ?? '');
  const [fipe, setFipe] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [info, setInfo] = useState('');
  const disabled = !!lead.archivedAt;

  const lookup = async () => {
    const p = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)) { setError('Placa inválida. Use ABC1234 ou ABC1D23.'); return; }
    setBusy(true); setError(''); setInfo('');
    try {
      const r = await api.lookupPlate(p);
      if (r.type) setType(r.type); if (r.brand) setBrand(r.brand); if (r.model) setModel(r.model);
      if (r.year) setYear(String(r.year)); if (r.color) setColor(r.color);
      setFipe(r.fipe?.value ?? null); setInfo('Dados preenchidos pela placa.');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setInfo('');
    const ev = num(expected), av = num(evaluated);
    if (Number.isNaN(ev) || Number.isNaN(av)) { setError('Valor inválido. Ex: 9.000,00'); return; }
    setBusy(true);
    try {
      onSaved(await crm.saveTradeIn(lead.id, {
        type, plate: plate || undefined, brand: brand || undefined, model: model || undefined, color: color || undefined,
        year: year ? Number(year) : undefined, km: km ? Number(km.replace(/\D/g, '')) : undefined,
        expectedValue: ev, evaluatedValue: av, notes: notes || undefined,
      }));
      setInfo('Troca salva. Ao clicar em "Fechar venda", ela já entra na venda.');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Tirar a troca deste lead?')) return;
    setBusy(true); try { onSaved(await crm.saveTradeIn(lead.id, { remove: true })); setPlate(''); setBrand(''); setModel(''); setYear(''); setKm(''); setColor(''); setExpected(''); setEvaluated(''); setNotes(''); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return <form className="crm-inline-form" onSubmit={save}>
    <h4>Veículo que o cliente quer dar na troca</h4>
    {error && <p className="crm-error">{error}</p>}{info && <p className="crm-success">{info}</p>}
    <div className="crm-chips">{TYPES.map(([k, l]) => <button type="button" key={k} className={type === k ? 'active' : ''} onClick={() => setType(k)} disabled={disabled}>{l}</button>)}</div>
    <div className="crm-form-grid">
      <label>Placa<span className="crm-inline"><input value={plate} maxLength={8} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="ABC1D23" disabled={disabled} /><button type="button" onClick={lookup} disabled={busy || disabled} title="Buscar pela placa"><Search size={14} /></button></span></label>
      <label>Marca<input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Honda" disabled={disabled} /></label>
      <label>Modelo<input value={model} onChange={(e) => setModel(e.target.value)} placeholder="CG 160 Fan" disabled={disabled} /></label>
      <label>Ano<input value={year} maxLength={4} inputMode="numeric" onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} disabled={disabled} /></label>
      <label>Km<input value={km} inputMode="numeric" onChange={(e) => setKm(e.target.value)} disabled={disabled} /></label>
      <label>Cor<input value={color} onChange={(e) => setColor(e.target.value)} disabled={disabled} /></label>
      <label>Quanto o cliente quer (R$)<input value={expected} inputMode="decimal" onChange={(e) => setExpected(e.target.value)} placeholder="0,00" disabled={disabled} /></label>
      <label>Avaliação da loja (R$)<input value={evaluated} inputMode="decimal" onChange={(e) => setEvaluated(e.target.value)} placeholder="0,00" disabled={disabled} /></label>
    </div>
    {fipe ? <small>Tabela FIPE: <b>{money(fipe)}</b> <button type="button" className="crm-link" onClick={() => setEvaluated(moneyText(fipe))}>usar como avaliação</button></small> : null}
    <label>Observações<textarea rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Estado, documentação, multas, dívida..." disabled={disabled} /></label>
    <div className="crm-task-actions">{lead.tradeIn && <button type="button" onClick={remove} disabled={busy || disabled}><Trash2 size={13} />Tirar troca</button>}<button className="primary" disabled={busy || disabled}>{busy ? 'Salvando…' : 'Salvar troca'}</button></div>
  </form>;
}

// ---------------- Desejos ----------------
export function WishesTab({ lead, onChanged }: { lead: crm.CrmLead; onChanged: () => void }) {
  const [wishes, setWishes] = useState<crm.Wish[] | null>(null);
  const [type, setType] = useState('moto'), [brand, setBrand] = useState(''), [model, setModel] = useState('');
  const [yearMin, setYearMin] = useState(''), [yearMax, setYearMax] = useState(''), [price, setPrice] = useState(''), [kmMax, setKmMax] = useState(''), [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [sending, setSending] = useState<crm.MatchVehicle | null>(null);
  useEffect(() => { crm.getWishes(lead.id).then(setWishes).catch((e) => setError(e.message)); }, [lead.id]);
  const run = async (fn: () => Promise<crm.Wish[]>) => { setBusy(true); setError(''); try { setWishes(await fn()); onChanged(); return true; } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); } };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const p = num(price);
    if (Number.isNaN(p)) { setError('Preço inválido.'); return; }
    if (await run(() => crm.createWish(lead.id, { type, brand: brand || null, model: model || null, yearMin: yearMin ? Number(yearMin) : null, yearMax: yearMax ? Number(yearMax) : null, priceMax: p ?? null, kmMax: kmMax ? Number(kmMax.replace(/\D/g, '')) : null, notes: notes || null }))) {
      setBrand(''); setModel(''); setYearMin(''); setYearMax(''); setPrice(''); setKmMax(''); setNotes('');
    }
  };
  const describe = (w: crm.Wish) => [TYPES.find(([k]) => k === w.type)?.[1], w.brand, w.model, w.yearMin || w.yearMax ? `ano ${w.yearMin ?? '…'} a ${w.yearMax ?? '…'}` : '', w.priceMax ? `até ${money(w.priceMax)}` : '', w.kmMax ? `até ${w.kmMax.toLocaleString('pt-BR')} km` : ''].filter(Boolean).join(' · ');
  const statusLabel = { active: 'Procurando', fulfilled: 'Atendido', canceled: 'Cancelado' };

  return <>
    {error && <p className="crm-error">{error}</p>}
    {wishes?.map((w) => <article key={w.id} className="crm-wish">
      <div className="crm-section-heading"><div><strong>{describe(w) || 'Desejo'}</strong>{w.notes && <small>{w.notes}</small>}</div><span className={`crm-stage ${w.status === 'active' ? 'negotiating' : w.status === 'fulfilled' ? 'won' : 'lost'}`}>{statusLabel[w.status]}</span></div>
      {w.status === 'active' && (w.matches.length ? <div className="crm-wish-matches">
        <small><b>{w.matches.length}</b> no estoque agora:</small>
        {w.matches.map((m) => <div key={m.id} className="crm-match-row">
          <span className="crm-match-photo small">{m.vehicle.photos[0]?.url ? <img src={m.vehicle.photos[0].url} alt="" /> : <Car size={14} />}</span>
          <span>{m.vehicle.brand} {m.vehicle.model} {m.vehicle.year} · {money(m.vehicle.price)} · {m.vehicle.km.toLocaleString('pt-BR')} km</span>
          <button className="crm-wa-light" disabled={!lead.customer?.phone} onClick={() => setSending(m.vehicle)}><MessageCircle size={13} />Avisar</button>
        </div>)}
      </div> : <small>Nada no estoque ainda. Quando entrar, o vendedor recebe uma tarefa.</small>)}
      <div className="crm-task-actions">
        {w.status === 'active' ? <>
          <button disabled={busy} onClick={() => run(() => crm.updateWish(w.id, { status: 'fulfilled' }))}><Check size={13} />Atendido</button>
          <button disabled={busy} onClick={() => run(() => crm.updateWish(w.id, { status: 'canceled' }))}><X size={13} />Desistiu</button>
        </> : <button disabled={busy} onClick={() => run(() => crm.updateWish(w.id, { status: 'active' }))}>Reativar</button>}
        <button disabled={busy} onClick={() => { if (window.confirm('Excluir este desejo?')) void run(() => crm.deleteWish(w.id)); }} title="Excluir"><Trash2 size={13} /></button>
      </div>
    </article>)}
    {!lead.archivedAt && <form className="crm-inline-form" onSubmit={add}>
      <h4>O que o cliente procura e a loja ainda não tem</h4>
      <div className="crm-chips">{TYPES.map(([k, l]) => <button type="button" key={k} className={type === k ? 'active' : ''} onClick={() => setType(k)}>{l}</button>)}</div>
      <div className="crm-form-grid">
        <label>Marca<input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Honda" /></label>
        <label>Modelo<input value={model} onChange={(e) => setModel(e.target.value)} placeholder="CG 160" /></label>
        <label>Ano de<input value={yearMin} maxLength={4} inputMode="numeric" onChange={(e) => setYearMin(e.target.value.replace(/\D/g, ''))} placeholder="2020" /></label>
        <label>Ano até<input value={yearMax} maxLength={4} inputMode="numeric" onChange={(e) => setYearMax(e.target.value.replace(/\D/g, ''))} placeholder="2024" /></label>
        <label>Preço até (R$)<input value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} placeholder="15.000,00" /></label>
        <label>Km até<input value={kmMax} inputMode="numeric" onChange={(e) => setKmMax(e.target.value)} placeholder="30.000" /></label>
      </div>
      <label>Observação<input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: só cor preta, precisa ter partida elétrica" /></label>
      <button className="primary" disabled={busy}>{busy ? 'Salvando…' : 'Anotar desejo'}</button>
    </form>}
    {sending && <WhatsAppSender phone={lead.customer?.phone} category="desejo" leadId={lead.id}
      context={{ name: lead.customer?.name, vehicle: { id: sending.id, brand: sending.brand, model: sending.model, year: sending.year, price: sending.price } }}
      onClose={() => setSending(null)} onSent={() => { setSending(null); onChanged(); }} />}
  </>;
}
