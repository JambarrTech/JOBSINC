'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { assetUrl, getCompanyProfile, updateCompanyProfile, uploadCompanyLogo, type CompanyProfile } from '@/lib/api';
import { useDashboard } from './DashboardContext';

type Tab = 'account' | 'notifications' | 'preferences' | 'security';

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'E'; }
function displayUser(user?: { name?: string; firstName?: string; lastName?: string; role?: string }) { return user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Compte entreprise'; }

export default function SettingsOverview() {
  const { data, loading, error, reload } = useDashboard();
  const [tab, setTab] = useState<Tab>('account');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [applicationAlerts, setApplicationAlerts] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(false);
  const [density, setDensity] = useState('comfortable');
  const [saved, setSaved] = useState(false);

  useEffect(() => { const stored = localStorage.getItem('jobsinc_settings'); if (!stored) return; try { const preferences = JSON.parse(stored); setEmailNotifications(preferences.emailNotifications ?? true); setApplicationAlerts(preferences.applicationAlerts ?? true); setWeeklySummary(preferences.weeklySummary ?? false); setDensity(preferences.density ?? 'comfortable'); } catch { return; } }, []);
  function savePreferences() { localStorage.setItem('jobsinc_settings', JSON.stringify({ emailNotifications, applicationAlerts, weeklySummary, density })); setSaved(true); window.setTimeout(() => setSaved(false), 2500); }
  const user = data?.user; const name = displayUser(user); const tabs = [['account', 'Compte', 'users'], ['notifications', 'Notifications', 'mail'], ['preferences', 'Préférences', 'chart'], ['security', 'Sécurité', 'lock']] as const;

  if (loading) return <section className="settings-page"><div className="settings-loading-heading" /><div className="settings-loading-layout"><div /><div /></div></section>;
  if (error) return <section className="settings-page"><div className="dashboard-state dashboard-error"><strong>Impossible de charger vos paramètres.</strong><button type="button" className="button button-outline button-small" onClick={reload}>Réessayer</button></div></section>;

  return <section className="settings-page"><div className="settings-heading"><div><span className="dashboard-eyebrow">Configuration de l’espace</span><h1>Paramètres</h1><p>Gérez votre compte entreprise et adaptez votre expérience JOBSINC.</p></div></div><div className="settings-layout"><nav className="settings-nav" aria-label="Sections des paramètres">{tabs.map(([key, label, icon]) => <button type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)} key={key}><Icon name={icon} size={17} /><span>{label}</span></button>)}</nav><div className="settings-content">{tab === 'account' && <AccountSection user={user} fallbackCompany={data?.company} onSaved={reload} />}{tab === 'notifications' && <section className="dashboard-panel settings-section"><div className="settings-section-heading"><div><span className="dashboard-eyebrow">Rester informé</span><h2>Notifications</h2><p>Choisissez les alertes que vous souhaitez recevoir dans votre espace.</p></div></div><div className="settings-options"><Toggle label="Notifications email" description="Recevoir les informations importantes liées à votre compte." checked={emailNotifications} onChange={setEmailNotifications} /><Toggle label="Nouvelles candidatures" description="Être alerté lorsqu’un candidat postule à vos offres." checked={applicationAlerts} onChange={setApplicationAlerts} /><Toggle label="Résumé hebdomadaire" description="Recevoir un récapitulatif de votre activité de recrutement." checked={weeklySummary} onChange={setWeeklySummary} /></div><SaveButton saved={saved} onClick={savePreferences} /></section>}{tab === 'preferences' && <section className="dashboard-panel settings-section"><div className="settings-section-heading"><div><span className="dashboard-eyebrow">Votre expérience</span><h2>Préférences d’affichage</h2><p>Ces préférences sont enregistrées sur cet appareil.</p></div></div><fieldset className="settings-choice-group"><legend>Densité de l’interface</legend><label className={density === 'comfortable' ? 'selected' : ''}><input type="radio" name="density" value="comfortable" checked={density === 'comfortable'} onChange={(event) => setDensity(event.target.value)} /><span><strong>Confortable</strong><small>Plus d’espace entre les informations.</small></span></label><label className={density === 'compact' ? 'selected' : ''}><input type="radio" name="density" value="compact" checked={density === 'compact'} onChange={(event) => setDensity(event.target.value)} /><span><strong>Compacte</strong><small>Plus d’informations visibles à l’écran.</small></span></label></fieldset><SaveButton saved={saved} onClick={savePreferences} /></section>}{tab === 'security' && <section className="dashboard-panel settings-section"><div className="settings-section-heading"><div><span className="dashboard-eyebrow">Protection du compte</span><h2>Sécurité</h2><p>Renforcez la protection de votre espace entreprise.</p></div></div><div className="security-list"><div><span className="security-icon"><Icon name="lock" size={17} /></span><span><strong>Mot de passe</strong><small>La modification utilise le système d’authentification existant.</small></span><button type="button" className="button button-outline button-small" disabled>Modifier</button></div><div><span className="security-icon teal"><Icon name="check" size={17} /></span><span><strong>Session active</strong><small>Votre session est gérée par l’authentification JOBSINC.</small></span><Link href="/login" className="button button-outline button-small">Se déconnecter</Link></div></div><div className="settings-notice"><Icon name="lock" size={16} /><span>Aucune donnée sensible n’est modifiée depuis cette interface sans API dédiée.</span></div></section>}</div></div></section>;
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="settings-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>; }
function SaveButton({ saved, onClick }: { saved: boolean; onClick: () => void }) { return <div className="settings-actions"><span role="status">{saved ? 'Préférences enregistrées sur cet appareil.' : ''}</span><button type="button" className="button button-primary" onClick={onClick}>{saved ? 'Enregistré' : 'Enregistrer les préférences'}</button></div>; }

