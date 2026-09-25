const { PrismaClient } = require('@prisma/client');
const NEW_URL = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
if (!NEW_URL) throw new Error('NEW_DATABASE_URL ou DATABASE_URL doit être défini.');

async function main() {
  const db = new PrismaClient({ datasources: { db: { url: NEW_URL } } });
  await db.$connect();
  console.log('Cleaning NEW ep-small-poetry...');

  // Delete in FK reverse order
  const order = [
    'refreshToken',
    'emailVerification',
    'passwordReset',
    'savedJob',
    'deviceToken',
    'notification',
    'message',
    'conversation',
    'employment',
    'interview',
    'application',
    'jobSkill',
    'candidateSkill',
    'companyImage',
    'job',
    'company',
    'candidateProfile',
    'skill',
    'faq',
    'feedback',
    'user',
  ];
  for (const m of order) {
    try {
      const r = await db[m].deleteMany({});
      console.log(`  ${m}: deleted ${r.count}`);
    } catch (e) {
      console.warn(`  ${m}: ${e.message.split('\n')[0]}`);
    }
  }
  const counts = {};
  for (const m of ['user','company','job']) {
    counts[m] = await db[m].count();
  }
  console.log('After clean sample:', counts);
  await db.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1)});
