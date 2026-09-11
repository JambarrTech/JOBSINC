import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };
export const metadata: Metadata = { title: 'JOBSINC — Recruter avec confiance', description: 'La plateforme de recrutement pensée pour les entreprises.', icons: { icon: '/favicon.ico' } };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
