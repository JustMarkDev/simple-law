import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Contatore from "@/components/Contatore";
import Comparsa from "@/components/Comparsa";
import GraficoBarre, { type BarraGrafico, type SerieGrafico } from "@/components/GraficoBarre";
import {
  AlertCircleIcon,
  ArrowRight01Icon,
  Download01Icon,
  JusticeScale01Icon,
} from "hugeicons-react";
import { getStats } from "@/lib/db";
import { ECONOMIA_AGGIORNATO_AL, ECONOMIA_SNAPSHOT } from "@/lib/stats";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Statistiche del corpus - Stato della Repubblica",
  description:
    "Le leggi in numeri: per anno e per tipo, quanto si capiscono, decreti pronti e qualità. Con i numeri principali di soldi e prezzi.",
};

const COLORE_INK = "var(--chart-1)";
const COLORE_VERDE = "var(--chart-2)";
const COLORE_ROSSO = "var(--chart-3)";
const COLORE_NEUTRO = "var(--chart-neutral)";

/** Ultimi anni mostrati nel grafico: resta leggibile anche con 200mila atti. */
const MAX_ANNI_GRAFICO = 20;
/** Tipi di atto mostrati: solo i più frequenti. */
const MAX_TIPI_GRAFICO = 10;

const EFFETTI_LABEL: Record<string, string> = {
  presente: "C’è",
  semplificata: "C’è in breve",
  esente: "Non serve",
  assente: "Manca",
  nonNoto: "Non trovata",
};

const TIPI_LABEL: Record<string, string> = {
  "decreto.legge": "Decreto-legge",
  "decreto.legislativo": "Decreto legislativo",
  "decreto.presidente.repubblica": "Decreto del Presidente della Repubblica",
  "decreto.presidente.consiglio": "DPCM",
  legge: "Legge",
  "legge.costituzionale": "Legge costituzionale",
  regolamento: "Regolamento",
};

/** Etichetta leggibile per il tipo di atto grezzo (es. `decreto.legge` → Decreto-legge). */
function etichettaTipo(tipo: string): string {
  const chiave = tipo.trim().toLowerCase();
  if (TIPI_LABEL[chiave]) return TIPI_LABEL[chiave];
  const parole = chiave.replace(/[._]/g, " ").trim();
  return parole ? parole.charAt(0).toUpperCase() + parole.slice(1) : "Norma";
}

