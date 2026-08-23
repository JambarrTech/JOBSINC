'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { getCompanyJobs, getJobMatches, getMatching, type Match, type MatchCriterion } from '@/lib/api';

const CRITERION_LABELS: Record<string, string> = {
  skills: 'Compétences',
  experience: 'Expérience',
  education: 'Formation',
  location: 'Localisation',
  contract: 'Contrat',
  availability: 'Disponibilité',
  other: 'Dossier',
};

const MIN_SCORE_OPTIONS = [
  { value: '', label: 'Tous les scores' },
  { value: '85', label: '85 % et plus' },
  { value: '70', label: '70 % et plus' },
  { value: '55', label: '55 % et plus' },
  { value: '40', label: '40 % et plus' },
];

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'C'; }

function matchHref(match: Match): string | null {
  if (match.applicationId) return `/dashboard/applications/${match.applicationId}`;
  if (match.jobId) return `/dashboard/jobs/${match.jobId}`;
  return null;
}

function ScoreBar({ criterion }: { criterion: MatchCriterion }) {
  const score = typeof criterion.score === 'number' ? Math.max(0, Math.min(100, criterion.score)) : null;
  return (
    <div className="score-bar" role="img" aria-label={`${score ?? '?'} %`}>
      <span className={`score-bar-fill${score !== null && score < 40 ? ' score-bar-low' : ''}`} style={{ width: `${score ?? 0}%` }} />
    </div>
  );
}

function MatchDetails({ details }: { details: NonNullable<Match['details']> }) {
  const entries = Object.entries(details).filter(([, criterion]) => criterion?.known);
  if (entries.length === 0) return null;
  return (
    <div className="match-details">
      {entries.map(([key, criterion]) => (
        <div className="match-criterion" key={key}>
          <div className="match-criterion-head">
            <strong>{CRITERION_LABELS[key] || key}</strong>
            <span>{typeof criterion.score === 'number' ? `${criterion.score} %` : '—'}</span>
          </div>
          <ScoreBar criterion={criterion} />
          {criterion.label && <p className="match-criterion-label">{criterion.label}</p>}
          {key === 'skills' && (
            <div className="match-chips">
              {(criterion.matched || []).map((skill) => <span className="chip chip-ok" key={`ok-${skill}`}>✓ {skill}</span>)}
              {(criterion.missing || []).map((skill) => <span className="chip chip-miss" key={`miss-${skill}`}>✗ {skill}</span>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function MatchingOverview() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [jobs, setJobs] = useState<Array<{ id: string | number; title?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [minScore, setMinScore] = useState('');
  const [jobId, setJobId] = useState('');
  const [skill, setSkill] = useState('');
  const [expanded, setExpanded] = useState<string | number | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    getMatching({ minScore: minScore || undefined, jobId: jobId || undefined, skill: skill.trim() || undefined })
      .then((response) => { setMatches(Array.isArray(response) ? response : response?.data || response?.results || []); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [minScore, jobId, skill]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getCompanyJobs().then(setJobs).catch(() => setJobs([])); }, []);

  const filtersActive = useMemo(() => Boolean(minScore || jobId || skill.trim()), [minScore, jobId, skill]);

  return (
    <section className="matching-page">
      <div className="dashboard-page-heading">
        <div>
          <span className="dashboard-eyebrow">Décision assistée</span>
          <h1>Matching des talents</h1>
          <p>Identifiez les profils les plus proches de vos besoins.</p>
        </div>
        <Link href="/dashboard/jobs" className="button button-outline"><Icon name="briefcase" size={16} /> Voir mes offres</Link>
      </div>

      <div className="matching-filters dashboard-panel">
        <label className="matching-filter">
          <span>Score minimum</span>
          <select value={minScore} onChange={(event) => setMinScore(event.target.value)}>
            {MIN_SCORE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="matching-filter">
          <span>Offre</span>
          <select value={jobId} onChange={(event) => setJobId(event.target.value)}>
            <option value="">Toutes mes offres</option>
            {jobs.map((job) => <option key={job.id} value={String(job.id)}>{job.title}</option>)}
          </select>
        </label>
        <label className="matching-filter">
          <span>Compétence</span>
          <input type="search" placeholder="Ex. React" value={skill} onChange={(event) => setSkill(event.target.value)} />
        </label>
        {filtersActive && (
          <button type="button" className="button button-outline button-small" onClick={() => { setMinScore(''); setJobId(''); setSkill(''); }}>
            Réinitialiser
          </button>
        )}
      </div>

      {error ? (
        <div className="dashboard-state dashboard-error">
          <strong>Impossible de charger les recommandations.</strong>
          <button type="button" className="button button-outline button-small" onClick={load}>Réessayer</button>
        </div>
      ) : loading ? (
        <div className="matching-grid">{[1, 2, 3].map((item) => <div className="match-card matching-skeleton" key={item} />)}</div>
      ) : matches.length === 0 ? (
        <div className="dashboard-panel">
          <div className="matching-empty">
            <div className="matching-empty-icon"><Icon name="target" size={25} /></div>
            <h2>Aucun matching disponible pour le moment.</h2>
            <p>Les recommandations apparaissent dès que vos offres ouvertes et les profils candidats renseignent des compétences qui se recoupent. Pensez à détailler les compétences dans vos offres.</p>
            <Link href="/dashboard/jobs/new" className="button button-primary">Créer une offre</Link>
          </div>
        </div>
      ) : (
        <>
          <p className="matching-count">{matches.length} recommandation{matches.length > 1 ? 's' : ''}{filtersActive ? ' (filtrées)' : ''}, triées par score décroissant.</p>
          <div className="matching-grid">
            {matches.map((match, index) => {
              const name = match.name || match.candidateName || 'Candidat';
              const score = match.matchScore ?? match.score;
              const isOpen = expanded !== null && expanded === (match.applicationId ?? match.id ?? index);
              const href = matchHref(match);
              return (
                <article className="match-card" key={match.id || index}>
                  <div className="match-card-top">
                    <div className="candidate-avatar">{initials(name)}</div>
                    <div>
                      <h2>{name}</h2>
                      <p>{match.title || match.jobTitle || 'Poste non renseigné'}</p>
                    </div>
                    <div className="match-score-block">
                      {typeof score === 'number' && <strong className="match-score">{score}%</strong>}
                      {match.levelLabel && <span className={`level-badge level-${match.level || 'low'}`}>{match.levelLabel}</span>}
                    </div>
                  </div>

                  <div className="match-meta">
                    {match.location && <span><Icon name="pin" size={14} />{match.location}</span>}
                    {match.skills?.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
                  </div>

                  {match.details && Object.values(match.details).some((criterion) => criterion?.known) && (
                    <button type="button" className="match-toggle" onClick={() => setExpanded(isOpen ? null : (match.applicationId ?? match.id ?? index))}>
                      {isOpen ? 'Masquer le détail du score' : 'Pourquoi ce score ?'}
                      <Icon name="arrow" size={14} />
                    </button>
                  )}
                  {isOpen && match.details && <MatchDetails details={match.details} />}

                  <div className="match-actions">
                    {href && (
                      <Link href={href} className="job-link">
                        {match.applicationId ? 'Voir la candidature' : "Voir l'offre"} <Icon name="arrow" size={14} />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
