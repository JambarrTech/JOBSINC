'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest, DashboardData } from '@/lib/api';
import { useDashboard } from '@/components/dashboard/DashboardContext';

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Reçue', UNDER_REVIEW: 'En cours d\'examen', INTERVIEW: 'Entretien', ACCEPTED: 'Acceptée', REJECTED: 'Refusée',
};
const STATUS_COLORS: Record<string, string> = {
  RECEIVED: '#f59e0b', UNDER_REVIEW: '#3b82f6', INTERVIEW: '#8b5cf6', ACCEPTED: '#10b981', REJECTED: '#ef4444',
};
const TRANSITIONS: Record<string, string[]> = {
  RECEIVED: ['UNDER_REVIEW', 'INTERVIEW', 'ACCEPTED', 'REJECTED'],
  UNDER_REVIEW: ['INTERVIEW', 'ACCEPTED', 'REJECTED'],
  INTERVIEW: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: [],
  REJECTED: [],
};
const TRANSITION_ICONS: Record<string, string> = {
  UNDER_REVIEW: '🔍', INTERVIEW: '📹', ACCEPTED: '✅', REJECTED: '❌',
};

function statusBadge(status?: string) {
  const label = STATUS_LABELS[status || ''] || status || 'Non renseigné';
  const color = STATUS_COLORS[status || ''] || '#6b7280';
  return (
    <span style={{
      display: 'inline-block', padding: '5px 12px', borderRadius: '8px',
      background: `${color}15`, color, fontSize: '12px', fontWeight: 700,
      border: `1px solid ${color}30`,
    }}>{label}</span>
  );
}

