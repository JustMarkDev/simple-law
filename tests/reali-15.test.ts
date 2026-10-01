/**
 * REALI-15 — contratti giudice read-only (mai rete, mai scritture).
 *
 * Ruolo: scrittore docs freschezza + test trasversali. Possiede SOLO questo
 * file (+ docs/FRESCHEZZA-DATI.md e scripts/verifica-freschezza.ts).
 * Regole ferree: mai inventare numeri/URL/date (solo file letti davvero),
 * mai rete, mai cancellare record per transienti.
 *
 * Cosa verifica (tutto su disco locale):
 * 1. MANIFEST: ogni voce ha file/conteggio/recuperatoIl validi.
 * 2. Refreshabili (§1 del giudice): envelope + conteggio == lunghezza reale.
 * 3. Stato MANIFEST (in carico a W2, risolto il 2026-09-28): duplicato
 *    Emilia-Romagna unito, 5 orfani storici assorbiti, zero voci senza file.
 * 4. Docs FRESCHEZZA-DATI.md: cita ogni file refreshabile con la data REALE
 *    del MANIFEST (niente date inventate).
 * 5. Script verifica-freschezza.ts: copre i refreshabili, mai rete, logica
 *    pura never-throw (ok/scaduto/mancante/data-non-valida).
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  FILE_REFRESHABILI,
  interpretaData,
  verificaFreschezza,
  vociManifestDaTesto,
} from "../scripts/verifica-freschezza";

const RADICE = process.cwd();
const DIR_REALI = path.resolve(RADICE, "data/reali");
const FILE_MANIFEST = path.join(DIR_REALI, "MANIFEST.json");
const FILE_DOCS = path.resolve(RADICE, "docs", "FRESCHEZZA-DATI.md");
const FILE_SCRIPT = path.resolve(RADICE, "scripts", "verifica-freschezza.ts");

/** Refreshabili §1 giudice: chiave array + conteggio MANIFEST verificati su disco. */
const REFRESHABILI_ATTESI: ReadonlyArray<{ nome: string; chiavi: string[]; conteggio: number }> = [
  { nome: "gazzetta-ultime.json", chiavi: ["atti"], conteggio: 32 },
  { nome: "governo-comunicati.json", chiavi: ["comunicati"], conteggio: 10 },
  { nome: "normattiva-recenti.json", chiavi: ["atti"], conteggio: 46 },
  { nome: "sondaggi-nazionali.json", chiavi: ["sondaggi"], conteggio: 30 },
  { nome: "camera-deputati.json", chiavi: ["deputati"], conteggio: 414 },
  { nome: "camera-gruppi.json", chiavi: ["gruppi"], conteggio: 13 },
  { nome: "camera-atti.json", chiavi: ["atti"], conteggio: 197 },
  { nome: "senato-senatori.json", chiavi: ["senatori"], conteggio: 212 },
  { nome: "senato-gruppi.json", chiavi: ["gruppi"], conteggio: 14 },
  { nome: "parlamento-ddl.json", chiavi: ["ddl"], conteggio: 5 },
];

// ---------------------------------------------------------------------------
// Helper puri (never-throw, mai rete)
// ---------------------------------------------------------------------------

