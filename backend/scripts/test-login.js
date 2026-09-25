const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const NEW_URL = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
if (!NEW_URL) throw new Error('NEW_DATABASE_URL ou DATABASE_URL doit être défini.');
const p = new PrismaClient({ datasources: { db: { url: NEW_URL } } });
(async()=>{
  await p.$connect();
  const u = await p.user.findUnique({ where: { email: 'hisbucodeur@gmail.com' }, include: { candidate: true, company: true } });
  console.log('user:', u ? { id: u.id, email: u.email, role: u.role, hasHash: !!u.passwordHash } : null);
  if (u) {
    const ok = await bcrypt.compare('Admin123!', u.passwordHash);
    console.log('bcrypt compare Admin123! :', ok);
    const ok2 = await bcrypt.compare('Admin123!', u.passwordHash.slice(0,60));
    console.log('ok2', ok2);
  }
  await p.$disconnect();
})();
