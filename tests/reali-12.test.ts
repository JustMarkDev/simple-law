/**
 * REALI-12 — test trasversali wiring + finestre dense 1948/1985 (zero rete, tolleranti).
 *
 * Ruolo: scrittore wiring+test trasversali reali-12. Possiede SOLO questo file
 * (+ righe PERCORSI_ATTI_REALI in lib/sources.ts, toccate a parte). Zero rete,
 * zero scritture, mai inventare numeri/URL/date/stati. Tutti i controlli sui
 * nuovi file sono TOLLERANTI: se W4 non ha ancora generato il suo file, il test
 * passa con nota (skip), mai fail. Loader su disco salta gli assenti.
 *
 * Finestre REALI-12 (entrambe a W4):
 * - 1948: lista 689 / URN 688 / netto 686, tipi estinti unici
 *   (regio.decreto/legge, luogotenenziale). Cap 80 dettagli.
 * - 1985: lista 362 / URN 362 / netto 351, mix legge/DL/DPR, chiude buco
 *   1980-1990. Cap 80 dettagli.
 * Metodo: solo COUNT + POST dettaglio-atto-urn con dedup ELI/URN, stato onesto
 * fine-vigenza + Art.1, finestre annuali 01-01/12-31. Riuso envelope
 * `normattiva-storico-*.json` + PERCORSI_ATTI_REALI in lib/sources.ts.
 *
 * Formula getCorpusInfo (definita in lib/sources.ts, legacy invariato):
 * - base = SEED_LAWS.length (5 seed, sempre primi nel corpus);
 * - totale = getSeedLaws().length (seed + reali + sintetico, dedup ELI);
 * - espansi = totale - base (tutto oltre i seed, reali + sintetico);
 * - reali = record con dimostrativo === false in getSeedLaws().
 * Invarianti asseriti: base + espansi == totale; 0 <= reali <= totale.
 *
 * Soglia REALI-12: reali >= 1528 (misurati il 2026-09-28 con corpus 6531:
 * 5 seed + 1528 reali dimostrativo=false + ~4998 sintetici). Con le finestre
 * 1948/1985 presenti il conteggio cresce, con file assenti resta uguale:
 * per questo la soglia e' >= (tollerante), mai > stretto. Mai rete.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  estraiListaAttiReali,
  getCorpusInfo,
  getSeedLaws,
  normalizzaAttoReale,
} from "../lib/sources";

const RADICE = process.cwd();
const DIR_REALI = path.resolve(RADICE, "data/reali");
const FILE_MANIFEST = path.join(DIR_REALI, "MANIFEST.json");
const FILE_SOURCES = path.resolve(RADICE, "lib/sources.ts");

/** 1 MB: cap hard, nessun file dati reale committabile lo supera. */
const MAX_BYTE = 1024 * 1024;

/** Soglia REALI-12: corpus reale in crescita (precedente 1528, corpus 6531). */
const SOGLIA_REALI_12 = 1528;

type FileAtteso = {
  nome: string;
  chiavi: string[];
  max: number;
  nota: string;
};

/** Nuovi file REALI-12 (entrambi W4, cap 80 dettagli). */
const FILE_ATTI_FINESTRE_12: FileAtteso[] = [
  {
    nome: "normattiva-storico-1948.json",
    chiavi: ["atti", "leggi", "dati"],
    max: 80,
    nota: "Normattiva finestra 1948 (lista 689/URN 688/netto 686, tipi estinti)",
  },
  {
    nome: "normattiva-storico-1985.json",
    chiavi: ["atti", "leggi", "dati"],
    max: 80,
    nota: "Normattiva finestra 1985 (lista 362/URN 362/netto 351, mix legge/DL/DPR)",
  },
];

