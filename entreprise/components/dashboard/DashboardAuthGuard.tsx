'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

export default function DashboardAuthGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'authorized' | 'unauthorized'>('checking');
  useEffect(() => { let active = true;     async function check() { try { await apiRequest(process.env.NEXT_PUBLIC_SESSION_ENDPOINT || '/auth/me'); if (active) setState('authorized'); } catch { try { await fetch('/api/auth/cookie', { method: 'DELETE', credentials: 'include' }); } catch {} try { localStorage.removeItem('jobsinc_token'); } catch {} if (active) setState('unauthorized'); window.location.assign('/login?redirect=/dashboard'); } } check(); return () => { active = false; }; }, []);
  if (state === 'checking') return <div className="dashboard-state"><span>Vérification de votre session…</span></div>;
  if (state === 'unauthorized') return <div className="dashboard-state dashboard-error"><strong>Votre session n’est plus valide.</strong></div>;
  return <>{children}</>;
}
