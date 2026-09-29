import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertCircleIcon, ArrowRight01Icon, BookOpen01Icon } from 'hugeicons-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SearchBar from '@/components/SearchBar';
import PersonaFilter from '@/components/PersonaFilter';
import LawCard from '@/components/LawCard';
import MinisterCard from '@/components/MinisterCard';
import Comparsa from '@/components/Comparsa';
import Contatore from '@/components/Contatore';
import CorpusBadge from '@/components/CorpusBadge';
import {
  loadMinisters,
  normalizeLaw,
  personaRelevant,
  STATO_META,
  type Law,
} from '@/components/seed-fallback';
import { coloreSemaforoRecord, personaRilevanteRecord } from '@/lib/filtri-leggi';
import { countLaws, queryLaws } from '@/lib/db';
import { getCorpusInfo } from '@/lib/sources';
import type { LawRecordExtra } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Le leggi spiegate semplici',
  description:
    'Capisci cosa cambia, per chi vale e se funziona già. Schede semplici con fonti ufficiali.',
};

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PASSI = [
  {
    titolo: 'Leggi in 10 secondi',
    testo: 'Ogni norma ha una frase semplice. Capisci subito di cosa si tratta.',
  },
  {
    titolo: 'Solo ciò che ti serve',
    testo: 'Scegli chi sei, Guida, Lavoro, Impresa o Studio, e leggi la tua parte.',
  },
  {
    titolo: 'A che punto è',
    testo: 'Vedi subito se la norma vale già o se mancano ancora dei passi.',
  },
];

/** La home non renderizza mai più di 12 schede: 1 in evidenza + 11 recenti. */
const MAX_CARD_HOME = 12;
/** Estratto bounded per i conteggi home (stato + filtro persona): 10000 record max. */
const ESTRATTO_HOME_MAX = 10000;

/** Mirror di `featured` in `normalizeLaw`: DL 133/2026 in evidenza. */
function isFeaturedRecord(record: Pick<LawRecordExtra, 'numero' | 'tipo'>): boolean {
  return record.numero === '133' && (record.tipo ?? '').includes('decreto.legge');
}

function normalizzaSicura(record: LawRecordExtra): Law | null {
  try {
    return normalizeLaw(record);
  } catch {
    return null;
  }
}

/** Firma attesa da `getCorpusInfo` esteso (giudice): mai rompere i 3 campi base. */
interface InfoCorpusGiudice {
  base: number;
  espansi: number;
  totale: number;
  reali?: number;
  ufficiali?: number;
  dimostrative?: number;
}

/** Composizione onesta per il badge: solo `getCorpusInfo`, mai throw, null se 0. */
function leggiComposizione(): { totale: number; ufficiali: number; dimostrative: number } | null {
  try {
    const info = getCorpusInfo() as InfoCorpusGiudice;
    const totale =
      typeof info?.totale === 'number' && Number.isFinite(info.totale)
        ? Math.floor(info.totale)
        : 0;
    if (totale <= 0) return null;
    const grezzi = info?.ufficiali ?? info?.reali ?? 0;
    const ufficiali =
      typeof grezzi === 'number' && Number.isFinite(grezzi)
        ? Math.min(totale, Math.max(0, Math.floor(grezzi)))
        : 0;
    const dimGrezzi = info?.dimostrative ?? 0;
    const dimostrative =
      typeof dimGrezzi === 'number' && Number.isFinite(dimGrezzi)
        ? Math.min(totale, Math.max(0, Math.floor(dimGrezzi)))
        : 0;
    return { totale, ufficiali, dimostrative };
  } catch {
    return null;
  }
}

export default async function HomePage({ searchParams }: HomeProps) {
  const sp = await searchParams;
  const qGrezza = typeof sp.q === 'string' ? sp.q : '';
  const q = qGrezza.slice(0, 200).trim();
  const persona = typeof sp.persona === 'string' && sp.persona ? sp.persona : 'tutti';

  // La ricerca testuale vive in archivio (`/leggi`), dove è paginata lato
  // server: la home con `?q` rimanda lì invece di scansionare il corpus.
  if (q) {
    const params = new URLSearchParams({ q });
    if (persona !== 'tutti') params.set('persona', persona);
    redirect(`/leggi?${params.toString()}`);
  }

  // Totale reale via conteggio DB (mai scansioni triple in memoria) +
  // estratto bounded data_desc per conteggi stato/persona e vetrina 12.
  const [totaleConteggiato, estratto, ministri] = await Promise.all([
    countLaws().catch(() => 0),
    queryLaws({}, ESTRATTO_HOME_MAX).catch(() => [] as LawRecordExtra[]),
    loadMinisters().catch(() => []),
  ]);
  const totaleReale = totaleConteggiato > 0 ? totaleConteggiato : estratto.length;
  const troncato = totaleReale > estratto.length;

  // Un'unica passata sull'estratto: conteggi stato, totale filtrati per
  // persona e candidati per la vetrina (mai più di 12 schede renderizzate).
  let verde = 0;
  let giallo = 0;
  let rosso = 0;
  let totaleFiltrati = 0;
  let featuredRaw: LawRecordExtra | null = null;
  const recentiRaw: LawRecordExtra[] = [];
  const personaRaw: LawRecordExtra[] = [];
  for (const record of estratto) {
    const colore = coloreSemaforoRecord(record);
    if (colore === 'verde') verde += 1;
    else if (colore === 'giallo') giallo += 1;
    else rosso += 1;
    if (personaRilevanteRecord(record, persona)) {
      totaleFiltrati += 1;
      if (persona !== 'tutti' && personaRaw.length < MAX_CARD_HOME) personaRaw.push(record);
    }
    if (!featuredRaw && isFeaturedRecord(record)) {
      featuredRaw = record;
      continue;
    }
    if (persona === 'tutti' && recentiRaw.length < MAX_CARD_HOME) recentiRaw.push(record);
  }

  const conteggio = { verde, giallo, rosso };
  const composizione = leggiComposizione();

  const mostraFeatured = !q && persona === 'tutti';
  const featured = mostraFeatured && featuredRaw ? normalizzaSicura(featuredRaw) : null;
  const vetrinaRaw =
    persona === 'tutti'
      ? (featuredRaw
          ? [featuredRaw, ...recentiRaw.filter((r) => r.eli !== featuredRaw?.eli)]
          : recentiRaw
        ).slice(0, MAX_CARD_HOME)
      : personaRaw.slice(0, MAX_CARD_HOME);
  const vetrina = vetrinaRaw
    .map(normalizzaSicura)
    .filter((law): law is Law => law !== null)
    .filter((law) => personaRelevant(law, persona));
  const resto = featured
    ? vetrina.filter((law) => law.eli !== featured.eli).slice(0, MAX_CARD_HOME - 1)
    : vetrina;
  const mostrate = (featured ? 1 : 0) + resto.length;
  const totaleVista = persona === 'tutti' ? totaleReale : totaleFiltrati;
  const archivioHref =
    persona === 'tutti' ? '/leggi' : `/leggi?persona=${encodeURIComponent(persona)}`;

  return (
    <>
      <Header />
      <main id="contenuto" className="scroll-mt-24">
        <section className="relative overflow-hidden bg-notte">
          <div aria-hidden="true" className="absolute inset-0">
            <Image
              src="https://thumb.wikimedia.org/wikipedia/commons/thumb/3/3c/Palazzo_Montecitorio_2019_03.jpg/1920px-Palazzo_Montecitorio_2019_03.jpg"
              alt="Palazzo Montecitorio a Roma, sede della Camera dei deputati"
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </div>
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-inchiostro/70 dark:bg-notte/75"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-accento/10" />
          <div className="relative mx-auto w-full max-w-editoriale px-4 py-12 sm:px-6 sm:py-14 lg:px-8 md:flex md:min-h-[480px] md:items-center">
            <div className="w-full max-w-2xl space-y-6 py-4">
              <Comparsa>
                <div>
                  <p className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-xs font-bold text-white">
                    <BookOpen01Icon size={16} strokeWidth={2} aria-hidden="true" />
                    Una guida semplice alle leggi
                  </p>
                  <h1 className="mt-4 max-w-2xl text-4xl font-extrabold leading-[1.08] text-white sm:text-5xl">
                    Le leggi italiane,
                    <br />
                    spiegate con calma.
                  </h1>
                  <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/85">
                    Capisci cosa cambia, per chi vale e se funziona già. Tutto semplice.
                  </p>
                </div>
              </Comparsa>

              <Comparsa delay={0.08}>
                <div className="vetro max-w-2xl rounded-2xl p-4 sm:p-5">
                  <SearchBar
                    id="ricerca-home"
                    label="Cerca"
                    defaultValue={q}
                    action="/leggi"
                    placeholder="Scrivi una parola: lavoro, casa, scuola…"
                  />
                  <p className="mt-2 text-sm text-inchiostro-soft dark:text-nebbia-soft">
                    Scrivi almeno 2 lettere. Esempi: lavoro, casa, scuola.
                  </p>
                </div>
              </Comparsa>

              {totaleReale <= 0 && (
                <div
                  role="alert"
                  className="superficie flex max-w-2xl flex-wrap items-center gap-3 px-5 py-4"
                >
                  <AlertCircleIcon
                    size={22}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="shrink-0 text-accento dark:text-accento-chiara"
                  />
                  <p className="text-sm leading-relaxed text-inchiostro dark:text-nebbia">
                    Non riusciamo a mostrare le norme. Riprova tra poco.
                  </p>
                  <Link href="/" className="btn-secondario">
                    Torna all’inizio
                  </Link>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <Link href={archivioHref} className="btn-primario whitespace-nowrap">
                  Vedi tutte le norme
                  <ArrowRight01Icon size={18} strokeWidth={2} aria-hidden="true" />
                </Link>
                <Link
                  href="/metodologia"
                  className="inline-flex min-h-[48px] items-center whitespace-nowrap text-sm font-bold text-white underline underline-offset-4 transition-colors hover:text-white/80 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Come sono fatte le schede
                </Link>
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="vetro inline-flex min-h-[48px] items-center gap-2 rounded-xl px-3 py-2">
                  <span className="text-xs font-bold text-inchiostro dark:text-nebbia">
                    Norme qui
                  </span>
                  <span className="text-xl font-extrabold text-inchiostro dark:text-nebbia">
                    <Contatore value={totaleReale} />
                  </span>
                </div>
                {(['verde', 'giallo', 'rosso'] as const).map((stato) => (
                  <Link
                    key={stato}
                    href={`/leggi?stato=${stato}`}
                    aria-label={
                      stato === 'rosso'
                        ? `Vedi le norme non più in vigore: ${conteggio[stato]}`
                        : `Vedi le norme: ${STATO_META[stato].label}, ${conteggio[stato]}`
                    }
                    className="vetro inline-flex min-h-[48px] items-center gap-2 rounded-xl px-3 py-2 transition-colors hover:border-accento focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-accento dark:hover:border-accento-chiara dark:focus-visible:outline-accento-chiara"
                  >
                    <span
                      className={`flex items-center gap-1.5 text-xs font-bold ${STATO_META[stato].text}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${STATO_META[stato].dot}`}
                      />
                      {stato === 'rosso' ? 'Non più in vigore' : STATO_META[stato].parole}
                    </span>
                    <span className="text-xl font-extrabold text-inchiostro dark:text-nebbia">
                      <Contatore value={conteggio[stato]} />
                    </span>
                  </Link>
                ))}
              </div>
              {troncato && (
                <p className="text-xs text-white/80">
                  Guardiamo le {estratto.length} norme più recenti su {totaleReale} totali.
                </p>
              )}
              {composizione && (
                <div className="max-w-2xl">
                  <CorpusBadge
                    totale={composizione.totale}
                    dimostrative={composizione.dimostrative}
                    ufficiali={composizione.ufficiali}
                  />
                </div>
              )}
            </div>
          </div>
          <p className="absolute bottom-2 right-4 text-[11px] leading-relaxed text-white/70">
            Foto:{' '}
            <a
              href="https://commons.wikimedia.org/wiki/File:Palazzo_Montecitorio_2019_03.jpg"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Nicholas Gemini, CC BY-SA 4.0, via Wikimedia Commons
            </a>
          </p>
        </section>

        <div className="mx-auto w-full max-w-editoriale space-y-14 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          {mostraFeatured && featured && (
            <section aria-labelledby="norma-in-evidenza" className="scroll-mt-24">
              <h2 id="norma-in-evidenza" className="sr-only">
                Norma in evidenza
              </h2>
              <Comparsa>
                <LawCard law={featured} featured headingLevel="h2" />
              </Comparsa>
            </section>
          )}

          <section aria-labelledby="feed" className="scroll-mt-24">
            <div className="flex flex-col gap-3">
              <h2
                id="feed"
                className="scroll-mt-24 text-2xl font-extrabold text-inchiostro dark:text-nebbia sm:text-3xl"
              >
                Ultime norme
              </h2>
              <p
                className="text-sm text-inchiostro-soft dark:text-nebbia-soft"
                role="status"
                aria-live="polite"
              >
                {persona === 'tutti'
                  ? `${totaleReale} ${totaleReale === 1 ? 'norma da leggere' : 'norme da leggere'} qui, le ${mostrate} più recenti.`
                  : `${totaleFiltrati} ${totaleFiltrati === 1 ? 'norma' : 'norme'} per ${persona}, mostrate ${mostrate}.`}
              </p>
              <details className="superficie group max-w-2xl px-5 py-4">
                <summary className="inline-flex min-h-[48px] cursor-pointer items-center text-sm font-bold text-inchiostro dark:text-nebbia">
                  Filtra per chi sei
                </summary>
                <div className="mt-2 pb-2">
                  <PersonaFilter active={persona} basePath="/" query={q ? { q } : {}} />
                  {persona !== 'tutti' && (
                    <p className="mt-3 text-sm text-inchiostro-soft dark:text-nebbia-soft">
                      <Link
                        href={archivioHref}
                        className="font-bold text-accento underline underline-offset-2 dark:text-accento-chiara"
                      >
                        Vedi tutte le norme
                      </Link>
                    </p>
                  )}
                </div>
              </details>
            </div>

            {resto.length > 0 ? (
              <ul className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {resto.map((law) => (
                  <li key={law.eli} className="flex">
                    <LawCard law={law} persona={persona} headingLevel="h3" />
                  </li>
                ))}
              </ul>
            ) : totaleReale <= 0 ? (
              <div
                role="alert"
                className="superficie mt-7 flex max-w-2xl flex-wrap items-center gap-3 px-5 py-4"
              >
                <AlertCircleIcon
                  size={22}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="shrink-0 text-accento dark:text-accento-chiara"
                />
                <p className="text-sm leading-relaxed text-inchiostro dark:text-nebbia">
                  Non riusciamo a mostrare le norme. Riprova tra poco.
                </p>
                <Link href="/" className="btn-secondario">
                  Torna all’inizio
                </Link>
              </div>
            ) : (
              <div className="mt-7 max-w-2xl rounded-2xl border border-dashed border-regola bg-carta p-6 dark:border-notte-deep dark:bg-notte-soft">
                <h3 className="flex items-center gap-2 text-lg font-extrabold text-inchiostro dark:text-nebbia">
                  <AlertCircleIcon
                    size={22}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="shrink-0 text-accento dark:text-accento-chiara"
                  />
                  Non troviamo niente
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                  Non troviamo norme per questa scelta. Ricomincia per vedere tutto.
                </p>
                <p className="mt-5">
                  <Link href="/" className="btn-secondario">
                    Vedi tutte le norme
                  </Link>
                </p>
              </div>
            )}
            {totaleVista > 0 && resto.length > 0 && (
              <p className="mt-7">
                <Link href={archivioHref} className="btn-secondario">
                  Vedi tutte le norme
                  <ArrowRight01Icon size={18} strokeWidth={2} aria-hidden="true" />
                </Link>
              </p>
            )}
          </section>

          <section aria-labelledby="come-funziona" className="scroll-mt-24">
            <h2
              id="come-funziona"
              className="scroll-mt-24 text-2xl font-extrabold text-inchiostro dark:text-nebbia sm:text-3xl"
            >
              Come funziona
            </h2>
            <ol className="mt-6 overflow-hidden rounded-2xl border border-regola bg-carta dark:border-notte-deep dark:bg-notte-soft">
              {PASSI.map((passo, index) => (
                <li
                  key={passo.titolo}
                  className={`flex items-start gap-4 px-5 py-5 sm:gap-5 sm:px-6 ${
                    index > 0 ? 'border-t border-regola dark:border-notte-deep' : ''
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="w-10 shrink-0 text-4xl font-extrabold leading-none text-accento dark:text-accento-chiara"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-extrabold text-inchiostro dark:text-nebbia">
                      {passo.titolo}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                      {passo.testo}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {ministri.length > 0 && (
            <section aria-labelledby="ministri" className="scroll-mt-24">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                  id="ministri"
                  className="scroll-mt-24 text-2xl font-extrabold text-inchiostro dark:text-nebbia sm:text-3xl"
                >
                  Chi decide
                </h2>
                <Link
                  href="/ministri"
                  className="inline-flex min-h-[48px] items-center text-sm font-bold text-accento underline underline-offset-4 transition-colors hover:brightness-110 dark:text-accento-chiara"
                >
                  Tutti i ministri
                </Link>
              </div>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {ministri.slice(0, 4).map((minister) => (
                  <li key={minister.slug} className="flex">
                    <MinisterCard minister={minister} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
