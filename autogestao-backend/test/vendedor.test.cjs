// Painel do vendedor: o que o vendedor pode ver e fazer (regras no servidor)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { SalesService } = require('../dist/src/sales/sales.service');
const { VehiclesService } = require('../dist/src/vehicles/vehicles.service');
const { SellersService } = require('../dist/src/sellers/sellers.service');
const { CustomersService } = require('../dist/src/customers/customers.service');
const { PromissoryNotesService } = require('../dist/src/promissory-notes/promissory-notes.service');
const { ROLES_KEY } = require('../dist/src/common/decorators/roles.decorator');

let db, server, prisma, sales, vehicles, sellers, customers, notes, shop, owner, ana, beto, moto1, moto2, cliAna, cliBeto, saleAna, saleBeto;
const asUser = (u) => ({ userId: u.id, dealershipId: shop.id, role: u.role });

before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55466, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55466/postgres', max: 1 }) }); await prisma.$connect();
  sales = new SalesService(prisma); vehicles = new VehiclesService(prisma); sellers = new SellersService(prisma);
  customers = new CustomersService(prisma); notes = new PromissoryNotesService(prisma);
  shop = await prisma.dealership.create({ data: { name: 'Loja', slug: 'loja-v' } });
  const user = (role, name, extra = {}) => prisma.user.create({ data: { dealershipId: shop.id, role, name, email: `${name}@x.invalid`, passwordHash: 'x', ...extra } });
  owner = await user('owner', 'dono');
  ana = await user('seller', 'ana', { commissionRate: 2 });
  beto = await user('seller', 'beto', { commissionRate: 3 });
  const moto = (model) => prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model, year: 2026, type: 'moto', price: 20000, cost: 15000 } });
  moto1 = await moto('CG'); moto2 = await moto('Biz');
  cliAna = await prisma.customer.create({ data: { dealershipId: shop.id, name: 'Cliente da Ana', createdById: ana.id } });
  cliBeto = await prisma.customer.create({ data: { dealershipId: shop.id, name: 'Cliente do Beto', createdById: beto.id } });
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });

test('Estoque: vendedor consulta sem ver o custo; dono continua vendo', async () => {
  const list = await vehicles.findAll(shop.id, {}, asUser(ana));
  assert.equal(list.items.length, 2);
  assert.ok(list.items.every((v) => v.cost === null && Number(v.price) === 20000));
  assert.equal((await vehicles.findOne(shop.id, moto1.id, asUser(ana))).cost, null);
  assert.equal(Number((await vehicles.findOne(shop.id, moto1.id, asUser(owner))).cost), 15000);
});

test('Venda do vendedor: custo vem do veículo, comissão vem do cadastro e a resposta não traz lucro', async () => {
  saleAna = await sales.create(shop.id, ana.id, {
    vehicleId: moto1.id, customerId: cliAna.id, price: 20000, cost: 1, commissionAmount: 9999,
    payments: [{ method: 'pix', amount: 20000 }],
  }, asUser(ana));
  assert.equal(saleAna.cost, null); assert.equal(saleAna.profit, null); assert.equal(saleAna.margin, null);
  assert.equal(saleAna.vehicle.cost, null);
  const stored = await prisma.sale.findUnique({ where: { id: saleAna.id } });
  assert.equal(Number(stored.cost), 15000);            // ignorou o "1" enviado
  assert.equal(Number(stored.commissionAmount), 400);  // 2% de 20.000, ignorou 9999
  assert.equal(Number(stored.profit), 20000 - 15000 - 400);
  await assert.rejects(() => sales.create(shop.id, ana.id, { vehicleId: moto2.id, customerId: cliAna.id, price: 20000, cost: 0, sellerId: beto.id }, asUser(ana)), /somente para si/);
  saleBeto = await sales.create(shop.id, owner.id, { vehicleId: moto2.id, customerId: cliBeto.id, price: 20000, cost: 15000, sellerId: beto.id, payments: [{ method: 'promissory', amount: 20000 }] }, asUser(owner));
});

test('Vendas: vendedor vê só as dele, sem custo/lucro; resumo só com a própria comissão', async () => {
  const mine = await sales.findAll(shop.id, {}, asUser(ana));
  assert.deepEqual(mine.items.map((s) => s.id), [saleAna.id]);
  assert.equal(mine.items[0].profit, null);
  await assert.rejects(() => sales.findOne(shop.id, saleBeto.id, asUser(ana)), /não encontrada/);
  const sum = await sales.summary(shop.id, undefined, asUser(ana));
  assert.deepEqual({ count: sum.count, rev: sum.totalRevenue, profit: sum.totalProfit, cost: sum.totalCost, com: sum.totalCommission }, { count: 1, rev: 20000, profit: null, cost: null, com: 400 });
  const all = await sales.summary(shop.id, undefined, asUser(owner));
  assert.equal(all.count, 2); assert.ok(all.totalProfit > 0);
});

