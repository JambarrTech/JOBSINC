const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const jobs = await p.job.findMany({ select: { id: true, title: true, description: true, skills: true, responsibilities: true } });
  for (const j of jobs) {
    console.log('=== JOB:', j.id, j.title, '===');
    console.log('description:', j.description?.length, 'chars');
    console.log('skills:', j.skills?.length, 'chars');
    console.log('responsibilities:', j.responsibilities?.length, 'chars');
    console.log('');
  }
}
main().finally(() => p.$disconnect());
