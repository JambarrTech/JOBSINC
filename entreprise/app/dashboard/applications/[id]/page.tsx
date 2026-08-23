'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { apiRequest, ensureConversation, DashboardData, startInterview, finishInterview, cancelInterview } from '@/lib/api';
import { useDashboard } from '@/components/dashboard/DashboardContext';
import { getMessagesSocket } from '@/lib/socket';

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
// Statuts ouvrant la messagerie (même règle côté backend).
const MESSAGING_STATUSES = ['INTERVIEW', 'ACCEPTED'];

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

const INTERVIEW_START_WINDOW_MINUTES = 10;

function formatInterviewDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatInterviewTime(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Modal JOBSYNC : Google Meet interdit l'affichage en iframe, la salle
// s'ouvre donc dans un nouvel onglet depuis cette modale d'information.
function MeetingJoinModal({ interview, companyName, candidateName, onClose }: {
  interview: NonNullable<any>;
  companyName?: string | null;
  candidateName?: string;
  onClose: () => void;
}) {
  const meetUrl = interview.meetUrl || interview.streamingUrl || '';
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        style={{ width: '100%', maxWidth: '440px', background: '#fff', borderRadius: '18px', padding: '24px', boxShadow: '0 24px 64px rgba(0,0,0,.25)' }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800, color: '#1a1a2e' }}>🎥 Entretien vidéo</h2>
        <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#6b7280' }}>
          {candidateName ? `Avec ${candidateName}` : ''}{companyName ? ` — ${companyName}` : ''}
        </p>
        <div style={{ display: 'grid', gap: '8px', padding: '14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e5ebf0', fontSize: '13px', color: '#4a5568' }}>
          <div><strong>{interview.jobTitle || 'Poste non renseigné'}</strong></div>
          {interview.scheduledAt && (
            <div>
              📅 {formatInterviewDate(interview.scheduledAt)} à {formatInterviewTime(interview.scheduledAt)}
              {interview.duration ? ` — ${interview.duration} min` : ''}
            </div>
          )}
          <div style={{ wordBreak: 'break-all', color: '#8b5cf6' }}>{meetUrl}</div>
        </div>
        <button
          type="button"
          onClick={() => window.open(meetUrl, '_blank', 'noopener,noreferrer')}
          disabled={!meetUrl}
          style={{
            width: '100%', marginTop: '18px', padding: '13px', borderRadius: '10px', border: 'none',
            background: meetUrl ? '#8b5cf6' : '#c4b5fd', color: '#fff', fontSize: '14px',
            fontWeight: 700, cursor: meetUrl ? 'pointer' : 'not-allowed',
          }}
        >Ouvrir Google Meet</button>
        <p style={{ margin: '10px 0 0', fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>
          Le salon s&apos;ouvre dans un nouvel onglet (Google Meet ne permet pas l&apos;affichage intégré).
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%', marginTop: '10px', padding: '11px', borderRadius: '10px',
            border: '1px solid #e5ebf0', background: '#fff', cursor: 'pointer',
            fontSize: '13px', fontWeight: 600, color: '#6b7280',
          }}
        >Fermer</button>
      </div>
    </div>
  );
}

