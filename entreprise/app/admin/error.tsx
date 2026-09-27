'use client';

import SectionError from '@/components/ui/SectionError';

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <SectionError
      error={error}
      reset={reset}
      title="Erreur d'administration"
      description="Une erreur est survenue dans le panneau d'administration."
      backHref="/admin"
      backLabel="Retour à l'administration"
    />
  );
}
