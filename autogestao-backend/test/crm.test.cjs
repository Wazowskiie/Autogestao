const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { CrmService } = require('../dist/src/crm/crm.service');
const { ChatService } = require('../dist/src/chat/chat.service');
const { CustomersService } = require('../dist/src/customers/customers.service');
const { LeadsController } = require('../dist/src/leads/leads.controller');
let db,server,prisma,crm,chat,shop,otherShop,owner,seller,otherSeller,foreign,vehicle,customer,lead;
const actor=u=>({userId:u.id,dealershipId:u.dealershipId,role:u.role});
const query=extra=>({page:1,pageSize:30,...extra});
before(async()=>{
  const { PGlite }=await import('@electric-sql/pglite');
  const { PGLiteSocketServer }=await import('@electric-sql/pglite-socket');
  db=await PGlite.create();
  const dir=path.join(__dirname,'../prisma/migrations');
  for(const name of fs.readdirSync(dir).sort()){const file=path.join(dir,name,'migration.sql');if(fs.existsSync(file))await db.exec(fs.readFileSync(file,'utf8'));}
  server=new PGLiteSocketServer({db,port:55440,host:'127.0.0.1',maxConnections:10});await server.start();
  prisma=new PrismaClient({adapter:new PrismaPg({connectionString:'postgresql://postgres:postgres@127.0.0.1:55440/postgres',max:1})});await prisma.$connect();
  crm=new CrmService(prisma);chat=new ChatService(prisma,{reply:async()=> 'Resposta de teste'});
  shop=await prisma.dealership.create({data:{name:'CRM Loja A',slug:'crm-a'}});
  otherShop=await prisma.dealership.create({data:{name:'CRM Loja B',slug:'crm-b'}});
  owner=await prisma.user.create({data:{dealershipId:shop.id,role:'owner',name:'Gestor',email:'owner@crm.invalid',passwordHash:'unused'}});
  seller=await prisma.user.create({data:{dealershipId:shop.id,role:'seller',name:'Vendedor A',email:'a@crm.invalid',passwordHash:'unused'}});
  otherSeller=await prisma.user.create({data:{dealershipId:shop.id,role:'seller',name:'Vendedor B',email:'b@crm.invalid',passwordHash:'unused'}});
  foreign=await prisma.user.create({data:{dealershipId:otherShop.id,role:'owner',name:'Gestor B',email:'foreign@crm.invalid',passwordHash:'unused'}});
  vehicle=await prisma.vehicle.create({data:{dealershipId:shop.id,brand:'Honda',model:'CG 160',year:2024,price:16500,cost:13000}});
});
after(async()=>{if(prisma)await prisma.$disconnect();if(server)await server.stop();if(db)await db.close();});

