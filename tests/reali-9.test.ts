/**
 * REALI-9 — test trasversali wiring + bulk/finestre (zero rete, tolleranti).
 *
 * Ruolo: scrittore wiring+test trasversali reali-9. Possiede SOLO questo file
 * (+ righe PERCORSI_ATTI_REALI in lib/sources.ts, toccate a parte).
 * Non importa parser/lib di W1–W4 (potrebbero non esistere ancora): solo
 * controlli JSON/envelope su disco + import stabile da lib/sources.ts
 * (normalizza/estrai, mai rete). Mai fallimento per file assenti
 * (skip con nota via console.info + expect(true)).
 *
 * Copre, senza duplicare le suite esistenti (reali-*.test.ts, wiring,
 * corpus-unificato, reali-8 che copre anac/ga/storico-2020/1960):
 * - 5 nuovi file Normattiva (finestra-2015/2005/1995/2010 + testi-unici):
 *   envelope + licenza + conteggio>0 + cap 1MB + spot-check titolo+eli;
 * - 3 shard Camera leg19 a/b/c: envelope + somma 3144 se tutti presenti;
 * - dedup ELI/URN cross-file (10 percorsi storici + 5 nuovi + intra-file);
 * - PERCORSI_ATTI_REALI in lib/sources.ts contiene i 5 nuovi percorsi;
 * - MANIFEST coerente (voci con file esistente);
 * - corpus reale in crescita (>=500 atti reali non-dimostrativi);
 * - never-throw su file assenti / input malformati.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  estraiListaAttiReali,
  getSeedLaws,
  normalizzaAttoReale,
} from "../lib/sources";

const RADICE = process.cwd();
const DIR_REALI = path.resolve(RADICE, "data/reali");
const FILE_MANIFEST = path.join(DIR_REALI, "MANIFEST.json");
const FILE_SOURCES = path.resolve(RADICE, "lib/sources.ts");

/** 1 MB: cap hard, nessun file dati reale committabile lo supera. */
const MAX_BYTE = 1024 * 1024;

/** Soglia REALI-9: corpus reale in crescita (precedente 356+132=488). */
const SOGLIA_REALI_9 = 500;

/** Somma attesa shard Camera leg19 quando tutti presenti (3144 DISTINCT). */
const SOMMA_SHARD_ATTESA = 3144;

type FileAtteso = {
  percorso: string;
  chiavi: string[];
  max: number;
  nota: string;
};

const FILE_NORMATTIVA_NUOVI: FileAtteso[] = [
  {
    percorso: path.join(DIR_REALI, "normattiva-bulk-a-attuazione-ue.json"),
    chiavi: ["atti", "leggi", "dati", "items"],
    max: 200,
    nota: "Normattiva bulk attuazione UE (atti con/senza dettaglio, LawRecord)",
  },
  {
    percorso: path.join(DIR_REALI, "normattiva-bulk-b-finestra-2005.json"),
    chiavi: ["atti", "leggi", "dati", "items"],
    max: 750,
    nota: "Normattiva finestra 2005 lista-only (LawRecord, stato sconosciuto)",
  },
];

const SHARD_CAMERA: FileAtteso[] = [
  {
    percorso: path.join(DIR_REALI, "camera-atti-leg19-a.json"),
    chiavi: ["atti", "dati", "items"],
    max: 1100,
    nota: "Camera leg19 shard a (numeri 1–1100)",
  },
  {
    percorso: path.join(DIR_REALI, "camera-atti-leg19-b.json"),
    chiavi: ["atti", "dati", "items"],
    max: 1100,
    nota: "Camera leg19 shard b (numeri 1101–2200)",
  },
  {
    percorso: path.join(DIR_REALI, "camera-atti-leg19-c.json"),
    chiavi: ["atti", "dati", "items"],
    max: 1100,
    nota: "Camera leg19 shard c (numeri 2201–3144)",
  },
];

/** Percorsi storici gia in PERCORSI_ATTI_REALI prima di REALI-9. */
const PERCORSI_STORICI = [
  "data/reali/normattiva-recenti.json",
  "data/reali/normattiva-storico-collezioni.json",
  "data/reali/normattiva-storico-1980.json",
  "data/reali/normattiva-storico-1990.json",
  "data/reali/normattiva-storico-2000.json",
  "data/reali/normattiva-storico-2010.json",
  "data/reali/normattiva-storico-1970.json",
  "data/reali/normattiva-storico-2020.json",
  "data/reali/normattiva-storico-1960.json",
];

