'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import logo from '@/components/layout/logo.png';
import { adminLogin, isAdminUser } from '@/lib/admin-api';

export default function AdminLoginForm() {
  // `aria-pressed` + `aria-label` sur le bouton « afficher / masquer » :
  // son TEXTE change déjà, mais un lecteur d'écran annonce le contrôle par
  // son étiquette, pas par son contenu dynamique. Sans `aria-pressed`, il
  // annonçait « Afficher, bouton » même une fois le mot de passe visible, et
  // l'état n'était pas exposé du tout. L'étiquette, elle, décrit l'action
  // ET l'état, et reste utile si le texte visible change.
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(''); const payload = Object.fromEntries(new FormData(event.currentTarget).entries()); try { const result = await adminLogin(payload); if (!result.user || !isAdminUser(result.user)) throw new Error('Accès refusé. Ce compte ne possède pas les permissions administrateur.'); // Le backend pose les cookies HttpOnly jobsinc_token/accessToken/refreshToken via Set-Cookie.
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
    // Le cookie `jobsinc_admin_user` a été SUPPRIMÉ. Il n'était ni HttpOnly
    // (donc lisible et modifiable par tout script injecté) ni consommé :
    // `proxy.ts` avait déjà cessé de s'y fier, et l'admin est validé par
    // `/auth/me` côté serveur. Il ne restait qu'une seconde source de vérité
    // fausse, contenant des PII (nom, email, rôle) lisibles en JavaScript.
    //
    // `router.refresh()` est indispensable : il rejoue la requête RSC, donc le
    // `matcher` de `proxy.ts`, qui revalide la session auprès de l'API. Sans
    // lui, le payload RSC resterait celui d'avant la pose du cookie.
    router.push('/admin'); router.refresh();
  } catch (err) { setError(err instanceof Error ? err.message : 'Impossible de se connecter.'); } finally { setLoading(false); } }
  return <main className="admin-login-page"><section className="admin-login-aside"><div className="admin-login-brand"><Image src={logo} alt="JOBSINC" width={160} height={48} priority /></div><div><p className="admin-kicker">Centre de contrôle</p><h1>Une plateforme maîtrisée, de bout en bout.</h1><p>Supervisez les usages, accompagnez les membres et protégez l’écosystème JOBSINC depuis un espace dédié.</p></div><div className="admin-login-note"><span>Accès privé</span><strong>Réservé aux administrateurs autorisés.</strong></div></section><section className="admin-login-panel"><div className="admin-login-card"><p className="admin-kicker">Administration JOBSINC</p><h2>Bienvenue</h2><p className="admin-login-intro">Connectez-vous pour accéder au centre de supervision de la plateforme.</p><form onSubmit={submit}><label htmlFor="admin-email">Email administrateur</label><input id="admin-email" name="email" type="email" autoComplete="email" required placeholder="admin@entreprise.com" /><label htmlFor="admin-password">Mot de passe</label><div className="admin-password-field"><input id="admin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required placeholder="Votre mot de passe" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{showPassword ? 'Masquer' : 'Afficher'}</button></div>{error ? <p className="admin-form-error" role="alert">{error}</p> : null}<button className="admin-button admin-button-primary admin-login-submit" disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</button></form><p className="admin-login-legal">L’accès est contrôlé par les permissions retournées par le système d’authentification JOBSINC.</p></div></section></main>;
}
