const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { SalesService } = require('../dist/src/sales/sales.service');
const { ReservationsService } = require('../dist/src/reservations/reservations.service');
let db, server, prisma, sales, reservations, shop, owner, seller, cust, cust2;
const ownerActor = { role: 'owner' };
before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55470, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55470/postgres', max: 1 }) }); await prisma.$connect();
  sales = new SalesService(prisma); reservations = new ReservationsService(prisma);
  shop = await prisma.dealership.create({ data: { name: 'Loja', slug: 'loja-vc' } });
  owner = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Dono', email: 'dono@vc.invalid', passwordHash: 'x' } });
  seller = await prisma.user.create({ data: { dealershipId: shop.id, role: 'seller', name: 'Zé', email: 'ze@vc.invalid', passwordHash: 'x', commissionRate: 2 } });
  cust = await prisma.customer.create({ data: { dealershipId: shop.id, name: 'Ana Souza', createdById: seller.id } });
  cust2 = await prisma.customer.create({ data: { dealershipId: shop.id, name: 'Bruno Lima' } });
  Object.assign(ownerActor, { userId: owner.id, dealershipId: shop.id });
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });
const mkVehicle = (price = 30000, cost = 24000) => prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model: 'XRE 300', year: 2024, type: 'moto', price, cost } });
const fin = (saleId) => prisma.financialTransaction.findMany({ where: { saleId } });

test('Comissão automática, despesas e financiamento com retorno no lucro', async () => {
  const v = await mkVehicle();
  const s = await sales.create(shop.id, owner.id, {
    vehicleId: v.id, customerId: cust.id, sellerId: seller.id, price: 30000, cost: 24000,
    payments: [{ method: 'pix', amount: 6000 }, { method: 'financing', amount: 24000, bank: 'Banco Pan', returnAmount: 800 }],
    expenses: [{ description: 'Transferência', amount: 250 }, { description: 'Brinde capacete', amount: 150, paid: false }],
    warrantyDays: 90, warrantyCoverage: 'Motor e câmbio',
  }, ownerActor);
  // comissão 2% de 30.000 = 600; lucro = 30000-24000-400-600+800 = 5800
  assert.equal(Number(s.commissionAmount), 600);
  assert.equal(Number(s.profit), 5800);
  assert.equal(s.expenses.length, 2);
  assert.equal(s.warrantyDays, 90);
  const f = await fin(s.id);
  const financing = f.find((t) => t.category === 'Venda de veículo - Financiamento');
  assert.equal(financing.paid, false);
  assert.equal(f.find((t) => t.category === 'Retorno de financiamento').paid, false);
  assert.equal(f.find((t) => t.category === 'Comissão de vendedor').paid, false);
  assert.equal(f.filter((t) => t.category === 'Despesa de venda').length, 2);
  const p = s.payments.find((x) => x.method === 'financing');
  assert.equal(p.financingStatus, 'analysis'); assert.equal(p.bank, 'Banco Pan');

  // Banco depositou: financiamento e retorno ficam pagos; retorno sobe para 1.000
  const s2 = await sales.updateFinancing(shop.id, s.id, p.id, { status: 'paid', receivedAt: '2026-10-20', returnAmount: 1000 });
  assert.equal(Number(s2.profit), 6000);
  const f2 = await fin(s.id);
  assert.equal(f2.find((t) => t.id === financing.id).paid, true);
  const ret = f2.find((t) => t.category === 'Retorno de financiamento');
  assert.equal(ret.paid, true); assert.equal(Number(ret.amount), 1000);

  // Despesa nova e remoção
  const s3 = await sales.addExpense(shop.id, s.id, { description: 'Vistoria', amount: 120 });
  assert.equal(Number(s3.profit), 5880);
  const vist = s3.expenses.find((e) => e.description === 'Vistoria');
  const s4 = await sales.removeExpense(shop.id, s.id, vist.id);
  assert.equal(Number(s4.profit), 6000);
  const brinde = s4.expenses.find((e) => e.description === 'Brinde capacete');
  await sales.updateExpense(shop.id, s.id, brinde.id, { paid: true });
  assert.equal((await prisma.financialTransaction.findUnique({ where: { id: brinde.financialTransactionId } })).paid, true);

  // Comissão: ajusta para 500 e marca paga
  const s5 = await sales.updateCommission(shop.id, s.id, { amount: 500, paid: true });
  assert.equal(Number(s5.commissionAmount), 500); assert.ok(s5.commissionPaidAt);
  assert.equal(Number(s5.profit), 6100);
  const com = (await fin(s.id)).find((t) => t.category === 'Comissão de vendedor');
  assert.equal(com.paid, true); assert.equal(Number(com.amount), 500);

  // Garantia
  const s6 = await sales.updateWarranty(shop.id, s.id, { days: 180, coverage: 'Motor' });
  assert.equal(s6.warrantyDays, 180);
});

