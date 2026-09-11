const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Ce script est obsolète avec PostgreSQL + Prisma.');
  console.log('Utilisez "npx prisma db push" ou "npx prisma migrate dev" pour synchroniser le schéma.');
  console.log('');
  console.log('Vérification de la connexion à la base...');
  await prisma.$queryRawUnsafe('SELECT 1 as ok');
  console.log('✅ Connexion OK. La base est accessible.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
