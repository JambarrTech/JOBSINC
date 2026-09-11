export type AdminNavItem = { label: string; href: string; icon: 'grid' | 'users' | 'briefcase' | 'mail' | 'chart' | 'target' | 'lock' | 'spark'; permission?: string };
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const adminNavigation: AdminNavGroup[] = [
  { label: 'Administration', items: [{ label: 'Vue d’ensemble', href: '/admin', icon: 'grid' }] },
  { label: 'Utilisateurs', items: [{ label: 'Tous les utilisateurs', href: '/admin/users', icon: 'users' }, { label: 'Candidats', href: '/admin/candidates', icon: 'users' }, { label: 'Employés', href: '/admin/employees', icon: 'users' }, { label: 'Entreprises', href: '/admin/companies', icon: 'briefcase' }, { label: 'Administrateurs', href: '/admin/administrators', icon: 'lock', permission: 'manage_admins' }] },
  { label: 'Recrutement', items: [{ label: 'Offres', href: '/admin/jobs', icon: 'briefcase' }, { label: 'Candidatures', href: '/admin/applications', icon: 'mail' }, { label: 'Entretiens', href: '/admin/interviews', icon: 'target' }, { label: 'Recrutements', href: '/admin/recruitments', icon: 'spark' }] },
  { label: 'Modération', items: [{ label: 'Signalements', href: '/admin/reports', icon: 'target' }, { label: 'Modération', href: '/admin/moderation', icon: 'spark' }, { label: 'Contenus', href: '/admin/moderation/content', icon: 'mail' }] },
  { label: 'Support', items: [{ label: 'Questions FAQ', href: '/admin/faq', icon: 'mail' }, { label: 'Témoignages', href: '/admin/feedback', icon: 'spark' }] },
  { label: 'Analyse', items: [{ label: 'Statistiques', href: '/admin/analytics', icon: 'chart' }, { label: 'Tendances', href: '/admin/analytics/trends', icon: 'chart' }, { label: 'Rapports', href: '/admin/reports/analytics', icon: 'chart' }, { label: 'Activité', href: '/admin/activity', icon: 'spark' }] },
  { label: 'Sécurité', items: [{ label: 'Sessions', href: '/admin/sessions', icon: 'lock' }, { label: 'Connexions', href: '/admin/security/logins', icon: 'lock' }, { label: 'Alertes', href: '/admin/security/alerts', icon: 'target' }, { label: 'Journal d’audit', href: '/admin/activity/audit', icon: 'spark' }] },
  { label: 'Système', items: [{ label: 'Santé du système', href: '/admin/system', icon: 'chart' }, { label: 'Notifications', href: '/admin/notifications', icon: 'mail' }, { label: 'Maintenance', href: '/admin/maintenance', icon: 'lock' }, { label: 'Paramètres', href: '/admin/settings', icon: 'grid' }] },
];
