'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// `security` a été RETIRÉ de la liste des ROUTES mais reste présent comme
// segment de fil d'Ariane : il est le parent des pages imbriquées réelles
// `/admin/security/logins` et `/admin/security/alerts`. Le segment seul
// `/admin/security` renvoie un 404. `settings` a également été retiré : la
// route n'existe plus.
const names: Record<string, string> = { admin: 'Administration', users: 'Utilisateurs', candidates: 'Candidats', employees: 'Employés', companies: 'Entreprises', administrators: 'Administrateurs', jobs: 'Offres', applications: 'Candidatures', interviews: 'Entretiens', recruitments: 'Recrutements', moderation: 'Modération', content: 'Contenus', reports: 'Signalements', analytics: 'Analyse', trends: 'Tendances', activity: 'Activité', audit: 'Journal d’audit', sessions: 'Sessions', security: 'Sécurité', logins: 'Connexions', alerts: 'Alertes', notifications: 'Notifications', system: 'Système', maintenance: 'Maintenance', faq: 'FAQ', feedback: 'Retours', login: 'Connexion' };
export default function AdminBreadcrumbs() { const pathname = usePathname(); const parts = pathname.split('/').filter(Boolean); return <nav className="admin-breadcrumbs" aria-label="Fil d’Ariane">{parts.map((part, index) => { const href = `/${parts.slice(0, index + 1).join('/')}`; return <span key={href}>{index ? '›' : null}{index === parts.length - 1 ? <strong>{names[part] || 'Détail'}</strong> : <Link href={href}>{names[part] || part}</Link>}</span>; })}</nav>; }