test('Pós-venda: checklist e transferências pendentes', async () => {
  const v = await mkVehicle(15000, 12000);
  const s = await sales.create(shop.id, owner.id, { vehicleId: v.id, customerId: cust.id, sellerId: seller.id, price: 15000, cost: 12000, payments: [{ method: 'cash', amount: 15000 }] }, ownerActor);
  let a = await sales.afterSales(shop.id, ownerActor);
  const item = a.items.find((i) => i.id === s.id);
  assert.ok(item); assert.equal(item.daysLeft, 30); assert.equal(item.pendingItems.length, 6);
  const sellerActor = { userId: seller.id, dealershipId: shop.id, role: 'seller' };
  const after1 = await sales.updateChecklist(shop.id, s.id, { key: 'atpv', done: true }, sellerActor);
  assert.equal(after1.deliveryChecklist.atpv.done, true);
  await sales.updateChecklist(shop.id, s.id, { key: 'transfer', done: true }, sellerActor);
  a = await sales.afterSales(shop.id, ownerActor);
  assert.ok(!a.items.some((i) => i.id === s.id));
  const docs = await sales.documents(shop.id, s.id, ownerActor);
  assert.equal(docs.checklist.atpv.done, true);
});

test('Reserva com sinal vira parte da venda sem duplicar receita', async () => {
  const v = await mkVehicle(20000, 16000);
  const r = await reservations.create(shop.id, seller.id, { vehicleId: v.id, customerId: cust.id, deposit: 1000, depositMethod: 'pix', expiresAt: '2026-11-05' }, { userId: seller.id, dealershipId: shop.id, role: 'seller' });
  assert.equal((await prisma.vehicle.findUnique({ where: { id: v.id } })).status, 'reserved');
  await assert.rejects(reservations.create(shop.id, owner.id, { vehicleId: v.id, customerId: cust2.id }, ownerActor), /já está reservado/);
  // Outro cliente não compra
  await assert.rejects(sales.create(shop.id, owner.id, { vehicleId: v.id, customerId: cust2.id, price: 20000, cost: 16000, payments: [{ method: 'pix', amount: 20000 }] }, ownerActor), /reservado para Ana Souza/);
  // Sem a linha do sinal: recusa
  await assert.rejects(sales.create(shop.id, owner.id, { vehicleId: v.id, customerId: cust.id, price: 20000, cost: 16000, payments: [{ method: 'pix', amount: 20000 }] }, ownerActor), /Inclua o sinal/);
  const s = await sales.create(shop.id, owner.id, { vehicleId: v.id, customerId: cust.id, sellerId: seller.id, price: 20000, cost: 16000, payments: [{ method: 'deposit', amount: 1000 }, { method: 'pix', amount: 19000 }] }, ownerActor);
  const f = await fin(s.id);
  const revenue = f.filter((t) => t.type === 'revenue').reduce((t, x) => t + Number(x.amount), 0);
  assert.equal(revenue, 20000);
  assert.equal(await prisma.financialTransaction.count({ where: { category: 'Sinal de reserva' } }), 0);
  assert.equal((await prisma.vehicleReservation.findUnique({ where: { id: r.id } })).status, 'converted');
  assert.equal((await prisma.vehicle.findUnique({ where: { id: v.id } })).status, 'sold');
});

