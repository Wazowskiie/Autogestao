const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { CrmService } = require('../dist/src/crm/crm.service');
const { CrmExtrasService } = require('../dist/src/crm/crm-extras.service');
const { StorefrontService } = require('../dist/src/storefront/storefront.service');
const { VehiclesService } = require('../dist/src/vehicles/vehicles.service');
const { SalesService } = require('../dist/src/sales/sales.service');
const { ReservationsService } = require('../dist/src/reservations/reservations.service');
let db, server, prisma, crm, x, store, vehicles, sales, reservations, shop, owner, s1, s2, U;
const DAY = 86400000;
before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55480, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55480/postgres', max: 1 }) }); await prisma.$connect();
  crm = new CrmService(prisma); x = new CrmExtrasService(prisma, crm); store = new StorefrontService(prisma);
  vehicles = new VehiclesService(prisma); sales = new SalesService(prisma); reservations = new ReservationsService(prisma);
  shop = await prisma.dealership.create({ data: { name: 'Chronos Auto', slug: 'chronos' } });
  owner = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Dona', email: 'dona@crm.invalid', passwordHash: 'x' } });
  s1 = await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'Ana', email: 'ana@crm.invalid', passwordHash: 'x', createdAt: new Date(Date.now() - 2000) } });
  s2 = await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'Beto', email: 'beto@crm.invalid', passwordHash: 'x', createdAt: new Date(Date.now() - 1000) } });
  U = { userId: owner.id, dealershipId: shop.id, role: 'owner' };
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });

test('Rodízio distribui os leads novos entre os vendedores', async () => {
  await x.updateSettings(U, { roundRobin: true, slaHours: 2 });
  const a = await crm.create(U, { customerName: 'Cliente Um', customerPhone: '85999990001', source: 'whatsapp' });
  const b = await crm.create(U, { customerName: 'Cliente Dois', customerPhone: '85999990002', source: 'instagram' });
  const c = await crm.create(U, { customerName: 'Cliente Três', customerPhone: '85999990003', source: 'facebook' });
  assert.deepEqual([a.assignedSellerId, b.assignedSellerId, c.assignedSellerId], [s1.id, s2.id, s1.id]);
  // escolhendo o responsável, o rodízio não interfere
  const d = await crm.create(U, { customerName: 'Cliente Quatro', assignedSellerId: s2.id });
  assert.equal(d.assignedSellerId, s2.id);
});

test('Formulário do site cria lead com tarefa e junta pedidos do mesmo telefone', async () => {
  const v = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model: 'Bros 160', year: 2024, type: 'moto', price: 21000, cost: 17000 } });
  await store.createLead('chronos', { name: 'Paula Site', phone: '(85) 98888-1111', vehicleId: v.id, kind: 'financing', tradeIn: 'Fan 2018' });
  await store.createLead('chronos', { name: 'Paula Site', phone: '85988881111', vehicleId: v.id, message: 'Ainda tem?' });
  const leads = await prisma.lead.findMany({ where: { customer: { phone: '85988881111' } } });
  assert.equal(leads.length, 1);
  const lead = leads[0];
  assert.equal(lead.source, 'site'); assert.equal(lead.vehicleId, v.id); assert.equal(lead.temperature, 'hot');
  assert.equal(await prisma.crmActivity.count({ where: { leadId: lead.id, kind: 'site_form' } }), 2);
  const tasks = await prisma.crmTask.findMany({ where: { leadId: lead.id } });
  assert.equal(tasks.length, 2); assert.match(tasks[0].title, /Responder Paula/);
  assert.match(lead.notes, /Fan 2018/);
  await assert.rejects(store.createLead('chronos', { name: 'X', phone: '123' }), /telefone/);
});

test('Lead sem contato passa do prazo e sai do alerta depois do primeiro contato', async () => {
  const lead = await crm.create(U, { customerName: 'Demorado', customerPhone: '85977770000', assignedSellerId: s1.id });
  await prisma.lead.update({ where: { id: lead.id }, data: { createdAt: new Date(Date.now() - 3 * 3600000) } });
  let sum = await crm.summary(U, {});
  assert.ok(sum.unattended >= 1); assert.equal(sum.slaHours, 2);
  const list = await crm.list(U, { unattended: true });
  assert.ok(list.items.some((l) => l.id === lead.id));
  await crm.activity(U, lead.id, { kind: 'call', content: 'Liguei, vai passar amanhã' });
  const after = await prisma.lead.findUnique({ where: { id: lead.id } });
  assert.ok(after.firstContactAt);
  assert.ok(!(await crm.list(U, { unattended: true })).items.some((l) => l.id === lead.id));
});

