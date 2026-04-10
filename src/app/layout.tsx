import type { Metadata, Viewport } from 'next';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Leduc Receipt Pro',
  description: 'Audit-ready receipt scanner for Canadian businesses',
  manifest: '/manifest.json',
  icons: {
    apple: '/apple-touch-icon.png',
    icon: '/favicon-96x96.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}