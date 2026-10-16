import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
async function main() {
  const shop = await prisma.dealership.upsert({ where: { slug: 'loja-demo' }, update: {}, create: { name: 'AutoGestão Demo', slug: 'loja-demo', city: 'São Paulo', state: 'SP' } });
  await prisma.user.upsert({ where: { email: 'demo@autogestao.local' }, update: {}, create: {
    dealershipId: shop.id, name: 'Administrador Demo', email: 'demo@autogestao.local', role: 'owner', passwordHash: await argon2.hash('DemoChat2026!'),
  } });
  for (const item of [
    { plate: 'DEM1A01', brand: 'Honda', model: 'CG 160', type: 'moto' as const, year: 2024, km: 12000, cost: 13000, price: 16500 },
    { plate: 'DEM1A02', brand: 'Chevrolet', model: 'Onix', type: 'car' as const, year: 2023, km: 32000, cost: 60000, price: 72900 },
  ]) {
    if (!await prisma.vehicle.findFirst({ where: { dealershipId: shop.id, plate: item.plate } })) await prisma.vehicle.create({ data: { dealershipId: shop.id, ...item } });
  }
  console.log('Loja demo pronta. Login: demo@autogestao.local — consulte a senha no guia local.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
