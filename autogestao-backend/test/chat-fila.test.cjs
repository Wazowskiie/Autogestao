const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { ChatService } = require('../dist/src/chat/chat.service');
const { SellerAlertService, waNumber, templateParam } = require('../dist/src/chat/seller-alert.service');
const { TokenEncryptionService } = require('../dist/src/common/crypto/token-encryption.service');

let db, server, prisma, service, alerts, shop, owner, v1, v2, crypto, sent;
const seller = (u) => ({ userId: u.id, dealershipId: shop.id, role: 'seller' });
before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55467, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55467/postgres', max: 1 }) }); await prisma.$connect();
  shop = await prisma.dealership.create({ data: { name: 'Loja Fila', slug: 'loja-fila' } });
  owner = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Dona', email: 'dona@f.invalid', passwordHash: 'x' } });
  v1 = await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'Ana', email: 'ana@f.invalid', passwordHash: 'x', phone: '85988887777' } });
  v2 = await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'Beto', email: 'beto@f.invalid', passwordHash: 'x', phone: '5585977776666' } });
  await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'Sem fone', email: 'semfone@f.invalid', passwordHash: 'x' } });
  crypto = new TokenEncryptionService({ get: () => 'chave-de-teste-bem-comprida-123' });
  alerts = new SellerAlertService(prisma, crypto);
  sent = [];
  alerts.fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => ({}) }; };
  service = new ChatService(prisma, { reply: async () => 'ok' }, undefined, alerts);
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });

test('Fila aberta: vendedores veem quem pediu vendedor e o primeiro que atende fica com o cliente', async () => {
  const s = await service.start('loja-fila');
  // Antes de pedir vendedor, a conversa não aparece para os vendedores
  assert.equal((await service.list(shop.id, 1, seller(v1))).items.some((c) => c.id === s.conversation.id), false);
  await service.handover('loja-fila', s.token);
  assert.equal((await service.waiting(shop.id)).count, 1);
  assert.equal((await service.list(shop.id, 1, seller(v1))).items.some((c) => c.id === s.conversation.id), true);
  assert.equal((await service.list(shop.id, 1, seller(v2))).items.some((c) => c.id === s.conversation.id), true);
  // Beto não pode encerrar sem assumir
  await assert.rejects(service.setMode(shop.id, s.conversation.id, 'closed', v2.id, seller(v2)), /Assuma o atendimento/);
  const d = await service.setMode(shop.id, s.conversation.id, 'human', v1.id, seller(v1));
  assert.equal(d.assignedUser.id, v1.id);
  assert.equal((await service.waiting(shop.id)).count, 0);
  // Beto chegou atrasado
  await assert.rejects(service.setMode(shop.id, s.conversation.id, 'human', v2.id, seller(v2)), /Ana já assumiu este atendimento/);
  assert.equal((await service.list(shop.id, 1, seller(v2))).items.some((c) => c.id === s.conversation.id), false);
  // A dona pode assumir mesmo assim
  const o = await service.setMode(shop.id, s.conversation.id, 'human', owner.id, { userId: owner.id, dealershipId: shop.id, role: 'owner' });
  assert.equal(o.assignedUser.id, owner.id);
});

test('Quem atende fica com o lead do chat se ninguém tinha', async () => {
  const s = await service.start('loja-fila');
  await service.contact('loja-fila', s.token, { name: 'Carla', phone: '85911112222', consent: true });
  await service.handover('loja-fila', s.token);
  await service.setMode(shop.id, s.conversation.id, 'human', v2.id, seller(v2));
  const c = await prisma.chatConversation.findUnique({ where: { id: s.conversation.id }, include: { lead: true } });
  assert.equal(c.lead.assignedSellerId, v2.id);
});

test('Aviso no WhatsApp: só com conta conectada e modelo; vai para cada vendedor com telefone', async () => {
  const s = await service.start('loja-fila');
  assert.equal((await alerts.notify(shop.id, s.conversation.id)).reason, 'WhatsApp oficial não conectado');
  await prisma.whatsappAccount.create({ data: { dealershipId: shop.id, phoneNumberId: '123456', accessTokenEnc: crypto.encrypt('tok'), appSecretEnc: crypto.encrypt('sec'), verifyToken: 'vt-fila', status: 'connected' } });
  assert.equal((await alerts.notify(shop.id, s.conversation.id)).reason, 'Modelo de aviso não configurado');
  await prisma.whatsappAccount.update({ where: { dealershipId: shop.id }, data: { sellerAlertTemplate: 'aviso_vendedor' } });
  await service.send('loja-fila', s.token, { content: 'procuro uma PCX\n2026', clientMessageId: require('node:crypto').randomUUID() });
  sent.length = 0;
  await service.handover('loja-fila', s.token);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(sent.map((x) => x.body.to).sort(), ['5585977776666', '5585988887777']);
  const t = sent[0].body.template;
  assert.equal(t.name, 'aviso_vendedor'); assert.equal(t.language.code, 'pt_BR');
  assert.equal(t.components[0].parameters[0].text, 'Visitante do site');
  assert.match(t.components[0].parameters[1].text, /procuro uma PCX 2026/);
  // Clicar de novo em "Falar com vendedor" não repete o aviso
  sent.length = 0;
  await service.handover('loja-fila', s.token);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(sent.length, 0);
  assert.equal(waNumber('(85) 98888-7777'), '5585988887777'); assert.equal(waNumber('123'), null);
  assert.equal(templateParam('a\n\nb     c'), 'a b   c');
});

test('Mensagem do vendedor leva o nome dele', async () => {
  const s = await service.start('loja-fila');
  await service.handover('loja-fila', s.token);
  await service.setMode(shop.id, s.conversation.id, 'human', v1.id, seller(v1));
  const d = await service.agentReply(shop.id, s.conversation.id, v1.id, { content: 'Boa tarde!', clientMessageId: require('node:crypto').randomUUID() }, seller(v1));
  assert.equal(d.messages.find((m) => m.role === 'agent').authorName, 'Ana');
  const pub = await service.read('loja-fila', s.token);
  assert.equal(pub.messages.find((m) => m.role === 'agent').authorName, 'Ana');
  assert(pub.messages.some((m) => m.role === 'system' && m.content.startsWith('Ana assumiu o atendimento')));
});
