import { apiRequest } from '@/lib/api';

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
  return apiRequest<AdminAuthResponse>(adminLoginEndpoint, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyAdminSession() {
  const sessionEndpoint = process.env.NEXT_PUBLIC_ADMIN_SESSION_ENDPOINT || process.env.NEXT_PUBLIC_SESSION_ENDPOINT || '/auth/me';
  return apiRequest<{ user?: AdminUser }>(sessionEndpoint);
}

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

export async function getAdminResource(section: string) {
  const key = section.replace(/[^a-zA-Z]/g, '_').toUpperCase();
  const endpoint = process.env[`NEXT_PUBLIC_ADMIN_${key}_ENDPOINT`];
  if (!endpoint) return null;
  const response = await apiRequest<unknown[] | { data?: unknown[]; results?: unknown[] }>(endpoint);
  if (Array.isArray(response)) return response;
  return response.data || response.results || [];
}

export function isAdminUser(user?: AdminUser | null) {
  const role = user?.role?.trim().toUpperCase();
  if (!role) return false;
  const configuredRoles = process.env.NEXT_PUBLIC_ADMIN_ROLES?.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
  const allowedRoles = configuredRoles?.length ? configuredRoles : ['ADMIN', 'SUPER_ADMIN', 'SYSTEM_ADMIN'];
  return allowedRoles.includes(role);
}

export function getAdminUserLabel(user?: AdminUser | null) {
  if (!user) return 'Administrateur';
  return user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Administrateur';
}
