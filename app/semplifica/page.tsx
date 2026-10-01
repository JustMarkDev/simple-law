import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FormSemplifica from "@/components/FormSemplifica";
import { aiAttiva } from "@/lib/ai-provider";
import { TESTO_DL133 } from "@/lib/seed-data";

/** Legge la configurazione AI a ogni richiesta, non al momento della build. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Semplifica una legge",
  description:
    "Incolla il testo di una legge: in poche parole, chi riguarda, le cifre e se è una buona legge nel merito.",
};

export default function SemplificaPage() {
  const conAI = aiAttiva();

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 pt-10 sm:px-6 lg:px-8">
        <header className="max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-inchiostro dark:text-nebbia sm:text-4xl">
            Semplifica una legge
          </h1>
          <p className="mt-3 text-base leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Incolla il testo. L’AI ti dice cosa fa, chi tocca, quanto costa e se è una buona legge.
          </p>
          {!conAI && (
            <p className="mt-4 text-sm leading-relaxed text-inchiostro dark:text-nebbia">
              L’AI è spenta (SL_OPENCODE=off): vedrai riassunto e cifre del testo, ma non il
              giudizio nel merito.
            </p>
          )}
        </header>
        <div className="mt-8">
          <FormSemplifica esempio={TESTO_DL133} />
        </div>
      </main>
      <Footer />
    </>
  );
}
