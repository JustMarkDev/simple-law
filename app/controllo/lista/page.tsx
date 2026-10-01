import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Comparsa from "@/components/Comparsa";
import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  DocumentValidationIcon,
  FileSearchIcon,
  InformationCircleIcon,
  JusticeScale01Icon,
  Search01Icon,
} from "hugeicons-react";
import {
  cercaContratti,
  cercaDocumentiCnel,
  cercaProvvedimenti,
  contaPerGiudice,
  DISCLAIMER_CONTROLLO,
  filtraPerEnte,
  filtraPerGiudice,
  leggiProvenanceAnac,
  leggiProvenanceCnel,
  leggiProvenanceGA,
  normalizzaGiudiceGA,
  paginaOversight,
  tuttiContratti,
  tuttiDocumentiCnel,
  tuttiProvvedimentiGA,
} from "@/lib/oversight-dati";

export const metadata: Metadata = {
  title: "Elenco controllo - Contratti e provvedimenti - Stato della Repubblica",
  description:
    "Elenco ricercabile dei contratti pubblici ANAC 2025 e dei provvedimenti di giustizia amministrativa 2026: documenti di controllo, non sono leggi.",
};

interface RicercaLista {
  tipo?: string;
  q?: string;
  ente?: string;
  giudice?: string;
  page?: string;
}

