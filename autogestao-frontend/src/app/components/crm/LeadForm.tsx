import { FormEvent, useEffect, useState } from 'react';
import * as crm from '../../../lib/crm-api';
import { useAuth } from '../../../lib/auth-context';
import { SOURCES, STAGES, iso, localInput, sourceLabels, stageLabels, temperatureLabels } from './common';

export function LeadForm({lead,onClose,onSaved}:{lead?:crm.CrmLead;onClose:()=>void;onSaved:(lead:crm.CrmLead)=>void}) {
  const auth=useAuth(),manager=auth.user?.role!=='seller';
  const [options,setOptions]=useState<crm.CrmOptions>({customers:[],vehicles:[],staff:[]});
  const [search,setSearch]=useState('');
  const [customerId,setCustomerId]=useState('');
  const [name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState('');
  const [vehicleId,setVehicleId]=useState(lead?.vehicleId??'');
  const [responsible,setResponsible]=useState(lead?.assignedSellerId??'');
  const [stage,setStage]=useState(lead?.stage??'new');
  const [source,setSource]=useState(lead?.source??'outro');
  const [temperature,setTemperature]=useState<string>(lead?.temperature??'warm');
  const [budget,setBudget]=useState(lead?.budget==null?'':String(lead.budget));
  const [payment,setPayment]=useState(lead?.paymentIntent??'');
  const [tags,setTags]=useState(lead?.tags.join(', ')??'');
  const [notes,setNotes]=useState(lead?.notes??'');
  const [lost,setLost]=useState(lead?.lostReason??'');
  const [next,setNext]=useState(localInput(lead?.nextActionDate));
  const [nextNote,setNextNote]=useState(lead?.nextActionNote??'');
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;const timer=setTimeout(()=>crm.getOptions(search).then(o=>{if(active)setOptions(o);}).catch(e=>{if(active)setError(e.message);}),250);return()=>{active=false;clearTimeout(timer);};},[search]);
  const submit=async(e:FormEvent)=>{
    e.preventDefault();setSaving(true);setError('');
    try{
      const body:crm.LeadInput={vehicleId:vehicleId||null,stage,source:source||null,temperature:temperature||null,budget:budget===''?null:Number(budget.replace(',','.')),paymentIntent:payment||null,tags:tags.split(',').map(t=>t.trim()).filter(Boolean),notes:notes||null,lostReason:stage==='lost'?lost:null,nextActionDate:iso(next),nextActionNote:nextNote||null,...(manager?{assignedSellerId:responsible||null}:{})};
      if(lead)onSaved(await crm.updateLead(lead.id,body));
      else onSaved(await crm.createLead({...body,...(customerId?{customerId}:{customerName:name,customerPhone:phone||undefined,customerEmail:email||undefined})}));
    }catch(e){setError((e as Error).message);}finally{setSaving(false);}
  };
  const availableVehicles=options.vehicles.some(v=>v.id===lead?.vehicleId)?options.vehicles:lead?.vehicle?[{...lead.vehicle,status:'selected'},...options.vehicles]:options.vehicles;
  const staff=options.staff.some(s=>s.id===lead?.assignedSellerId)?options.staff:lead?.assignedSeller?[{...lead.assignedSeller,role:'seller'},...options.staff]:options.staff;
  return <div className="crm-overlay"><section className="crm-modal" role="dialog" aria-modal="true" aria-label={lead?'Editar lead':'Novo lead'}>
    <header><div><h3>{lead?'Editar lead':'Novo lead'}</h3><p>{lead?lead.customer?.name:'Registre o interesse e defina o próximo contato.'}</p></div><button type="button" aria-label="Fechar formulário" onClick={onClose}>×</button></header>
    <form onSubmit={submit}><div className="crm-form-body">
      {error&&<p role="alert" className="crm-error">{error}</p>}
      {!lead&&<fieldset><legend>Cliente</legend><label>Buscar cliente ou veículo<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome, telefone, marca ou modelo"/></label><label>Cliente existente<select value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Cadastrar / localizar pelo contato</option>{options.customers.map(c=><option key={c.id} value={c.id}>{c.name} {c.phone?`— ${c.phone}`:''}</option>)}</select></label>
        {!customerId&&<div className="crm-form-grid"><label className="wide">Nome do cliente<input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>Telefone com DDD<input type="tel" value={phone} onChange={e=>setPhone(e.target.value)}/></label><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label></div>}
        <small>Um contato já cadastrado é reutilizado pelo telefone ou e-mail.</small></fieldset>}
      <fieldset><legend>Oportunidade</legend>{lead&&<label>Buscar veículo<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Marca ou modelo"/></label>}
        <div className="crm-form-grid"><label className="wide">Veículo de interesse<select value={vehicleId} onChange={e=>setVehicleId(e.target.value)}><option value="">Ainda não definido</option>{availableVehicles.map(v=><option key={v.id} value={v.id}>{v.brand} {v.model} {v.year}{v.status==='sold'?' • vendido':''}</option>)}</select></label>
        <label>Etapa<select value={stage} onChange={e=>setStage(e.target.value as typeof stage)} disabled={!!lead?.sale}>{STAGES.map(s=><option key={s} value={s}>{stageLabels[s]}</option>)}</select></label>
        <label>Temperatura<select value={temperature} onChange={e=>setTemperature(e.target.value)}><option value="">Sem classificação</option>{Object.entries(temperatureLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        <label>Origem<select value={source} onChange={e=>setSource(e.target.value)}>{SOURCES.map(s=><option key={s} value={s}>{sourceLabels[s]}</option>)}</select></label>
        {manager?<label>Responsável<select value={responsible} onChange={e=>setResponsible(e.target.value)}><option value="">Sem responsável</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>:<label>Responsável<input readOnly value={auth.user?.name??''}/></label>}
        <label>Orçamento (R$)<input type="number" min="0" step="0.01" value={budget} onChange={e=>setBudget(e.target.value)}/></label>
        <label>Pagamento pretendido<select value={payment} onChange={e=>setPayment(e.target.value)}><option value="">A definir</option>{['À vista','Financiamento','Consórcio','PIX','Cartão','Promissória'].map(p=><option key={p}>{p}</option>)}</select></label>
        <label className="wide">Etiquetas<input value={tags} onChange={e=>setTags(e.target.value)} placeholder="SUV, retorno urgente, indicação" maxLength={300}/></label>
        {stage==='lost'&&<label className="wide">Motivo da perda<textarea required minLength={3} maxLength={500} value={lost} onChange={e=>setLost(e.target.value)}/></label>}
        <label className="wide">Observações<textarea rows={3} maxLength={6000} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div></fieldset>
      {!['won','lost'].includes(stage)&&<fieldset><legend>Próximo contato</legend><div className="crm-form-grid"><label>Data e hora<input type="datetime-local" value={next} onChange={e=>setNext(e.target.value)}/></label><label>O que fazer<input value={nextNote} onChange={e=>setNextNote(e.target.value)} maxLength={150} placeholder="Ligar para confirmar a visita"/></label></div><small>Ao definir uma data, uma tarefa de retorno é criada na agenda.</small></fieldset>}
    </div><footer><button type="button" onClick={onClose}>Cancelar</button><button className="primary" disabled={saving}>{saving?'Salvando…':lead?'Salvar alterações':'Criar lead'}</button></footer></form>
  </section></div>;
}