function intero(value: number): string {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

function percentuale(parte: number, totale: number): string {
  if (!Number.isFinite(parte) || !Number.isFinite(totale) || totale <= 0) return "0%";
  return `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format((parte / totale) * 100)}%`;
}

function decimale(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

const RISORSE = [
  { label: "ISTAT", url: "https://www.istat.it/" },
  { label: "MEF - Finanza pubblica", url: "https://www.mef.gov.it/finanza-pubblica/" },
  { label: "Banca d’Italia", url: "https://www.bancaditalia.it/" },
  { label: "ISTAT Esplora dati", url: "https://esploradati.istat.it/" },
];

/**
 * Le leggi in numeri.
 *
 * Legge solo aggregati (`getStats`: conteggi e medie dal database, mai testi
 * integrali né elenchi completi), così resta veloce anche con un corpus molto
 * grande. I grafici mostrano al massimo gli ultimi 20 anni e i 10 tipi più
 * frequenti; ogni voce rimanda all’archivio filtrato. Non lancia mai: in caso
 * di errore mostra uno stato semplice con una sola uscita.
 */
export default async function StatistichePage() {
  let stats: Awaited<ReturnType<typeof getStats>> | null = null;
  try {
    stats = await getStats();
  } catch {
    stats = null;
  }

  if (!stats || stats.totale <= 0) {
    return (
      <>
        <Header />
        <main
          id="contenuto"
          className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
        >
          <Comparsa>
            <header>
              <p className="text-sm font-bold text-accento dark:text-accento-chiara">Dati aperti</p>
              <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
                <JusticeScale01Icon
                  size={32}
                  aria-hidden="true"
                  className="shrink-0 text-accento dark:text-accento-chiara"
                />
                Le leggi in numeri
              </h1>
            </header>
          </Comparsa>
          <section
            aria-labelledby="stato-vuoto"
            className="mt-8 rounded-2xl border border-dashed border-regola bg-carta p-8 text-center dark:border-notte-deep dark:bg-notte-soft"
          >
            <h2
              id="stato-vuoto"
              className="flex items-center justify-center gap-2 text-lg font-bold text-inchiostro dark:text-nebbia"
            >
              <AlertCircleIcon size={22} aria-hidden="true" className="shrink-0" />
              Non ho numeri da mostrare adesso
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Riprova tra poco, oppure cerca direttamente tra le leggi.
            </p>
            <p className="mt-6">
              <Link href="/leggi" className="btn-primario">
                Cerca tra le leggi
                <ArrowRight01Icon size={18} aria-hidden="true" />
              </Link>
            </p>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const totale = stats.totale;
  const attuativi = stats.attuativiTotali;
  const attuativiMancanti = attuativi.daAdottare + attuativi.scaduti;
  const effettiDetti =
    (stats.airDistribuzione.presente ?? 0) + (stats.airDistribuzione.semplificata ?? 0);

  const vociAnno = Object.entries(stats.perAnno)
    .filter(([anno]) => /^\d{4}$/.test(anno))
    .sort(([a], [b]) => a.localeCompare(b));
  const senzaAnno = stats.perAnno["n.d."] ?? 0;
  const ultimiAnni = vociAnno.slice(-MAX_ANNI_GRAFICO);

  const vociTipo = Object.entries(stats.perTipo).sort(([, a], [, b]) => b - a);
  const topTipi = vociTipo.slice(0, MAX_TIPI_GRAFICO);
  const altriTipi = vociTipo.length - topTipi.length;

  const serieNorme: SerieGrafico[] = [{ chiave: "valore", etichetta: "Leggi", colore: COLORE_INK }];
  const serieAttuativi: SerieGrafico[] = [
    { chiave: "adottati", etichetta: "Pronti", colore: COLORE_VERDE },
    { chiave: "daAdottare", etichetta: "In attesa", colore: COLORE_NEUTRO },
    { chiave: "scaduti", etichetta: "In ritardo", colore: COLORE_ROSSO },
  ];

  const barreAnno: BarraGrafico[] = ultimiAnni.map(([anno, valore]) => ({
    etichetta: anno,
    valori: { valore },
  }));

  const barreTipo: BarraGrafico[] = topTipi.map(([tipo, valore]) => ({
    etichetta: etichettaTipo(tipo),
    valori: { valore },
  }));

  const ordineEffetti = ["presente", "semplificata", "esente", "assente", "nonNoto"];
  const coloriEffetti: Record<string, string> = {
    presente: COLORE_VERDE,
    semplificata: COLORE_INK,
    esente: COLORE_NEUTRO,
    assente: COLORE_ROSSO,
    nonNoto: COLORE_NEUTRO,
  };
  const barreEffetti: BarraGrafico[] = ordineEffetti.map((chiave) => ({
    etichetta: EFFETTI_LABEL[chiave] ?? chiave,
    valori: { valore: stats.airDistribuzione[chiave] ?? 0 },
    colore: coloriEffetti[chiave],
  }));

  const barreAttuativi: BarraGrafico[] = [
    {
      etichetta: "Decreti attesi",
      valori: {
        adottati: attuativi.adottati,
        daAdottare: attuativi.daAdottare,
        scaduti: attuativi.scaduti,
      },
    },
  ];

  const schede = [
    { etichetta: "Leggi qui dentro", valore: totale, nota: null as string | null },
    { etichetta: "Decreti pronti", valore: attuativi.adottati, nota: "Già pronti" },
    { etichetta: "Decreti in attesa", valore: attuativi.daAdottare, nota: "In attesa" },
    { etichetta: "Decreti in ritardo", valore: attuativi.scaduti, nota: "In ritardo" },
    {
      etichetta: "Decreti che mancano",
      valore: attuativiMancanti,
      nota: `${percentuale(attuativiMancanti, attuativi.totale)} di quelli attesi`,
    },
    {
      etichetta: "Dicono cosa cambia",
      valore: effettiDetti,
      nota: `${percentuale(effettiDetti, totale)} di tutte le leggi`,
    },
  ];

  return (
    <>
      <Header />
      <main
        id="contenuto"
        className="mx-auto w-full max-w-editoriale px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
      >
        <Comparsa>
          <header>
            <p className="text-sm font-bold text-accento dark:text-accento-chiara">Dati aperti</p>
            <h1 className="mt-2 flex items-center gap-3 text-3xl font-bold text-inchiostro dark:text-nebbia sm:text-4xl">
              <JusticeScale01Icon
                size={32}
                aria-hidden="true"
                className="shrink-0 text-accento dark:text-accento-chiara"
              />
              Le leggi in numeri
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Quante sono, se funzionano già e quanto si capiscono. Dati aggiornati ogni ora.
            </p>
            <p className="mt-4">
              <Link href="/leggi" className="btn-primario">
                Cerca tra le leggi
                <ArrowRight01Icon size={18} aria-hidden="true" />
              </Link>
            </p>
          </header>
        </Comparsa>

        <section aria-labelledby="numeri-chiave" className="mt-8 scroll-mt-24">
          <h2 id="numeri-chiave" className="text-xl font-bold text-inchiostro dark:text-nebbia">
            I numeri grandi
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {schede.map((scheda, i) => (
              <Comparsa key={scheda.etichetta} delay={Math.min(i * 0.05, 0.2)}>
                <div className="rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
                  <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">
                    {scheda.etichetta}
                  </dt>
                  <dd className="mt-1 text-4xl font-bold tabular-nums text-inchiostro dark:text-nebbia">
                    <Contatore value={scheda.valore} decimals={0} suffix="" />
                  </dd>
                  {scheda.nota && (
                    <dd className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                      {scheda.nota}
                    </dd>
                  )}
                </div>
              </Comparsa>
            ))}
            <Comparsa delay={0.2}>
              <div className="rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
                <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">
                  Parole facili
                </dt>
                <dd className="mt-1 text-4xl font-bold tabular-nums text-inchiostro dark:text-nebbia">
                  {stats.gulpeaseMedio === null ? (
                    <span className="text-lg font-normal">Non ancora</span>
                  ) : (
                    <Contatore value={stats.gulpeaseMedio} decimals={0} suffix="/100" />
                  )}
                </dd>
                <dd className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                  {stats.gulpeaseMedio === null
                    ? "Non ho testi da leggere"
                    : stats.gulpeaseMedio >= 60
                      ? "Si capiscono bene"
                      : stats.gulpeaseMedio >= 40
                        ? "Così così"
                        : "Difficili da capire"}
                </dd>
              </div>
            </Comparsa>
            <Comparsa delay={0.25}>
              <div className="rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
                <dt className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">
                  Qualità media
                </dt>
                <dd className="mt-1 text-4xl font-bold tabular-nums text-inchiostro dark:text-nebbia">
                  {stats.qualitaMedia === null ? (
                    <span className="text-lg font-normal">Non ancora</span>
                  ) : (
                    <Contatore value={stats.qualitaMedia} decimals={0} suffix="/100" />
                  )}
                </dd>
                <dd className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                  Un voto da 0 a 100 su come sono fatte
                </dd>
              </div>
            </Comparsa>
          </dl>
          <p className="mt-3 text-sm text-inchiostro-soft dark:text-nebbia-soft">
            <Link
              href="/leggi?scaduti=1"
              className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
            >
              Vedi le leggi ferme da tempo
            </Link>
            {" · "}
            {intero(totale)} {totale === 1 ? "legge qui dentro" : "leggi qui dentro"}
            {senzaAnno > 0 && `, ${intero(senzaAnno)} senza anno`}.
          </p>
        </section>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Comparsa>
            <section
              aria-labelledby="chart-anno"
              className="scroll-mt-24 rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
              style={{ contentVisibility: "auto", containIntrinsicSize: "auto 420px" }}
            >
              <h2 id="chart-anno" className="text-lg font-bold text-inchiostro dark:text-nebbia">
                Leggi per anno
              </h2>
              <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                Ultimi {ultimiAnni.length} anni su {intero(vociAnno.length)} presenti qui.
              </p>
              <GraficoBarre
                className="mt-4"
                barre={barreAnno}
                serie={serieNorme}
                ariaLabel="Quante leggi per anno, ultimi anni"
                unita=""
              />
              <details className="mt-4">
                <summary className="inline-flex min-h-[48px] cursor-pointer items-center text-sm font-semibold text-accento dark:text-accento-chiara">
                  Vedi per anno
                </summary>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {ultimiAnni.map(([anno, valore]) => (
                    <li key={anno}>
                      <Link
                        href={`/leggi?anno=${encodeURIComponent(anno)}`}
                        aria-label={`Vedi le ${intero(valore)} leggi del ${anno}`}
                        className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center gap-1.5 rounded-xl border border-regola px-3 text-sm font-medium tabular-nums text-inchiostro hover:border-accento hover:text-accento dark:border-notte-deep dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
                      >
                        {anno}
                        <span className="rounded-lg bg-inchiostro/5 px-1.5 py-0.5 text-xs tabular-nums dark:bg-notte-deep">
                          {intero(valore)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          </Comparsa>

          <Comparsa delay={0.06}>
            <section
              aria-labelledby="chart-tipo"
              className="scroll-mt-24 rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
              style={{ contentVisibility: "auto", containIntrinsicSize: "auto 420px" }}
            >
              <h2 id="chart-tipo" className="text-lg font-bold text-inchiostro dark:text-nebbia">
                Leggi per tipo
              </h2>
              <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                I {topTipi.length} tipi più frequenti
                {altriTipi > 0 && `; altri ${intero(altriTipi)} tipi li trovi in archivio`}.
              </p>
              <GraficoBarre
                className="mt-4"
                barre={barreTipo}
                serie={serieNorme}
                orientamento="orizzontale"
                ariaLabel="Quante leggi per tipo, tipi più frequenti"
              />
              <details className="mt-4">
                <summary className="inline-flex min-h-[48px] cursor-pointer items-center text-sm font-semibold text-accento dark:text-accento-chiara">
                  Vedi per tipo
                </summary>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {topTipi.map(([tipo, valore]) => (
                    <li key={tipo}>
                      <Link
                        href={`/leggi?tipo=${encodeURIComponent(tipo)}`}
                        aria-label={`Vedi le ${intero(valore)} leggi di tipo ${etichettaTipo(tipo)}`}
                        className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border border-regola px-3 text-sm font-medium text-inchiostro hover:border-accento hover:text-accento dark:border-notte-deep dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
                      >
                        {etichettaTipo(tipo)}
                        <span className="rounded-lg bg-inchiostro/5 px-1.5 py-0.5 text-xs tabular-nums dark:bg-notte-deep">
                          {intero(valore)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          </Comparsa>

          <Comparsa>
            <section
              aria-labelledby="chart-attuativi"
              className="scroll-mt-24 rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
              style={{ contentVisibility: "auto", containIntrinsicSize: "auto 420px" }}
            >
              <h2
                id="chart-attuativi"
                className="text-lg font-bold text-inchiostro dark:text-nebbia"
              >
                Decreti: a che punto sono
              </h2>
              <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                {intero(attuativi.adottati)} pronti, {intero(attuativi.daAdottare)} in attesa,{" "}
                {intero(attuativi.scaduti)} in ritardo su {intero(attuativi.totale)} attesi.
              </p>
              <GraficoBarre
                className="mt-4"
                barre={barreAttuativi}
                serie={serieAttuativi}
                ariaLabel="Decreti attesi: pronti, in attesa e in ritardo"
              />
              <p className="mt-4 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
                Mancano ancora {intero(attuativiMancanti)} decreti (
                {percentuale(attuativiMancanti, attuativi.totale)} di quelli attesi).{" "}
                <Link
                  href="/leggi?scaduti=1"
                  className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
                >
                  Vedi le leggi ferme da tempo
                </Link>
                .
              </p>
            </section>
          </Comparsa>

          <Comparsa delay={0.06}>
            <section
              aria-labelledby="chart-effetti"
              className="scroll-mt-24 rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
              style={{ contentVisibility: "auto", containIntrinsicSize: "auto 420px" }}
            >
              <h2 id="chart-effetti" className="text-lg font-bold text-inchiostro dark:text-nebbia">
                Dicono cosa cambia?
              </h2>
              <p className="mt-1 text-xs text-inchiostro-faint dark:text-nebbia-faint">
                {intero(effettiDetti)} leggi su {intero(totale)} spiegano prima cosa cambierà (
                {percentuale(effettiDetti, totale)}).
              </p>
              <GraficoBarre
                className="mt-4"
                barre={barreEffetti}
                serie={serieNorme}
                orientamento="orizzontale"
                ariaLabel="Quante leggi spiegano prima cosa cambierà"
              />
            </section>
          </Comparsa>
        </div>

        <Comparsa>
          <section
            aria-labelledby="esporta"
            className="mt-10 scroll-mt-24 rounded-2xl border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft"
          >
            <h2 id="esporta" className="text-lg font-bold text-inchiostro dark:text-nebbia">
              Scarica i dati
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              Scarica la lista in un file aperto. Solo i dati essenziali, niente testi interi.
            </p>
            <p className="mt-4 flex flex-wrap gap-3">
              <a href="/api/export?formato=csv" className="btn-primario">
                <Download01Icon size={18} aria-hidden="true" />
                Scarica CSV
              </a>
              <a
                href="/api/export?formato=json"
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-regola bg-carta px-6 font-semibold text-inchiostro hover:border-accento hover:text-accento dark:border-notte-deep dark:bg-notte dark:text-nebbia dark:hover:border-accento-chiara dark:hover:text-accento-chiara"
              >
                <Download01Icon size={18} aria-hidden="true" />
                Scarica JSON
              </a>
            </p>
          </section>
        </Comparsa>

        <section aria-labelledby="quadro-economico" className="mt-14 scroll-mt-24">
          <div className="pb-4">
            <h2
              id="quadro-economico"
              className="text-2xl font-bold text-inchiostro dark:text-nebbia"
            >
              Come va l’economia
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              I numeri principali di soldi e prezzi, con il periodo a cui si riferiscono. Sono una
              foto ferma, non dal vivo: per le novità segui i link qui sotto. Aggiornato al{" "}
              {ECONOMIA_AGGIORNATO_AL}.
            </p>
          </div>

          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ECONOMIA_SNAPSHOT.map((indicatore, i) => (
              <li key={indicatore.indicatore} className="flex">
                <Comparsa delay={Math.min(i * 0.05, 0.15)} className="flex w-full">
                  <article className="flex w-full flex-col rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft">
                    <p className="text-xs font-medium text-inchiostro-faint dark:text-nebbia-faint">
                      Periodo: {indicatore.periodo}
                    </p>
                    <h3 className="mt-2 text-sm font-semibold text-inchiostro dark:text-nebbia">
                      {indicatore.indicatore}
                    </h3>
                    <p className="mt-3 text-3xl font-bold tabular-nums text-inchiostro dark:text-nebbia">
                      <Contatore value={indicatore.valore} decimals={1} />
                      <span className="ml-1 text-base font-normal">
                        {indicatore.unita === "percentuale" ? "%" : indicatore.unita}
                      </span>
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-inchiostro-faint dark:text-nebbia-faint">
                      {indicatore.nota}
                    </p>
                    <p className="mt-auto pt-4 text-xs text-inchiostro-soft dark:text-nebbia-soft">
                      Fonte: {indicatore.fonte}
                    </p>
                  </article>
                </Comparsa>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-2xl border border-regola bg-carta-soft p-5 dark:border-notte-deep dark:bg-notte-soft">
            <h3 className="text-sm font-semibold text-inchiostro dark:text-nebbia">
              Siti ufficiali
            </h3>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {RISORSE.map((risorsa) => (
                <li key={risorsa.url} className="flex min-h-[48px] items-center">
                  <a
                    href={risorsa.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accento underline underline-offset-2 hover:text-inchiostro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inchiostro dark:text-accento-chiara dark:hover:text-nebbia dark:focus-visible:outline-nebbia"
                  >
                    {risorsa.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Comparsa>
          <section
            aria-labelledby="metodo-limiti"
            className="mt-10 scroll-mt-24 rounded-2xl border border-regola bg-carta p-5 dark:border-notte-deep dark:bg-notte-soft"
          >
            <h2 id="metodo-limiti" className="text-lg font-bold text-inchiostro dark:text-nebbia">
              Come li contiamo
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-inchiostro-soft dark:text-nebbia-soft">
              <li>
                Conti e medie dal database, aggiornati ogni ora: questa pagina non scarica mai
                tutto.
              </li>
              <li>
                I grafici mostrano gli ultimi {MAX_ANNI_GRAFICO} anni e i {MAX_TIPI_GRAFICO} tipi
                più frequenti; il resto lo apri con i filtri qui sopra.
              </li>
              <li>
                Le parole facili sono un voto da 0 a 100
                {stats.gulpeaseMedio !== null && ` (oggi: ${decimale(stats.gulpeaseMedio)} su 100)`}
                : sopra 60 si capisce bene, tra 40 e 60 così così, sotto 40 è difficile.
              </li>
              <li>
                Alcune schede usano dati di esempio; i soldi e i prezzi sono una foto ferma, non dal
                vivo.
              </li>
            </ul>
            <p className="mt-4 text-sm text-inchiostro-soft dark:text-nebbia-soft">
              Vuoi sapere di più? Leggi la{" "}
              <Link
                href="/metodologia"
                className="font-semibold text-accento underline underline-offset-2 dark:text-accento-chiara"
              >
                metodologia
              </Link>
              .
            </p>
          </section>
        </Comparsa>
      </main>
      <Footer />
    </>
  );
}
