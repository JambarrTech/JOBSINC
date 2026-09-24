import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f6f8fb', padding: 40 }}>
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontSize: 64, fontWeight: 900, color: '#0b5fe0', letterSpacing: '-.06em' }}>404</div>
        <h1 style={{ margin: '8px 0', color: '#10233f', fontSize: 20 }}>Page introuvable</h1>
        <p style={{ color: '#7692a9', fontSize: 13, lineHeight: 1.6 }}>La ressource demandée n’existe pas ou a été déplacée.</p>
        <Link href="/" style={{ display: 'inline-block', marginTop: 20, padding: '11px 24px', background: '#0b5fe0', color: '#fff', borderRadius: 9, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}>Retour à l’accueil</Link>
      </div>
    </main>
  );
}
