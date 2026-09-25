'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import AdminAuthGuard from '@/components/admin/AdminAuthGuard';
import AdminHeader from '@/components/admin/AdminHeader';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { AdminUser } from '@/lib/admin-api';

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AdminUser>({});
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { function escape(event: KeyboardEvent) { if (event.key === 'Escape') setMobileOpen(false); } document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape); }, []);
  function toggleCollapsed() { setCollapsed((value) => !value); }
  async function logout() { try { await fetch('/api/auth/cookie', { method: 'DELETE', credentials: 'include' }); } catch {} document.cookie = 'jobsinc_token=; path=/; max-age=0'; document.cookie = 'jobsinc_admin_user=; path=/; max-age=0'; // Déconnexion côté backend (clear httpOnly backend cookie)
    try { await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://jobsinc.onrender.com/api'}/auth/logout`, { method: 'POST', credentials: 'include' }); } catch {} window.location.assign('/admin/login'); }
  if (pathname === '/admin/login') return <>{children}</>;
  return <AdminAuthGuard onUser={setUser}><div className="admin-shell"><AdminSidebar user={user} collapsed={collapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} onToggle={toggleCollapsed} onLogout={logout} /><div className="admin-main"><AdminHeader user={user} onMenu={() => setMobileOpen((value) => !value)} onLogout={logout} /><div className="admin-content">{children}</div></div>{mobileOpen ? <button className="admin-overlay" aria-label="Fermer la navigation" onClick={() => setMobileOpen(false)} /> : null}</div></AdminAuthGuard>;
}
