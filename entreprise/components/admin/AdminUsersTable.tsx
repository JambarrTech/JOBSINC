'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminUserRecord, getAdminUsers } from '@/lib/admin-api';

const roles = ['Tous', 'Candidats', 'Employés', 'Entreprises / recruteurs', 'Administrateurs'];
const roleMatches: Record<string, string[]> = { Candidats: ['CANDIDATE', 'CANDIDAT', 'CANDIDATES'], Employés: ['EMPLOYEE', 'EMPLOYÉ', 'EMPLOYE'], 'Entreprises / recruteurs': ['COMPANY', 'EMPLOYER', 'RECRUITER', 'ENTREPRISE'], Administrateurs: ['ADMIN', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'MODERATOR'] };

function value(record: AdminUserRecord, key: keyof AdminUserRecord) { return record[key] || '—'; }
function roleLabel(role?: string) { return role?.replaceAll('_', ' ') || '—'; }
function matchesRole(record: AdminUserRecord, selected: string) { if (selected === 'Tous') return true; const normalized = String(record.role || record.userType || '').toUpperCase(); return roleMatches[selected].some((role) => normalized.includes(role)); }

export default function AdminUsersTable() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [selectedRole, setSelectedRole] = useState('Tous');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pageSize = 8;
  async function load() { setLoading(true); setError(false); try { setUsers((await getAdminUsers()) || []); } catch { setError(true); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => users.filter((record) => matchesRole(record, selectedRole) && `${record.firstName || ''} ${record.lastName || ''} ${record.name || ''} ${record.email || ''} ${record.company || record.companyName || ''}`.toLowerCase().includes(query.toLowerCase())), [users, selectedRole, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  function changeRole(role: string) { setSelectedRole(role); setPage(1); }
  return <section className="admin-users-page"><div className="admin-page-heading"><div><p className="admin-kicker">Centre de gestion global</p><h2>Utilisateurs</h2><p>Candidats, employés, entreprises et administrateurs au même endroit.</p></div></div><div className="admin-users-toolbar"><label className="admin-users-search"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Rechercher un utilisateur..." aria-label="Rechercher un utilisateur" /></label><div className="admin-role-filters" role="group" aria-label="Filtrer par type d’utilisateur">{roles.map((role) => <button key={role} type="button" aria-pressed={selectedRole === role} className={selectedRole === role ? 'is-active' : ''} onClick={() => changeRole(role)}>{role}</button>)}</div></div>{error ? <div className="admin-alert admin-alert-error"><div><strong>Impossible de charger les utilisateurs.</strong><span>Vérifiez la disponibilité de l’endpoint Admin.</span></div><button className="admin-button admin-button-secondary" onClick={load}>Réessayer</button></div> : <div className="admin-card admin-table-wrap"><table className="admin-table"><thead><tr><th scope="col">Utilisateur</th><th scope="col">Email</th><th scope="col">Rôle</th><th scope="col">Statut</th><th scope="col">Entreprise</th><th scope="col">Inscription</th><th scope="col">Activité</th><th scope="col" aria-label="Actions" /></tr></thead><tbody>{loading ? Array.from({ length: 5 }).map((_, index) => <tr key={index}>{Array.from({ length: 8 }).map((__, cell) => <td key={cell}><span className="admin-table-skeleton" /></td>)}</tr>) : visible.length ? visible.map((record, index) => <tr key={record.id || index}><td><div className="admin-table-user"><span>{String(record.name || record.firstName || record.email || '?').slice(0, 1).toUpperCase()}</span><strong>{record.name || [record.firstName, record.lastName].filter(Boolean).join(' ') || 'Utilisateur sans nom'}</strong></div></td><td>{value(record, 'email')}</td><td><span className="admin-role-badge">{roleLabel(record.role || record.userType)}</span></td><td><span className="admin-status-badge">{value(record, 'status')}</span></td><td>{record.company || record.companyName || '—'}</td><td>{record.createdAt || record.registeredAt || '—'}</td><td>{record.lastActivity || record.lastLogin || '—'}</td><td><Link className="admin-table-action" href={`/admin/users/${record.id}`}>Voir</Link></td></tr>) : <tr><td colSpan={8}><div className="admin-table-empty"><strong>{query || selectedRole !== 'Tous' ? 'Aucun utilisateur trouvé.' : 'Aucun utilisateur disponible.'}</strong><span>Les résultats apparaîtront uniquement lorsqu’un endpoint Admin réel sera configuré.</span></div></td></tr>}</tbody></table>{!loading && filtered.length > 0 ? <div className="admin-pagination"><span>{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span><div><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Précédent</button><b>{page} / {pages}</b><button disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Suivant</button></div></div> : null}</div>}</section>;
}