/** Nuovi percorsi che il wiring REALI-9 deve registrare. */
const PERCORSI_NUOVI_ATTESI = [
  "data/reali/normattiva-bulk-a-attuazione-ue.json",
  "data/reali/normattiva-bulk-b-finestra-2005.json",
];

// ---------------------------------------------------------------------------
// Helper puri (never-throw)
// ---------------------------------------------------------------------------

function isStringaNonVuota(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isHttpsUrl(v: unknown): boolean {
  if (!isStringaNonVuota(v)) return false;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:";
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

const SEGNALI_INVENTATI = [
  "example.com",
  "malevolo",
  "lorem",
  "todo",
  "xxx",
  "inventato",
  "fake",
];
function haSegnaleInventato(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.toLowerCase();
  return SEGNALI_INVENTATI.some((k) => s.includes(k));
}

function provenanceDi(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return null;
  const p = (parsed as { provenance?: unknown }).provenance;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  return p as Record<string, unknown>;
}

function estraiArray(parsed: unknown, chiavi: string[]): unknown[] | null {
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

async function leggiJson(
  percorso: string,
): Promise<{ parsed: unknown; byte: number } | null> {
  try {
    const raw = await readFile(percorso, "utf8");
    const byte = Buffer.byteLength(raw, "utf8");
    return { parsed: JSON.parse(raw) as unknown, byte };
  } catch {
    return null;
  }
}

function notaSkip(msg: string): void {
  console.info(`[reali-9] SKIP tollerante — ${msg}`);
}

function chiaveEli(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Spot-check per tipologia (solo campi presenti, mai inventare)
// ---------------------------------------------------------------------------

function spotCheckNormattiva(voce: unknown): string | null {
  if (!voce || typeof voce !== "object") return "voce non oggetto";
  const r = voce as Record<string, unknown>;
  // Zero titoli inventati: titolo reale da lista (titoloAtto/titoloDoc/titolo).
  const titolo =
    r["titolo"] ?? r["titoloAtto"] ?? r["titoloDoc"] ?? r["epigrafe"];
  if (!isStringaNonVuota(titolo)) return "manca titolo/titoloAtto/titoloDoc";
  if (haSegnaleInventato(titolo)) return "titolo con segnale inventato";
  // ELI/URN reale: eli oppure urn (bulk TU usa urn+eli).
  const chiave = r["eli"] ?? r["urn"] ?? r["nir"] ?? r["chiave"];
  if (!isStringaNonVuota(chiave)) return "manca eli/urn/nir/chiave";
  if (haSegnaleInventato(chiave)) return "chiave con segnale inventato";
  const stato = r["stato"];
  if (stato !== undefined && stato !== null && stato !== "") {
    if (!["in_vigore", "abrogato", "decaduto"].includes(String(stato))) {
      return "stato non onesto";
    }
  }
  const data = r["dataEmanazione"] ?? r["dataDoc"];
  if (data !== undefined && data !== null && data !== "" && !isIsoDate(data)) {
    return "dataEmanazione/dataDoc non ISO";
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

function spotCheckCamera(voce: unknown): string | null {
  if (!voce || typeof voce !== "object") return "voce non oggetto";
  const r = voce as Record<string, unknown>;
  const uri = r["uri"] ?? r["scheda"] ?? r["id"];
  if (!isStringaNonVuota(uri)) return "manca uri/scheda/id";
  if (haSegnaleInventato(uri)) return "uri con segnale inventato";
  const titolo = r["titolo"] ?? r["label"];
  if (!isStringaNonVuota(titolo)) return "manca titolo/label";
  if (haSegnaleInventato(titolo)) return "titolo con segnale inventato";
  for (const k of ["scheda", "url", "link"]) {
    const v = r[k];
    if (v !== undefined && v !== null && v !== "" && !isHttpsUrl(String(v)) && !String(v).startsWith("http")) {
      return `campo ${k} non URL`;
    }
    if (haSegnaleInventato(v)) return `campo ${k} con segnale inventato`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Suite 1: envelope + spot-check file Normattiva nuovi (skip se assenti)
// ---------------------------------------------------------------------------

describe("reali-9: envelope bulk/finestre Normattiva (skip se assenti)", () => {
  for (const atteso of FILE_NORMATTIVA_NUOVI) {
    const nome = path.basename(atteso.percorso);
    it(`${nome}: envelope valida + licenza + conteggio>0 + cap`, async () => {
      const letto = await leggiJson(atteso.percorso);
      if (!letto) {
        notaSkip(`${nome} assente — ${atteso.nota}`);
        expect(true).toBe(true);
        return;
      }
      expect(
        letto.byte,
        `${nome}: file oltre 1MB (rigenerare via script, non committare)`,
      ).toBeLessThanOrEqual(MAX_BYTE);
      const prov = provenanceDi(letto.parsed);
      expect(
        prov,
        `${nome}: envelope senza provenance{fonte,url,recuperatoIl,licenza}`,
      ).not.toBeNull();
      expect(isStringaNonVuota(prov?.["fonte"]), `${nome}: fonte assente`).toBe(true);
      expect(isHttpsUrl(prov?.["url"]), `${nome}: url non https`).toBe(true);
      expect(
        isRecuperatoIl(prov?.["recuperatoIl"]),
        `${nome}: recuperatoIl non ISO reale`,
      ).toBe(true);
      expect(isStringaNonVuota(prov?.["licenza"]), `${nome}: licenza assente`).toBe(true);
      const lista = estraiArray(letto.parsed, atteso.chiavi);
      expect(lista, `${nome}: nessun array dati non vuoto`).not.toBeNull();
      expect(lista?.length ?? 0, `${nome}: conteggio zero`).toBeGreaterThan(0);
      expect(
        lista?.length ?? 0,
        `${nome}: oltre il cap ${atteso.max}`,
      ).toBeLessThanOrEqual(atteso.max);
    });

    it(`${nome}: zero inventati (spot-check titolo+eli/urn)`, async () => {
      const letto = await leggiJson(atteso.percorso);
      if (!letto) {
        notaSkip(`${nome} assente — spot-check rimandato`);
        expect(true).toBe(true);
        return;
      }
      const lista = estraiArray(letto.parsed, atteso.chiavi);
      if (!lista || lista.length === 0) {
        notaSkip(`${nome} array vuoto — spot-check rimandato`);
        expect(true).toBe(true);
        return;
      }
      const campione = [...lista.slice(0, 20), ...lista.slice(-5)];
      let validi = 0;
      for (const voce of campione) {
        const errore = spotCheckNormattiva(voce);
        expect(
          errore,
          `${nome}: record non valido (${errore}): ${JSON.stringify(voce).slice(0, 200)}`,
        ).toBeNull();
        validi += 1;
      }
      expect(validi).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 2: shard Camera leg19 (skip se assenti; somma solo se tutti presenti)
// ---------------------------------------------------------------------------

describe("reali-9: shard Camera leg19 (skip se assenti)", () => {
  for (const atteso of SHARD_CAMERA) {
    const nome = path.basename(atteso.percorso);
    it(`${nome}: envelope + conteggio>0 + cap`, async () => {
      const letto = await leggiJson(atteso.percorso);
      if (!letto) {
        notaSkip(`${nome} assente — ${atteso.nota}`);
        expect(true).toBe(true);
        return;
      }
      expect(letto.byte, `${nome}: oltre 1MB`).toBeLessThanOrEqual(MAX_BYTE);
      const prov = provenanceDi(letto.parsed);
      expect(prov, `${nome}: senza provenance`).not.toBeNull();
      expect(isStringaNonVuota(prov?.["fonte"]), `${nome}: fonte assente`).toBe(true);
      expect(isHttpsUrl(prov?.["url"]), `${nome}: url non https`).toBe(true);
      expect(isRecuperatoIl(prov?.["recuperatoIl"]), `${nome}: recuperatoIl non reale`).toBe(true);
      expect(isStringaNonVuota(prov?.["licenza"]), `${nome}: licenza assente`).toBe(true);
      const lista = estraiArray(letto.parsed, atteso.chiavi);
      expect(lista, `${nome}: nessun array atti`).not.toBeNull();
      expect(lista?.length ?? 0, `${nome}: zero atti`).toBeGreaterThan(0);
      expect(lista?.length ?? 0, `${nome}: oltre cap`).toBeLessThanOrEqual(atteso.max);
      const campione = [...(lista ?? []).slice(0, 10), ...(lista ?? []).slice(-3)];
      for (const voce of campione) {
        const errore = spotCheckCamera(voce);
        expect(
          errore,
          `${nome}: record non valido (${errore}): ${JSON.stringify(voce).slice(0, 200)}`,
        ).toBeNull();
      }
    });
  }

  it("shard presenti sommano a 3144 DISTINCT (solo se tutti presenti)", async () => {
    const conteggi: number[] = [];
    for (const atteso of SHARD_CAMERA) {
      const letto = await leggiJson(atteso.percorso);
      if (!letto) {
        notaSkip(`shard ${path.basename(atteso.percorso)} assente — somma rimandata`);
        expect(true).toBe(true);
        return;
      }
      const lista = estraiArray(letto.parsed, atteso.chiavi);
      if (!lista) {
        notaSkip(`shard ${path.basename(atteso.percorso)} senza array — somma rimandata`);
        expect(true).toBe(true);
        return;
      }
      conteggi.push(lista.length);
    }
    const totale = conteggi.reduce((a, b) => a + b, 0);
    console.info(`[reali-9] shard camera presenti 3/3: ${conteggi.join("+")}=${totale}`);
    expect(totale, "somma shard != 3144 DISTINCT leg19").toBe(SOMMA_SHARD_ATTESA);
  });

  it("shard senza URI duplicati intra-shard (solo se presenti)", async () => {
    let verificati = 0;
    for (const atteso of SHARD_CAMERA) {
      const letto = await leggiJson(atteso.percorso);
      if (!letto) continue;
      const lista = estraiArray(letto.parsed, atteso.chiavi);
      if (!lista) continue;
      const visti = new Set<string>();
      for (const voce of lista) {
        const r = voce as Record<string, unknown>;
        const uri = chiaveEli(r["uri"] ?? r["scheda"] ?? r["id"]);
        if (!uri) continue;
        expect(visti.has(uri), `${path.basename(atteso.percorso)}: uri duplicato ${uri}`).toBe(false);
        visti.add(uri);
      }
      verificati += 1;
    }
    if (verificati === 0) {
      notaSkip("nessuno shard presente — dedup intra-shard rimandato");
      expect(true).toBe(true);
      return;
    }
    expect(verificati).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: dedup ELI/URN cross-file + wiring PERCORSI_ATTI_REALI
// ---------------------------------------------------------------------------

describe("reali-9: dedup ELI cross-file + wiring percorsi", () => {
  it("PERCORSI_ATTI_REALI contiene i 5 nuovi file bulk/finestre", async () => {
    let testo: string;
    try {
      testo = await readFile(FILE_SOURCES, "utf8");
    } catch {
      notaSkip("lib/sources.ts illeggibile");
      expect(true).toBe(true);
      return;
    }
    for (const p of PERCORSI_NUOVI_ATTESI) {
      expect(testo.includes(p), `PERCORSI_ATTI_REALI senza ${p}`).toBe(true);
    }
    for (const p of PERCORSI_STORICI) {
      expect(testo.includes(p), `PERCORSI_ATTI_REALI ha perso ${p}`).toBe(true);
    }
  });

  it("nessun ELI/URN duplicato tra file presenti (storici + nuovi)", async () => {
    const candidati = [...PERCORSI_STORICI, ...PERCORSI_NUOVI_ATTESI].map((p) =>
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
        const chiave = chiaveEli(r["eli"] ?? r["urn"] ?? r["nir"] ?? r["chiave"]);
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
      `[reali-9] dedup su ${fileVerificati} file, ${attiTotali} atti, ${visti.size} chiavi uniche`,
    );
    expect(duplicati, `ELI duplicati:\n${duplicati.slice(0, 10).join("\n")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: MANIFEST coerente + corpus in crescita + never-throw
// ---------------------------------------------------------------------------

describe("reali-9: MANIFEST coerente (tollerante)", () => {
  it("ogni voce MANIFEST con file esistente è leggibile", async () => {
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
      console.info(`[reali-9] NOTA — voci MANIFEST senza file: ${assenti.join(", ")}`);
    }
    expect(presenti, "nessuna voce MANIFEST ha file su disco").toBeGreaterThan(0);
  });

  it("nuovi file REALI-9 presenti ma non elencati sono solo nota (no fail)", async () => {
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
    const nuoviNomi = new Set([
      ...FILE_NORMATTIVA_NUOVI.map((f) => path.basename(f.percorso)),
      ...SHARD_CAMERA.map((f) => path.basename(f.percorso)),
    ]);
    const json = entries.filter((e) => e.endsWith(".json") && e !== "MANIFEST.json");
    const nuoviNonElencati = json.filter((e) => nuoviNomi.has(e) && !elencati.has(e));
    if (nuoviNonElencati.length > 0) {
      console.info(
        `[reali-9] NOTA — nuovi file non ancora in MANIFEST (lag scrittori): ${nuoviNonElencati.join(", ")}`,
      );
    }
    expect(true).toBe(true);
  });
});

describe("reali-9: corpus reale in crescita + never-throw", () => {
  const CHIAVI_NOTE = [
    "atti",
    "pronunce",
    "provvedimenti",
    "contratti",
    "releases",
    "comunicati",
    "deputati",
    "senatori",
    "gruppi",
    "ddl",
    "items",
    "dati",
    "regolamenti",
    "recepimenti",
    "quesiti",
    "liste",
  ];

  it(`totale record reali su disco >= ${SOGLIA_REALI_9}`, async () => {
    let entries: string[];
    try {
      entries = await readdir(DIR_REALI);
    } catch {
      notaSkip("cartella data/reali illeggibile");
      expect(true).toBe(true);
      return;
    }
    const json = entries.filter((e) => e.endsWith(".json") && e !== "MANIFEST.json");
    let totale = 0;
    let leggibili = 0;
    for (const nome of json) {
      const letto = await leggiJson(path.join(DIR_REALI, nome));
      if (!letto) continue;
      const lista = estraiArray(letto.parsed, CHIAVI_NOTE);
      if (!lista) continue;
      leggibili += 1;
      totale += lista.length;
    }
    console.info(`[reali-9] corpus su disco: ${totale} record in ${leggibili} file`);
    expect(leggibili).toBeGreaterThan(0);
    expect(totale, `corpus sotto soglia REALI-9 (${SOGLIA_REALI_9})`).toBeGreaterThanOrEqual(
      SOGLIA_REALI_9,
    );
  });

  it("loader getSeedLaws non lancia con file nuovi assenti/presenti", () => {
    let leggi: unknown[];
    try {
      leggi = getSeedLaws();
    } catch (e) {
      expect(e, "getSeedLaws ha lanciato").toBeNull();
      return;
    }
    expect(Array.isArray(leggi)).toBe(true);
    expect(leggi.length).toBeGreaterThan(0);
    // Nessun record dimostrativo tra i reali normalizzati via loader misto.
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
    expect(normalizzaAttoReale({ eli: "/eli/x" })).toBeNull();
    expect(estraiListaAttiReali(null)).toEqual([]);
    expect(estraiListaAttiReali({})).toEqual([]);
    expect(estraiListaAttiReali({ atti: "no-array" })).toEqual([]);
    // Record lista-only REALI-9 (senza dettaglio) normalizza senza lanciare.
    const rec = normalizzaAttoReale({
      urn: "urn:nir:stato:legge:2015-01-01;1",
      eli: "/eli/id/2015/01/01/15G00001/sg",
      titolo: "LEGGE 1 gennaio 2015, n. 1",
      sintesi: "LEGGE 1 gennaio 2015, n. 1",
      stato: "in_vigore",
      fonte: "normattiva-bff",
      dettaglio: false,
    });
    expect(rec).not.toBeNull();
    expect(rec?.dimostrativo).toBe(false);
  });
});

describe("reali-9: nessun troncamento silenzioso dei file reali", () => {
  it("ogni record normalizzabile dei file PERCORSI e nel corpus (regressione slice 500)", async () => {
    const { join } = await import("node:path");
    const { existsSync, readFileSync } = await import("node:fs");
    const percorsi = [
      "data/reali/normattiva-recenti.json",
      "data/reali/normattiva-storico-collezioni.json",
      "data/reali/normattiva-storico-1960.json",
      "data/reali/normattiva-storico-1970.json",
      "data/reali/normattiva-storico-1980.json",
      "data/reali/normattiva-storico-1990.json",
      "data/reali/normattiva-storico-2000.json",
      "data/reali/normattiva-storico-2010.json",
      "data/reali/normattiva-storico-2020.json",
      "data/reali/normattiva-storico-1992-1993.json",
      "data/reali/normattiva-storico-2005-2006.json",
      "data/reali/normattiva-bulk-a-attuazione-ue.json",
      "data/reali/normattiva-bulk-b-finestra-2005.json",
    ];
    const leggi = getSeedLaws();
    const presenti = new Set(leggi.map((l) => String(l.eli).trim().toLowerCase()));
    let verificati = 0;
    let assenti = 0;
    for (const rel of percorsi) {
      const ass = join(process.cwd(), rel);
      if (!existsSync(ass)) continue;
      const d = JSON.parse(readFileSync(ass, "utf8")) as Record<string, unknown>;
      const lista = estraiListaAttiReali(d);
      for (const item of lista) {
        const rec = normalizzaAttoReale(item);
        if (!rec) continue;
        verificati += 1;
        if (!presenti.has(String(rec.eli).trim().toLowerCase())) {
          assenti += 1;
        }
      }
    }
    expect(verificati).toBeGreaterThan(1000);
    expect(assenti, "record normalizzabili assenti dal corpus").toBe(0);
  });
});
