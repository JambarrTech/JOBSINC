'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { deleteCompanyJob, getCompanyJobs, Job, setJobOpen } from '@/lib/api';
import { useDashboard } from './DashboardContext';

type DashboardJob = Job & { applicationsCount?: number; status?: string; description?: string; createdAt?: string; expiresAt?: string };

function statusLabel(status?: string) { const normalized = status?.toLowerCase(); if (normalized === 'closed' || normalized === 'inactive' || normalized === 'expired') return 'Inactive'; if (normalized === 'draft') return 'Brouillon'; return 'Active'; }

export default function JobsOverview() {
  const { data, loading: dashboardLoading, error: dashboardError, reload } = useDashboard();
  const [jobs, setJobs] = useState<DashboardJob[]>([]); const [loadingOwn, setLoadingOwn] = useState(false); const [ownError, setOwnError] = useState(false); const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [busyId, setBusyId] = useState<string | null>(null);
  async function handleDelete(job: DashboardJob) {
    if (!job.id || !window.confirm(`Supprimer définitivement l'offre « ${job.title || 'sans titre'} » ?`)) return;
    setBusyId(String(job.id));
    try {
      await deleteCompanyJob(job.id);
      setJobs((previous) => previous.filter((item) => item.id !== job.id)); reload();
    } catch (error) {
      if ((error as { status?: number }).status === 400 && window.confirm('Cette offre a reçu des candidatures : elle ne peut pas être supprimée. La désactiver à la place ?')) {
        await handleToggle(job, false).catch(() => undefined);
      } else { window.alert(error instanceof Error ? error.message : "Impossible de supprimer l'offre."); }
    } finally { setBusyId(null); }
  }
  async function handleToggle(job: DashboardJob, target?: boolean) {
    if (!job.id) return;
    const open = target ?? statusLabel(job.status) !== 'Active';
    setBusyId(String(job.id));
    try {
      await setJobOpen(job.id, open);
      const newStatus = open ? 'active' : 'inactive';
      setJobs((previous) => previous.map((item) => (item.id === job.id ? { ...item, status: newStatus } : item))); reload();
    } catch (error) { window.alert(error instanceof Error ? error.message : "Impossible de modifier le statut de l'offre."); }
    finally { setBusyId(null); }
  }
  useEffect(() => { let active = true; setLoadingOwn(true); getCompanyJobs().then((result) => { if (active && result) setJobs(result as DashboardJob[]); }).catch(() => { if (active) setOwnError(true); }).finally(() => { if (active) setLoadingOwn(false); }); return () => { active = false; }; }, []);
  const sourceJobs = jobs.length ? jobs : (data?.jobs || []) as DashboardJob[];
  const filteredJobs = useMemo(() => sourceJobs.filter((job) => { const text = `${job.title || ''} ${job.location || ''} ${job.contractType || ''}`.toLowerCase(); const matchesQuery = text.includes(query.toLowerCase()); const currentStatus = statusLabel(job.status).toLowerCase(); return matchesQuery && (status === 'all' || currentStatus === status); }), [sourceJobs, query, status]);
  const loading = dashboardLoading || loadingOwn; const error = dashboardError || ownError;
  return <section className="jobs-page"><div className="dashboard-page-heading"><div><span className="dashboard-eyebrow">Espace recrutement</span><h1>Mes offres</h1><p>Gérez les opportunités publiées par votre entreprise.</p></div><Link href="/dashboard/jobs/new" className="button button-primary"><span>+</span> Créer une nouvelle offre</Link></div>{error ? <div className="dashboard-state dashboard-error"><strong>Impossible de charger vos offres.</strong><button type="button" className="button button-outline button-small" onClick={() => { setOwnError(false); reload(); }}>Réessayer</button></div> : <><div className="jobs-toolbar"><label className="jobs-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une offre…" aria-label="Rechercher une offre" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrer par statut"><option value="all">Tous les statuts</option><option value="active">Actives</option><option value="inactive">Inactives</option><option value="brouillon">Brouillons</option></select></div>{loading ? <div className="jobs-table jobs-table-skeleton">{[1, 2, 3, 4].map((item) => <div key={item}><i /><i /><i /></div>)}</div> : filteredJobs.length === 0 ? <div className="dashboard-panel"><div className="jobs-empty"><div className="matching-empty-icon"><Icon name="briefcase" size={24} /></div><h2>{sourceJobs.length ? 'Aucune offre ne correspond à votre recherche.' : 'Vous n’avez encore publié aucune offre.'}</h2><p>{sourceJobs.length ? 'Modifiez vos filtres pour retrouver vos offres.' : 'Créez votre première opportunité pour commencer à recevoir des candidatures.'}</p>{!sourceJobs.length && <Link href="/dashboard/jobs/new" className="button button-primary">Créer ma première offre</Link>}</div></div> : <div className="jobs-table" role="table" aria-label="Mes offres"><div className="jobs-table-head" role="row"><span>Offre</span><span>Localisation</span><span>Candidatures</span><span>Statut</span><span>Actions</span></div>{filteredJobs.map((job, index) => <div className="jobs-table-row" role="row" key={job.id || index}><div><strong>{job.title || 'Offre sans titre'}</strong><small>{job.contractType || 'Type non renseigné'}{job.publishedAt ? ` · Publiée le ${new Date(job.publishedAt).toLocaleDateString('fr-FR')}` : ''}</small></div><span>{job.location || 'Non renseignée'}</span><span>{typeof job.applicationsCount === 'number' ? job.applicationsCount : '--'}</span><em className={`job-status status-${statusLabel(job.status).toLowerCase()}`}>{statusLabel(job.status)}</em><div className="job-actions"><Link href={`/dashboard/jobs/${job.id || ''}`} aria-label={`Voir ${job.title || 'l’offre'}`}>Voir</Link><Link href={`/dashboard/jobs/${job.id || ''}/edit`} aria-label={`Modifier ${job.title || 'l’offre'}`}>Modifier</Link><button type="button" disabled={String(job.id) === busyId} onClick={() => handleToggle(job)}>{statusLabel(job.status) === 'Active' ? 'Désactiver' : 'Activer'}</button><button type="button" className="job-action-danger" disabled={String(job.id) === busyId} onClick={() => handleDelete(job)}>Supprimer</button></div></div>)}</div>}</>}</section>;
}
