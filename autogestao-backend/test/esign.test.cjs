const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { createHmac } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PlansService } = require('../dist/src/plans/plans.service');
const { D4SignClient } = require('../dist/src/esign/d4sign.client');
const { EsignService, toWhatsapp } = require('../dist/src/esign/esign.service');

let db, server, prisma, esign, d4, shop, owner, seller, sale, otherShop;
const calls = [];
const DOC = '11111111-2222-3333-4444-555555555555';
// D4Sign de mentira: guarda as chamadas e responde como a API real
let signedEmails = [], statusId = 3, uploads = 0;
const PDF = Buffer.from('%PDF-1.4\n%fake\n');

before(async () => {
  Object.assign(process.env, { D4SIGN_TOKEN_API: 'tok', D4SIGN_CRYPT_KEY: 'cry', D4SIGN_SAFE_UUID: 'safe-1', D4SIGN_BASE_URL: 'https://sandbox.d4sign.com.br/api/v1', PUBLIC_API_URL: 'https://api.chronos.test', D4SIGN_HMAC_SECRET: 'segredo' });
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55471, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55471/postgres', max: 1 }) }); await prisma.$connect();
  const plans = new PlansService(prisma); await plans.onModuleInit();
  d4 = new D4SignClient();
  d4.fetchImpl = async (url, init) => {
    const u = new URL(url); calls.push({ path: u.pathname.replace('/api/v1', ''), q: Object.fromEntries(u.searchParams), body: init.body ? JSON.parse(init.body) : null });
    const p = u.pathname.replace('/api/v1', '');
    const json = (o, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(o) });
    if (p === '/folders/safe-1/create') return json({ message: 'Folder created', uuid: 'folder-1' });
    if (p === '/documents/safe-1/uploadbinary') return json({ uuid: uploads++ === 0 ? DOC : `${DOC.slice(0, -2)}${String(uploads).padStart(2, '0')}` });
    if (p.endsWith('/createlist') || p.endsWith('/webhooks') || p.endsWith('/sendtosigner') || p.endsWith('/resend')) return json({ message: 'ok' });
    if (p.endsWith('/list')) return json([{ statusId: String(statusId), list: [
      { email: 'cliente@x.com', signed: signedEmails.includes('cliente@x.com') ? '1' : '0', key_signer: 'k1', sign_info: { date_signed_atom: '2026-11-02T15:00:00-03:00' } },
      { email: 'loja@x.com', signed: signedEmails.includes('loja@x.com') ? '1' : '0', key_signer: 'k2' },
    ] }]);
    if (p.endsWith('/download')) return json({ url: 'https://secure.d4sign.com.br/baixar/abc', name: 'x.pdf' });
    if (p.endsWith('/cancel')) return json({ statusId: '6' });
    return json({ message: 'rota desconhecida' }, 404);
  };
  esign = new EsignService(prisma, d4, plans);
  shop = await prisma.dealership.create({ data: { name: 'Moto Center', slug: 'moto-center' } });
  otherShop = await prisma.dealership.create({ data: { name: 'Outra', slug: 'outra' } });
  owner = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Dona', email: 'loja@x.com', passwordHash: 'x' } });
  seller = await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'Vendedor', email: 'v@x.com', passwordHash: 'x' } });
  const v = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model: 'CG', year: 2020, price: 9000, cost: 6000, type: 'moto' } });
  const c = await prisma.customer.create({ data: { dealershipId: shop.id, name: 'Juarez' } });
  sale = await prisma.sale.create({ data: { dealershipId: shop.id, vehicleId: v.id, customerId: c.id, sellerId: owner.id, price: 9000, cost: 6000, contractNumber: '2026/0001' } });
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });

const U = () => ({ userId: owner.id, dealershipId: shop.id, role: 'owner' });
const signers = [
  { name: 'Juarez', email: 'Cliente@x.com', phone: '(85) 98955-7980', role: 'buyer', channel: 'whatsapp' },
  { name: 'Dona', email: 'loja@x.com', role: 'store', channel: 'email' },
];
const file = { buffer: PDF, mimetype: 'application/pdf', size: PDF.length };

test('WhatsApp vira +55', () => {
  assert.equal(toWhatsapp('(85) 98955-7980'), '+5585989557980');
  assert.equal(toWhatsapp('5585989557980'), '+5585989557980');
  assert.equal(toWhatsapp('123'), null);
});

test('Envia: cria a pasta da loja, sobe o PDF, cadastra signatários e webhook, e envia', async () => {
  const s = await esign.create(U(), sale.id, { printId: 'contract', title: 'Contrato de venda', signers }, file);
  assert.equal(s.status, 'waiting'); assert.equal(s.externalId, DOC); assert.ok(s.sentAt);
  assert.deepEqual(calls.map((c) => c.path), ['/folders/safe-1/create', '/documents/safe-1/uploadbinary', `/documents/${DOC}/createlist`, `/documents/${DOC}/webhooks`, `/documents/${DOC}/sendtosigner`]);
  assert.equal(calls[0].q.tokenAPI, 'tok'); assert.equal(calls[0].q.cryptKey, 'cry');
  assert.equal(calls[1].body.uuid_folder, 'folder-1'); assert.equal(calls[1].body.mime_type, 'application/pdf');
  assert.equal(Buffer.from(calls[1].body.base64_binary_file, 'base64').toString(), PDF.toString());
  const list = calls[2].body.signers;
  assert.equal(list[0].email, 'cliente@x.com'); assert.equal(list[0].whatsapp_number, '+5585989557980'); assert.equal(list[0].act, '4');
  assert.equal(list[1].whatsapp_number, undefined);
  assert.equal(calls[3].body.url, 'https://api.chronos.test/api/v1/esign/webhook');
  assert.match(calls[4].body.message, /Moto Center enviou "Contrato de venda"/);
  // a pasta é criada uma vez só
  calls.length = 0;
  await esign.create(U(), sale.id, { printId: 'receipt', title: 'Recibo de venda', signers }, file);
  assert.ok(!calls.some((c) => c.path.includes('/folders/')));
});

