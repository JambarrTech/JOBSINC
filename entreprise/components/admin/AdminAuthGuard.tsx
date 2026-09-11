'use client';

import { useEffect, useState } from 'react';
import { AdminUser, isAdminUser, verifyAdminSession } from '@/lib/admin-api';

export default function AdminAuthGuard({ children, onUser }: { children: React.ReactNode; onUser: (user: AdminUser) => void }) {
  const [state, setState] = useState<'checking' | 'authorized' | 'forbidden'>('checking');

  useEffect(() => {
    let active = true;
    async function checkSession() {
      const token = localStorage.getItem('jobsinc_token');
      const storedUser = localStorage.getItem('jobsinc_admin_user');
      if (!token || !storedUser) {
        window.location.assign('/admin/login');
        return;
      }

      try {
        let user = JSON.parse(storedUser) as AdminUser;
        const verified = await verifyAdminSession();
        if (verified?.user) user = verified.user;
        if (!isAdminUser(user)) {
          if (active) setState('forbidden');
          return;
        }
        localStorage.setItem('jobsinc_admin_user', JSON.stringify(user));
        document.cookie = `jobsinc_token=${localStorage.getItem('jobsinc_token') || ''}; path=/; max-age=${24 * 60 * 60}; SameSite=Lax`;
        document.cookie = `jobsinc_admin_user=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=${24 * 60 * 60}; SameSite=Lax`;
        if (active) {
          onUser(user);
          setState('authorized');
        }
      } catch {
        if (active) setState('forbidden');
      }
    }
    checkSession();
    function onStorage(event: StorageEvent) {
      if (event.key === 'jobsinc_admin_user' || event.key === 'jobsinc_token') checkSession();
    }
    window.addEventListener('storage', onStorage);
    return () => { active = false; window.removeEventListener('storage', onStorage); };
  }, [onUser]);

  if (state === 'checking') return <div className="admin-session-state"><div className="admin-spinner" aria-hidden="true" /><p>Vérification de votre session…</p></div>;
  if (state === 'forbidden') return <div className="admin-session-state"><div className="admin-state-icon">!</div><h1>Accès refusé</h1><p>Votre compte n’est pas autorisé à accéder à l’administration JOBSINC.</p><button className="admin-button admin-button-secondary" onClick={() => { localStorage.removeItem('jobsinc_admin_user'); window.location.assign('/admin/login'); }}>Retour à la connexion</button></div>;
  return <>{children}</>;
}
