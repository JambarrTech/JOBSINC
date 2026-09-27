'use client';

import Link from 'next/link';

/**
 * Frontière d'erreur partagée pour les espaces authentifiés.
 *
 * Le dépôt contenait 13 fichiers `error.tsx` quasi identiques, chacun avec des
 * libellés différents et — pire — de l'encodage corrompu dans le texte visible
 * (« Réessayer », « témoignages », « paramètres »). Un seul composant
 * paramétrable remplace les 12 fichiers de section ; seuls `app/error.tsx`,
 * `app/admin/error.tsx` et `app/dashboard/error.tsx` subsistent, car Next.js
 * exige une frontière à chaque racine de layout.
 *
 * Le digest n'est affiché qu'en développement : en production il ne sert
 * qu'à retrouver l'entrée de log côté serveur.
 */
export default function SectionError({
  error,
  reset,
  title,
  description,
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
}) {
  const showDigest = process.env.NODE_ENV !== 'production' && Boolean(error?.digest);

  return (
    <section className="dashboard-content">
      <div className="dashboard-state dashboard-error" role="alert" style={{ minHeight: '40vh' }}>
        <div style={{ display: 'grid', placeItems: 'center', width: 54, height: 54, borderRadius: 14, background: '#fceceb', color: '#c0392b', fontSize: 22, flexShrink: 0 }}>!</div>
        <strong style={{ color: '#10233f', fontSize: 16 }}>{title}</strong>
        <p style={{ margin: 0, color: '#7692a9', fontSize: 12, lineHeight: 1.6, maxWidth: 380 }}>
          {description}
          {showDigest ? <span> (référence : {error.digest})</span> : null}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="button button-primary" onClick={() => reset()}>Réessayer</button>
          <Link href={backHref} className="button button-outline">{backLabel}</Link>
        </div>
      </div>
    </section>
  );
}
