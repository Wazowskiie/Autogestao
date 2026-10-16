import { LeadStage } from '../../../lib/api';
export const STAGES:LeadStage[]=['new','contacted','negotiating','won','lost'];
export const stageLabels:Record<LeadStage,string>={new:'Novos',contacted:'Em contato',negotiating:'Negociação',won:'Ganhos',lost:'Perdidos'};
export const SOURCES=['whatsapp','instagram','site','indicacao','olx','webmotors','presencial','outro'];
export const sourceLabels:Record<string,string>={whatsapp:'WhatsApp',instagram:'Instagram',site:'Site / chat',indicacao:'Indicação',olx:'OLX',webmotors:'Webmotors',presencial:'Presencial',outro:'Outro'};
export const temperatureLabels:Record<string,string>={hot:'Quente',warm:'Morno',cold:'Frio'};
export const activityLabels:Record<string,string>={note:'Anotação',call:'Ligação',whatsapp:'WhatsApp',email:'E-mail',visit:'Visita',created:'Criação',updated:'Edição',stage:'Etapa',assignment:'Responsável',task:'Tarefa',task_status:'Tarefa',archived:'Arquivamento',restored:'Restauração',sale:'Venda vinculada',chat:'Chat',contact_updated:'Contato',chat_assignment:'Atendimento',tasks_canceled:'Tarefas'};
export const money=(v:number|string|null|undefined)=>Number(v??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const dateTime=(v:string|null|undefined)=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
export function localInput(v?:string|null){if(!v)return'';const d=new Date(v);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);}
export const iso=(value:string)=>value?new Date(value).toISOString():null;
