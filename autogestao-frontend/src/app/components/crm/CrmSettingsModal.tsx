// Configurações do CRM: rodízio, prazo de resposta e pós-venda automático
import { FormEvent, useEffect, useState } from 'react';
import * as crm from '../../../lib/crm-api';

export function CrmSettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [s, setS] = useState<crm.CrmSettings | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { crm.getSettings().then(setS).catch((e) => setError(e.message)); }, []);
  const set = (patch: Partial<crm.CrmSettings>) => setS((v) => (v ? { ...v, ...patch } : v));
  const setPost = (patch: Partial<crm.CrmSettings['postSale']>) => setS((v) => (v ? { ...v, postSale: { ...v.postSale, ...patch } } : v));
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!s) return; setBusy(true); setError('');
    try { await crm.saveSettings({ roundRobin: s.roundRobin, slaHours: s.slaHours, postSale: s.postSale }); onSaved(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return <div className="crm-overlay"><section className="crm-modal compact" role="dialog" aria-modal="true" aria-label="Configurar CRM">
    <header><div><h3>Configurar CRM</h3><p>Vale para toda a loja.</p></div><button type="button" aria-label="Fechar" onClick={onClose}>×</button></header>
    <form onSubmit={save}><div className="crm-form-body">
      {error && <p className="crm-error">{error}</p>}
      {!s ? <p className="crm-empty">Carregando…</p> : <>
        <fieldset><legend>Distribuição dos leads</legend>
          <label className="crm-check"><input type="checkbox" checked={s.roundRobin} onChange={(e) => set({ roundRobin: e.target.checked })} /> Rodízio: cada lead novo vai para um vendedor, um de cada vez</label>
          <small>{s.activeSellers ? `${s.activeSellers} vendedor${s.activeSellers > 1 ? 'es' : ''} ativo${s.activeSellers > 1 ? 's' : ''} no rodízio.` : 'Cadastre vendedores para usar o rodízio.'} Vale para leads do site e para os criados sem responsável.</small>
        </fieldset>
        <fieldset><legend>Prazo de resposta</legend>
          <label>Avisar quando um lead novo ficar sem contato por mais de
            <select value={s.slaHours} onChange={(e) => set({ slaHours: Number(e.target.value) })}>{[1, 2, 3, 4, 6, 8, 12, 24, 48].map((h) => <option key={h} value={h}>{h} hora{h > 1 ? 's' : ''}</option>)}</select>
          </label>
        </fieldset>
        <fieldset><legend>Pós-venda automático</legend>
          <label className="crm-check"><input type="checkbox" checked={s.postSale.birthday} onChange={(e) => setPost({ birthday: e.target.checked })} /> Lembrar o aniversário dos clientes</label>
          <label className="crm-check"><input type="checkbox" checked={s.postSale.review} onChange={(e) => setPost({ review: e.target.checked })} /> Lembrar a revisão
            <select value={s.postSale.reviewDays} onChange={(e) => setPost({ reviewDays: Number(e.target.value) })} disabled={!s.postSale.review}>{[[180, '6 meses'], [365, '1 ano']].map(([d, l]) => <option key={d} value={d}>{l} depois da compra</option>)}</select>
          </label>
          <label className="crm-check"><input type="checkbox" checked={s.postSale.upgrade} onChange={(e) => setPost({ upgrade: e.target.checked })} /> Oferecer troca
            <select value={s.postSale.upgradeDays} onChange={(e) => setPost({ upgradeDays: Number(e.target.value) })} disabled={!s.postSale.upgrade}>{[[365, '1 ano'], [548, '1 ano e meio'], [730, '2 anos'], [1095, '3 anos']].map(([d, l]) => <option key={d} value={d}>{l} depois da compra</option>)}</select>
          </label>
          <small>Os lembretes aparecem na aba Pós-venda até 7 dias antes da data.</small>
        </fieldset>
      </>}
    </div><footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy || !s}>{busy ? 'Salvando…' : 'Salvar'}</button></footer></form>
  </section></div>;
}