type AccountField = 'name' | 'description' | 'website' | 'sector' | 'size' | 'country' | 'city' | 'address' | 'foundedYear';
const ACCOUNT_FIELDS: Array<[AccountField, string, string]> = [
  ['name', "Nom de l'entreprise", 'Ex : JOBSINC Sénégal'],
  ['sector', "Secteur d'activité", 'Ex : Technologies'],
  ['size', 'Effectif', 'Ex : 10-49 salariés'],
  ['website', 'Site web', 'https://…'],
  ['country', 'Pays', 'Ex : Sénégal'],
  ['city', 'Ville', 'Ex : Dakar'],
  ['address', 'Adresse', 'Rue, quartier…'],
  ['foundedYear', "Année de création", 'Ex : 2020'],
];

function AccountSection({ user, fallbackCompany, onSaved }: { user?: { name?: string; firstName?: string; lastName?: string; email?: string; role?: string }; fallbackCompany?: { name?: string; sector?: string; size?: string; country?: string; city?: string; address?: string; website?: string; foundedYear?: string | number; description?: string; logo?: string | null }; onSaved: () => void }) {
  const name = displayUser(user);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [fields, setFields] = useState<Record<AccountField, string>>({ name: '', description: '', website: '', sector: '', size: '', country: '', city: '', address: '', foundedYear: '' });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const justSavedRef = useRef(false);
  const [logoTick, setLogoTick] = useState(0);

  useEffect(() => {
    let active = true;
    if (justSavedRef.current) { justSavedRef.current = false; setLoadingProfile(false); return; }
    getCompanyProfile().then((result) => {
      if (!active) return;
      setProfile(result);
      setFields({
        name: result.name || '', description: result.description || '', website: result.website || '', sector: result.sector || '',
        size: result.size || '', country: result.country || '', city: result.city || '', address: result.address || '',
        foundedYear: result.foundedYear != null ? String(result.foundedYear) : '',
      });
    }).catch(() => {
      if (!active || !fallbackCompany) return;
      setFields((previous) => ({ ...previous, ...Object.fromEntries(Object.entries(fallbackCompany).filter(([, value]) => value != null).map(([key, value]) => [key, String(value)])) as Partial<Record<AccountField, string>> }));
    }).finally(() => { if (active) setLoadingProfile(false); });
    return () => { active = false; };
  }, [fallbackCompany]);

  const setField = useCallback((key: AccountField, value: string) => setFields((previous) => ({ ...previous, [key]: value })), []);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setFeedback(null);
    try {
      const updated = await updateCompanyProfile({ ...fields, foundedYear: fields.foundedYear.trim() || null });
      setProfile(updated); justSavedRef.current = true; onSaved();
      setFeedback({ kind: 'ok', message: 'Profil entreprise mis à jour.' });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Impossible de mettre à jour le profil.' });
    } finally { setSaving(false); }
  }

  async function handleLogo(file: File) {
    setLogoBusy(true); setFeedback(null);
    try {
      const updated = await uploadCompanyLogo(file);
      setProfile(updated); justSavedRef.current = true; setLogoTick((t) => t + 1); onSaved();
      setFeedback({ kind: 'ok', message: 'Logo mis à jour.' });
    } catch (error) {
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : "Impossible d'uploader le logo." });
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const logoUrl = assetUrl(profile?.logo ?? fallbackCompany?.logo ?? null);

  return <section className="dashboard-panel settings-section">
    <div className="settings-section-heading"><div><span className="dashboard-eyebrow">Profil entreprise</span><h2>Informations du compte</h2><p>Ces informations sont visibles par les candidats sur vos offres.</p></div><div className="settings-avatar">{initials(name)}</div></div>
    <div className="settings-logo-row">
      <span className="settings-logo-preview" aria-hidden>{logoUrl ? <img src={`${logoUrl}${logoUrl.includes('?') ? '&' : '?'}v=${logoTick}`} alt={`Logo ${profile?.name || name}`} /> : initials(profile?.name || name)}</span>
      <span>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) handleLogo(file); }} />
        <button type="button" className="button button-outline button-small" disabled={logoBusy} onClick={() => fileRef.current?.click()}>{logoBusy ? 'Envoi…' : 'Changer le logo'}</button>
        <small className="settings-logo-hint">JPG, PNG ou WebP — 5 Mo max.</small>
      </span>
    </div>
    <form onSubmit={handleSave}>
      <div className="settings-form-grid">
        {ACCOUNT_FIELDS.map(([key, label, placeholder]) => (
          <label key={key}>{label}<input value={fields[key]} placeholder={placeholder} disabled={loadingProfile} onChange={(event) => setField(key, key === 'foundedYear' ? event.target.value.replace(/\D/g, '').slice(0, 4) : event.target.value)} /></label>
        ))}
      </div>
      <label className="settings-description">Description de l’entreprise<textarea rows={4} value={fields.description} placeholder="Présentez votre entreprise aux candidats…" disabled={loadingProfile} onChange={(event) => setField('description', event.target.value)} /></label>
      <div className="settings-form-grid">
        <label>Email professionnel<input value={user?.email || 'Email non disponible'} readOnly /></label>
        <label>Fonction<input value={user?.role || 'Compte entreprise'} readOnly /></label>
      </div>
      <div className="settings-actions">
        <span role="status" className={feedback?.kind === 'error' ? 'settings-feedback-error' : undefined}>{feedback?.message || ''}</span>
        <button type="submit" className="button button-primary" disabled={saving || loadingProfile}>{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</button>
      </div>
    </form>
  </section>;
}
