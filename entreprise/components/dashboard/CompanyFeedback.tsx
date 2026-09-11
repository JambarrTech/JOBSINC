'use client';

import { useEffect, useState } from 'react';
import { getCompanyFeedback, createCompanyFeedback, type FeedbackItem } from '@/lib/api';

export default function CompanyFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [author, setAuthor] = useState('');
  const [role, setRole] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  function load() {
    setLoading(true);
    getCompanyFeedback().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!author.trim() || !text.trim()) return;
    setSubmitting(true);
    setMessage('');
    try {
      await createCompanyFeedback(author.trim(), role.trim(), text.trim());
      setAuthor('');
      setRole('');
      setText('');
      setMessage('Témoignage envoyé. Il sera visible après validation par un administrateur.');
      load();
    } catch {
      setMessage('Impossible d\'envoyer le témoignage.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-content">
      <div className="dashboard-page-heading">
        <div>
          <span className="dashboard-eyebrow">Témoignage</span>
          <h1>Laisser un témoignage</h1>
          <p>Partagez votre expérience avec JOBSINC.</p>
        </div>
      </div>

      <div className="dashboard-main-grid">
        <section className="dashboard-panel">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input
                  type="text"
                  placeholder="Votre nom"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  required
                  style={{ padding: '13px 14px', border: '1px solid #dde5ea', borderRadius: '9px', fontSize: '13px' }}
                />
                <input
                  type="text"
                  placeholder="Votre poste (ex: DRH)"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  style={{ padding: '13px 14px', border: '1px solid #dde5ea', borderRadius: '9px', fontSize: '13px' }}
                />
              </div>
              <textarea
                placeholder="Votre témoignage..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                required
                style={{ padding: '13px 14px', border: '1px solid #dde5ea', borderRadius: '9px', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button type="submit" className="button button-primary button-small" disabled={submitting || !author.trim() || !text.trim()}>
                  {submitting ? 'Envoi...' : 'Envoyer'}
                </button>
                {message && <span style={{ color: 'var(--green)', fontSize: '12px' }}>{message}</span>}
              </div>
            </div>
          </form>
        </section>

        <section className="dashboard-panel">
          <div className="panel-heading">
            <div><h2 style={{ margin: 0, color: 'var(--navy)', fontSize: '17px' }}>Mes témoignages</h2></div>
          </div>
          {loading ? <p style={{ color: 'var(--muted)', fontSize: '12px' }}>Chargement...</p> : items.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '30px 0' }}>Aucun témoignage pour le moment.</p>
          ) : (
            <div className="data-list">
              {items.map((item) => (
                <div key={item.id} style={{ padding: '14px 0', borderBottom: '1px solid #edf2f5' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--navy)', fontSize: '13px' }}>{item.author}{item.role ? ` — ${item.role}` : ''}</strong>
                    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '9px', fontWeight: 700, background: item.isPublished ? '#e9f8f3' : '#fff6e7', color: item.isPublished ? 'var(--green)' : '#a66b0b' }}>
                      {item.isPublished ? 'Publié' : 'En attente'}
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '12px', lineHeight: 1.5 }}>{item.text}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
