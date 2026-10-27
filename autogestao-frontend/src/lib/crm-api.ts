import { request, Lead, LeadStage } from './api';
export interface CrmLead extends Lead {
  customerId: string | null; vehicleId: string | null; assignedSellerId: string | null;
  tags: string[]; lostReason: string | null; closedAt: string | null; archivedAt: string | null; lastContactAt: string | null;
  saleId:string|null;
  tasks: {id:string;title:string;dueAt:string;priority:string}[];
  sale?: {id:string;contractNumber:string|null;price:number;soldAt:string}|null;
  chatConversations?: {id:string;mode:string;updatedAt:string}[];
  tradeIn?: TradeIn|null; firstContactAt?: string|null; createdAt: string;
  _count?: { whatsappMessages: number };
}
export interface TradeIn {type?:string;plate?:string;brand?:string;model?:string;year?:number;km?:number;color?:string;expectedValue?:number;evaluatedValue?:number;notes?:string;}
export interface CrmFilters { search?:string;stage?:string;source?:string;temperature?:string;assignedSellerId?:string;unassigned?:boolean;overdue?:boolean;archived?:boolean;unattended?:boolean;from?:string;to?:string; }
export interface Page<T> {items:T[];total:number;page:number;pageSize:number;}
export interface Column {stage:LeadStage;items:CrmLead[];total:number;page:number;}
export interface CrmOptions {customers:{id:string;name:string;phone:string|null;email:string|null}[];vehicles:{id:string;brand:string;model:string;year:number;status:string}[];staff:{id:string;name:string;role:string}[];}
export interface CrmSummary {slaHours:number;unattended:number;total:number;overdueTasks:number;unassigned:number;won:number;conversionRate:number;pipelineValue:number;stages:{stage:LeadStage;count:number;value:number}[];}
export interface CrmActivity {id:string;kind:string;content:string;occurredAt:string;user:{id:string;name:string}|null;metadata?:Record<string,unknown>;}
export interface CrmTask {id:string;leadId:string;title:string;notes:string|null;status:'open'|'done'|'canceled';priority:'low'|'normal'|'high';dueAt:string;remindAt:string|null;assignedUserId:string|null;autoFollowup:boolean;lead:{id:string;stage:LeadStage;customer:{name:string}|null};assignedUser:{id:string;name:string}|null;}
export interface LeadInput {customerId?:string;customerName?:string;customerPhone?:string;customerEmail?:string;vehicleId?:string|null;assignedSellerId?:string|null;stage?:LeadStage;source?:string|null;temperature?:string|null;budget?:number|null;paymentIntent?:string|null;nextActionDate?:string|null;nextActionNote?:string|null;notes?:string|null;lostReason?:string|null;tags?:string[];}
export interface TaskInput {title:string;notes?:string|null;dueAt:string;remindAt?:string|null;assignedUserId?:string|null;priority?:string;}
export function query(params:Record<string,unknown>) {const q=new URLSearchParams();Object.entries(params).forEach(([key,v])=>{if(v!==undefined&&v!==null&&v!=='')q.set(key,String(v));});return q.toString();}
export const getBoard=(filters:CrmFilters)=>request<{columns:Column[]}>(`/crm/board?${query(filters as Record<string,unknown>)}`);
export const getLeads=(filters:CrmFilters,page=1,pageSize=30)=>request<Page<CrmLead>>(`/crm/leads?${query({...filters,page,pageSize})}`);
export const getSummary=(filters:CrmFilters)=>request<CrmSummary>(`/crm/summary?${query(filters as Record<string,unknown>)}`);
export const getOptions=(search='')=>request<CrmOptions>(`/crm/options?${query({search})}`);
export const getLead=(id:string)=>request<CrmLead>(`/crm/leads/${id}`);
export const createLead=(body:LeadInput)=>request<CrmLead>('/crm/leads',{method:'POST',body});
export const updateLead=(id:string,body:LeadInput)=>request<CrmLead>(`/crm/leads/${id}`,{method:'PATCH',body});
export const updateContact=(id:string,body:{name:string;phone:string|null;email:string|null})=>request<CrmLead>(`/crm/leads/${id}/contact`,{method:'PATCH',body});
export const archiveLead=(id:string,archived:boolean)=>request<CrmLead>(`/crm/leads/${id}/archive`,{method:'PATCH',body:{archived}});
export const getHistory=(id:string,page=1)=>request<Page<CrmActivity>>(`/crm/leads/${id}/history?page=${page}`);
export const addActivity=(id:string,body:{kind:string;content:string;occurredAt?:string})=>request<CrmLead>(`/crm/leads/${id}/activities`,{method:'POST',body});
export const getTasks=(params:Record<string,unknown>)=>request<Page<CrmTask>>(`/crm/tasks?${query(params)}`);
export const getReminders=()=>request<{items:CrmTask[];total:number}>('/crm/reminders');
export const saveTask=(leadId:string,body:TaskInput,taskId?:string)=>request<CrmTask>(`/crm/leads/${leadId}/tasks${taskId?`/${taskId}`:''}`,{method:taskId?'PATCH':'POST',body});
export const setTaskStatus=(id:string,status:string)=>request<CrmTask>(`/crm/tasks/${id}/status`,{method:'PATCH',body:{status}});
export const getEligibleSales=(id:string)=>request<{id:string;contractNumber:string|null;price:number;soldAt:string;vehicle:{brand:string;model:string;year:number}}[]>(`/crm/leads/${id}/sales`);
export const linkSale=(id:string,saleId:string)=>request<CrmLead>(`/crm/leads/${id}/sale`,{method:'POST',body:{saleId}});
export async function exportLeads(filters:CrmFilters) {
  const data=await request<{filename:string;content:string;rows:number}>(`/crm/export?${query(filters as Record<string,unknown>)}`);
  const url=URL.createObjectURL(new Blob([data.content],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=data.filename;a.click();URL.revokeObjectURL(url);
}

// ---------- Configurações ----------
export interface CrmSettings {roundRobin:boolean;slaHours:number;activeSellers:number;postSale:{birthday:boolean;review:boolean;upgrade:boolean;reviewDays:number;upgradeDays:number};}
export const getSettings=()=>request<CrmSettings>('/crm/settings');
export const saveSettings=(body:Partial<Omit<CrmSettings,'activeSellers'|'postSale'>>&{postSale?:Partial<CrmSettings['postSale']>})=>request<CrmSettings>('/crm/settings',{method:'PUT',body});

// ---------- Mensagens prontas ----------
export interface Template {id:string;title:string;body:string;category:string;sort:number;}
export const getTemplates=()=>request<Template[]>('/crm/templates');
export const createTemplate=(body:{title:string;body:string;category?:string})=>request<Template>('/crm/templates',{method:'POST',body});
export const updateTemplate=(id:string,body:{title:string;body:string;category?:string})=>request<Template>(`/crm/templates/${id}`,{method:'PATCH',body});
export const deleteTemplate=(id:string)=>request<{success:boolean}>(`/crm/templates/${id}`,{method:'DELETE'});
export const messageSent=(leadId:string,body:{text:string;templateTitle?:string})=>request<CrmLead>(`/crm/leads/${leadId}/message-sent`,{method:'POST',body});

// ---------- Troca ----------
export const saveTradeIn=(leadId:string,body:TradeIn&{remove?:boolean})=>request<CrmLead>(`/crm/leads/${leadId}/trade-in`,{method:'PUT',body});

// ---------- Lista de desejos ----------
export interface MatchVehicle {id:string;brand:string;model:string;version:string|null;year:number;price:number|string;km:number;plate:string|null;photos:{url:string}[];}
export interface Wish {id:string;leadId:string;type:string|null;brand:string|null;model:string|null;yearMin:number|null;yearMax:number|null;priceMax:number|string|null;kmMax:number|null;notes:string|null;status:'active'|'fulfilled'|'canceled';createdAt:string;matches:{id:string;createdAt:string;vehicle:MatchVehicle}[];}
export interface WishInput {type?:string|null;brand?:string|null;model?:string|null;yearMin?:number|null;yearMax?:number|null;priceMax?:number|null;kmMax?:number|null;notes?:string|null;status?:string;}
export interface WishMatch {id:string;createdAt:string;vehicle:MatchVehicle;wish:{id:string;brand:string|null;model:string|null;yearMin:number|null;yearMax:number|null;priceMax:number|string|null;lead:{id:string;stage:LeadStage;customer:{name:string;phone:string|null}|null;assignedSeller:{name:string}|null}};}
export const getWishes=(leadId:string)=>request<Wish[]>(`/crm/leads/${leadId}/wishes`);
export const createWish=(leadId:string,body:WishInput)=>request<Wish[]>(`/crm/leads/${leadId}/wishes`,{method:'POST',body});
export const updateWish=(id:string,body:WishInput)=>request<Wish[]>(`/crm/wishes/${id}`,{method:'PATCH',body});
export const deleteWish=(id:string)=>request<Wish[]>(`/crm/wishes/${id}`,{method:'DELETE'});
export const getWishMatches=()=>request<{items:WishMatch[];total:number}>('/crm/wish-matches');
export const dismissMatch=(id:string)=>request<{success:boolean}>(`/crm/wish-matches/${id}/dismiss`,{method:'POST'});

// ---------- Pós-venda ----------
export interface Followup {id:string;customerId:string;sellerId:string|null;saleId:string|null;leadId:string|null;kind:'birthday'|'review'|'upgrade';title:string;vehicleLabel:string|null;dueDate:string;status:'open'|'done'|'dismissed';doneAt:string|null;customer:{id:string;name:string;phone:string|null};}
export const getFollowups=(status='open')=>request<{items:Followup[];total:number;dueNow:number}>(`/crm/followups?status=${status}`);
export const setFollowupStatus=(id:string,status:string)=>request<Followup>(`/crm/followups/${id}`,{method:'PATCH',body:{status}});
export const followupOpportunity=(id:string)=>request<{leadId:string}>(`/crm/followups/${id}/opportunity`,{method:'POST'});

// ---------- Relatório ----------
export interface ReportRow {key:string;label:string;total:number;won:number;lost:number;open:number;revenue:number;conversion:number;avgResponseMinutes:number|null;}
export interface CrmReport {period:{from:string;to:string};totals:Omit<ReportRow,'key'|'label'>;bySource:ReportRow[];bySeller:ReportRow[];lostReasons:{reason:string;count:number}[];}
export const getReport=(from?:string,to?:string)=>request<CrmReport>(`/crm/report?${query({from,to})}`);
