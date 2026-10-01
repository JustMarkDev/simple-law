/**
 * Verifica freschezza dati reali — REALI-15 (read-only, mai rete).
 *
 * Legge SOLO `data/reali/MANIFEST.json` (fa fede `recuperatoIl` della voce,
 * mai la data di modifica del file) e confronta l'eta' di ogni file
 * refreshabile con la cadenza del giudice. Non fa rete, non scrive file.
 *
 * Esce con codice 1 (fallimento onesto) se:
 * - il MANIFEST e' illeggibile o una voce refreshabile manca,
 * - `recuperatoIl` non e' una data interpretabile,
 * - un file refreshabile e' piu' vecchio della sua soglia.
 *
 * Uso:
 *   bunx tsx scripts/verifica-freschezza.ts [--campagna] [--json] [--ora=ISO] [--help]
 *
 * Opzioni:
 *   --campagna  usa la soglia settimanale per i sondaggi (campagna
 *               elettorale); senza flag vale la soglia mensile.
 *   --json      stampa l'esito in JSON invece della tabella italiana.
 *   --ora=ISO   fissa l'istante di riferimento (solo per verifiche e test),
 *               es. --ora=2026-10-05T00:00:00Z. Default: adesso.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export interface VoceRefreshabile {
  readonly file: string;
  readonly cadenza: string;
  readonly comando: string;
  readonly costo: string;
  /** Soglia in giorni oltre la quale lo script esce con codice 1. */
  readonly sogliaGiorni: number;
}

/**
 * Tabella refreshabili (cadenze del giudice REALI-15 §1, costi dagli
 * header degli script). Le soglie includono una tolleranza onesta:
 * quotidiana feriale -> 4 giorni (copre il fine settimana),
 * giornaliera -> 3 giorni, settimanale -> 9 giorni, mensile -> 35 giorni.
 */
export const FILE_REFRESHABILI: readonly VoceRefreshabile[] = [
  {
    file: "gazzetta-ultime.json",
    cadenza: "quotidiana feriale",
    comando: "bunx tsx scripts/ingest-reale-gu-diretta.ts",
    costo: "1 GET RSS Serie Generale (32 item osservati, timeout 15 s, max 84 item)",
    sogliaGiorni: 4,
  },
  {
    file: "governo-comunicati.json",
    cadenza: "giornaliera (RSS volatile)",
    comando: "bunx tsx scripts/ingest-reale-governo.ts",
    costo: "1 GET feed RSS governo.it (max 30 item, timeout 12 s)",
    sogliaGiorni: 3,
  },
  {
    file: "normattiva-recenti.json",
    cadenza: "settimanale (finestra mobile)",
    comando: "bunx tsx scripts/ingest-reale-normattiva.ts --limite=50",
    costo: "1 POST lista + ~46 dettagli a batch di 5 con pausa 400 ms, timeout 15 s (~1-3 min)",
    sogliaGiorni: 9,
  },
  {
    file: "sondaggi-nazionali.json",
    cadenza: "mensile (settimanale in campagna elettorale)",
    comando: "node scripts/fetch-sondaggi-wiki.mjs --dry-run",
    costo: "MediaWiki API parse wikitext, cap 30 record, file <= 950 KB",
    sogliaGiorni: 35,
  },
  {
    file: "camera-deputati.json",
    cadenza: "mensile",
    comando: "bunx tsx scripts/ingest-reale-camera.ts",
    costo: "SPARQL dati.camera.it (lista + DESCRIBE per scheda)",
    sogliaGiorni: 35,
  },
  {
    file: "camera-gruppi.json",
    cadenza: "mensile (derivato dai deputati, senza nuove interrogazioni)",
    comando: "bunx tsx scripts/ingest-reale-camera.ts",
    costo: "derivato localmente da camera-deputati.json",
    sogliaGiorni: 35,
  },
  {
    file: "camera-atti.json",
    cadenza: "mensile (campione leg. 19)",
    comando: "bunx tsx scripts/ingest-reale-camera.ts",
    costo: "SPARQL dati.camera.it (atti leg. 19, campione)",
    sogliaGiorni: 35,
  },
  {
    file: "senato-senatori.json",
    cadenza: "mensile",
    comando: "bunx tsx scripts/ingest-reale-senato.ts",
    costo: "SPARQL dati.senato.it (lista + dettagli gruppo/foto)",
    sogliaGiorni: 35,
  },
  {
    file: "senato-gruppi.json",
    cadenza: "mensile (denominazioni storiche leg. 19)",
    comando: "bunx tsx scripts/ingest-reale-senato.ts",
    costo: "derivato dalla lista senatori (stessa interrogazione)",
    sogliaGiorni: 35,
  },
  {
    file: "parlamento-ddl.json",
    cadenza: "mensile (campione leg. 19)",
    comando: "bunx tsx scripts/ingest-reale-ddl.ts",
    costo: "SPARQL dati.senato.it (DDL leg. 19, campione)",
    sogliaGiorni: 35,
  },
];

