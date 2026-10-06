'use client';

import { useEffect, useRef, useState } from 'react';
import Icon, { type IconName } from '@/components/ui/Icon';
import { getStats } from '@/lib/api';

const cards: Array<{ key: string; label: string; icon: IconName }> = [
  { key: 'talents', label: 'talents inscrits', icon: 'users' },
  { key: 'companies', label: 'entreprises', icon: 'grid' },
  { key: 'jobs', label: 'offres publiées', icon: 'briefcase' },
  { key: 'applications', label: 'candidatures', icon: 'mail' },
];

const hasStat = (stats: Record<string, number> | null, key: string) =>
  typeof stats?.[key] === 'number';

function Counter({ value }: { value: number }) {
  const [current, setCurrent] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    const target = value;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || done.current) return;
        done.current = true;
        let start = 0;
        const timer = window.setInterval(() => {
          start += Math.max(1, Math.ceil(target / 36));
          if (start >= target) {
            setCurrent(target);
            window.clearInterval(timer);
          } else {
            setCurrent(start);
          }
        }, 28);
      },
      { threshold: 0.7 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);
  return <span ref={ref}>{current.toLocaleString('fr-FR')}</span>;
}

export default function Stats() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getStats()
      .then((data) => {
        setStats(data);
        setLoaded(true);
      })
      .catch(() => {
        setStats(null);
        setLoaded(true);
      });
  }, []);

  // Règle d'affichage : une carte sans information ne s'affiche pas.
  // Si RIEN n'est disponible, toute la section est masquée (ni chiffres,
  // ni titre) plutôt qu'un bandeau de « — » vides.
  const visible = cards.filter((card) => hasStat(stats, card.key));
  if (loaded && visible.length === 0) return null;

  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <div className="eyebrow">Une meilleure visibilité</div>
          <h2>JOBSINC en chiffres</h2>
          <p>Les indicateurs de la plateforme sont affichés lorsqu’ils sont disponibles via votre environnement backend.</p>
        </div>
        <div className="stat-grid stat-grid-cards">
          {!loaded
            ? cards.map((card) => (
                <div className="stat-card is-loading" key={card.key} aria-hidden="true">
                  <span className="stat-card-icon">
                    <Icon name={card.icon} size={20} />
                  </span>
                  <strong className="stat-card-value">+</strong>
                  <span className="stat-card-label">{card.label}</span>
                </div>
              ))
            : visible.map((card) => (
                <div className="stat-card" key={card.key}>
                  <span className="stat-card-icon">
                    <Icon name={card.icon} size={20} />
                  </span>
                  <strong className="stat-card-value">
                    +<Counter value={stats?.[card.key] ?? 0} />
                  </strong>
                  <span className="stat-card-label">{card.label}</span>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
