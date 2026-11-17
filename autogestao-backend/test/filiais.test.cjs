// Filiais: cadastro, veículos ligados à filial, filtro e isolamento entre revendas
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { VehiclesService } = require('../dist/src/vehicles/vehicles.service');
const { UnitsService, UnitsController } = require('../dist/src/units/units.module');
const { ROLES_KEY } = require('../dist/src/common/decorators/roles.decorator');

let db, server, prisma, vehicles, units, shop, other, centro, sul, alheia;
const car = (extra = {}) => ({ brand: 'Honda', model: 'CG', year: 2024, km: 0, type: 'moto', cost: 10000, price: 15000, ...extra });

before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55467, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55467/postgres', max: 1 }) }); await prisma.$connect();
  vehicles = new VehiclesService(prisma); units = new UnitsService(prisma);
  shop = await prisma.dealership.create({ data: { name: 'Loja', slug: 'loja-f' } });
  other = await prisma.dealership.create({ data: { name: 'Outra', slug: 'outra-f' } });
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });

test('Cadastra filiais e não aceita nome repetido na mesma loja', async () => {
  centro = await units.create(shop.id, { name: 'Loja Centro', address: 'Av. Principal, 100' });
  sul = await units.create(shop.id, { name: 'Loja Zona Sul' });
  alheia = await units.create(other.id, { name: 'Loja Centro' }); // mesmo nome em outra revenda pode
  await assert.rejects(() => units.create(shop.id, { name: 'Loja Centro' }), /Já existe/);
  await assert.rejects(() => units.update(shop.id, alheia.id, { name: 'X' }), /não encontrada/);
});

test('Veículo ligado à filial, filtro por filial e "sem filial"', async () => {
  const v1 = await vehicles.create(shop.id, null, car({ unitId: centro.id, price: 20000 }));
  await vehicles.create(shop.id, null, car({ unitId: centro.id, price: 30000 }));
  const v3 = await vehicles.create(shop.id, null, car({ unitId: sul.id }));
  await vehicles.create(shop.id, null, car());
  await assert.rejects(() => vehicles.create(shop.id, null, car({ unitId: alheia.id })), /Filial não encontrada/);

  const list = await units.list(shop.id);
  const byName = Object.fromEntries(list.map((u) => [u.name, u]));
  assert.deepEqual([byName['Loja Centro'].available, byName['Loja Centro'].availableValue], [2, 50000]);
  assert.equal(byName['Loja Zona Sul'].available, 1);

  assert.equal((await vehicles.findAll(shop.id, { unitId: centro.id })).total, 2);
  assert.equal((await vehicles.findAll(shop.id, { unitId: 'none' })).total, 1);
  assert.equal((await vehicles.findAll(shop.id, { unitId: centro.id })).items[0].unit.name, 'Loja Centro');

  // Trocar de filial e tirar da filial
  await vehicles.update(shop.id, v3.id, { unitId: centro.id });
  assert.equal((await vehicles.findOne(shop.id, v3.id)).unitId, centro.id);
  await vehicles.update(shop.id, v3.id, { unitId: '' });
  assert.equal((await vehicles.findOne(shop.id, v3.id)).unitId, null);
  await assert.rejects(() => vehicles.update(shop.id, v1.id, { unitId: alheia.id }), /Filial não encontrada/);
});

test('Excluir a filial mantém os veículos, sem filial', async () => {
  await units.remove(shop.id, sul.id);
  assert.equal((await vehicles.findAll(shop.id, { unitId: 'none' })).total, 2);
  assert.equal((await vehicles.findAll(shop.id, {})).total, 4);
});

test('Só dono/admin cadastram filiais; todos da loja podem listar', () => {
  const r = (m) => Reflect.getMetadata(ROLES_KEY, UnitsController.prototype[m]);
  for (const m of ['create', 'update', 'remove']) assert.deepEqual(r(m), ['owner', 'admin']);
  assert.equal(r('list'), undefined);
});
