'use client';

import Image from 'next/image';
import { FormEvent, useState } from 'react';
import logo from '@/components/layout/logo.png';
import { adminLogin, getAdminUserLabel, isAdminUser } from '@/lib/admin-api';

export default function AdminLoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(''); const payload = Object.fromEntries(new FormData(event.currentTarget).entries()); try { const result = await adminLogin(payload); if (!result.user || !isAdminUser(result.user)) throw new Error('Accès refusé. Ce compte ne possède pas les permissions administrateur.'); // Backend a déjà posé les cookies HttpOnly jobsinc_token/accessToken/refreshToken via Set-Cookie (credentials: include) — pas de localStorage pour l'auth
    if (result.token) {
      try {
        await fetch('/api/auth/cookie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: result.token }),
          credentials: 'include',
        });
      } catch {}
    }
    document.cookie = `jobsinc_admin_user=${encodeURIComponent(JSON.stringify(result.user))}; path=/; max-age=${24 * 60 * 60}; SameSite=Lax`;
    window.location.assign('/admin'); } catch (err) { setError(err instanceof Error ? err.message : 'Impossible de se connecter.'); } finally { setLoading(false); } }
  return <main className="admin-login-page"><section className="admin-login-aside"><div className="admin-login-brand"><Image src={logo} alt="JOBSINC" width={160} height={48} priority /></div><div><p className="admin-kicker">Centre de contrôle</p><h1>Une plateforme maîtrisée, de bout en bout.</h1><p>Supervisez les usages, accompagnez les membres et protégez l’écosystème JOBSINC depuis un espace dédié.</p></div><div className="admin-login-note"><span>Accès privé</span><strong>Réservé aux administrateurs autorisés.</strong></div></section><section className="admin-login-panel"><div className="admin-login-card"><p className="admin-kicker">Administration JOBSINC</p><h2>Bienvenue</h2><p className="admin-login-intro">Connectez-vous pour accéder au centre de supervision de la plateforme.</p><form onSubmit={submit}><label htmlFor="admin-email">Email administrateur</label><input id="admin-email" name="email" type="email" autoComplete="email" required placeholder="admin@entreprise.com" /><label htmlFor="admin-password">Mot de passe</label><div className="admin-password-field"><input id="admin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required placeholder="Votre mot de passe" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Masquer' : 'Afficher'}</button></div>{error ? <p className="admin-form-error" role="alert">{error}</p> : null}<button className="admin-button admin-button-primary admin-login-submit" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button></form><p className="admin-login-legal">L’accès est contrôlé par les permissions retournées par le système d’authentification JOBSINC.</p></div></section></main>;
}
