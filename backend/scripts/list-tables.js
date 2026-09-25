const { PrismaClient } = require('@prisma/client');
const OLD_URL = process.env.OLD_DATABASE_URL;
const NEW_URL = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
if (!OLD_URL || !NEW_URL) throw new Error('OLD_DATABASE_URL et NEW_DATABASE_URL/DATABASE_URL doivent être définis.');

async function list(url, label) {
  const p = new PrismaClient({ datasources: { db: { url } } });
  await p.$connect();
  const rows = await p.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  console.log(`\n=== ${label} ===`);
  console.log(rows.map(r => r.tablename).join(', '));
  await p.$disconnect();
}
(async () => {
  await list(OLD_URL, 'OLD ep-curly-fog');
  await list(NEW_URL, 'NEW ep-small-poetry');
})();
