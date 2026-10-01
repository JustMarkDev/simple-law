import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MinisterCard from "@/components/MinisterCard";
import Comparsa from "@/components/Comparsa";
import { loadMinisters } from "@/components/seed-fallback";

export const metadata: Metadata = {
  title: "Ministri - Stato della Repubblica",
  description: "Chi guida i dicasteri, di quali materie si occupa e quali provvedimenti segue.",
};

export default async function MinistriPage() {
  const ministri = await loadMinisters();

  return (
    <>
      <Header />
      <main
        id="contenuto"
        className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        <header className="border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="text-sm font-bold text-accento dark:text-accento-chiara">Governo</p>
          <h1 className="mt-2 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Ministri e dicasteri
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Una scheda per ogni ministro: il dicastero, le competenze principali e i provvedimenti
            collegati nel feed.
          </p>
        </header>

        {ministri.length > 0 ? (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ministri.map((minister, index) => (
              <li key={minister.slug} className="flex">
                <Comparsa className="flex w-full" delay={Math.min(index * 0.04, 0.32)}>
                  <MinisterCard minister={minister} />
                </Comparsa>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-8 border border-dashed border-regola bg-carta p-6 text-sm text-inchiostro-soft dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia-soft">
            Nessun ministro disponibile al momento.
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}
