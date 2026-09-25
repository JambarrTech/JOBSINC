const { PrismaClient } = require('@prisma/client');

const OLD_URL = process.env.OLD_DATABASE_URL;
const NEW_URL = process.env.NEW_DATABASE_URL || process.env.DATABASE_URL;
if (!OLD_URL || !NEW_URL) throw new Error('OLD_DATABASE_URL et NEW_DATABASE_URL/DATABASE_URL doivent être définis.');

async function main() {
  const oldDb = new PrismaClient({ datasources: { db: { url: OLD_URL } } });
  const newDb = new PrismaClient({ datasources: { db: { url: NEW_URL } } });

  console.log('Connecting...');
  await oldDb.$connect();
  await newDb.$connect();
  console.log('Connected both');

  // Disable FK checks for copy? Postgres doesn't have simple disable, we copy in order.
  const countsOld = {};
  const countsNewBefore = {};

  // Helper to copy table - always upsert missing rows (skipDuplicates)
  async function copy(model, orderBy) {
    const oldData = await oldDb[model].findMany(orderBy ? { orderBy } : {});
    console.log(`\n${model}: ${oldData.length} rows in OLD`);
    countsOld[model] = oldData.length;
    const newCountBefore = await newDb[model].count();
    countsNewBefore[model] = newCountBefore;
    console.log(`  ${model}: ${newCountBefore} rows in NEW before`);
    if (oldData.length === 0) return;
    // Create in batches of 50
    const batchSize = 50;
    for (let i = 0; i < oldData.length; i += batchSize) {
      const batch = oldData.slice(i, i + batchSize);
      // Use createMany with skipDuplicates false - but need to handle
      // For SQLite it works, for Postgres createMany is supported
      try {
        await newDb[model].createMany({ data: batch, skipDuplicates: true });
        console.log(`  Copied ${Math.min(i+batchSize, oldData.length)}/${oldData.length}`);
      } catch (e) {
        // Fallback to individual creates
        console.warn(`  createMany failed for ${model} batch ${i}: ${e.message} - trying individual`);
        for (const row of batch) {
          try { await newDb[model].create({ data: row }); } catch (ee) { console.warn(`    skip ${row.id}: ${ee.message.split('\n')[0]}`); }
        }
      }
    }
    const after = await newDb[model].count();
    console.log(`  ${model}: ${after} rows in NEW after`);
  }

  // Order respecting FKs
  // 1. Users
  await copy('user', { id: 'asc' });
  // 2. Skills
  await copy('skill', { id: 'asc' });
  // 3. CandidateProfile (needs User)
  await copy('candidateProfile', { id: 'asc' });
  // 4. Company (needs User)
  await copy('company', { id: 'asc' });
  // 5. CompanyImage (needs Company)
  await copy('companyImage', { id: 'asc' });
  // 6. Job (needs Company)
  await copy('job', { id: 'asc' });
  // 7. CandidateSkill, JobSkill, Employment need parents
  await copy('candidateSkill', { id: 'asc' });
  await copy('jobSkill', { id: 'asc' });
  // 8. Application (needs Job, CandidateProfile)
  await copy('application', { id: 'asc' });
  // 9. Interview, Employment, Conversation need Application etc.
  await copy('interview', { id: 'asc' });
  await copy('employment', { id: 'asc' });
  await copy('conversation', { id: 'asc' });
  await copy('message', { id: 'asc' });
  await copy('notification', { id: 'asc' });
  await copy('deviceToken', { id: 'asc' });
  await copy('savedJob', { id: 'asc' });
  await copy('faq', { id: 'asc' });
  await copy('feedback', { id: 'asc' });
  await copy('passwordReset', { id: 'asc' });
  await copy('refreshToken', { id: 'asc' });
  await copy('emailVerification', { id: 'asc' });

  console.log('\n=== Done ===');
  console.log('OLD counts:', countsOld);
  await oldDb.$disconnect();
  await newDb.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
