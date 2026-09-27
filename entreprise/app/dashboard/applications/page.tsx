import { Suspense } from 'react';
import ApplicationsOverview from '@/components/dashboard/ApplicationsOverview';

// `ApplicationsOverview`lit `?job=` via `useSearchParams`. Sans boundary
// Suspense, Next.js fait basculer toute la page en rendu client-side et le HTML
// prérendu arrive SANS le filtre : au premier rendu, la liste affiche toutes
// les candidatures, puis se restreint. La boundary garde la page prérendable et
// fait attendre le résultat côté client uniquement.
export default function ApplicationsPage() {
  return (
    <Suspense fallback={<div className="dashboard-panel" aria-busy="true" />}>
      <ApplicationsOverview />
    </Suspense>
  );
}