test('Vendedores: cada vendedor enxerga só os próprios números', async () => {
  const mine = await sellers.findAll(shop.id, undefined, asUser(ana));
  assert.deepEqual(mine.map((s) => s.id), [ana.id]);
  assert.equal(mine[0].metrics.commission, 400); assert.equal(mine[0].metrics.totalProfit, null);
  await assert.rejects(() => sellers.findOne(shop.id, beto.id, asUser(ana)), /não encontrado/);
  assert.equal((await sellers.findAll(shop.id, undefined, asUser(owner))).length, 2);
});

test('Clientes e promissórias: só os do próprio vendedor', async () => {
  const cs = await customers.findAll(shop.id, {}, asUser(ana));
  assert.deepEqual(cs.items.map((c) => c.id), [cliAna.id]);
  const dto = { saleId: saleBeto.id, customerId: cliBeto.id, totalAmount: 20000, totalInstallments: 4, firstDueDate: '2027-01-10' };
  await assert.rejects(() => notes.create(shop.id, dto, asUser(ana)), /Venda não encontrada/);
  const created = await notes.create(shop.id, dto, asUser(beto));
  assert.equal(created.length, 4); assert.equal(created[0].sale.profit, null);
  const total = (await notes.findAll(shop.id, {}, asUser(owner))).total;
  assert.equal(total, 4);
  const ofAna = await notes.findAll(shop.id, {}, asUser(ana));
  assert.equal(ofAna.total, 0); assert.equal(ofAna.summary.pendingCount + ofAna.summary.overdueCount + ofAna.summary.paidCount, 0);
  const ofBeto = await notes.findAll(shop.id, {}, asUser(beto));
  assert.equal(ofBeto.total, total); assert.equal(ofBeto.items[0].sale.profit, null); assert.equal(ofBeto.items[0].sale.vehicle.cost, null);
});

test('Dono troca a senha do vendedor: a senha nova vale e as sessões antigas caem', async () => {
  const argon2 = require('argon2');
  await prisma.refreshToken.create({ data: { userId: beto.id, tokenHash: 'sessao-antiga', expiresAt: new Date(Date.now() + 86400000) } });
  const updated = await sellers.update(shop.id, beto.id, { password: 'NovaSenha#2026', jobTitle: 'Vendedor Sênior' });
  assert.equal(updated.jobTitle, 'Vendedor Sênior'); assert.equal(updated.passwordHash, undefined);
  const stored = await prisma.user.findUnique({ where: { id: beto.id } });
  assert.ok(await argon2.verify(stored.passwordHash, 'NovaSenha#2026'));
  assert.equal((await prisma.refreshToken.findFirst({ where: { tokenHash: 'sessao-antiga' } })).revoked, true);
  // sem senha no pedido, a senha continua a mesma
  await sellers.update(shop.id, beto.id, { phone: '85999990000' });
  assert.equal((await prisma.user.findUnique({ where: { id: beto.id } })).passwordHash, stored.passwordHash);
});

test('Rotas de gestão ficam fechadas para o vendedor', () => {
  const roles = (file, cls, method) => {
    const C = require(`../dist/src/${file}`)[cls];
    return Reflect.getMetadata(ROLES_KEY, method ? C.prototype[method] : C);
  };
  const managers = ['owner', 'admin'];
  for (const [file, cls] of [
    ['financial/financial.controller', 'FinancialController'], ['vehicle-details/vehicle-details.controller', 'VehicleDetailsController'],
    ['parts/parts.controller', 'PartsController'], ['ads/ads.controller', 'AdsController'], ['renave/renave.controller', 'RenaveController'],
    ['fiscal/focus-nfe/focus-nfe.controller', 'FocusNfeController'],
  ]) {
    const C = require(`../dist/src/${file}`)[cls];
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, C), managers, `${cls} só para gestores`);
    for (const m of Object.getOwnPropertyNames(C.prototype)) {
      const r = Reflect.getMetadata(ROLES_KEY, C.prototype[m]);
      if (r) assert.ok(!r.includes('seller'), `${cls}.${m} não pode liberar vendedor`);
    }
  }
  assert.deepEqual(roles('vehicles/vehicles.controller', 'VehiclesController', 'create'), managers);
  assert.deepEqual(roles('vehicles/vehicles.controller', 'VehiclesController', 'update'), managers);
  assert.deepEqual(roles('promissory-notes/promissory-notes.controller', 'PromissoryNotesController', 'pay'), managers);
  assert.ok(roles('sales/sales.controller', 'SalesController', 'create').includes('seller'));
});
