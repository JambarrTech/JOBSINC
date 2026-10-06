/**
 * Construction des URL de fichiers servis par le backend.
 *
 * Ces deux helpers vivaient dans `lib/api.ts`, où ils étaient IMPORTABLES par
 * tout le monde mais TESTABLES par personne : `lib/api.ts` importe `@/lib/api-url`,
 * un alias que le runner de tests ne résout pas. Les recopier dans un test
 * n'aurait rien prouvé sur le code réellement exécuté — c'est pourquoi ce module
 * existe, avec un import RELATIF de `api-url` (voir `tests/assets.test.ts`).
 *
 * `lib/api.ts` les réexporte : aucun appelant n'a changé.
 */
// Import RELATIF et AVEC extension : c'est ce qui rend ce fichier importable
// par le runner de tests, qui ne résout ni l'alias `@/` ni les extensions
// implicites. `allowImportingTsExtensions` est vrai dans tsconfig.json:14.
import { API_ORIGIN } from './api-url.ts';

/**
 * Origine backend autorisée pour les fichiers servis par l'API.
 *
 * Auparavant, `assetUrl` acceptait N'IMPORTE QUELLE URL `https://`. Combiné
 * à un `img-src https:` large, un logo d'entreprise hostile stocké en base
 * devenait un pixel de suivi (ou un canal d'exfiltration) sur toutes les pages
 * qui l'affichaient. Les fichiers d'upload sont tous servis par le backend,
 * donc on vérifie l'origine au lieu de faire confiance au chemin seul.
 */
const isTrustedAssetOrigin = (value: string): boolean => {
  try {
    return new URL(value).origin === API_ORIGIN;
  } catch {
    return false;
  }
};

/**
 * Re-pointe une URL absolue héritée vers NOTRE backend.
 *
 * Retourne `null` si le chemin ne-designe pas un fichier d'upload.
 *
 * Pourquoi re-pointer plutôt que rejeter : la base contient des valeurs
 * historiques que le backend sait migrer (`s3KeyFromStoredUrl` absorbe la clé
 * relative, le chemin applicatif ET l'ancienne URL publique S3). Le backend les
 * normalise désormais avant de les servir — voir `canonicalUploadPath` dans
 * `backend/src/services/storageService.js`. Mais une ligne écrite AVANT cette
 * normalisation, ou un enregistrement importé, peut encore contenir une URL
 * absolue sur un autre hôte (`…onrender.com`, un ancien `api.` , le bucket S3
 * direct). Rejeter rendait l'image cassée alors que le fichier est parfaitement
 * servi par l'API.
 *
 * Ce re-pointage n'affaiblit PAS la protection anti-exfiltration : on ne charge
 * jamais depuis l'hôte tiers, on exige un chemin `/uploads/` et on réécrit vers
 * `API_ORIGIN`. Un logo hostile stocké en base reste donc impossible à afficher —
 * il est simplement rendu inerte.
 */
function rebaseUploadPath(value: string): string | null {
  let path: string;
  try {
    path = new URL(value).pathname;
  } catch {
    return null;
  }
  if (!path.startsWith('/uploads/') || path.includes('..')) return null;
  return `${API_ORIGIN}${path}`;
}

export const assetUrl = (value?: string | null) => {
  if (!value) return null;
  // Le rejet de `..` porte sur TOUTE valeur, pas seulement sur la forme
  // relative. Il n'était testé qu'en fin de branche relative : une URL absolue
  // de confiance contenant `/uploads/../secret` passait donc le contrôle et
  // était normalisée par `new URL()` en `/secret`. Même origine, donc pas une
  // exfiltration — mais une divergence de comportement selon la forme stockée,
  // et `cvHref` testait déjà `..` en tête. On aligne les deux.
  if (value.includes('..')) return null;
  if (/^https?:\/\//i.test(value)) {
    if (isTrustedAssetOrigin(value)) return value;
    return rebaseUploadPath(value);
  }
  if (!value.startsWith('/uploads/')) return null;
  try { return new URL(value, API_ORIGIN).toString(); } catch { return null; }
};

export const cvHref = (value?: string | null) => {
  if (!value || value.includes('..')) return null;
  if (/^https?:\/\//i.test(value)) {
    // Une URL absolue de CV doit venir de l'API : sinon un champ `cvUrl`
    // injecté pourrait pointer vers n'importe quel hôte.
    if (isTrustedAssetOrigin(value)) return value;
    return rebaseUploadPath(value);
  }
  if (!value.startsWith('/uploads/cvs/')) return null;
  try { return new URL(value, API_ORIGIN).toString(); } catch { return null; }
};