test('Recusa: não-PDF, e-mail repetido, WhatsApp sem número, venda de outra loja, vendedor em venda alheia', async () => {
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers }, { buffer: Buffer.from('oi'), mimetype: 'application/pdf', size: 2 }), /PDF/);
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers: [signers[1], { ...signers[1], name: 'Outra' }] }, file), /mais de uma vez/);
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers: [{ ...signers[0], phone: '' }] }, file), /WhatsApp/);
  await assert.rejects(esign.create({ userId: owner.id, dealershipId: otherShop.id, role: 'owner' }, sale.id, { printId: 'contract', title: 'X', signers }, file), /não encontrada/);
  await assert.rejects(esign.list({ userId: seller.id, dealershipId: shop.id, role: 'seller' }, sale.id), /não encontrada/);
});

test('Aviso da D4Sign: confere a HMAC e atualiza quem assinou; finaliza quando todos assinam', async () => {
  const sig = (await esign.list(U(), sale.id)).find((s) => s.printId === 'contract');
  await assert.rejects(esign.webhook({ uuid: DOC, type_post: '4' }, 'sha256=errado'), /não confere/);
  signedEmails = ['cliente@x.com'];
  const hmac = 'sha256=' + createHmac('sha256', 'segredo').update(DOC).digest('hex');
  await esign.webhook({ uuid: DOC, type_post: '4', email: 'cliente@x.com' }, hmac);
  let now = await prisma.saleSignature.findUnique({ where: { id: sig.id } });
  assert.equal(now.status, 'waiting');
  assert.deepEqual(now.signers.map((s) => s.signed), [true, false]);
  signedEmails = ['cliente@x.com', 'loja@x.com']; statusId = 4;
  await esign.webhook({ uuid: DOC, type_post: '1' }, hmac);
  now = await prisma.saleSignature.findUnique({ where: { id: sig.id } });
  assert.equal(now.status, 'signed'); assert.ok(now.completedAt);
  // aviso de documento desconhecido é ignorado
  const other = '99999999-2222-3333-4444-555555555555';
  assert.deepEqual(await esign.webhook({ uuid: other }, 'sha256=' + createHmac('sha256', 'segredo').update(other).digest('hex')), { ok: true });
  await assert.rejects(esign.webhook({ uuid: other }, undefined), /não confere/);
  const dl = await esign.download(U(), sig.id);
  assert.equal(dl.url, 'https://secure.d4sign.com.br/baixar/abc'); assert.equal(dl.signed, true);
  await assert.rejects(esign.cancel(U(), sig.id), /já foi assinado/);
});

test('Limite do mês do plano e plano sem o recurso', async () => {
  const ov = await esign.overview(shop.id);
  assert.equal(ov.configured, true); assert.equal(ov.sandbox, true); assert.equal(ov.planAllows, true); assert.equal(ov.limit, 30);
  // simula 30 envios no mês
  await prisma.saleSignature.createMany({ data: Array.from({ length: 30 }, () => ({ dealershipId: shop.id, saleId: sale.id, printId: 'x', title: 'x', signers: [], status: 'waiting' })) });
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers }, file), /30 documentos do mês/);
  await prisma.subscription.updateMany({ where: { dealershipId: shop.id }, data: { planId: 'plan-basico' } });
  await prisma.saleSignature.deleteMany({ where: { printId: 'x' } });
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers }, file), /não faz parte do plano/);
});

test('Erro da D4Sign fica registrado na assinatura', async () => {
  await prisma.subscription.updateMany({ where: { dealershipId: shop.id }, data: { planId: 'plan-premium' } });
  const old = d4.fetchImpl;
  d4.fetchImpl = async (url, init) => (url.includes('uploadbinary') ? { ok: false, status: 400, text: async () => JSON.stringify({ message: 'Arquivo inválido' }) } : old(url, init));
  await assert.rejects(esign.create(U(), sale.id, { printId: 'promissory', title: 'Promissória', signers }, file), /Arquivo inválido/);
  const err = await prisma.saleSignature.findFirst({ where: { printId: 'promissory' } });
  assert.equal(err.status, 'error'); assert.match(err.lastError, /Arquivo inválido/);
  d4.fetchImpl = old;
  // cancelar um que está aguardando
  const sigs = await esign.list(U(), sale.id);
  const waiting = sigs.find((s) => s.status === 'waiting');
  statusId = 3; signedEmails = [];
  const r = await esign.resend(U(), waiting.id); assert.equal(r.resent, 2);
  const c = await esign.cancel(U(), waiting.id); assert.equal(c.status, 'canceled');
});

test('Sem configuração no servidor, avisa', async () => {
  const tok = process.env.D4SIGN_TOKEN_API; delete process.env.D4SIGN_TOKEN_API;
  assert.equal((await esign.overview(shop.id)).configured, false);
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers }, file), /ainda não foi configurada/);
  process.env.D4SIGN_TOKEN_API = tok;
});
