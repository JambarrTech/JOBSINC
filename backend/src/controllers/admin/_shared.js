const prisma = require('../../config/prisma');
const { getCached, setCache, invalidate } = require('../../utils/cache');
const { probe } = require('../../utils/healthCheck');
const { parsePagination, buildPaginationResponse } = require('../../utils/pagination');

const DAY_MS = 86400000;

function paginate(req) {
  return parsePagination(req.query);
}

function paginated(data, total, page, limit) {
  return buildPaginationResponse(data, total, page, limit);
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function candidateName(candidate) {
  if (!candidate) return 'Utilisateur';
  return `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Utilisateur';
}

function baseUserRecord(user) {
  const name = [user.candidate?.firstName, user.candidate?.lastName].filter(Boolean).join(' ') || null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name,
    firstName: user.candidate?.firstName || null,
    lastName: user.candidate?.lastName || null,
    phone: user.candidate?.phone || null,
    status: 'active',
    createdAt: user.createdAt,
    registeredAt: user.createdAt,
    lastActivity: user.updatedAt,
    lastLogin: null,
  };
}

const userIncludeForList = {
  candidate: {
    include: {
      employments: { take: 1, orderBy: { startDate: 'desc' }, include: { company: { select: { name: true } } } },
    },
  },
  company: { select: { id: true, name: true, sector: true, city: true, country: true, isApproved: true } },
};

function decorateUserRecord(user) {
  const record = baseUserRecord(user);
  if (user.company) {
    record.companyName = user.company.name;
    record.company = user.company.name;
    record.sector = user.company.sector || null;
    record.location = [user.company.city, user.company.country].filter(Boolean).join(', ') || null;
    record.status = user.company.isApproved ? 'active' : 'pending';
  }
  if (user.role === 'EMPLOYEE' && user.candidate?.employments?.length) {
    record.companyName = user.candidate.employments[0].company?.name || null;
    record.company = record.companyName;
  }
  return record;
}

module.exports = {
  prisma,
  getCached,
  setCache,
  invalidate,
  probe,
  DAY_MS,
  paginate,
  paginated,
  dayKey,
  candidateName,
  baseUserRecord,
  userIncludeForList,
  decorateUserRecord,
};
