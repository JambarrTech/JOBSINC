'use client';

import { useEffect, useState } from 'react';
import { apiRequest, type FeedbackItem } from '@/lib/api';

export default function AdminFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    apiRequest<FeedbackItem[]>('/admin/feedback')
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function togglePublish(id: string, current: boolean) {
    try {
      await apiRequest(`/admin/feedback/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isPublished: !current }),
      });
      load();
    } catch {
      alert('Impossible de modifier.');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce témoignage ?')) return;
    try {
      await apiRequest(`/admin/feedback/${id}`, { method: 'DELETE' });
      load();
    } catch {
      alert('Impossible de supprimer.');
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
                    onClick={() => togglePublish(item.id, !!item.isPublished)}
                    style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, border: 'none', cursor: 'pointer', background: item.isPublished ? '#e9f8f3' : '#fff6e7', color: item.isPublished ? 'var(--green)' : '#a66b0b' }}
                  >
                    {item.isPublished ? 'Dépublier' : 'Publier'}
                  </button>
                  <button onClick={() => handleDelete(item.id)} style={{ padding: '3px 8px', border: '1px solid #f2d7d5', borderRadius: '6px', background: '#fff8f7', color: '#a53d38', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}>Supprimer</button>
                </div>
              </div>
              <p style={{ margin: '4px 0 0', color: 'var(--ink)', fontSize: '13px', lineHeight: 1.6, fontStyle: 'italic' }}>&ldquo;{item.text}&rdquo;</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
