const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const c = {};
  for (const m of ['user','candidateProfile','company','job','application','interview','conversation','message','notification','deviceToken','companyImage']) {
    c[m] = await p[m].count();
  }
  console.table(c);
}
main().finally(() => p.$disconnect());