function dataIT(iso?: string): string {
  try {
    if (!iso) return "data non indicata";
    const base = iso.slice(0, 10);
    const d = new Date(`${base}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return base;
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return (iso ?? "").slice(0, 10);
  }
}

function importoIT(importo?: number, valuta?: string): string {
  try {
    if (typeof importo !== "number" || !Number.isFinite(importo)) return "importo non indicato";
    const testo = importo.toLocaleString("it-IT");
    return `€ ${testo}${valuta && valuta !== "EUR" ? ` (${valuta})` : ""} (valore visto nei dati, non spesa certa)`;
  } catch {
    return "importo non indicato";
  }
}

const badgeNonLegge =
  "inline-flex items-center gap-1.5 rounded-lg bg-carta-soft px-3 py-1.5 text-xs font-semibold text-inchiostro-soft dark:bg-notte-deep dark:text-nebbia-soft";

const tabBase =
  "inline-flex min-h-[48px] items-center rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento dark:focus-visible:outline-accento-chiara";
const tabAttiva =
  "border-inchiostro bg-inchiostro text-carta dark:border-nebbia dark:bg-nebbia dark:text-notte";
const tabNormale =
  "border-regola bg-carta text-inchiostro hover:border-accento dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:hover:border-nebbia";

const bottoneCerca =
  "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-inchiostro px-6 py-3 text-sm font-bold text-carta transition-colors hover:bg-inchiostro-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:bg-nebbia dark:text-notte dark:hover:bg-nebbia-soft dark:focus-visible:outline-nebbia";

const bottoneAccento =
  "inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-accento px-6 py-3 text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accento motion-reduce:transition-none motion-reduce:active:scale-100 dark:bg-accento-chiara dark:text-notte dark:focus-visible:outline-accento-chiara";

const campoRicerca =
  "min-h-[48px] w-full flex-1 rounded-xl border border-regola bg-carta px-4 py-2 text-sm text-inchiostro placeholder:text-inchiostro-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:border-notte-deep dark:bg-notte-soft dark:text-nebbia dark:placeholder:text-nebbia-faint dark:focus-visible:outline-nebbia";

const cardLista =
  "rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6";

function BadgeNonLegge({ testo }: { testo: string }) {
  return (
    <span className={badgeNonLegge}>
      <InformationCircleIcon size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" />
      {testo}
    </span>
  );
}

function TabsControllo({ attivo }: { attivo: "contratti" | "ga" | "cnel" }) {
  return (
    <div
      className="mt-6 flex flex-wrap gap-2"
      role="group"
      aria-label="Passa tra contratti, provvedimenti e documenti"
    >
      {attivo === "contratti" ? (
        <span aria-current="page" className={`${tabBase} ${tabAttiva}`}>
          Contratti
        </span>
      ) : (
        <Link href="/controllo/lista?tipo=contratti" className={`${tabBase} ${tabNormale}`}>
          Contratti
        </Link>
      )}
      {attivo === "ga" ? (
        <span aria-current="page" className={`${tabBase} ${tabAttiva}`}>
          Provvedimenti
        </span>
      ) : (
        <Link href="/controllo/lista?tipo=ga" className={`${tabBase} ${tabNormale}`}>
          Provvedimenti
        </Link>
      )}
      {attivo === "cnel" ? (
        <span aria-current="page" className={`${tabBase} ${tabAttiva}`}>
          Documenti CNEL
        </span>
      ) : (
        <Link href="/controllo/lista?tipo=cnel" className={`${tabBase} ${tabNormale}`}>
          Documenti CNEL
        </Link>
      )}
    </div>
  );
}

function StatoVuoto({
  id,
  titolo,
  testo,
  href,
  cta,
}: {
  id: string;
  titolo: string;
  testo: string;
  href: string;
  cta: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className="mt-8 rounded-2xl border border-dashed border-regola bg-carta p-8 text-center dark:border-notte-deep dark:bg-notte-soft"
    >
      <h2
        id={id}
        className="flex items-center justify-center gap-2 text-lg font-bold text-inchiostro dark:text-nebbia"
      >
        <AlertCircleIcon size={22} aria-hidden="true" className="shrink-0" />
        {titolo}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
        {testo}
      </p>
      <p className="mt-6">
        <Link href={href} className={bottoneAccento}>
          {cta}
          <ArrowRight01Icon size={18} aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}

export default async function ListaControlloPage({
  searchParams,
}: {
  searchParams: Promise<RicercaLista>;
}) {
  const params = await searchParams;
  const tipoGrezzo = (params.tipo ?? "contratti").trim().toLowerCase();
  const tipo = tipoGrezzo === "ga" ? "ga" : tipoGrezzo === "cnel" ? "cnel" : "contratti";
  const q = (params.q ?? "").slice(0, 100);
  const ente = (params.ente ?? "").slice(0, 100);
  const giudice = normalizzaGiudiceGA(params.giudice ?? "");
  const pageGrezza = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(pageGrezza) && pageGrezza >= 1 ? Math.floor(pageGrezza) : 1;
  const per = 20;

  const linkPagina = (p: number) => {
    const sp = new URLSearchParams();
    sp.set("tipo", tipo);
    if (q) sp.set("q", q);
    if (tipo === "contratti" && ente) sp.set("ente", ente);
    if (tipo === "ga" && giudice) sp.set("giudice", giudice);
    if (p > 1) sp.set("page", String(p));
    return `/controllo/lista?${sp.toString()}`;
  };

  if (tipo === "ga") {
    const [tutte, provenance] = await Promise.all([tuttiProvvedimentiGA(), leggiProvenanceGA()]);
    const base = filtraPerGiudice(tutte, giudice);
    const filtrati = cercaProvvedimenti(base, q);
    const totale = filtrati.length;
    const items = paginaOversight(filtrati, page, per);
    const conteggi = contaPerGiudice(tutte);
    const pagine = Math.max(1, Math.ceil(totale / per));
    const paginaCorrente = Math.min(page, pagine);

    return (
      <>
        <Header />
        <main
          id="contenuto"
          className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
        >
          <nav
            aria-label="Percorso"
            className="text-xs text-inchiostro-faint dark:text-nebbia-faint"
          >
            <ol className="flex items-center gap-2">
              <li>
                <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href="/controllo"
                  className="hover:text-accento dark:hover:text-accento-chiara"
                >
                  Controllo pubblico
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
                Provvedimenti
              </li>
            </ol>
          </nav>

          <Comparsa>
            <header className="mt-4">
              <p className="text-sm font-bold text-accento dark:text-accento-chiara">
                Controllo pubblico
              </p>
              <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
                <JusticeScale01Icon
                  size={32}
                  aria-hidden="true"
                  className="shrink-0 text-accento dark:text-accento-chiara"
                />
                Provvedimenti dei giudici
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                Decisioni del Consiglio di Stato e dei Tribunali amministrativi: sono atti dei
                giudici, <strong>non sono leggi</strong>. Solo info brevi con scheda e file
                ufficiali.
              </p>
              <p
                className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia"
                role="status"
              >
                {totale} provvedimenti trovati su {tutte.length} caricati.
              </p>
            </header>
          </Comparsa>

          <TabsControllo attivo="ga" />

          <Comparsa delay={0.05}>
            <form
              method="get"
              action="/controllo/lista"
              className="mt-4 flex flex-col gap-3 sm:flex-row"
              role="search"
            >
              <input type="hidden" name="tipo" value="ga" />
              {giudice && <input type="hidden" name="giudice" value={giudice} />}
              <label htmlFor="cerca-ga" className="sr-only">
                Cerca per numero, oggetto o sezione
              </label>
              <input
                id="cerca-ga"
                name="q"
                type="search"
                defaultValue={q}
                maxLength={100}
                placeholder="Cerca per numero, oggetto o sezione…"
                className={campoRicerca}
              />
              <button type="submit" className={bottoneCerca}>
                <Search01Icon size={18} aria-hidden="true" />
                Cerca
              </button>
            </form>
          </Comparsa>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filtra per giudice">
            <Link
              href={
                q
                  ? `/controllo/lista?tipo=ga&q=${encodeURIComponent(q)}`
                  : "/controllo/lista?tipo=ga"
              }
              aria-current={!giudice ? "page" : undefined}
              className={`${tabBase} ${!giudice ? tabAttiva : tabNormale}`}
            >
              Tutti ({tutte.length})
            </Link>
            {conteggi.map((c) => {
              const attiva = giudice === c.nome;
              const sp = new URLSearchParams();
              sp.set("tipo", "ga");
              if (q) sp.set("q", q);
              sp.set("giudice", c.nome);
              return (
                <Link
                  key={c.nome}
                  href={`/controllo/lista?${sp.toString()}`}
                  aria-current={attiva ? "page" : undefined}
                  className={`${tabBase} ${attiva ? tabAttiva : tabNormale}`}
                >
                  {c.nome === "cds"
                    ? "Consiglio di Stato"
                    : c.nome === "tar"
                      ? "TAR"
                      : c.nome === "cga"
                        ? "CGA Sicilia"
                        : c.nome}{" "}
                  ({c.componenti})
                </Link>
              );
            })}
          </div>

          {items.length === 0 ? (
            <StatoVuoto
              id="nessun-provvedimento"
              titolo={tutte.length === 0 ? "Dati in preparazione" : "Nessun risultato qui"}
              testo={
                tutte.length === 0
                  ? "Il file dei provvedimenti non è ancora pronto. Torna tra poco, qui non trovi numeri inventati."
                  : "Nessun provvedimento con questi filtri. Prova a togliere un filtro o a cercare un altro numero."
              }
              href="/controllo/lista?tipo=ga"
              cta="Vedi tutti i provvedimenti"
            />
          ) : (
            <ol className="mt-6 grid gap-4">
              {items.map((p) => (
                <li
                  key={p.schedaUrl || `${p.giudice}-${p.numero ?? ""}-${p.anno ?? ""}`}
                  className={cardLista}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <BadgeNonLegge testo="Non è una legge" />
                    <span className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
                      {p.giudice === "cds"
                        ? "Consiglio di Stato"
                        : p.giudice === "cga"
                          ? "CGA Sicilia"
                          : "TAR"}
                      {p.sezione ? `, ${p.sezione}` : ""},{" "}
                      {p.data ? dataIT(p.data) : "data non indicata"}
                    </span>
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-inchiostro dark:text-nebbia">
                    {p.numero && p.anno
                      ? `${p.giudice === "cds" ? "Consiglio di Stato" : p.giudice === "cga" ? "CGA Sicilia" : "TAR"} n. ${p.numero} del ${p.anno}`
                      : `${p.giudice === "cds" ? "Consiglio di Stato" : p.giudice === "cga" ? "CGA Sicilia" : "TAR"}${p.sezione ? `, ${p.sezione}` : ""}`}
                  </h2>
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                    {p.oggetto}
                  </p>
                  <p className="mt-1 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                    {p.ecli ? `${p.ecli}, ` : ""}solo info brevi, il testo intero è sul sito
                    ufficiale.
                  </p>
                  <p className="mt-3 flex flex-wrap gap-3 text-sm">
                    <a
                      href={p.schedaUrl}
                      target="_blank"
                      rel="noopener"
                      className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
                    >
                      Scheda ufficiale
                    </a>
                    {p.pdfUrl && (
                      <a
                        href={p.pdfUrl}
                        target="_blank"
                        rel="noopener"
                        className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
                      >
                        File ufficiale
                      </a>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )}

          {pagine > 1 && (
            <nav aria-label="Pagine" className="mt-6 flex flex-wrap items-center gap-2">
              {paginaCorrente > 1 && (
                <Link href={linkPagina(paginaCorrente - 1)} className={`${tabBase} ${tabNormale}`}>
                  <ArrowLeft01Icon size={18} aria-hidden="true" />
                  Indietro
                </Link>
              )}
              <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
                Pagina {paginaCorrente} di {pagine}
              </span>
              {paginaCorrente < pagine && (
                <Link href={linkPagina(paginaCorrente + 1)} className={`${tabBase} ${tabNormale}`}>
                  Avanti
                  <ArrowRight01Icon size={18} aria-hidden="true" />
                </Link>
              )}
            </nav>
          )}

          <section
            aria-labelledby="fonti-ga"
            className="mt-6 rounded-2xl border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6"
          >
            <h2 id="fonti-ga" className="text-lg font-bold text-inchiostro dark:text-nebbia">
              Fonte e licenza
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Fonte: {provenance.fonte ?? "Giustizia Amministrativa"}, licenza{" "}
              {provenance.licenza ?? "da confermare nel file"}
              {provenance.recuperatoIl
                ? `, dati aggiornati al ${dataIT(provenance.recuperatoIl)}`
                : ""}
              . {DISCLAIMER_CONTROLLO}
            </p>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  if (tipo === "cnel") {
    const [tutte, provenance] = await Promise.all([tuttiDocumentiCnel(), leggiProvenanceCnel()]);
    const filtrati = cercaDocumentiCnel(tutte, q);
    const totale = filtrati.length;
    const items = paginaOversight(filtrati, page, per);
    const pagine = Math.max(1, Math.ceil(totale / per));
    const paginaCorrente = Math.min(page, pagine);

    return (
      <>
        <Header />
        <main
          id="contenuto"
          className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
        >
          <nav
            aria-label="Percorso"
            className="text-xs text-inchiostro-faint dark:text-nebbia-faint"
          >
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="hover:text-accento dark:hover:text-accento-chiara">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href="/controllo"
                  className="hover:text-accento dark:hover:text-accento-chiara"
                >
                  Controllo pubblico
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
                Documenti CNEL
              </li>
            </ol>
          </nav>

          <Comparsa>
            <header className="mt-4">
              <p className="text-sm font-bold text-accento dark:text-accento-chiara">
                Controllo pubblico
              </p>
              <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
                <DocumentValidationIcon
                  size={32}
                  aria-hidden="true"
                  className="shrink-0 text-accento dark:text-accento-chiara"
                />
                Documenti CNEL
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                Note e proposte del Consiglio Nazionale dell&apos;Economia e del Lavoro: sono
                pareri, <strong>non sono leggi</strong>. Solo info brevi con link ufficiali.
              </p>
              <p
                className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia"
                role="status"
              >
                {totale} documenti trovati su {tutte.length} caricati.
              </p>
            </header>
          </Comparsa>

          <TabsControllo attivo="cnel" />

          <Comparsa delay={0.05}>
            <form
              method="get"
              action="/controllo/lista"
              className="mt-4 flex flex-col gap-3 sm:flex-row"
              role="search"
            >
              <input type="hidden" name="tipo" value="cnel" />
              <label htmlFor="cerca-cnel" className="sr-only">
                Cerca tra i documenti CNEL
              </label>
              <input
                id="cerca-cnel"
                name="q"
                type="search"
                defaultValue={q}
                maxLength={100}
                placeholder="Cerca per titolo o tipo…"
                className={campoRicerca}
              />
              <button type="submit" className={bottoneCerca}>
                <Search01Icon size={18} aria-hidden="true" />
                Cerca
              </button>
            </form>
          </Comparsa>

          {items.length === 0 ? (
            <StatoVuoto
              id="nessun-cnel"
              titolo={tutte.length === 0 ? "Dati in preparazione" : "Nessun risultato qui"}
              testo={
                tutte.length === 0
                  ? "Il file dei documenti non è ancora pronto. Torna tra poco, qui non trovi numeri inventati."
                  : "Nessun documento con questi filtri. Prova a togliere il filtro o a cercare un’altra parola."
              }
              href="/controllo/lista?tipo=cnel"
              cta="Vedi tutti i documenti"
            />
          ) : (
            <ol className="mt-6 grid gap-4">
              {items.map((d) => (
                <li key={d.id} className={cardLista}>
                  <div className="flex flex-wrap items-center gap-2">
                    <BadgeNonLegge testo="Non è una legge, è un parere" />
                    <span className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
                      CNEL{d.tipo ? `, ${d.tipo}` : ""},{" "}
                      {d.data ? dataIT(d.data) : "data non indicata"}
                    </span>
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-inchiostro dark:text-nebbia">
                    {d.titolo}
                  </h2>
                  <p className="mt-3">
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener"
                      className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
                    >
                      Scheda ufficiale
                    </a>
                  </p>
                </li>
              ))}
            </ol>
          )}

          {pagine > 1 && (
            <nav aria-label="Pagine" className="mt-6 flex flex-wrap items-center gap-2">
              {paginaCorrente > 1 && (
                <Link href={linkPagina(paginaCorrente - 1)} className={`${tabBase} ${tabNormale}`}>
                  <ArrowLeft01Icon size={18} aria-hidden="true" />
                  Indietro
                </Link>
              )}
              <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
                Pagina {paginaCorrente} di {pagine}
              </span>
              {paginaCorrente < pagine && (
                <Link href={linkPagina(paginaCorrente + 1)} className={`${tabBase} ${tabNormale}`}>
                  Avanti
                  <ArrowRight01Icon size={18} aria-hidden="true" />
                </Link>
              )}
            </nav>
          )}

          <section
            aria-labelledby="fonti-cnel"
            className="mt-6 rounded-2xl border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6"
          >
            <h2 id="fonti-cnel" className="text-lg font-bold text-inchiostro dark:text-nebbia">
              Fonte e licenza
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Fonte: {provenance.fonte ?? "CNEL"}, licenza{" "}
              {provenance.licenza ?? "da confermare nel file"}
              {provenance.recuperatoIl
                ? `, dati aggiornati al ${dataIT(provenance.recuperatoIl)}`
                : ""}
              . {DISCLAIMER_CONTROLLO}
            </p>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const [tutte, provenance] = await Promise.all([tuttiContratti(), leggiProvenanceAnac()]);
  const base = filtraPerEnte(tutte, ente);
  const filtrati = cercaContratti(base, q);
  const totale = filtrati.length;
  const items = paginaOversight(filtrati, page, per);
  const pagine = Math.max(1, Math.ceil(totale / per));
  const paginaCorrente = Math.min(page, pagine);

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
            <li>
              <Link href="/controllo" className="hover:text-accento dark:hover:text-accento-chiara">
                Controllo pubblico
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-medium text-inchiostro dark:text-nebbia">
              Contratti
            </li>
          </ol>
        </nav>

        <Comparsa>
          <header className="mt-4">
            <p className="text-sm font-bold text-accento dark:text-accento-chiara">
              Controllo pubblico
            </p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
              <FileSearchIcon
                size={32}
                aria-hidden="true"
                className="shrink-0 text-accento dark:text-accento-chiara"
              />
              Contratti ANAC 2025
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Appalti con codice CIG, chi compra e importo dai dati aperti ANAC e BDNCP. Sono
              contratti pubblici: <strong>non sono leggi</strong> e gli importi sono valori visti
              nei dati, non spesa certa.
            </p>
            <p
              className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia"
              role="status"
            >
              {totale} contratti trovati su {tutte.length} caricati.
            </p>
          </header>
        </Comparsa>

        <TabsControllo attivo="contratti" />

        <Comparsa delay={0.05}>
          <form
            method="get"
            action="/controllo/lista"
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            role="search"
          >
            <input type="hidden" name="tipo" value="contratti" />
            <label htmlFor="cerca-contratti" className="sr-only">
              Cerca per CIG, oggetto, ente o fornitore
            </label>
            <input
              id="cerca-contratti"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={100}
              placeholder="Cerca per CIG, oggetto, ente o fornitore…"
              className={campoRicerca}
            />
            <label htmlFor="filtro-ente" className="sr-only">
              Filtra per stazione appaltante
            </label>
            <input
              id="filtro-ente"
              name="ente"
              type="search"
              defaultValue={ente}
              maxLength={100}
              placeholder="Stazione appaltante…"
              className={campoRicerca}
            />
            <button type="submit" className={bottoneCerca}>
              <Search01Icon size={18} aria-hidden="true" />
              Cerca
            </button>
          </form>
        </Comparsa>

        {items.length === 0 ? (
          <StatoVuoto
            id="nessun-contratto"
            titolo={tutte.length === 0 ? "Dati in preparazione" : "Nessun risultato qui"}
            testo={
              tutte.length === 0
                ? "Il file dei contratti non è ancora pronto. Torna tra poco, qui non trovi numeri inventati."
                : "Nessun contratto con questi filtri. Prova a togliere un filtro o a cercare un altro codice CIG."
            }
            href="/controllo/lista?tipo=contratti"
            cta="Vedi tutti i contratti"
          />
        ) : (
          <ol className="mt-6 grid gap-4">
            {items.map((c) => (
              <li key={c.ocid || c.cig || c.oggetto} className={cardLista}>
                <div className="flex flex-wrap items-center gap-2">
                  <BadgeNonLegge testo="Non è una legge, è un contratto" />
                  {c.cig && (
                    <span className="text-xs text-inchiostro-faint dark:text-nebbia-faint">
                      CIG {c.cig}
                    </span>
                  )}
                </div>
                <h2 className="mt-3 text-xl font-bold text-inchiostro dark:text-nebbia">
                  {c.stazioneAppaltante.denominazione}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                  {c.oggetto}
                </p>
                <p className="mt-1 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                  {importoIT(c.importo, c.valuta)}
                  {c.dataAward ? `, assegnato il ${dataIT(c.dataAward)}` : ""}
                  {c.fornitore ? `, fornitore: ${c.fornitore}` : ""}
                </p>
                {(c.schedaBDNCP || c.risorsaBulk) && (
                  <p className="mt-3 flex flex-wrap gap-3 text-sm">
                    {c.schedaBDNCP && (
                      <a
                        href={c.schedaBDNCP}
                        target="_blank"
                        rel="noopener"
                        className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
                      >
                        Scheda BDNCP
                      </a>
                    )}
                    {c.risorsaBulk && (
                      <a
                        href={c.risorsaBulk}
                        target="_blank"
                        rel="noopener"
                        className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
                      >
                        Risorsa bulk
                      </a>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}

        {pagine > 1 && (
          <nav aria-label="Pagine" className="mt-6 flex flex-wrap items-center gap-2">
            {paginaCorrente > 1 && (
              <Link href={linkPagina(paginaCorrente - 1)} className={`${tabBase} ${tabNormale}`}>
                <ArrowLeft01Icon size={18} aria-hidden="true" />
                Indietro
              </Link>
            )}
            <span className="text-sm text-inchiostro-soft dark:text-nebbia-soft" role="status">
              Pagina {paginaCorrente} di {pagine}
            </span>
            {paginaCorrente < pagine && (
              <Link href={linkPagina(paginaCorrente + 1)} className={`${tabBase} ${tabNormale}`}>
                Avanti
                <ArrowRight01Icon size={18} aria-hidden="true" />
              </Link>
            )}
          </nav>
        )}

        <section
          aria-labelledby="fonti-contratti"
          className="mt-6 rounded-2xl border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft sm:p-6"
        >
          <h2 id="fonti-contratti" className="text-lg font-bold text-inchiostro dark:text-nebbia">
            Fonte e licenza
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
            Fonte: {provenance.fonte ?? "ANAC e BDNCP"}, licenza{" "}
            {provenance.licenza ?? "da confermare nel file"}
            {provenance.recuperatoIl
              ? `, dati aggiornati al ${dataIT(provenance.recuperatoIl)}`
              : ""}
            . {DISCLAIMER_CONTROLLO}
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
