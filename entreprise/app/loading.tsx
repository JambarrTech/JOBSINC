export default function Loading() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, border: '3px solid #e0e8f0', borderTopColor: '#0b5fe0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: '#7692a9', fontSize: 13 }}>Chargement…</span>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </main>
  );
}
