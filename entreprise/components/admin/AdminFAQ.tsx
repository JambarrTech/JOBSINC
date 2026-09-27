'use client';

import { useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { apiRequest, type FAQItem } from '@/lib/api';

export default function AdminFAQ() {
  const [items, setItems] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [answerText, setAnswerText] = useState<Record<string, string>>({});
  // Remplace les `alert` / `confirm` natifs : même composant et même bandeau
  // que dans `components/admin/AdminFeedback.tsx`, l'erreur est annoncée par
  // `role="alert"` et la suppression passe par une confirmation au clavier.
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FAQItem | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    apiRequest<FAQItem[]>('/admin/faq')
      .then(setItems)
      .catch((err) => { console.error('FAQ load error:', err); setItems([]); })
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleAnswer(id: string) {
    const answer = answerText[id]?.trim();
    if (!answer) return;
    setBusy(true);
    setActionError(null);
    try {
      await apiRequest(`/admin/faq/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ answer, isPublished: true }),
      });
      setAnswerText((prev) => ({ ...prev, [id]: '' }));
      load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Impossible de répondre.');
    } finally {
      setBusy(false);
    }
  }

  // Appelé par le bouton de confirmation, pas au clic : une question publiée
  // disparaît de la FAQ publique, la suppression n'a pas à être un simple
  // second clic.
  async function runDelete() {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setBusy(true);
    setActionError(null);
    try {
      await apiRequest(`/admin/faq/${target.id}`, { method: 'DELETE' });
      load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Impossible de supprimer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard-content">
      <div className="dashboard-page-heading">
        <div>
          <span className="dashboard-eyebrow">Administration</span>
          <h1>Questions FAQ</h1>
          <p>Répondez aux questions des entreprises.</p>
        </div>
      </div>

      {actionError && (
        <div className="admin-alert admin-alert-error" role="alert">
          <div>
            <strong>{actionError}</strong>
            <span>Vérifiez que le service Admin est joignable, puis réessayez.</span>
          </div>
          <button type="button" className="admin-button admin-button-secondary" onClick={() => setActionError(null)}>Fermer</button>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: '12px' }}>Chargement...</p>
      ) : items.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '40px 0' }}>Aucune question pour le moment.</p>
      ) : (
        <div className="data-list">
          {items.map((item) => (
            <div key={item.id} style={{ padding: '18px 0', borderBottom: '1px solid #edf2f5' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                <div>
                  <strong style={{ color: 'var(--navy)', fontSize: '13px' }}>{item.question}</strong>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', marginTop: '2px' }}>
                    {item.company?.name || 'Entreprise'} · {item.createdAt ? new Date(item.createdAt).toLocaleDateString('fr-FR') : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, background: item.isPublished ? '#e9f2fe' : '#fff6e7', color: item.isPublished ? 'var(--accent)' : '#a66b0b' }}>
                    {item.isPublished ? 'Publié' : 'En attente'}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { setActionError(null); setPendingDelete(item); }}
                    style={{ minHeight: '44px', padding: '3px 8px', border: '1px solid #f2d7d5', borderRadius: '6px', background: '#fff8f7', color: '#a53d38', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              {item.answer ? (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#eef4fe', borderLeft: '3px solid var(--accent)', marginTop: '8px' }}>
                  <span style={{ display: 'block', color: 'var(--accent)', fontSize: '10px', fontWeight: 800, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Réponse</span>
                  <p style={{ margin: 0, color: 'var(--ink)', fontSize: '12px', lineHeight: 1.6 }}>{item.answer}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <input
                    type="text"
                    placeholder="Votre réponse..."
                    value={answerText[item.id] || ''}
                    onChange={(e) => setAnswerText((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && handleAnswer(item.id)}
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #dde5ea', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <button type="button" disabled={busy} onClick={() => handleAnswer(item.id)} className="button button-primary button-small">Répondre</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Supprimer cette question ?"
          message={`« ${pendingDelete.question} » sera définitivement retirée de la FAQ publique. Cette action est irréversible.`}
          confirmLabel="Supprimer"
          tone="danger"
          busy={busy}
          onConfirm={() => { void runDelete(); }}
          onClose={() => { if (!busy) setPendingDelete(null); }}
        />
      )}
    </div>
  );
}
