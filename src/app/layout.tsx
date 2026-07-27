import type { Metadata } from 'next';
import { Inter, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

// Self-hosted via next/font (no render-blocking Google <link>, no layout
// shift). The CSS variables feed the Tailwind `font-sans` / `font-mono` tokens.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sha7ntec — Logistics Financial Control',
  description:
    'Logistics financial-control middleware: sealed freight tenders, anomaly-scanned bids, and ERP payment posting.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`light ${inter.variable} ${ibmPlexMono.variable}`}>
      <head>
        {/* Force light rendering — see spec §11 (phone dark-mode bug). */}
        <meta name="color-scheme" content="light only" />
      </head>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
