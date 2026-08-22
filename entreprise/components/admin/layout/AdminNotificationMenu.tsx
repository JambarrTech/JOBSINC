'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

type AdminNotification = { id: string; title: string; message: string; category: string; read: boolean; recipient: string | null; createdAt: string };

export default function AdminNotificationMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setLoading(true);
      setError(false);
      apiRequest<AdminNotification[]>('/admin/notifications')
        .then((data) => { if (active) setItems(Array.isArray(data) ? data : []); })
        .catch(() => { if (active) setError(true); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open]);
  const unread = items.filter((item) => !item.read).length;
  return <div className="admin-notification-wrap"><button className="admin-icon-button" onClick={() => setOpen((value) => !value)} aria-label={unread > 0 ? `${unread} notifications non lues` : 'Notifications'} aria-expanded={open}>{unread > 0 ? <b>{unread}</b> : '○'}</button>{open ? <div className="admin-notification-dropdown"><strong>Notifications</strong>{loading ? <p>Chargement…</p> : error ? <p>Impossible de charger les notifications.</p> : items.length === 0 ? <p>Aucune notification sur la plateforme.</p> : <ul>{items.slice(0, 8).map((item) => <li key={item.id} style={{ fontWeight: item.read ? 400 : 700 }}><span>{item.title}</span><small>{item.recipient || 'Destinataire inconnu'} · {new Date(item.createdAt).toLocaleDateString('fr-FR')}</small></li>)}</ul>}<small>{items.length > 0 ? `${items.length} notification(s) récente(s)` : 'API notifications Admin connectée'}</small></div> : null}</div>;
}
