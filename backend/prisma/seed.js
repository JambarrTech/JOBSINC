const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@jobsinc.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: passwordHash,
      role: 'ADMIN',
    },
    create: {
      email: adminEmail,
      passwordHash: passwordHash,
      role: 'ADMIN',
    },
  });

  console.log('✅ Compte Administrateur mis à jour / créé avec succès !');
  console.log(`📧 Email: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });