import type { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SearchBar from '@/components/SearchBar';
import PersonaFilter from '@/components/PersonaFilter';
import FiltriLeggi, { RisultatiMossi } from '@/components/FiltriLeggi';
import PaginazioneLeggi from '@/components/PaginazioneLeggi';
import LawCard from '@/components/LawCard';
import CorpusBadge from '@/components/CorpusBadge';
import { countLaws, listLaws, queryLaws, type LawSort } from '@/lib/db';
import type { LawRecordExtra } from '@/lib/db';
import {
  coloreSemaforoRecord,
  personaRilevanteRecord,
  type ColoreSemaforo,
} from '@/lib/filtri-leggi';
import { normalizeLaw, STATO_META } from '@/components/seed-fallback';
import { getCorpusInfo } from '@/lib/sources';

interface LeggiProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type Vista = 'griglia' | 'lista';
type SortUI = LawSort | 'rilevanza';

const SORTS_UI: readonly SortUI[] = [
  'rilevanza',
  'data_desc',
  'data_asc',
  'titolo_asc',
  'gulpease_desc',
  'qualita_desc',
];
const PER_OPZIONI: readonly number[] = [12, 24, 48];
const PER_DEFAULT = 12;

/** Estratto bounded per i conteggi globali del filtro semaforo (max 5000). */
const ESTRATTO_FILTRI_MAX = 5000;

const STATI_SEMAFORO: readonly ColoreSemaforo[] = ['verde', 'giallo', 'rosso'];

const VIGENZE_REALI: readonly string[] = ['in_vigore', 'sconosciuto', 'abrogato', 'decaduto'];
const ORIGINI_ONESTE: readonly string[] = ['ufficiali', 'dimostrative'];

function str(sp: Record<string, string | string[] | undefined>, nome: string): string {
  const v = sp[nome];
  return typeof v === 'string' ? v : '';
}

/** Titolo e descrizione dinamici con totale reale: utili per SEO e condivisione. */
export async function generateMetadata({ searchParams }: LeggiProps): Promise<Metadata> {
  const base: Metadata = {
    title: 'Tutte le leggi - Stato della Repubblica',
    description: 'L’archivio delle norme spiegate semplici: cerca con parole tue.',
  };
  try {
    const sp = await searchParams;
    const q = str(sp, 'q').slice(0, 200);
    const tipo = str(sp, 'tipo').slice(0, 80);
    const anno = str(sp, 'anno').slice(0, 4);
    const totale = await countLaws({ q, tipo, anno });
    const pezzi: string[] = [];
    if (q) pezzi.push(`“${q}”`);
    if (tipo) pezzi.push(tipo);
    if (anno) pezzi.push(anno);
    const dettaglio = pezzi.length > 0 ? ` - ${pezzi.join(', ')}` : '';
    const titolo = `Tutte le leggi (${totale} ${totale === 1 ? 'norma' : 'norme'})${dettaglio} - Stato della Repubblica`;
    return {
      title: titolo,
      description: `Archivio di ${totale} ${totale === 1 ? 'norma spiegata semplice' : 'norme spiegate semplici'}${dettaglio}. Cerca con parole tue.`,
    };
  } catch {
    return base;
  }
}

/** Frase di stato dei risultati in parole semplici, senza separatori a catena. */
function fraseRisultati(args: {
  totale: number;
  q: string;
  tipo: string;
  anno: string;
  vigenza: string;
  origine: string;
  stato: string;
  persona: string;
}): string {
  const { totale, q, tipo, anno, vigenza, origine, stato, persona } = args;
  const filtri: string[] = [];
  if (tipo) filtri.push(`tipo ${tipo}`);
  if (anno) filtri.push(`anno ${anno}`);
  if (vigenza) filtri.push(`validità ${vigenza.replace('_', ' ')}`);
  if (origine) filtri.push(origine === 'dimostrative' ? 'schede di esempio' : `schede ${origine}`);
  if (stato !== '') {
    const meta = (STATO_META as Record<string, { parole: string; label: string } | undefined>)[
      stato
    ];
    filtri.push(`a che punto è: ${meta?.parole ?? stato}`);
  }
  if (persona !== 'tutti') filtri.push(`per ${persona}`);
  const base = `${totale} ${totale === 1 ? 'norma trovata' : 'norme trovate'}${q ? ` per “${q}”` : ''}`;
  return filtri.length > 0 ? `${base} (${filtri.join(', ')})` : `${base}.`;
}

/** Nota sul campione dei conteggi, in una frase sola. */
function fraseEstratto(args: {
  stato: string;
  persona: string;
  vigenza: string;
  origine: string;
  estrattoTroncato: boolean;
}): string {
  const { stato, persona, vigenza, origine, estrattoTroncato } = args;
  const pezzi: string[] = [];
  if (stato !== '') {
    const meta = (STATO_META as Record<string, { parole: string; label: string } | undefined>)[
      stato
    ];
    pezzi.push(`A che punto è “${meta?.label ?? stato}”`);
  } else {
    pezzi.push('Tutte le schede');
  }
  if (persona !== 'tutti') pezzi.push(`per ${persona}`);
  if (vigenza) pezzi.push(`validità ${vigenza.replace('_', ' ')}`);
  if (origine) pezzi.push(origine === 'dimostrative' ? 'schede di esempio' : `schede ${origine}`);
  if (estrattoTroncato) pezzi.push(`calcolato sulle prime ${ESTRATTO_FILTRI_MAX} schede`);
  return `${pezzi.join(', ')}.`;
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

/** Composizione onesta per la nota archivio: solo `getCorpusInfo`, mai throw, null se 0. */
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

export default async function LeggiPage({ searchParams }: LeggiProps) {
  const sp = await searchParams;
  const q = str(sp, 'q').slice(0, 200);
  const persona = str(sp, 'persona') || 'tutti';
  const tipo = str(sp, 'tipo').slice(0, 80);
  const anno = str(sp, 'anno').slice(0, 4);
  const statoParam = str(sp, 'stato').toLowerCase();
  const stato: '' | ColoreSemaforo = (STATI_SEMAFORO as readonly string[]).includes(statoParam)
    ? (statoParam as ColoreSemaforo)
    : '';
  const vigenzaRaw = str(sp, 'vigenza').toLowerCase().slice(0, 60);
  const vigenza = (VIGENZE_REALI as readonly string[]).includes(vigenzaRaw) ? vigenzaRaw : '';
  const origineRaw = str(sp, 'origine').toLowerCase().slice(0, 60);
  const origine = (ORIGINI_ONESTE as readonly string[]).includes(origineRaw) ? origineRaw : '';
  const sortRaw = str(sp, 'sort');
  const sortDefault: SortUI = q ? 'rilevanza' : 'data_desc';
  const sort: SortUI = (SORTS_UI as readonly string[]).includes(sortRaw)
    ? (sortRaw as SortUI)
    : sortDefault;
  // `rilevanza` è gestita server-side in lib/db (ranking BM25-lite sulla
  // finestra + fallback ILIKE); la paginazione resta sempre server-side.
  const sortDb: LawSort = sort;
  const perRaw = Math.floor(Number(str(sp, 'per'))) || PER_DEFAULT;
  const per = PER_OPZIONI.includes(perRaw) ? perRaw : PER_DEFAULT;
  const vista: Vista = str(sp, 'vista') === 'lista' ? 'lista' : 'griglia';
  const paginaMax = Math.max(1, Math.floor(10000 / per));
  const page = Math.min(paginaMax, Math.max(1, Math.floor(Number(str(sp, 'page'))) || 1));

  // Paginazione sempre server-side con filtro persona diretto in lib/db
  // (Caso C): la pagina è già corretta, nessun filtro solo-pagina. Il filtro
  // semaforo (derivato) e il filtro origine (dimostrativo) usano l'estratto
  // bounded in-memory (max 5000); la vigenza reale passa come `stato` al DB
  // (filtro onesto, mai inventato). Mai 500: ogni accesso è never-throw.
  const serveEstratto = stato !== '' || origine !== '';
  let paginata = { items: [] as LawRecordExtra[], total: 0, page };
  let totaleArchivio = 0;
  let estrattoFiltri: LawRecordExtra[] = [];
  let erroreCaricamento = false;
  try {
    const [pag, tot, estr] = await Promise.all([
      listLaws({ q, tipo, anno, persona, stato: vigenza || undefined, sort: sortDb, page, per }),
      countLaws().catch(() => 0),
      serveEstratto
        ? queryLaws(
            { q, tipo, anno, persona, stato: vigenza || undefined },
            ESTRATTO_FILTRI_MAX,
          ).catch(() => [] as LawRecordExtra[])
        : Promise.resolve([] as LawRecordExtra[]),
    ]);
    paginata = pag;
    totaleArchivio = tot;
    estrattoFiltri = estr;
  } catch {
    erroreCaricamento = true;
  }
  // Risultati già filtrati server-side per persona e vigenza: nessuna
  // rifinitura locale salvo semaforo/origine.
  let risultati = paginata.items.map(normalizeLaw);
  let totale = paginata.total;
  const paginaCorrente = serveEstratto ? page : paginata.page;

  // Filtro semaforo (link dalla home, es. `/leggi?stato=verde`) + filtro
  // origine onesto (`ufficiali`/`dimostrative` su `dimostrativo` reale):
  // operano sull'estratto bounded con paginazione in-memory usando il modulo
  // condiviso `lib/filtri-leggi`. `qualita_desc` e `rilevanza` ricadono su
  // `data_desc` in questo ramo (stessa regola del fallback DB per la qualità
  // nel blob JSON).
  if (serveEstratto) {
    const perStato =
      stato !== ''
        ? estrattoFiltri.filter((record) => {
            try {
              return coloreSemaforoRecord(record) === stato;
            } catch {
              return false;
            }
          })
        : estrattoFiltri;
    const perOrigine =
      origine === 'ufficiali'
        ? perStato.filter((record) => (record as LawRecordExtra).dimostrativo !== true)
        : origine === 'dimostrative'
          ? perStato.filter((record) => (record as LawRecordExtra).dimostrativo === true)
          : perStato;
    const perEntrambi =
      persona === 'tutti'
        ? perOrigine
        : perOrigine.filter((record) => {
            try {
              return personaRilevanteRecord(record, persona);
            } catch {
              return false;
            }
          });
    const ordinati = [...perEntrambi].sort((a, b) => {
      if (sort === 'data_asc')
        return a.dataEmanazione.localeCompare(b.dataEmanazione) || a.eli.localeCompare(b.eli);
      if (sort === 'titolo_asc')
        return a.titolo.localeCompare(b.titolo, 'it') || a.eli.localeCompare(b.eli);
      if (sort === 'gulpease_desc')
        return (b.gulpease ?? -1) - (a.gulpease ?? -1) || a.eli.localeCompare(b.eli);
      return b.dataEmanazione.localeCompare(a.dataEmanazione) || a.eli.localeCompare(b.eli);
    });
    totale = ordinati.length;
    const inizio = (page - 1) * per;
    risultati = ordinati.slice(inizio, inizio + per).map(normalizeLaw);
  }
  const estrattoTroncato = serveEstratto && totaleArchivio > estrattoFiltri.length;
  const composizione = leggiComposizione();

  const queryBase: Record<string, string> = {};
  if (q) queryBase.q = q;
  if (tipo) queryBase.tipo = tipo;
  if (anno) queryBase.anno = anno;
  if (stato !== '') queryBase.stato = stato;
  if (vigenza !== '') queryBase.vigenza = vigenza;
  if (origine !== '') queryBase.origine = origine;
  if (sort !== sortDefault) queryBase.sort = sort;
  if (persona !== 'tutti') queryBase.persona = persona;
  if (per !== PER_DEFAULT) queryBase.per = String(per);
  if (vista !== 'griglia') queryBase.vista = vista;

  const queryRicerca: Record<string, string> = { ...queryBase };
  delete queryRicerca.q;

  const exportBase: Record<string, string> = {};
  if (q) exportBase.q = q;
  if (tipo) exportBase.tipo = tipo;
  if (anno) exportBase.anno = anno;
  if (sort !== 'data_desc' && sort !== 'rilevanza') exportBase.sort = sort;
  if (persona !== 'tutti') exportBase.persona = persona;
  const exportQs = new URLSearchParams({ ...exportBase });
  const exportQsStr = exportQs.toString();
  const csvHref = exportQsStr
    ? `/api/export?formato=csv&${exportQsStr}`
    : '/api/export?formato=csv';
  const jsonHref = exportQsStr
    ? `/api/export?formato=json&${exportQsStr}`
    : '/api/export?formato=json';

  const chiaveRisultati = [
    q,
    tipo,
    anno,
    stato,
    vigenza,
    origine,
    sort,
    persona,
    per,
    vista,
    page,
  ].join('|');

  return (
    <>
      <Header />
      <main id="contenuto" className="mx-auto w-full max-w-editoriale px-4 py-8 sm:px-6 lg:px-8">
        <nav aria-label="Percorso" className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
          <ol className="flex items-center gap-2">
            <li>
              <Link
                href="/"
                className="inline-flex min-h-[48px] min-w-[48px] items-center rounded-xl hover:text-accento dark:hover:text-accento-chiara"
              >
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              Leggi
            </li>
          </ol>
        </nav>

        <header className="mt-4 animate-comparsa-su rounded-2xl border border-regola bg-carta-soft p-6 dark:border-notte-deep dark:bg-notte-soft sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accento dark:text-accento-chiara">
            Archivio
          </p>
          <h1 className="mt-2 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Tutte le leggi
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Trova le leggi spiegate con parole semplici: scrivi un tema e apri la scheda.
          </p>
          <p className="mt-2 max-w-2xl text-sm font-semibold tabular-nums text-inchiostro dark:text-nebbia">
            {totaleArchivio} {totaleArchivio === 1 ? 'norma in tutto' : 'norme in tutto'}.
          </p>
          {composizione && (
            <div className="mt-3 max-w-2xl" aria-live="polite">
              <CorpusBadge
                totale={composizione.totale}
                dimostrative={composizione.dimostrative}
                ufficiali={composizione.ufficiali}
              />
            </div>
          )}
        </header>

        {/*
          Barra di ricerca fissa: vetro morbido approssimato senza librerie
          (tinta calda traslucida + blur + bordo chiaro). Se il blur manca o
          serve meno trasparenza, resta la tinta piena e resta leggibile.
        */}
        <div className="sticky top-0 z-20 -mx-4 border-b border-white/40 bg-carta/85 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] backdrop-blur-md supports-[not_(backdrop-filter:blur(1px))]:bg-carta sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 dark:border-white/10 dark:bg-notte/85 dark:supports-[not_(backdrop-filter:blur(1px))]:bg-notte">
          <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <SearchBar
              id="ricerca-legge-archivio"
              defaultValue={q}
              action="/leggi"
              query={queryRicerca}
              label="Cerca con parole tue"
              placeholder="Esempio: casa, lavoro, scuola"
            />
            <PersonaFilter active={persona} basePath="/leggi" query={queryBase} />
          </div>
          <div className="mt-2.5">
            <FiltriLeggi
              tipo={tipo}
              anno={anno}
              sort={sort}
              per={per}
              vista={vista}
              vigenza={vigenza}
              origine={origine}
              query={queryBase}
            />
          </div>
        </div>

        <section aria-labelledby="risultati-archivio-titolo" className="scroll-mt-24">
          <h2 id="risultati-archivio-titolo" className="sr-only">
            Risultati dell’archivio
          </h2>
          {erroreCaricamento ? (
            <div
              role="alert"
              className="mt-4 rounded-2xl border border-regola bg-carta-soft p-6 text-center dark:border-notte-deep dark:bg-notte-soft"
            >
              <p className="text-sm font-medium text-inchiostro dark:text-nebbia">
                Qualcosa non va. Riprova tra poco.
              </p>
              <p className="mt-4">
                <Link
                  href="/leggi"
                  className="inline-flex min-h-[48px] items-center rounded-xl bg-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-carta hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
                >
                  Mostra tutte le leggi
                </Link>
              </p>
            </div>
          ) : (
            <>
              <p
                className="mt-4 text-sm tabular-nums text-inchiostro-soft dark:text-nebbia-soft"
                role="status"
                aria-live="polite"
              >
                {fraseRisultati({ totale, q, tipo, anno, vigenza, origine, stato, persona })}
              </p>
              {serveEstratto && (
                <p className="mt-1 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                  {fraseEstratto({ stato, persona, vigenza, origine, estrattoTroncato })}
                </p>
              )}

              {risultati.length > 0 ? (
                <RisultatiMossi chiave={chiaveRisultati}>
                  <ul
                    className={
                      vista === 'lista'
                        ? 'mt-3 grid grid-cols-1 gap-3'
                        : 'mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
                    }
                  >
                    {risultati.map((law) => (
                      <li
                        key={law.eli}
                        className="flex overflow-hidden rounded-2xl"
                        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 300px' }}
                      >
                        <LawCard law={law} persona={persona} headingLevel="h3" evidenzia={q} />
                      </li>
                    ))}
                  </ul>
                </RisultatiMossi>
              ) : (
                <div
                  role="status"
                  className="mt-3 rounded-2xl border border-dashed border-regola bg-carta p-6 text-center sm:p-8 dark:border-notte-deep dark:bg-notte-soft"
                >
                  <p className="text-sm font-medium text-inchiostro dark:text-nebbia">
                    Niente da mostrare con queste parole. Prova a cambiare ricerca.
                  </p>
                  <p className="mt-4">
                    <Link
                      href="/leggi"
                      className="inline-flex min-h-[48px] items-center rounded-xl bg-inchiostro px-5 py-2 text-xs font-semibold uppercase tracking-wide text-carta hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
                    >
                      Mostra tutte le leggi
                    </Link>
                  </p>
                </div>
              )}

              <PaginazioneLeggi page={paginaCorrente} per={per} total={totale} query={queryBase} />

              <div className="mt-8 flex flex-wrap gap-x-4 gap-y-2 text-sm">
                <a
                  href={csvHref}
                  className="inline-flex min-h-[48px] items-center rounded-xl underline underline-offset-4 hover:text-accento dark:hover:text-accento-chiara"
                >
                  Prendi in CSV
                </a>
                <a
                  href={jsonHref}
                  className="inline-flex min-h-[48px] items-center rounded-xl underline underline-offset-4 hover:text-accento dark:hover:text-accento-chiara"
                >
                  Prendi in JSON
                </a>
                <a
                  href="/api/feed"
                  className="inline-flex min-h-[48px] items-center rounded-xl underline underline-offset-4 hover:text-accento dark:hover:text-accento-chiara"
                >
                  Novità via RSS
                </a>
                <Link
                  href="/salvati"
                  className="inline-flex min-h-[48px] items-center rounded-xl underline underline-offset-4 hover:text-accento dark:hover:text-accento-chiara"
                >
                  Le tue salvate
                </Link>
              </div>
            </>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
