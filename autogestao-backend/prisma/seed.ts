import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { PLAN_CATALOG, planHighlights } from '../src/plans/plan-catalog';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Os planos vêm de src/plans/plan-catalog.ts (o backend também atualiza sozinho ao ligar)
async function main() {
  for (const p of PLAN_CATALOG) {
    const data = { name: p.name, price: p.price, vehicleLimit: p.vehicleLimit, userLimit: p.userLimit, features: planHighlights(p) };
    await prisma.plan.upsert({ where: { id: p.id }, update: data, create: { id: p.id, ...data } });
  }
  console.log(`Seed concluído: ${PLAN_CATALOG.map((p) => p.name).join(', ')}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