test('Mensagens prontas e envio pelo WhatsApp contam como contato', async () => {
  const t = await x.templates(U);
  assert.equal(t.length, 8);
  assert.ok(t.some((m) => m.category === 'desejo'));
  const created = await x.createTemplate(U, { title: 'Promoção', body: 'Oi {primeiro_nome}, promoção hoje!', category: 'geral' });
  await assert.rejects(x.createTemplate({ ...U, role: 'seller', userId: s1.id }, { title: 'x', body: 'yy' }), /dono/);
  await x.removeTemplate(U, created.id);
  const lead = await crm.create(U, { customerName: 'Whats', customerPhone: '85966660000', assignedSellerId: s2.id });
  const after = await x.messageSent(U, lead.id, { text: 'Oi Whats, a moto ainda está disponível', templateTitle: 'Veículo disponível' });
  assert.equal(after.stage, 'contacted'); assert.ok(after.firstContactAt);
});

test('Troca do cliente fica no lead', async () => {
  const lead = await crm.create(U, { customerName: 'Troca', assignedSellerId: s1.id });
  const d = await x.updateTradeIn(U, lead.id, { type: 'moto', plate: 'abc-1d23', brand: 'Yamaha', model: 'Factor 150', year: 2019, km: 30000, expectedValue: 9000 });
  assert.equal(d.tradeIn.plate, 'ABC1D23'); assert.equal(d.tradeIn.expectedValue, 9000);
  await assert.rejects(x.updateTradeIn(U, lead.id, { notes: 'só nota' }), /placa ou a marca/);
  const r = await x.updateTradeIn(U, lead.id, { remove: true });
  assert.equal(r.tradeIn, null);
});

test('Lista de desejos: veículo compatível que entra no estoque gera aviso e tarefa', async () => {
  const lead = await crm.create(U, { customerName: 'Quer CG', customerPhone: '85955550000', assignedSellerId: s1.id });
  const ws = await x.createWish(U, lead.id, { type: 'moto', brand: 'honda', model: 'cg 160', yearMin: 2021, priceMax: 16000 });
  assert.equal(ws.length, 1); assert.equal(ws[0].matches.length, 0);
  await vehicles.create(shop.id, owner.id, { type: 'moto', brand: 'Honda', model: 'CG 160 Fan', year: 2022, km: 15000, cost: 11000, price: 15500 });
  await vehicles.create(shop.id, owner.id, { type: 'moto', brand: 'Honda', model: 'CG 160 Titan', year: 2023, km: 5000, cost: 15000, price: 19000 });
  await vehicles.create(shop.id, owner.id, { type: 'moto', brand: 'Honda', model: 'CG 160 Start', year: 2019, km: 40000, cost: 8000, price: 10000 });
  const m = await x.wishMatches(U);
  assert.equal(m.total, 1); assert.equal(m.items[0].vehicle.model, 'CG 160 Fan');
  const tasks = await prisma.crmTask.findMany({ where: { leadId: lead.id, title: { contains: 'chegou' } } });
  assert.equal(tasks.length, 1); assert.equal(tasks[0].assignedUserId, s1.id);
  // vendedor do outro lead não vê
  const other = await x.wishMatches({ userId: s2.id, dealershipId: shop.id, role: 'seller' });
  assert.equal(other.total, 0);
  // Preço baixou: passa a combinar
  const titan = await prisma.vehicle.findFirst({ where: { model: 'CG 160 Titan' } });
  await vehicles.update(shop.id, titan.id, { price: 15900 });
  assert.equal((await x.wishMatches(U)).total, 2);
  await x.dismissMatch(U, m.items[0].id);
  assert.equal((await x.wishMatches(U)).total, 1);
});

