// "Esqueci minha senha": link por e-mail, uso único, expira, encerra sessões
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const argon2 = require('argon2');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { AuthService } = require('../dist/src/auth/auth.service');

let db, server, prisma, auth, sent, user, shop;
const mail = { enabled: true, isEnabled() { return this.enabled; }, async send(m) { sent.push(m); return true; } };
const linkToken = (m) => /token=([A-Za-z0-9_-]+)/.exec(m.text)[1];

before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55468, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55468/postgres', max: 1 }) }); await prisma.$connect();
  process.env.PUBLIC_APP_URL = 'https://chronosauto.test';
  auth = new AuthService(prisma, { sign: () => 'x' }, { get: () => undefined }, mail);
  shop = await prisma.dealership.create({ data: { name: 'Loja', slug: 'loja-s' } });
  user = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Ana Souza', email: 'ana@loja.test', passwordHash: await argon2.hash('senha-antiga-1') } });
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });
beforeEach(async () => { sent = []; mail.enabled = true; await prisma.passwordResetToken.deleteMany({}); });

test('Manda o link para o e-mail cadastrado (sem diferenciar maiúsculas)', async () => {
  await auth.forgotPassword('ANA@loja.test');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'ana@loja.test');
  assert.match(sent[0].text, /https:\/\/chronosauto\.test\/redefinir-senha\?token=/);
  assert.match(sent[0].html, /Olá, Ana\./);
  const stored = await prisma.passwordResetToken.findFirst();
  assert.notEqual(stored.tokenHash, linkToken(sent[0])); // só o hash fica no banco
});

test('E-mail desconhecido, conta inativa ou envio desligado: não manda nada e não dá erro', async () => {
  await auth.forgotPassword('ninguem@loja.test');
  mail.enabled = false; await auth.forgotPassword('ana@loja.test'); mail.enabled = true;
  await prisma.user.update({ where: { id: user.id }, data: { active: false } });
  await auth.forgotPassword('ana@loja.test');
  await prisma.user.update({ where: { id: user.id }, data: { active: true } });
  assert.equal(sent.length, 0);
  assert.equal(auth.passwordResetAvailable(), true);
});

test('No máximo um e-mail a cada 2 minutos', async () => {
  await auth.forgotPassword('ana@loja.test');
  await auth.forgotPassword('ana@loja.test');
  assert.equal(sent.length, 1);
});

test('Link troca a senha uma vez só e encerra as sessões abertas', async () => {
  await prisma.refreshToken.create({ data: { userId: user.id, tokenHash: 'sessao', expiresAt: new Date(Date.now() + 86400000) } });
  await auth.forgotPassword('ana@loja.test');
  const token = linkToken(sent[0]);
  await auth.resetPassword(token, 'senha-nova-123');
  const u = await prisma.user.findUnique({ where: { id: user.id } });
  assert.ok(await argon2.verify(u.passwordHash, 'senha-nova-123'));
  assert.equal((await prisma.refreshToken.findFirst({ where: { tokenHash: 'sessao' } })).revoked, true);
  await assert.rejects(() => auth.resetPassword(token, 'outra-senha-999'), /não vale mais/);
});

test('Link vencido ou inventado não vale', async () => {
  await auth.forgotPassword('ana@loja.test');
  const token = linkToken(sent[0]);
  await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
  await assert.rejects(() => auth.resetPassword(token, 'senha-nova-456'), /não vale mais/);
  await assert.rejects(() => auth.resetPassword('x'.repeat(43), 'senha-nova-456'), /não vale mais/);
});
