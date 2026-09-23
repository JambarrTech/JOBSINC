'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { getCompanyApplications } from '@/lib/api';
import { useDashboard } from './DashboardContext';

type Application = NonNullable<import('@/lib/api').DashboardData['applications']>[number];

const STATUSES = [
  { value: '', label: 'Tous les statuts' },
  { value: 'RECEIVED', label: 'Reçue' },
  { value: 'UNDER_REVIEW', label: 'En cours d\'examen' },
  { value: 'INTERVIEW', label: 'Entretien' },
  { value: 'ACCEPTED', label: 'Acceptée' },
  { value: 'REJECTED', label: 'Refusée' },
];
const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Reçue', UNDER_REVIEW: 'En cours d\'examen', INTERVIEW: 'Entretien', ACCEPTED: 'Acceptée', REJECTED: 'Refusée',
};
const STATUS_COLORS: Record<string, string> = {
  RECEIVED: '#f59e0b', UNDER_REVIEW: '#3b82f6', INTERVIEW: '#3b8bff', ACCEPTED: '#0b5fe0', REJECTED: '#ef4444',
};

function candidateName(application: Application) { return application.candidateName || application.name || 'Candidat'; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C'; }
function formatDate(value?: string) { if (!value) return 'Date non renseignée'; const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); }

function StatusBadge({ status }: { status?: string }) {
  const label = STATUS_LABELS[status || ''] || status || '--';
  const color = STATUS_COLORS[status || ''] || '#6b7280';
  return (
    <span style={{
      display: 'inline-block', padding: '4px 10px', borderRadius: '6px',
      background: `${color}15`, color, fontSize: '10px', fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>{label}</span>
  );
}

export default function ApplicationsOverview() {
  const { data, loading: dashboardLoading, error: dashboardError, reload } = useDashboard();
  const [ownApplications, setOwnApplications] = useState<Application[]>([]);
  const [ownLoading, setOwnLoading] = useState(false);
  const [ownError, setOwnError] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    setOwnLoading(true);
    getCompanyApplications()
      .then((result) => { if (active && result) setOwnApplications(result as Application[]); })
      .catch(() => { if (active) setOwnError(true); })
      .finally(() => { if (active) setOwnLoading(false); });
    return () => { active = false; };
  }, []);

  const applications = ownApplications.length ? ownApplications : (data?.applications || []) as Application[];
  const filtered = useMemo(() => applications.filter((application) => {
    const text = `${candidateName(application)} ${application.title || application.jobTitle || ''}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (!status || application.status === status);
  }), [applications, query, status]);

  const loading = dashboardLoading || ownLoading;
  const error = dashboardError || ownError;

  return (
    <section className="applications-page">
      <div className="dashboard-page-heading">
        <div>
          <span className="dashboard-eyebrow">Suivi des talents</span>
          <h1>Candidatures</h1>
          <p>Examinez les profils reçus et avancez chaque recrutement.</p>
        </div>
        <Link href="/dashboard/matching" className="button button-outline"><Icon name="target" size={16} /> Ouvrir le matching</Link>
      </div>

      {error ? (
        <div className="dashboard-state dashboard-error">
          <strong>Impossible de charger les candidatures.</strong>
          <button type="button" className="button button-outline button-small" onClick={() => { setOwnError(false); reload(); }}>Réessayer</button>
        </div>
      ) : (
        <>
          <div className="applications-toolbar">
            <label className="jobs-search">
              <Icon name="search" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un candidat ou un poste…" aria-label="Rechercher une candidature" />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrer les candidatures">
              {STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="applications-list application-skeleton">{[1, 2, 3, 4].map((item) => <div key={item}><i /><i /><i /></div>)}</div>
          ) : filtered.length === 0 ? (
            <div className="dashboard-panel">
              <div className="jobs-empty">
                <div className="matching-empty-icon"><Icon name="users" size={24} /></div>
                <h2>{applications.length ? 'Aucune candidature ne correspond.' : 'Aucune candidature pour le moment.'}</h2>
                <p>{applications.length ? 'Modifiez la recherche ou le statut pour retrouver un profil.' : 'Les candidatures reçues apparaîtront ici.'}</p>
              </div>
            </div>
          ) : (
            <div className="applications-list">
              {filtered.map((application, index) => {
                const name = candidateName(application);
                return (
                  <Link className="application-row" href={`/dashboard/applications/${application.id || ''}`} key={application.id || index}>
                    <div className="candidate-avatar">{initials(name)}</div>
                    <div className="application-main">
                      <strong>{name}</strong>
                      <span>{application.title || application.jobTitle || 'Poste non renseigné'}</span>
                    </div>
                    <span className="application-date">{formatDate(application.date)}</span>
                    {typeof application.matchScore === 'number' && (
                      <span className="level-badge" title={application.matchLevelLabel || 'Score de correspondance'} style={{ background: '#e6f0fc', color: '#0a4fb0' }}>
                        {application.matchScore} %
                      </span>
                    )}
                    <StatusBadge status={application.status} />
                    <span className="application-arrow">→</span>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
