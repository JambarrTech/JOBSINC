'use client';

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f6f8fb', padding: '40px' }}>
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ display: 'grid', placeItems: 'center', width: 64, height: 64, margin: '0 auto 20px', borderRadius: 16, background: '#fceceb', color: '#c0392b', fontSize: 28 }}>!</div>
        <h1 style={{ margin: '0 0 8px', color: '#10233f', fontSize: 22, letterSpacing: '-.04em' }}>Une erreur est survenue</h1>
        <p style={{ margin: '0 0 24px', color: '#7692a9', fontSize: 13, lineHeight: 1.6 }}>
          {error?.digest ? `Référence : ${error.digest}` : "L'application a rencontré un problème inattendu."}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ padding: '11px 24px', border: 0, borderRadius: 9, background: '#0b5fe0', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          Réessayer
        </button>
      </div>
    </main>
  );
}
