import { headers } from 'next/headers';

/**
 * Identité de session, lue CÔTÉ SERVEUR.
 *
 * ============================================================
 * POURQUOI EXISTER
 * ============================================================
 * Il y avait deux gardes d'authentification côté CLIENT
 * (`components/dashboard/DashboardAuthGuard` et
 * `components/admin/AdminAuthGuard`) qui appelaient toutes deux `/auth/me` au
 * montage. Elles étaient :
 *
 *  - REDONDANTES : `proxy.ts` venait de valider exactement la même chose, sur
 *    la même requête. Deux allers-retours pour une seule vérification.
 *  - DÉTRUCTIVES : leur `catch` était INCONDITIONNEL. Une coupure réseau de
 *    30 secondes, un DNS qui ne résout pas, un 502 de passerelle : tous ces
 *    cas prenaient le même chemin qu'un jeton révoqué. Le garde SUPPRIMAIT
 *    alors les cookies de session et forçait une redirection. Un token valide
 *    était détruit par un incident réseau.
 *  - ET CE N'ÉTAIENT PAS DES FRONTIÈRES DE SÉCURITÉ : tout ce qu'elles
 *    enveloppaient était déjà protégé soit par `proxy.ts` (serveur), soit par
 *    le backend sur chaque appel API. Les supprimer neperdait aucune donnée et
 *    n'accordait aucun privilège.
 *
 * De plus, ces gardes étant côté client, les 15 pages `/dashboard` et les 13
 * pages `/admin` livraient du HTML vide : aucun contenu en streaming, aucun
 * premier paint, et un aller-retour supplémentaire avant tout affichage.
 *
 * ============================================================
 * LE CONTRAT
 * ============================================================
 * `proxy.ts` injecte `x-jobsinc-user-id` et `x-jobsinc-user-role` dans les
 * headers de requête APRÈS avoir vérifié le jeton auprès de l'API. Ces
 * headers sont donc la vérité serveur, et ne sont atteignables que depuis un
 * composant serveur — un composant client ne peut pas lire les headers de
 * requête.
 *
 * Toute page `/admin/**` ou `/dashboard/**` passe par `proxy.ts` (cf. son
 * `matcher`). Un `null` ici signifie donc « le proxy n'a pas fourni
 * l'identité », ce qui ne devrait pas arriver : on le traite en session absente
 * plutôt que de faire confiance.
 */

export type VerifiedUser = {
  id: string;
  role?: string;
};

/**
 * Renvoie l'identité vérifiée par `proxy.ts`, ou `null` si elle est absente.
 * N'effectue AUCUN appel réseau : c'est une lecture de header de requête.
 */
export async function getVerifiedUser(): Promise<VerifiedUser | null> {
  const h = await headers();
  const id = h.get('x-jobsinc-user-id');
  if (!id) return null;
  return { id, role: h.get('x-jobsinc-user-role') ?? undefined };
}

// `isVerifiedAdmin()` a été SUPPRIMÉ : aucun appelant (vérifié par grep sur
// `app/`, `components/`, `lib/` et `tests/`). Le contrôle de rôle
// administrateur est fait à UN seul endroit, côté serveur, par `proxy.ts`
// (qui utilise `isAdminRole` de `lib/admin-roles.ts` pour rediriger) puis
// defendu en profondeur par `components/admin/AdminShell.tsx`. Un troisième
// raccourci « l'utilisateur vérifié est-il admin ? » ne pouvait qu'être un
// endroit de plus où la décision serait prise sans le contexte du proxy.

