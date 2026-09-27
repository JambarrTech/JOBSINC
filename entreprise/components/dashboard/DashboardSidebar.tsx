'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import logo from '@/components/layout/logo.png';
import { assetUrl } from '@/lib/api';
import { signOut } from '@/lib/session';

type SidebarIcon = 'chart' | 'briefcase' | 'grid' | 'kanban' | 'lock' | 'mail' | 'users' | 'target';
const primaryItems = [['Vue d’ensemble', '/dashboard', 'grid'], ['Mes offres', '/dashboard/jobs', 'briefcase'], ['Statistiques', '/dashboard/analytics', 'chart'], ['Messages', '/dashboard/messages', 'mail']] as const;
const recruitmentItems = [['Candidatures', '/dashboard/applications', 'users'], ['Pipeline', '/dashboard/pipeline', 'kanban'], ['Matching', '/dashboard/matching', 'target']] as const;
const companyItems = [['Mon entreprise', '/dashboard/company', 'briefcase'], ['FAQ / Support', '/dashboard/faq', 'mail'], ['Témoignages', '/dashboard/feedback', 'chart'], ['Paramètres', '/dashboard/settings', 'lock']] as const;

export default function DashboardSidebar({ collapsed, mobileOpen, onClose, user }: { collapsed: boolean; mobileOpen: boolean; onClose: () => void; user?: { name?: string; role?: string; avatar?: string | null } }) {
  const pathname = usePathname(); const router = useRouter(); const [recruitmentOpen, setRecruitmentOpen] = useState(true); const displayName = user?.name || 'Compte entreprise'; const initials = displayName.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase(); const recruitmentActive = recruitmentItems.some(([, href]) => pathname === href || pathname.startsWith(`${href}/`));
  function toggleRecruitment() { setRecruitmentOpen((open) => !open); }
  function renderItems(items: readonly (readonly [string, string, SidebarIcon])[]) { return items.map(([label, href, icon]) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} className={`dashboard-nav-link ${active ? 'active' : ''}`} onClick={onClose} title={collapsed ? label : undefined} aria-current={active ? 'page' : undefined}><Icon name={icon} size={18} />{!collapsed && <span>{label}</span>}</Link>; }); }
  const avatarUrl = assetUrl(user?.avatar);
  async function handleLogout(e: React.MouseEvent) {
    e.preventDefault();
    // Les cookies d'accès sont HttpOnly : `document.cookie` ne peut pas les
    // effacer. La déconnexion passe par lib/session (DELETE BFF + /auth/logout).
    //
    // `router.refresh()` est nécessaire : le `matcher` de `proxy.ts` doit
    // rejouer la validation de session, sans quoi le payload RSC déjà en cache
    // continuerait de s'afficher comme authentifié.
    await signOut();
    router.push('/login');
    router.refresh();
  }
  return <aside className={`dashboard-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}><div className="dashboard-brand"><Link href="/" aria-label="JOBSINC accueil"><Image className="dashboard-brand-logo" src={logo} alt="JOBSINC" width={34} height={34} priority />{!collapsed && <span>JOB<span>SINC</span></span>}</Link><button type="button" className="sidebar-close" onClick={onClose} aria-label="Fermer le menu">×</button></div><nav className="dashboard-nav" aria-label="Navigation du dashboard"><div className="dashboard-nav-group"><span className="dashboard-nav-label">{!collapsed && 'Principal'}</span>{renderItems(primaryItems)}</div><div className={`dashboard-nav-group dashboard-recruitment-group ${!recruitmentOpen ? 'is-closed' : ''}`}><button type="button" className={`dashboard-nav-label dashboard-nav-toggle ${recruitmentActive ? 'has-active' : ''}`} onClick={toggleRecruitment} aria-expanded={recruitmentOpen}>{!collapsed && <><span>Recrutement</span><span aria-hidden="true">{recruitmentOpen ? '⌄' : '›'}</span></>}</button>{(!collapsed && recruitmentOpen) && renderItems(recruitmentItems)}{collapsed && renderItems(recruitmentItems)}</div><div className="dashboard-nav-group"><span className="dashboard-nav-label">{!collapsed && 'Entreprise'}</span>{renderItems(companyItems)}</div></nav><div className="dashboard-user"><div className="dashboard-avatar">{avatarUrl ? <Image src={avatarUrl} alt={displayName} width={34} height={34} unoptimized /> : initials || 'E'}</div>{!collapsed && <div className="dashboard-user-copy"><strong>{displayName}</strong><span>{user?.role || 'Compte entreprise'}</span></div>}{!collapsed && <a href="/login" className="dashboard-logout" onClick={handleLogout} aria-label="Se déconnecter">↗</a>}</div></aside>;
}
