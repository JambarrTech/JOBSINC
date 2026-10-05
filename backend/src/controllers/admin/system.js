// Domaine « système » : état santé pour l'encart admin.
// UNE seule sonde pour les lignes ci-dessous (voir `utils/healthCheck.js`) :
// c'est aussi celle de `/health`, donc le vert affiché ici et le code HTTP
// renvoyé à Render ne peuvent pas diverger.
const { probe } = require('./_shared');
const logger = require('../../utils/logger');

exports.system = async (req, res) => {
  try {
    const checkedAt = new Date().toISOString();
    const sante = await probe();
    const dbStatus = sante.db === 'up' ? 'operational' : 'down';
    const dbLatency = sante.dbLatencyMs === null ? '—' : `${sante.dbLatencyMs} ms`;

    // L'indicateur « API » est MESURE, et non plus écrit en dur. Il affichait
    // `status: 'operational', latency: '<1 ms'` en litteral ; avec deux voisins
    // reellement sondes, ce desequilibre rendait le tableau entier suspect.
    const apiDegraded = sante.status === 'degraded';

  res.json([
      {
        id: 'api',
        label: 'API JOBSINC',
        status: apiDegraded ? 'degraded' : 'operational',
        // La latence affichée est celle de la dépendance la plus lente
        // rencontrée, donc une valeur réelle et non un plancher-fiction.
        latency: sante.dbLatencyMs === null ? '—' : `${sante.dbLatencyMs} ms`,
        checkedAt,
        // Détail utile quand le service n'est pas totalement sain : sans lui,
        // `degraded` ne disait pas CE QUI était en panne.
        detail: apiDegraded
          ? `Base : ${sante.db} · Cache : ${sante.redis} (${sante.rateLimitMode}) · Stockage : ${sante.storage.status}`
          : null,
      },
      { id: 'database', label: 'Base de données PostgreSQL', status: dbStatus, latency: dbLatency, checkedAt },
      {
        id: 'ratelimit',
        label: 'Quotas de requêtes',
        status: sante.rateLimitMode === 'distributed' ? 'operational' : 'degraded',
        latency: '—',
        detail: sante.rateLimitMode === 'distributed'
          ? 'Quotas globaux (Redis).'
          : 'Quotas PAR INSTANCE (sans Redis) : N instances = N fois le quota.',
        checkedAt,
      },
      {
        id: 'storage',
        label: 'Stockage des fichiers',
        // `degraded` distingue « fonctionne mais ne survivra pas » (local en
        // production) de `down» (« S3 configure mais injoignable »). L'ancien
        // code n avait que deux etats et le degradait au meme titre.
        status: sante.storage.status === 'ok' ? 'operational' : sante.storage.status,
        latency: sante.storage.latencyMs === null ? '—' : `${sante.storage.latencyMs} ms`,
        detail: sante.storage.reason,
        checkedAt,
      },
    ]);
  } catch (error) {
    logger.exception(error, { message: 'Erreur admin system:', scope: 'adminController' });
    res.status(500).json({ error: 'Impossible de vérifier l’état du système.' });
  }
};