test('Cadastro é transacional, preserva campos e cria tarefa de retorno',async()=>{
  lead=await crm.create(actor(seller),{customerName:'Cliente CRM',customerPhone:'(11) 99999-9991',customerEmail:'cliente@crm.invalid',vehicleId:vehicle.id,source:'whatsapp',temperature:'hot',budget:20000,paymentIntent:'PIX',tags:['moto','retorno'],notes:'Cliente interessado',nextActionDate:new Date(Date.now()+86400000).toISOString(),nextActionNote:'Ligar para confirmar visita'});
  customer=lead.customer;
  assert.equal(lead.assignedSellerId,seller.id);assert.equal(lead.customer.phone,'11999999991');assert.equal(lead.budget.toString(),'20000');assert.deepEqual(lead.tags,['moto','retorno']);
  const tasks=await crm.tasks(actor(seller),{leadId:lead.id,page:1,pageSize:30});assert.equal(tasks.total,1);assert.equal(tasks.items[0].autoFollowup,true);
  assert.equal((await crm.history(actor(seller),lead.id)).total,1);
});
test('Vendedor não acessa lead de colega ou outra loja, inclusive endpoint legado',async()=>{
  await assert.rejects(crm.detail(actor(otherSeller),lead.id),/não encontrado/);
  await assert.rejects(crm.detail(actor(foreign),lead.id),/não encontrado/);
  assert.equal((await crm.list(actor(otherSeller),query())).total,0);
  const legacy=new LeadsController(crm);
  assert.equal(Object.values(await legacy.findAll(actor(otherSeller))).flat().length,0);
  await assert.rejects(legacy.findOne(actor(otherSeller),lead.id),/não encontrado/);
  assert.equal((await crm.list(actor(owner),query())).total,1);
});
test('Gestor reatribui lead e tarefas; vendedor não pode reatribuir',async()=>{
  await assert.rejects(crm.update(actor(seller),lead.id,{assignedSellerId:otherSeller.id}),/Somente gestores/);
  await crm.update(actor(owner),lead.id,{assignedSellerId:otherSeller.id});
  await assert.rejects(crm.detail(actor(seller),lead.id),/não encontrado/);
  assert.equal((await crm.tasks(actor(otherSeller),{leadId:lead.id,page:1,pageSize:30})).items[0].assignedUserId,otherSeller.id);
  await crm.update(actor(owner),lead.id,{assignedSellerId:seller.id});
});
test('Falha de vínculo não deixa cliente órfão e não aceita dados de outra revenda',async()=>{
  const before=await prisma.customer.count({where:{dealershipId:shop.id}});
  await assert.rejects(crm.create(actor(owner),{customerName:'Não persistir',vehicleId:randomUUID()}),/Veículo não encontrado/);
  assert.equal(await prisma.customer.count({where:{dealershipId:shop.id}}),before);
  await assert.rejects(crm.create(actor(seller),{customerName:'Invalido',assignedSellerId:otherSeller.id}),/somente para si/);
});
test('Contato normalizado reutiliza cliente; valores e campos podem ser limpos',async()=>{
  const second=await crm.create(actor(owner),{customerName:'Mesmo cliente',customerPhone:'11999999991',vehicleId:vehicle.id});
  assert.equal(second.customerId,customer.id);assert.equal(await prisma.customer.count({where:{dealershipId:shop.id,phone:'11999999991'}}),1);
  const updated=await crm.update(actor(seller),lead.id,{vehicleId:null,budget:null,notes:null,temperature:null,nextActionDate:null,nextActionNote:null,tags:[]});
  assert.equal(updated.vehicleId,null);assert.equal(updated.budget,null);assert.equal(updated.notes,null);assert.equal(updated.tasks.length,0);
  await crm.update(actor(seller),lead.id,{vehicleId:vehicle.id,budget:20000});
});
test('Registrar contato cria histórico e atualiza última interação',async()=>{
  const when=new Date(Date.now()-3600000).toISOString();
  await crm.activity(actor(seller),lead.id,{kind:'call',content:'Cliente confirmou interesse em visita',occurredAt:when});
  const updated=await crm.detail(actor(seller),lead.id);assert.equal(updated.lastContactAt.toISOString(),when);
  assert((await crm.history(actor(seller),lead.id)).items.some(a=>a.kind==='call'));
  await assert.rejects(crm.activity(actor(otherSeller),lead.id,{kind:'note',content:'Acesso indevido'}),/não encontrado/);
});
test('Tarefas validam lembrete, respeitam proprietário e conclusão é idempotente',async()=>{
  const due=new Date(Date.now()-3600000).toISOString();
  await assert.rejects(crm.saveTask(actor(seller),lead.id,{title:'Ligação',dueAt:due,remindAt:new Date().toISOString()}),/até o vencimento/);
  const task=await crm.saveTask(actor(seller),lead.id,{title:'Confirmar visita',dueAt:due,priority:'high'});
  assert((await crm.reminders(actor(seller))).items.some(t=>t.id===task.id));
  assert.equal((await crm.reminders(actor(otherSeller))).total,0);
  await assert.rejects(crm.taskStatus(actor(otherSeller),task.id,'done'),/não encontrada/);
  await crm.taskStatus(actor(seller),task.id,'done');
  const first=(await crm.history(actor(seller),lead.id)).total;
  await crm.taskStatus(actor(seller),task.id,'done');assert.equal((await crm.history(actor(seller),lead.id)).total,first);
  await crm.taskStatus(actor(seller),task.id,'open');assert.equal((await crm.tasks(actor(seller),{status:'open',leadId:lead.id,page:1,pageSize:30})).total,1);
});
test('Perda exige motivo e cancela tarefas; reabrir limpa encerramento',async()=>{
  await assert.rejects(crm.update(actor(seller),lead.id,{stage:'lost'}),/motivo da perda/);
  const lost=await crm.update(actor(seller),lead.id,{stage:'lost',lostReason:'Cliente adiou a compra'});assert(lost.closedAt);assert.equal(lost.lostReason,'Cliente adiou a compra');
  await assert.rejects(crm.update(actor(seller),lead.id,{lostReason:null}),/motivo da perda/);
  assert.equal((await crm.tasks(actor(seller),{leadId:lead.id,status:'open',page:1,pageSize:30})).total,0);
  const reopened=await crm.update(actor(seller),lead.id,{stage:'negotiating'});assert.equal(reopened.closedAt,null);assert.equal(reopened.lostReason,null);
});
test('Arquivamento é reversível e reservado aos gestores',async()=>{
  await assert.rejects(crm.archive(actor(seller),lead.id,true),/gestores/);
  await crm.archive(actor(owner),lead.id,true);
  assert.equal((await crm.list(actor(seller),query())).total,0);
  assert.equal((await crm.list(actor(seller),query({archived:true}))).total,1);
  await assert.rejects(crm.update(actor(seller),lead.id,{notes:'editar arquivado'}),/Restaure/);
  await crm.archive(actor(owner),lead.id,false);assert.equal((await crm.detail(actor(seller),lead.id)).archivedAt,null);
});
test('Filtros, resumo e paginação consideram todos os leads autorizados',async()=>{
  for(let i=0;i<23;i++)await crm.create(actor(seller),{customerId:customer.id,source:'instagram',budget:100+i});
  const first=await crm.list(actor(seller),query({source:'instagram',pageSize:10}));const second=await crm.list(actor(seller),query({source:'instagram',pageSize:10,page:2}));
  assert.equal(first.total,23);assert.equal(first.items.length,10);assert.equal(second.items.length,10);assert(!first.items.some(a=>second.items.some(b=>a.id===b.id)));
  const board=await crm.board(actor(seller),query({source:'instagram'}));const col=board.columns.find(c=>c.stage==='new');assert.equal(col.total,23);assert.equal(col.items.length,20);
  const summary=await crm.summary(actor(seller),query({source:'instagram'}));assert.equal(summary.total,23);assert.equal(summary.pipelineValue,2553);
  assert.equal((await crm.summary(actor(otherSeller),query())).total,0);
});
test('Conversas são distribuídas por gestor e não vazam para vendedores',async()=>{
  const s=await chat.start('crm-a');await chat.contact('crm-a',s.token,{name:'Visitante',phone:'11999990002',consent:true});
  const raw=await prisma.chatConversation.findUnique({where:{id:s.conversation.id}});
  assert.equal((await chat.list(shop.id,1,actor(seller))).total,0);
  await assert.rejects(chat.detail(shop.id,s.conversation.id,actor(seller)),/não encontrada/);
  await crm.update(actor(owner),raw.leadId,{assignedSellerId:seller.id});
  assert.equal((await chat.list(shop.id,1,actor(seller))).total,1);
  await assert.rejects(chat.setMode(shop.id,s.conversation.id,'human',otherSeller.id,actor(otherSeller)),/não encontrada/);
  await chat.setMode(shop.id,s.conversation.id,'human',seller.id,actor(seller));
  await chat.agentReply(shop.id,s.conversation.id,seller.id,{content:'Bem-vindo',clientMessageId:randomUUID()},actor(seller));
  assert((await crm.detail(actor(seller),raw.leadId)).chatConversations.length===1);
});
test('Cadastro de clientes não expõe os leads de outros vendedores',async()=>{
  const service=new CustomersService(prisma);
  const data=await service.findOne(shop.id,customer.id,actor(seller));
  assert(data.leads.every(l=>l.assignedSellerId===seller.id));
  const privateCustomer=await prisma.customer.create({data:{dealershipId:shop.id,name:'Cliente particular',createdById:otherSeller.id}});
  await assert.rejects(service.findOne(shop.id,privateCustomer.id,actor(seller)),/não encontrado/);
});
test('Venda vinculada é compatível e mantém o CRM ganho sem alterar o financeiro',async()=>{
  const sale=await prisma.sale.create({data:{dealershipId:shop.id,vehicleId:vehicle.id,customerId:customer.id,sellerId:seller.id,cost:13000,price:16500}});
  const linked=await crm.linkSale(actor(seller),lead.id,sale.id);assert.equal(linked.stage,'won');assert.equal(linked.sale.id,sale.id);
  await assert.rejects(crm.update(actor(seller),lead.id,{stage:'new'}),/permanecer ganho/);
  const other=await crm.create(actor(seller),{customerId:customer.id,vehicleId:vehicle.id});
  await assert.rejects(crm.linkSale(actor(seller),other.id,sale.id),/já vinculada/);
  assert.equal(await prisma.financialTransaction.count(),0);
});
test('CSV exporta só leads próprios e neutraliza fórmulas de planilhas',async()=>{
  await crm.create(actor(seller),{customerName:'=HYPERLINK("test")',source:'outro'});
  const own=await crm.exportCsv(actor(seller),query({search:'HYPERLINK'}));assert.equal(own.rows,1);assert(own.content.includes("'=HYPERLINK"));
  assert.equal((await crm.exportCsv(actor(otherSeller),query({search:'HYPERLINK'}))).rows,0);
});

