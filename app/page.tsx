import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight01Icon } from "hugeicons-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchBar from "@/components/SearchBar";
import LawCard from "@/components/LawCard";
import Comparsa from "@/components/Comparsa";
import { lawHref, normalizeLaw, tipoLabel, type Law } from "@/components/seed-fallback";
import { queryLaws } from "@/lib/db";
import { SEED_LAWS } from "@/lib/seed-data";
import { estraiNumeri } from "@/lib/analisi";

export const metadata: Metadata = {
  title: "Le leggi spiegate e giudicate",
  description:
    "Cerca una legge o incollane il testo: in poche parole, chi tocca, le cifre e se è una buona legge.",
};

const RECENTI = 6;

const DOMANDE = [
  {
    titolo: "In poche parole",
    testo: "Una riga sola per capire di cosa parla, senza gergo.",
  },
  {
    titolo: "Spiegata semplice",
    testo: "Cosa cambia in pratica, da quando e per quanto tempo.",
  },
  {
    titolo: "Chi tocca e quanto",
    testo: "I gruppi coinvolti, in parole, e le cifre chiave: euro, percentuali, durate.",
  },
];

function normalizzaSicura(record: Parameters<typeof normalizeLaw>[0]): Law | null {
  try {
    return normalizeLaw(record);
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const recenti = (await queryLaws({}, RECENTI).catch(() => []))
    .map(normalizzaSicura)
    .filter((law): law is Law => law !== null);

  const esempioRecord = SEED_LAWS.find(
    (l) => l.numero === "133" && l.tipo.includes("decreto.legge"),
  );
  const esempio = esempioRecord ? normalizzaSicura(esempioRecord) : null;
  const numeriEsempio = esempio ? estraiNumeri(esempio.semplificata.in10Secondi, 3) : [];

  return (
    <>
      <Header />
      <main id="contenuto">
        <section className="relative -mt-[76px] overflow-hidden pt-[76px]">
          <div aria-hidden="true" className="absolute inset-0">
            <Image
              src="https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3c/Palazzo_Montecitorio_2019_03.jpg/1920px-Palazzo_Montecitorio_2019_03.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-r from-notte/85 via-notte/70 to-notte/40" />
          </div>

          <div className="relative mx-auto grid w-full max-w-editoriale grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 md:min-h-[560px] lg:grid-cols-[1.15fr_1fr] lg:px-8 lg:py-20">
            <Comparsa>
              <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:leading-none text-white sm:text-5xl lg:text-[3.25rem]">
                Le leggi italiane, spiegate e giudicate.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/90">
                Cerca una legge o incollane il testo: cosa fa, chi tocca, quanto costa e se è una
                buona legge.
              </p>
              <div className="vetro vetro-foto mt-8 max-w-xl p-4 sm:p-5">
                <SearchBar
                  id="ricerca-home"
                  label="Cerca una legge"
                  action="/leggi"
                  placeholder="Esempio: carburanti, affitti, scuola"
                />
              </div>
              <p className="mt-5">
                <Link
                  href="/semplifica"
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-xl text-base font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white focus-visible:outline-white"
                >
                  Oppure incolla un testo
                  <ArrowRight01Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                </Link>
              </p>
            </Comparsa>

            {esempio && (
              <Comparsa delay={0.1}>
                <article className="vetro vetro-foto hidden p-6 lg:block">
                  <p className="text-xs font-medium text-inchiostro-soft dark:text-nebbia-soft">
                    {tipoLabel(esempio)}
                  </p>
                  <h2 className="mt-1 line-clamp-2 text-lg font-semibold leading-snug text-inchiostro dark:text-nebbia">
                    {esempio.titolo}
                  </h2>
                  <p className="mt-4 text-sm font-semibold text-inchiostro-soft dark:text-nebbia-soft">
                    In poche parole
                  </p>
                  <p className="mt-1 text-xl font-semibold leading-snug tracking-tight text-inchiostro dark:text-nebbia">
                    {esempio.semplificata.in10Secondi}
                  </p>
                  {numeriEsempio.length > 0 && (
                    <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-regola/70 pt-4 dark:border-notte-deep">
                      {numeriEsempio.map((n) => (
                        <div key={n.valore}>
                          <dt className="sr-only">{n.cosa}</dt>
                          <dd className="whitespace-nowrap font-mono text-base font-semibold text-accento dark:text-accento-chiara">
                            {n.valore}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <Link href={lawHref(esempio)} className="btn-primario mt-6">
                    Apri la scheda
                    <ArrowRight01Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  </Link>
                </article>
              </Comparsa>
            )}
          </div>
          <p className="absolute bottom-2 right-4 text-[11px] text-white/75">
            Foto:{" "}
            <a
              href="https://commons.wikimedia.org/wiki/File:Palazzo_Montecitorio_2019_03.jpg"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white"
            >
              Nicholas Gemini, CC BY-SA 4.0
            </a>
          </p>
        </section>

        <div className="mx-auto w-full max-w-editoriale space-y-20 px-4 py-16 sm:px-6 lg:px-8">
          <section aria-labelledby="ultime">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2
                id="ultime"
                className="text-2xl font-semibold tracking-tight text-inchiostro dark:text-nebbia sm:text-3xl"
              >
                Ultime leggi
              </h2>
              <Link
                href="/leggi"
                className="inline-flex min-h-[48px] items-center gap-1.5 text-sm font-semibold text-accento hover:underline dark:text-accento-chiara"
              >
                Tutte le leggi
                <ArrowRight01Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              </Link>
            </div>
            {recenti.length > 0 ? (
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recenti.map((law) => (
                  <li key={law.eli} className="flex">
                    <LawCard law={law} headingLevel="h3" />
                  </li>
                ))}
              </ul>
            ) : (
              <div role="status" className="vetro mt-6 max-w-xl p-6">
                <p className="text-sm text-inchiostro dark:text-nebbia">
                  Non riusciamo a caricare le leggi adesso. Riprova tra poco, oppure incolla un
                  testo in Semplifica.
                </p>
              </div>
            )}
          </section>

          <section aria-labelledby="domande">
            <h2
              id="domande"
              className="max-w-2xl text-2xl font-semibold tracking-tight text-inchiostro dark:text-nebbia sm:text-3xl"
            >
              Quattro domande per ogni legge
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-[1.1fr_1fr] md:grid-rows-3">
              <div className="vetro relative overflow-hidden p-7 md:row-span-3">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-linear-to-br from-accento/15 via-transparent to-transparent dark:from-accento-chiara/15"
                />
                <div className="relative flex h-full flex-col">
                  <h3 className="text-2xl font-semibold tracking-tight text-inchiostro dark:text-nebbia">
                    È una buona legge?
                  </h3>
                  <p className="mt-3 max-w-md text-base leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                    Un voto da 1 a 10 nel merito: risolve un problema vero, chi paga, se è una toppa
                    o una riforma. Poi, a parte, quanto è scritta bene.
                  </p>
                  <p
                    className="mt-auto flex items-baseline gap-1 pt-10 font-mono text-accento dark:text-accento-chiara"
                    aria-hidden="true"
                  >
                    <span className="text-7xl font-semibold leading-none tracking-tighter">6</span>
                    <span className="text-2xl">/10</span>
                  </p>
                  <p className="mt-2 text-sm text-inchiostro-soft dark:text-nebbia-soft">
                    Esempio di come appare il voto.
                  </p>
                </div>
              </div>
              {DOMANDE.map((d) => (
                <div key={d.titolo} className="vetro p-6">
                  <h3 className="text-lg font-semibold text-inchiostro dark:text-nebbia">
                    {d.titolo}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                    {d.testo}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
