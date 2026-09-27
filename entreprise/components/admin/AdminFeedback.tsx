'use client';

import { useEffect, useState } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { apiRequest, type FeedbackItem } from '@/lib/api';

export default function AdminFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Remplace les deux `window.alert` (bloquant, non stylable, invisible aux
  // lecteurs d'écran de façon fiable) : l'erreur devient un bandeau
  // `role="alert"` annoncé automatiquement, la suppression passe par le
  // `ConfirmDialog` partagé — même composant que le dashboard, donc même
  // gestion clavier (Échap, focus piégé, focus restitué au déclencheur).
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FeedbackItem | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    apiRequest<FeedbackItem[]>('/admin/feedback')
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function togglePublish(id: string, current: boolean) {
    setBusy(true);
    setActionError(null);
    try {
      await apiRequest(`/admin/feedback/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isPublished: !current }),
      });
      load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Impossible de modifier.');
    } finally {
      setBusy(false);
    }
  }

  // Déclenché par le bouton de confirmation, pas directement au clic : la
  // suppression est irréversible, elle ne doit pas dépendre d'un simple
  // survol suivi d'un second clic au bon endroit.
  async function runDelete() {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setBusy(true);
    setActionError(null);
    try {
      await apiRequest(`/admin/feedback/${target.id}`, { method: 'DELETE' });
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
          <h1>Témoignages</h1>
          <p>Gérez les témoignages des entreprises.</p>
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
        <p style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '40px 0' }}>Aucun témoignage pour le moment.</p>
      ) : (
        <div className="data-list">
          {items.map((item) => (
            <div key={item.id} style={{ padding: '18px 0', borderBottom: '1px solid #edf2f5' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
                <div>
                  <strong style={{ color: 'var(--navy)', fontSize: '13px' }}>{item.author}{item.role ? ` — ${item.role}` : ''}</strong>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: '11px', marginTop: '2px' }}>
                    {item.company?.name || 'Entreprise'} · {item.createdAt ? new Date(item.createdAt).toLocaleDateString('fr-FR') : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { void togglePublish(item.id, !!item.isPublished); }}
                    style={{ minHeight: '44px', padding: '3px 10px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, border: 'none', cursor: 'pointer', background: item.isPublished ? '#e9f2fe' : '#fff6e7', color: item.isPublished ? 'var(--accent)' : '#a66b0b' }}
                  >
                    {item.isPublished ? 'Dépublier' : 'Publier'}
                  </button>
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
              <p style={{ margin: '4px 0 0', color: 'var(--ink)', fontSize: '13px', lineHeight: 1.6, fontStyle: 'italic' }}>&ldquo;{item.text}&rdquo;</p>
            </div>
          ))}
        </div>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Supprimer ce témoignage ?"
          message={`Le témoignage de ${pendingDelete.author || 'cet auteur'} sera définitivement supprimé de la page d'accueil. Cette action est irréversible.`}
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
