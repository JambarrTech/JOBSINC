// Domaine « entreprises » : liste, approbation, rejet.
const { prisma, invalidate, paginate, paginated } = require('./_shared');
const logger = require('../../utils/logger');

/**
 * Invalide les caches dont la valeur dépend de `Company.isApproved`.
 *
 * Ces deux clés étaient les SEULES du projet à porter une donnée dépendant de
 * l'approbation, et ni `approveCompany` ni `rejectCompany` ne les touchaient.
 * Effet observé, avant correction : un admin approuve une entreprise, recharge
 * `/admin` — le compteur « Entreprises à valider » (`admin:overview`, TTL 60 s)
 * affichait encore l'entreprise comme en attente, et la page d'accueil publique
 * (`stats:global`, TTL 30 s) ne comptait ni l'entreprise ni ses offres, puisque
 * les deux requêtes filtrent sur `isApproved: true`
 * (`controllers/statsController.js:10-11`).
 *
 * Le symptôme le plus coûteux n'était pas le décalage de 30 s : c'est que
 * l'admin, qui venait de modérer, voyait sa décisionAPPERSEIGNÉE AVEC ÉCHEC.
 * Il refaisait donc la même action, et l'interface encourageait à le faire.
 *
 * `invalidate()` diffuse aussi via Redis (voir `utils/cache.js`), donc les
 * autres instances Render ne servent pas non plus la valeur périmée.
 */
function invalidateApprovalCaches() {
  invalidate('admin:overview');
  invalidate('stats:global');
}

exports.companies = async (req, res) => {
  try {
    const { page, limit, skip } = paginate(req);
    const [rows, total] = await Promise.all([
      prisma.company.findMany({ include: { user: { select: { email: true } }, _count: { select: { jobs: true } } }, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      prisma.company.count(),
    ]);
    res.json(paginated(rows.map((row) => ({ id: row.id, name: row.name, email: row.user?.email || null, sector: row.sector || null, location: [row.city, row.country].filter(Boolean).join(', ') || null, status: row.isApproved ? 'active' : 'pending', jobsCount: row._count.jobs, createdAt: row.createdAt })), total, page, limit));
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin companies:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de charger les entreprises.' });
  }
};

exports.approveCompany = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) return res.status(404).json({ error: 'Entreprise introuvable.' });

    const updated = await prisma.company.update({
      where: { id: company.id },
      data: { isApproved: true },
      include: { user: { select: { email: true } } },
    });

    invalidateApprovalCaches();

    res.json({ message: 'Entreprise approuvée.', id: updated.id, name: updated.name, isApproved: updated.isApproved });
  } catch (error) {
    logger.exception(error, { message: 'Erreur approveCompany:', scope: 'adminController' });
    res.status(500).json({ error: "Impossible d'approuver l'entreprise." });
  }
};

exports.rejectCompany = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) return res.status(404).json({ error: 'Entreprise introuvable.' });

    const updated = await prisma.company.update({
      where: { id: company.id },
      data: { isApproved: false },
      include: { user: { select: { email: true } } },
    });

    invalidateApprovalCaches();

    res.json({ message: 'Entreprise rejetée.', id: updated.id, name: updated.name, isApproved: updated.isApproved });
  } catch (error) {
    logger.exception(error, { message: 'Erreur rejectCompany:', scope: 'adminController' });
    res.status(500).json({ error: "Impossible de rejeter l'entreprise." });
  }
};
