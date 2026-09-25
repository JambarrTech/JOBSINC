'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { authenticateWithFiles } from '@/lib/api';
import RegistrationShowcase from '@/components/company-registration/RegistrationShowcase';

type FormValues = {
  firstName: string; lastName: string; email: string; phone: string; role: string; password: string; confirmPassword: string;
  companyName: string; sector: string; size: string; country: string; city: string; address: string; website: string; foundedYear: string; description: string;
};

type LogoFile = { id: string; file: File; preview: string };
const maxFileSize = 5 * 1024 * 1024;
const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];
const initialValues: FormValues = { firstName: '', lastName: '', email: '', phone: '', role: '', password: '', confirmPassword: '', companyName: '', sector: '', size: '', country: '', city: '', address: '', website: '', foundedYear: '', description: '' };

function Field({ label, name, value, onChange, type = 'text', placeholder, required = true }: { label: string; name: keyof FormValues; value: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder?: string; required?: boolean }) {
  return <div className="form-group"><label htmlFor={name}>{label}{required && <span aria-hidden="true"> *</span>}</label><input id={name} name={name} value={value} onChange={onChange} type={type} placeholder={placeholder} required={required} /></div>;
}

export default function RegistrationForm() {
  const [step, setStep] = useState(1); const [values, setValues] = useState<FormValues>(initialValues); const [logo, setLogo] = useState<LogoFile | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [success, setSuccess] = useState(false); const [terms, setTerms] = useState(false); const [privacy, setPrivacy] = useState(false);
  const update = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((current) => ({ ...current, [event.target.name]: event.target.value }));
  const revoke = (file: LogoFile) => URL.revokeObjectURL(file.preview);
  useEffect(() => () => { if (logo) revoke(logo); }, [logo]);
  const shortDescription = useMemo(() => values.description.trim(), [values.description]);

  function setLogoFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []); event.target.value = ''; if (!files.length) return;
    const invalid = files.find((file) => !acceptedTypes.includes(file.type)); if (invalid) { setError('Format non supporté. Utilisez JPG, JPEG, PNG ou WEBP.'); return; }
    const tooLarge = files.find((file) => file.size > maxFileSize); if (tooLarge) { setError('Le logo doit peser 5 Mo maximum.'); return; }
    setError(''); if (logo) revoke(logo);
    const file = files[0];
    setLogo({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, preview: URL.createObjectURL(file) });
  }
  function removeLogo() { if (logo) revoke(logo); setLogo(null); }
  function validateCurrentStep() {
    if (step === 1 && values.password !== values.confirmPassword) { setError('Les mots de passe ne correspondent pas.'); return false; }
    if (step === 3 && values.description.length > 500) { setError('La présentation ne peut pas dépasser 500 caractères.'); return false; }
    setError(''); return true;
  }
  function next() { if (validateCurrentStep()) setStep((current) => Math.min(4, current + 1)); }
  function previous() { setError(''); setStep((current) => Math.max(1, current - 1)); }
  async function setFrontendCookie(token: string) {
    try {
      await fetch('/api/auth/cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'include',
      });
    } catch {}
  }

  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!validateCurrentStep() || !terms || !privacy) { setError('Veuillez accepter les conditions d’utilisation et la politique de confidentialité.'); return; } if (!logo) { setError('Veuillez ajouter le logo de votre entreprise.'); return; } setLoading(true); setError(''); const endpoint = process.env.NEXT_PUBLIC_REGISTER_ENDPOINT || '/auth/register/company'; const fields = Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'confirmPassword' && key !== 'description')); const payload = { ...fields, description: values.description }; try { const result = await authenticateWithFiles(endpoint, payload, [logo.file], 'logo'); if (result.token) await setFrontendCookie(result.token); setSuccess(true); } catch (err) { setError(err instanceof Error ? err.message : 'Impossible de créer le compte pour le moment.'); } finally { setLoading(false); } }

  if (success) return <div className="form-shell"><RegistrationShowcase /><main className="form-main"><div className="form-card success-card"><div className="success-mark">✓</div><div className="eyebrow">Inscription terminée</div><h2>Votre espace entreprise est prêt.</h2><p>Merci d’avoir rejoint JOBSINC. Vous pouvez maintenant accéder à votre tableau de bord.</p><Link href="/dashboard" className="button button-primary">Accéder à mon tableau de bord</Link></div></main></div>;

  return <div className="form-shell"><RegistrationShowcase /><main className="form-main"><div className="registration-card"><div className="registration-head"><div><div className="eyebrow">Espace entreprise</div><h2>Créer votre compte</h2></div><span className="step-count">Étape {step} / 4</span></div><div className="progress"><span style={{ width: `${step * 25}%` }} /></div><div className="step-labels"><span className={step >= 1 ? 'active' : ''}>Responsable</span><span className={step >= 2 ? 'active' : ''}>Entreprise</span><span className={step >= 3 ? 'active' : ''}>Présentation</span><span className={step >= 4 ? 'active' : ''}>Validation</span></div><form onSubmit={submit}>
    {step === 1 && <section className="registration-step"><h3>Créer votre compte</h3><p className="step-intro">Les informations du responsable de votre espace entreprise.</p><div className="form-grid"><Field label="Prénom" name="firstName" value={values.firstName} onChange={update} /><Field label="Nom" name="lastName" value={values.lastName} onChange={update} /><Field label="Email professionnel" name="email" value={values.email} onChange={update} type="email" placeholder="vous@entreprise.com" /><Field label="Téléphone" name="phone" value={values.phone} onChange={update} type="tel" placeholder="+221 77 000 00 00" /><div className="form-group"><label htmlFor="role">Fonction *</label><select id="role" name="role" value={values.role} onChange={update} required><option value="">Sélectionnez une fonction</option><option>Directeur / Dirigeant</option><option>Responsable RH</option><option>Recruteur</option><option>Responsable recrutement</option><option>Manager</option><option>Autre</option></select></div><div /><Field label="Mot de passe" name="password" value={values.password} onChange={update} type="password" /><Field label="Confirmation du mot de passe" name="confirmPassword" value={values.confirmPassword} onChange={update} type="password" /></div><p className="form-hint">Votre adresse email professionnelle sera utilisée pour sécuriser votre compte.</p></section>}
    {step === 2 && <section className="registration-step"><h3>Parlez-nous de votre entreprise</h3><p className="step-intro">Ces informations aideront les candidats à mieux comprendre votre activité.</p><div className="form-grid"><Field label="Nom de l’entreprise" name="companyName" value={values.companyName} onChange={update} /><div className="form-group"><label htmlFor="sector">Secteur d’activité *</label><input id="sector" name="sector" value={values.sector} onChange={update} required placeholder="Technologie, commerce…" /></div><div className="form-group"><label htmlFor="size">Taille de l’entreprise *</label><select id="size" name="size" value={values.size} onChange={update} required><option value="">Sélectionnez une taille</option><option>1 à 10 employés</option><option>11 à 50 employés</option><option>51 à 200 employés</option><option>201 à 500 employés</option><option>Plus de 500 employés</option></select></div><Field label="Pays" name="country" value={values.country} onChange={update} placeholder="Sénégal" /><Field label="Ville" name="city" value={values.city} onChange={update} placeholder="Dakar" /><Field label="Adresse" name="address" value={values.address} onChange={update} /><Field label="Site web" name="website" value={values.website} onChange={update} type="url" placeholder="https://…" required={false} /><Field label="Année de création" name="foundedYear" value={values.foundedYear} onChange={update} type="number" placeholder="2020" required={false} /></div></section>}
    {step === 3 && <section className="registration-step"><h3>Présentez votre entreprise</h3><p className="step-intro">Une présentation claire permet aux candidats de se projeter.</p><div className="form-group"><label htmlFor="description">Présentation de l’entreprise *</label><textarea id="description" name="description" value={values.description} onChange={update} maxLength={500} rows={6} required placeholder="Expliquez en quelques mots ce que fait votre entreprise, vos activités principales, vos services ou produits…" /><div className="character-count">{values.description.length} / 500</div></div><div className="gallery-intro"><h3>Logo de l’entreprise</h3><p>Ajoutez le logo officiel de votre entreprise. Il sera affiché sur JOBSINC à côté de votre nom et de vos offres.</p></div>{logo ? <div className="logo-preview"><div className="logo-circle"><Image src={logo.preview} alt="Aperçu du logo de l’entreprise" fill sizes="110px" unoptimized /></div><button type="button" className="logo-remove" onClick={removeLogo}>Changer de logo</button></div> : <label className="upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={setLogoFile} /><span className="upload-plus">+</span><strong>Ajouter le logo</strong><small>JPG, JPEG, PNG ou WEBP · 5 Mo maximum · format carré recommandé</small></label>}</section>}
    {step === 4 && <section className="registration-step"><h3>Vérifiez vos informations</h3><p className="step-intro">Votre entreprise apparaîtra sur JOBSINC avec ces informations.</p><div className="company-preview"><div className="preview-photo">{logo ? <div className="logo-circle"><Image src={logo.preview} alt="Logo de l’entreprise" fill sizes="110px" unoptimized /></div> : <span>LOGO ENTREPRISE</span>}</div><div className="preview-body"><h4>{values.companyName || 'Nom de l’entreprise'}</h4><p>{values.sector || 'Secteur'} · {values.city || 'Ville'}, {values.country || 'Pays'}</p><blockquote>“{shortDescription || 'Courte présentation de votre entreprise…'}”</blockquote></div></div><div className="summary-grid"><div><strong>Responsable</strong><span>{values.firstName} {values.lastName}</span><span>{values.email}</span><span>{values.role}</span><span>{values.phone}</span></div><div><strong>Entreprise</strong><span>{values.companyName}</span><span>{values.sector}</span><span>{values.city}, {values.country}</span><span>{values.website || 'Site web non renseigné'}</span></div><div><strong>Présentation</strong><span>{values.description}</span></div><div><strong>Logo</strong><span>{logo ? 'Logo sélectionné' : 'Aucun logo sélectionné'}</span></div></div><label className="consent"><input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} /> J’accepte les conditions d’utilisation.</label><label className="consent"><input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} /> J’accepte la politique de confidentialité.</label></section>}
    {error && <div className="form-error" role="alert">{error}</div>}<div className="registration-actions">{step > 1 && <button type="button" className="button button-outline" onClick={previous}>Retour</button>}{step < 4 ? <button type="button" className="button button-primary" onClick={next}>Continuer</button> : <button type="submit" className="button button-primary" disabled={loading}>{loading ? 'Création en cours…' : 'Créer mon compte entreprise'}</button>}</div></form><div className="form-foot">Vous avez déjà un compte ? <Link href="/login">Se connecter</Link></div><div className="form-foot"><Link href="/">Retour à l’accueil</Link></div></div></main></div>;
}
