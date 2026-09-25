const { PrismaClient } = require('@prisma/client');
const NEW_URL = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
if (!NEW_URL) throw new Error('NEW_DATABASE_URL ou DATABASE_URL doit être défini.');
const p = new PrismaClient({ datasources: { db: { url: NEW_URL } } });
(async()=>{
  await p.$connect();
  const admins = await p.user.findMany({ where: { role: 'ADMIN' }, select: { email: true, role: true, createdAt: true } });
  console.log('ADMINS:', admins);
  const all = await p.user.findMany({ select: { email: true, role: true } });
  console.log('ALL USERS:', all);
  await p.$disconnect();
})();
