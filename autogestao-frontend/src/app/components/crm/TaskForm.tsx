import { FormEvent, useEffect, useState } from 'react';
import * as crm from '../../../lib/crm-api';
import { useAuth } from '../../../lib/auth-context';
import { iso, localInput } from './common';
export function TaskForm({lead,task,onClose,onSaved}:{lead:crm.CrmLead;task?:crm.CrmTask;onClose:()=>void;onSaved:()=>void}) {
  const auth=useAuth();const manager=auth.user?.role!=='seller';
  const [title,setTitle]=useState(task?.title??'');
  const [notes,setNotes]=useState(task?.notes??'');
  const [due,setDue]=useState(localInput(task?.dueAt));
  const [reminder,setReminder]=useState(localInput(task?.remindAt));
  const [priority,setPriority]=useState(task?.priority??'normal');
  const [responsible,setResponsible]=useState(task?.assignedUserId??lead.assignedSellerId??auth.user?.id??'');
  const [staff,setStaff]=useState<crm.CrmOptions['staff']>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{crm.getOptions().then(o=>setStaff(o.staff)).catch(e=>setError(e.message));},[]);
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{await crm.saveTask(lead.id,{title,notes:notes||null,dueAt:iso(due)!,remindAt:iso(reminder),priority,...(manager?{assignedUserId:responsible||null}:{})},task?.id);onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <div className="crm-overlay"><section className="crm-modal compact" role="dialog" aria-modal="true" aria-label="Tarefa"><header><div><h3>{task?'Editar tarefa':'Nova tarefa'}</h3><p>{lead.customer?.name}</p></div><button onClick={onClose} aria-label="Fechar tarefa">×</button></header>
    <form onSubmit={submit}><div className="crm-form-body">{error&&<p className="crm-error">{error}</p>}<label>Título<input required minLength={2} maxLength={150} value={title} onChange={e=>setTitle(e.target.value)}/></label><div className="crm-form-grid"><label>Vencimento<input required type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label><label>Lembrar no painel em<input type="datetime-local" value={reminder} onChange={e=>setReminder(e.target.value)}/></label><label>Prioridade<select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option></select></label>
      {manager&&<label>Responsável<select value={responsible} onChange={e=>setResponsible(e.target.value)}><option value="">Sem responsável</option>{staff.filter(s=>s.role!=='seller'||s.id===lead.assignedSellerId).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}</div><label>Detalhes<textarea rows={3} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label><small>Os lembretes aparecem dentro do CRM quando o painel está aberto.</small></div><footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Salvando…':'Salvar tarefa'}</button></footer></form>
  </section></div>;
}
