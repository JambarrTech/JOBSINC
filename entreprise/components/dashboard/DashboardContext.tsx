'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DashboardData, getDashboardData } from '@/lib/api';
import { getMessagesSocket } from '@/lib/socket';

type DashboardContextValue = { data: DashboardData | null; loading: boolean; error: string | null; days: number; setDays: (days: number) => void; reload: () => void };
const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [days, setDaysState] = useState(30);
  const load = useCallback((period: number) => { setLoading(true); setError(null); getDashboardData(period).then(setData).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Erreur inconnue.')).finally(() => setLoading(false)); }, []);
  const reload = useCallback(() => { load(days); }, [load, days]);
  const setDays = useCallback((period: number) => { setDaysState(period); load(period); }, [load]);
  useEffect(() => { load(days); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Temps réel : un changement d'entretien (démarrage, fin, annulation) rafraîchit le tableau de bord.
  useEffect(() => {
    const socket = getMessagesSocket();
    if (!socket) return;
    const handler = () => { load(days); };
    socket.on('interview:update', handler);
    return () => { socket.off('interview:update', handler); };
  }, [load, days]);
  const value = useMemo(() => ({ data, loading, error, days, setDays, reload }), [data, loading, error, days, setDays, reload]);
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error('useDashboard doit être utilisé dans DashboardProvider');
  return context;
}
