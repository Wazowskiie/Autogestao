const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const { createHmac } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PlansService } = require('../dist/src/plans/plans.service');
const { AutentiqueClient, documentIdsFromEvent } = require('../dist/src/esign/autentique.client');
const { EsignService, toWhatsapp } = require('../dist/src/esign/esign.service');

let db, server, prisma, esign, client, shop, owner, seller, sale, otherShop;
const calls = [];
const PDF = Buffer.from('%PDF-1.4\n%fake\n');
// Autentique de mentira: guarda os pedidos e responde como a API real
const created = {};
let docs = 0, signedIds = [], rejectedIds = [], deleted = [], resent = [];
const DOC = (n) => `doc-${String(n).padStart(4, '0')}-aaaa-bbbb-cccc`;

before(async () => {
  Object.assign(process.env, { AUTENTIQUE_TOKEN: 'tok-123', AUTENTIQUE_WEBHOOK_SECRET: 'segredo' });
  delete process.env.AUTENTIQUE_SANDBOX;
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55471, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55471/postgres', max: 1 }) }); await prisma.$connect();
  const plans = new PlansService(prisma); await plans.onModuleInit();
  client = new AutentiqueClient();
  client.fetchImpl = async (url, init) => {
    assert.equal(url, 'https://api.autentique.com.br/v2/graphql');
    assert.equal(init.headers.Authorization, 'Bearer tok-123');
    const json = (o, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(o) });
    if (init.body instanceof FormData) {
      const ops = JSON.parse(init.body.get('operations'));
      const map = JSON.parse(init.body.get('map'));
      const file = init.body.get('file');
      calls.push({ kind: 'createDocument', ops, map, file: Buffer.from(await file.arrayBuffer()) });
      const id = DOC(++docs);
      created[id] = ops.variables.signers;
      return json({ data: { createDocument: { id, signatures: [
        { public_id: `${id}-owner`, name: 'Chronos', email: 'conta@chronos.tech', action: null },
        ...ops.variables.signers.map((s, i) => ({ public_id: `${id}-s${i}`, name: s.name ?? null, email: s.email ?? null, action: { name: s.action } })),
      ] } } });
    }
    const { query, variables } = JSON.parse(init.body);
    calls.push({ kind: query.match(/(createFolder|document\(|deleteDocument|resendSignatures)/)?.[1] ?? 'other', query, variables });
    if (query.includes('createFolder')) return json({ data: { createFolder: { id: 'folder-1' } } });
    if (query.includes('deleteDocument')) { deleted.push(variables.id); return json({ data: { deleteDocument: true } }); }
    if (query.includes('resendSignatures')) { resent.push(...variables.ids); return json({ data: { resendSignatures: true } }); }
    if (query.includes('document(id')) {
      const id = variables.id;
      const signers = created[id] ?? [];
      const sigs = signers.map((s, i) => {
        const pid = `${id}-s${i}`;
        return { public_id: pid, name: s.name ?? null, email: s.email ?? null, action: { name: s.action },
          signed: signedIds.includes(pid) ? { created_at: '2026-11-02T16:00:00-03:00' } : null,
          rejected: rejectedIds.includes(pid) ? { created_at: '2026-11-02T16:05:00-03:00' } : null };
      });
      const allSigned = sigs.length && sigs.every((s) => s.signed);
      return json({ data: { document: { id, files: { original: `https://files.autentique/${id}/original.pdf`, signed: allSigned ? `https://files.autentique/${id}/assinado.pdf` : null },
        signatures: [{ public_id: `${id}-owner`, name: 'Chronos', email: 'conta@chronos.tech', action: null, signed: null, rejected: null }, ...sigs] } } });
    }
    return json({ errors: [{ message: 'consulta desconhecida' }] });
  };
  esign = new EsignService(prisma, client, plans);
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
  { name: 'Juarez', email: '', phone: '(85) 98955-7980', role: 'buyer', channel: 'whatsapp' },
  { name: 'Dona', email: 'Loja@x.com', role: 'store', channel: 'email' },
  { name: 'Testemunha', email: 't@x.com', role: 'witness', channel: 'email' },
];
const file = { buffer: PDF, mimetype: 'application/pdf', size: PDF.length };
const hmac = (obj) => { const raw = Buffer.from(JSON.stringify(obj)); return [raw, createHmac('sha256', 'segredo').update(raw).digest('hex')]; };

test('WhatsApp vira +55 e acha o documento nos avisos', () => {
  assert.equal(toWhatsapp('(85) 98955-7980'), '+5585989557980');
  assert.equal(toWhatsapp('5585989557980'), '+5585989557980');
  assert.equal(toWhatsapp('123'), null);
  assert.deepEqual(documentIdsFromEvent({ event: { type: 'document.finished', data: { object: { id: DOC(1) } } } }), [DOC(1)]);
  assert.deepEqual(documentIdsFromEvent({ event: { type: 'signature.accepted', data: { document: DOC(2) } } }), [DOC(2)]);
});

test('Envia: cria a pasta da loja e o documento (multipart) em modo de teste, com WhatsApp e testemunha', async () => {
  const s = await esign.create(U(), sale.id, { printId: 'contract', title: 'Contrato de venda', signers }, file);
  assert.equal(s.status, 'waiting'); assert.equal(s.externalId, DOC(1)); assert.ok(s.sentAt);
  assert.deepEqual(calls.map((c) => c.kind), ['createFolder', 'createDocument']);
  const up = calls[1];
  assert.match(up.ops.query, /createDocument\(sandbox: true/);
  assert.match(up.ops.query, /folder_id: \$folder/); assert.equal(up.ops.variables.folder, 'folder-1');
  assert.deepEqual(up.map, { file: ['variables.file'] }); assert.equal(up.ops.variables.file, null);
  assert.equal(up.file.toString(), PDF.toString());
  assert.equal(up.ops.variables.document.name, 'Contrato de venda - 2026/0001');
  assert.match(up.ops.variables.document.message, /Moto Center enviou "Contrato de venda"/);
  assert.deepEqual(up.ops.variables.signers, [
    { name: 'Juarez', phone: '+5585989557980', delivery_method: 'DELIVERY_METHOD_WHATSAPP', action: 'SIGN' },
    { email: 'loja@x.com', action: 'SIGN' },
    { email: 't@x.com', action: 'SIGN_AS_A_WITNESS' },
  ]);
  // cada signatário ganhou o id da assinatura (o dono da conta, sem ação, fica de fora)
  assert.deepEqual(s.signers.map((x) => x.publicId), [`${DOC(1)}-s0`, `${DOC(1)}-s1`, `${DOC(1)}-s2`]);
  // a pasta é criada uma vez só
  calls.length = 0;
  await esign.create(U(), sale.id, { printId: 'receipt', title: 'Recibo de venda', signers: signers.slice(1) }, file);
  assert.deepEqual(calls.map((c) => c.kind), ['createDocument']);
});

test('Recusa: não-PDF, contato repetido, WhatsApp sem número, e-mail vazio, outra loja, vendedor em venda alheia', async () => {
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers }, { buffer: Buffer.from('oi'), mimetype: 'application/pdf', size: 2 }), /PDF/);
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers: [signers[1], { ...signers[1], name: 'Outra' }] }, file), /mais de uma vez/);
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers: [{ ...signers[0], phone: '' }] }, file), /WhatsApp/);
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers: [{ ...signers[1], email: '' }] }, file), /e-mail/);
  await assert.rejects(esign.create({ userId: owner.id, dealershipId: otherShop.id, role: 'owner' }, sale.id, { printId: 'contract', title: 'X', signers }, file), /não encontrada/);
  await assert.rejects(esign.list({ userId: seller.id, dealershipId: shop.id, role: 'seller' }, sale.id), /não encontrada/);
});

