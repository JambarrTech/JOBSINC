// ============================================================
// LOGGER STRUCTURÉ
//
// Pourquoi ce fichier existe
// --------------------------
// L'application n'émettait qu'UNE seule ligne structurée (le access log de
// `app.js`, un `JSON.stringify`) et environ 130 `console.error('Erreur xxx:', e)`
// en texte libre. Conséquence concrète : une ligne d'erreur ne pouvait PAS être
// reliée à sa ligne d'accès. Il fallait qu'un humain fasse le lien par
// `requestId` à la main, dans deux formats, sur deux plateformes de logs
// différentes (Render et Vercel n'agrègent pas de la même façon).
//
// Ce module fixe UN schéma. Toutes les lignes produites ici partagent les mêmes
// clés, donc `requestId` suffit à corréler, et `level` permet enfin de
// distinguer une panne (500) d'une saisie invalide (400).
//
// Volontairement SANS dépendance : un logger tiers serait une de plus à auditer,
// et le besoin réel se limite à « une ligne JSON par événement, corrélable ».
// ============================================================

/**
 * Champs qu'une ligne peut porter. Toute clé absente est simplement omise,
 * ce qui évite d'émettre `"userId": null` sur chaque ligne qui n'a pas d'utilisateur.
 */
function buildLine({ level, message, requestId, method, path, status, durationMs, userId, scope, code, stack, extra }) {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
  };

  if (requestId !== undefined && requestId !== null) line.requestId = requestId;
  if (method) line.method = method;
  if (path) line.path = path;
  if (status !== undefined && status !== null) line.status = status;
  if (durationMs !== undefined && durationMs !== null) line.durationMs = durationMs;
  if (userId) line.userId = userId;
  if (scope) line.scope = scope;
  if (code) line.code = code;
  if (stack) line.stack = stack;
  if (extra && typeof extra === 'object') Object.assign(line, extra);

  return line;
}

/**
 * `level` est normalisé sur trois valeurs. Un niveau inconnu ne doit jamais
 * faire perdre une ligne : il est ramené à `info` plutôt que jeté.
 */
function normalizeLevel(level) {
  if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') return level;
  return 'info';
}

function emit(level, fields) {
  const line = buildLine({ ...fields, level: normalizeLevel(level) });
  const payload = JSON.stringify(line);
  // On écrit sur le flux natif de chaque niveau plutôt que sur `console.*` :
  // `console.error` préfixe d'une pile, ce qui casserait le JSON. Les agrégateurs
  // lisent stderr comme de l'ERREUR, ce qui est la sémantique voulue ici.
  if (line.level === 'error') process.stderr.write(`${payload}\n`);
  else process.stdout.write(`${payload}\n`);
}

const logger = {
  info(fields) { emit('info', fields); },
  warn(fields) { emit('warn', fields); },
  error(fields) { emit('error', fields); },
  debug(fields) {
    // Le debug est bruyant et n'a aucun usage en production : il est
    // volontairement filtré sauf si on le demande explicitement.
    if (process.env.LOG_LEVEL === 'debug') emit('debug', fields);
  },

  /**
   * Raccourci le plus courant : journaliser une exception.
   *
   * `LOG_LEVEL` est documenté dans `.env.example` mais n'était lu nulle part :
   * c'est un bouton qui ne faisait rien. Il sert ici à masquer les piles en
   * production, où le volume prime sur le diagnostic ligne à ligne.
   */
  exception(err, fields = {}) {
    const isProd = process.env.NODE_ENV === 'production' && process.env.LOG_LEVEL !== 'debug';
    return emit('error', {
      ...fields,
      message: fields.message || (err && err.message) || 'Erreur inconnue',
      code: fields.code || (err && err.code) || undefined,
      // `name` est positionné par AppError (voir utils/errors.js), donc une
      // ValidationError se distingue d'une panne serveur dans l'agrégateur.
      scope: fields.scope || (err && err.name) || undefined,
      stack: isProd ? undefined : ((err && err.stack) || undefined),
    });
  },
};

module.exports = logger;
