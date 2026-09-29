/**
 * Normalizza gli stati di testata nei `data/reali/normattiva-*.json`.
 *
 * L'ingest storico marcava `in_vigore` atti il cui testo apre con header di
 * abrogazione/decadenza formale: la regex di ingest
 * (`^ART. 1 ((PROVVEDIMENTO ABROGATO`) non tollerava lo spazio dopo `((`
 * ne' "Articolo unico." interposto (es. L. 142/1990:
 * "Art. 1 (( PROVVEDIMENTO ABROGATO...").
 *
 * Regola (stessa guard di `normalizzaAttoReale` in `lib/sources.ts`):
 * - testo matcha /\(\(\s*PROVVEDIMENTO ABROGATO/ -> `abrogato`;
 * - testo matcha /\(\(\s*(PROVVEDIMENTO|DECRETO) DECADUT[OA]/ o
 *   /DECRETO DECADUTO/ -> `decaduto`;
 * - MAI toccare "ARTICOLO ABROGATO" singolo (resta `in_vigore`);
 * - solo upgrade quando lo stato sarebbe `in_vigore`: MAI retrocedere
 *   `abrogato`/`decaduto`/`sconosciuto`.
 *
 * Uso:
 *   npx tsx scripts/normalizza-stati-testata.ts [--check]
 *
 * Senza flag riscrive i JSON e stampa il report; con `--check` e' read-only
 * ed esce con codice 1 se restano atti con header ma `in_vigore`.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR_REALI = path.join(process.cwd(), "data", "reali");
const PREFISSO = "normattiva-";

const RE_ABROGATO = /\(\(\s*PROVVEDIMENTO ABROGATO/;
const RE_DECADUTO_TESTATA = /\(\(\s*(PROVVEDIMENTO|DECRETO) DECADUT[OA]/;
const RE_DECADUTO = /DECRETO DECADUTO/;

/** Esito della regola di testata per un testo + stato corrente. */
export function statoCorrettoTestata(
  testo: unknown,
  statoAttuale: unknown,
): "abrogato" | "decaduto" | null {
  try {
    if (String(statoAttuale ?? "").trim().toLowerCase() !== "in_vigore") return null;
    const maiusc = String(testo ?? "").toUpperCase();
    if (!maiusc) return null;
    if (RE_ABROGATO.test(maiusc)) return "abrogato";
    if (RE_DECADUTO_TESTATA.test(maiusc) || RE_DECADUTO.test(maiusc)) return "decaduto";
    return null;
  } catch {
    return null;
  }
}

function listaAtti(grezzo: unknown): { lista: unknown[]; chiave: "leggi" | "dati" | "atti" | null } {
  try {
    if (Array.isArray(grezzo)) return { lista: grezzo, chiave: null };
    if (grezzo && typeof grezzo === "object") {
      const o = grezzo as Record<string, unknown>;
      for (const k of ["leggi", "dati", "atti"] as const) {
        if (Array.isArray(o[k])) return { lista: o[k] as unknown[], chiave: k };
      }
    }
    return { lista: [], chiave: null };
  } catch {
    return { lista: [], chiave: null };
  }
}

interface Risultato {
  file: string;
  atti: number;
  abrogato: number;
  decaduto: number;
}

function elaboraFile(nome: string, check: boolean): Risultato {
  const vuoto: Risultato = { file: nome, atti: 0, abrogato: 0, decaduto: 0 };
  try {
    const ass = path.join(DIR_REALI, nome);
    const raw = readFileSync(ass, "utf8");
    const grezzo: unknown = JSON.parse(raw);
    const { lista, chiave } = listaAtti(grezzo);
    vuoto.atti = lista.length;
    let sporco = false;
    for (const item of lista) {
      try {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const o = item as Record<string, unknown>;
        const corretto = statoCorrettoTestata(o["testo"], o["stato"]);
        if (corretto) {
          if (corretto === "abrogato") vuoto.abrogato += 1;
          else vuoto.decaduto += 1;
          if (!check) {
            o["stato"] = corretto;
            sporco = true;
          }
        }
      } catch {
        continue;
      }
    }
    if (!check && sporco) {
      const daScrivere =
        chiave && grezzo && typeof grezzo === "object"
          ? grezzo
          : lista;
      writeFileSync(ass, `${JSON.stringify(daScrivere, null, 2)}\n`, "utf8");
    }
    return vuoto;
  } catch {
    return vuoto;
  }
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");
  let file: string[];
  try {
    file = readdirSync(DIR_REALI)
      .filter((n) => n.startsWith(PREFISSO) && n.endsWith(".json"))
      .sort();
  } catch {
    console.error(`Directory non leggibile: ${DIR_REALI}`);
    process.exitCode = 1;
    return;
  }
  const risultati = file.map((n) => elaboraFile(n, check));
  const totAbrogato = risultati.reduce((a, r) => a + r.abrogato, 0);
  const totDecaduto = risultati.reduce((a, r) => a + r.decaduto, 0);
  const totAtti = risultati.reduce((a, r) => a + r.atti, 0);
  const toccati = risultati.filter((r) => r.abrogato + r.decaduto > 0);
  console.log(
    `normalizza-stati-testata: ${totAtti} atti in ${file.length} file, ` +
      `correzioni: ${totAbrogato} -> abrogato, ${totDecaduto} -> decaduto ` +
      `(file toccati: ${toccati.length})${check ? " [check]" : ""}`,
  );
  for (const r of toccati) {
    console.log(`  ${r.file}: ${r.abrogato} abrogato, ${r.decaduto} decaduto`);
  }
  if (check && totAbrogato + totDecaduto > 0) {
    console.error(
      `RESTANO ${totAbrogato + totDecaduto} atti con header formale ma stato=in_vigore.`,
    );
    process.exitCode = 1;
  }
}

try {
  const eseguitoDiretto =
    typeof process !== "undefined" &&
    Array.isArray(process.argv) &&
    process.argv.some((a) => String(a).endsWith("normalizza-stati-testata.ts"));
  if (eseguitoDiretto) main();
} catch {
  // import come modulo (test): nessuna esecuzione
}
