'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { type AdminUser } from '@/lib/admin-api';
import { signOut } from '@/lib/session';

/**
 * Cadre de la console d'administration : repli de la barre latérale, en-tête,
 * et déconnexion.
 *
 * Extrait de `AdminShell` lors du passage de celui-ci en composant serveur.
 * L'identité est reçue en prop depuis le serveur (vérifiée par `proxy.ts`),
 * ce qui supprime le `onUser` remonté à travers trois niveaux
 * (AdminShell → AdminSidebar / AdminHeader → AdminUserMenu) et le state local
 * qui ne servait qu'à transporter cette valeur.
 */
export default function AdminShellFrame({ children, user }: { children: React.ReactNode; user: AdminUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { function escape(event: KeyboardEvent) { if (event.key === 'Escape') setMobileOpen(false); } document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape); }, []);
  function toggleCollapsed() { setCollapsed((value) => !value); }
  // Les cookies d'accès sont HttpOnly : `document.cookie` ne peut pas les
  // effacer (les anciennes lignes de nettoyage étaient donc sans effet et
  // donnaient l'illusion d'une déconnexion). Voir lib/session.
  //
  // `router.refresh()` après `push` : le proxy doit être rejoué pour valider
  // l'absence de session, sinon on afficherait le payload RSC encore authentifié.
  async function logout() { await signOut(); router.push('/admin/login'); router.refresh(); }
  if (pathname === '/admin/login') return <>{children}</>;
  return <div className="admin-shell"><AdminSidebar user={user} collapsed={collapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} onToggle={toggleCollapsed} onLogout={logout} /><div className="admin-main"><AdminHeader user={user} onMenu={() => setMobileOpen((value) => !value)} onLogout={logout} /><div className="admin-content">{children}</div></div>{mobileOpen ? <button className="admin-overlay" aria-label="Fermer la navigation" onClick={() => setMobileOpen(false)} /> : null}</div>;
}
