'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import logo from '@/components/layout/logo.png';
import { Company, getCompanies } from '@/lib/api';

const benefits = [
  'Trouvez les meilleurs talents',
  'Publiez vos offres simplement',
  'Gérez vos candidatures',
  'Développez votre équipe',
];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'E';
}

function CompanyImage({ company }: { company: Company }) {
  const [failed, setFailed] = useState(false);
  const source = typeof company.logo === 'string' && company.logo.trim() ? company.logo : null;
  if (!source || failed) return <div className="showcase-company-initials" aria-label={`Initiales de ${company.name}`}>{initials(company.name)}</div>;
  return <img src={source} alt={`Présentation de ${company.name}`} onError={() => setFailed(true)} />;
}

export default function RegistrationShowcase() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => { if (!cancelled) setStatus('error'); }, 9000);
    getCompanies().then((data) => {
      if (cancelled) return;
      setCompanies(data);
      setStatus(data.length ? 'ready' : 'empty');
    }).catch(() => { if (!cancelled) setStatus('error'); }).finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (companies.length < 2 || status !== 'ready') return;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % companies.length), 6000);
    return () => window.clearInterval(timer);
  }, [companies.length, status]);

  const activeCompany = companies[activeIndex];
  const dots = useMemo(() => companies.slice(0, 6), [companies]);

  return <aside className="form-aside registration-showcase">
    <Link href="/" className="logo-link"><Image src={logo} alt="JOBSINC" width={42} height={42} priority /><span>JOBSINC</span></Link>
    <div className="showcase-content">
      <div className="eyebrow">La nouvelle façon de recruter</div>
      <h1>Connecter les talents <span>&amp;</span> les opportunités</h1>
      <p className="showcase-intro">Rejoignez JOBSINC et donnez à votre entreprise les outils nécessaires pour attirer, identifier et recruter les meilleurs talents.</p>
      <ul className="showcase-benefits" aria-label="Avantages de JOBSINC">{benefits.map((benefit) => <li key={benefit}><span>✓</span>{benefit}</li>)}</ul>
      <div className={`showcase-company showcase-company-${status}`} aria-live="polite">
        {status === 'loading' && <><div className="showcase-company-image showcase-skeleton" /><div className="showcase-company-details"><span className="showcase-skeleton-line short" /><span className="showcase-skeleton-line medium" /><span className="showcase-skeleton-line long" /></div></>}
        {status === 'ready' && activeCompany && <><div className="showcase-company-image"><CompanyImage company={activeCompany} /></div><div className="showcase-company-details"><span className="showcase-kicker">Entreprises présentes sur JOBSINC</span><strong>{activeCompany.name}</strong><span>{activeCompany.sector || 'Secteur non renseigné'}</span><small>{activeCompany.location || 'Localisation non renseignée'}</small></div>{companies.length > 1 && <div className="showcase-dots" aria-label="Navigation des entreprises">{dots.map((company, index) => <button type="button" key={company.id} className={index === activeIndex ? 'active' : ''} onClick={() => setActiveIndex(index)} aria-label={`Afficher ${company.name}`} />)}</div>}</>}
        {(status === 'empty' || status === 'error') && <div className="showcase-empty"><span className="showcase-empty-mark">—</span><strong>{status === 'empty' ? 'Aucune entreprise inscrite pour le moment' : 'Données momentanément indisponibles'}</strong><small>Les entreprises présentes sur JOBSINC apparaîtront ici.</small></div>}
      </div>
      <p className="showcase-closing">Construisez aujourd’hui l’équipe qui fera grandir votre entreprise demain.</p>
    </div>
  </aside>;
}