test('Vendas não servem de atalho para consultar os clientes de outro vendedor',async()=>{
  const {SalesService}=require('../dist/src/sales/sales.service');
  const service=new SalesService(prisma);
  const sale=await prisma.sale.findFirst({where:{dealershipId:shop.id,sellerId:seller.id}});
  assert.equal((await service.findAll(shop.id,{},actor(otherSeller))).total,0);
  await assert.rejects(service.findOne(shop.id,sale.id,actor(otherSeller)),/não encontrada/);
  assert.equal((await service.summary(shop.id,undefined,actor(otherSeller))).count,0);
  assert.equal((await service.findOne(shop.id,sale.id,actor(owner))).id,sale.id);
});
test('Edição de venda não aceita campos que alteram vínculos do CRM',async()=>{
  const {UpdateSaleDto}=require('../dist/src/sales/dto/update-sale.dto');
  const {plainToInstance}=require('class-transformer');const {validate}=require('class-validator');
  const errors=await validate(plainToInstance(UpdateSaleDto,{notes:'Anotação permitida',dealershipId:otherShop.id,crmLead:{connect:{id:lead.id}}}),{whitelist:true,forbidNonWhitelisted:true});
  assert(errors.some(e=>e.property==='dealershipId'));assert(errors.some(e=>e.property==='crmLead'));
});
