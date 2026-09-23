import type { NextConfig } from "next";

// Origine du backend (uploads, avatars, CV…) servis par Express sur :5000.
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').origin;

const nextConfig: NextConfig = {
  async rewrites() {
    // Proxie les fichiers uploadés du backend vers le front (logos, couvertures, CV…).
    return [{ source: '/uploads/:path*', destination: `${API_ORIGIN}/uploads/:path*` }];
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
    NEXT_PUBLIC_SESSION_ENDPOINT: process.env.NEXT_PUBLIC_SESSION_ENDPOINT || '/auth/me',
    NEXT_PUBLIC_DASHBOARD_ENDPOINT: process.env.NEXT_PUBLIC_DASHBOARD_ENDPOINT || '/company/dashboard',
    NEXT_PUBLIC_COMPANY_JOBS_ENDPOINT: process.env.NEXT_PUBLIC_COMPANY_JOBS_ENDPOINT || '/company/jobs',
    NEXT_PUBLIC_COMPANY_APPLICATIONS_ENDPOINT: process.env.NEXT_PUBLIC_COMPANY_APPLICATIONS_ENDPOINT || '/company/applications',
    NEXT_PUBLIC_CREATE_JOB_ENDPOINT: process.env.NEXT_PUBLIC_CREATE_JOB_ENDPOINT || '/company/jobs',
    NEXT_PUBLIC_REGISTER_ENDPOINT: process.env.NEXT_PUBLIC_REGISTER_ENDPOINT || '/auth/register/company',
    NEXT_PUBLIC_LOGIN_ENDPOINT: process.env.NEXT_PUBLIC_LOGIN_ENDPOINT || '/auth/login/company',
  },
};

export default nextConfig;
