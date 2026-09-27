import type { ReactNode } from 'react';
import AdminShellFrame from './AdminShellFrame';
import { getVerifiedUser } from '@/lib/session-server';
import { isAdminRole } from '@/lib/admin-roles';

/**
 * CE COMPOSANT EST UN COMPOSANT SERVEUR.
 *
 * Le garde `AdminAuthGuard` a été SUPPRIMÉ. Il revalidait la session via
 * `/auth/me` alors que `proxy.ts` venait de le faire sur la même requête, et
 * son `catch {}` nu redirigait vers `/admin/login` sur une panne réseau aussi
 * bien que sur une vraie révocation. Il rendait en plus chaque page admin vide
 * jusqu'à l'exécution de JavaScript, sans rien protéger : `/admin/**` et
 * `/dashboard/**` sont déjà couvertes par le `matcher` de `proxy.ts`, qui
 * refuse l'accès si la session est invalide.
 *
 * L'identité vient maintenant des headers que `proxy.ts` n'injecte qu'après
 * avoir vérifié le jeton auprès de l'API. Elle est donc lue UNE fois, côté
 * serveur, sans appel réseau supplémentaire.
 *
 * `proxy.ts` n'injecte pas l'identité si le rôle n'est pas administrateur, et
 * redirige dans ce cas. Le `isAdminRole` ci-dessous est une défense en
 * profondeur : si le proxy était désactivé ou mal configuré, cette page rend
 * un refus au lieu d'afficher une console d'administration.
 */
export default async function AdminShell({ children }: { children: ReactNode }) {
  const user = await getVerifiedUser();

  // `/admin/login` doit rester accessible et ne dépend d'aucune session.
  // `proxy.ts` ne redirige pas les utilisateurs non authentifiés vers
  // `/admin/login` : la page doit donc se rendre normalement.
  if (!user) {
    return <AdminShellFrame user={{}}>{children}</AdminShellFrame>;
  }

  if (!isAdminRole(user.role)) {
    return (
      <div className="admin-session-state">
        <div className="admin-state-icon">!</div>
        <h1>Accès refusé</h1>
        <p>Votre compte n’est pas autorisé à accéder à l’administration JOBSINC.</p>
      </div>
    );
  }

  return <AdminShellFrame user={{ id: user.id, role: user.role }}>{children}</AdminShellFrame>;
}
