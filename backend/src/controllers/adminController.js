// ============================================================
// ADMIN CONTROLLER — façade de compatibilité
//
// Découpage par domaine (ETAT P2 « Réduire adminController », ex-711 lignes) :
//   - `admin/users.js`     : overview, users, userDetail, candidates,
//                            employees, administrators
//   - `admin/companies.js` : companies, approveCompany, rejectCompany
//   - `admin/content.js`   : jobs, applications, interviews, recruitments,
//                            emptyResource, search
//   - `admin/insights.js`  : activity, audit, notifications, analytics,
//                            trends, reportsAnalytics, moderation
//   - `admin/system.js`    : system (sonde santé partagée)
//   - `admin/_shared.js`   : prisma, cache, probe, pagination, helpers
//
// Les routes (`routes/adminRoutes.js`) continuent de faire
// `require('../controllers/adminController')` : les références restent
// identiques, seul l'emplacement du code change. Aucun comportement modifié.
// ============================================================

const users = require('./admin/users');
const companies = require('./admin/companies');
const content = require('./admin/content');
const insights = require('./admin/insights');
const system = require('./admin/system');

module.exports = {
  // users.js
  overview: users.overview,
  users: users.users,
  userDetail: users.userDetail,
  candidates: users.candidates,
  employees: users.employees,
  administrators: users.administrators,
  // companies.js
  companies: companies.companies,
  approveCompany: companies.approveCompany,
  rejectCompany: companies.rejectCompany,
  // content.js
  jobs: content.jobs,
  applications: content.applications,
  interviews: content.interviews,
  recruitments: content.recruitments,
  emptyResource: content.emptyResource,
  search: content.search,
  // insights.js
  activity: insights.activity,
  audit: insights.audit,
  notifications: insights.notifications,
  analytics: insights.analytics,
  trends: insights.trends,
  reportsAnalytics: insights.reportsAnalytics,
  moderation: insights.moderation,
  // system.js
  system: system.system,
};