test('Cancelar reserva: devolver ou reter o sinal', async () => {
  const v1 = await mkVehicle(); const v2 = await mkVehicle();
  const r1 = await reservations.create(shop.id, owner.id, { vehicleId: v1.id, customerId: cust2.id, deposit: 500 }, ownerActor);
  const r2 = await reservations.create(shop.id, owner.id, { vehicleId: v2.id, customerId: cust2.id, deposit: 700 }, ownerActor);
  await reservations.cancel(shop.id, r1.id, { refund: true, reason: 'Desistiu' });
  await reservations.cancel(shop.id, r2.id, { refund: false });
  assert.equal((await prisma.vehicle.findUnique({ where: { id: v1.id } })).status, 'available');
  assert.equal(await prisma.financialTransaction.count({ where: { category: 'Devolução de sinal', amount: 500 } }), 1);
  assert.equal(await prisma.financialTransaction.count({ where: { category: 'Sinal retido', amount: 700 } }), 1);
  const list = await reservations.list(shop.id, { status: 'canceled' });
  assert.equal(list.length, 2);
  await assert.rejects(reservations.cancel(shop.id, r1.id, { refund: true }), /não está mais ativa/);
});

test('Cancelamento (distrato): histórico fica, veículo volta e pode ser vendido de novo', async () => {
  const v = await mkVehicle(28000, 22000);
  const s = await sales.create(shop.id, owner.id, {
    vehicleId: v.id, customerId: cust.id, sellerId: seller.id, price: 28000, cost: 22000,
    tradeIns: [{ type: 'moto', brand: 'Yamaha', model: 'Factor', year: 2019, value: 6000 }],
    payments: [{ method: 'pix', amount: 7000 }, { method: 'promissory', amount: 15000 }],
  }, ownerActor);
  await prisma.promissoryNote.createMany({ data: [1, 2, 3].map((n) => ({ dealershipId: shop.id, saleId: s.id, customerId: cust.id, installmentNumber: n, totalInstallments: 3, amount: 5000, dueDate: new Date(Date.UTC(2026, 10 + n, 10, 12)), paid: n === 1, paidAt: n === 1 ? new Date() : null })) });
  const before = await sales.summary(shop.id);
  const res = await sales.cancel(shop.id, s.id, { reason: 'Cliente desistiu', refundAmount: 7000 });
  assert.equal(res.sale.status, 'canceled');
  assert.deepEqual(res.returnedTradeIns, ['Yamaha Factor 2019']);
  assert.equal((await prisma.vehicle.findUnique({ where: { id: v.id } })).status, 'available');
  assert.equal(await prisma.vehicle.count({ where: { tradeInSaleId: s.id } }), 0);
  assert.equal(await prisma.promissoryNote.count({ where: { saleId: s.id } }), 1); // só a paga fica
  const f = await fin(s.id);
  assert.ok(!f.some((t) => !t.paid)); // nada pendente
  assert.ok(!f.some((t) => t.category === 'Estoque' || t.category === 'Venda de veículo - Troca'));
  assert.ok(f.some((t) => t.category === 'Distrato de venda' && Number(t.amount) === 7000));
  assert.equal(Number(res.sale.commissionAmount), 0);
  const afterSum = await sales.summary(shop.id);
  assert.equal(afterSum.count, before.count - 1); assert.equal(afterSum.canceledCount, 1);
  await assert.rejects(sales.cancel(shop.id, s.id, { reason: 'de novo' }), /já foi cancelada/);
  await assert.rejects(sales.addExpense(shop.id, s.id, { description: 'x', amount: 1 }), /cancelada/);
  // Vende de novo o mesmo veículo
  const again = await sales.create(shop.id, owner.id, { vehicleId: v.id, customerId: cust2.id, price: 27500, cost: 22000, payments: [{ method: 'cash', amount: 27500 }] }, ownerActor);
  assert.equal(again.status, 'active');
  const list = await sales.findAll(shop.id, { status: 'canceled' });
  assert.equal(list.total, 1);
});
