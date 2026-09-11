'use client';

import { useEffect, useState } from 'react';
import { getPublicFAQ, isApiConfigured, type FAQItem } from '@/lib/api';

export default function FAQ() {
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!isApiConfigured()) { setLoading(false); return; }
    getPublicFAQ()
      .then((data) => setFaqs(data))
      .catch(() => setFaqs([]))
      .finally(() => setLoading(false));
  }, []);

  if (!loading && faqs.length === 0) return null;

  return (
    <section className="section" id="faq">
      <div className="container">
        <div className="section-heading center">
          <div className="eyebrow">Questions fréquentes</div>
          <h2>Vous avez des questions, nous aussi.</h2>
        </div>
        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: '13px', textAlign: 'center' }}>Chargement...</p>
        ) : (
          <div className="faq-list">
            {faqs.map((faq, i) => (
              <div className={`faq-item${open === i ? ' faq-open' : ''}`} key={faq.id}>
                <button
                  className="faq-question"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                >
                  <span>{faq.question}</span>
                  <svg className="faq-chevron" width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4.5 6.75l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
                <div className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
