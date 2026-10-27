import { LeadStage } from '../../../lib/api';
export const STAGES:LeadStage[]=['new','contacted','negotiating','won','lost'];
export const stageLabels:Record<LeadStage,string>={new:'Novos',contacted:'Em contato',negotiating:'Negociação',won:'Ganhos',lost:'Perdidos'};
export const SOURCES=['whatsapp','instagram','facebook','site','indicacao','olx','webmotors','presencial','pos_venda','outro'];
export const sourceLabels:Record<string,string>={whatsapp:'WhatsApp',instagram:'Instagram',site:'Site / chat',indicacao:'Indicação',olx:'OLX',webmotors:'Webmotors',presencial:'Presencial',facebook:'Facebook',pos_venda:'Pós-venda',outro:'Outro'};
export const temperatureLabels:Record<string,string>={hot:'Quente',warm:'Morno',cold:'Frio'};
export const activityLabels:Record<string,string>={note:'Anotação',call:'Ligação',whatsapp:'WhatsApp',email:'E-mail',visit:'Visita',created:'Criação',updated:'Edição',stage:'Etapa',assignment:'Responsável',task:'Tarefa',task_status:'Tarefa',archived:'Arquivamento',restored:'Restauração',sale:'Venda vinculada',chat:'Chat',contact_updated:'Contato',chat_assignment:'Atendimento',tasks_canceled:'Tarefas',site_form:'Pedido pelo site',wish:'Lista de desejos',wish_match:'Chegou no estoque',trade_in:'Troca',reservation:'Reserva',sale_canceled:'Venda cancelada'};
export const money=(v:number|string|null|undefined)=>Number(v??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const dateTime=(v:string|null|undefined)=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
export function localInput(v?:string|null){if(!v)return'';const d=new Date(v);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);}
export const iso=(value:string)=>value?new Date(value).toISOString():null;

// ---------- Mensagens prontas ----------
export interface TemplateContext { name?:string|null; vehicleLabel?:string|null; instagram?:string|null; storeWhatsapp?:string|null; vehicle?:{id:string;brand:string;model:string;year:number;price?:number|string}|null; store?:string|null; slug?:string|null; seller?:string|null; }
export const TEMPLATE_VARS:[string,string][]=[['{primeiro_nome}','Primeiro nome do cliente'],['{nome}','Nome completo'],['{veiculo}','Veículo (marca, modelo e ano)'],['{preco}','Preço do veículo'],['{link}','Link do veículo no seu site'],['{loja}','Nome da loja'],['{vendedor}','Seu nome'],['{instagram}','Instagram da loja'],['{whatsapp_loja}','WhatsApp da loja']];
export const CATEGORY_LABELS:Record<string,string>={geral:'Geral',primeiro_contato:'Primeiro contato',disponivel:'Veículo disponível',proposta:'Proposta',retorno:'Retomar contato',desejo:'Lista de desejos',aniversario:'Aniversário',revisao:'Revisão',recompra:'Recompra'};
export function storeLink(slug?:string|null,vehicleId?:string|null){if(!slug)return '';return `${window.location.origin}/loja/${slug}${vehicleId?`?v=${vehicleId}`:''}`;}
export function renderTemplate(body:string,c:TemplateContext){
  const v=c.vehicle;
  const map:Record<string,string>={
    '{primeiro_nome}':(c.name??'').trim().split(/\s+/)[0]||'tudo bem',
    '{nome}':(c.name??'').trim(),
    '{veiculo}':c.vehicleLabel??(v?`${v.brand} ${v.model} ${v.year}`:'moto que você procura'),
    '{preco}':v?.price!=null?money(v.price):'um ótimo preço',
    '{link}':storeLink(c.slug,v?.id),
    '{loja}':c.store??'nossa loja',
    '{vendedor}':(c.seller??'').trim().split(/\s+/)[0]||'a equipe',
    '{instagram}':c.instagram?`@${c.instagram}`:'',
    '{whatsapp_loja}':c.storeWhatsapp?c.storeWhatsapp.replace(/(\d{2})(\d{4,5})(\d{4})/,'($1) $2-$3'):'',
  };
  return body.replace(/\{[a-z_]+\}/g,m=>map[m]??m).replace(/\n{3,}/g,'\n\n').trim();
}
export function waLink(phone:string|null|undefined,text:string){
  const d=(phone??'').replace(/\D/g,'');
  const full=d.length<=11?`55${d}`:d;
  return `https://wa.me/${d?full:''}?text=${encodeURIComponent(text)}`;
}
export function minutesText(m:number|null|undefined){if(m==null)return '—';if(m<60)return `${m} min`;const h=Math.floor(m/60);if(h<24)return `${h}h${m%60?` ${m%60}min`:''}`;return `${Math.floor(h/24)}d ${h%24}h`;}
export function ageHours(iso:string){return Math.floor((Date.now()-new Date(iso).getTime())/3600000);}