/** Soglia sondaggi in campagna elettorale (settimanale + tolleranza). */
export const SOGLIA_SONDAGGI_CAMPAGNA_GIORNI = 9;

export type EsitoVoce =
  | {
      readonly stato: "ok";
      readonly file: string;
      readonly etaGiorni: number;
      readonly sogliaGiorni: number;
    }
  | {
      readonly stato: "scaduto" | "mancante" | "data-non-valida";
      readonly file: string;
      readonly dettaglio: string;
    };

export interface EsitoVerifica {
  readonly ok: boolean;
  readonly riferimentoIso: string;
  readonly voci: readonly EsitoVoce[];
}

/** Interpreta `recuperatoIl` (ISO completo o giorno YYYY-MM-DD). Mai lancia. */
export function interpretaData(recuperatoIl: unknown): number | null {
  try {
    if (typeof recuperatoIl !== "string") return null;
    const testo = recuperatoIl.trim();
    if (testo.length === 0) return null;
    const istante = Date.parse(testo);
    if (!Number.isFinite(istante)) return null;
    return istante;
  } catch {
    return null;
  }
}

/** Eta' in giorni (frazionaria) tra riferimento e recuperatoIl. Mai lancia. */
export function calcolaEtaGiorni(oraMs: number, recuperatoMs: number): number {
  try {
    return (oraMs - recuperatoMs) / 86_400_000;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

interface VoceManifest {
  readonly file?: unknown;
  readonly conteggio?: unknown;
  readonly recuperatoIl?: unknown;
}

/** Estrae l'array `fonti` dal MANIFEST senza mai lanciare. */
export function vociManifestDaTesto(testo: string): VoceManifest[] | null {
  try {
    const parsed: unknown = JSON.parse(testo);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const fonti = (parsed as { fonti?: unknown }).fonti;
    if (!Array.isArray(fonti)) return null;
    return fonti as VoceManifest[];
  } catch {
    return null;
  }
}

/**
 * Verifica la freschezza contro le voci del MANIFEST. Pura e never-throw:
 * non legge disco oltre il testo ricevuto, non fa rete.
 */
export function verificaFreschezza(
  testoManifest: string,
  oraMs: number,
  inCampagna: boolean,
): EsitoVerifica {
  let riferimentoIso = "data-non-valida";
  try {
    const oraValida = Number.isFinite(oraMs) ? oraMs : Date.now();
    riferimentoIso = new Date(oraValida).toISOString();
  } catch {
    riferimentoIso = "data-non-valida";
  }
  try {
    const voci = vociManifestDaTesto(testoManifest);
    if (!voci) {
      return {
        ok: false,
        riferimentoIso,
        voci: [
          {
            stato: "data-non-valida",
            file: "MANIFEST.json",
            dettaglio: "testo non interpretabile (fonti assente)",
          },
        ],
      };
    }
    const perFile = new Map<string, VoceManifest>();
    for (const voce of voci) {
      if (voce && typeof voce.file === "string" && !perFile.has(voce.file)) {
        perFile.set(voce.file, voce);
      }
    }
    const esiti: EsitoVoce[] = [];
    let ok = true;
    for (const atteso of FILE_REFRESHABILI) {
      const soglia =
        atteso.file === "sondaggi-nazionali.json" && inCampagna
          ? SOGLIA_SONDAGGI_CAMPAGNA_GIORNI
          : atteso.sogliaGiorni;
      const voce = perFile.get(atteso.file);
      if (!voce) {
        ok = false;
        esiti.push({
          stato: "mancante",
          file: atteso.file,
          dettaglio: "voce assente in MANIFEST.json",
        });
        continue;
      }
      const istante = interpretaData(voce.recuperatoIl);
      if (istante === null) {
        ok = false;
        esiti.push({
          stato: "data-non-valida",
          file: atteso.file,
          dettaglio: `recuperatoIl non interpretabile: ${String(voce.recuperatoIl ?? "").slice(0, 80)}`,
        });
        continue;
      }
      const eta = calcolaEtaGiorni(oraMs, istante);
      if (!Number.isFinite(eta) || eta < 0 || eta > soglia) {
        ok = false;
        esiti.push({
          stato: "scaduto",
          file: atteso.file,
          dettaglio: `eta ${Number.isFinite(eta) ? eta.toFixed(1) : "?"} giorni > soglia ${soglia} giorni`,
        });
        continue;
      }
      esiti.push({ stato: "ok", file: atteso.file, etaGiorni: eta, sogliaGiorni: soglia });
    }
    return { ok, riferimentoIso, voci: esiti };
  } catch {
    return {
      ok: false,
      riferimentoIso,
      voci: [
        {
          stato: "data-non-valida",
          file: "MANIFEST.json",
          dettaglio: "errore interno di verifica",
        },
      ],
    };
  }
}

function stampaTabella(esito: EsitoVerifica): void {
  console.log("Freschezza dati reali (riferimento: " + esito.riferimentoIso + ")");
  for (const voce of esito.voci) {
    if (voce.stato === "ok") {
      console.log(
        `OK       ${voce.file} — eta ${voce.etaGiorni.toFixed(1)} giorni (soglia ${voce.sogliaGiorni})`,
      );
    } else {
      console.log(`SCADUTO  ${voce.file} — ${voce.dettaglio}`);
    }
  }
  if (esito.ok) {
    console.log("Tutti i file refreshabili sono entro la cadenza.");
  } else {
    console.error(
      "Uno o piu' file refreshabili sono oltre la cadenza: rieseguire gli ingest del giudice.",
    );
  }
}

function mostraAiuto(): void {
  console.log(
    [
      "Uso: bunx tsx scripts/verifica-freschezza.ts [--campagna] [--json] [--ora=ISO] [--help]",
      "",
      "Verifica read-only (mai rete): confronta recuperatoIl del MANIFEST con le cadenze.",
      "Exit 0 entro soglia, 1 oltre soglia o in caso di MANIFEST illeggibile.",
      "Dettagli in docs/FRESCHEZZA-DATI.md.",
    ].join("\n"),
  );
}

const ESEGUITO_DIRETTO =
  typeof process !== "undefined" &&
  typeof process.argv?.[1] === "string" &&
  process.argv[1].replace(/\\/g, "/").endsWith("scripts/verifica-freschezza.ts");

if (ESEGUITO_DIRETTO) {
  const argomenti = new Set(process.argv.slice(2));
  let oraFissa: string | null = null;
  for (const argomento of process.argv.slice(2)) {
    if (argomento.startsWith("--ora=")) oraFissa = argomento.slice("--ora=".length);
  }
  if (argomenti.has("--help") || argomenti.has("-h")) {
    mostraAiuto();
    process.exit(0);
  }
  const inCampagna = argomenti.has("--campagna");
  const comeJson = argomenti.has("--json");
  let oraMs = Date.now();
  if (oraFissa !== null) {
    const interpretata = interpretaData(oraFissa);
    if (interpretata === null) {
      console.error(`--ora non interpretabile: ${oraFissa.slice(0, 80)}`);
      process.exit(1);
    }
    oraMs = interpretata;
  }
  let testo = "";
  try {
    const percorso = path.resolve(process.cwd(), "data", "reali", "MANIFEST.json");
    testo = readFileSync(percorso, "utf8");
  } catch {
    console.error("MANIFEST.json illeggibile in data/reali: impossibile verificare la freschezza.");
    process.exit(1);
  }
  const esito = verificaFreschezza(testo, oraMs, inCampagna);
  if (comeJson) {
    console.log(JSON.stringify(esito, null, 2));
  } else {
    stampaTabella(esito);
  }
  process.exit(esito.ok ? 0 : 1);
}
