// Abas Pós-venda, Desejos e Relatório do CRM
import { useCallback, useEffect, useState } from 'react';
import { Cake, Wrench, RefreshCcw, MessageCircle, Check, X, ArrowUpRight, Car, Download } from 'lucide-react';
import * as crm from '../../../lib/crm-api';
import { minutesText, money, sourceLabels } from './common';
import { WhatsAppSender } from './WhatsAppSender';

const KIND: Record<crm.Followup['kind'], { label: string; icon: typeof Cake; category: string; color: string }> = {
  birthday: { label: 'Aniversário', icon: Cake, category: 'aniversario', color: '#db2777' },
  review: { label: 'Revisão', icon: Wrench, category: 'revisao', color: '#2563eb' },
  upgrade: { label: 'Recompra', icon: RefreshCcw, category: 'recompra', color: '#16a34a' },
};
const dayLabel = (iso: string) => {
  const d = new Date(iso); const today = new Date(); today.setHours(12, 0, 0, 0);
  const diff = Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  if (diff === 0) return 'Hoje'; if (diff === 1) return 'Amanhã'; if (diff === -1) return 'Ontem';
  return diff < 0 ? `Há ${-diff} dias` : `Em ${diff} dias`;
};

// ---------------- Pós-venda ----------------
export function FollowupsView({ onOpenLead, onChanged }: { onOpenLead: (id: string) => void; onChanged: () => void }) {
  const [status, setStatus] = useState('open');
  const [data, setData] = useState<{ items: crm.Followup[]; total: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const [sending, setSending] = useState<crm.Followup | null>(null);
  const load = useCallback(() => crm.getFollowups(status).then(setData).catch((e) => setError(e.message)), [status]);
  useEffect(() => { void load(); }, [load]);
  const act = async (id: string, fn: () => Promise<unknown>) => { setBusy(id); setError(''); try { await fn(); await load(); onChanged(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); } };

  return <div className="crm-agenda">
    <div className="crm-section-heading"><div className="crm-view-switch">{[['open', 'Pendentes'], ['done', 'Feitos'], ['dismissed', 'Ignorados']].map(([k, l]) => <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
      <small>Aniversários, revisões e hora de oferecer troca para quem já comprou. Configure em "Configurar".</small></div>
    {error && <p className="crm-error">{error}</p>}
    {data?.items.map((f) => {
      const k = KIND[f.kind]; const Icon = k.icon;
      return <article key={f.id} className="crm-task">
        <div className="crm-followup-main">
          <span className="crm-followup-icon" style={{ background: `${k.color}14`, color: k.color }}><Icon size={16} /></span>
          <div><span className="crm-priority" style={{ background: `${k.color}14`, color: k.color }}>{k.label}</span><strong>{f.title}</strong>
            <small>{dayLabel(f.dueDate)} · {new Date(f.dueDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}{f.customer.phone ? ` · ${f.customer.phone}` : ''}</small></div>
        </div>
        <div className="crm-task-actions">
          {f.status === 'open' ? <>
            <button className="crm-wa-light" disabled={!f.customer.phone} onClick={() => setSending(f)}><MessageCircle size={14} />WhatsApp</button>
            {f.kind !== 'birthday' && <button disabled={busy === f.id} onClick={() => act(f.id, async () => { const r = await crm.followupOpportunity(f.id); onOpenLead(r.leadId); })}><ArrowUpRight size={14} />Criar oportunidade</button>}
            <button disabled={busy === f.id} onClick={() => act(f.id, () => crm.setFollowupStatus(f.id, 'done'))}><Check size={14} />Feito</button>
            <button disabled={busy === f.id} onClick={() => act(f.id, () => crm.setFollowupStatus(f.id, 'dismissed'))} title="Ignorar"><X size={14} /></button>
          </> : <>
            {f.leadId && <button onClick={() => onOpenLead(f.leadId!)}>Abrir lead</button>}
            <button disabled={busy === f.id} onClick={() => act(f.id, () => crm.setFollowupStatus(f.id, 'open'))}>Voltar para pendentes</button>
          </>}
        </div>
      </article>;
    })}
    {data?.total === 0 && <p className="crm-empty">{status === 'open' ? 'Nada para os próximos 7 dias. Os lembretes aparecem aqui sozinhos.' : 'Nenhum item aqui.'}</p>}
    {sending && <WhatsAppSender phone={sending.customer.phone} category={KIND[sending.kind].category}
      context={{ name: sending.customer.name, vehicleLabel: sending.vehicleLabel }}
      onClose={() => setSending(null)}
      onSent={() => { const id = sending.id; setSending(null); void act(id, () => crm.setFollowupStatus(id, 'done')); }} />}
  </div>;
}

// ---------------- Desejos ----------------
export function WishesView({ onOpenLead }: { onOpenLead: (id: string) => void }) {
  const [data, setData] = useState<{ items: crm.WishMatch[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState<crm.WishMatch | null>(null);
  const load = useCallback(() => crm.getWishMatches().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const wishText = (w: crm.WishMatch['wish']) => [w.brand, w.model, w.yearMin || w.yearMax ? `ano ${w.yearMin ?? '…'}–${w.yearMax ?? '…'}` : '', w.priceMax ? `até ${money(w.priceMax)}` : ''].filter(Boolean).join(' · ');

  return <div className="crm-agenda">
    <div className="crm-section-heading"><h4>Veículos do estoque que combinam com o que os clientes procuram</h4><small>Anote o desejo na aba "Desejos" do lead. Quando entrar um veículo compatível, ele aparece aqui e o vendedor recebe uma tarefa.</small></div>
    {error && <p className="crm-error">{error}</p>}
    {data?.items.map((m) => {
      const v = m.vehicle, photo = v.photos[0]?.url, lead = m.wish.lead;
      return <article key={m.id} className="crm-task crm-match">
        <div className="crm-followup-main">
          <span className="crm-match-photo">{photo ? <img src={photo} alt="" /> : <Car size={20} />}</span>
          <div><strong>{v.brand} {v.model} {v.year} · {money(v.price)}</strong>
            <small>{v.km.toLocaleString('pt-BR')} km{v.plate ? ` · ${v.plate}` : ''}</small>
            <p>Para <b>{lead.customer?.name ?? 'cliente'}</b>{lead.assignedSeller ? ` (${lead.assignedSeller.name})` : ''} — procura: {wishText(m.wish) || 'veículo parecido'}</p></div>
        </div>
        <div className="crm-task-actions">
          <button className="crm-wa-light" disabled={!lead.customer?.phone} onClick={() => setSending(m)}><MessageCircle size={14} />Avisar cliente</button>
          <button onClick={() => onOpenLead(lead.id)}>Abrir lead</button>
          <button title="Não combina" onClick={async () => { try { await crm.dismissMatch(m.id); await load(); } catch (e) { setError((e as Error).message); } }}><X size={14} /></button>
        </div>
      </article>;
    })}
    {data?.total === 0 && <p className="crm-empty">Nenhum veículo do estoque combina com os desejos anotados agora.</p>}
    {sending && <WhatsAppSender phone={sending.wish.lead.customer?.phone} category="desejo" leadId={sending.wish.lead.id}
      context={{ name: sending.wish.lead.customer?.name, vehicle: { id: sending.vehicle.id, brand: sending.vehicle.brand, model: sending.vehicle.model, year: sending.vehicle.year, price: sending.vehicle.price } }}
      onClose={() => setSending(null)} onSent={() => setSending(null)} />}
  </div>;
}

// ---------------- Relatório ----------------
function monthStart(offset = 0) { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + offset, 1); }
const ymd = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export function ReportView() {
  const [from, setFrom] = useState(ymd(monthStart()));
  const [to, setTo] = useState(ymd(new Date()));
  const [r, setR] = useState<crm.CrmReport | null>(null), [error, setError] = useState('');
  useEffect(() => { setError(''); crm.getReport(new Date(from + 'T00:00:00').toISOString(), new Date(to + 'T00:00:00').toISOString()).then(setR).catch((e) => setError(e.message)); }, [from, to]);
  const preset = (a: Date, b: Date) => { setFrom(ymd(a)); setTo(ymd(b)); };
  const csv = () => {
    if (!r) return;
    const rows = [['Grupo', 'Nome', 'Leads', 'Ganhos', 'Perdidos', 'Em aberto', 'Conversão %', 'Tempo de resposta (min)', 'Vendas (R$)'],
      ...r.bySource.map((x) => ['Origem', sourceLabels[x.key] ?? x.key, x.total, x.won, x.lost, x.open, x.conversion, x.avgResponseMinutes ?? '', x.revenue]),
      ...r.bySeller.map((x) => ['Vendedor', x.label, x.total, x.won, x.lost, x.open, x.conversion, x.avgResponseMinutes ?? '', x.revenue])];
    const blob = new Blob(['﻿' + rows.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `relatorio-crm-${from}-a-${to}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };
  const Table = ({ title, head, rows, labelOf }: { title: string; head: string; rows: crm.ReportRow[]; labelOf: (x: crm.ReportRow) => string }) => {
    const max = Math.max(1, ...rows.map((x) => x.total));
    return <section className="crm-report-card"><h4>{title}</h4><table><thead><tr><th>{head}</th><th>Leads</th><th>Ganhos</th><th>Conversão</th><th>Resposta</th><th>Vendas</th></tr></thead>
      <tbody>{rows.map((x) => <tr key={x.key}><td><span className="crm-bar-label">{labelOf(x)}</span><span className="crm-bar"><i style={{ width: `${(x.total / max) * 100}%` }} /></span></td><td>{x.total}</td><td>{x.won}</td><td><b>{x.conversion}%</b></td><td>{minutesText(x.avgResponseMinutes)}</td><td>{money(x.revenue)}</td></tr>)}</tbody></table>
      {rows.length === 0 && <p className="crm-empty">Sem leads no período.</p>}</section>;
  };
  return <div className="crm-report">
    <div className="crm-filters" style={{ padding: 0 }}>
      <label>De<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Até<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <button onClick={() => preset(monthStart(), new Date())}>Este mês</button><button onClick={() => preset(monthStart(-1), new Date(monthStart().getTime() - 86400000))}>Mês passado</button><button onClick={() => preset(new Date(Date.now() - 89 * 86400000), new Date())}>90 dias</button>
      <button onClick={csv} disabled={!r}><Download size={14} />CSV</button>
    </div>
    {error && <p className="crm-error">{error}</p>}
    {r && <>
      <section className="crm-metrics" style={{ margin: '14px 0' }}>
        <article><div><span>Leads no período</span></div><strong>{r.totals.total}</strong><small>{r.totals.open} em aberto</small></article>
        <article><div><span>Viraram venda</span></div><strong>{r.totals.won}</strong><small>Conversão de {r.totals.conversion}%</small></article>
        <article><div><span>Tempo médio de resposta</span></div><strong>{minutesText(r.totals.avgResponseMinutes)}</strong><small>Do lead entrar até o primeiro contato</small></article>
        <article><div><span>Vendas dos leads</span></div><strong>{money(r.totals.revenue)}</strong><small>{r.totals.lost} perdidos</small></article>
      </section>
      <div className="crm-report-grid">
        <Table title="Por origem" head="Origem" rows={r.bySource} labelOf={(x) => sourceLabels[x.key] ?? x.key} />
        <Table title="Por vendedor" head="Vendedor" rows={r.bySeller} labelOf={(x) => x.label} />
      </div>
      <section className="crm-report-card"><h4>Por que perdemos</h4>
        {r.lostReasons.map((l) => <div key={l.reason} className="crm-reason"><span>{l.reason}</span><b>{l.count}</b></div>)}
        {r.lostReasons.length === 0 && <p className="crm-empty">Nenhum lead perdido no período.</p>}
      </section>
    </>}
  </div>;
}
