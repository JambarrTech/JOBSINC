const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const apps = await p.application.findMany({ select: { id: true, coverLetter: true } });
  for (const a of apps) {
    console.log(a.id);
    console.log(a.coverLetter);
    console.log('---');
  }
}
main().finally(() => p.$disconnect());
