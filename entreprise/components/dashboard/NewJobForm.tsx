'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

type JobForm = { title: string; department: string; contractType: string; location: string; workMode: string; experience: string; educationLevel: string; minExperienceYears: string; maxExperienceYears: string; salaryMin: string; salaryMax: string; currency: string; deadline: string; description: string; responsibilities: string; skills: string };
const initialForm: JobForm = { title: '', department: '', contractType: '', location: '', workMode: '', experience: '', educationLevel: '', minExperienceYears: '', maxExperienceYears: '', salaryMin: '', salaryMax: '', currency: 'FCFA', deadline: '', description: '', responsibilities: '', skills: '' };

const EDUCATION_OPTIONS = ['Sans diplôme requis', 'Bac', 'Bac+2 (BTS/DUT)', 'Licence', 'Maîtrise', 'Master/Ingénieur', 'Doctorat'];

export default function NewJobForm({ jobId }: { jobId?: string }) {
  const isEdit = Boolean(jobId);
  const [form, setForm] = useState(initialForm); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [loading, setLoading] = useState(false); const [preview, setPreview] = useState(false); const [loadingJob, setLoadingJob] = useState(isEdit);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    apiRequest<{ id?: unknown; title?: string; department?: string | null; contractType?: string | null; location?: string; workMode?: string | null; experience?: string | null; educationLevel?: string | null; minExperienceYears?: number | null; maxExperienceYears?: number | null; salaryMin?: number | null; salaryMax?: number | null; currency?: string | null; deadline?: string | null; description?: string; responsibilities?: string | null; skills?: string | null }>(`/company/jobs/${jobId}`)
      .then((job) => {
        if (!active) return;
        setForm({
          ...initialForm,
          title: job.title || '', department: job.department || '', contractType: job.contractType || '',
          location: job.location || '', workMode: job.workMode || '', experience: job.experience || '',
          educationLevel: job.educationLevel || '',
          minExperienceYears: job.minExperienceYears != null ? String(job.minExperienceYears) : '',
          maxExperienceYears: job.maxExperienceYears != null ? String(job.maxExperienceYears) : '',
          salaryMin: job.salaryMin != null ? String(job.salaryMin) : '', salaryMax: job.salaryMax != null ? String(job.salaryMax) : '',
          currency: job.currency || 'FCFA', deadline: job.deadline ? String(job.deadline).slice(0, 10) : '',
          description: job.description || '', responsibilities: job.responsibilities || '', skills: job.skills || '',
        });
      })
      .catch(() => { if (active) setError("Impossible de charger l'offre à modifier."); })
      .finally(() => { if (active) setLoadingJob(false); });
    return () => { active = false; };
  }, [jobId]);

  function update(name: keyof JobForm, value: string) { setForm((current) => ({ ...current, [name]: value })); setError(''); setSuccess(''); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    if (!form.title.trim() || !form.contractType || !form.location.trim() || !form.description.trim() || !form.skills.trim()) { setError('Complétez les champs obligatoires avant de publier l’offre.'); return; }
    if (form.salaryMin && form.salaryMax && Number(form.salaryMin) > Number(form.salaryMax)) { setError('Le salaire minimum doit être inférieur au salaire maximum.'); return; }
    if (form.minExperienceYears && form.maxExperienceYears && Number(form.minExperienceYears) > Number(form.maxExperienceYears)) { setError('L’expérience minimum doit être inférieure à l’expérience maximum.'); return; }
    const payload = JSON.stringify({
      ...form,
      salaryMin: form.salaryMin || null, salaryMax: form.salaryMax || null,
      educationLevel: form.educationLevel || null,
      minExperienceYears: form.minExperienceYears === '' ? null : Number(form.minExperienceYears),
      maxExperienceYears: form.maxExperienceYears === '' ? null : Number(form.maxExperienceYears),
    });
    const endpoint = isEdit ? `/company/jobs/${jobId}` : process.env.NEXT_PUBLIC_CREATE_JOB_ENDPOINT;
    if (!endpoint) { setError('Le formulaire est prêt, mais l’endpoint de création d’offre n’est pas encore configuré.'); return; }
    setLoading(true);
    try {
      await apiRequest(endpoint, { method: isEdit ? 'PUT' : 'POST', body: payload });
      setSuccess(isEdit ? 'Votre offre a été mise à jour avec succès.' : 'Votre offre a été créée avec succès.');
      if (!isEdit) setForm(initialForm);
    } catch (err) { setError(err instanceof Error ? err.message : isEdit ? 'Impossible de mettre à jour l’offre.' : 'Impossible de créer l’offre.'); } finally { setLoading(false); }
  }

  const input = (name: keyof JobForm, label: string, type = 'text', required = false, placeholder = '') => <label className="job-form-field"><span>{label}{required && ' *'}</span><input type={type} value={form[name]} onChange={(event) => update(name, event.target.value)} placeholder={placeholder} required={required} /></label>;

  return (
    <div className="new-job-layout">
      <div className="new-job-main">
        <Link href="/dashboard/jobs" className="back-link">← Retour à mes offres</Link>
        <div className="job-form-heading">
          <div>
            <span className="dashboard-eyebrow">Espace recrutement</span>
            <h1>{isEdit ? 'Modifier l’offre' : 'Créer une nouvelle offre'}</h1>
            <p>Présentez clairement le poste pour attirer les bons talents.</p>
          </div>
        </div>
        {loadingJob ? <div className="dashboard-panel"><p>Chargement de l’offre…</p></div> : (
          <form className="job-form" onSubmit={submit}>
            <section className="dashboard-panel">
              <div className="job-form-section-title"><h2>Informations principales</h2><span>Les champs marqués d’un * sont obligatoires.</span></div>
              <div className="job-form-grid">
                {input('title', 'Titre du poste', 'text', true, 'Ex. Développeur Full Stack')}
                {input('department', 'Département', 'text', false, 'Ex. Produit & Technologie')}
                <label className="job-form-field"><span>Type de contrat *</span><select value={form.contractType} onChange={(event) => update('contractType', event.target.value)} required><option value="">Sélectionner</option><option>Temps plein</option><option>Temps partiel</option><option>CDD</option><option>Freelance</option><option>Stage</option></select></label>
                {input('location', 'Localisation', 'text', true, 'Ex. Dakar, Sénégal')}
                <label className="job-form-field"><span>Mode de travail</span><select value={form.workMode} onChange={(event) => update('workMode', event.target.value)}><option value="">Sélectionner</option><option>Sur site</option><option>Hybride</option><option>À distance</option></select></label>
                <label className="job-form-field"><span>Niveau d’expérience</span><select value={form.experience} onChange={(event) => update('experience', event.target.value)}><option value="">Sélectionner</option><option>Débutant</option><option>Intermédiaire</option><option>Confirmé</option><option>Expert</option></select></label>
                <label className="job-form-field"><span>Formation requise</span><select value={form.educationLevel} onChange={(event) => update('educationLevel', event.target.value)}><option value="">Sélectionner</option>{EDUCATION_OPTIONS.map((level) => <option key={level}>{level}</option>)}</select></label>
                {input('minExperienceYears', 'Expérience min. (années)', 'number', false, 'Ex. 1')}
                {input('maxExperienceYears', 'Expérience max. (années)', 'number', false, 'Ex. 5')}
              </div>
            </section>
            <section className="dashboard-panel">
              <div className="job-form-section-title"><h2>Rémunération et échéance</h2><span>Facultatif selon votre politique de recrutement.</span></div>
              <div className="job-form-grid job-form-grid-four">
                {input('salaryMin', 'Salaire minimum', 'number', false, '0')}
                {input('salaryMax', 'Salaire maximum', 'number', false, '0')}
                <label className="job-form-field"><span>Devise</span><select value={form.currency} onChange={(event) => update('currency', event.target.value)}><option>FCFA</option><option>EUR</option><option>USD</option></select></label>
                {input('deadline', 'Date limite', 'date')}
              </div>
            </section>
            <section className="dashboard-panel">
              <div className="job-form-section-title"><h2>Description du poste</h2><span>Décrivez le rôle, les attentes et le profil recherché.</span></div>
              <label className="job-form-field"><span>Description *</span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} maxLength={3000} rows={7} required placeholder="Présentez le poste et son impact dans l’entreprise…" /><small>{form.description.length} / 3000</small></label>
              <label className="job-form-field"><span>Responsabilités</span><textarea value={form.responsibilities} onChange={(event) => update('responsibilities', event.target.value)} rows={5} placeholder="Une responsabilité par ligne…" /></label>
              <label className="job-form-field"><span>Compétences recherchées *</span><textarea value={form.skills} onChange={(event) => update('skills', event.target.value)} rows={4} required placeholder="Une exigence par ligne ou séparée par des virgules. Ajoutez « (souhaité) » pour une compétence non obligatoire." /><small>Astuce : une compétence par ligne améliore la précision du matching.</small></label>
            </section>
            {error && <div className="form-error" role="alert">{error}</div>}
            {success && <div className="form-success" role="status">{success}</div>}
            <div className="job-form-actions">
              <Link href="/dashboard/jobs" className="button button-outline">Annuler</Link>
              <button type="button" className="button button-outline" onClick={() => setPreview(true)}>Prévisualiser</button>
              <button type="submit" className="button button-primary" disabled={loading}>{loading ? 'Enregistrement…' : isEdit ? 'Enregistrer les modifications' : 'Publier l’offre'}</button>
            </div>
          </form>
        )}
      </div>
      {preview && (
        <aside className="job-preview">
          <div className="preview-header"><span>Aperçu</span><button type="button" onClick={() => setPreview(false)} aria-label="Fermer l’aperçu">×</button></div>
          <div className="job-preview-card">
            <span className="dashboard-eyebrow">{form.contractType || 'Type de contrat'}</span>
            <h2>{form.title || 'Titre du poste'}</h2>
            <p>{form.location || 'Localisation'} · {form.workMode || 'Mode de travail'}</p>
            <hr />
            <h3>À propos du poste</h3>
            <p className="preview-text">{form.description || 'La description de votre offre apparaîtra ici.'}</p>
            <h3>Compétences</h3>
            <p className="preview-text">{form.skills || 'Les compétences recherchées apparaîtront ici.'}</p>
          </div>
        </aside>
      )}
    </div>
  );
}
