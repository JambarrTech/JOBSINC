const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const jobs = await p.job.findMany({ select: { title: true, description: true, skills: true, responsibilities: true } });
  for (const j of jobs) {
    console.log('=== ' + j.title + ' ===');
    console.log('description:', j.description?.length, 'chars');
    console.log('skills:', j.skills?.length, 'chars');
    console.log('responsibilities:', j.responsibilities?.length, 'chars');
    console.log(j.description?.substring(0, 100) + '...');
    console.log('');
  }
  const apps = await p.application.findMany({ select: { id: true, coverLetter: true } });
  for (const a of apps) {
    console.log('=== App ' + a.id + ' ===');
    console.log('coverLetter:', a.coverLetter?.length, 'chars');
    console.log(a.coverLetter?.substring(0, 100) + '...');
    console.log('');
  }
}
main().finally(() => p.$disconnect());
