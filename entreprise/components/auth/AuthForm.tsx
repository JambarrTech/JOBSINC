'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { authenticate } from '@/lib/api';
import RegistrationShowcase from '@/components/company-registration/RegistrationShowcase';

async function setFrontendCookie(token: string) {
  try {
    await fetch('/api/auth/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      credentials: 'include',
    });
  } catch {}
  // Nettoyage legacy localStorage
  try { localStorage.removeItem('jobsinc_token'); } catch {}
}

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register'; const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(''); setLoading(true); const form = new FormData(event.currentTarget); const payload = Object.fromEntries(form.entries()); try { const result = await authenticate(isRegister ? (process.env.NEXT_PUBLIC_REGISTER_ENDPOINT || '/auth/register/company') : (process.env.NEXT_PUBLIC_LOGIN_ENDPOINT || '/auth/login/company'), payload); if (result.token) { await setFrontendCookie(result.token); } // Fallback si backend ne renvoie pas de token mais a posé le cookie HttpOnly côté backend, on tente quand même la redirection — le proxy / DashboardAuthGuard vérifiera via /auth/me avec credentials include
 window.location.assign('/dashboard'); } catch (err) { setError(err instanceof Error ? err.message : 'Une erreur est survenue.'); } finally { setLoading(false); } }
  return <div className="form-shell"><RegistrationShowcase /><main className="form-main"><div className="form-card"><div className="eyebrow">Espace entreprise</div><h2>{isRegister ? 'Créer votre compte' : 'Se connecter'}</h2><p>{isRegister ? 'Commencez à recruter avec plus de clarté.' : 'Retrouvez votre espace de recrutement.'}</p><form onSubmit={submit}>{isRegister && <div className="form-group"><label htmlFor="companyName">Nom de l’entreprise</label><input id="companyName" name="companyName" required placeholder="Votre entreprise" /></div>}<div className="form-group"><label htmlFor="email">Email professionnel</label><input id="email" name="email" type="email" required autoComplete="email" placeholder="vous@entreprise.com" /></div><div className="form-group"><label htmlFor="password">Mot de passe</label><input id="password" name="password" type="password" required minLength={6} autoComplete={isRegister ? 'new-password' : 'current-password'} placeholder="••••••••" /></div>{isRegister && <div className="form-group"><label><input type="checkbox" required /> J’accepte les conditions d’utilisation.</label></div>}{error && <div className="form-error" role="alert">{error}</div>}<button className="button button-primary" style={{ width: '100%' }} disabled={loading}>{loading ? 'Connexion en cours…' : isRegister ? 'Créer mon compte entreprise' : 'Se connecter'}</button></form><div className="form-foot">{isRegister ? <>Vous avez déjà un compte ? <Link href="/login">Se connecter</Link></> : <>Pas encore de compte ? <Link href="/register">Créer un compte entreprise</Link></>}</div><div className="form-foot"><Link href="/">Retour à l’accueil</Link></div></div></main></div>;
}
