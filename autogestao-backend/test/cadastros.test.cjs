// Comissão por forma de pagamento, CPF do vendedor, recado do cliente e dados do fornecedor
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { SalesService, commissionKind, commissionRateFor } = require('../dist/src/sales/sales.service');
const { SellersService } = require('../dist/src/sellers/sellers.service');
const { CustomersService } = require('../dist/src/customers/customers.service');
const { VehicleDetailsService } = require('../dist/src/vehicle-details/vehicle-details.service');

let db, server, prisma, sales, sellers, customers, details, shop, owner, cliente;

before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55469, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55469/postgres', max: 1 }) }); await prisma.$connect();
  sales = new SalesService(prisma); sellers = new SellersService(prisma); customers = new CustomersService(prisma);
  details = new VehicleDetailsService(prisma);
  shop = await prisma.dealership.create({ data: { name: 'Loja', slug: 'loja-c' } });
  owner = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Dono', email: 'dono@c.invalid', passwordHash: 'x' } });
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });

test('Regra da comissão: financiada, promissórias ou à vista', () => {
  assert.equal(commissionKind(['pix']), 'cash');
  assert.equal(commissionKind(['cash', 'card']), 'cash');
  assert.equal(commissionKind(['pix', 'promissory']), 'promissory');
  assert.equal(commissionKind(['promissory', 'financing']), 'financing');
  assert.equal(commissionKind(['consortium']), 'financing');
  const s = { commissionRate: 2, commissionRatePromissory: 3, commissionRateFinancing: null };
  assert.deepEqual(['cash', 'promissory', 'financing'].map((k) => commissionRateFor(s, k)), [2, 3, 2]); // vazio usa a à vista
});

test('Vendedor com CPF e três comissões; venda usa a comissão certa', async () => {
  const ana = await sellers.create(shop.id, { name: 'Ana', email: 'ana@c.invalid', password: 'Senha#1234', cpf: '025.465.653-62', commissionRate: 2, commissionRatePromissory: 3, commissionRateFinancing: 1.5 });
  assert.equal(ana.cpf, '02546565362');
  assert.deepEqual([ana.commissionRate, ana.commissionRatePromissory, ana.commissionRateFinancing], [2, 3, 1.5]);
  cliente = await customers.create(shop.id, { name: 'Cliente', document: '88702421372' });
  const venda = async (method) => {
    const v = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model: 'Bros', year: 2019, type: 'moto', price: 10000, cost: 7000 } });
    const s = await sales.create(shop.id, owner.id, { vehicleId: v.id, customerId: cliente.id, sellerId: ana.id, price: 10000, cost: 7000, payments: [{ method, amount: 10000 }] });
    return [Number(s.commissionAmount), Number(s.commissionRate)];
  };
  assert.deepEqual(await venda('pix'), [200, 2]);
  assert.deepEqual(await venda('promissory'), [300, 3]);
  assert.deepEqual(await venda('financing'), [150, 1.5]);
  // Limpar uma das comissões: volta a usar a da venda à vista; CPF vazio apaga
  const upd = await sellers.update(shop.id, ana.id, { commissionRateFinancing: null, cpf: '' });
  assert.equal(upd.commissionRateFinancing, null); assert.equal(upd.cpf, null);
  assert.deepEqual(await venda('financing'), [200, 2]);
});

test('Cliente com contato de recado', async () => {
  const c = await customers.create(shop.id, { name: 'Maria', document: '12345678909', address: 'Rua A, 10', altContactName: ' Tia Rosa ', altPhone: '(85) 98922-6263' });
  assert.deepEqual([c.altContactName, c.altPhone, c.address], ['Tia Rosa', '85989226263', 'Rua A, 10']);
});

test('Entrada do veículo: endereço e recado do fornecedor', async () => {
  const v = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model: 'NXR 160', year: 2019, type: 'moto', price: 12000, cost: 0 } });
  const a = await details.upsertAcquisition(shop.id, v.id, {
    supplierName: 'Gabriel', supplierDocument: '02546565362', supplierPhone: '85989226263',
    supplierAddress: ' Rua B, 20, Fortaleza ', supplierAltContactName: 'Irmão João', supplierAltPhone: '(85) 99999-0000',
  });
  assert.deepEqual([a.supplierAddress, a.supplierAltContactName, a.supplierAltPhone], ['Rua B, 20, Fortaleza', 'Irmão João', '85999990000']);
  const b = await details.upsertAcquisition(shop.id, v.id, { supplierAltPhone: '' });
  assert.equal(b.supplierAltPhone, null); assert.equal(b.supplierAddress, 'Rua B, 20, Fortaleza');
});

test('Contrato de compra: dados da loja, do fornecedor e do veículo', async () => {
  const v = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Yamaha', model: 'Fazer 250', year: 2021, type: 'moto', price: 18000, cost: 0, plate: 'ABC1D23' } });
  await assert.rejects(details.purchaseDocument(shop.id, v.id), /Cadastre a entrada/);
  // Fornecedor já cadastrado como cliente: RG vem de lá
  await prisma.customer.create({ data: { dealershipId: shop.id, name: 'Pedro', document: '98765432100', rg: '2009123456' } });
  await details.upsertAcquisition(shop.id, v.id, {
    supplierName: 'Pedro', supplierDocument: '987.654.321-00', supplierPhone: '85911112222', supplierAddress: 'Rua C, 5',
    purchaseValue: 14000, payoffValue: 3000, documentOwnerName: 'Ana', documentOwnerDocument: '11122233344',
  });
  const d = await details.purchaseDocument(shop.id, v.id);
  assert.match(d.contractNumber, /^CP-\d{4}-[0-9A-F]{6}$/);
  assert.equal((await details.purchaseDocument(shop.id, v.id)).contractNumber, d.contractNumber);
  assert.deepEqual([d.supplier.name, d.supplier.rg, d.supplier.address], ['Pedro', '2009123456', 'Rua C, 5']);
  assert.deepEqual([d.purchaseValue, d.payoffValue, d.vehicle.plate, d.dealership.name], [14000, 3000, 'ABC1D23', 'Loja']);
  assert.deepEqual(d.documentOwner, { name: 'Ana', document: '11122233344' });
  // Outra loja não acessa
  const other = await prisma.dealership.create({ data: { name: 'Outra', slug: 'outra-c' } });
  await assert.rejects(details.purchaseDocument(other.id, v.id), /Veículo não encontrado/);
});
