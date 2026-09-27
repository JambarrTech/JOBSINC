'use client';

import { useEffect, useRef, useState } from 'react';
import { getStats } from '@/lib/api';

const labels = [['talents', 'talents inscrits'], ['companies', 'entreprises'], ['jobs', 'offres publiées'], ['applications', 'candidatures']];

function Counter({ value }: { value: number | null }) {
  const [current, setCurrent] = useState(0); const ref = useRef<HTMLSpanElement>(null); const done = useRef(false);
  useEffect(() => { if (value === null || !ref.current) return; const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting || done.current) return; done.current = true; let start = 0; const timer = window.setInterval(() => { start += Math.ceil(value / 36); if (start >= value) { setCurrent(value); window.clearInterval(timer); } else setCurrent(start); }, 28); }, { threshold: .7 }); observer.observe(ref.current); return () => observer.disconnect(); }, [value]);
  return <span ref={ref}>{value === null ? '—' : current.toLocaleString('fr-FR')}</span>;
}

export default function Stats() {
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  useEffect(() => { getStats().then(setStats).catch(() => setStats(null)); }, []);
  return <section className="section"><div className="container"><div className="section-heading"><div className="eyebrow">Une meilleure visibilité</div><h2>JOBSINC en chiffres</h2><p>Les indicateurs de la plateforme sont affichés lorsqu’ils sont disponibles via votre environnement backend.</p></div><div className="stat-grid">{labels.map(([key, label]) => <div className="stat" key={key}><div className="stat-value"><span>+</span><Counter value={stats?.[key] ?? null} /></div><div className="stat-label">{label}</div></div>)}</div></div></section>;
}
