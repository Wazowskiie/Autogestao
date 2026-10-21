const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PlansService } = require('../dist/src/plans/plans.service');
const { ChatService } = require('../dist/src/chat/chat.service');
const { StorefrontService } = require('../dist/src/storefront/storefront.service');
const { BillingService } = require('../dist/src/billing/billing.service');
const { SellersService } = require('../dist/src/sellers/sellers.service');

let db, server, prisma, plans, shop, owner;
const actor = (u) => ({ userId: u.id, dealershipId: u.dealershipId, role: u.role });

before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55472, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55472/postgres', max: 1 }) }); await prisma.$connect();
  // plano antigo do seed, com valores velhos: precisa ser atualizado
  await prisma.plan.create({ data: { id: 'plan-basico', name: 'Básico', price: 149, vehicleLimit: 20, userLimit: 1, features: ['velho'] } });
  plans = new PlansService(prisma);
  await plans.onModuleInit();
  shop = await prisma.dealership.create({ data: { name: 'Mundo das Motos', slug: 'mdm' } });
  owner = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Isabel', email: 'i@x.invalid', passwordHash: 'x' } });
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });

test('Catálogo atualiza o banco e loja nova ganha teste grátis do Profissional', async () => {
  const basico = await prisma.plan.findUnique({ where: { id: 'plan-basico' } });
  assert.equal(basico.vehicleLimit, 30); assert.equal(basico.userLimit, 2);
  assert.equal(await prisma.plan.count(), 3);
  const c = await plans.current(actor(owner));
  assert.equal(c.plan.id, 'plan-profissional'); assert.equal(c.trialActive, true); assert.equal(c.canSwitchFree, true);
  assert.ok(c.trialDaysLeft >= 29); assert.deepEqual(c.features.sort(), ['assistant', 'chat', 'crm', 'nfe', 'renave']);
});

test('Trocar para o Básico tira CRM, chat, NF-e, RENAVE e assistente', async () => {
  const c = await plans.changePlan(actor(owner), 'plan-basico');
  assert.equal(c.plan.name, 'Básico'); assert.deepEqual(c.features, []);
  await assert.rejects(plans.assertFeature(shop.id, 'crm'), /CRM de leads não faz parte do plano Básico.*Profissional/);
  await assert.rejects(plans.assertNfe(shop.id), /não faz parte/);
  await assert.rejects(plans.assertAssistant(shop.id), /não faz parte/);
  // site público: sem chat
  const site = await new StorefrontService(prisma, plans).getDealership('mdm');
  assert.equal(site.chatEnabled, false);
  await assert.rejects(new ChatService(prisma, { reply: async () => 'x' }, plans).start('mdm'), /não está disponível/);
  // volta pro Premium: tudo liberado
  const p = await plans.changePlan(actor(owner), 'plan-premium');
  assert.ok(p.features.includes('priority_support'));
  assert.equal((await new StorefrontService(prisma, plans).getDealership('mdm')).chatEnabled, true);
});

test('Limite de veículos conta só o estoque (vendidos não contam)', async () => {
  await plans.changePlan(actor(owner), 'plan-basico');
  const base = { dealershipId: shop.id, brand: 'Honda', model: 'CG 160', year: 2024, price: 15000, cost: 12000 };
  await prisma.vehicle.createMany({ data: Array.from({ length: 29 }, () => base) });
  await plans.assertVehicleSlot(shop.id); // 29 de 30: ainda cabe
  await prisma.vehicle.create({ data: base });
  await assert.rejects(plans.assertVehicleSlot(shop.id), /até 30 veículos/);
  await prisma.vehicle.create({ data: { ...base, status: 'sold' } });
  const v = await prisma.vehicle.findFirst({ where: { dealershipId: shop.id, status: 'available' } });
  await prisma.vehicle.update({ where: { id: v.id }, data: { status: 'sold' } });
  await plans.assertVehicleSlot(shop.id); // vendeu uma: libera
});