test('Venda leva o lead para Ganhos e o cancelamento leva para Perdidos', async () => {
  const lead = await crm.create(U, { customerName: 'Comprador', customerPhone: '85944440000', assignedSellerId: s1.id });
  const v = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Yamaha', model: 'Lander', year: 2024, type: 'moto', price: 25000, cost: 20000 } });
  const r = await reservations.create(shop.id, owner.id, { vehicleId: v.id, customerId: lead.customerId, deposit: 0 }, U);
  assert.ok(r);
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).stage, 'negotiating');
  const s = await sales.create(shop.id, owner.id, { vehicleId: v.id, customerId: lead.customerId, sellerId: s1.id, price: 25000, cost: 20000, payments: [{ method: 'financing', amount: 25000, bank: 'BV' }] }, U);
  let l = await prisma.lead.findUnique({ where: { id: lead.id } });
  assert.equal(l.stage, 'won'); assert.equal(l.saleId, s.id);
  const fin = await sales.financingPending(shop.id, U);
  assert.equal(fin.items.length, 1); assert.equal(fin.analysis, 1); assert.equal(fin.items[0].bank, 'BV');
  await sales.cancel(shop.id, s.id, { reason: 'Financiamento recusado' });
  l = await prisma.lead.findUnique({ where: { id: lead.id } });
  assert.equal(l.stage, 'lost'); assert.equal(l.saleId, null); assert.match(l.lostReason, /Financiamento recusado/);
  assert.equal((await sales.financingPending(shop.id, U)).items.length, 0);
});

test('Pós-venda: aniversário, revisão de 1 ano e recompra viram lembretes', async () => {
  const now = new Date();
  const cust = await prisma.customer.create({ data: { dealershipId: shop.id, name: 'Marta Antiga', phone: '85933330000', birthDate: new Date(Date.UTC(1990, now.getUTCMonth(), now.getUTCDate(), 12)) } });
  const v1 = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model: 'Biz', year: 2024, price: 14000, cost: 11000, status: 'sold' } });
  const v2 = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model: 'Pop', year: 2023, price: 10000, cost: 8000, status: 'sold' } });
  await prisma.sale.create({ data: { dealershipId: shop.id, vehicleId: v1.id, customerId: cust.id, sellerId: s2.id, price: 14000, cost: 11000, soldAt: new Date(Date.now() - 364 * DAY) } });
  await prisma.sale.create({ data: { dealershipId: shop.id, vehicleId: v2.id, customerId: cust.id, sellerId: s2.id, price: 10000, cost: 8000, soldAt: new Date(Date.now() - 729 * DAY) } });
  const f = await x.followups(U, {});
  const kinds = f.items.map((i) => i.kind).sort();
  assert.deepEqual(kinds, ['birthday', 'review', 'upgrade']);
  // de novo não duplica
  const again = await x.followups(U, {});
  assert.equal(again.items.length, 3);
  // vendedora Beto só vê os dela
  const beto = await x.followups({ userId: s2.id, dealershipId: shop.id, role: 'seller' }, {});
  assert.equal(beto.items.length, 3);
  const ana = await x.followups({ userId: s1.id, dealershipId: shop.id, role: 'seller' }, {});
  assert.equal(ana.items.length, 0);
  const up = f.items.find((i) => i.kind === 'upgrade');
  const { leadId } = await x.followupOpportunity(U, up.id);
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  assert.equal(lead.source, 'pos_venda'); assert.equal(lead.assignedSellerId, s2.id); assert.ok(lead.tags.includes('recompra'));
  const bd = f.items.find((i) => i.kind === 'birthday');
  await x.followupStatus(U, bd.id, 'done');
  assert.equal((await x.followups(U, {})).items.length, 1);
});

test('Relatório do CRM por origem, vendedor e motivos de perda', async () => {
  const rep = await x.report(U, {});
  assert.ok(rep.totals.total >= 10);
  assert.ok(rep.bySource.some((r) => r.key === 'site'));
  assert.ok(rep.bySeller.some((r) => r.label === 'Ana'));
  assert.ok(rep.lostReasons.some((r) => /Financiamento recusado/.test(r.reason)));
  assert.ok(rep.totals.avgResponseMinutes !== undefined);
});
