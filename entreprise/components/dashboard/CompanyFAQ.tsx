'use client';

import { useEffect, useState } from 'react';
import { getCompanyFAQ, createCompanyFAQ, type FAQItem } from '@/lib/api';

export default function CompanyFAQ() {
  const [items, setItems] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  function load() {
    setLoading(true);
    getCompanyFAQ().then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setSubmitting(true);
    setMessage('');
    try {
      await createCompanyFAQ(question.trim());
      setQuestion('');
      setMessage('Question envoyée. L\'administrateur vous répondra bientôt.');
      load();
    } catch {
      setMessage('Impossible d\'envoyer la question.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard-content">
      <div className="dashboard-page-heading">
        <div>
          <span className="dashboard-eyebrow">Aide</span>
          <h1>Poser une question</h1>
          <p>Envoyez vos questions à l&apos;administration JOBSINC.</p>
        </div>
      </div>

      <div className="dashboard-main-grid">
        <section className="dashboard-panel">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <textarea
                placeholder="Votre question..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                required
                style={{ padding: '13px 14px', border: '1px solid #dde5ea', borderRadius: '9px', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button type="submit" className="button button-primary button-small" disabled={submitting || !question.trim()}>
                  {submitting ? 'Envoi...' : 'Envoyer'}
                </button>
                {message && <span style={{ color: 'var(--accent)', fontSize: '12px' }}>{message}</span>}
              </div>
            </div>
          </form>
        </section>

        <section className="dashboard-panel">
          <div className="panel-heading">
            <div><h2 style={{ margin: 0, color: 'var(--navy)', fontSize: '17px' }}>Mes questions</h2></div>
          </div>
          {loading ? <p style={{ color: 'var(--muted)', fontSize: '12px' }}>Chargement...</p> : items.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '30px 0' }}>Aucune question pour le moment.</p>
          ) : (
            <div className="data-list">
              {items.map((item) => (
                <div key={item.id} style={{ padding: '14px 0', borderBottom: '1px solid #edf2f5' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                    <strong style={{ color: 'var(--navy)', fontSize: '13px' }}>{item.question}</strong>
                    <span style={{ color: 'var(--muted)', fontSize: '10px', whiteSpace: 'nowrap' }}>
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString('fr-FR') : ''}
                    </span>
                  </div>
                  {item.answer ? (
                    <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#eef4fe', borderLeft: '3px solid var(--accent)', marginTop: '8px' }}>
                      <span style={{ display: 'block', color: 'var(--accent)', fontSize: '10px', fontWeight: 800, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Réponse</span>
                      <p style={{ margin: 0, color: 'var(--ink)', fontSize: '12px', lineHeight: 1.6 }}>{item.answer}</p>
                    </div>
                  ) : (
                    <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: '6px', background: '#fff6e7', color: '#a66b0b', fontSize: '10px', fontWeight: 700 }}>En attente</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
