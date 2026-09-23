import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import Icon, { type IconName } from '@/components/ui/Icon';
import { getJob, assetUrl } from '@/lib/api';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const job = await getJob(id);
    return { title: `${job.title} — JOBSINC`, description: (job.description || '').slice(0, 160) };
  } catch {
    return { title: 'Offre introuvable — JOBSINC' };
  }
}

function formatSalary(job: any) {
  if (job.salaryMin == null && job.salaryMax == null) return null;
  const currency = job.currency || '';
  if (job.salaryMin != null && job.salaryMax != null) {
    return `${job.salaryMin.toLocaleString('fr-FR')} – ${job.salaryMax.toLocaleString('fr-FR')} ${currency}`;
  }
  return `${(job.salaryMin ?? job.salaryMax).toLocaleString('fr-FR')} ${currency}`;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
}

function Meta({ icon, value }: { icon: IconName; value?: string | null }) {
  if (!value) return null;
  return (
    <span className="job-meta-item">
      <Icon name={icon} size={15} />
      <span>{value}</span>
    </span>
  );
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  let job: any;
  try {
    job = await getJob(id);
  } catch {
    notFound();
  }

  const company = job.company;
  const companyName = typeof job.company === 'string' ? job.company : company?.name;
  const logo = typeof job.company === 'string' ? null : assetUrl(company?.logo || company?.image);
  const meta = [
    { icon: 'pin' as IconName, value: job.location },
    { icon: 'briefcase' as IconName, value: job.contractType },
    { icon: 'chart' as IconName, value: job.workMode },
    { icon: 'target' as IconName, value: job.experience },
    { icon: 'check' as IconName, value: formatSalary(job) },
  ].filter((item): item is { icon: IconName; value: string } => Boolean(item.value));

  const sections = [
    { key: 'description', title: 'Description du poste', content: job.description },
    { key: 'responsibilities', title: 'Responsabilités', content: job.responsibilities },
    { key: 'skills', title: 'Compétences recherchées', content: job.skills },
  ].filter((section) => section.content);

  return (
    <>
      <Header />
      <main>
        <section className="section section-tint">
          <div className="container">
            <nav className="job-detail-breadcrumb">
              <Link href="/">Accueil</Link>
              <Icon name="arrow" size={13} />
              <span>{companyName || 'Entreprise'}</span>
            </nav>

            <div className="job-detail-card">
              <div className="job-detail-head">
                {logo ? <img src={logo} alt={companyName || ''} className="job-detail-logo" /> : <span className="job-detail-logo job-detail-logo-fallback">{(companyName || 'J').slice(0, 1)}</span>}
                <div className="job-detail-title">
                  <div className="eyebrow">{companyName || 'Entreprise JOBSINC'}</div>
                  <h1>{job.title}</h1>
                  {job.publishedAt && <p className="job-detail-date">Publiée le {formatDate(job.publishedAt)}</p>}
                </div>
                {job.deadline && <span className="job-detail-deadline">Candidatures avant le {formatDate(job.deadline)}</span>}
              </div>

              <div className="job-detail-meta">{meta.map((item) => <Meta key={item.icon} icon={item.icon} value={item.value} />)}</div>

              <div className="job-detail-body">
                {sections.map((section) => (
                  <div key={section.key} className="job-detail-section">
                    <h2>{section.title}</h2>
                    {String(section.content).split(/\n+/).filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
                  </div>
                ))}
              </div>

              <div className="job-detail-actions">
                <Link href="/register" className="button button-primary">Postuler à cette offre</Link>
              </div>
            </div>

            {company && typeof company === 'object' && (company.description || company.location) && (
              <div className="job-detail-company">
                <h2>À propos de {company.name}</h2>
                {company.description && <p>{company.description}</p>}
                {company.location && <p className="job-meta-item"><Icon name="pin" size={15} />{company.location}</p>}
              </div>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}