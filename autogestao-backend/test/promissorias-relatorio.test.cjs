const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
require('reflect-metadata');
const { PrismaClient } = require('../dist/src/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PromissoryNotesService } = require('../dist/src/promissory-notes/promissory-notes.service');
const { InterestRatesService } = require('../dist/src/interest-rates/interest-rates.service');

let db, server, prisma, svc, shop, ana, beto;
const day = (offset) => { const t = new Date(); return new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate() + offset, 12)); };
const iso = (d) => d.toISOString().slice(0, 10);

before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
  db = await PGlite.create();
  const dir = path.join(__dirname, '../prisma/migrations');
  for (const name of fs.readdirSync(dir).sort()) { const f = path.join(dir, name, 'migration.sql'); if (fs.existsSync(f)) await db.exec(fs.readFileSync(f, 'utf8')); }
  server = new PGLiteSocketServer({ db, port: 55473, host: '127.0.0.1', maxConnections: 10 }); await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:55473/postgres', max: 1 }) }); await prisma.$connect();
  svc = new PromissoryNotesService(prisma);
  shop = await prisma.dealership.create({ data: { name: 'Mundo das Motos', slug: 'mdm' } });
  const owner = await prisma.user.create({ data: { dealershipId: shop.id, role: 'owner', name: 'Isabel', email: 'i@x.invalid', passwordHash: 'x' } });
  ana = await prisma.customer.create({ data: { dealershipId: shop.id, name: 'Ana', phone: '85999990000' } });
  beto = await prisma.customer.create({ data: { dealershipId: shop.id, name: 'Beto' } });
  const mkSale = async (c, plate) => {
    const v = await prisma.vehicle.create({ data: { dealershipId: shop.id, brand: 'Honda', model: 'Biz', year: 2024, price: 15000, cost: 12000, plate, status: 'sold' } });
    return prisma.sale.create({ data: { dealershipId: shop.id, vehicleId: v.id, customerId: c.id, sellerId: owner.id, price: 15000, cost: 12000 } });
  };
  const sA = await mkSale(ana, 'AAA1A11'); const sB = await mkSale(beto, 'BBB2B22');
  const note = (sale, c, n, offset, amount, paid = false) => ({ dealershipId: shop.id, saleId: sale.id, customerId: c.id, installmentNumber: n, totalInstallments: 3, amount, dueDate: day(offset), paid, paidAt: paid ? new Date() : null });
  await prisma.promissoryNote.createMany({ data: [
    note(sA, ana, 1, -40, 700, true), note(sA, ana, 2, -10, 700), note(sA, ana, 3, 20, 700),
    note(sB, beto, 1, -5, 500), note(sB, beto, 2, 25, 500), note(sB, beto, 3, 55, 500),
  ] });
});
after(async () => { if (prisma) await prisma.$disconnect(); if (server) await server.stop(); if (db) await db.close(); });

test('Parcelas arredondadas para cima em múltiplos de R$ 10', () => {
  assert.equal(InterestRatesService.splitInstallments(10485, 15).installmentValue, 700); // 699 -> 700
  const c = InterestRatesService.calculate(10000, 15, 75); // 17.500 / 15 = 1.166,67
  assert.equal(c.installmentValue, 1170); assert.equal(c.lastInstallmentValue, 1170); assert.equal(c.totalPromissory, 17550);
  assert.equal(InterestRatesService.splitInstallments(14000, 4).installmentValue, 3500); // já redondo: não muda
});

test('Relatório: carteira, inadimplência, mês a mês e devedores', async () => {
  const r = await svc.report(shop.id, iso(day(-60)), iso(day(60)));
  assert.equal(r.period.dueCount, 6); assert.equal(r.period.dueAmount, 3600);
  assert.equal(r.period.paidOfDueAmount, 700); assert.equal(r.period.overdueAmount, 1200); assert.equal(r.period.openAmount, 1700);
  assert.equal(r.period.receivedAmount, 700);
  assert.equal(r.portfolio.activePromissories, 2); assert.equal(r.portfolio.openAmount, 2900);
  assert.equal(r.portfolio.overdueCount, 2); assert.equal(r.portfolio.overdueAmount, 1200);
  // venceram 700+700+500 = 1900; em atraso 1200 -> 63,16%
  assert.equal(r.portfolio.delinquencyRate, 63.16);
  assert.equal(r.months.reduce((s, m) => s + m.due, 0), 3600);
  assert.deepEqual(r.debtors.map((d) => d.name), ['Ana', 'Beto']); // mais dias de atraso primeiro
  assert.equal(r.debtors[0].daysLate, 10); assert.equal(r.debtors[0].phone, '85999990000');
  assert.equal(r.installments.length, 6);
  await assert.rejects(svc.report(shop.id, '2026-12-01', '2026-01-01'), /depois da inicial/);
});
