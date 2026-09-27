'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminDataTable, { AdminColumn } from './data/AdminDataTable';
import AdminFilters from './data/AdminFilters';
import AdminPagination from './data/AdminPagination';
import AdminPageHeader from './layout/AdminPageHeader';
import AdminButton from './ui/AdminButton';
import { getAdminResource, getAdminResourceEndpoint } from '@/lib/admin-api';
import { ADMIN_RESOURCE_CONFIGS, type AdminResourceConfig } from '@/lib/admin-resources';

type Row = Record<string, unknown> & { id?: string | number };

const normalize = (value: unknown) => (value === undefined || value === null || value === '' ? '—' : String(value));

export default function AdminResourcePage({ section }: { section: string }) {
  // La section est déjà validée côté serveur (app/admin/[section]/page.tsx
  // renvoie un 404 si elle est inconnue). On garde une garde défensive ici
  // plutôt que de retomber silencieusement sur une autre ressource.
  const config: AdminResourceConfig | undefined = ADMIN_RESOURCE_CONFIGS[section];

  const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [query, setQuery] = useState(''); const [filters, setFilters] = useState<Record<string, string>>({}); const [page, setPage] = useState(1); const pageSize = 10;

  // La résolution se fait par la CLÉ DE SECTION (identique à `config.endpoint`
  // dans le catalogue, mais c'est la clé que connaît la map d'endpoints).
  // Un accès `process.env[\`...\`]` ne peut pas être inliné par Next : cf. le
  // commentaire de `ADMIN_RESOURCE_ENDPOINTS` dans lib/admin-api.ts.
  const hasEndpoint = Boolean(getAdminResourceEndpoint(section));

  const load = useCallback(async () => {
    if (!hasEndpoint) { setLoading(false); return; }
    setLoading(true); setError(false);
    try { setRows(((await getAdminResource(section)) as Row[]) || []); } catch { setError(true); } finally { setLoading(false); }
  }, [hasEndpoint, section]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter((row) => Object.values(row).join(' ').toLowerCase().includes(query.toLowerCase()) && Object.entries(filters).every(([key, filter]) => !filter || String(row[key] || '').toLowerCase() === filter.toLowerCase())), [rows, query, filters]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); const visible = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (!config) {
    return <section className="admin-resource-page"><AdminPageHeader title="Section introuvable" description={`La section « ${section} » n'existe pas.`} /></section>;
  }

  const columns: AdminColumn<Row>[] = config.columns.map((column) => ({ ...column, render: (row) => normalize(row[column.key]) }));

  return <section className="admin-resource-page"><AdminPageHeader title={config.title} description={config.description} actions={<AdminButton variant="secondary" disabled={!hasEndpoint}>Exporter</AdminButton>} /><div className="admin-resource-toolbar"><label className="admin-users-search"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={`Rechercher dans ${config.title.toLowerCase()}...`} aria-label={`Rechercher dans ${config.title}`} /></label><AdminFilters filters={config.filters} values={filters} onChange={(key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); }} /></div><AdminDataTable columns={columns} rows={visible} loading={loading} error={error} onRetry={load} emptyTitle={hasEndpoint ? config.empty : `Endpoint Admin non configuré pour « ${config.title} ». Renseignez NEXT_PUBLIC_ADMIN_${section.replace(/[^a-zA-Z]/g, '').toUpperCase()}_ENDPOINT pour activer cette ressource.`} /><div className="admin-resource-pagination"><AdminPagination page={page} totalPages={pages} totalItems={filtered.length} onPageChange={setPage} /></div></section>;
}
