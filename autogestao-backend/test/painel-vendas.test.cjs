const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { SalesService } = require('../dist/src/sales/sales.service');
const { VehicleDetailsService } = require('../dist/src/vehicle-details/vehicle-details.service');
const { StorageService } = require('../dist/src/vehicle-details/storage.service');
let db, server, prisma, sales, details, shop, owner, vehicle, customer;
before(async () => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'st-'));
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55460, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55460/postgres', max: 1 }) }); await prisma.$connect();
  sales = new SalesService(prisma); details = new VehicleDetailsService(prisma, new StorageService());
  shop = await prisma.dealership.create({ data: { name: 'Loja', slug: 'loja' } });
  owner = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Dono', email: 'd@x.invalid', passwordHash: 'x' } });
  vehicle = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model: 'PCX', year: 2026, type: 'moto', price: 28000, cost: 25000 } });
  customer = await prisma.customer.create({ data: { dealershipId: shop.id, name: 'Mateus' } });
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });
const actor = { userId: '', dealershipId: '', role: 'owner' };

test('Venda com troca + PIX + dinheiro + cartão com taxa', async () => {
  Object.assign(actor, { userId: owner.id, dealershipId: shop.id });
  const sale = await sales.create(shop.id, owner.id, {
    vehicleId: vehicle.id, customerId: customer.id, price: 28000, cost: 25000,
    tradeIns: [{ type: 'moto', brand: 'Honda', model: 'CG 160', year: 2020, value: 8000 }],
    payments: [{ method: 'pix', amount: 5000 }, { method: 'cash', amount: 3000 }, { method: 'card_credit', amount: 12000, installments: 10, feePercent: 3 }],
  }, actor);
  assert.equal(sale.payments.length, 3);
  assert.equal(sale.paymentMethod, 'mixed');
  assert.equal(Number(sale.profit), 28000 - 25000 - 360);
  const fin = await prisma.financialTransaction.findMany({ where: { saleId: sale.id } });
  const rev = fin.filter(f => f.type === 'revenue').reduce((s, f) => s + Number(f.amount), 0);
  assert.equal(rev, 28000);
  assert.ok(fin.some(f => f.category === 'Taxa de cartão' && Number(f.amount) === 360));
  assert.equal(sale.tradeIns.length, 1);
});
test('Pagamento que não fecha é recusado', async () => {
  const v2 = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Yamaha', model: 'Fazer', year: 2024, price: 20000, cost: 15000 } });
  await assert.rejects(sales.create(shop.id, owner.id, { vehicleId: v2.id, customerId: customer.id, price: 20000, cost: 15000, payments: [{ method: 'pix', amount: 19000 }] }, actor), /faltam/);
});
test('Painel: entrada, lançamento, pendência, web e resumo', async () => {
  const v = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'VW', model: 'Gol', year: 2015, price: 35000, cost: 0 } });
  await details.upsertAcquisition(shop.id, v.id, { purchaseValue: 30000, supplierName: 'Fornecedor' });
  await details.createExpense(shop.id, v.id, owner.id, { kind: 'expense', description: 'Pneus', amount: 1200, addToCost: true });
  await details.createPendency(shop.id, v.id, { description: 'Trocar óleo' });
  await details.upsertWeb(shop.id, v.id, { title: 'Gol 2015', featured: true });
  await details.updateRenave(shop.id, v.id, { entryStatus: 'done' });
  const s = await details.summary(shop.id, v.id);
  assert.equal(s.purchase, 30000); assert.equal(s.totalCost, 31200); assert.equal(s.pendingCount, 1);
  const fin = await details.listFinancial(shop.id, v.id);
  assert.equal(fin.length, 2);
  const files = await details.uploadFile(shop.id, v.id, owner.id, { originalname: 'crlv.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') }, { category: 'vehicle' });
  assert.equal(files.length, 1);
  await details.addPhotos(shop.id, v.id, [{ originalname: 'a.jpg', mimetype: 'image/jpeg', size: 3, buffer: Buffer.from('abc') }]);
  assert.equal((await prisma.vehiclePhoto.count({ where: { vehicleId: v.id } })), 1);
});
test('Excluir venda com pagamentos funciona', async () => {
  const s = await prisma.sale.findFirst({ where: { vehicleId: vehicle.id } });
  await sales.remove(shop.id, s.id);
  assert.equal(await prisma.salePayment.count(), 0);
});

