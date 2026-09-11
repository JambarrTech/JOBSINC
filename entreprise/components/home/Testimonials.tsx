'use client';

import { useEffect, useState } from 'react';
import { getPublicFeedback, isApiConfigured, type FeedbackItem } from '@/lib/api';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
}

export default function Testimonials() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isApiConfigured()) { setLoading(false); return; }
    getPublicFeedback()
      .then((data) => setItems(data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <section className="section section-tint" id="testimonials">
      <div className="container">
        <div className="section-heading center">
          <div className="eyebrow">Ils nous font confiance</div>
          <h2>Ce que disent nos recruteurs</h2>
          <p>Des retours concrets de professionnels qui utilisent JOBSINC au quotidien.</p>
        </div>
        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center' }}>Chargement...</p>
        ) : (
          <div className="testimonials-grid">
            {items.map((t) => (
              <article className="testimonial-card" key={t.id}>
                <div className="testimonial-quote">&ldquo;{t.text}&rdquo;</div>
                <div className="testimonial-author">
                  <div className="testimonial-avatar">{initials(t.author)}</div>
                  <div>
                    <strong>{t.author}</strong>
                    <span>{t.role || ''}{t.company?.name ? ` · ${t.company.name}` : ''}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
