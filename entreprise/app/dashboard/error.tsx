'use client';

import SectionError from '@/components/ui/SectionError';

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionError
      error={error}
      reset={reset}
      title="Impossible de charger l'espace entreprise"
      description="Une erreur est survenue lors du chargement de votre tableau de bord."
      backHref="/dashboard"
      backLabel="Retour au tableau de bord"
    />
  );
}
