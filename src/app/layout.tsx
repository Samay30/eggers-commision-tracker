import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Commission Tracker',
  description: 'Secure draw-against-commission tracker for recruitment teams.',
  manifest: '/manifest.webmanifest'
};

export const viewport: Viewport = {
  themeColor: '#84632a',
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