test('Aviso da Autentique: confere a assinatura do corpo e atualiza quem assinou; finaliza quando todos assinam', async () => {
  const sig = (await esign.list(U(), sale.id)).find((s) => s.printId === 'contract');
  const ev1 = { event: { type: 'signature.accepted', data: { document: DOC(1) } } };
  const [raw1, h1] = hmac(ev1);
  await assert.rejects(esign.webhook(raw1, ev1, 'errado'), /não confere/);
  await assert.rejects(esign.webhook(raw1, ev1, undefined), /não confere/);
  signedIds = [`${DOC(1)}-s0`];
  await esign.webhook(raw1, ev1, h1);
  let now = await prisma.saleSignature.findUnique({ where: { id: sig.id } });
  assert.equal(now.status, 'waiting');
  assert.deepEqual(now.signers.map((s) => s.signed), [true, false, false]);
  assert.equal(now.signers[0].signedAt, '2026-11-02T16:00:00-03:00');
  // enquanto não termina, o link é o do original
  assert.equal((await esign.download(U(), sig.id)).signed, false);
  signedIds = [`${DOC(1)}-s0`, `${DOC(1)}-s1`, `${DOC(1)}-s2`];
  const ev2 = { event: { type: 'document.finished', data: { object: { id: DOC(1) } } } };
  const [raw2, h2] = hmac(ev2);
  await esign.webhook(raw2, ev2, h2);
  now = await prisma.saleSignature.findUnique({ where: { id: sig.id } });
  assert.equal(now.status, 'signed'); assert.ok(now.completedAt);
  const dl = await esign.download(U(), sig.id);
  assert.equal(dl.url, `https://files.autentique/${DOC(1)}/assinado.pdf`); assert.equal(dl.signed, true);
  await assert.rejects(esign.cancel(U(), sig.id), /já foi assinado/);
  // aviso de documento que não é nosso: só ignora
  const ev3 = { event: { type: 'document.finished', data: { object: { id: 'doc-9999-zzzz-zzzz-zzzz' } } } };
  const [raw3, h3] = hmac(ev3);
  assert.deepEqual(await esign.webhook(raw3, ev3, h3), { ok: true });
});

