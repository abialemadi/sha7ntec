import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sha7ntec — Logistics Financial Control',
  description:
    'Logistics financial-control middleware: sealed freight tenders, anomaly-scanned bids, and ERP payment posting.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light">
      <head>
        {/* Force light rendering — see spec §11 (phone dark-mode bug). */}
        <meta name="color-scheme" content="light only" />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
