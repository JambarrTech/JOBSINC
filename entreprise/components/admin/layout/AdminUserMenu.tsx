'use client';

import { useRef, useState } from 'react';
import { AdminUser, getAdminUserLabel } from '@/lib/admin-api';
import { useEscapeToClose } from '@/components/ui/useDialogFocus';

// Le lien « Paramètres » a été retiré : /admin/settings n'existe pas côté
// backend et le catalogue des sections admin le refuse désormais (404 explicite
// au lieu d'afficher silencieusement les données d'une autre section).
//
// `useEscapeToClose` a été ajouté : le menu s'ouvrait au clic et ne pouvait
// plus être refermé au clavier une fois ouvert (ni par Échap, ni en
// restituant le focus au bouton déclencheur).
// `role="menu"` / `role="menuitem"` ont été RETIRÉS.
//
// Le pattern ARIA « menu » IMPOSE une navigation aux flèches : roving
// `tabindex`, `ArrowDown`/`ArrowUp` entre les éléments, `Home`/`End`,
// `Escape` qui referme et rend le focus au déclencheur. Aucun de ces
// comportements n'était implémenté : la tabulation entrait dans le menu puis
// en sortait comme dans n'importe quel groupe de liens, et un lecteur d'écran
// annonçait « menu » en annonçant qu'il n'était pas operable au clavier —
// ce qui est pire que de ne pas l'annoncer du tout.
//
// Le menu ne contient qu'UNE action (« Déconnexion »). Un `<button>` +
// `<div>`, avec `aria-expanded` + `aria-controls` (l'état réellement utile à
// la technologies d'assistance) et `useEscapeToClose` (voir
// `components/ui/useDialogFocus.ts`), est le rendu correct ici.
export default function AdminUserMenu({ user, onLogout }: { user: AdminUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelId = 'admin-user-menu-panel';
  useEscapeToClose(menuRef, () => setOpen(false), open);

  return (
    <div className="admin-user-menu" ref={menuRef}>
      <button
        className="admin-user-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <span className="admin-header-avatar">{getAdminUserLabel(user).slice(0, 1).toUpperCase()}</span>
        <span>{getAdminUserLabel(user)}</span>
        <b>⌄</b>
      </button>
      {open ? (
        <div className="admin-user-dropdown" id={panelId}>
          <strong>{getAdminUserLabel(user)}</strong>
          <small>{user.role || 'Administrateur'}</small>
          <button onClick={onLogout}>Déconnexion</button>
        </div>
      ) : null}
    </div>
  );
}
