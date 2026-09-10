import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  await prisma.plan.upsert({
    where: { id: 'plan-basico' },
    update: {},
    create: {
      id: 'plan-basico',
      name: 'Básico',
      price: 149,
      vehicleLimit: 20,
      userLimit: 1,
      features: [
        '20 veículos em estoque',
        'Site público da loja',
        'CRM de leads básico',
        '1 usuário',
        'Suporte por e-mail',
      ],
    },
  });

  await prisma.plan.upsert({
    where: { id: 'plan-profissional' },
    update: {},
    create: {
      id: 'plan-profissional',
      name: 'Profissional',
      price: 299,
      vehicleLimit: 60,
      userLimit: 5,
      features: [
        '60 veículos em estoque',
        'Site público da loja',
        'CRM de leads completo',
        'Integrador de anúncios (OLX, WebMotors)',
      ],
    },
  });

  console.log('Seed concluído: planos Básico e Profissional criados.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
