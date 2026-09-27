import AdminResourcePage from '@/components/admin/AdminResourcePage';
import { isKnownAdminSection } from '@/lib/admin-resources';
import { notFound } from 'next/navigation';

// La section est validée côté serveur : une section inconnue renvoie un vrai
// 404 au lieu d'afficher silencieusement le tableau d'une autre ressource
// (le comportement précédent faisait `configs[section] || configs.activity`,
// ce qui faisait qu'un lien vers /admin/settings ou /admin/security — tous deux
// présents dans la navigation — affichait l'activité sans le moindre signal).
export async function generateStaticParams() {
  const { ADMIN_RESOURCE_CONFIGS } = await import('@/lib/admin-resources');
  return Object.keys(ADMIN_RESOURCE_CONFIGS).map((section) => ({ section }));
}

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isKnownAdminSection(section)) notFound();
  return <AdminResourcePage section={section} />;
}