test('Recusa do cliente fica registrada', async () => {
  const sig = (await esign.list(U(), sale.id)).find((s) => s.printId === 'receipt');
  rejectedIds = [`${DOC(2)}-s0`];
  const r = await esign.refresh(U(), sig.id);
  assert.equal(r.status, 'rejected'); assert.equal(r.signers[0].rejected, true);
  rejectedIds = [];
});

test('Reenviar e cancelar', async () => {
  const s = await esign.create(U(), sale.id, { printId: 'promissory', title: 'Promissória', signers: signers.slice(1) }, file);
  signedIds.push(`${s.externalId}-s0`);
  const r = await esign.resend(U(), s.id);
  assert.equal(r.resent, 1); assert.deepEqual(resent, [`${s.externalId}-s1`]);
  const c = await esign.cancel(U(), s.id);
  assert.equal(c.status, 'canceled'); assert.deepEqual(deleted, [s.externalId]);
  await assert.rejects(esign.resend(U(), s.id), /aguardando/);
});

test('Limite do mês do plano e plano sem o recurso', async () => {
  const ov = await esign.overview(shop.id);
  assert.equal(ov.configured, true); assert.equal(ov.sandbox, true); assert.equal(ov.planAllows, true); assert.equal(ov.limit, 30);
  await prisma.saleSignature.createMany({ data: Array.from({ length: 30 }, () => ({ dealershipId: shop.id, saleId: sale.id, printId: 'x', title: 'x', signers: [], status: 'waiting' })) });
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers }, file), /30 documentos do mês/);
  await prisma.saleSignature.deleteMany({ where: { printId: 'x' } });
  await prisma.subscription.updateMany({ where: { dealershipId: shop.id }, data: { planId: 'plan-basico' } });
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers }, file), /não faz parte do plano/);
  await prisma.subscription.updateMany({ where: { dealershipId: shop.id }, data: { planId: 'plan-premium' } });
});

