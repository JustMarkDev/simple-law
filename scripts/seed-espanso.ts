/**
 * Genera un corpus dimostrativo espanso (default ~240 atti, max 5000) in `data/seed-espanso.json`.
 *
 * Offline e deterministico (PRNG con seed fisso): nessun fetch, nessuna dipendenza.
 * Gli ELI/NIR sono unici e non collidono con i 5 atti seed (numeri riservati
 * 8, 36, 124, 133, 139). Ogni riga ha `dimostrativo: true` (il campo `source`
 * vive solo nel report di ingest, non per-riga).
 *
 * Uso:
 *   npm run db:seed:espanso            # genera data/seed-espanso.json
 *   npm run db:seed:espanso -- --apply # + upsert in DB (richiede DATABASE_URL)
 *
 * Il file generato e' il ponte verso il corpus Normattiva su scala (vedi
 * README "Piano 100 GB"): per i volumi reali usare `sync:storico` a chunk con
 * persist batchata, indici su (tipo, dataEmanazione) e paginazione server-side.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { buildFonti } from "../lib/fonti";
import type { LawRecord } from "../lib/seed-data";

const TOTALE_DEFAULT = 240;
const NUMERI_RISERVATI = new Set(["8", "36", "124", "133", "139"]);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIPI = ["decreto.legge", "legge", "decreto.legislativo"] as const;
const TEMI = [
  {
    slug: "energia",
    titolo: "efficienza energetica e riconversione industriale",
    sintesi:
      "Incentivi per la riconversione degli impianti e programmi straordinari per i siti produttivi strategici.",
  },
  {
    slug: "fisco",
    titolo: "semplificazione fiscale e concordato preventivo",
    sintesi:
      "Riduzione degli adempimenti, rateazioni e concordato preventivo per partite IVA e PMI.",
  },
  {
    slug: "lavoro",
    titolo: "contratti a termine e sicurezza sul lavoro",
    sintesi:
      "Nuove causali per i contratti a termine, incentivi alle assunzioni stabili e stretta sui subappalti irregolari.",
  },
  {
    slug: "digitale",
    titolo: "PA digitale e interoperabilità dei dati",
    sintesi:
      "Anagrafe unica, domicilio digitale e stop alle richieste di dati già in possesso della PA.",
  },
  {
    slug: "concorrenza",
    titolo: "concorrenza nei servizi locali e appalti",
    sintesi:
      "Gare trasparenti per i servizi locali, qualificazione delle stazioni appaltanti e tempi certi di pagamento.",
  },
  {
    slug: "sicurezza",
    titolo: "sicurezza urbana e protezione civile",
    sintesi:
      "Potenziamento dei presidi urbani, fondo per le emergenze e procedure rapide per la ricostruzione.",
  },
  {
    slug: "istruzione",
    titolo: "docenti e continuità didattica",
    sintesi:
      "Stabilizzazione dei precari storici, organico potenziato e fondi per laboratori e mense.",
  },
  {
    slug: "salute",
    titolo: "liste d'attesa e assistenza territoriale",
    sintesi: "Tetti ai tempi d'attesa, case di comunità e assunzione di personale sanitario.",
  },
] as const;

const AIR = ["presente", "esente", "semplificata", "assente"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function genera(totale: number): LawRecord[] {
  const rand = mulberry32(20260214);
  const leggi: LawRecord[] = [];
  const usati = new Set<string>();
  let i = 0;
  while (leggi.length < totale && i < totale * 20) {
    i += 1;
    const tipo = TIPI[Math.floor(rand() * TIPI.length)];
    const tema = TEMI[Math.floor(rand() * TEMI.length)];
    const anno = 2000 + Math.floor(rand() * 27);
    const numero = String(1 + Math.floor(rand() * 400));
    if (NUMERI_RISERVATI.has(numero)) continue;
    const mese = 1 + Math.floor(rand() * 12);
    const giorno = 1 + Math.floor(rand() * 28);
    const data = `${anno}-${pad2(mese)}-${pad2(giorno)}`;
    const seriale = String(10000 + Math.floor(rand() * 89999));
    const codice = `${String(anno).slice(2)}G${seriale}`;
    const eli = `/eli/id/${anno}/${pad2(mese)}/${pad2(giorno)}/${codice}/sg`;
    if (usati.has(eli)) continue;
    usati.add(eli);
    const nirTipo =
      tipo === "legge"
        ? "legge"
        : tipo === "decreto.legge"
          ? "decreto.legge"
          : "decreto.legislativo";
    const titolo = `Disposizioni in materia di ${tema.titolo} (${numero}/${anno})`;
    const sintesi = `${tema.sintesi} Atto dimostrativo generato offline per test di scala (${tema.slug}).`;
    leggi.push({
      eli,
      nir: `urn:nir:stato:${nirTipo}:${data};${numero}`,
      tipo,
      numero,
      dataEmanazione: data,
      titolo,
      sintesi,
      stato: "in_vigore",
      gulpease: null,
      fonti: buildFonti({
        tipo,
        numero,
        dataEmanazione: data,
        codiceRedazionale: codice,
        dataGU: data,
      }),
      codiceRedazionale: codice,
      dataGU: data,
      air: AIR[Math.floor(rand() * AIR.length)],
      attuativi: {
        daAdottare: Math.floor(rand() * 4),
        adottati: Math.floor(rand() * 3),
        scaduti: rand() < 0.12 ? 1 : 0,
      },
      fiducia: rand() < 0.08,
      omnibus: rand() < 0.15,
      testo: `${titolo}. ${sintesi} Le amministrazioni competenti adottano i decreti attuativi entro sessanta giorni.`,
      dimostrativo: true,
    });
  }
  return leggi.sort((a, b) => b.dataEmanazione.localeCompare(a.dataEmanazione));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const totaleArg = args.find((a) => a.startsWith("--totale="));
  const totale = totaleArg
    ? Math.min(5000, Math.max(1, Number(totaleArg.split("=")[1]) || TOTALE_DEFAULT))
    : TOTALE_DEFAULT;
  const apply = args.includes("--apply");
  const leggi = genera(totale);
  await mkdir("data", { recursive: true });
  await writeFile("data/seed-espanso.json", `${JSON.stringify(leggi, null, 2)}\n`, "utf8");
  console.log(`seed-espanso: ${leggi.length} atti -> data/seed-espanso.json (dimostrativo: true)`);

  if (apply) {
    const { persistLaws } = await import("../lib/db");
    const scritti = await persistLaws(leggi);
    console.log(`seed-espanso: upsert ${scritti}/${leggi.length} (richiede DATABASE_URL)`);
    if (!process.env.DATABASE_URL?.trim()) {
      console.log("seed-espanso: DATABASE_URL assente, nessuna scrittura (persist=0).");
    }
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
