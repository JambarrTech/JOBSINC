const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const NEW_URL = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
const OLD_URL = process.env.OLD_DATABASE_URL;
if (!OLD_URL || !NEW_URL) throw new Error('OLD_DATABASE_URL et NEW_DATABASE_URL/DATABASE_URL doivent être définis.');

async function set(url, label) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  await p.$connect();
  const hash = await bcrypt.hash('Admin123!', 10);
  const u = await p.user.update({ where: { email: 'hisbucodeur@gmail.com' }, data: { passwordHash: hash, role: 'ADMIN' } });
  console.log(`${label} → ${u.email} mot de passe réinitialisé à Admin123!`);
  await p.$disconnect();
}
(async()=>{
  await set(NEW_URL, 'NEW ep-small-poetry');
  await set(OLD_URL, 'OLD ep-curly-fog');
})();