test('Erro da Autentique fica registrado; produção desliga o modo de teste', async () => {
  const old = client.fetchImpl;
  client.fetchImpl = async (url, init) => (init.body instanceof FormData ? { ok: true, status: 200, text: async () => JSON.stringify({ errors: [{ message: 'Arquivo inválido' }] }) } : old(url, init));
  await assert.rejects(esign.create(U(), sale.id, { printId: 'duplicata', title: 'Duplicata', signers }, file), /Arquivo inválido/);
  const err = await prisma.saleSignature.findFirst({ where: { printId: 'duplicata' } });
  assert.equal(err.status, 'error'); assert.match(err.lastError, /Arquivo inválido/);
  client.fetchImpl = old;
  process.env.AUTENTIQUE_SANDBOX = 'false';
  calls.length = 0;
  await esign.create(U(), sale.id, { printId: 'envelope', title: 'Envelope', signers: signers.slice(1) }, file);
  assert.match(calls.find((c) => c.kind === 'createDocument').ops.query, /createDocument\(sandbox: false/);
  delete process.env.AUTENTIQUE_SANDBOX;
});

test('Sem chave no servidor, avisa', async () => {
  const tok = process.env.AUTENTIQUE_TOKEN; delete process.env.AUTENTIQUE_TOKEN;
  assert.equal((await esign.overview(shop.id)).configured, false);
  await assert.rejects(esign.create(U(), sale.id, { printId: 'contract', title: 'X', signers }, file), /ainda não foi configurada/);
  process.env.AUTENTIQUE_TOKEN = tok;
});

test('Validação de verdade do pedido (multipart: signers chega como texto JSON)', async () => {
  const { createValidationPipe } = require('../dist/src/common/validation');
  const { CreateSignatureDto } = require('../dist/src/esign/esign.dto');
  const pipe = createValidationPipe();
  const run = (body) => pipe.transform(body, { type: 'body', metatype: CreateSignatureDto });
  const ok = await run({ printId: 'contract', title: 'Contrato de venda', message: 'contrato de venda chronos tech', signers: JSON.stringify([
    { role: 'buyer', name: 'ALEX ANDRADE', email: 'isabel@gmail.com', phone: '85987769655', channel: 'email' },
    { role: 'store', name: 'Isabel Andrade', email: 'loja@gmail.com', phone: '8597769611', channel: 'email' },
    { role: 'witness', name: 'Francisco', email: 't@gmail.com', phone: '85986391797', channel: 'email' },
  ]) });
  assert.equal(ok.signers.length, 3); assert.equal(ok.signers[2].role, 'witness');
  // WhatsApp sem e-mail passa
  await run({ printId: 'contract', title: 'X1', signers: JSON.stringify([{ role: 'buyer', name: 'Juarez', email: '', phone: '85989557980', channel: 'whatsapp' }]) });
  // erros mostram o motivo de verdade, não só "Dados inválidos"
  const bad = await run({ printId: 'contract', title: 'X1', signers: JSON.stringify([{ role: 'buyer', name: 'J', email: 'nao-e-email', channel: 'email', extra: 1 }]) }).catch((e) => e);
  assert.ok(bad.message.some((m) => /nome de quem vai assinar/.test(m)), bad.message);
  assert.ok(bad.message.some((m) => /E-mail de quem vai assinar inválido/.test(m)), bad.message);
  assert.ok(bad.message.some((m) => /extra should not exist/.test(m)), bad.message);
  const vazio = await run({ printId: 'contract', title: 'X1', signers: '[]' }).catch((e) => e);
  assert.ok(vazio.message.some((m) => /Informe quem vai assinar/.test(m)));
});