// Carte « Entretien » : UN SEUL bloc, dont le rendu dépend du statut
// backend réel (aucune répétition d'informations).
function InterviewVideoCard({ interview, jobTitle, online, meetUrl, canStart, opensAt, busy, onStart, onFinish, onCancel, onJoin }: {
  interview: any;
  jobTitle: string;
  online: boolean;
  meetUrl: string;
  canStart: boolean;
  opensAt: Date | null;
  busy: boolean;
  onStart: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onJoin: () => void;
}) {
  const status = String(interview.status || 'PLANIFIE');
  const dateLine = interview.scheduledAt
    ? `${formatInterviewDate(interview.scheduledAt)}${interview.startedAt ? '' : ` à ${formatInterviewTime(interview.scheduledAt)}`}`
    : 'Date à définir';

  // ── 🔴 EN COURS : carte plein cadre, prioritaire ──
  if (status === 'EN_COURS') {
    return (
      <div style={{
        marginTop: '1.5rem', padding: '28px 24px', borderRadius: '16px', textAlign: 'center',
        background: 'linear-gradient(135deg, #fff1f2, #ffe4e6)', border: '2px solid #fb7185',
        boxShadow: '0 12px 32px rgba(244,63,94,.15)',
      }}>
        <p style={{ margin: '0 0 10px', fontSize: '15px', fontWeight: 900, color: '#e11d48', letterSpacing: '.04em' }}>🔴 ENTRETIEN EN COURS</p>
        <h2 style={{ margin: '0 0 2px', fontSize: '18px', fontWeight: 800, color: '#1a1a2e' }}>{jobTitle}</h2>
        {online && meetUrl && (
          <p style={{ margin: '6px auto 0', maxWidth: '420px', fontSize: '12px', color: '#be123c', wordBreak: 'break-all' }}>{meetUrl}</p>
        )}
        <p style={{ margin: '8px 0 16px', fontSize: '13px', color: '#be123c' }}>
          ● L&apos;entretien a commencé{interview.startedAt ? ` à ${formatInterviewTime(interview.startedAt)}` : ''}
          {!online && interview.location ? ` — ${interview.location}` : ''}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {online && meetUrl && (
            <button
              type="button"
              onClick={onJoin}
              style={{
                padding: '14px 30px', borderRadius: '12px', border: 'none', background: '#dc2626', color: '#fff',
                fontSize: '15px', fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 20px rgba(220,38,38,.3)',
              }}
            >🎥 Rejoindre l&apos;entretien</button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onFinish}
            style={{
              padding: '14px 24px', borderRadius: '12px', border: '1px solid #fda4af', background: '#fff',
              color: '#4a5568', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: 700,
            }}
          >Terminer l&apos;entretien</button>
        </div>
      </div>
    );
  }

  // ── ✓ TERMINÉ ──
  if (status === 'TERMINE') {
    return (
      <div className="dashboard-panel" style={{ marginTop: '1.5rem' }}>
        <h2>✓ Entretien terminé</h2>
        <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#1a1a2e' }}>{jobTitle}</p>
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
          {dateLine}{interview.finishedAt ? ` — terminé à ${formatInterviewTime(interview.finishedAt)}` : ''}
        </p>
        {online && meetUrl && (
          <button
            type="button"
            onClick={onJoin}
            style={{
              marginTop: '12px', padding: '9px 16px', borderRadius: '9px',
              border: '1px solid #dce6ed', background: '#fff', cursor: 'pointer',
              fontSize: '12px', fontWeight: 600, color: '#4a5568',
            }}
          >Voir les détails</button>
        )}
      </div>
    );
  }

  // ── ANNULÉ ──
  if (status === 'ANNULE') {
    return (
      <div className="dashboard-panel" style={{ marginTop: '1.5rem', opacity: .75 }}>
        <h2>Entretien annulé</h2>
        <p style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#1a1a2e' }}>{jobTitle}</p>
        <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>{dateLine}</p>
      </div>
    );
  }

  // ── 🟡 PLANIFIÉ : tous les détails + actions recruteur, une seule fois ──
  return (
    <div style={{
      marginTop: '1.5rem', padding: '20px', borderRadius: '14px',
      background: online ? '#f5f3ff' : '#fffbeb',
      border: `1px solid ${online ? '#ddd6fe' : '#fde68a'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1a1a2e' }}>
          🎥 Entretien {online ? 'en ligne' : 'présentiel'}
        </h2>
        <span style={{
          padding: '4px 10px', borderRadius: '8px', background: '#fef9c3', color: '#a16207',
          fontSize: '11px', fontWeight: 700, border: '1px solid #fde68a',
        }}>🟡 Planifié</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', fontSize: '13px', color: '#4a5568' }}>
        {interview.scheduledAt && (
          <div><strong>Date</strong><br />{new Date(interview.scheduledAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        )}
        {interview.scheduledAt && (
          <div><strong>Heure</strong><br />{formatInterviewTime(interview.scheduledAt)}</div>
        )}
        {interview.duration && <div><strong>Durée</strong><br />{interview.duration} min</div>}
        {online && meetUrl && (
          <div>
            <strong>Lien</strong><br />
            {canStart ? (
              <a href={meetUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#8b5cf6', wordBreak: 'break-all' }}>{meetUrl}</a>
            ) : (
              <span style={{ color: '#9ca3af' }}>
                Disponible à partir de {opensAt ? formatInterviewTime(opensAt.toISOString()) : 'l\'ouverture'}
              </span>
            )}
          </div>
        )}
        {!online && interview.location && (
          <div><strong>Lieu</strong><br />{interview.location}</div>
        )}
      </div>
      {interview.notes && (
        <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', background: '#fff', fontSize: '13px', color: '#4a5568' }}>
          <strong>Note :</strong> {interview.notes}
        </div>
      )}
      <div style={{ marginTop: '16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          disabled={busy || !canStart}
          onClick={onStart}
          title={canStart ? '' : 'Disponible jusqu\'à 10 minutes avant l\'heure prévue'}
          style={{
            padding: '11px 20px', borderRadius: '10px', border: 'none',
            background: busy || !canStart ? '#c4b5fd' : '#dc2626', color: '#fff',
            cursor: busy || !canStart ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: 800,
          }}
        >🎥 Démarrer l&apos;entretien</button>
        {!canStart && opensAt && (
          <span style={{ fontSize: '12px', color: '#8b5cf6' }}>
            Ouverture possible à partir de {formatInterviewTime(opensAt.toISOString())}
          </span>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => { if (window.confirm('Annuler cet entretien ? Le candidat sera notifié.')) onCancel(); }}
          style={{
            padding: '11px 18px', borderRadius: '10px', border: '1px solid #fecaca',
            background: '#fff', color: '#dc2626', cursor: busy ? 'not-allowed' : 'pointer',
            fontSize: '13px', fontWeight: 600,
          }}
        >Annuler l&apos;entretien</button>
      </div>
    </div>
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
  const [openingChat, setOpeningChat] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [interviewBusy, setInterviewBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (contextApplication || !id) return;
    let active = true;
    apiRequest<NonNullable<DashboardData['applications']>[number]>(`/company/applications/${id}`)
      .then((result) => { if (active) setFetchedApplication(result); })
      .catch(() => { if (active) setFetchFailed(true); });
    return () => { active = false; };
  }, [contextApplication, id]);

  // Temps réel : l'événement interview:update (rooms Socket.IO existantes)
  // rafraîchit la fiche et le contexte sans actualiser la page.
  useEffect(() => {
    const socket = getMessagesSocket();
    if (!socket) return;
    const handler = (payload: { applicationId?: string | number }) => {
      if (!id || (payload?.applicationId && String(payload.applicationId) !== String(id))) return;
      reload();
      apiRequest<NonNullable<DashboardData['applications']>[number]>(`/company/applications/${id}`)
        .then((result) => setFetchedApplication(result))
        .catch(() => {});
    };
    socket.on('interview:update', handler);
    return () => { socket.off('interview:update', handler); };
  }, [id, reload]);

  const runInterviewAction = useCallback(async (action: 'start' | 'finish' | 'cancel') => {
    if (!application?.id) return;
    setInterviewBusy(true);
    setError('');
    try {
      if (action === 'start') await startInterview(application.id);
      else if (action === 'finish') await finishInterview(application.id);
      else await cancelInterview(application.id);
      reload();
      const refreshed = await apiRequest<NonNullable<DashboardData['applications']>[number]>(`/company/applications/${application.id}`);
      setFetchedApplication(refreshed);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de l\'action sur l\'entretien.');
    } finally {
      setInterviewBusy(false);
    }
  }, [application?.id, reload]);

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

  // Ouvre (ou récupère) la conversation liée à cette candidature puis
  // redirige vers la messagerie avec la conversation présélectionnée.
  const openMessaging = async () => {
    if (!application?.id) return;
    setOpeningChat(true);
    setError('');
    try {
      const result = await ensureConversation(application.id);
      const conversationId = result?.conversation?.id;
      router.push(conversationId ? `/dashboard/messages?conversation=${conversationId}` : '/dashboard/messages');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Impossible d'ouvrir la messagerie pour cette candidature.");
    } finally {
      setOpeningChat(false);
    }
  };

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
          {MESSAGING_STATUSES.includes(currentStatus) && (
            <button
              type="button"
              onClick={openMessaging}
              disabled={openingChat}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                padding: '10px 14px', borderRadius: '9px', border: 'none',
                background: openingChat ? '#a5b4fc' : '#0a64e8', color: '#fff',
                cursor: openingChat ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 700, marginTop: '8px',
              }}
            >
              💬 {openingChat ? 'Ouverture…' : 'Contacter le candidat'}
            </button>
          )}
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

      {currentStatus === 'INTERVIEW' && !interview && (
        <div className="dashboard-panel" style={{ marginTop: '1.5rem' }}>
          <h2>📅 Entretien</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Aucun entretien planifié pour le moment.</p>
          <button
            type="button"
            onClick={() => setShowInterviewForm(true)}
            style={{
              marginTop: '12px', padding: '10px 18px', borderRadius: '10px', border: 'none',
              background: '#8b5cf6', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            }}
          >Planifier l'entretien</button>
        </div>
      )}

      {currentStatus === 'INTERVIEW' && interview && (() => {
        const opensAt = interview.scheduledAt ? new Date(new Date(interview.scheduledAt).getTime() - INTERVIEW_START_WINDOW_MINUTES * 60000) : null;
        return (
          <InterviewVideoCard
            interview={interview}
            jobTitle={application.jobTitle || application.title || interview.jobTitle || 'Entretien'}
            online={interview.mode === 'ONLINE'}
            meetUrl={interview.meetUrl || interview.streamingUrl || ''}
            canStart={!opensAt || Date.now() >= opensAt.getTime()}
            opensAt={opensAt}
            busy={interviewBusy}
            onStart={() => runInterviewAction('start')}
            onFinish={() => runInterviewAction('finish')}
            onCancel={() => runInterviewAction('cancel')}
            onJoin={() => setShowJoinModal(true)}
          />
        );
      })()}

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

      {showJoinModal && interview && (
        <MeetingJoinModal
          interview={{ ...interview, jobTitle: application.jobTitle || application.title || interview.jobTitle }}
          companyName={data?.company?.name}
          candidateName={name}
          onClose={() => setShowJoinModal(false)}
        />
      )}
    </section>
  );
}
