const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@jobsinc.com';
  // Jamais de mot de passe en dur : si ADMIN_PASSWORD n'est pas fournie,
  // un mot de passe fort est généré et affiché UNE SEULE FOIS.
  const generatedPassword = crypto.randomBytes(18).toString('base64url');
  const adminPassword = process.env.ADMIN_PASSWORD || generatedPassword;
  const generated = !process.env.ADMIN_PASSWORD;

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
  if (generated) {
    console.log(`🔑 Mot de passe généré (à noter maintenant) : ${adminPassword}`);
    console.log('   Puis définissez ADMIN_PASSWORD dans votre environnement pour fixer ce mot de passe.');
  }
}

main()
  .catch((e) => {
    console.error('❌ Erreur seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });