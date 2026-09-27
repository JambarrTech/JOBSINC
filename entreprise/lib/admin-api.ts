import { apiRequest } from '@/lib/api';
import { hasAdminRole } from '@/lib/admin-roles';

export type AdminUser = {
  id?: string | number;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
  avatar?: string | null;
};

export type AdminStat = number | string | null | undefined;

export type AdminOverviewData = {
  user?: AdminUser;
  stats?: Record<string, AdminStat>;
  attention?: Array<{ id?: string | number; label?: string; description?: string; count?: number; href?: string; priority?: string }>;
  activity?: Array<{ id?: string | number; actor?: string; action?: string; resource?: string; label?: string; date?: string; createdAt?: string }>;
  activitySeries?: Array<{ label?: string; date?: string; value?: number }>;
  system?: Array<{ id?: string | number; label?: string; status?: string; description?: string }>;
  userDistribution?: Array<{ label?: string; key?: string; value?: number; count?: number; color?: string }>;
  securitySummary?: Array<{ label?: string; value?: number | string; status?: string; href?: string }>;
};

export type AdminUserRecord = AdminUser & {
  phone?: string;
  status?: string;
  company?: string;
  companyName?: string;
  createdAt?: string;
  registeredAt?: string;
  lastActivity?: string;
  lastLogin?: string;
  userType?: string;
};

export type AdminAuthResponse = {
  token?: string;
  user?: AdminUser;
};

const adminLoginEndpoint = process.env.NEXT_PUBLIC_ADMIN_LOGIN_ENDPOINT || '/auth/login/admin';

export async function adminLogin(payload: Record<string, unknown>) {
  const options = { method: 'POST', body: JSON.stringify(payload) } as const;
  try {
    return await apiRequest<AdminAuthResponse>(adminLoginEndpoint, options);
  } catch (error) {
    // Compatibilité pendant le déploiement progressif du backend admin dédié.
    if ((error as { status?: number })?.status !== 404 || adminLoginEndpoint === '/auth/login') throw error;
    return apiRequest<AdminAuthResponse>('/auth/login', options);
  }
}

// `verifyAdminSession()` a été SUPPRIMÉ : aucun appelant (vérifié par grep sur
// `app/`, `components/`, `lib/` et `tests/`). Une session admin valide EST
// déjà un aller-retour `/auth/me` fait par `proxy.ts` sur la requête courante,
// et son résultat est transmis par les headers `x-jobsinc-user-id` /
// `x-jobsinc-user-role` puis relu par `getVerifiedUser()`
// (`lib/session-server.ts`). Ce helper faisait donc une seconde requête
// identique, pour un résultat que personne ne consommait.
export async function getAdminOverview() {
  const dashboardEndpoint = process.env.NEXT_PUBLIC_ADMIN_DASHBOARD_ENDPOINT;
  if (!dashboardEndpoint) return null;
  return apiRequest<AdminOverviewData>(dashboardEndpoint);
}

function getList<T>(response: T[] | { data?: T[]; results?: T[]; users?: T[] } | null) {
  if (Array.isArray(response)) return response;
  return response?.data || response?.results || response?.users || [];
}

export async function getAdminUsers() {
  const endpoint = process.env.NEXT_PUBLIC_ADMIN_USERS_ENDPOINT;
  if (!endpoint) return null;
  const response = await apiRequest<AdminUserRecord[] | { data?: AdminUserRecord[]; results?: AdminUserRecord[]; users?: AdminUserRecord[] }>(endpoint);
  return getList(response);
}

export async function getAdminUser(id: string) {
  const template = process.env.NEXT_PUBLIC_ADMIN_USER_ENDPOINT;
  if (!template) return null;
  const endpoint = template.includes('[id]') ? template.replace('[id]', encodeURIComponent(id)) : `${template.replace(/\/$/, '')}/${encodeURIComponent(id)}`;
  return apiRequest<AdminUserRecord>(endpoint);
}

