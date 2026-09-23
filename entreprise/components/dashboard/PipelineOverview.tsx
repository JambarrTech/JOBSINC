'use client';

import Link from 'next/link';
import { DragEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { apiRequest, DashboardData, getCompanyApplications } from '@/lib/api';
import { useDashboard } from './DashboardContext';

type Application = NonNullable<DashboardData['applications']>[number];
type Stage = 'RECEIVED' | 'UNDER_REVIEW' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED';

const STAGES: Array<[Stage, string, string, string]> = [
  ['RECEIVED', 'Reçue', 'Nouvelles candidatures à découvrir', '#f59e0b'],
  ['UNDER_REVIEW', 'En cours d\'examen', 'Profils actuellement évalués', '#3b82f6'],
  ['INTERVIEW', 'Entretien', 'Candidats en échange', '#3b8bff'],
  ['ACCEPTED', 'Acceptée', 'Talents retenus par votre équipe', '#0b5fe0'],
  ['REJECTED', 'Refusée', 'Candidatures non retenues', '#6b7280'],
];

function candidateName(application: Application) { return application.candidateName || application.name || 'Candidat'; }
function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C'; }
function formatDate(value?: string) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }

function statusToStage(status?: string): Stage {
  if (status === 'UNDER_REVIEW') return 'UNDER_REVIEW';
  if (status === 'INTERVIEW') return 'INTERVIEW';
  if (status === 'ACCEPTED') return 'ACCEPTED';
  if (status === 'REJECTED') return 'REJECTED';
  return 'RECEIVED';
}

export default function PipelineOverview() {
  const { data, loading: dashboardLoading, error: dashboardError, reload } = useDashboard();
  const [ownApplications, setOwnApplications] = useState<Application[]>([]);
  const [ownLoading, setOwnLoading] = useState(false);
  const [ownError, setOwnError] = useState(false);
  const [query, setQuery] = useState('');
  const [jobFilter, setJobFilter] = useState('all');
  const [draggedId, setDraggedId] = useState<string | number | null>(null);
  const [notice, setNotice] = useState('');
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);

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
  const loading = dashboardLoading || ownLoading;
  const error = dashboardError || ownError;
  const jobs = useMemo(() => Array.from(new Set(applications.map((app) => app.title || app.jobTitle || 'Poste non renseigné'))), [applications]);

  const filtered = useMemo(() => applications.filter((application) => {
    const name = candidateName(application);
    const title = application.title || application.jobTitle || 'Poste non renseigné';
    return `${name} ${title}`.toLowerCase().includes(query.toLowerCase()) && (jobFilter === 'all' || title === jobFilter);
  }), [applications, jobFilter, query]);

  const columns = useMemo(() => STAGES.map(([stage, label, description, color]) => ({
    stage, label, description, color,
    items: filtered.filter((app) => statusToStage(app.status) === stage),
  })), [filtered]);

  async function moveApplication(id: string | number | undefined, targetStage: Stage) {
    if (id === undefined) return;
    setUpdatingId(id);
    try {
      await apiRequest(`/applications/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetStage }),
      });
      setNotice('Statut mis à jour.');
      reload();
      window.setTimeout(() => setNotice(''), 3000);
    } catch (err: any) {
      setNotice(err?.message || 'Erreur lors de la mise à jour.');
      window.setTimeout(() => setNotice(''), 4000);
    } finally {
      setUpdatingId(null);
    }
  }

  function drop(event: DragEvent<HTMLElement>, stage: Stage) {
    event.preventDefault();
    moveApplication(draggedId ?? undefined, stage);
    setDraggedId(null);
  }

  return (
    <section className="pipeline-page">
      <div className="pipeline-heading">
        <div>
          <span className="dashboard-eyebrow">Workflow de recrutement</span>
          <h1>Pipeline</h1>
          <p>Visualisez l&apos;avancement de chaque candidature et concentrez-vous sur la prochaine action.</p>
        </div>
        <Link href="/dashboard/applications" className="button button-outline"><Icon name="users" size={16} /> Voir les candidatures</Link>
      </div>

      {error ? (
        <div className="dashboard-state dashboard-error">
          <strong>Impossible de charger le pipeline.</strong>
          <button type="button" className="button button-outline button-small" onClick={() => { setOwnError(false); reload(); }}>Réessayer</button>
        </div>
      ) : (
        <>
          <div className="pipeline-toolbar">
            <label className="jobs-search">
              <Icon name="search" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un candidat ou un poste…" aria-label="Rechercher dans le pipeline" />
            </label>
            <select value={jobFilter} onChange={(event) => setJobFilter(event.target.value)} aria-label="Filtrer par offre">
              <option value="all">Toutes les offres</option>
              {jobs.map((job) => <option key={job}>{job}</option>)}
            </select>
            <div className="pipeline-counter">
              <strong>{filtered.length}</strong>
              <span>candidature{filtered.length > 1 ? 's' : ''}</span>
            </div>
          </div>

          {notice && <div className="pipeline-notice" role="status"><Icon name="check" size={15} />{notice}</div>}

          {loading ? (
            <div className="pipeline-board pipeline-loading">
              {STAGES.slice(0, 4).map(([stage]) => <div key={stage}><i /><i /><i /></div>)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="dashboard-panel">
              <div className="jobs-empty">
                <div className="matching-empty-icon"><Icon name="target" size={24} /></div>
                <h2>{applications.length ? 'Aucune candidature ne correspond.' : 'Votre pipeline est vide.'}</h2>
                <p>{applications.length ? 'Modifiez votre recherche ou le filtre d\'offre.' : 'Les candidatures reçues apparaîtront ici, organisées par étape.'}</p>
                <Link href="/dashboard/applications" className="button button-outline">Voir les candidatures</Link>
              </div>
            </div>
          ) : (
            <div className="pipeline-board" role="region" aria-label="Pipeline de recrutement">
              {columns.map(({ stage, label, description, color, items }) => (
                <div
                  key={stage}
                  className="pipeline-column"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => drop(event, stage)}
                >
                  <div className="pipeline-column-head">
                    <span className="pipeline-stage-dot" style={{ backgroundColor: color }} />
                    <div>
                      <strong>{label}</strong>
                      <span>{items.length} candidature{items.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <p className="pipeline-column-desc">{description}</p>
                  <div className="pipeline-column-body">
                    {items.map((application) => {
                      const name = candidateName(application);
                      return (
                        <article
                          key={application.id}
                          className={`pipeline-card ${updatingId === application.id ? 'is-updating' : ''}`}
                          draggable
                          onDragStart={() => setDraggedId(application.id ?? null)}
                        >
                          <div className="pipeline-card-top">
                            <div className="candidate-avatar small">{initials(name)}</div>
                            <div>
                              <strong>{name}</strong>
                              <span>{application.title || application.jobTitle || 'Poste non renseigné'}</span>
                            </div>
                          </div>
                          <span className="pipeline-card-date">{formatDate(application.date)}</span>
                        </article>
                      );
                    })}
                    {items.length === 0 && <p className="pipeline-empty-col">Aucune candidature</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
