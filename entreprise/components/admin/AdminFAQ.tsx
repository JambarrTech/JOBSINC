'use client';

import { useEffect, useState } from 'react';
import { apiRequest, type FAQItem } from '@/lib/api';

export default function AdminFAQ() {
  const [items, setItems] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [answerText, setAnswerText] = useState<Record<string, string>>({});

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
    try {
      await apiRequest(`/admin/faq/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ answer, isPublished: true }),
      });
      setAnswerText((prev) => ({ ...prev, [id]: '' }));
      load();
    } catch {
      alert('Impossible de répondre.');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette question ?')) return;
    try {
      await apiRequest(`/admin/faq/${id}`, { method: 'DELETE' });
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
          <h1>Questions FAQ</h1>
          <p>Répondez aux questions des entreprises.</p>
        </div>
      </div>

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
                  <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, background: item.isPublished ? '#e9f8f3' : '#fff6e7', color: item.isPublished ? 'var(--green)' : '#a66b0b' }}>
                    {item.isPublished ? 'Publié' : 'En attente'}
                  </span>
                  <button onClick={() => handleDelete(item.id)} style={{ padding: '3px 8px', border: '1px solid #f2d7d5', borderRadius: '6px', background: '#fff8f7', color: '#a53d38', fontSize: '9px', fontWeight: 700, cursor: 'pointer' }}>Supprimer</button>
                </div>
              </div>

              {item.answer ? (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#f0faf6', borderLeft: '3px solid var(--teal)', marginTop: '8px' }}>
                  <span style={{ display: 'block', color: 'var(--teal)', fontSize: '10px', fontWeight: 800, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Réponse</span>
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
                  <button onClick={() => handleAnswer(item.id)} className="button button-primary button-small">Répondre</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