/** Percorsi atti gia' in PERCORSI_ATTI_REALI prima di REALI-12. */
const PERCORSI_STORICI_12 = [
  "data/reali/normattiva-recenti.json",
  "data/reali/normattiva-storico-collezioni.json",
  "data/reali/normattiva-storico-1960.json",
  "data/reali/normattiva-storico-1970.json",
  "data/reali/normattiva-storico-1980.json",
  "data/reali/normattiva-storico-1990.json",
  "data/reali/normattiva-storico-2000.json",
  "data/reali/normattiva-storico-2010.json",
  "data/reali/normattiva-storico-2020.json",
  "data/reali/normattiva-bulk-a-attuazione-ue.json",
  "data/reali/normattiva-bulk-b-finestra-2005.json",
  "data/reali/normattiva-storico-1992-1993.json",
  "data/reali/normattiva-storico-2005-2006.json",
  "data/reali/normattiva-storico-1955.json",
  "data/reali/normattiva-storico-2015.json",
];

/** Nuovi percorsi atti che il wiring REALI-12 deve registrare. */
const PERCORSI_FINESTRE_12_ATTESI = [
  "data/reali/normattiva-storico-1948.json",
  "data/reali/normattiva-storico-1985.json",
];

// ---------------------------------------------------------------------------
// Helper puri (never-throw, mai rete: solo fs locale + lib/sources sincrona)
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

function isIsoDate(v: unknown): boolean {
  if (!isStringaNonVuota(v)) return false;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(s)) return false;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return false;
  const anno = Number(s.slice(0, 4));
  return anno >= 1900 && anno <= 2030;
}

function isRecuperatoIl(v: unknown): boolean {
  if (!isStringaNonVuota(v)) return false;
  const t = Date.parse(v.trim());
  if (!Number.isFinite(t)) return false;
  const anno = new Date(t).getUTCFullYear();
  const oggi = new Date().getUTCFullYear();
  return anno >= 2025 && anno <= oggi + 1;
}

const SEGNALI_INVENTATI = ["example.com", "malevolo", "lorem", "todo", "xxx", "inventato", "fake"];
function haSegnaleInventato(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.toLowerCase();
  return SEGNALI_INVENTATI.some((k) => s.includes(k));
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
    if (Array.isArray(obj[k]) && (obj[k] as unknown[]).length > 0) {
      return obj[k] as unknown[];
    }
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
      return v as unknown[];
    }
  }
  return null;
}

async function leggiJson(percorso: string): Promise<{ parsed: unknown; byte: number } | null> {
  try {
    const raw = await readFile(percorso, "utf8");
    const byte = Buffer.byteLength(raw, "utf8");
    return { parsed: JSON.parse(raw) as unknown, byte };
  } catch {
    return null;
  }
}

function notaSkip(msg: string): void {
  console.info(`[reali-12] SKIP tollerante — ${msg}`);
}

