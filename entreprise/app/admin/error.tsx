'use client';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="dashboard-content">
      <div className="dashboard-state dashboard-error" style={{ minHeight: '50vh' }}>
        <div style={{ display: 'grid', placeItems: 'center', width: 54, height: 54, borderRadius: 14, background: '#fceceb', color: '#c0392b', fontSize: 22 }}>!</div>
        <strong style={{ color: '#10233f', fontSize: 16 }}>Erreur d&apos;administration</strong>
        <p style={{ margin: 0, color: '#7692a9', fontSize: 12, lineHeight: 1.6, maxWidth: 380 }}>
          {error?.digest ? `Référence : ${error.digest}` : "Une erreur est survenue dans le panneau d'administration."}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="button button-primary" onClick={() => reset()}>Réessayer</button>
          <a href="/admin" className="button button-outline">Retour à l&apos;administration</a>
        </div>
      </div>
    </section>
  );
}
