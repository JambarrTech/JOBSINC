'use client';

import { useEffect, useState } from 'react';
import { AdminUser, isAdminUser, verifyAdminSession } from '@/lib/admin-api';

export default function AdminAuthGuard({ children, onUser }: { children: React.ReactNode; onUser: (user: AdminUser) => void }) {
  const [state, setState] = useState<'checking' | 'authorized' | 'forbidden'>('checking');

  useEffect(() => {
    let active = true;
    async function checkSession() {
      // Auth sécurisée : uniquement cookie HttpOnly + vérification backend en base.
      try {
        const verified = await verifyAdminSession();
        if (verified?.user && isAdminUser(verified.user)) {
          const user = verified.user;
          // Cookie non-HttpOnly réservé à l'affichage, aucun token côté JavaScript.
          document.cookie = `jobsinc_admin_user=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=${24 * 60 * 60}; SameSite=Lax`;
          if (active) {
            onUser(user);
            setState('authorized');
          }
          return;
        }
      } catch {}
      window.location.assign('/admin/login');
    }
    checkSession();
    return () => { active = false; };
  }, [onUser]);

  if (state === 'checking') return <div className="admin-session-state"><div className="admin-spinner" aria-hidden="true" /><p>Vérification de votre session…</p></div>;
  if (state === 'forbidden') return <div className="admin-session-state"><div className="admin-state-icon">!</div><h1>Accès refusé</h1><p>Votre compte n’est pas autorisé à accéder à l’administration JOBSINC.</p><button className="admin-button admin-button-secondary" onClick={async () => { try { await fetch('/api/auth/cookie', { method: 'DELETE', credentials: 'include' }); } catch {} try { await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://jobsinc.onrender.com/api'}/auth/logout`, { method: 'POST', credentials: 'include' }); } catch {} document.cookie = 'jobsinc_admin_user=; path=/; max-age=0'; window.location.assign('/admin/login'); }}>Retour à la connexion</button></div>;
  return <>{children}</>;
}
