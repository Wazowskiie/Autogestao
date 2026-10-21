const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const argon2 = require('argon2');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { StorageService } = require('../dist/src/vehicle-details/storage.service');
const { SettingsService } = require('../dist/src/settings/settings.service');
const { InterestRatesService } = require('../dist/src/interest-rates/interest-rates.service');

let db, server, prisma, settings, shop, other, owner, seller;
const actor = (u) => ({ userId: u.id, dealershipId: u.dealershipId, role: u.role });
const config = { get: (k) => process.env[k] };
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

before(async () => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cfg-'));
  delete process.env.TOKEN_ENCRYPTION_KEY;
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55471, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55471/postgres', max: 1 }) }); await prisma.$connect();
  settings = new SettingsService(prisma, new StorageService(), config);
  shop = await prisma.dealership.create({ data: { name: 'Mundo das Motos', slug: 'mdm' } });
  other = await prisma.dealership.create({ data: { name: 'Outra', slug: 'outra', cnpj: '11222333000181' } });
  owner = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Isabel', email: 'i@x.invalid', passwordHash: await argon2.hash('senhaAntiga1') } });
  seller = await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'João', email: 'j@x.invalid', passwordHash: 'x' } });
  await new InterestRatesService(prisma).findAll(shop.id); // cria a tabela padrão (4x a 18x)
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });

test('Dono edita os dados da loja; vendedor não pode', async () => {
  const r = await settings.updateDealership(actor(owner), { name: 'Mundo das Motos LTDA', cnpj: '12.345.678/0001-95', phone: '(11) 98888-7777', state: 'sp' });
  assert.equal(r.dealership.name, 'Mundo das Motos LTDA'); assert.equal(r.dealership.cnpj, '12345678000195');
  assert.equal(r.dealership.phone, '11988887777'); assert.equal(r.dealership.state, 'SP');
  await assert.rejects(settings.updateDealership(actor(owner), { cnpj: '11.222.333/0001-81' }), /já está em uso/);
  await assert.rejects(settings.updateDealership(actor(seller), { name: 'Hack' }), /Só o dono/);
});

test('Vendedor não recebe os dados fiscais; token nunca é devolvido', async () => {
  const s = await settings.get(actor(seller));
  assert.equal(s.canEdit, false); assert.equal(s.fiscal, null);
  const o = await settings.get(actor(owner));
  assert.equal(o.fiscal.configured, false); assert.equal(JSON.stringify(o).includes('Encrypted'), false);
});

test('Logo: envia, troca (apaga a antiga) e remove', async () => {
  const file = { originalname: 'logo.png', mimetype: 'image/png', size: PNG.length, buffer: PNG };
  const a = await settings.uploadImage(actor(owner), 'logo', file);
  assert.match(a.dealership.logoUrl, /\/files\/.+\/loja\/.+\.png$/);
  const b = await settings.uploadImage(actor(owner), 'logo', file);
  assert.notEqual(a.dealership.logoUrl, b.dealership.logoUrl);
  const oldPath = path.join(process.env.STORAGE_DIR, 'public', a.dealership.logoUrl.split('/files/')[1]);
  assert.equal(fs.existsSync(oldPath), false);
  await assert.rejects(settings.uploadImage(actor(owner), 'logo', { ...file, mimetype: 'application/pdf', originalname: 'x.pdf' }), /não é uma foto/);
  const c = await settings.removeImage(actor(owner), 'logo');
  assert.equal(c.dealership.logoUrl, null);
});

test('Trocar senha confere a senha atual', async () => {
  await assert.rejects(settings.changePassword(actor(owner), { currentPassword: 'errada', newPassword: 'novaSenha123' }), /senha atual está errada/);
  await settings.changePassword(actor(owner), { currentPassword: 'senhaAntiga1', newPassword: 'novaSenha123' });
  const u = await prisma.user.findUnique({ where: { id: owner.id } });
  assert.equal(await argon2.verify(u.passwordHash, 'novaSenha123'), true);
  const r = await settings.updateMe(actor(owner), { name: 'Isabel Andrade' });
  assert.equal(r.me.name, 'Isabel Andrade');
});

test('Nota fiscal: token criptografado, em branco mantém o atual', async () => {
  const base = { cnpj: '12345678000195', ambiente: 'homologacao', logradouro: 'Rua A', numero: '10', bairro: 'Centro', municipio: 'São Paulo', uf: 'sp', cep: '01001-000' };
  await assert.rejects(settings.updateFiscal(actor(owner), base), /Informe o token/);
  await assert.rejects(settings.updateFiscal(actor(owner), { ...base, token: 'abc' }), /TOKEN_ENCRYPTION_KEY/);
  process.env.TOKEN_ENCRYPTION_KEY = 'chave-de-teste-bem-longa';
  const r = await settings.updateFiscal(actor(owner), { ...base, token: 'meu-token-focus' });
  assert.equal(r.fiscal.configured, true); assert.equal(r.fiscal.uf, 'SP'); assert.equal(r.fiscal.cep, '01001000');
  const d1 = await prisma.dealership.findUnique({ where: { id: shop.id } });
  assert.notEqual(d1.focusNfeTokenEncrypted, 'meu-token-focus');
  await settings.updateFiscal(actor(owner), { ...base, ambiente: 'producao' });
  const d2 = await prisma.dealership.findUnique({ where: { id: shop.id } });
  assert.equal(d2.focusNfeTokenEncrypted, d1.focusNfeTokenEncrypted); assert.equal(d2.focusNfeAmbiente, 'producao');
  await assert.rejects(settings.updateFiscal(actor(seller), { ...base, token: 'x' }), /Só o dono/);
});

test('Faixas de juros: cria 19x a 21x, bloqueia sobreposição, edita e apaga', async () => {
  const start = await settings.listBands(actor(owner));
  assert.equal(start.at(-1).maxInstallments, 18);
  const list = await settings.createBand(actor(owner), { minInstallments: 19, maxInstallments: 21, rate: 95 });
  const nova = list.find((b) => b.minInstallments === 19);
  assert.equal(Number(nova.rate), 95);
  await assert.rejects(settings.createBand(actor(owner), { minInstallments: 18, maxInstallments: 20, rate: 90 }), /cruza com a de 16x a 18x/);
  await assert.rejects(settings.createBand(actor(owner), { minInstallments: 25, maxInstallments: 22, rate: 90 }), /menor ou igual/);
  await settings.updateBand(actor(owner), nova.id, { minInstallments: 19, maxInstallments: 24, rate: 110 });
  const rate = await new InterestRatesService(prisma).getRateForInstallments(shop.id, 22);
  assert.equal(Number(rate), 110); // já vale na venda
  await assert.rejects(settings.createBand(actor(seller), { minInstallments: 30, maxInstallments: 32, rate: 1 }), /Só o dono/);
  const after = await settings.deleteBand(actor(owner), nova.id);
  assert.equal(after.length, start.length);
  await assert.rejects(settings.updateBand(actor(owner), nova.id, { minInstallments: 1, maxInstallments: 2, rate: 1 }), /não encontrada/);
});