test('Documentos da venda: contrato com número, troca, pagamentos e promissórias', async () => {
  const v = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model: 'CG 160 Fan', year: 2024, price: 21000, cost: 17000, plate: 'ABC1D23', chassis: '9C2KC2210RR000001', renavam: '01234567890' } });
  const s = await sales.create(shop.id, owner.id, {
    vehicleId: v.id, customerId: customer.id, price: 21000, cost: 17000,
    tradeIns: [{ type: 'moto', brand: 'Yamaha', model: 'Factor 150', year: 2018, plate: 'XYZ9A87', value: 4000 }],
    payments: [{ method: 'pix', amount: 6000 }, { method: 'promissory', amount: 11000 }],
  }, actor);
  await prisma.promissoryNote.createMany({ data: [1, 2].map((n) => ({ dealershipId: shop.id, saleId: s.id, customerId: customer.id, installmentNumber: n, totalInstallments: 2, amount: 9075, dueDate: new Date(Date.UTC(2026, 10 + n, 19, 12)) })) });
  const d = await sales.documents(shop.id, s.id, actor);
  assert.match(d.contractNumber, /^\d{4}\/\d{4}$/);
  assert.equal(d.price, 21000); assert.equal(d.vehicle.chassis, '9C2KC2210RR000001');
  assert.equal(d.tradeIns[0].value, 4000); assert.equal(d.tradeIns[0].plate, 'XYZ9A87');
  assert.deepEqual(d.payments.map((p) => p.method), ['pix', 'promissory']);
  assert.equal(d.promissoryNotes.length, 2); assert.equal(d.promissoryNotes[1].number, 2);
  assert.equal(d.customer.name, customer.name);
  // venda antiga sem número ganha um, sem repetir
  await prisma.sale.update({ where: { id: s.id }, data: { contractNumber: null } });
  const again = await sales.documents(shop.id, s.id, actor);
  assert.ok(again.contractNumber);
  await assert.rejects(sales.documents(shop.id, '00000000-0000-0000-0000-000000000000', actor), /não encontrada/);
});

test('Entrada mínima: vendedor é bloqueado, dono libera confirmando', async () => {
  await prisma.dealership.update({ where: { id: shop.id }, data: { minDownPaymentPercent: 60 } });
  const seller = await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'Zé', email: 'ze.min@x.invalid', passwordHash: 'x' } });
  const cust = await prisma.customer.create({ data: { dealershipId: shop.id, name: 'Cliente do Zé', createdById: seller.id } });
  const mk = () => prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Yamaha', model: 'Fazer 250', year: 2025, price: 28000, cost: 23000 } });
  const v1 = await mk();
  const body = (vehicleId, entry) => ({ vehicleId, customerId: cust.id, price: 28000, cost: 23000, payments: [{ method: 'cash', amount: entry }, { method: 'promissory', amount: 28000 - entry }] });
  const sellerActor = { userId: seller.id, dealershipId: shop.id, role: 'seller' };
  // 13.000 de 28.000 = 46,4% < 60% (mínimo 16.800)
  await assert.rejects(sales.create(shop.id, seller.id, body(v1.id, 13000), sellerActor), /abaixo do mínimo de 60%.*Faltam R\$\s?3\.800,00.*dono ou o administrador/);
  const ownerActor = { userId: owner.id, dealershipId: shop.id, role: 'owner' };
  await assert.rejects(sales.create(shop.id, owner.id, body(v1.id, 13000), ownerActor), /Confirme a liberação/);
  await sales.create(shop.id, owner.id, { ...body(v1.id, 13000), allowBelowMinDownPayment: true, sellerId: seller.id }, ownerActor);
  // Com entrada suficiente o vendedor fecha normalmente
  const v2 = await mk();
  await sales.create(shop.id, seller.id, body(v2.id, 16800), sellerActor);
  await prisma.dealership.update({ where: { id: shop.id }, data: { minDownPaymentPercent: null } });
});

test('Situação do veículo: licenciamento, multas, Renajud, recall e devolução', async () => {
  const { VehiclesService } = require('../dist/src/vehicles/vehicles.service');
  const vs = new VehiclesService(prisma);
  const v = await vs.create(shop.id, owner.id, {
    type: 'moto', brand: 'Honda', model: 'Biz 125', year: 2023, km: 1000, cost: 10000, price: 13000,
    docStatus: {
      licensing: { status: 'ok', year: 2026 },
      fines: { status: 'pending', amount: '293.47', note: 'Excesso de velocidade' },
      renajud: { status: 'ok' }, recall: { status: 'qualquer' }, returned: { status: 'pending', note: 'Voltou do cliente' },
      hack: { status: 'ok' },
    },
  });
  const saved = await prisma.vehicle.findUnique({ where: { id: v.id } });
  assert.deepEqual(saved.docStatus.licensing, { status: 'ok', year: 2026 });
  assert.equal(saved.docStatus.fines.amount, 293.47);
  assert.equal(saved.docStatus.recall.status, 'unknown'); // valor inválido vira "não verificado"
  assert.equal(saved.docStatus.hack, undefined);           // chave desconhecida é ignorada
  await vs.update(shop.id, v.id, { docStatus: { fines: { status: 'ok' } } });
  assert.deepEqual((await prisma.vehicle.findUnique({ where: { id: v.id } })).docStatus, { fines: { status: 'ok' } });
  await vs.update(shop.id, v.id, { price: 12500 }); // editar outra coisa não apaga a situação
  assert.deepEqual((await prisma.vehicle.findUnique({ where: { id: v.id } })).docStatus, { fines: { status: 'ok' } });
});
