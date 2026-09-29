import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Nunito } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';

const caratterePrincipale = Nunito({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL('https://simple-law.it'),
  title: {
    default: 'Simple Law - le leggi spiegate semplici',
    template: '%s - Simple Law',
  },
  description:
    'Dati politici italiani e schede delle norme: cosa cambia, per chi e se funziona già. Frasi brevi, fonti ufficiali e un semaforo di attuazione.',
  keywords: ['leggi italiane', 'norme spiegate', 'gazzetta ufficiale', 'attuazione leggi'],
  authors: [{ name: 'Simple Law' }],
  icons: { icon: '/favicon.svg' },
  openGraph: {
    type: 'website',
    locale: 'it_IT',
    siteName: 'Simple Law',
    title: 'Simple Law - le leggi spiegate semplici',
    description:
      'Cosa cambia, per chi e se funziona già: schede brevi delle norme italiane con fonti ufficiali.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Simple Law - le leggi spiegate semplici',
    description:
      'Cosa cambia, per chi e se funziona già: schede brevi delle norme italiane con fonti ufficiali.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f3' },
    { media: '(prefers-color-scheme: dark)', color: '#121110' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body
        className={`${caratterePrincipale.variable} min-h-screen bg-carta font-sans text-inchiostro antialiased dark:bg-notte dark:text-nebbia`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <a href="#contenuto" className="salta-contenuto">
            Vai al contenuto principale
          </a>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
