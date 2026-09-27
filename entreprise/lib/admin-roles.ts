// Rôles autorisés à accéder à l'espace /admin.
//
// Source de vérité UNIQUE, importée à la fois par `proxy.ts` (qui protège les
// routes côté serveur) et par `lib/admin-api.ts` (utilisé côté client), ainsi
// que par `lib/session-server.ts` (défense en profondeur côté rendu).
//
// Ces listes divergeaient auparavant : le proxy exigeait `role === 'ADMIN'` de
// façon stricte alors que le client autorisait aussi SUPER_ADMIN et
// SYSTEM_ADMIN. Résultat : un SUPER_ADMIN se connectait, était redirigé vers
// /admin, puis était immédiatement renvoyé vers /login (boucle).
//
// `SUPER_ADMIN` et `SYSTEM_ADMIN` ont été RETIRÉS de la liste par défaut : ces
// rôles n'existent pas. `enum Role` du schéma Prisma
// (`backend/prisma/schema.prisma`) ne contient que :
//
//     CANDIDATE | EMPLOYEE | RECRUITER | ADMIN
//
// Les garder créait un Piège de configuration : définir
// `NEXT_PUBLIC_ADMIN_ROLES=SUPER_ADMIN` faisait passer `proxy.ts` (qui lit
// cette variable), donc l'utilisateur arrivait sur `/admin`… où
// `backend/src/middlewares/adminMiddleware.js` renvoyait 403, faute de rôle
// correspondant en base. Un rôle qui ne revendique pas une autorité que le
// backend reconnaît est un rôle qui ne fonctionne pas. La liste par défaut doit
// énumérer des rôles RÉELLEMENT accordables.
//
// La surcharge `NEXT_PUBLIC_ADMIN_ROLES` reste possible pour un déploiement
// dont le schéma Prisma aurait été étendu — mais elle doit alors correspondre
// à `enum Role`, sinon le frontend admet un rôle que le backend refuse.

const DEFAULT_ADMIN_ROLES = ['ADMIN'] as const;

/**
 * Liste des rôles admin normalisés, surchargeable via NEXT_PUBLIC_ADMIN_ROLES
 * (liste séparée par des virgules). Comparaison insensible à la casse.
 */
export function getAdminRoles(): string[] {
  const configured = process.env.NEXT_PUBLIC_ADMIN_ROLES
    ?.split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return configured?.length ? configured : [...DEFAULT_ADMIN_ROLES];
}

/** True si le rôle fourni donne accès à l'espace admin. */
export function isAdminRole(role?: string | null): boolean {
  const normalized = role?.trim().toUpperCase();
  if (!normalized) return false;
  return getAdminRoles().includes(normalized);
}

/** True si l'utilisateur correspond à un rôle admin. */
export function hasAdminRole(user?: { role?: string } | null): boolean {
  return isAdminRole(user?.role);
}

/** Rôles autorisés dans l'espace recruteur (/dashboard). */
export function isRecruiterRole(role?: string | null): boolean {
  const normalized = role?.trim().toUpperCase();
  return normalized === 'RECRUITER' || normalized === 'ADMIN';
}
