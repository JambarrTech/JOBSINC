const prisma = require('../config/prisma');

function parseSkills(raw) {
  if (!raw) return [];
  return raw
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function computeScore(candidateSkills, jobSkills) {
  if (jobSkills.length === 0) return 0;
  const set = new Set(candidateSkills);
  const matches = jobSkills.filter((s) => set.has(s));
  return Math.round((matches.length / jobSkills.length) * 100);
}

async function getMatches(companyId) {
  const openJobs = await prisma.job.findMany({
    where: {
      companyId,
      isOpen: true,
      OR: [{ deadline: null }, { deadline: { gte: new Date() } }],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (openJobs.length === 0) return [];

  const applications = await prisma.application.findMany({
    where: { jobId: { in: openJobs.map((j) => j.id) } },
    include: { candidate: true },
  });

  const appliedMap = new Map();
  for (const app of applications) {
    if (!appliedMap.has(app.jobId)) appliedMap.set(app.jobId, new Set());
    appliedMap.get(app.jobId).add(app.candidateProfileId);
  }

  const candidates = await prisma.candidateProfile.findMany({
    where: { skills: { not: null } },
    orderBy: { updatedAt: 'desc' },
  });

  const matches = [];

  for (const job of openJobs) {
    const jobSkills = parseSkills(job.skills);
    if (jobSkills.length === 0) continue;

    const applied = appliedMap.get(job.id) || new Set();

    for (const candidate of candidates) {
      if (applied.has(candidate.id)) continue;
      const candidateSkills = parseSkills(candidate.skills);
      const score = computeScore(candidateSkills, jobSkills);
      if (score >= 20) {
        matches.push({
          id: `${job.id}-${candidate.id}`,
          candidateName: `${candidate.firstName} ${candidate.lastName}`.trim(),
          jobTitle: job.title,
          score,
          matchScore: score,
          location: [candidate.city, candidate.country].filter(Boolean).join(', ') || null,
          avatar: candidate.avatarUrl || null,
          skills: candidateSkills.slice(0, 6),
        });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 30);
}

module.exports = { getMatches };
