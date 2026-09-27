'use client';

import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/Icon';
import { AdminUser } from '@/lib/admin-api';
import AdminGlobalSearch from './layout/AdminGlobalSearch';
import AdminNotificationMenu from './layout/AdminNotificationMenu';
import AdminUserMenu from './layout/AdminUserMenu';

/**
 * Titres de l'en-tête, par chemin.
 *
 * Les entrées `/admin/security` et `/admin/settings` ont été RETIRÉES : ces
 * routes n'existent pas. `/admin/<segment>` est résolu par
 * `app/admin/[section]/page.tsx`, qui appelle `notFound()` si le segment n'est
 * pas une clé de `ADMIN_RESOURCE_CONFIGS` — et ni `security` ni `settings` n'en
 * sont une (les clés réelles sont `securityAlerts` et `logins`). Ces deux
 * libellés ne servaient donc à rien, et pire : ils donnaient l'impression que
 * ces écrans existaient.
 *
 * Les segments réellement atteignables sont listés, y compris les routes
 * imbriquées (`/admin/security/logins`, etc.) qui tombaient sinon sur le
 * libellé générique « Administration ».
 */
const titles: Record<string, string> = {
  '/admin': 'Vue d’ensemble',
  '/admin/users': 'Tous les utilisateurs',
  '/admin/candidates': 'Candidats',
  '/admin/employees': 'Employés',
  '/admin/companies': 'Entreprises / recruteurs',
  '/admin/administrators': 'Administrateurs',
  '/admin/jobs': 'Offres',
  '/admin/applications': 'Candidatures',
  '/admin/interviews': 'Entretiens',
  '/admin/recruitments': 'Recrutements',
  '/admin/reports': 'Signalements',
  '/admin/moderation': 'Modération',
  '/admin/moderation/content': 'Contenus à modérer',
  '/admin/analytics': 'Statistiques',
  '/admin/analytics/trends': 'Tendances',
  '/admin/reports/analytics': 'Rapports analytiques',
  '/admin/activity': 'Activité',
  '/admin/activity/audit': 'Journal d’audit',
  '/admin/sessions': 'Sessions',
  '/admin/security/logins': 'Connexions',
  '/admin/security/alerts': 'Alertes de sécurité',
  '/admin/notifications': 'Notifications',
  '/admin/system': 'Santé du système',
  '/admin/maintenance': 'Maintenance',
  '/admin/faq': 'FAQ',
  '/admin/feedback': 'Retours',
  '/admin/login': 'Connexion',
};

export default function AdminHeader({ user, onMenu, onLogout }: { user: AdminUser; onMenu: () => void; onLogout: () => void }) {
  const pathname = usePathname();
  return <header className="admin-header"><div className="admin-header-title"><button className="admin-menu-button" onClick={onMenu} aria-label="Ouvrir la navigation"><Icon name="grid" size={20} /></button><div><span>Administration JOBSINC</span><h1>{titles[pathname] || 'Administration'}</h1></div></div><div className="admin-header-actions"><AdminGlobalSearch /><AdminNotificationMenu /><AdminUserMenu user={user} onLogout={onLogout} /></div></header>;
}