function chiaveBassa(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Spot-check atti finestra (solo campi presenti, mai inventare)
// ---------------------------------------------------------------------------

const STATI_ONESTI = ["in_vigore", "abrogato", "decaduto", "sconosciuto"];

function spotCheckAttoFinestra12(voce: unknown): string | null {
  if (!voce || typeof voce !== "object") return "voce non oggetto";
  const r = voce as Record<string, unknown>;
  const titolo = r["titolo"] ?? r["titoloAtto"] ?? r["epigrafe"];
  if (!isStringaNonVuota(titolo)) return "manca titolo/titoloAtto";
  if (haSegnaleInventato(titolo)) return "titolo con segnale inventato";
  const chiave = r["eli"] ?? r["urn"] ?? r["nir"] ?? r["chiave"];
  if (!isStringaNonVuota(chiave)) return "manca eli/urn/nir/chiave";
  if (haSegnaleInventato(chiave)) return "chiave con segnale inventato";
  const stato = r["stato"];
  if (stato !== undefined && stato !== null && stato !== "") {
    if (!STATI_ONESTI.includes(String(stato))) return "stato non onesto";
  }
  const data = r["dataEmanazione"] ?? r["dataDoc"];
  if (data !== undefined && data !== null && data !== "" && !isIsoDate(data)) {
    return "dataEmanazione non ISO";
  }
  const fonti = r["fonti"];
  if (fonti !== undefined && fonti !== null) {
    if (typeof fonti !== "object") return "fonti non oggetto";
    for (const v of Object.values(fonti as Record<string, unknown>)) {
      if (v !== undefined && v !== null && v !== "" && !isHttpsUrl(v)) {
        return "fonti con URL non https";
      }
      if (haSegnaleInventato(v)) return "fonti con segnale inventato";
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Suite 1: envelope + cap + spot-check finestre 1948/1985 (skip se assenti)
// ---------------------------------------------------------------------------

describe("reali-12: envelope finestre Normattiva 1948/1985 (skip se assenti)", () => {
  for (const atteso of FILE_ATTI_FINESTRE_12) {
    it(`${atteso.nome}: envelope + licenza + conteggio>0 + cap`, async () => {
      const letto = await leggiJson(path.join(DIR_REALI, atteso.nome));
      if (!letto) {
        notaSkip(`${atteso.nome} assente — ${atteso.nota}`);
        expect(true).toBe(true);
        return;
      }
      expect(letto.byte, `${atteso.nome}: oltre 1MB`).toBeLessThanOrEqual(MAX_BYTE);
      const prov = provenanceDi(letto.parsed);
      expect(prov, `${atteso.nome}: senza provenance`).not.toBeNull();
      expect(isStringaNonVuota(prov?.["fonte"]), `${atteso.nome}: fonte assente`).toBe(true);
      expect(isHttpsUrl(prov?.["url"]), `${atteso.nome}: url non https`).toBe(true);
      expect(
        isRecuperatoIl(prov?.["recuperatoIl"] ?? prov?.["estratto_il"]),
        `${atteso.nome}: recuperatoIl/estratto_il non reale`,
      ).toBe(true);
      expect(isStringaNonVuota(prov?.["licenza"]), `${atteso.nome}: licenza assente`).toBe(true);
      const lista = estraiArrayDati(letto.parsed, atteso.chiavi);
      expect(lista, `${atteso.nome}: nessun array dati`).not.toBeNull();
      expect(lista?.length ?? 0, `${atteso.nome}: conteggio zero`).toBeGreaterThan(0);
      expect(lista?.length ?? 0, `${atteso.nome}: oltre cap ${atteso.max}`).toBeLessThanOrEqual(
        atteso.max,
      );
    });

    it(`${atteso.nome}: zero inventati (spot-check + normalizzazione)`, async () => {
      const letto = await leggiJson(path.join(DIR_REALI, atteso.nome));
      if (!letto) {
        notaSkip(`${atteso.nome} assente — spot-check rimandato`);
        expect(true).toBe(true);
        return;
      }
      const lista = estraiArrayDati(letto.parsed, atteso.chiavi);
      if (!lista || lista.length === 0) {
        notaSkip(`${atteso.nome} array vuoto — spot-check rimandato`);
        expect(true).toBe(true);
        return;
      }
      const campione = [...lista.slice(0, 20), ...lista.slice(-5)];
      let validi = 0;
      for (const voce of campione) {
        const errore = spotCheckAttoFinestra12(voce);
        expect(
          errore,
          `${atteso.nome}: record non valido (${errore}): ${JSON.stringify(voce).slice(0, 200)}`,
        ).toBeNull();
        validi += 1;
      }
      expect(validi).toBeGreaterThan(0);
      const normalizzati = campione.map((v) => normalizzaAttoReale(v)).filter((r) => r !== null);
      expect(normalizzati.length, `${atteso.nome}: nessun record normalizzabile`).toBeGreaterThan(
        0,
      );
      for (const r of normalizzati) {
        expect(r?.dimostrativo).toBe(false);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 2: wiring PERCORSI_ATTI_REALI + dedup finestre (loader salta assenti)
// ---------------------------------------------------------------------------

describe("reali-12: wiring percorsi + dedup finestre", () => {
  it("PERCORSI_ATTI_REALI contiene le 2 finestre e conserva gli storici", async () => {
    let testo: string;
    try {
      testo = await readFile(FILE_SOURCES, "utf8");
    } catch {
      notaSkip("lib/sources.ts illeggibile");
      expect(true).toBe(true);
      return;
    }
    for (const p of PERCORSI_FINESTRE_12_ATTESI) {
      expect(testo.includes(p), `PERCORSI_ATTI_REALI senza ${p}`).toBe(true);
    }
    for (const p of PERCORSI_STORICI_12) {
      expect(testo.includes(p), `PERCORSI_ATTI_REALI ha perso ${p}`).toBe(true);
    }
  });

  it("nessun ELI duplicato tra finestre nuove e storici presenti", async () => {
    const candidati = [...PERCORSI_STORICI_12, ...PERCORSI_FINESTRE_12_ATTESI].map((p) =>
      path.join(RADICE, p),
    );
    const visti = new Map<string, string>();
    const duplicati: string[] = [];
    let fileVerificati = 0;
    let attiTotali = 0;
    for (const percorso of candidati) {
      const letto = await leggiJson(percorso);
      if (!letto) continue;
      const lista = estraiListaAttiReali(letto.parsed);
      if (lista.length === 0) continue;
      fileVerificati += 1;
      const perFile = new Set<string>();
      for (const voce of lista) {
        const r = voce as Record<string, unknown>;
        const chiave = chiaveBassa(r["eli"] ?? r["urn"] ?? r["nir"] ?? r["chiave"]);
        if (!chiave) continue;
        attiTotali += 1;
        if (perFile.has(chiave)) {
          duplicati.push(`intra ${path.basename(percorso)}: ${chiave}`);
        }
        perFile.add(chiave);
        const primo = visti.get(chiave);
        if (primo && primo !== path.basename(percorso)) {
          duplicati.push(`cross ${primo} <> ${path.basename(percorso)}: ${chiave}`);
        } else if (!primo) {
          visti.set(chiave, path.basename(percorso));
        }
      }
    }
    if (fileVerificati === 0) {
      notaSkip("nessun file atti su disco — dedup rimandato");
      expect(true).toBe(true);
      return;
    }
    console.info(
      `[reali-12] dedup su ${fileVerificati} file, ${attiTotali} atti, ${visti.size} chiavi uniche`,
    );
    expect(duplicati, `ELI duplicati:\n${duplicati.slice(0, 10).join("\n")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: MANIFEST coerente (tollerante)
// ---------------------------------------------------------------------------

describe("reali-12: MANIFEST coerente (tollerante)", () => {
  it("ogni voce MANIFEST con file esistente e' leggibile", async () => {
    const letto = await leggiJson(FILE_MANIFEST);
    if (!letto) {
      notaSkip("MANIFEST.json assente");
      expect(true).toBe(true);
      return;
    }
    const fonti = (letto.parsed as { fonti?: Array<Record<string, unknown>> }).fonti ?? [];
    expect(fonti.length).toBeGreaterThan(0);
    let presenti = 0;
    const assenti: string[] = [];
    for (const voce of fonti) {
      const file = String(voce["file"] ?? "");
      if (!file) continue;
      try {
        await stat(path.join(DIR_REALI, path.basename(file)));
        presenti += 1;
      } catch {
        assenti.push(file);
      }
    }
    if (assenti.length > 0) {
      console.info(`[reali-12] NOTA — voci MANIFEST senza file: ${assenti.join(", ")}`);
    }
    expect(presenti, "nessuna voce MANIFEST ha file su disco").toBeGreaterThan(0);
  });

  it("nuovi file REALI-12 presenti ma non elencati sono solo nota (no fail)", async () => {
    let entries: string[];
    try {
      entries = await readdir(DIR_REALI);
    } catch {
      notaSkip("cartella data/reali illeggibile");
      expect(true).toBe(true);
      return;
    }
    const letto = await leggiJson(FILE_MANIFEST);
    const elencati = new Set<string>();
    if (letto) {
      const fonti = (letto.parsed as { fonti?: Array<Record<string, unknown>> }).fonti ?? [];
      for (const voce of fonti) {
        const f = voce["file"];
        if (isStringaNonVuota(f)) elencati.add(path.basename(String(f)));
      }
    }
    const nuoviNomi = new Set(FILE_ATTI_FINESTRE_12.map((f) => f.nome));
    const json = entries.filter((e) => e.endsWith(".json") && e !== "MANIFEST.json");
    const nuoviNonElencati = json.filter((e) => nuoviNomi.has(e) && !elencati.has(e));
    if (nuoviNonElencati.length > 0) {
      console.info(
        `[reali-12] NOTA — nuovi file non ancora in MANIFEST (lag W4): ${nuoviNonElencati.join(", ")}`,
      );
    }
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: getCorpusInfo coerente + corpus in crescita + never-throw (mai rete)
// ---------------------------------------------------------------------------

describe("reali-12: getCorpusInfo coerente + corpus in crescita (mai rete)", () => {
  it("formula documentata: base + espansi == totale; 0 <= reali <= totale", () => {
    let info: ReturnType<typeof getCorpusInfo>;
    try {
      info = getCorpusInfo();
    } catch (e) {
      expect(e, "getCorpusInfo ha lanciato").toBeNull();
      return;
    }
    expect(info.base).toBeGreaterThan(0);
    expect(info.totale).toBeGreaterThanOrEqual(info.base);
    expect(info.espansi).toBe(info.totale - info.base);
    expect(info.base + info.espansi).toBe(info.totale);
    expect(info.reali).toBeGreaterThanOrEqual(0);
    expect(info.reali).toBeLessThanOrEqual(info.totale);
    const atteso = getSeedLaws().filter((l) => l.dimostrativo === false).length;
    expect(info.reali, "reali != conteggio dimostrativo===false in getSeedLaws()").toBe(atteso);
  });

  it(`corpus in crescita: reali >= soglia precedente ${SOGLIA_REALI_12} (tollerante)`, () => {
    const info = getCorpusInfo();
    console.info(
      `[reali-12] corpus: base=${info.base} reali=${info.reali} totale=${info.totale} (soglia ${SOGLIA_REALI_12})`,
    );
    expect(
      info.reali,
      `corpus sotto soglia REALI-12 (${SOGLIA_REALI_12}): regressione reali`,
    ).toBeGreaterThanOrEqual(SOGLIA_REALI_12);
  });

  it("campi legacy intatti: base/espansi/totale/reali numerici", () => {
    const info = getCorpusInfo() as unknown as Record<string, unknown>;
    for (const k of ["base", "espansi", "totale", "reali"]) {
      expect(typeof info[k], `campo ${k} mancante/non numerico`).toBe("number");
    }
  });

  it("loader getSeedLaws never-throw con finestre presenti/assenti (mai rete)", () => {
    let leggi: unknown[];
    try {
      leggi = getSeedLaws();
    } catch (e) {
      expect(e, "getSeedLaws ha lanciato").toBeNull();
      return;
    }
    expect(Array.isArray(leggi)).toBe(true);
    expect(leggi.length).toBeGreaterThan(0);
    for (const l of leggi.slice(0, 50)) {
      const r = l as Record<string, unknown>;
      expect(haSegnaleInventato(r["titolo"]), "titolo con segnale inventato nel corpus").toBe(
        false,
      );
    }
  });

  it("normalizzaAttoReale/estraiListaAttiReali never-throw su assenti/malformati", () => {
    expect(normalizzaAttoReale(null)).toBeNull();
    expect(normalizzaAttoReale(undefined)).toBeNull();
    expect(normalizzaAttoReale({})).toBeNull();
    expect(normalizzaAttoReale({ titolo: "x" })).toBeNull();
    expect(estraiListaAttiReali(null)).toEqual([]);
    expect(estraiListaAttiReali({})).toEqual([]);
  });
});
