'use client';

import { useEffect, useState } from 'react';
import { getOverviewStats, isApiConfigured, type OverviewData } from '@/lib/api';

export default function HeroOverviewCard() {
  const [data, setData] = useState<OverviewData | null>(null);

  useEffect(() => {
    if (isApiConfigured()) {
      getOverviewStats().then(setData).catch(() => {});
    }
  }, []);

  const talents = data?.talents ?? null;
  const growth = data?.growth ?? null;
  const candidates = data?.candidates ?? [];
  const activity = data?.activity ?? [40, 60, 50, 80, 65];
  const applicationsToday = data?.applicationsToday ?? null;
  const activeJobs = data?.activeJobs ?? null;

  const formatGrowth = (value: number | null) => {
    if (value === null) return null;
    return value > 0 ? `+${value}% ce mois-ci` : value === 0 ? 'stable ce mois-ci' : `${value}% ce mois-ci`;
  };

  return (
    <>
      <div className="dashboard-card">
        <div className="dash-top">
          <span className="dash-title">Vue d'ensemble</span>
          <span className="dash-status">En activité</span>
        </div>
        <div className="dash-body">
          <div>
            <div className="dash-label">Talents inscrits</div>
            <div className="dash-number">{talents !== null ? talents.toLocaleString('fr-FR') : '—'}</div>
            {growth !== null && <div className="dash-trend">{formatGrowth(growth)}</div>}
          </div>
          <div>
            <div className="dash-label">Offres actives</div>
            <div className="dash-number" style={{ fontSize: '24px' }}>{activeJobs !== null ? activeJobs.toLocaleString('fr-FR') : '—'}</div>
          </div>
          <div>
            <div className="dash-label">Activité</div>
            <div className="dash-bars">
              {activity.map((height, i) => (
                <i key={i} style={{ height: `${Math.max(10, height)}%` }} />
              ))}
            </div>
          </div>
          <div className="candidate-list">
            <div className="dash-label">Profils récemment ajoutés</div>
            {candidates.length > 0 ? candidates.map((c, i) => (
              <div className="candidate" key={i}>
                <div className="avatar">{c.initials}</div>
                <div>
                  <strong>{c.name}</strong>
                  {c.detail && <small>{c.detail}</small>}
                </div>
              </div>
            )) : (
              <div className="candidate">
                <div className="avatar">—</div>
                <div>
                  <strong>En attente de profils</strong>
                  <small>Aucun candidat pour le moment</small>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="float-card one">
        <span>Offres ouvertes</span>
        <strong>{activeJobs !== null ? activeJobs.toLocaleString('fr-FR') : '—'}</strong>
        <span>en ce moment</span>
      </div>
      <div className="float-card two">
        <span>Candidatures</span>
        <strong>{applicationsToday !== null ? `+${applicationsToday} aujourd'hui` : '—'}</strong>
        <span>reçues ce jour</span>
      </div>
    </>
  );
}
