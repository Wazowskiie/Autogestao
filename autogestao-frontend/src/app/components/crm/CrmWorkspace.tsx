import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, LayoutGrid, List, CalendarDays, Download, Bell, RefreshCw, ArrowUpRight, Users, Target, Clock3, Zap, MessageSquareText, Settings2, Gift, Heart, BarChart3, AlertTriangle } from 'lucide-react';
import { QuickLead } from './QuickLead';
import { TemplatesModal } from './TemplatesModal';
import { CrmSettingsModal } from './CrmSettingsModal';
import { FollowupsView, ReportView, WishesView } from './CrmViews';
import * as crm from '../../../lib/crm-api';
import { useAuth } from '../../../lib/auth-context';
import { STAGES, ageHours, dateTime, money, sourceLabels, stageLabels, temperatureLabels } from './common';
import { LeadForm } from './LeadForm';
import { LeadDrawer, Pager, TaskRow } from './LeadDrawer';
import './crm.css';

export function CrmWorkspace({initialLeadId,onCloseLead,onOpenChat}:{initialLeadId?:string|null;onCloseLead?:()=>void;onOpenChat?:(id:string)=>void}) {
  const auth=useAuth(),manager=auth.user?.role!=='seller';
  const [view,setView]=useState<'board'|'list'|'agenda'|'postsale'|'wishes'|'report'>('board');
  const [quick,setQuick]=useState(false),[showTemplates,setShowTemplates]=useState(false),[showSettings,setShowSettings]=useState(false);
  const [badges,setBadges]=useState({followups:0,wishes:0});
  const [filters,setFilters]=useState<crm.CrmFilters>({});
  const [search,setSearch]=useState('');
  const [columns,setColumns]=useState<crm.Column[]>([]);
  const [leads,setLeads]=useState<crm.Page<crm.CrmLead>|null>(null),[page,setPage]=useState(1);
  const [summary,setSummary]=useState<crm.CrmSummary|null>(null);
  const [staff,setStaff]=useState<crm.CrmOptions['staff']>([]);
  const [selected,setSelected]=useState<string|null>(initialLeadId??null);
  const [form,setForm]=useState<crm.CrmLead|'new'|null>(null);
  const [error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
  const [notice,setNotice]=useState(''),[showReminders,setShowReminders]=useState(false);
  const [reminders,setReminders]=useState<{items:crm.CrmTask[];total:number}>({items:[],total:0});
  const [tasks,setTasks]=useState<crm.Page<crm.CrmTask>|null>(null),[taskPage,setTaskPage]=useState(1);
  const [taskStatus,setTaskStatus]=useState('open'),[period,setPeriod]=useState('all');
  useEffect(()=>{if(initialLeadId)setSelected(initialLeadId);},[initialLeadId]);
  useEffect(()=>{crm.getOptions().then(o=>setStaff(o.staff)).catch(e=>setError(e.message));},[]);
  useEffect(()=>{const t=setTimeout(()=>{setPage(1);setFilters(f=>({...f,search:search||undefined}));},300);return()=>clearTimeout(t);},[search]);
  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const day=new Date();day.setHours(0,0,0,0);const end=new Date(day);end.setDate(day.getDate()+1);
      const [s,r]=await Promise.all([crm.getSummary(filters),crm.getReminders()]);setSummary(s);setReminders(r);
      Promise.all([crm.getFollowups('open'),crm.getWishMatches()]).then(([f,w])=>setBadges({followups:f.dueNow,wishes:w.total})).catch(()=>{});
      if(view==='board')setColumns((await crm.getBoard(filters)).columns);
      if(view==='list')setLeads(await crm.getLeads(filters,page));
      if(view==='agenda')setTasks(await crm.getTasks({page:taskPage,status:taskStatus,period,assignedUserId:manager?filters.assignedSellerId:undefined,dayStart:day.toISOString(),dayEnd:end.toISOString()}));
    }catch(e){setError((e as Error).message);}finally{setLoading(false);}
  },[filters,page,view,taskPage,taskStatus,period,manager]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)crm.getReminders().then(setReminders).catch(()=>{});},30000);return()=>clearInterval(timer);},[]);
  const filter=(key:keyof crm.CrmFilters,value:unknown)=>{setPage(1);setFilters(f=>({...f,[key]:value||undefined}));};
  const move=async(lead:crm.CrmLead,stage:string)=>{
    if(stage===lead.stage)return;
    if(stage==='lost'){setForm({...lead,stage:'lost'});return;}
    setBusy(true);setError('');try{await crm.updateLead(lead.id,{stage:stage as crm.CrmLead['stage']});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const drop=(id:string,stage:string)=>{const lead=columns.flatMap(c=>c.items).find(l=>l.id===id);if(lead)void move(lead,stage);};
  const more=async(column:crm.Column)=>{setBusy(true);try{const data=await crm.getLeads({...filters,stage:column.stage},column.page+1,20);setColumns(cs=>cs.map(c=>c.stage===column.stage?{...c,page:c.page+1,items:[...c.items,...data.items.filter(item=>!c.items.some(old=>old.id===item.id))],total:data.total}:c));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const exportCsv=async()=>{setBusy(true);setError('');try{await crm.exportLeads(filters);setNotice('Exportação concluída com os filtros atuais.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const completeTask=async(id:string,status:string)=>{setBusy(true);try{await crm.setTaskStatus(id,status);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <div className="crm-workspace">
    <header className="crm-page-header"><div><span className="crm-eyebrow">RELACIONAMENTO E VENDAS</span><h1>CRM da loja</h1><p>{manager?'Acompanhe o funil, distribua oportunidades e organize os próximos contatos.':'Seus leads, contatos e tarefas em um só lugar.'}</p></div><div className="crm-header-actions"><button aria-label="Atualizar CRM" onClick={()=>refresh()} disabled={loading}><RefreshCw size={16}/></button><button onClick={()=>setShowReminders(!showReminders)}><Bell size={16}/>Lembretes{reminders.total>0&&<b>{reminders.total}</b>}</button><button onClick={exportCsv} disabled={busy}><Download size={16}/>CSV</button><button onClick={()=>setShowTemplates(true)}><MessageSquareText size={16}/>Mensagens</button>{manager&&<button onClick={()=>setShowSettings(true)} aria-label="Configurar CRM"><Settings2 size={16}/>Configurar</button>}<button onClick={()=>setQuick(true)}><Zap size={16}/>Lead rápido</button><button className="primary" onClick={()=>setForm('new')}><Plus size={16}/>Novo lead</button></div></header>
    {!!summary?.unattended&&!filters.unattended&&<button className="crm-alert" onClick={()=>{setView(v=>['board','list'].includes(v)?v:'board');setPage(1);setFilters(f=>({...f,unattended:true}));}}><AlertTriangle size={16}/><span><b>{summary.unattended} lead{summary.unattended>1?'s':''} novo{summary.unattended>1?'s':''} sem contato</b> há mais de {summary.slaHours}h. Cliente que espera muito compra em outra loja.</span><strong>Ver agora</strong></button>}
    {filters.unattended&&<button className="crm-alert soft" onClick={()=>filter('unattended',false)}><AlertTriangle size={16}/><span>Mostrando só os leads sem contato há mais de {summary?.slaHours??2}h.</span><strong>Mostrar todos</strong></button>}
    {error&&<p className="crm-error" role="alert">{error}</p>}{notice&&<p className="crm-success" onClick={()=>setNotice('')}>{notice}</p>}
    {showReminders&&<section className="crm-reminders"><div className="crm-section-heading"><h3>Lembretes de atendimento</h3><button onClick={()=>setShowReminders(false)}>Fechar</button></div>{reminders.items.map(t=><button className="crm-reminder-item" key={t.id} onClick={()=>{setSelected(t.leadId);setShowReminders(false);}}><Clock3 size={17}/><span><strong>{t.title}</strong><small>{t.lead.customer?.name} • {dateTime(t.dueAt)}</small></span><ArrowUpRight size={16}/></button>)}{!reminders.total&&<p className="crm-empty">Nenhum lembrete vencido ou programado para agora.</p>}{reminders.total>10&&<small>Veja os demais na agenda.</small>}</section>}
    <section className="crm-metrics"><Metric label="Leads no filtro" value={String(summary?.total??0)} icon={Users}/><Metric label="Orçamento em aberto" value={money(summary?.pipelineValue)} icon={Target}/><Metric label="Taxa de ganho" value={`${summary?.conversionRate??0}%`} detail={`${summary?.won??0} ganhos no conjunto filtrado`} icon={ArrowUpRight}/><Metric label="Tarefas vencidas" value={String(summary?.overdueTasks??0)} detail={manager?`${summary?.unassigned??0} ${summary?.unassigned===1?'lead':'leads'} sem responsável`:'Priorize os próximos contatos'} icon={Clock3}/></section>
    <section className="crm-toolbar"><div className="crm-view-switch"><button className={view==='board'?'active':''} onClick={()=>setView('board')}><LayoutGrid size={15}/>Funil</button><button className={view==='list'?'active':''} onClick={()=>setView('list')}><List size={15}/>Lista</button><button className={view==='agenda'?'active':''} onClick={()=>setView('agenda')}><CalendarDays size={15}/>Agenda</button><button className={view==='postsale'?'active':''} onClick={()=>setView('postsale')}><Gift size={15}/>Pós-venda{badges.followups>0&&<b className="crm-badge">{badges.followups}</b>}</button><button className={view==='wishes'?'active':''} onClick={()=>setView('wishes')}><Heart size={15}/>Desejos{badges.wishes>0&&<b className="crm-badge">{badges.wishes}</b>}</button><button className={view==='report'?'active':''} onClick={()=>setView('report')}><BarChart3 size={15}/>Relatório</button></div><div className="crm-search"><Search size={15}/><input aria-label="Buscar leads" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cliente, telefone, veículo ou etiqueta"/></div></section>
    {['postsale','wishes','report'].includes(view)?null:view!=='agenda'?<section className="crm-filters"><select aria-label="Filtrar etapa" value={filters.stage??''} onChange={e=>filter('stage',e.target.value)}><option value="">Todas as etapas</option>{STAGES.map(s=><option key={s} value={s}>{stageLabels[s]}</option>)}</select><select aria-label="Filtrar origem" value={filters.source??''} onChange={e=>filter('source',e.target.value)}><option value="">Todas as origens</option>{Object.entries(sourceLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select aria-label="Filtrar temperatura" value={filters.temperature??''} onChange={e=>filter('temperature',e.target.value)}><option value="">Todas as temperaturas</option>{Object.entries(temperatureLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
      {manager&&<><select aria-label="Filtrar responsável" value={filters.assignedSellerId??''} onChange={e=>filter('assignedSellerId',e.target.value)}><option value="">Todos os responsáveis</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><label><input type="checkbox" checked={!!filters.unassigned} onChange={e=>filter('unassigned',e.target.checked)}/>Sem responsável</label></>}
      <label>De<input type="date" aria-label="Data inicial" value={filters.from?.slice(0,10)??''} onChange={e=>filter('from',e.target.value?new Date(e.target.value+'T00:00:00').toISOString():undefined)}/></label><label>Até<input type="date" aria-label="Data final" value={filters.to?.slice(0,10)??''} onChange={e=>filter('to',e.target.value?new Date(e.target.value+'T00:00:00').toISOString():undefined)}/></label><label><input type="checkbox" checked={!!filters.overdue} onChange={e=>filter('overdue',e.target.checked)}/>Com tarefas vencidas</label><label><input type="checkbox" checked={!!filters.unattended} onChange={e=>filter('unattended',e.target.checked)}/>Sem contato</label><label><input type="checkbox" checked={!!filters.archived} onChange={e=>filter('archived',e.target.checked)}/>Arquivados</label><button onClick={()=>{setFilters({});setSearch('');setPage(1);}}>Limpar</button>
    </section>:<section className="crm-filters"><select aria-label="Status das tarefas" value={taskStatus} onChange={e=>{setTaskStatus(e.target.value);setTaskPage(1);}}><option value="open">Pendentes</option><option value="done">Concluídas</option><option value="canceled">Canceladas</option></select><select aria-label="Período das tarefas" value={period} onChange={e=>{setPeriod(e.target.value);setTaskPage(1);}}><option value="all">Todas as datas</option><option value="today">Hoje</option><option value="overdue">Vencidas</option><option value="upcoming">A vencer</option></select><small>Os horários seguem o fuso do seu navegador.</small></section>}
    <div className="crm-main" aria-busy={loading}>
      {view==='board'&&<div className="crm-board">{columns.map(column=><section key={column.stage} className={`crm-column ${column.stage}`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!filters.archived&&!busy)drop(e.dataTransfer.getData('crmLead'),column.stage);}}><header><span/><strong>{stageLabels[column.stage]}</strong><b>{column.total}</b></header><div className="crm-column-body">{column.items.map(l=><LeadCard key={l.id} lead={l} sla={summary?.slaHours??2} onOpen={()=>setSelected(l.id)} busy={busy} onMove={stage=>move(l,stage)}/>)}{column.total===0&&<p className="crm-empty">Nenhum lead nesta etapa.</p>}{column.items.length<column.total&&<button className="crm-load-more" disabled={busy} onClick={()=>more(column)}>Carregar mais ({column.total-column.items.length})</button>}</div></section>)}</div>}
      {view==='list'&&<div className="crm-list"><table><thead><tr><th>Cliente / interesse</th><th>Etapa</th><th>Responsável</th><th>Origem</th><th>Orçamento</th><th>Próxima tarefa</th><th/></tr></thead><tbody>{leads?.items.map(l=><tr key={l.id}><td><button className="crm-link" onClick={()=>setSelected(l.id)}>{l.customer?.name??'Sem cliente'}</button><small>{l.vehicle?`${l.vehicle.brand} ${l.vehicle.model} ${l.vehicle.year}`:'Veículo a definir'}</small></td><td><span className={`crm-stage ${l.stage}`}>{stageLabels[l.stage]}</span></td><td>{l.assignedSeller?.name??'Sem responsável'}</td><td>{sourceLabels[l.source??'']??l.source??'—'}</td><td>{l.budget==null?'—':money(l.budget)}</td><td>{dateTime(l.tasks[0]?.dueAt)}</td><td><button onClick={()=>setSelected(l.id)}>Abrir</button></td></tr>)}</tbody></table>{leads?.total===0&&<p className="crm-empty">Nenhum lead encontrado com estes filtros.</p>}<Pager page={page} total={leads?.total??0} size={30} onPage={setPage}/></div>}
      {view==='agenda'&&<div className="crm-agenda">{tasks?.items.map(t=><TaskRow key={t.id} task={t} busy={busy} onStatus={status=>completeTask(t.id,status)} onOpenLead={()=>setSelected(t.leadId)}/>)}{tasks?.total===0&&<p className="crm-empty">Nenhuma tarefa neste período. Abra um lead para agendar o próximo contato.</p>}<Pager page={taskPage} total={tasks?.total??0} size={30} onPage={setTaskPage}/></div>}
      {view==='postsale'&&<FollowupsView onOpenLead={id=>setSelected(id)} onChanged={()=>refresh()}/>}
      {view==='wishes'&&<WishesView onOpenLead={id=>setSelected(id)}/>}
      {view==='report'&&<ReportView/>}
      {loading&&!columns.length&&!leads&&!tasks&&['board','list','agenda'].includes(view)&&<p className="crm-empty">Carregando CRM…</p>}
    </div>
    {quick&&<QuickLead onClose={()=>setQuick(false)} onSaved={lead=>{setQuick(false);setSelected(lead.id);setNotice('Lead criado. Já dá para mandar a primeira mensagem pelo botão WhatsApp.');void refresh();}}/>}
    {showTemplates&&<TemplatesModal onClose={()=>setShowTemplates(false)}/>}
    {showSettings&&<CrmSettingsModal onClose={()=>setShowSettings(false)} onSaved={()=>{setShowSettings(false);setNotice('Configurações do CRM salvas.');void refresh();}}/>}
    {form&&<LeadForm lead={form==='new'?undefined:form} onClose={()=>setForm(null)} onSaved={lead=>{setForm(null);setSelected(lead.id);void refresh();}}/>}
    {selected&&<LeadDrawer key={selected} id={selected} onClose={()=>{setSelected(null);onCloseLead?.();}} onChanged={()=>refresh()} onOpenChat={id=>{setSelected(null);onOpenChat?.(id);}}/>}
  </div>;
}
function Metric({label,value,detail,icon:Icon}:{label:string;value:string;detail?:string;icon:typeof Users}){return <article><div><span>{label}</span><Icon size={17}/></div><strong>{value}</strong><small>{detail??'Conforme os filtros selecionados'}</small></article>;}
function LeadCard({lead,busy,sla,onOpen,onMove}:{lead:crm.CrmLead;busy:boolean;sla:number;onOpen:()=>void;onMove:(stage:string)=>void}){
  const next=lead.tasks[0],overdue=next&&new Date(next.dueAt)<new Date();
  const waiting=lead.stage==='new'&&!lead.firstContactAt&&!lead.lastContactAt&&lead.createdAt?ageHours(lead.createdAt):-1;
  return <article className={`crm-card ${overdue?'attention':''}`} draggable={!lead.archivedAt&&!busy&&!lead.saleId} onDragStart={e=>e.dataTransfer.setData('crmLead',lead.id)}><div className="crm-card-heading"><button onClick={onOpen}>{lead.customer?.name??'Sem cliente'}</button>{lead.temperature&&<span className={`crm-temp ${lead.temperature}`}>{temperatureLabels[lead.temperature]}</span>}</div><p>{lead.vehicle?`${lead.vehicle.brand} ${lead.vehicle.model} ${lead.vehicle.year}`:'Veículo a definir'}</p>{waiting>=sla&&<span className="crm-waiting"><AlertTriangle size={12}/>Sem contato há {waiting>=48?`${Math.floor(waiting/24)} dias`:`${waiting}h`}</span>}{lead.tradeIn&&<span className="crm-tag">Tem troca</span>}<strong className="crm-card-value">{lead.budget==null?'Orçamento a definir':money(lead.budget)}</strong><div className="crm-tags">{lead.tags.slice(0,3).map(t=><span className="crm-tag" key={t}>{t}</span>)}</div>{next&&<div className={`crm-next ${overdue?'late':''}`}><Clock3 size={13}/><span>{next.title}<small>{dateTime(next.dueAt)}</small></span></div>}<footer><span>{lead.assignedSeller?.name??'Sem responsável'}</span><small>{sourceLabels[lead.source??'']??lead.source??'—'}</small></footer><div className="crm-card-bottom"><button onClick={onOpen}>Abrir detalhes <ArrowUpRight size={13}/></button><select aria-label={`Mover lead ${lead.customer?.name??''}`} value={lead.stage} disabled={busy||!!lead.archivedAt||!!lead.saleId} onChange={e=>onMove(e.target.value)}>{STAGES.map(s=><option key={s} value={s}>{stageLabels[s]}</option>)}</select></div></article>;
}