test('Não deixa ir para um plano menor que a loja (veículos e usuários)', async () => {
  await plans.changePlan(actor(owner), 'plan-premium');
  const base = { dealershipId: shop.id, brand: 'Yamaha', model: 'Fazer', year: 2025, price: 20000, cost: 17000 };
  await prisma.vehicle.createMany({ data: Array.from({ length: 5 }, () => base) });
  await assert.rejects(plans.changePlan(actor(owner), 'plan-basico'), /34 veículos em estoque e o plano Básico permite 30/);
  await prisma.vehicle.deleteMany({ where: { model: 'Fazer' } });
  const sellers = new SellersService(prisma, plans);
  await sellers.create(shop.id, { name: 'João', email: 'j@x.invalid', password: 'senha12345' });
  await sellers.create(shop.id, { name: 'Ana', email: 'a@x.invalid', password: 'senha12345' });
  await assert.rejects(plans.changePlan(actor(owner), 'plan-basico'), /3 usuários ativos e o plano Básico permite 2/);
  await prisma.user.updateMany({ where: { email: 'a@x.invalid' }, data: { active: false } });
  await plans.changePlan(actor(owner), 'plan-basico');
  await assert.rejects(sellers.create(shop.id, { name: 'Zé', email: 'z@x.invalid', password: 'senha12345' }), /até 2 usuários/);
});

test('Consultas de placa e perguntas da assistente respeitam o limite do plano', async () => {
  for (let i = 0; i < 30; i++) await plans.logUse(shop.id, owner.id, 'plate_lookup', `ABC${1000 + i}`);
  await assert.rejects(plans.assertPlateLookup(shop.id), /30 consultas de placa/);
  await prisma.user.updateMany({ where: { email: 'j@x.invalid' }, data: { active: false } });
  await plans.changePlan(actor(owner), 'plan-profissional');
  await plans.assertPlateLookup(shop.id); // 30 de 100
  for (let i = 0; i < 40; i++) await plans.logUse(shop.id, owner.id, 'assistant_question');
  await assert.rejects(plans.assertAssistant(shop.id), /40 perguntas de hoje/);
  const c = await plans.current(actor(owner));
  assert.equal(c.usage.plateLookups, 30); assert.equal(c.usage.assistant, 40);
});

test('Depois do teste grátis a troca só acontece com pagamento', async () => {
  await prisma.subscription.update({ where: { dealershipId: shop.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
  const c = await plans.current(actor(owner));
  assert.equal(c.trialActive, false); assert.equal(c.canSwitchFree, false);
  await assert.rejects(plans.changePlan(actor(owner), 'plan-premium'), /teste grátis terminou/);
  process.env.PLAN_SWITCH_FREE = 'true'; // modo demonstração
  await plans.changePlan(actor(owner), 'plan-premium');
  delete process.env.PLAN_SWITCH_FREE;
  await plans.changePlan(actor(owner), 'plan-premium'); // mesmo plano: não faz nada
});

test('Pagamento: plano só muda quando o Asaas confirma', async () => {
  const fakeAsaas = {
    createCustomer: async () => ({ id: 'cus_1' }), cancelSubscription: async () => ({}),
    createSubscription: async (p) => { assert.equal(p.externalReference, 'plan-profissional'); return { id: 'sub_1' }; },
    getSubscriptionPayments: async () => ({ data: [{ id: 'pay_1', status: 'PENDING', invoiceUrl: 'https://x' }] }),
    getPixQrCode: async () => ({ encodedImage: 'x', payload: 'y' }),
  };
  const billing = new BillingService(prisma, fakeAsaas, plans);
  await prisma.subscription.update({ where: { dealershipId: shop.id }, data: { status: 'active' } });
  await billing.checkout(shop.id, 'i@x.invalid', 'Isabel', { planId: 'plan-profissional', billingType: 'PIX' });
  let sub = await prisma.subscription.findUnique({ where: { dealershipId: shop.id } });
  assert.equal(sub.planId, 'plan-premium'); // ainda não pagou
  await billing.handleWebhook({ event: 'PAYMENT_CONFIRMED', payment: { subscription: 'sub_1', externalReference: 'plan-profissional' } });
  sub = await prisma.subscription.findUnique({ where: { dealershipId: shop.id } });
  assert.equal(sub.planId, 'plan-profissional'); assert.equal(sub.status, 'active');
});
