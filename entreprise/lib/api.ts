export type MatchCriterion = { known?: boolean; score?: number | null; label?: string | null; matched?: string[]; missing?: string[] };
export type Match = { id?: string | number; applicationId?: string | number; jobId?: string | number; candidateName?: string; name?: string; jobTitle?: string; title?: string; score?: number; matchScore?: number; level?: string; levelLabel?: string; location?: string; avatar?: string | null; skills?: string[]; status?: string | null; contractType?: string | null; details?: Partial<Record<'skills' | 'experience' | 'education' | 'location' | 'contract' | 'availability' | 'other', MatchCriterion>> };
export type CompanyImage = { id: string; url: string; isPrimary?: boolean; sortOrder?: number };
export type Company = { id: string | number; name: string; sector?: string; location?: string; city?: string; country?: string; description?: string; images?: CompanyImage[]; logo?: string | null };
export type Job = { id: string | number; title: string; company?: string; location?: string; contractType?: string; publishedAt?: string };
export type DashboardData = { user?: { name?: string; firstName?: string; lastName?: string; email?: string; role?: string; avatar?: string | null }; company?: { name?: string; sector?: string; size?: string; country?: string; city?: string; address?: string; website?: string; foundedYear?: string | number; description?: string; photos?: string[]; image?: string | null; logo?: string | null }; stats?: Record<string, number | string | null>; actions?: Array<{ id?: string | number; type?: string; label?: string; count?: number; href?: string }>; activity?: Array<{ label?: string; value?: number; date?: string }>; applications?: Array<{ id?: string | number; candidateName?: string; name?: string; jobTitle?: string; title?: string; date?: string; status?: string; avatar?: string | null; cvUrl?: string | null; coverLetter?: string | null; matchScore?: number | null; matchLevelLabel?: string | null }>; jobs?: Array<{ id?: string | number; title?: string; location?: string; contractType?: string; applicationsCount?: number; status?: string; publishedAt?: string }>; notifications?: Array<{ id?: string | number; label?: string; read?: boolean }>; matching?: Match[]; interviews?: Array<{ id?: string | number; applicationId?: string | number; status?: string; mode?: string; scheduledAt?: string | null; duration?: number | null; meetUrl?: string | null; startedAt?: string | null; jobTitle?: string | null; candidateName?: string }> };
export type CompanyMessage = { id?: string | number; conversationId?: string | number; participantName?: string; senderName?: string; name?: string; subject?: string; preview?: string; content?: string; date?: string; createdAt?: string; unread?: boolean; read?: boolean; avatar?: string | null; candidateId?: string | null; candidateUserId?: string | null; unreadCount?: number; jobId?: string | null; jobTitle?: string | null; applicationId?: string | null; applicationStatus?: string | null };
export type ChatMessage = { id: string; senderId: string; content: string; isRead: boolean; isMine: boolean; createdAt: string };
export type ChatConversation = { id: string; participantName: string; avatar: string | null; subject: string; jobId?: string | null; jobTitle?: string | null; applicationId?: string | null; applicationStatus?: string | null; companyName?: string | null };
export type ChatResponse = { conversation: ChatConversation; messages: ChatMessage[]; hasMore?: boolean };
export type InterviewItem = { id?: string; applicationId?: string; status?: string; mode?: string; scheduledAt?: string | null; duration?: number | null; meetUrl?: string | null; streamingUrl?: string | null; startedAt?: string | null; finishedAt?: string | null; jobTitle?: string | null; companyName?: string | null; candidateName?: string; applicationStatus?: string };

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://jobsinc.onrender.com/api').replace(/\/$/, '');
const API_ORIGIN = new URL(API_URL).origin;
const endpoint = (path: string) => `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
export const assetUrl = (value?: string | null) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    try { const u = new URL(value); if (u.origin !== API_ORIGIN) return null; return u.toString(); } catch { return null; }
  }
  if (!value.startsWith('/uploads/')) return null;
  if (value.includes('..')) return null;
  try { return new URL(value, API_ORIGIN).toString(); } catch { return null; }
};
export const cvHref = (value?: string | null) => {
  if (!value || !value.startsWith('/uploads/cvs/') || value.includes('..')) return null;
  try { return new URL(value, API_ORIGIN).toString(); } catch { return null; }
};

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(endpoint('/auth/refresh'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        cache: 'no-store',
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => null);
      const newToken = data?.accessToken || data?.token || data?.accessToken;
      if (newToken) {
        // Synchronise le cookie HttpOnly frontend (proxy) avec le nouveau token backend
        await fetch('/api/auth/cookie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: newToken }),
          credentials: 'include',
          cache: 'no-store',
        }).catch(() => {});
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function apiRequest<T>(path: string, options?: RequestInit & { retries?: number }): Promise<T> {
  const retries = options?.retries ?? 0;
  const isAuthPath = path.includes('/auth/login') || path.includes('/auth/register') || path.includes('/auth/refresh');
  const doFetch = async (): Promise<Response> =>
    fetch(endpoint(path), { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers }, credentials: 'include', cache: 'no-store' });
  let lastError: unknown;
  let refreshed = false;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await doFetch();
      if (response.status === 401 && !isAuthPath && !refreshed) {
        const ok = await tryRefresh();
        if (ok) {
          refreshed = true;
          const retry = await doFetch();
          if (retry.ok) return retry.json();
          // Si toujours 401 après refresh, on laisse l'erreur remonter
        }
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const error = new Error(body?.message || body?.error || `Erreur serveur (${response.status})`) as Error & { status?: number };
        error.status = response.status;
        if ((response.status === 503 || response.status === 429) && attempt < retries) {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        throw error;
      }
      return response.json();
    } catch (e) {
      lastError = e;
      const status = (e as { status?: number })?.status;
      // 401 déjà géré via refresh, sinon on ne retry pas
      if (status === 401 && !refreshed && !isAuthPath) {
        const ok = await tryRefresh().catch(() => false);
        if (ok) {
          refreshed = true;
          continue;
        }
      }
      if (status !== 503 && status !== 429) throw e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

function list<T>(response: T[] | { data?: T[]; results?: T[] }) { return Array.isArray(response) ? response : response.data || response.results || []; }
function normalizeCompany(company: Company): Company { const logoUrl = assetUrl(company.logo); const images = (company.images || []).map((image) => ({ ...image, url: assetUrl(image.url) })).filter((image): image is CompanyImage => Boolean(image.url)); const primary = images.find((image) => image.isPrimary) || images[0]; return { ...company, images, logo: logoUrl || primary?.url || null, location: company.location || [company.city, company.country].filter(Boolean).join(', ') || undefined }; }
export const getDashboardData = (days?: number) => apiRequest<DashboardData>(`${process.env.NEXT_PUBLIC_DASHBOARD_ENDPOINT || '/company/dashboard'}${days ? `?days=${days}` : ''}`);
export async function getMatching(params?: Record<string, string | number | undefined>) { const base = process.env.NEXT_PUBLIC_MATCHING_ENDPOINT || '/company/matching'; const query = new URLSearchParams(); Object.entries(params || {}).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); }); const qs = query.toString(); return apiRequest<{ data?: Match[]; results?: Match[] } | Match[]>(qs ? `${base}?${qs}` : base); }
export async function getJobMatches(jobId: string | number, params?: Record<string, string | number | undefined>) { const query = new URLSearchParams(); Object.entries(params || {}).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); }); const qs = query.toString(); return apiRequest<{ data?: Match[]; results?: Match[] } | Match[]>(`/company/jobs/${jobId}/matches${qs ? `?${qs}` : ''}`); }
export async function getCompanyJobs() { return list(await apiRequest<any[] | { data?: any[]; results?: any[] }>(process.env.NEXT_PUBLIC_COMPANY_JOBS_ENDPOINT || '/company/jobs')).map((job: any) => ({ ...job, company: typeof job.company === 'object' && job.company !== null ? job.company.name : job.company })); }
export type CompanyProfile = Company & { website?: string; size?: string; address?: string; foundedYear?: string | number };
export const getCompanyProfile = () => apiRequest<CompanyProfile>('/company/profile');
export type CompanyProfileFields = Partial<Record<'name' | 'description' | 'website' | 'sector' | 'size' | 'country' | 'city' | 'address' | 'foundedYear', string | number | null>>;
export const updateCompanyProfile = (fields: CompanyProfileFields) => apiRequest<CompanyProfile>('/company/profile', { method: 'PUT', body: JSON.stringify(fields) });
export async function uploadCompanyLogo(file: File) {
  const response = await fetch(endpoint('/company/logo'), { method: 'POST', body: (() => { const form = new FormData(); form.append('logo', file); return form; })(), credentials: 'include', cache: 'no-store' });
  if (!response.ok) { const body = await response.json().catch(() => null); const error = new Error(body?.message || body?.error || `Erreur serveur (${response.status})`) as Error & { status?: number }; error.status = response.status; throw error; }
  return response.json() as Promise<CompanyProfile>;
}
export const deleteCompanyJob = (jobId: string | number) => apiRequest<{ message: string }>(`/company/jobs/${jobId}`, { method: 'DELETE' });
export const setJobOpen = (jobId: string | number, isOpen: boolean) => apiRequest<Record<string, unknown>>(`/company/jobs/${jobId}`, { method: 'PUT', body: JSON.stringify({ isOpen }) });
export async function getCompanyApplications() { return list(await apiRequest<NonNullable<DashboardData['applications']> | { data?: NonNullable<DashboardData['applications']>; results?: NonNullable<DashboardData['applications']> }>(process.env.NEXT_PUBLIC_COMPANY_APPLICATIONS_ENDPOINT || '/company/applications')); }
export async function getCompanyMessages() { const path = process.env.NEXT_PUBLIC_COMPANY_MESSAGES_ENDPOINT || '/company/messages'; return list(await apiRequest<CompanyMessage[] | { data?: CompanyMessage[]; results?: CompanyMessage[] }>(path)); }
export async function getConversationMessages(conversationId: string | number) { return apiRequest<ChatResponse>(`/company/messages/${conversationId}`); }
export async function sendMessage(candidateUserId: string, content: string, subject?: string) { return apiRequest<ChatMessage & { participantName?: string; conversationId?: string | number }>('/company/messages', { method: 'POST', body: JSON.stringify({ candidateUserId, content, subject }) }); }
export async function markConversationRead(conversationId: string | number) { return apiRequest<{ message: string }>(`/company/messages/${conversationId}/read`, { method: 'PATCH' }); }
// Ouvre (ou récupère) la conversation liée à une candidature autorisée (INTERVIEW / ACCEPTED).
export async function ensureConversation(applicationId: string | number) { return apiRequest<{ conversation: ChatConversation; created?: boolean }>(`/applications/${applicationId}/conversation`, { method: 'POST', body: JSON.stringify({}) }); }
// Cycle de vie des entretiens vidéo (statuts PLANIFIE / EN_COURS / TERMINE / ANNULE côté backend).
export const getCompanyInterviews = async () => {
  const response = await apiRequest<InterviewItem[] | { data?: InterviewItem[]; results?: InterviewItem[] }>('/interviews/company');
  return Array.isArray(response) ? response : response.data || response.results || [];
};
const interviewAction = (action: string, applicationId: string | number) => apiRequest<InterviewItem>(`/interviews/applications/${applicationId}/${action}`, { method: 'POST', body: JSON.stringify({}) });
export const startInterview = (applicationId: string | number) => interviewAction('start', applicationId);
export const finishInterview = (applicationId: string | number) => interviewAction('finish', applicationId);
export const cancelInterview = (applicationId: string | number) => interviewAction('cancel', applicationId);
// Lecture paginée + synchro incrémentale (before = historique, after = temps réel).
export async function getConversationPage(conversationId: string | number, params?: { limit?: number; before?: string; after?: string }) {
  const query = new URLSearchParams();
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.before) query.set('before', String(params.before));
  if (params?.after) query.set('after', String(params.after));
  const qs = query.toString();
  return apiRequest<ChatResponse>(`/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`);
}
export const isApiConfigured = () => Boolean(API_URL);
export async function getCompanies() { return list(await apiRequest<Company[] | { data?: Company[]; results?: Company[] }>(process.env.NEXT_PUBLIC_COMPANIES_ENDPOINT || '/companies')).map(normalizeCompany); }
export async function getJobs(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const raw = await apiRequest<any[] | { data?: any[]; results?: any[] }>(`${process.env.NEXT_PUBLIC_JOBS_ENDPOINT || '/jobs'}${suffix}`);
  // Support paginated {data, pagination} ou liste directe
  const items = Array.isArray(raw) ? raw : (raw as { data?: any[] }).data || (raw as { results?: any[] }).results || [];
  return list(items as any).map((job: any) => ({ ...job, company: typeof job.company === 'object' && job.company !== null ? job.company.name : job.company }));
}
export async function getJob(id: string | number) { const job = await apiRequest<any>(`/jobs/${id}`); return { ...job, company: typeof job.company === 'object' && job.company !== null ? job.company.name : job.company }; }
export async function getStats(): Promise<Record<string, number>> { const response = await apiRequest<Record<string, number> | { data?: Record<string, number> }>(process.env.NEXT_PUBLIC_STATS_ENDPOINT || '/stats'); return typeof response === 'object' && response !== null && 'data' in response && response.data ? response.data as Record<string, number> : response as Record<string, number>; }
export type OverviewCandidate = { initials: string; name: string; detail: string };
export type OverviewData = { talents: number; growth: number; activeJobs: number; applicationsToday: number; candidates: OverviewCandidate[]; activity: number[] };
export async function getOverviewStats(): Promise<OverviewData> { return apiRequest<OverviewData>('/stats/overview'); }
export async function authenticate(path: string, payload: Record<string, unknown>) { return apiRequest<{ token?: string; user?: unknown }>(path, { method: 'POST', body: JSON.stringify(payload) }); }
export async function authenticateWithFiles(path: string, fields: Record<string, string>, files: File[], fieldName = 'photos') { const formData = new FormData(); Object.entries(fields).forEach(([key, value]) => formData.append(key, value)); files.forEach((file) => formData.append(fieldName, file, file.name)); const response = await fetch(endpoint(path), { method: 'POST', body: formData, credentials: 'include', cache: 'no-store' }); if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message || body?.error || `Erreur serveur (${response.status})`); } return response.json() as Promise<{ token?: string; user?: unknown }>; }

// ── FAQ ──
export type FAQItem = { id: string; companyId?: string; question: string; answer?: string | null; isPublished?: boolean; createdAt?: string; company?: { name?: string } };
export async function getPublicFAQ(): Promise<FAQItem[]> { return list(await apiRequest<FAQItem[] | { data?: FAQItem[] }>('/faq/public')); }
export async function getCompanyFAQ(): Promise<FAQItem[]> { return list(await apiRequest<FAQItem[] | { data?: FAQItem[] }>('/company/faq')); }
export async function createCompanyFAQ(question: string): Promise<FAQItem> { return apiRequest<FAQItem>('/company/faq', { method: 'POST', body: JSON.stringify({ question }) }); }

// ── Feedback ──
export type FeedbackItem = { id: string; companyId?: string; author: string; role?: string | null; text: string; isPublished?: boolean; createdAt?: string; company?: { name?: string } };
export async function getPublicFeedback(): Promise<FeedbackItem[]> { return list(await apiRequest<FeedbackItem[] | { data?: FeedbackItem[] }>('/feedback/public')); }
export async function getCompanyFeedback(): Promise<FeedbackItem[]> { return list(await apiRequest<FeedbackItem[] | { data?: FeedbackItem[] }>('/company/feedback')); }
export async function createCompanyFeedback(author: string, role: string, text: string): Promise<FeedbackItem> { return apiRequest<FeedbackItem>('/company/feedback', { method: 'POST', body: JSON.stringify({ author, role, text }) }); }
