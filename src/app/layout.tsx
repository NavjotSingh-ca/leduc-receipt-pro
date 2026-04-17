import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import SmoothScroll from '@/components/SmoothScroll';
import Providers from '@/components/Providers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Receipt Pro — CRA-Ready Receipt Scanner',
  description:
    'Enterprise-grade Canadian receipt capture with SHA-256 integrity, CRA compliance scoring, and structured audit exports.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Receipt Pro',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0c0c0c',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <SmoothScroll>
          <Providers>
            {children}
          </Providers>
        </SmoothScroll>
      </body>
    </html>
  );
}