import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stato della Repubblica — le leggi spiegate semplici",
  description:
    "Dati politici italiani e schede delle norme: cosa cambia, per chi e se funziona già. Frasi brevi, fonti ufficiali e un semaforo di attuazione.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className="min-h-screen bg-carta font-sans text-inchiostro antialiased dark:bg-notte dark:text-nebbia">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
