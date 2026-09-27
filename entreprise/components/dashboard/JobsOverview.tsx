'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/ui/Icon';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { deleteCompanyJob, getCompanyJobs, Job, setJobOpen } from '@/lib/api';
import { useDashboard } from './DashboardContext';

type DashboardJob = Job & { applicationsCount?: number; status?: string; description?: string; createdAt?: string; expiresAt?: string };

// Action en attente de confirmation. `window.confirm` ne le permettait pas :
// il renvoie un booléen de façon synchrone, donc il était impossible
// d'afficher un état « en cours… » pendant l'appel réseau, ni de proposer la
// question de repli (« désactiver à la place ? ») sous la forme d'un second
// écran — elle apparaissait dans une boîte empilée sans rapport avec l'action
// qui l'avait déclenchée.
type PendingAction = { kind: 'delete' | 'deactivate'; job: DashboardJob } | null;

function statusLabel(status?: string) { const normalized = status?.toLowerCase(); if (normalized === 'closed' || normalized === 'inactive' || normalized === 'expired') return 'Inactive'; if (normalized === 'draft') return 'Brouillon'; return 'Active'; }

export default function JobsOverview() {
  const { loading: dashboardLoading, error: dashboardError, reload } = useDashboard();
  const [jobs, setJobs] = useState<DashboardJob[]>([]); const [loadingOwn, setLoadingOwn] = useState(false); const [ownError, setOwnError] = useState(false); const [query, setQuery] = useState(''); const [status, setStatus] = useState('all'); const [busyId, setBusyId] = useState<string | null>(null);
  // Les deux `window.alert` ci-dessous ont été remplacés par ce bandeau :
  // une modale d'erreur impose un clic supplémentaire pour être refermée,
  // alors qu'un `role="alert"` est annoncé par le lecteur d'écran dès son
  // apparition. Le bandeau se referme tout seul au premier rendu de la page
  // suivante ; l'utilisateur relance l'action depuis sa ligne.
  const [actionError, setActionError] = useState<string | null>(null); const [pending, setPending] = useState<PendingAction>(null);
  function closeDialog() { if (busyId === null) setPending(null); }
  function reportError(message: string) { setActionError(message); }
  async function runPending() {
    if (!pending) return;
    const action = pending;
    setPending(null);
    setActionError(null);
    if (action.kind === 'deactivate') { await handleToggle(action.job, false); return; }
    await handleDelete(action.job);
  }
  async function handleDelete(job: DashboardJob) {
    if (!job.id) return;
    setBusyId(String(job.id));
    try {
      await deleteCompanyJob(job.id);
      setJobs((previous) => previous.filter((item) => item.id !== job.id)); reload();
    } catch (error) {
      // 400 = l'offre a déjà reçu des candidatures : la suppression est
      // refusée par l'API. On propose l'alternative (désactivation) dans un
      // second dialogue, au lieu du `window.confirm` imbriqué qui empilait
      // deux boîtes système sans lien visible entre elles.
      if ((error as { status?: number }).status === 400) setPending({ kind: 'deactivate', job });
      else reportError(error instanceof Error ? error.message : "Impossible de supprimer l'offre.");
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
    } catch (error) { reportError(error instanceof Error ? error.message : "Impossible de modifier le statut de l'offre."); }
    finally { setBusyId(null); }
  }
  useEffect(() => { let active = true; setLoadingOwn(true); setOwnError(false); getCompanyJobs().then((result) => { if (active && result) setJobs(result as DashboardJob[]); }).catch(() => { if (active) setOwnError(true); }).finally(() => { if (active) setLoadingOwn(false); }); return () => { active = false; }; }, []);
  // SOURCE DE VÉRITÉ : `/company/jobs`. La fusion `jobs.length ? jobs : data.jobs`
  // était non déterministe (le premier tableau non vide gagnait) et pouvait
  // masquer une erreur de chargement : si l'appel dédié renvoyait une liste
  // vide à cause d'une erreur transitoire, la page affichait silencieusement
  // le snapshot du contexte, faisant croire que l'entreprise n'a aucune offre.
  // Même commentaire dans `ApplicationsOverview`.
  const filteredJobs = useMemo(() => jobs.filter((job) => { const text = `${job.title || ''} ${job.location || ''} ${job.contractType || ''}`.toLowerCase(); const matchesQuery = text.includes(query.toLowerCase()); const currentStatus = statusLabel(job.status).toLowerCase(); return matchesQuery && (status === 'all' || currentStatus === status); }), [jobs, query, status]);
  const loading = dashboardLoading || loadingOwn; const error = dashboardError || ownError;
  return <section className="jobs-page"><div className="dashboard-page-heading"><div><span className="dashboard-eyebrow">Espace recrutement</span><h1>Mes offres</h1><p>Gérez les opportunités publiées par votre entreprise.</p></div><Link href="/dashboard/jobs/new" className="button button-primary"><span>+</span> Créer une nouvelle offre</Link></div>{actionError ? <div className="dashboard-state dashboard-error" role="alert"><strong>{actionError}</strong><button type="button" className="button button-outline button-small" onClick={() => setActionError(null)}>Fermer</button></div> : null}{error ? <div className="dashboard-state dashboard-error"><strong>Impossible de charger vos offres.</strong><button type="button" className="button button-outline button-small" onClick={() => { setOwnError(false); reload(); }}>Réessayer</button></div> : <><div className="jobs-toolbar"><label className="jobs-search"><Icon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une offre…" aria-label="Rechercher une offre" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filtrer par statut"><option value="all">Tous les statuts</option><option value="active">Actives</option><option value="inactive">Inactives</option><option value="brouillon">Brouillons</option></select></div>{loading ? <div className="jobs-table jobs-table-skeleton">{[1, 2, 3, 4].map((item) => <div key={item}><i /><i /><i /></div>)}</div> : filteredJobs.length === 0 ? <div className="dashboard-panel"><div className="jobs-empty"><div className="matching-empty-icon"><Icon name="briefcase" size={24} /></div><h2>{jobs.length ? 'Aucune offre ne correspond à votre recherche.' : 'Vous n’avez encore publié aucune offre.'}</h2><p>{jobs.length ? 'Modifiez vos filtres pour retrouver vos offres.' : 'Créez votre première opportunité pour commencer à recevoir des candidatures.'}</p>{!jobs.length && <Link href="/dashboard/jobs/new" className="button button-primary">Créer ma première offre</Link>}</div></div> : <div className="jobs-table" role="table" aria-label="Mes offres"><div className="jobs-table-head" role="row"><span>Offre</span><span>Localisation</span><span>Candidatures</span><span>Statut</span><span>Actions</span></div>{filteredJobs.map((job, index) => <div className="jobs-table-row" role="row" key={job.id || index}><div><strong>{job.title || 'Offre sans titre'}</strong><small>{job.contractType || 'Type non renseigné'}{job.publishedAt ? ` · Publiée le ${new Date(job.publishedAt).toLocaleDateString('fr-FR')}` : ''}</small></div><span>{job.location || 'Non renseignée'}</span><span>{typeof job.applicationsCount === 'number' ? job.applicationsCount : '--'}</span><em className={`job-status status-${statusLabel(job.status).toLowerCase()}`}>{statusLabel(job.status)}</em><div className="job-actions"><Link href={`/dashboard/jobs/${job.id || ''}`} aria-label={`Voir ${job.title || 'l’offre'}`}>Voir</Link><Link href={`/dashboard/jobs/${job.id || ''}/edit`} aria-label={`Modifier ${job.title || 'l’offre'}`}>Modifier</Link><button type="button" disabled={String(job.id) === busyId} onClick={() => { setActionError(null); void handleToggle(job); }}>{statusLabel(job.status) === 'Active' ? 'Désactiver' : 'Activer'}</button><button type="button" className="job-action-danger" disabled={String(job.id) === busyId} onClick={() => { setActionError(null); setPending({ kind: 'delete', job }); }}>Supprimer</button></div></div>)}</div>}</>}{pending ? <ConfirmDialog title={pending.kind === 'delete' ? 'Supprimer cette offre ?' : 'Désactiver cette offre ?'} message={pending.kind === 'delete' ? `L'offre « ${pending.job.title || 'sans titre'} » sera définitivement supprimée. Cette action est irréversible.` : `L'offre « ${pending.job.title || 'sans titre'} » a déjà reçu des candidatures : elle ne peut pas être supprimée. La désactiver la retire des recherches sans effacer son historique.`} confirmLabel={pending.kind === 'delete' ? 'Supprimer' : 'Désactiver'} tone={pending.kind === 'delete' ? 'danger' : 'default'} busy={busyId !== null} onConfirm={() => { void runPending(); }} onClose={closeDialog} /> : null}</section>;
}
