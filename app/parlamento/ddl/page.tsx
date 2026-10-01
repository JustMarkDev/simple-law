import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  tuttiDdl,
  fasiDistinte,
  filtraPerFase,
  filtraPerRamo,
  cercaDdl,
  paginaDdl,
  leggiProvenanceDdl,
  type ProvenanceDdl,
  type VoceDdl,
} from "@/lib/ddl-dati";

interface DdlProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PER_OPZIONI = [10, 20, 50] as const;
const PER_DEFAULT = 20;
const BADGE_DDL = "Disegno di legge - non in vigore";

function str(sp: Record<string, string | string[] | undefined>, nome: string): string {
  const v = sp[nome];
  return typeof v === "string" ? v : "";
}

function dataIT(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function hrefSenza(query: Record<string, string>, chiave: string): string {
  const params = new URLSearchParams(query);
  params.delete(chiave);
  params.delete("page");
  const qs = params.toString();
  return qs ? `/parlamento/ddl?${qs}` : "/parlamento/ddl";
}

export async function generateMetadata({ searchParams }: DdlProps): Promise<Metadata> {
  const base: Metadata = {
    title: "Disegni di legge - Legislatura 19 - Stato della Repubblica",
    description:
      "Disegni di legge del Senato e atti della Camera (legislatura 19): iter in corso, non in vigore. Mai confondere con le leggi.",
  };
  try {
    const sp = await searchParams;
    const q = str(sp, "q").slice(0, 100);
    const fase = str(sp, "fase").slice(0, 20);
    const ramo = str(sp, "ramo").slice(0, 5).toUpperCase();
    const base2 = await tuttiDdl();
    let filtrati = filtraPerRamo(base2, ramo);
    filtrati = filtraPerFase(filtrati, fase.trim());
    const qValida = q.trim().length >= 2 ? q.trim() : "";
    if (qValida) filtrati = cercaDdl(filtrati, qValida);
    const pezzi: string[] = [];
    if (qValida) pezzi.push(`“${qValida}”`);
    if (fase.trim()) pezzi.push(`fase ${fase.trim()}`);
    if (ramo === "S" || ramo === "C") pezzi.push(`ramo ${ramo}`);
    const dettaglio = pezzi.length > 0 ? ` - ${pezzi.join(" · ")}` : "";
    return {
      title: `Disegni di legge (${filtrati.length})${dettaglio} - Stato della Repubblica`,
      description: `Archivio di ${filtrati.length} disegni di legge e atti della legislatura 19${dettaglio}: iter in corso, non in vigore.`,
    };
  } catch {
    return base;
  }
}

function SchedaDdl({ voce }: { voce: VoceDdl }) {
  const schedaUrl = voce.scheda || voce.uri;
  return (
    <article className="group relative flex h-full flex-col gap-3 border border-regola bg-carta p-5 transition-colors hover:border-accento focus-within:border-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:hover:border-nebbia dark:focus-within:border-nebbia">
      <p>
        <span className="inline-flex items-center border border-accento px-2 py-1 text-[11px] font-bold text-accento dark:border-accento-chiara dark:text-accento-chiara">
          {BADGE_DDL}
        </span>
      </p>
      <h3 className="text-base font-bold leading-snug text-inchiostro dark:text-nebbia">
        {voce.titolo}
      </h3>
      <dl className="grid gap-1 text-xs text-inchiostro-soft dark:text-nebbia-soft">
        <div className="flex gap-2">
          <dt className="font-semibold">Fonte:</dt>
          <dd>{voce.fonte === "senato" ? "Senato" : "Camera"} · Legislatura 19</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold">Numero:</dt>
          <dd>{voce.numero}</dd>
        </div>
        {voce.fase && (
          <div className="flex gap-2">
            <dt className="font-semibold">Fase:</dt>
            <dd>{voce.fase}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="font-semibold">Ramo:</dt>
          <dd>{voce.ramo === "S" ? "Senato (S)" : "Camera (C)"}</dd>
        </div>
        {voce.statoIter && (
          <div className="flex gap-2">
            <dt className="font-semibold">Stato iter:</dt>
            <dd>{voce.statoIter}</dd>
          </div>
        )}
      </dl>
      <p className="mt-auto pt-1 text-xs">
        <a
          href={schedaUrl}
          target="_blank"
          rel="noopener"
          className="relative z-10 inline-flex min-h-[48px] items-center font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
        >
          {voce.scheda ? "Scheda ufficiale ↗" : "Dato aperto ufficiale ↗"}
        </a>
      </p>
    </article>
  );
}

export default async function DdlPage({ searchParams }: DdlProps) {
  const sp = await searchParams;
  const qGrezza = str(sp, "q").slice(0, 100);
  const q = qGrezza.trim().length >= 2 ? qGrezza.trim() : "";
  const faseParam = str(sp, "fase").slice(0, 20).trim();
  const ramoParam = str(sp, "ramo").slice(0, 5).trim().toUpperCase();
  const ramo = ramoParam === "S" || ramoParam === "C" ? ramoParam : "";
  const perRaw = Math.floor(Number(str(sp, "per"))) || PER_DEFAULT;
  const per = (PER_OPZIONI as readonly number[]).includes(perRaw)
    ? (perRaw as 10 | 20 | 50)
    : PER_DEFAULT;
  const pageRaw = Math.floor(Number(str(sp, "page"))) || 1;
  const pageRichiesta = Math.max(1, pageRaw);

  const tutte = await tuttiDdl();
  const fasi = fasiDistinte(tutte);
  const fase = faseParam && fasi.includes(faseParam) ? faseParam : "";

  let filtrate: VoceDdl[] = filtraPerRamo(tutte, ramo);
  filtrate = filtraPerFase(filtrate, fase);
  if (q) filtrate = cercaDdl(filtrate, q);

  const totale = filtrate.length;
  const totPagine = Math.max(1, Math.ceil(totale / per));
  const page = Math.min(pageRichiesta, totPagine);
  const risultati = paginaDdl(filtrate, page, per);

  const nSenato = filtrate.filter((v) => v.fonte === "senato").length;
  const nCamera = filtrate.filter((v) => v.fonte === "camera").length;

  let prov: ProvenanceDdl = {};
  try {
    prov = await leggiProvenanceDdl();
  } catch {
    prov = {};
  }

  const queryBase: Record<string, string> = {};
  if (qGrezza.trim()) queryBase.q = qGrezza.trim().slice(0, 100);
  if (fase) queryBase.fase = fase;
  if (ramo) queryBase.ramo = ramo;
  if (per !== PER_DEFAULT) queryBase.per = String(per);

  const filtriAttivi: { chiave: string; etichetta: string }[] = [];
  if (q) filtriAttivi.push({ chiave: "q", etichetta: `Ricerca: ${q}` });
  if (fase) filtriAttivi.push({ chiave: "fase", etichetta: `Fase: ${fase}` });
  if (ramo) filtriAttivi.push({ chiave: "ramo", etichetta: `Ramo: ${ramo}` });
  if (per !== PER_DEFAULT) filtriAttivi.push({ chiave: "per", etichetta: `Per pagina: ${per}` });

  function hrefPagina(p: number): string {
    const params = new URLSearchParams(queryBase);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/parlamento/ddl?${qs}` : "/parlamento/ddl";
  }

  return (
    <>
      <Header />
      <main
        id="contenuto"
        className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        <nav aria-label="Percorso" className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href="/parlamento"
                className="hover:text-accento dark:hover:text-accento-chiara"
              >
                Parlamento
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              Disegni di legge
            </li>
          </ol>
        </nav>

        <header className="mt-4 border-b-2 border-inchiostro pb-5 dark:border-nebbia">
          <p className="inline-flex items-center border border-accento px-2 py-1 text-xs font-bold text-accento dark:border-accento-chiara dark:text-accento-chiara">
            DDL - non in vigore / iter in corso
          </p>
          <h1 className="mt-3 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
            Disegni di legge - Legislatura 19
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Disegni di legge del Senato e atti della Camera dai dati aperti reali: sono proposte in
            iter, non leggi in vigore. Lo stato dell&apos;iter è riportato così come pubblicato,
            senza interpretazioni.
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Cerchi le leggi in vigore? Vedi l&apos;archivio delle{" "}
            <Link
              href="/leggi"
              className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
            >
              leggi
            </Link>
            .
          </p>
          <p className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia" role="status">
            {totale} {totale === 1 ? "disegno di legge trovato" : "disegni di legge trovati"} (
            {nSenato} Senato · {nCamera} Camera)
          </p>
        </header>

        <form
          method="get"
          action="/parlamento/ddl"
          className="mt-6 grid gap-3 border border-regola bg-carta-soft p-4 dark:border-notte-deep dark:bg-notte-soft sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        >
          <div>
            <label
              htmlFor="q-ddl"
              className="mb-1 block text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft"
            >
              Cerca nel titolo
            </label>
            <input
              id="q-ddl"
              name="q"
              type="search"
              defaultValue={qGrezza}
              maxLength={100}
              placeholder="Es. museo"
              autoComplete="off"
              className="campo text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="fase-ddl"
              className="mb-1 block text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft"
            >
              Fase (Senato)
            </label>
            <select id="fase-ddl" name="fase" defaultValue={fase} className="campo text-sm">
              <option value="">Tutte le fasi</option>
              {fasi.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="ramo-ddl"
              className="mb-1 block text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft"
            >
              Ramo
            </label>
            <select id="ramo-ddl" name="ramo" defaultValue={ramo} className="campo text-sm">
              <option value="">Tutti</option>
              <option value="S">Senato (S)</option>
              <option value="C">Camera (C)</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="per-ddl"
              className="mb-1 block text-xs font-semibold text-inchiostro-soft dark:text-nebbia-soft"
            >
              Per pagina
            </label>
            <select id="per-ddl" name="per" defaultValue={String(per)} className="campo text-sm">
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
          <div className="sm:col-span-4">
            <button type="submit" className="btn-primario">
              Filtra
            </button>
          </div>
        </form>

        <p
          className="mt-6 text-sm text-inchiostro-soft dark:text-nebbia-soft"
          role="status"
          aria-live="polite"
        >
          {totale} {totale === 1 ? "disegno di legge trovato" : "disegni di legge trovati"}
          {q ? ` per “${q}”` : ""}
          {fase ? ` · fase: ${fase}` : ""}
          {ramo ? ` · ramo: ${ramo}` : ""}, pagina {page} di {totPagine}.
        </p>

        {filtriAttivi.length > 0 && (
          <ul aria-label="Filtri attivi" className="mt-3 flex flex-wrap gap-2">
            {filtriAttivi.map((f) => (
              <li key={f.chiave}>
                <Link
                  href={hrefSenza(queryBase, f.chiave)}
                  aria-label={`Rimuovi il filtro ${f.etichetta}`}
                  className="inline-flex min-h-[48px] items-center gap-1 border border-regola bg-carta-soft px-3 py-2 text-xs font-medium text-inchiostro-soft hover:border-accento hover:text-accento dark:border-notte-deep dark:bg-notte dark:text-nebbia-soft dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
                >
                  {f.etichetta} <span aria-hidden="true">×</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {risultati.length > 0 ? (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {risultati.map((v) => (
              <li key={`${v.fonte}:${v.uri}`} className="flex">
                <SchedaDdl voce={v} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 border border-dashed border-regola bg-carta p-8 text-center dark:border-notte-deep dark:bg-notte-soft">
            <p className="text-sm font-medium text-inchiostro dark:text-nebbia">
              Nessun disegno di legge trovato con questi filtri.
            </p>
            <p className="mt-2 text-xs text-inchiostro-soft dark:text-nebbia-soft">
              I disegni di legge sono proposte in iter, non leggi in vigore: nessun risultato qui
              significa solo che nessun iter corrisponde ai filtri.
            </p>
            <p className="mt-6">
              <Link
                href="/parlamento/ddl"
                className="inline-flex min-h-[48px] items-center bg-inchiostro px-5 py-2 text-xs font-semibold text-carta hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia"
              >
                Rimuovi filtri
              </Link>
            </p>
          </div>
        )}

        {totPagine > 1 && (
          <nav
            aria-label="Paginazione disegni di legge"
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            {page > 1 ? (
              <Link
                href={hrefPagina(page - 1)}
                className="inline-flex min-h-[48px] items-center border border-inchiostro px-4 py-2 text-xs font-semibold text-inchiostro hover:bg-inchiostro hover:text-carta dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte"
              >
                ← Precedente
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex min-h-[48px] cursor-not-allowed items-center border border-regola px-4 py-2 text-xs font-semibold text-inchiostro-faint dark:border-notte-deep dark:text-nebbia-faint"
              >
                ← Precedente
              </span>
            )}
            <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft">
              Pagina {page} di {totPagine}
            </span>
            {page < totPagine ? (
              <Link
                href={hrefPagina(page + 1)}
                className="inline-flex min-h-[48px] items-center border border-inchiostro px-4 py-2 text-xs font-semibold text-inchiostro hover:bg-inchiostro hover:text-carta dark:border-nebbia dark:text-nebbia dark:hover:bg-nebbia dark:hover:text-notte"
              >
                Successiva →
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="inline-flex min-h-[48px] cursor-not-allowed items-center border border-regola px-4 py-2 text-xs font-semibold text-inchiostro-faint dark:border-notte-deep dark:text-nebbia-faint"
              >
                Successiva →
              </span>
            )}
          </nav>
        )}

        <section
          aria-labelledby="fonti-licenze-ddl"
          className="mt-10 border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft"
        >
          <h2 id="fonti-licenze-ddl" className="text-lg font-bold text-inchiostro dark:text-nebbia">
            Fonti e licenze
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Senato: dati.senato.it - CC BY 3.0 IT, Camera: dati.camera.it - CC BY-SA 4.0 ·
            legislatura 19
            {prov.senato?.recuperatoIl
              ? ` · dati Senato aggiornati al ${dataIT(prov.senato.recuperatoIl)}`
              : ""}
            {prov.camera?.recuperatoIl
              ? ` · dati Camera aggiornati al ${dataIT(prov.camera.recuperatoIl)}`
              : ""}
            .
          </p>
          <p className="mt-2 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
            Ogni scheda è un disegno di legge in iter, non in vigore. Lo stato dell&apos;iter è
            riportato così come pubblicato dalle Camere. La discoverability passa anche per la
            sitemap del sito e per questa pagina hub (nessun link aggiunto ad altre pagine: è
            vietato toccare file altrui).
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
