const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const NEW_URL = process.env.DATABASE_URL;
if (!NEW_URL || !process.env.JWT_SECRET) {
  throw new Error('DATABASE_URL et JWT_SECRET doivent être définis dans l’environnement.');
}
const prisma = new PrismaClient({ datasources: { db: { url: NEW_URL } } });
(async()=>{
  // Override prisma in authService? authService uses require('../config/prisma') which reads DATABASE_URL, so set env before require
  // Already set, but need to re-require
  delete require.cache[require.resolve('../src/services/authService')];
  delete require.cache[require.resolve('../src/config/prisma')];
  const authService2 = require('../src/services/authService');
  try {
    const user = await authService2.authenticateUser('hisbucodeur@gmail.com', 'Admin123!');
    console.log('authenticateUser success:', { id: user.id, email: user.email, role: user.role });
  } catch (e) {
    console.error('authenticateUser failed:', e.message, e.stack);
  }
  await prisma.$disconnect();
})();
