const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { WhatsappService, phoneVariants, messageText } = require('../dist/src/whatsapp/whatsapp.service');
const { TokenEncryptionService } = require('../dist/src/common/crypto/token-encryption.service');
const { normalizeSocialLinks, socialUrls } = require('../dist/src/settings/social-links');
const { StorefrontService } = require('../dist/src/storefront/storefront.service');
let db, server, prisma, wa, shop, owner, seller, U, calls = [];
const SECRET = 'app-secret-123';
before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55490, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55490/postgres', max: 1 }) }); await prisma.$connect();
  wa = new WhatsappService(prisma, new TokenEncryptionService({ get: () => 'chave-de-teste-bem-longa' }));
  shop = await prisma.dealership.create({ data: { name: 'Chronos', slug: 'chronos-wa', crmSettings: { roundRobin: true, slaHours: 2 } } });
  owner = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Dona', email: 'dona@wa.invalid', passwordHash: 'x' } });
  seller = await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'Vini', email: 'vini@wa.invalid', passwordHash: 'x' } });
  U = { userId: owner.id, dealershipId: shop.id, role: 'owner' };
  wa.fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('/messages')) return { ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.out${calls.length}` }] }) };
    return { ok: true, status: 200, json: async () => ({ display_phone_number: '+55 85 99999-0000', verified_name: 'Chronos Auto' }) };
  };
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });

const payload = (msgs, statuses) => ({ object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
  messaging_product: 'whatsapp', metadata: { display_phone_number: '5585999990000', phone_number_id: '1234567890' },
  ...(msgs ? { contacts: msgs.map((m) => ({ wa_id: m.from, profile: { name: m.name } })), messages: msgs.map(({ name, ...m }) => m) } : {}),
  ...(statuses ? { statuses } : {}),
} }] }] });
const signed = (body, secret = SECRET) => { const raw = Buffer.from(JSON.stringify(body)); return [raw, 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'), JSON.parse(raw)]; };

test('Números brasileiros com e sem o 9 e tipos de mensagem', () => {
  assert.ok(phoneVariants('558591234567').includes('85991234567'));
  assert.ok(phoneVariants('5585991234567').includes('8591234567'));
  assert.deepEqual(messageText({ type: 'image', image: { caption: 'essa aqui' } }), { type: 'image', body: '[Foto] essa aqui' });
  assert.equal(messageText({ type: 'audio', audio: { voice: true } }).body, '[Áudio de voz]');
});

test('Redes sociais: link ou @ ficam limpos', () => {
  const s = normalizeSocialLinks({ whatsapp: '+55 (85) 99999-8888', instagram: 'https://www.instagram.com/chronosauto/?hl=pt', facebook: 'facebook.com/chronosauto', tiktok: '@chronos.auto', youtube: 'chronos', website: 'chronosauto.com.br' });
  assert.deepEqual(s, { whatsapp: '85999998888', instagram: 'chronosauto', facebook: 'chronosauto', tiktok: 'chronos.auto', youtube: '@chronos', website: 'https://chronosauto.com.br' });
  assert.throws(() => normalizeSocialLinks({ instagram: 'https://facebook.com/x' }), /não parece ser do Instagram/);
  assert.throws(() => normalizeSocialLinks({ whatsapp: '123' }), /WhatsApp da loja inválido/);
  assert.equal(socialUrls(s).tiktok, 'https://tiktok.com/@chronos.auto');
});

test('Site mostra as redes da loja', async () => {
  await prisma.dealership.update({ where: { id: shop.id }, data: { socialLinks: { instagram: 'chronosauto', whatsapp: '85999998888' } } });
  const d = await new StorefrontService(prisma).getDealership('chronos-wa');
  assert.equal(d.social.instagram, 'https://instagram.com/chronosauto'); assert.equal(d.whatsapp, '85999998888');
});

test('Conectar: salva criptografado, testa na Meta e devolve o endereço do webhook', async () => {
  await assert.rejects(wa.saveAccount({ ...U, role: 'seller', userId: seller.id }, { phoneNumberId: '1234567890', accessToken: 't', appSecret: 's' }), /dono/);
  const a = await wa.saveAccount(U, { phoneNumberId: '1234567890', wabaId: '999', accessToken: 'EAAtoken', appSecret: SECRET });
  assert.equal(a.status, 'connected'); assert.equal(a.verifiedName, 'Chronos Auto'); assert.ok(a.verifyToken.length >= 20);
  const row = await prisma.whatsappAccount.findUnique({ where: { dealershipId: shop.id } });
  assert.ok(!row.accessTokenEnc.includes('EAAtoken'));
  assert.match(calls[0].init.headers.Authorization, /Bearer EAAtoken/);
  assert.equal(await wa.verify('subscribe', a.verifyToken, '42'), '42');
  await assert.rejects(wa.verify('subscribe', 'errado', '42'), /não confere/);
  const s = await wa.account({ ...U, role: 'seller', userId: seller.id });
  assert.equal(s.verifyToken, undefined);
});

test('Mensagem recebida vira lead, tarefa e histórico; repetida não duplica; assinatura errada é recusada', async () => {
  const [raw, sig, body] = signed(payload([{ from: '558591234567', id: 'wamid.in1', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Oi, a CG 160 ainda tá disponível?' }, name: 'Carlos Lima' }]));
  await assert.rejects(wa.receive(raw, 'sha256=' + 'a'.repeat(64), body), /Assinatura inválida/);
  const r = await wa.receive(raw, sig, body);
  assert.equal(r.received, 1);
  const again = await wa.receive(raw, sig, body);
  assert.equal(again.received, 0);
  const lead = await prisma.lead.findFirst({ where: { dealershipId: shop.id }, include: { customer: true } });
  assert.equal(lead.source, 'whatsapp'); assert.equal(lead.customer.name, 'Carlos Lima'); assert.equal(lead.customer.phone, '85991234567');
  assert.equal(lead.assignedSellerId, seller.id);
  const tasks = await prisma.crmTask.findMany({ where: { leadId: lead.id } });
  assert.equal(tasks.length, 1); assert.match(tasks[0].title, /Responder Carlos \(WhatsApp\)/);
  // segunda mensagem do mesmo número (agora com o 9) cai no mesmo lead e não cria outra tarefa
  const [raw2, sig2, body2] = signed(payload([{ from: '5585991234567', id: 'wamid.in2', timestamp: String(Math.floor(Date.now() / 1000)), type: 'image', image: { caption: 'minha moto pra troca' }, name: 'Carlos Lima' }]));
  await wa.receive(raw2, sig2, body2);
  assert.equal(await prisma.lead.count({ where: { dealershipId: shop.id } }), 1);
  assert.equal(await prisma.crmTask.count({ where: { leadId: lead.id } }), 1);
  assert.equal((await wa.unread(U)).count, 2);
});

test('Responder pelo sistema dentro de 24h; status de leitura; fora da janela é bloqueado', async () => {
  const lead = await prisma.lead.findFirst({ where: { dealershipId: shop.id } });
  const conv = await wa.conversation(U, lead.id);
  assert.equal(conv.items.length, 2); assert.ok(conv.windowOpenUntil); assert.equal(conv.connected, true);
  assert.equal((await wa.unread(U)).count, 0);
  const after = await wa.send({ userId: seller.id, dealershipId: shop.id, role: 'seller' }, lead.id, 'Oi Carlos! Tá sim, por R$ 15.900. Quer vir ver?');
  const out = after.items.at(-1);
  assert.equal(out.direction, 'out'); assert.equal(out.status, 'sent');
  const sent = JSON.parse(calls.at(-1).init.body);
  assert.equal(sent.to, '5585991234567'); assert.equal(sent.text.body, 'Oi Carlos! Tá sim, por R$ 15.900. Quer vir ver?');
  const l = await prisma.lead.findUnique({ where: { id: lead.id } });
  assert.equal(l.stage, 'contacted'); assert.ok(l.firstContactAt);
  assert.equal(await prisma.crmTask.count({ where: { leadId: lead.id, status: 'open' } }), 0);
  const msg = await prisma.whatsappMessage.findFirst({ where: { direction: 'out' } });
  const [raw, sig, body] = signed(payload(null, [{ id: msg.waMessageId, status: 'read', timestamp: '1', recipient_id: '5585991234567' }]));
  await wa.receive(raw, sig, body);
  const [rawD, sigD, bodyD] = signed(payload(null, [{ id: msg.waMessageId, status: 'delivered', timestamp: '1', recipient_id: '5585991234567' }]));
  await wa.receive(rawD, sigD, bodyD);
  assert.equal((await prisma.whatsappMessage.findUnique({ where: { id: msg.id } })).status, 'read');
  // outro vendedor não vê a conversa
  const other = await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'Outro', email: 'outro@wa.invalid', passwordHash: 'x' } });
  await assert.rejects(wa.conversation({ userId: other.id, dealershipId: shop.id, role: 'seller' }, lead.id), /não encontrado/);
  // janela fechada
  await prisma.whatsappMessage.updateMany({ where: { direction: 'in' }, data: { sentAt: new Date(Date.now() - 2 * 86400000) } });
  await assert.rejects(wa.send(U, lead.id, 'oi'), /janela de 24 horas/);
});

test('Número de outra conta é ignorado', async () => {
  const body = payload([{ from: '5511999990000', id: 'wamid.x', timestamp: '1', type: 'text', text: { body: 'oi' } }]);
  body.entry[0].changes[0].value.metadata.phone_number_id = '000';
  const r = await wa.receive(Buffer.from(JSON.stringify(body)), undefined, body);
  assert.equal(r.ignored, true);
});
