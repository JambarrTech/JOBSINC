'use client';

import { useEffect, useState } from 'react';
import { getJobs, Job } from '@/lib/api';
import Icon from '@/components/ui/Icon';

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getJobs().then((data) => setJobs(data.slice(0, 3))).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);

  return <section className="section" id="jobs"><div className="container"><div className="section-heading"><div className="eyebrow">Les opportunités commencent ici</div><h2>Des rôles qui méritent les bons profils.</h2><p>Découvrez les offres disponibles sur JOBSINC lorsque votre API est connectée.</p></div>{loading ? <div className="empty-state">Chargement des offres…</div> : error ? <div className="empty-state">Les offres ne sont pas disponibles pour le moment.</div> : jobs.length === 0 ? <div className="empty-state">Les offres disponibles apparaîtront ici dès que l’API sera connectée.</div> : <div className="jobs-grid">{jobs.map((job) => <article className="job-card" key={job.id}><div className="eyebrow">{job.company || 'Entreprise JOBSINC'}</div><h3>{job.title}</h3><div className="job-meta">{job.location && <span><Icon name="pin" size={14} />{job.location}</span>}{job.contractType && <span><Icon name="briefcase" size={14} />{job.contractType}</span>}</div><div className="job-foot"><span>{job.publishedAt ? new Date(job.publishedAt).toLocaleDateString('fr-FR') : 'Nouvelle offre'}</span><a className="job-link" href={`/jobs/${job.id}`}>Voir l’offre <Icon name="arrow" size={14} /></a></div></article>)}</div>}</div></section>;
}
