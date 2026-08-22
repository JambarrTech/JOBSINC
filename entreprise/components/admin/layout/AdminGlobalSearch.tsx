'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { apiRequest } from '@/lib/api';

type SearchResultItem = { id: string; label: string; sub: string; href: string };
type SearchResult = {
  users: SearchResultItem[];
  companies: SearchResultItem[];
  jobs: SearchResultItem[];
  applications: SearchResultItem[];
};

const emptyResult: SearchResult = { users: [], companies: [], jobs: [], applications: [] };
const groups: Array<[keyof SearchResult, string]> = [
  ['users', 'Utilisateurs'],
  ['companies', 'Entreprises'],
  ['jobs', 'Offres'],
  ['applications', 'Candidatures'],
];

export default function AdminGlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult>(emptyResult);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    let active = true;
    const timer = window.setTimeout(() => {
      if (trimmed.length < 2) {
        setResults(emptyResult);
        setLoading(false);
        return;
      }
      setLoading(true);
      apiRequest<SearchResult>(`/admin/search?q=${encodeURIComponent(trimmed)}`)
        .then((data) => { if (active) setResults(data); })
        .catch(() => { if (active) setResults(emptyResult); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  function renderDropdown() {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return (
        <>
          <p>Recherche globale</p>
          <span>Utilisateurs, entreprises, offres et candidatures</span>
          <small>Saisissez au moins 2 caractères.</small>
        </>
      );
    }
    if (loading) return <small>Recherche en cours…</small>;
    const total = groups.reduce((sum, [key]) => sum + results[key].length, 0);
    if (total === 0) return <small>Aucun résultat pour « {trimmed} ».</small>;
    return groups.map(([key, label]) => {
      if (results[key].length === 0) return null;
      return (
        <div key={key}>
          <p>{label}</p>
          {results[key].map((item) => (
            <Link key={`${key}-${item.id}`} href={item.href} className="admin-search-result">
              <strong>{item.label}</strong>
              <span>{item.sub}</span>
            </Link>
          ))}
        </div>
      );
    });
  }

  return (
    <div className="admin-global-search">
      <div className="admin-search">
        <Icon name="search" size={17} />
        <input
          ref={inputRef}
          aria-label="Recherche globale"
          placeholder="Rechercher dans JOBSINC"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <kbd>Ctrl K</kbd>
      </div>
      {open ? <div className="admin-search-dropdown">{renderDropdown()}</div> : null}
    </div>
  );
}