function InterviewScheduleForm({ applicationId, onSuccess, onCancel }: {
  applicationId: string | number;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<'ONLINE' | 'PRESENTIEL'>('ONLINE');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('30');
  const [streamingUrl, setStreamingUrl] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const scheduledAt = date && time ? `${date}T${time}:00` : null;
      await apiRequest(`/interviews/applications/${applicationId}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ mode, scheduledAt, duration: Number(duration), streamingUrl, location, notes }),
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la planification.');
    } finally {
      setLoading(false);
    }
  }, [applicationId, mode, date, time, duration, streamingUrl, location, notes, onSuccess]);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #dce6ed',
    fontSize: '13px', outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: 600, color: '#4a5568' };

  return (
    <div style={{ padding: '24px', background: '#fff', borderRadius: '16px', border: '1px solid #e5ebf0', boxShadow: '0 8px 24px rgba(0,0,0,.06)' }}>
      <h2 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: '#1a1a2e' }}>Planifier l&apos;entretien</h2>
      <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#6b7280' }}>Remplissez les informations pour prévenir le candidat.</p>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', marginBottom: '16px', fontSize: '13px', color: '#dc2626' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <button
          type="button" onClick={() => setMode('ONLINE')}
          style={{
            flex: 1, padding: '12px', borderRadius: '10px', border: `2px solid ${mode === 'ONLINE' ? '#8b5cf6' : '#e5ebf0'}`,
            background: mode === 'ONLINE' ? '#8b5cf610' : '#fff', cursor: 'pointer',
            fontSize: '13px', fontWeight: 700, color: mode === 'ONLINE' ? '#8b5cf6' : '#6b7280', textAlign: 'center',
          }}
        >
          📹 En ligne
        </button>
        <button
          type="button" onClick={() => setMode('PRESENTIEL')}
          style={{
            flex: 1, padding: '12px', borderRadius: '10px', border: `2px solid ${mode === 'PRESENTIEL' ? '#f59e0b' : '#e5ebf0'}`,
            background: mode === 'PRESENTIEL' ? '#f59e0b10' : '#fff', cursor: 'pointer',
            fontSize: '13px', fontWeight: 700, color: mode === 'PRESENTIEL' ? '#f59e0b' : '#6b7280', textAlign: 'center',
          }}
        >
          🏢 Présentiel
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>Date *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} required />
        </div>
        <div>
          <label style={labelStyle}>Heure *</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} required />
        </div>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <label style={labelStyle}>Durée (minutes)</label>
        <select value={duration} onChange={(e) => setDuration(e.target.value)} style={inputStyle}>
          <option value="15">15 min</option>
          <option value="30">30 min</option>
          <option value="45">45 min</option>
          <option value="60">1 heure</option>
          <option value="90">1h30</option>
        </select>
      </div>

      {mode === 'ONLINE' && (
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Lien de streaming / visioconférence *</label>
          <input
            type="url" value={streamingUrl} onChange={(e) => setStreamingUrl(e.target.value)}
            placeholder="https://meet.google.com/xxx-xxxx-xxx"
            style={inputStyle}
          />
        </div>
      )}

      {mode === 'PRESENTIEL' && (
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Adresse du lieu *</label>
          <input
            type="text" value={location} onChange={(e) => setLocation(e.target.value)}
            placeholder="123 Rue de l'Entreprise, Dakar"
            style={inputStyle}
          />
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <label style={labelStyle}>Notes (optionnel)</label>
        <textarea
          value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Informations complémentaires pour le candidat..."
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          type="button" onClick={onCancel} disabled={loading}
          style={{
            flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #e5ebf0',
            background: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: '#6b7280',
          }}
        >Annuler</button>
        <button
          type="button" onClick={submit} disabled={loading || !date || !time || (mode === 'ONLINE' && !streamingUrl) || (mode === 'PRESENTIEL' && !location)}
          style={{
            flex: 1, padding: '12px', borderRadius: '10px', border: 'none',
            background: loading ? '#a5b4fc' : '#8b5cf6', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: 700, color: '#fff',
          }}
        >{loading ? 'Envoi...' : 'Planifier et notifier'}</button>
      </div>
    </div>
  );
}

export default function ApplicationDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, reload } = useDashboard();
  const contextApplication = data?.applications?.find((item) => String(item.id) === id);
  const [fetchedApplication, setFetchedApplication] = useState<NonNullable<DashboardData['applications']>[number] | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const application = contextApplication || fetchedApplication;
  const name = application?.candidateName || application?.name || 'Candidat';
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [showInterviewForm, setShowInterviewForm] = useState(false);

  useEffect(() => {
    if (contextApplication || !id) return;
    let active = true;
    apiRequest<NonNullable<DashboardData['applications']>[number]>(`/company/applications/${id}`)
      .then((result) => { if (active) setFetchedApplication(result); })
      .catch(() => { if (active) setFetchFailed(true); });
    return () => { active = false; };
  }, [contextApplication, id]);

  const changeStatus = useCallback(async (newStatus: string) => {
    if (!application?.id) return;
    setUpdating(true);
    setError('');
    try {
      await apiRequest(`/applications/${application.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (newStatus === 'INTERVIEW') {
        setShowInterviewForm(true);
      } else {
        reload();
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la mise à jour du statut.');
    } finally {
      setUpdating(false);
    }
  }, [application?.id, reload]);

  const handleInterviewScheduled = useCallback(() => {
    setShowInterviewForm(false);
    reload();
  }, [reload]);

  if (loading || (!application && !fetchFailed)) {
    return <section className="application-detail-page"><div className="dashboard-panel job-detail-skeleton" /></section>;
  }

  if (!application) {
    return (
      <section className="application-detail-page">
        <div className="dashboard-panel">
          <div className="jobs-empty">
            <h2>Cette candidature n&apos;est pas disponible.</h2>
            <p>Elle ne fait pas partie des candidatures accessibles pour cette entreprise.</p>
            <Link href="/dashboard/applications" className="button button-outline">Retour aux candidatures</Link>
          </div>
        </div>
      </section>
    );
  }

  const cvUrl = application?.cvUrl;
  const coverLetter = application?.coverLetter;
  const interview = (application as any).interview;
  const cvHref = cvUrl ? (cvUrl.startsWith('http') ? cvUrl : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5000'}${cvUrl}`) : null;
  const currentStatus = application.status || 'RECEIVED';
  const allowedTransitions = TRANSITIONS[currentStatus] || [];

  if (showInterviewForm) {
    return (
      <section className="application-detail-page">
        <Link href="/dashboard/applications" className="back-link">&larr; Retour aux candidatures</Link>
        <div style={{ maxWidth: '520px', margin: '24px auto' }}>
          <InterviewScheduleForm
            applicationId={application.id!}
            onSuccess={handleInterviewScheduled}
            onCancel={() => { setShowInterviewForm(false); reload(); }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="application-detail-page">
      <Link href="/dashboard/applications" className="back-link">&larr; Retour aux candidatures</Link>

      <div className="application-detail-header">
        <div className="candidate-avatar large">{name.slice(0, 1).toUpperCase()}</div>
        <div>
          <span className="dashboard-eyebrow">Profil candidat</span>
          <h1>{name}</h1>
          <p>{application.title || application.jobTitle || 'Poste non renseigné'}</p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', marginBottom: '1rem' }}>
          <p style={{ color: '#dc2626', margin: 0, fontSize: '13px' }}>{error}</p>
        </div>
      )}

      <div className="job-detail-grid">
        <div className="dashboard-panel">
          <h2>Informations</h2>
          <div className="job-detail-meta">
            <div>
              <span>Statut</span>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{statusBadge(currentStatus)}</strong>
            </div>
            <div>
              <span>Date de candidature</span>
              <strong>{application.date ? new Date(application.date).toLocaleDateString('fr-FR') : '--'}</strong>
            </div>
          </div>
        </div>

        <div className="dashboard-panel">
          <h2>Actions</h2>
          {allowedTransitions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {allowedTransitions.map((target) => (
                <button
                  key={target}
                  type="button"
                  disabled={updating}
                  onClick={() => changeStatus(target)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '10px 14px', borderRadius: '9px', border: '1px solid #e5ebf0',
                    background: '#fff', cursor: updating ? 'not-allowed' : 'pointer',
                    fontSize: '13px', fontWeight: 600, color: STATUS_COLORS[target] || '#333',
                    transition: 'background .2s',
                  }}
                  onMouseEnter={(e) => { if (!updating) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                >
                  <span>{TRANSITION_ICONS[target] || '→'}</span>
                  Passer à {STATUS_LABELS[target]}
                </button>
              ))}
            </div>
          ) : (
            <p className="detail-muted" style={{ marginTop: '8px' }}>
              {currentStatus === 'ACCEPTED' ? 'Ce candidat a été recruté.' : 'Aucune action disponible pour ce statut.'}
            </p>
          )}
        </div>
      </div>

      {currentStatus === 'INTERVIEW' && (
        <div style={{
          marginTop: '1.5rem', padding: '20px', borderRadius: '14px',
          background: interview ? (interview.mode === 'ONLINE' ? '#f5f3ff' : '#fffbeb') : '#f5f3ff',
          border: `1px solid ${interview ? (interview.mode === 'ONLINE' ? '#ddd6fe' : '#fde68a') : '#ddd6fe'}`,
        }}>
          {interview ? (
            <>
              <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 800, color: '#1a1a2e' }}>
                📅 Entretien planifié — {interview.mode === 'ONLINE' ? 'En ligne' : 'Présentiel'}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', fontSize: '13px', color: '#4a5568' }}>
                {interview.scheduledAt && (
                  <div><strong>Date</strong><br />{new Date(interview.scheduledAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                )}
                {interview.scheduledAt && (
                  <div><strong>Heure</strong><br />{new Date(interview.scheduledAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                )}
                {interview.duration && <div><strong>Durée</strong><br />{interview.duration} min</div>}
                {interview.mode === 'ONLINE' && interview.streamingUrl && (
                  <div><strong>Lien</strong><br /><a href={interview.streamingUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#8b5cf6', wordBreak: 'break-all' }}>{interview.streamingUrl}</a></div>
                )}
                {interview.mode === 'PRESENTIEL' && interview.location && (
                  <div><strong>Lieu</strong><br />{interview.location}</div>
                )}
              </div>
              {interview.notes && (
                <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: '#fff', fontSize: '13px', color: '#4a5568' }}>
                  <strong>Note :</strong> {interview.notes}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, color: '#1a1a2e' }}>
                📅 Entretien
              </h2>
              <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Aucun entretien planifié pour le moment.</p>
              <button
                type="button"
                onClick={() => setShowInterviewForm(true)}
                style={{
                  marginTop: '12px', padding: '10px 18px', borderRadius: '10px', border: 'none',
                  background: '#8b5cf6', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                }}
              >Planifier l'entretien</button>
            </>
          )}
        </div>
      )}

      {coverLetter && (
        <div className="dashboard-panel" style={{ marginTop: '1.5rem' }}>
          <h2>Lettre de motivation</h2>
          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'var(--text-primary, #1a1a2e)' }}>{coverLetter}</p>
        </div>
      )}

      {cvHref && (
        <div className="dashboard-panel" style={{ marginTop: '1.5rem' }}>
          <h2>CV</h2>
          <a
            href={cvHref}
            target="_blank"
            rel="noopener noreferrer"
            className="button button-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Ouvrir le CV (PDF)
          </a>
        </div>
      )}
    </section>
  );
}
