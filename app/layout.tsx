import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const caratterePrincipale = Geist({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-sans",
  display: "swap",
});

const carattereMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://simple-law.it"),
  title: {
    default: "Simple Law - le leggi spiegate semplici",
    template: "%s - Simple Law",
  },
  description:
    "Le leggi italiane spiegate con l’AI: in poche parole, chi riguardano, le cifre e se sono buone leggi nel merito. Con i testi ufficiali.",
  keywords: ["leggi italiane", "norme spiegate", "gazzetta ufficiale", "attuazione leggi"],
  authors: [{ name: "Simple Law" }],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "it_IT",
    siteName: "Simple Law",
    title: "Simple Law - le leggi spiegate semplici",
    description:
      "In poche parole, chi riguarda, le cifre e se è una buona legge: le norme italiane spiegate con l’AI.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Simple Law - le leggi spiegate semplici",
    description:
      "In poche parole, chi riguarda, le cifre e se è una buona legge: le norme italiane spiegate con l’AI.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e14" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body
        className={`${caratterePrincipale.variable} ${carattereMono.variable} min-h-[100dvh] font-sans text-inchiostro antialiased dark:text-nebbia`}
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
