import { FormEvent, useCallback, useEffect, useState } from 'react';
import { X, Pencil, Phone, MessageSquare, CalendarCheck, Archive, History, UserRound } from 'lucide-react';
import * as crm from '../../../lib/crm-api';
import { useAuth } from '../../../lib/auth-context';
import { STAGES, activityLabels, dateTime, localInput, money, sourceLabels, stageLabels, temperatureLabels } from './common';
import { LeadForm } from './LeadForm';
import { TaskForm } from './TaskForm';

export function LeadDrawer({id,onClose,onChanged,onOpenChat}:{id:string;onClose:()=>void;onChanged:()=>void;onOpenChat:(id:string)=>void}) {
  const auth=useAuth(),manager=auth.user?.role!=='seller';
  const [lead,setLead]=useState<crm.CrmLead|null>(null);
  const [tab,setTab]=useState('history');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [history,setHistory]=useState<crm.Page<crm.CrmActivity>|null>(null),[historyPage,setHistoryPage]=useState(1);
  const [tasks,setTasks]=useState<crm.Page<crm.CrmTask>|null>(null),[taskPage,setTaskPage]=useState(1);
  const [edit,setEdit]=useState(false),[taskForm,setTaskForm]=useState<crm.CrmTask|'new'|null>(null);
  const [kind,setKind]=useState('note'),[content,setContent]=useState('');
  const [occurred,setOccurred]=useState(localInput(new Date().toISOString()));
  const [loss,setLoss]=useState(''),[showLoss,setShowLoss]=useState(false);
  const [name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState('');
  const [sales,setSales]=useState<Awaited<ReturnType<typeof crm.getEligibleSales>>>([]),[saleId,setSaleId]=useState('');
  const reload=useCallback(async()=>{
    try{const [l,h,t]=await Promise.all([crm.getLead(id),crm.getHistory(id,historyPage),crm.getTasks({leadId:id,page:taskPage})]);setLead(l);setHistory(h);setTasks(t);}catch(e){setError((e as Error).message);}
  },[id,historyPage,taskPage]);
  useEffect(()=>{let active=true;setError('');crm.getLead(id).then(l=>{if(active){setLead(l);setName(l.customer?.name??'');setPhone(l.customer?.phone??'');setEmail(l.customer?.email??'');}}).catch(e=>{if(active)setError(e.message);});void reload();return()=>{active=false;};},[id,reload]);
  useEffect(()=>{if(tab==='sales')crm.getEligibleSales(id).then(setSales).catch(e=>setError(e.message));},[tab,id,lead?.sale?.id]);
  const action=async(run:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await run();await reload();onChanged();return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}};
  const changeStage=(stage:string)=>{if(stage==='lost'){setShowLoss(true);return;}void action(()=>crm.updateLead(id,{stage:stage as crm.CrmLead['stage']}));};
  const saveActivity=async(e:FormEvent)=>{e.preventDefault();if(await action(()=>crm.addActivity(id,{kind,content,occurredAt:new Date(occurred).toISOString()})))setContent('');};
  const saveContact=async(e:FormEvent)=>{e.preventDefault();await action(()=>crm.updateContact(id,{name,phone:phone||null,email:email||null}));};
  const archive=async()=>{if(!lead)return;if(!window.confirm(lead.archivedAt?'Restaurar este lead?':'Arquivar este lead? Ele poderá ser restaurado.'))return;await action(()=>crm.archiveLead(id,!lead.archivedAt));};
  const chatIds=lead?.chatConversations??[];
  return <div className="crm-drawer-overlay"><aside className="crm-drawer" role="dialog" aria-modal="true" aria-label="Detalhes do lead">
    <header><div><span className="crm-eyebrow">OPORTUNIDADE</span><h2>{lead?.customer?.name??'Carregando…'}</h2><p>{lead?.vehicle?`${lead.vehicle.brand} ${lead.vehicle.model} ${lead.vehicle.year}`:'Interesse ainda sem veículo definido'}</p></div><button aria-label="Fechar detalhes" onClick={onClose}><X size={20}/></button></header>
    {error&&<p className="crm-error" role="alert">{error}</p>}
    {lead&&<>
      <div className="crm-lead-overview"><span className={`crm-stage ${lead.stage}`}>{stageLabels[lead.stage]}</span><span className={`crm-temp ${lead.temperature??''}`}>{temperatureLabels[lead.temperature??'']??'Sem classificação'}</span>{lead.archivedAt&&<span className="crm-tag">Arquivado</span>}
        <div className="crm-overview-grid"><div><small>Orçamento</small><strong>{lead.budget==null?'A definir':money(lead.budget)}</strong></div><div><small>Responsável</small><strong>{lead.assignedSeller?.name??'Não atribuído'}</strong></div><div><small>Origem</small><strong>{sourceLabels[lead.source??'']??lead.source??'—'}</strong></div><div><small>Último contato</small><strong>{dateTime(lead.lastContactAt)}</strong></div></div>
        <div className="crm-tags">{lead.tags.map(t=><span className="crm-tag" key={t}>{t}</span>)}</div>
        {lead.notes&&<p className="crm-notes">{lead.notes}</p>}
        {lead.lostReason&&<p className="crm-loss"><strong>Motivo da perda:</strong> {lead.lostReason}</p>}
      </div>
      <div className="crm-drawer-actions"><button disabled={busy||!!lead.archivedAt} onClick={()=>setEdit(true)}><Pencil size={14}/> Editar lead</button><label>Etapa<select aria-label="Alterar etapa" value={lead.stage} disabled={busy||!!lead.archivedAt||!!lead.sale} onChange={e=>changeStage(e.target.value)}>{STAGES.map(s=><option key={s} value={s}>{stageLabels[s]}</option>)}</select></label>{manager&&<button disabled={busy} onClick={archive}><Archive size={14}/>{lead.archivedAt?'Restaurar':'Arquivar'}</button>}</div>
      {showLoss&&<form className="crm-inline-form" onSubmit={async e=>{e.preventDefault();if(await action(()=>crm.updateLead(id,{stage:'lost',lostReason:loss})))setShowLoss(false);}}><label>Motivo da perda<textarea required minLength={3} maxLength={500} value={loss} onChange={e=>setLoss(e.target.value)} placeholder="Ex.: comprou em outra loja"/></label><div><button type="button" onClick={()=>setShowLoss(false)}>Cancelar</button><button className="primary" disabled={busy}>Confirmar perda</button></div></form>}
      <nav className="crm-drawer-tabs">{[{id:'history',label:'Histórico',icon:History},{id:'tasks',label:'Tarefas',icon:CalendarCheck},{id:'contact',label:'Contato',icon:UserRound},{id:'chat',label:'Conversas',icon:MessageSquare},{id:'sales',label:'Venda',icon:Phone}].map(item=><button key={item.id} className={tab===item.id?'active':''} onClick={()=>setTab(item.id)}><item.icon size={14}/>{item.label}</button>)}</nav>
      <div className="crm-drawer-content">
        {tab==='history'&&<>
          {!lead.archivedAt&&<form className="crm-inline-form" onSubmit={saveActivity}><h4>Registrar atividade</h4><div className="crm-form-grid"><label>Tipo<select value={kind} onChange={e=>setKind(e.target.value)}>{['note','call','whatsapp','email','visit'].map(k=><option key={k} value={k}>{activityLabels[k]}</option>)}</select></label><label>Quando aconteceu<input required type="datetime-local" value={occurred} onChange={e=>setOccurred(e.target.value)}/></label></div><label>O que aconteceu<textarea required minLength={2} maxLength={4000} rows={3} value={content} onChange={e=>setContent(e.target.value)} placeholder="Registre o contato e os próximos passos"/></label><button className="primary" disabled={busy}>Adicionar ao histórico</button></form>}
          <div className="crm-timeline">{history?.items.map(a=><article key={a.id}><span className="crm-timeline-dot"/><div><div className="crm-timeline-meta"><strong>{activityLabels[a.kind]??a.kind}</strong><small>{dateTime(a.occurredAt)}</small></div><p>{a.kind==='stage'&&a.metadata?.from&&a.metadata?.to?`Etapa alterada: ${stageLabels[a.metadata.from as crm.CrmLead['stage']]??a.metadata.from} → ${stageLabels[a.metadata.to as crm.CrmLead['stage']]??a.metadata.to}`:a.content}</p><small>{a.user?.name??'Sistema / site'}</small></div></article>)}{history?.total===0&&<p className="crm-empty">Nenhum registro ainda. Contatos e alterações aparecerão aqui.</p>}</div>
          <Pager page={historyPage} total={history?.total??0} size={20} onPage={setHistoryPage}/>
        </>}
        {tab==='tasks'&&<><div className="crm-section-heading"><h4>Agenda deste lead</h4><button className="primary" disabled={!!lead.archivedAt||['won','lost'].includes(lead.stage)} onClick={()=>setTaskForm('new')}>Nova tarefa</button></div>{tasks?.items.map(t=><TaskRow key={t.id} task={t} busy={busy} onEdit={()=>setTaskForm(t)} onStatus={status=>action(()=>crm.setTaskStatus(t.id,status))}/>)}{tasks?.total===0&&<p className="crm-empty">Nenhuma tarefa registrada para este lead.</p>}<Pager page={taskPage} total={tasks?.total??0} size={30} onPage={setTaskPage}/></>}
        {tab==='contact'&&<form className="crm-inline-form" onSubmit={saveContact}><h4>Dados do cliente</h4><div className="crm-contact-links">{lead.customer?.phone&&<><a href={`tel:${lead.customer.phone.replace(/[^\d+]/g,'')}`}>Ligar</a><a target="_blank" rel="noopener noreferrer" href={`https://wa.me/${lead.customer.phone.replace(/\D/g,'').length<=11?'55':''}${lead.customer.phone.replace(/\D/g,'')}`}>Abrir WhatsApp</a></>}{lead.customer?.email&&<a href={`mailto:${encodeURIComponent(lead.customer.email)}`}>Escrever e-mail</a>}</div><label>Nome<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} disabled={!!lead.archivedAt}/></label><label>Telefone com DDD<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} disabled={!!lead.archivedAt}/></label><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={!!lead.archivedAt}/></label><small>Esses dados pertencem ao cadastro do cliente e podem estar vinculados a outras oportunidades.</small><button className="primary" disabled={busy||!!lead.archivedAt}>Salvar contato</button></form>}
        {tab==='chat'&&<><h4>Atendimentos vinculados</h4>{chatIds.map(c=><div className="crm-chat-link" key={c.id}><div><strong>{c.mode==='bot'?'Assistente virtual':c.mode==='human'?'Atendimento humano':'Conversa encerrada'}</strong><small>Atualizado em {dateTime(c.updatedAt)}</small></div><button onClick={()=>onOpenChat(c.id)}>Abrir atendimento</button></div>)}{chatIds.length===0&&<p className="crm-empty">Este lead ainda não tem uma conversa do chat vinculada.</p>}</>}
        {tab==='sales'&&<>{lead.sale?<div className="crm-linked-sale"><h4>Venda vinculada</h4><p>Contrato {lead.sale.contractNumber??lead.sale.id}</p><strong>{money(lead.sale.price)}</strong><small>{dateTime(lead.sale.soldAt)}</small></div>:<form className="crm-inline-form" onSubmit={async e=>{e.preventDefault();await action(()=>crm.linkSale(id,saleId));}}><h4>Vincular uma venda já registrada</h4><p>A venda deve pertencer ao mesmo cliente e ao veículo de interesse. O lead será marcado como ganho.</p><label>Venda<select required value={saleId} onChange={e=>setSaleId(e.target.value)}><option value="">Selecione uma venda</option>{sales.map(s=><option key={s.id} value={s.id}>{s.contractNumber??'Contrato'} • {s.vehicle.brand} {s.vehicle.model} • {money(s.price)}</option>)}</select></label>{sales.length===0&&<small>Não há uma venda compatível disponível. Registre a venda na tela Vendas e volte aqui.</small>}<button className="primary" disabled={busy||!saleId||!!lead.archivedAt}>Vincular venda</button></form>}</>}
      </div>
      {edit&&<LeadForm lead={lead} onClose={()=>setEdit(false)} onSaved={l=>{setLead(l);setEdit(false);void reload();onChanged();}}/>}
      {taskForm&&<TaskForm lead={lead} task={taskForm==='new'?undefined:taskForm} onClose={()=>setTaskForm(null)} onSaved={()=>{setTaskForm(null);void reload();onChanged();}}/>}
    </>}
  </aside></div>;
}
export function Pager({page,total,size,onPage}:{page:number;total:number;size:number;onPage:(p:number)=>void}){return <div className="crm-pager"><button disabled={page<=1} onClick={()=>onPage(page-1)}>Anterior</button><span>Página {page} de {Math.max(1,Math.ceil(total/size))} • {total} registros</span><button disabled={page*size>=total} onClick={()=>onPage(page+1)}>Próxima</button></div>;}
export function TaskRow({task,busy,onEdit,onStatus,onOpenLead}:{task:crm.CrmTask;busy:boolean;onEdit?:()=>void;onStatus:(status:string)=>unknown;onOpenLead?:()=>void}) {
  const overdue=task.status==='open'&&new Date(task.dueAt)<new Date();
  return <article className={`crm-task ${overdue?'overdue':''}`}><div><span className={`crm-priority ${task.priority}`}>{task.priority==='high'?'Alta':task.priority==='low'?'Baixa':'Normal'}</span><strong>{task.title}</strong>{onOpenLead&&<button className="crm-link" onClick={onOpenLead}>{task.lead.customer?.name??'Abrir lead'}</button>}<small>{dateTime(task.dueAt)} • {task.assignedUser?.name??'Sem responsável'} {overdue?'• Vencida':''}</small>{task.notes&&<p>{task.notes}</p>}</div><div className="crm-task-actions">{task.status==='open'?<><button disabled={busy} onClick={()=>onStatus('done')}>Concluir</button>{onEdit&&<button disabled={busy} onClick={onEdit}>Editar</button>}<button disabled={busy} onClick={()=>onStatus('canceled')}>Cancelar</button></>:<><span>{task.status==='done'?'Concluída':'Cancelada'}</span><button disabled={busy||['won','lost'].includes(task.lead.stage)} onClick={()=>onStatus('open')}>Reabrir</button></>}</div></article>;
}
