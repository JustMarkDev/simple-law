import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { ArrowLeft01Icon } from "hugeicons-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FontiList from "@/components/FontiList";
import CondividiStampa from "@/components/CondividiStamp";
import PulsantePreferito from "@/components/PulsantePreferito";
import SchedaAnalisi from "@/components/SchedaAnalisi";
import AnalisiInCorso from "@/components/AnalisiInCorso";
import {
  formatDate,
  formatTipo,
  tipoLabel,
  vigenzaParole,
  type Law,
} from "@/components/seed-fallback";
import { loadLawByEli } from "@/lib/load-laws";
import { analisiEuristica, analizza, type Analisi, type AnalisiInput } from "@/lib/analisi";
import { aiAttiva } from "@/lib/ai-provider";

interface LeggeProps {
  params: Promise<{ eli: string[] }>;
}

const AIR_PAROLE: Record<string, string> = {
  presente: "Fatto",
  semplificata: "Semplificato",
  esente: "Non richiesto",
  assente: "Mancante",
};

const CHI_PAROLE: Record<string, string> = {
  guida: "Chi guida",
  lavoro: "Chi lavora",
  impresa: "Chi ha un’impresa",
  studio: "Chi studia",
};

const DOMINI_AMMESSI_JSONLD: readonly string[] = [
  "normattiva.it",
  "gazzettaufficiale.it",
  "governo.it",
  "camera.it",
  "senato.it",
];

/** Stesse regole di `FontiList`: solo https verso domini ufficiali. Mai throw. */
function stessiAmmessi(fonti: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const valore of Object.values(fonti ?? {})) {
    if (typeof valore !== "string" || valore.length > 2000) continue;
    try {
      const parsed = new URL(valore.trim());
      if (parsed.protocol !== "https:") continue;
      if (
        DOMINI_AMMESSI_JSONLD.some(
          (d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`),
        )
      ) {
        out.push(valore.trim());
      }
    } catch {
      continue;
    }
  }
  return out.slice(0, 5);
}

function attuativiParole(law: Law): string {
  const { adottati, daAdottare, scaduti } = law.attuativi;
  const mancanti = daAdottare + scaduti;
  if (adottati + mancanti === 0) return "Nessuno previsto";
  return `${adottati} fatti, ${mancanti} mancanti`;
}

function fattiIter(law: Law): { etichetta: string; valore: string }[] {
  return [
    { etichetta: "Studio d’impatto", valore: AIR_PAROLE[law.air] ?? law.air },
    { etichetta: "Voto di fiducia", valore: law.fiducia ? "Sì" : "No" },
    { etichetta: "Tanti temi insieme", valore: law.omnibus ? "Sì" : "No" },
    { etichetta: "Decreti attuativi", valore: attuativiParole(law) },
  ];
}

function inputAnalisi(law: Law): AnalisiInput {
  return {
    titolo: law.titolo,
    testo: law.testo || `${law.titolo.replace(/\.+$/, "")}. ${law.sintesi}`,
    contesto: [
      `Atto: ${tipoLabel(law)}, del ${formatDate(law.dataEmanazione)}`,
      `Stato: ${vigenzaParole(law)}`,
      ...fattiIter(law).map((f) => `${f.etichetta}: ${f.valore}`),
    ],
    inBreve: law.semplificata.in10Secondi,
    chi: law.persone.map((p) => CHI_PAROLE[p] ?? p),
    pro: law.semplificata.proContro.pro,
    contro: law.semplificata.proContro.contro,
    gulpease: law.gulpease,
  };
}

/**
 * Risposta AI memorizzata per 30 giorni per legge. Il ripiego senza AI lancia
 * apposta, cosi non finisce in cache e al prossimo giro si riprova.
 */
const analisiMemorizzata = unstable_cache(
  async (_eli: string, input: AnalisiInput): Promise<Analisi> => {
    const analisi = await analizza(input);
    if (!analisi.conAI) throw new Error("AI non disponibile");
    return analisi;
  },
  ["analisi-legge-v1"],
  { revalidate: 60 * 60 * 24 * 30 },
);

async function AnalisiLegge({ law }: { law: Law }) {
  const input = inputAnalisi(law);
  let analisi: Analisi;
  if (!aiAttiva()) {
    analisi = analisiEuristica(input);
  } else {
    try {
      analisi = await analisiMemorizzata(law.eli, input);
    } catch {
      analisi = analisiEuristica(input);
    }
  }
  return <SchedaAnalisi analisi={analisi} fatti={fattiIter(law)} />;
}

export async function generateMetadata({ params }: LeggeProps): Promise<Metadata> {
  const { eli } = await params;
  const law = await loadLawByEli(eli.join("/"));
  if (!law) return { title: "Norma non trovata" };
  const titolo = `${law.titolo} - ${tipoLabel(law)}`;
  return {
    title: titolo,
    description: law.sintesi,
    openGraph: { title: titolo, description: law.sintesi, type: "article" },
  };
}

export default async function LeggePage({ params }: LeggeProps) {
  const { eli } = await params;
  if (eli.length > 10 || eli.join("/").length > 500) notFound();
  const law = await loadLawByEli(eli.join("/"));
  if (!law) notFound();

  const vigenza = vigenzaParole(law);
  const pulisci = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const mostraSintesi = Boolean(law.sintesi) && pulisci(law.sintesi) !== pulisci(law.titolo);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Legislation",
    name: law.titolo,
    legislationIdentifier: law.nir || law.eli,
    datePublished: law.dataEmanazione,
    inForceStatus: vigenza,
    abstract: law.sintesi,
    legislationType: formatTipo(law.tipo),
    sameAs: stessiAmmessi(law.fonti as unknown as Record<string, unknown>),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 pt-6 sm:px-6 lg:px-8">
        <Link
          href="/leggi"
          className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl text-sm font-medium text-inchiostro-soft hover:text-accento dark:text-nebbia-soft dark:hover:text-accento-chiara"
        >
          <ArrowLeft01Icon size={16} strokeWidth={1.8} aria-hidden="true" />
          Tutte le leggi
        </Link>

        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge">{tipoLabel(law)}</span>
            <span className="badge">{vigenza}</span>
            {law.dimostrativo && <span className="badge">Scheda di prova, dati inventati</span>}
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight sm:leading-10 tracking-tight text-inchiostro dark:text-nebbia sm:text-4xl">
            {law.titolo}
          </h1>
          {mostraSintesi && (
            <p className="mt-4 max-w-[65ch] text-lg leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              {law.sintesi}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
              <time dateTime={law.dataEmanazione}>{formatDate(law.dataEmanazione)}</time>
            </p>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <CondividiStampa titolo={law.titolo} />
              <PulsantePreferito eli={law.eli} />
            </div>
          </div>
        </header>

        <div className="mt-8">
          <Suspense fallback={<AnalisiInCorso />}>
            <AnalisiLegge law={law} />
          </Suspense>
        </div>

        <section aria-labelledby="fonti-ufficiali" className="mt-12">
          <h2
            id="fonti-ufficiali"
            className="text-xl font-semibold text-inchiostro dark:text-nebbia"
          >
            Fonti ufficiali
          </h2>
          <p className="mt-1 text-sm text-inchiostro-soft dark:text-nebbia-soft">
            Il testo che conta è questo. Si apre in una nuova pagina.
          </p>
          <FontiList fonti={law.fonti} modalita="block" className="mt-4" />
        </section>
      </main>
      <Footer />
    </>
  );
}
