import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ListaSalvati from "@/components/ListaSalvati";
import Comparsa from "@/components/Comparsa";
import { ArrowRight01Icon, Bookmark01Icon } from "hugeicons-react";

export const metadata: Metadata = {
  title: "I tuoi salvati - Stato della Repubblica",
  description: "Le norme che hai salvato su questo dispositivo. Solo in locale, senza account.",
};

export default function SalvatiPage() {
  return (
    <>
      <Header />
      <main
        id="contenuto"
        className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        <nav aria-label="Percorso" className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
          <ol className="flex items-center gap-2">
            <li>
              <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              Salvati
            </li>
          </ol>
        </nav>
        <Comparsa>
          <header className="mt-4">
            <p className="text-sm font-bold text-accento dark:text-accento-chiara">Solo per te</p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
              <Bookmark01Icon
                size={32}
                aria-hidden="true"
                className="shrink-0 text-accento dark:text-accento-chiara"
              />
              Le leggi che hai salvato
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Qui ritrovi quello che hai tenuto da parte, solo su questo telefono o computer.
            </p>
            <p className="mt-4">
              <Link
                href="/leggi"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-accento px-6 font-semibold text-white hover:brightness-110 dark:bg-accento-chiara dark:text-notte"
              >
                Cerca tra le leggi
                <ArrowRight01Icon size={18} aria-hidden="true" />
              </Link>
            </p>
          </header>
        </Comparsa>
        <Comparsa delay={0.08}>
          <p className="mt-6 rounded-2xl border border-regola bg-carta-soft p-4 text-sm leading-relaxed text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft">
            Restano solo qui: nessun account, nessun nome, niente tracciamento.
          </p>
        </Comparsa>
        <ListaSalvati />
      </main>
      <Footer />
    </>
  );
}