/**
 * Endpoints des ressources Admin, résolus par accès LITTÉRAL à `process.env`.
 *
 * POURQUOI CE TABLEAU EST ÉCRIT À LA MAIN — NE PAS LE REMPLACER PAR UNE
 * RECHERCHE DYNAMIQUE.
 *
 * Next.js remplace `process.env.NEXT_PUBLIC_X` au build par une valeur
 * littérale, mais UNIQUEMENT quand l'accès est un membre littéral. La doc
 * officielle le dit explicitement (node_modules/next/dist/docs/01-app/02-guides/
 * environment-variables.md, « Note that dynamic lookups will *not* be inlined ») :
 *
 *     const varName = 'NEXT_PUBLIC_ANALYTICS_ID'
 *     setupAnalyticsService(process.env[varName])   // ← NON inliné
 *
 * Or `getAdminResource` est appelé depuis un composant `'use client'`. Avec
 * `process.env[\`NEXT_PUBLIC_ADMIN_${key}_ENDPOINT\`]`, la clé n'est jamais
 * connue du build : dans le bundle client `process.env` n'est pas un objet
 * peuplé, `endpoint` vaut `undefined`, la fonction renvoie `null`, et TOUTES
 * les tables `/admin/<section>` s'affichent vides — sans erreur, sans log.
 * Même défaut sur le bouton « Exporter », dont le `disabled` restait toujours
 * vrai. C'était un bug de production, pas une question de style.
 *
 * Donc : une entrée littérale par section du catalogue
 * `lib/admin-resources.ts`. Ajouter une section = ajouter une ligne ici ET
 * dans `.env.example`. `tests/adminEndpoints.test.ts` verrouille la
 * synchronisation entre les deux.
 */
const ADMIN_RESOURCE_ENDPOINTS: Record<string, string | undefined> = {
  candidates: process.env.NEXT_PUBLIC_ADMIN_CANDIDATES_ENDPOINT,
  employees: process.env.NEXT_PUBLIC_ADMIN_EMPLOYEES_ENDPOINT,
  companies: process.env.NEXT_PUBLIC_ADMIN_COMPANIES_ENDPOINT,
  administrators: process.env.NEXT_PUBLIC_ADMIN_ADMINISTRATORS_ENDPOINT,
  jobs: process.env.NEXT_PUBLIC_ADMIN_JOBS_ENDPOINT,
  applications: process.env.NEXT_PUBLIC_ADMIN_APPLICATIONS_ENDPOINT,
  interviews: process.env.NEXT_PUBLIC_ADMIN_INTERVIEWS_ENDPOINT,
  recruitments: process.env.NEXT_PUBLIC_ADMIN_RECRUITMENTS_ENDPOINT,
  reports: process.env.NEXT_PUBLIC_ADMIN_REPORTS_ENDPOINT,
  moderation: process.env.NEXT_PUBLIC_ADMIN_MODERATION_ENDPOINT,
  analytics: process.env.NEXT_PUBLIC_ADMIN_ANALYTICS_ENDPOINT,
  activity: process.env.NEXT_PUBLIC_ADMIN_ACTIVITY_ENDPOINT,
  sessions: process.env.NEXT_PUBLIC_ADMIN_SESSIONS_ENDPOINT,
  notifications: process.env.NEXT_PUBLIC_ADMIN_NOTIFICATIONS_ENDPOINT,
  system: process.env.NEXT_PUBLIC_ADMIN_SYSTEM_ENDPOINT,
  maintenance: process.env.NEXT_PUBLIC_ADMIN_MAINTENANCE_ENDPOINT,
  trends: process.env.NEXT_PUBLIC_ADMIN_TRENDS_ENDPOINT,
  reportsAnalytics: process.env.NEXT_PUBLIC_ADMIN_REPORTSANALYTICS_ENDPOINT,
  audit: process.env.NEXT_PUBLIC_ADMIN_AUDIT_ENDPOINT,
  logins: process.env.NEXT_PUBLIC_ADMIN_LOGINS_ENDPOINT,
  securityAlerts: process.env.NEXT_PUBLIC_ADMIN_SECURITYALERTS_ENDPOINT,
  content: process.env.NEXT_PUBLIC_ADMIN_CONTENT_ENDPOINT,
};

/**
 * L'endpoint Admin d'une section, ou `undefined` si la section n'a pas encore
 * d'endpoint configuré (l'UI affiche alors son état « non configuré » au lieu
 * d'un tableau vide sans explication).
 */
export function getAdminResourceEndpoint(section: string): string | undefined {
  return ADMIN_RESOURCE_ENDPOINTS[section];
}

export async function getAdminResource(section: string) {
  const endpoint = ADMIN_RESOURCE_ENDPOINTS[section];
  if (!endpoint) return null;
  const response = await apiRequest<unknown[] | { data?: unknown[]; results?: unknown[] }>(endpoint);
  if (Array.isArray(response)) return response;
  return response.data || response.results || [];
}

export function isAdminUser(user?: AdminUser | null) {
  // Source de vérité partagée avec proxy.ts : le client et le garde serveur
  // ne peuvent plus diverger sur la liste des rôles admin.
  return hasAdminRole(user);
}

export function getAdminUserLabel(user?: AdminUser | null) {
  if (!user) return 'Administrateur';
  return user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Administrateur';
}