function isStringaNonVuota(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isHttpsUrl(v: unknown): boolean {
  if (!isStringaNonVuota(v)) return false;
  try {
    return new URL(v.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

function provenanceDi(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const p = (parsed as { provenance?: unknown }).provenance;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  return p as Record<string, unknown>;
}

function estraiArrayDati(parsed: unknown, chiavi: string[]): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  for (const k of chiavi) {
    if (Array.isArray(obj[k])) return obj[k] as unknown[];
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
      return v as unknown[];
    }
  }
  return null;
}

async function leggiJson(percorso: string): Promise<{ parsed: unknown; raw: string } | null> {
  try {
    const raw = await readFile(percorso, "utf8");
    return { parsed: JSON.parse(raw) as unknown, raw };
  } catch {
    return null;
  }
}

async function leggiTesto(percorso: string): Promise<string | null> {
  try {
    return await readFile(percorso, "utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Suite 1: MANIFEST struttura (mai rete)
// ---------------------------------------------------------------------------

describe("reali-15: MANIFEST voci valide (mai rete)", () => {
  it("MANIFEST parses con voci {file, conteggio, recuperatoIl}", async () => {
    const testo = await leggiTesto(FILE_MANIFEST);
    expect(testo, "MANIFEST.json illeggibile").not.toBeNull();
    const voci = vociManifestDaTesto(testo ?? "");
    expect(voci, "MANIFEST senza array fonti").not.toBeNull();
    expect(voci?.length ?? 0).toBeGreaterThan(0);
    for (const voce of voci ?? []) {
      expect(
        isStringaNonVuota(voce.file),
        `voce senza file: ${JSON.stringify(voce).slice(0, 120)}`,
      ).toBe(true);
      expect(
        typeof voce.conteggio === "number" &&
          Number.isInteger(voce.conteggio) &&
          (voce.conteggio as number) >= 0,
        `conteggio non intero >= 0 per ${String(voce.file)}`,
      ).toBe(true);
      expect(
        interpretaData(voce.recuperatoIl),
        `recuperatoIl non interpretabile per ${String(voce.file)}`,
      ).not.toBeNull();
    }
  });

  it("ogni voce MANIFEST ha un file esistente su disco (zero mancanti)", async () => {
    const testo = await leggiTesto(FILE_MANIFEST);
    const voci = vociManifestDaTesto(testo ?? "");
    expect(voci).not.toBeNull();
    const mancanti: string[] = [];
    for (const voce of voci ?? []) {
      const letto = await leggiJson(path.join(DIR_REALI, String(voce.file)));
      if (!letto) mancanti.push(String(voce.file));
    }
    expect(mancanti, `voci MANIFEST senza file: ${mancanti.join(", ")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: refreshabili — envelope + conteggio == lunghezza reale (mai rete)
// ---------------------------------------------------------------------------

describe("reali-15: refreshabili coerenti con il disco (mai rete)", () => {
  for (const atteso of REFRESHABILI_ATTESI) {
    it(`${atteso.nome}: envelope https + conteggio ${atteso.conteggio} == len reale`, async () => {
      const letto = await leggiJson(path.join(DIR_REALI, atteso.nome));
      expect(letto, `${atteso.nome}: file illeggibile`).not.toBeNull();
      if (!letto) return;
      const prov = provenanceDi(letto.parsed);
      expect(prov, `${atteso.nome}: senza provenance`).not.toBeNull();
      expect(isStringaNonVuota(prov?.["fonte"]), `${atteso.nome}: fonte assente`).toBe(true);
      expect(isHttpsUrl(prov?.["url"]), `${atteso.nome}: url non https`).toBe(true);
      expect(
        interpretaData(prov?.["recuperatoIl"] ?? prov?.["estratto_il"]),
        `${atteso.nome}: recuperatoIl del file non interpretabile`,
      ).not.toBeNull();
      expect(isStringaNonVuota(prov?.["licenza"]), `${atteso.nome}: licenza assente`).toBe(true);
      const lista = estraiArrayDati(letto.parsed, atteso.chiavi);
      expect(lista, `${atteso.nome}: nessun array dati`).not.toBeNull();
      expect(
        lista?.length,
        `${atteso.nome}: len ${lista?.length} != conteggio ${atteso.conteggio}`,
      ).toBe(atteso.conteggio);
    });
  }

  it("voci MANIFEST dei refreshabili: recuperatoIl valido (fa fede il MANIFEST)", async () => {
    const testo = await leggiTesto(FILE_MANIFEST);
    const voci = vociManifestDaTesto(testo ?? "");
    expect(voci).not.toBeNull();
    const perFile = new Map((voci ?? []).map((v) => [String(v.file), v]));
    for (const atteso of REFRESHABILI_ATTESI) {
      const voce = perFile.get(atteso.nome);
      expect(voce, `${atteso.nome}: voce MANIFEST assente`).not.toBeNull();
      expect(voce?.conteggio, `${atteso.nome}: conteggio MANIFEST != ${atteso.conteggio}`).toBe(
        atteso.conteggio,
      );
      expect(
        interpretaData(voce?.recuperatoIl),
        `${atteso.nome}: recuperatoIl MANIFEST non valido`,
      ).not.toBeNull();
    }
  });

  it("emilia-romagna: convenzione liste:11 vs comuni:330 (senza cambiare numeri)", async () => {
    const letto = await leggiJson(
      path.join(DIR_REALI, "elezioni-regionali-2024-emilia-romagna.json"),
    );
    expect(letto, "emilia-romagna illeggibile").not.toBeNull();
    if (!letto || !letto.parsed || typeof letto.parsed !== "object") return;
    const obj = letto.parsed as Record<string, unknown>;
    expect(Array.isArray(obj["liste"]) ? (obj["liste"] as unknown[]).length : -1).toBe(11);
    expect(Array.isArray(obj["comuni"]) ? (obj["comuni"] as unknown[]).length : -1).toBe(330);
    const testo = await leggiTesto(FILE_MANIFEST);
    const voci = vociManifestDaTesto(testo ?? "") ?? [];
    const doppie = voci.filter((v) => v.file === "elezioni-regionali-2024-emilia-romagna.json");
    // W2 ha unito il duplicato storico x2 il 2026-09-28: da allora una voce
    // sola con conteggio=comuni (330), mai liste (11).
    expect(doppie.length, "emilia-romagna: attesa 1 voce MANIFEST (duplicato W2 risolto)").toBe(1);
    for (const voce of doppie) expect(voce.conteggio).toBe(330);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: stato MANIFEST noto — orfani documentati (fix W2, mai fail cieco)
// ---------------------------------------------------------------------------

describe("reali-15: orfani/duplicati documentati (mai rete)", () => {
  it("zero orfani su disco (W2 ha assorbito gli storici 5 il 2026-09-28)", async () => {
    const nomi = await readdir(DIR_REALI);
    const disco = nomi.filter((n) => n.endsWith(".json") && n !== "MANIFEST.json");
    const testo = await leggiTesto(FILE_MANIFEST);
    const voci = vociManifestDaTesto(testo ?? "") ?? [];
    const inManifest = new Set(voci.map((v) => String(v.file)));
    const orfani = disco.filter((n) => !inManifest.has(n)).sort();
    // Stato storico (pre-W2): b-elezioni-regionali-2025-{campania,puglia,veneto}.json
    // + normattiva-storico-{2012,2018}.json. Da W2 risolto: ogni nuovo file
    // su disco deve avere subito la sua voce MANIFEST.
    expect(orfani, `file senza voce MANIFEST: ${orfani.join(", ")}`).toEqual([]);
  });

  it("orfani 2012/2018: len reale 72/74 con recuperatoIl 2026-09-28T22:28:16.887Z", async () => {
    for (const [nome, len] of [
      ["normattiva-storico-2012.json", 72],
      ["normattiva-storico-2018.json", 74],
    ] as const) {
      const letto = await leggiJson(path.join(DIR_REALI, nome));
      expect(letto, `${nome}: file illeggibile`).not.toBeNull();
      if (!letto) continue;
      const lista = estraiArrayDati(letto.parsed, ["atti"]);
      expect(lista?.length, `${nome}: len != ${len}`).toBe(len);
      const prov = provenanceDi(letto.parsed);
      expect(prov?.["recuperatoIl"]).toBe("2026-09-28T22:28:16.887Z");
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 4: docs freschezza — cita file + date REALI del MANIFEST (mai rete)
// ---------------------------------------------------------------------------

describe("reali-15: docs FRESCHEZZA-DATI.md con date reali (mai rete)", () => {
  it("docs esiste e cita ogni refreshabile con comando e cadenza", async () => {
    const docs = await leggiTesto(FILE_DOCS);
    expect(docs, "docs/FRESCHEZZA-DATI.md assente").not.toBeNull();
    if (!docs) return;
    for (const voce of FILE_REFRESHABILI) {
      expect(docs.includes(voce.file), `docs senza ${voce.file}`).toBe(true);
      expect(docs.includes(voce.comando), `docs senza comando per ${voce.file}`).toBe(true);
      expect(docs.includes(voce.cadenza), `docs senza cadenza per ${voce.file}`).toBe(true);
    }
  });

  it("docs riporta i recuperatoIl letti davvero dal MANIFEST (mai inventati)", async () => {
    const docs = await leggiTesto(FILE_DOCS);
    const testoManifest = await leggiTesto(FILE_MANIFEST);
    expect(docs).not.toBeNull();
    expect(testoManifest).not.toBeNull();
    if (!docs || !testoManifest) return;
    const voci = vociManifestDaTesto(testoManifest) ?? [];
    const perFile = new Map(voci.map((v) => [String(v.file), String(v.recuperatoIl)]));
    for (const voce of FILE_REFRESHABILI) {
      const dataReale = perFile.get(voce.file);
      expect(isStringaNonVuota(dataReale), `MANIFEST senza data per ${voce.file}`).toBe(true);
      expect(
        docs.includes(dataReale ?? ""),
        `docs senza data REALE ${dataReale} per ${voce.file}`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 5: script verifica-freschezza — copertura, mai rete, logica pura
// ---------------------------------------------------------------------------

describe("reali-15: script verifica-freschezza (mai rete)", () => {
  it("copre tutti i refreshabili con soglia > 0", () => {
    const file = FILE_REFRESHABILI.map((v) => v.file);
    for (const atteso of REFRESHABILI_ATTESI) {
      expect(file, `script senza ${atteso.nome}`).toContain(atteso.nome);
    }
    for (const voce of FILE_REFRESHABILI) {
      expect(voce.sogliaGiorni, `soglia non positiva per ${voce.file}`).toBeGreaterThan(0);
      expect(isStringaNonVuota(voce.comando), `comando assente per ${voce.file}`).toBe(true);
    }
  });

  it("sorgente senza rete (niente fetch/http	client)", async () => {
    const sorgente = await leggiTesto(FILE_SCRIPT);
    expect(sorgente, "scripts/verifica-freschezza.ts illeggibile").not.toBeNull();
    if (!sorgente) return;
    expect(sorgente.includes("fetch("), "script con fetch (rete vietata)").toBe(false);
    expect(sorgente.includes("node:https"), "script con node:https (rete vietata)").toBe(false);
    expect(sorgente.includes("node:http"), "script con node:http (rete vietata)").toBe(false);
    expect(sorgente.includes("axios"), "script con axios (rete vietata)").toBe(false);
  });

  it("verificaFreschezza never-throw: ok / scaduto / mancante / data-non-valida", () => {
    const ora = Date.parse("2026-09-28T23:00:00.000Z");
    const base = (override: Record<string, unknown>): string =>
      JSON.stringify({
        fonti: [
          { file: "gazzetta-ultime.json", conteggio: 32, recuperatoIl: "2026-09-28T22:10:24.899Z" },
          {
            file: "governo-comunicati.json",
            conteggio: 10,
            recuperatoIl: "2026-09-28T18:38:50.732Z",
          },
          {
            file: "normattiva-recenti.json",
            conteggio: 46,
            recuperatoIl: "2026-09-28T19:08:27.309Z",
          },
          { file: "sondaggi-nazionali.json", conteggio: 30, recuperatoIl: "2026-09-28" },
          {
            file: "camera-deputati.json",
            conteggio: 414,
            recuperatoIl: "2026-09-28T18:26:21.186Z",
          },
          { file: "camera-gruppi.json", conteggio: 13, recuperatoIl: "2026-09-28T18:26:21.186Z" },
          {
            file: "camera-atti.json",
            conteggio: 197,
            recuperatoIl: "2026-09-28T19:00:23.484357+00:00",
          },
          {
            file: "senato-senatori.json",
            conteggio: 212,
            recuperatoIl: "2026-09-28T18:27:50.369Z",
          },
          { file: "senato-gruppi.json", conteggio: 14, recuperatoIl: "2026-09-28T18:27:50.369Z" },
          {
            file: "parlamento-ddl.json",
            conteggio: 5,
            recuperatoIl: "2026-09-28T19:00:34.734348+00:00",
          },
          ...[override],
        ],
      });
    expect(verificaFreschezza(base({}), ora, false).ok).toBe(true);

    const vecchia = JSON.parse(base({})) as { fonti: Array<Record<string, unknown>> };
    vecchia.fonti = vecchia.fonti.map((v) =>
      v["file"] === "governo-comunicati.json"
        ? { ...v, recuperatoIl: "2026-09-20T00:00:00.000Z" }
        : v,
    );
    const esitoScaduto = verificaFreschezza(JSON.stringify(vecchia), ora, false);
    expect(esitoScaduto.ok).toBe(false);
    expect(
      esitoScaduto.voci.some((v) => v.file === "governo-comunicati.json" && v.stato === "scaduto"),
    ).toBe(true);

    const senza = JSON.parse(base({})) as { fonti: Array<Record<string, unknown>> };
    senza.fonti = senza.fonti.filter((v) => v["file"] !== "sondaggi-nazionali.json");
    const esitoMancante = verificaFreschezza(JSON.stringify(senza), ora, false);
    expect(esitoMancante.ok).toBe(false);
    expect(
      esitoMancante.voci.some(
        (v) => v.file === "sondaggi-nazionali.json" && v.stato === "mancante",
      ),
    ).toBe(true);

    const invalida = JSON.parse(base({})) as { fonti: Array<Record<string, unknown>> };
    invalida.fonti = invalida.fonti.map((v) =>
      v["file"] === "normattiva-recenti.json" ? { ...v, recuperatoIl: "mai-una-data" } : v,
    );
    const esitoInvalido = verificaFreschezza(JSON.stringify(invalida), ora, false);
    expect(esitoInvalido.ok).toBe(false);
    expect(
      esitoInvalido.voci.some(
        (v) => v.file === "normattiva-recenti.json" && v.stato === "data-non-valida",
      ),
    ).toBe(true);

    expect(verificaFreschezza("non-json {{{", ora, false).ok).toBe(false);
    expect(verificaFreschezza("", ora, false).ok).toBe(false);
    expect(interpretaData(null)).toBeNull();
    expect(interpretaData("")).toBeNull();
  });

  it("sondaggi: soglia mensile fuori campagna, settimanale in campagna", () => {
    const ora = Date.parse("2026-10-20T00:00:00.000Z");
    const manifest = JSON.stringify({
      fonti: FILE_REFRESHABILI.map((v) =>
        v.file === "sondaggi-nazionali.json"
          ? { file: v.file, conteggio: 30, recuperatoIl: "2026-09-28" }
          : { file: v.file, conteggio: 1, recuperatoIl: "2026-10-19T00:00:00.000Z" },
      ),
    });
    expect(verificaFreschezza(manifest, ora, false).ok).toBe(true);
    const esitoCampagna = verificaFreschezza(manifest, ora, true);
    expect(esitoCampagna.ok).toBe(false);
    expect(
      esitoCampagna.voci.some((v) => v.file === "sondaggi-nazionali.json" && v.stato === "scaduto"),
    ).toBe(true);
  });
});
