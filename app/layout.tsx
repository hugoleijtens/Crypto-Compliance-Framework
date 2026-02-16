import type { Metadata } from 'next';
import Link from 'next/link';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { absoluteUrl, SITE_NAME, SITE_URL } from '../lib/site';
import './globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans'
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono'
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_NAME,
  description:
    'A vendor-neutral, scope-bounded crypto compliance framework knowledge site for regulated banking environments in the EU/UK.',
  alternates: {
    canonical: '/'
  },
  openGraph: {
    type: 'website',
    title: SITE_NAME,
    description:
      'Deterministic, auditable crypto compliance framework content for regulated banking environments in the EU/UK.',
    url: absoluteUrl('/'),
    siteName: SITE_NAME
  },
  twitter: {
    card: 'summary',
    title: SITE_NAME,
    description:
      'Deterministic, auditable crypto compliance framework content for regulated banking environments in the EU/UK.'
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <header className="flex flex-col gap-4 border-b border-line pb-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <Link href="/" className="no-underline">
                <div className="font-mono text-xs text-ink-subtle">Crypto Compliance Framework</div>
                <div className="text-2xl font-semibold tracking-tight">Handbook</div>
              </Link>
              <nav className="flex flex-wrap gap-4 text-sm">
                <Link href="/">Home</Link>
                <Link href="/governance">Governance</Link>
                <Link href="/machine-interface">Machine interface</Link>
              </nav>
            </div>
            <p className="max-w-3xl text-sm text-ink-subtle">
              Canonical entries are intentionally scope-bounded. This site is not legal advice and does not assert
              regulatory compliance.
            </p>
          </header>
          <main className="py-8">{children}</main>
          <footer className="border-t border-line pt-6 text-xs text-ink-subtle">
            <p>
              Governance: automated agents may draft and propose changes. Publishing requires a human-reviewed pull
              request and explicit <span className="font-mono">status: published</span>.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
