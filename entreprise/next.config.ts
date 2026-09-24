import type { NextConfig } from "next";

// Origine du backend — prod Render par défaut, local via .env ou dart-define
const API_ORIGIN = new URL(process.env.NEXT_PUBLIC_API_URL || 'https://jobsinc.onrender.com/api').origin;

const nextConfig: NextConfig = {
  async rewrites() {
    // Proxie les fichiers uploadés du backend vers le front (logos, couvertures, CV…).
    return [{ source: '/uploads/:path*', destination: `${API_ORIGIN}/uploads/:path*` }];
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '5000', pathname: '/uploads/**' },
      { protocol: 'https', hostname: 'jobsinc.onrender.com', pathname: '/uploads/**' },
      { protocol: 'https', hostname: 'jobsinc.com', pathname: '/uploads/**' },
      { protocol: 'https', hostname: '*.jobsinc.com', pathname: '/uploads/**' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://jobsinc.onrender.com/api',
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
