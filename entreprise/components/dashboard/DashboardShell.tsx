import type { ReactNode } from 'react';
import { DashboardProvider } from './DashboardContext';
import DashboardFrame from './DashboardFrame';

/**
 * CE COMPOSANT EST UN COMPOSANT SERVEUR.
 *
 * Le garde `DashboardAuthGuard` qui enveloppait l'arbre a été SUPPRIMÉ. Il
 * faisait un second `/auth/me` côté client — déjà fait par `proxy.ts` sur la
 * même requête — et son `catch` inconditionnel SUPPRIMAIT les cookies de
 * session puis redirigeait vers `/login` sur une simple panne réseau, détruisant
 * une session parfaitement valide. Il rendait aussi chaque page dashboard vide
 * jusqu'à l'exécution de JavaScript.
 *
 * L'authentification est désormais entièrement assurée par `proxy.ts`, qui
 * refuse l'accès (fail-closed, avec redirection) si la session est invalide et
 * qui transmet l'identité vérifiée dans `x-jobsinc-user-*`. Aucun composant
 * client ne peut contourner ce garde : le HTML n'est produit qu'après son
 * passage.
 *
 * `DashboardProvider` et `DashboardFrame` restent des composants clients (ils
 * portent l'état de données et l'état de repli de la barre latérale). Les
 * `children` sont rendus côté serveur et leur traversent : le contenu de la page
 * est donc dans le HTML initial, et non ajouté après hydratation.
 *
 * Les props `user` et `notifications` ont également été retirées : elles étaient
 * déclarées dans le type mais JAMAIS lues (le cadre redérivait `user` depuis le
 * contexte, ligne 20 de l'ancienne version).
 */
export default function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardFrame>{children}</DashboardFrame>
    </DashboardProvider>
  );
}
