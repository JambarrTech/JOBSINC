'use client';

import { useState } from 'react';
import Image from 'next/image';
import Icon from '@/components/ui/Icon';
import { apiRequest } from '@/lib/api';

type NotificationItem = { id?: string | number; label?: string; read?: boolean };

export default function DashboardHeader({ title, onMenu, user, notifications, onNotificationsChange }: { title: string; onMenu: () => void; user?: { name?: string; avatar?: string | null }; notifications?: NotificationItem[]; onNotificationsChange?: () => void }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const unread = notifications?.filter((item) => !item.read).length || 0;
  async function markRead(id?: string | number) {
    if (!id || busy) return;
    setBusy(true);
    try { await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }); onNotificationsChange?.(); } catch { /* ignore */ } finally { setBusy(false); }
  }
  async function markAllRead() {
    if (busy) return;
    setBusy(true);
    try { await apiRequest('/notifications/read-all', { method: 'PATCH' }); onNotificationsChange?.(); } catch { /* ignore */ } finally { setBusy(false); }
  }
  return <header className="dashboard-header"><div className="dashboard-header-left"><button type="button" className="dashboard-menu-button" onClick={onMenu} aria-label="Ouvrir le menu"><span /><span /><span /></button><span>{title}</span></div><div className="dashboard-header-actions"><button type="button" className="notification-button" aria-label={`${unread} notification${unread > 1 ? 's' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="mail" size={18} />{unread > 0 && <b>{unread}</b>}</button>{open && <div className="notification-popover">{unread ? <>{notifications?.filter((item) => !item.read).map((item, index) => <p key={item.id ?? index}><button type="button" onClick={() => markRead(item.id)} disabled={busy}>{item.label || 'Nouvelle notification'}</button></p>)}<button type="button" className="notification-mark-all" onClick={markAllRead} disabled={busy}>Tout marquer comme lu</button></> : <p>Aucune nouvelle notification</p>}</div>}<div className="header-user"><span>{user?.name || 'Votre espace'}</span><div className="header-avatar">{user?.avatar ? <Image src={user.avatar} alt={user?.name || ''} width={28} height={28} unoptimized /> : user?.name?.slice(0, 1).toUpperCase() || 'E'}</div></div></div></header>;
}
