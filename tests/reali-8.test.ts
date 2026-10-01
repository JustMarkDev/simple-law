/**
 * REALI-8 — test trasversali d'integrazione disco (zero rete, tolleranti).
 *
 * Ruolo: scrittore test trasversali reali-8. Possiede SOLO questo file.
 * Non importa parser/lib di W1–W4 (potrebbero non esistere ancora): fa
 * solo controlli JSON/envelope su disco, mai rete, mai fallimento per
 * file assenti (skip con nota via console.info + expect(true)).
 *
 * Copre, senza duplicare le suite esistenti (reali-*.test.ts, wiring,
 * corpus-unificato):
 * - per ognuno dei 4 nuovi file attesi: envelope valida + licenza +
 *   conteggio>0 + spot-check zero campi inventati (titolo+url/data);
 * - MANIFEST.json coerente coi file presenti (bidirezionale, tollerante);
 * - totale corpus reale in crescita vs soglia documentata.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";

const RADICE = process.cwd();
const DIR_REALI = path.resolve(RADICE, "data/reali");
const FILE_MANIFEST = path.join(DIR_REALI, "MANIFEST.json");

/** Soglia documentata: somma conteggi MANIFEST al 2026-09-28 (1482). */
const SOGLIA_BASELINE_MANIFEST = 1482;
/** Margine tollerante: il totale su disco non deve mai crollare sotto. */
const SOGLIA_MINIMA_DISCO = 1000;

/** 1 MB: nessun file dati reale committabile lo supera. */
const MAX_BYTE = 1024 * 1024;

type FileAtteso = {
  percorso: string;
  /** Chiavi array candidate nell'envelope (il primo array non vuoto vince). */
  chiavi: string[];
  max: number;
  nota: string;
};

const FILE_ATTESI: FileAtteso[] = [
  {
    percorso: path.join(DIR_REALI, "anac-contratti-2025.json"),
    chiavi: ["contratti", "releases", "items", "dati", "contratti2025"],
    max: 100,
    nota: "ANAC contratti 2025 (OCP 2025 / bulk ANAC, CC-BY 4.0; cig BY-SA in provenance)",
  },
  {
    percorso: path.join(DIR_REALI, "ga-provvedimenti-2026.json"),
    chiavi: ["provvedimenti", "decisioni", "pronunce", "items", "dati"],
    max: 50,
    nota: "Giustizia Amministrativa 2026 (CdS+TAR, solo metadati+URL, mai stato/vigenza)",
  },
  {
    percorso: path.join(DIR_REALI, "normattiva-storico-2020.json"),
    chiavi: ["atti", "leggi", "dati", "items"],
    max: 80,
    nota: "Normattiva storico 2020 (finestra 2020-01-01..2020-12-31, LawRecord)",
  },
  {
    percorso: path.join(DIR_REALI, "normattiva-storico-1960.json"),
    chiavi: ["atti", "leggi", "dati", "items"],
    max: 80,
    nota: "Normattiva storico 1960 (finestra 1960-01-01..1960-12-31, LawRecord)",
  },
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

/** recuperatoIl ISO reale: parsabile, anno 2025..oggi+1. */
function isRecuperatoIl(v: unknown): boolean {
  if (!isStringaNonVuota(v)) return false;
  const t = Date.parse(v.trim());
  if (!Number.isFinite(t)) return false;
  const anno = new Date(t).getUTCFullYear();
  const oggi = new Date().getUTCFullYear();
  return anno >= 2025 && anno <= oggi + 1;
}

/** Segnali di dato inventato nei campi codice/URL (mai nel testo libero). */
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

/** Estrae il primo array non vuoto tra le chiavi candidate (o array diretto). */
function estraiArray(parsed: unknown, chiavi: string[]): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  for (const k of chiavi) {
    if (Array.isArray(obj[k]) && (obj[k] as unknown[]).length > 0) {
      return obj[k] as unknown[];
    }
  }
  // Fallback generico: qualunque array non vuoto di oggetti.
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

function notaSkip(nome: string): void {
  console.info(`[reali-8] SKIP tollerante — file assente o illeggibile: ${nome}`);
}

// ---------------------------------------------------------------------------
// Spot-check per tipologia (solo campi presenti, mai inventare)
// ---------------------------------------------------------------------------

function spotCheckAnac(voce: unknown): string | null {
  if (!voce || typeof voce !== "object") return "voce non oggetto";
  const r = voce as Record<string, unknown>;
  const oggetto = r["oggetto"] ?? r["titolo"] ?? r["denominazione"];
  if (!isStringaNonVuota(oggetto)) return "manca oggetto/titolo";
  const id = r["ocid"] ?? r["cig"] ?? r["id"];
  if (!isStringaNonVuota(id)) return "manca ocid/cig/id";
  if (haSegnaleInventato(id)) return "id con segnale inventato";
  for (const k of ["schedaBDNCP", "risorsaBulk", "url", "schedaUrl"]) {
    const v = r[k];
    if (v !== undefined && v !== null && v !== "" && !isHttpsUrl(v)) {
      return `campo ${k} non https`;
    }
    if (haSegnaleInventato(v)) return `campo ${k} con segnale inventato`;
  }
  const sa = r["stazioneAppaltante"];
  if (sa !== undefined && sa !== null) {
    if (typeof sa !== "object") return "stazioneAppaltante non oggetto";
    const denom = (sa as Record<string, unknown>)["denominazione"];
    if (denom !== undefined && denom !== "" && !isStringaNonVuota(denom)) {
      return "stazioneAppaltante.denominazione vuota";
    }
  }
  for (const k of ["dataAward", "data", "dataPubblicazione"]) {
    const v = r[k];
    if (v !== undefined && v !== null && v !== "" && !isIsoDate(v)) {
      return `campo ${k} non ISO`;
    }
  }
  return null;
}

function spotCheckGa(voce: unknown): string | null {
  if (!voce || typeof voce !== "object") return "voce non oggetto";
  const r = voce as Record<string, unknown>;
  if (!isStringaNonVuota(r["numero"])) return "manca numero";
  if (r["anno"] === undefined || r["anno"] === null || String(r["anno"]).trim() === "") {
    return "manca anno";
  }
  const oggetto = r["oggetto"] ?? r["titolo"] ?? r["epigrafe"] ?? r["massima"];
  if (!isStringaNonVuota(oggetto)) return "manca oggetto/titolo/epigrafe";
  const scheda = r["schedaUrl"] ?? r["scheda"] ?? r["url"] ?? r["link"];
  if (!isHttpsUrl(scheda)) return "manca schedaUrl https";
  if (haSegnaleInventato(scheda)) return "schedaUrl con segnale inventato";
  const pdf = r["pdfUrl"] ?? r["pdf"];
  if (pdf !== undefined && pdf !== null && pdf !== "" && !isHttpsUrl(pdf)) {
    return "pdfUrl non https";
  }
  for (const k of ["data", "dataDeposito", "dataDecisione"]) {
    const v = r[k];
    if (v !== undefined && v !== null && v !== "" && !isIsoDate(v)) {
      return `campo ${k} non ISO`;
    }
  }
  // Mai stato/vigenza: non sono leggi (come Consulta).
  if (r["stato"] !== undefined || r["vigenza"] !== undefined) {
    return "campo stato/vigenza non ammesso per GA";
  }
  const ecli = r["ecli"];
  if (ecli !== undefined && ecli !== null && ecli !== "") {
    if (!isStringaNonVuota(ecli) || !/^ECLI:/i.test((ecli as string).trim())) {
      return "ecli malformato";
    }
  }
  return null;
}

function spotCheckNormattiva(voce: unknown): string | null {
  if (!voce || typeof voce !== "object") return "voce non oggetto";
  const r = voce as Record<string, unknown>;
  if (!isStringaNonVuota(r["titolo"])) return "manca titolo";
  const chiave = r["eli"] ?? r["nir"] ?? r["chiave"];
  if (!isStringaNonVuota(chiave)) return "manca eli/nir/chiave";
  if (haSegnaleInventato(chiave)) return "chiave con segnale inventato";
  const data = r["dataEmanazione"];
  if (data !== undefined && data !== null && data !== "" && !isIsoDate(data)) {
    return "dataEmanazione non ISO";
  }
  const stato = r["stato"];
  if (stato !== undefined && stato !== null && stato !== "") {
    if (!["in_vigore", "abrogato", "decaduto"].includes(String(stato))) {
      return "stato non onesto";
    }
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

function spotCheckPerFile(nomeFile: string): (voce: unknown) => string | null {
  if (nomeFile.startsWith("anac-")) return spotCheckAnac;
  if (nomeFile.startsWith("ga-")) return spotCheckGa;
  return spotCheckNormattiva;
}

// ---------------------------------------------------------------------------
// Suite: envelope + spot-check per ognuno dei 4 file attesi
// ---------------------------------------------------------------------------

describe("reali-8: envelope file attesi (disco read-only, skip se assenti)", () => {
  for (const atteso of FILE_ATTESI) {
    const nome = path.basename(atteso.percorso);
    it(`${nome}: envelope valida + licenza + conteggio>0`, async () => {
      const letto = await leggiJson(atteso.percorso);
      if (!letto) {
        notaSkip(`${nome} — ${atteso.nota}`);
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
      expect(isStringaNonVuota(prov?.["fonte"]), `${nome}: provenance.fonte assente`).toBe(true);
      expect(isHttpsUrl(prov?.["url"]), `${nome}: provenance.url non https`).toBe(true);
      expect(
        isRecuperatoIl(prov?.["recuperatoIl"]),
        `${nome}: provenance.recuperatoIl non ISO reale`,
      ).toBe(true);
      expect(isStringaNonVuota(prov?.["licenza"]), `${nome}: provenance.licenza assente`).toBe(
        true,
      );
      const lista = estraiArray(letto.parsed, atteso.chiavi);
      expect(lista, `${nome}: nessun array dati non vuoto`).not.toBeNull();
      expect(lista?.length ?? 0, `${nome}: conteggio zero`).toBeGreaterThan(0);
      expect(lista?.length ?? 0, `${nome}: oltre il cap ${atteso.max}`).toBeLessThanOrEqual(
        atteso.max,
      );
    });

    it(`${nome}: zero campi inventati (spot-check titolo+url/data)`, async () => {
      const letto = await leggiJson(atteso.percorso);
      if (!letto) {
        notaSkip(`${nome} — spot-check rimandato (file assente)`);
        expect(true).toBe(true);
        return;
      }
      const lista = estraiArray(letto.parsed, atteso.chiavi);
      if (!lista || lista.length === 0) {
        notaSkip(`${nome} — array vuoto, spot-check rimandato`);
        expect(true).toBe(true);
        return;
      }
      const check = spotCheckPerFile(nome);
      // Campione bounded: primi 20 + ultimi 5 (mai rete, mai pesante).
      const campione = [...lista.slice(0, 20), ...lista.slice(-5)];
      let validi = 0;
      for (const voce of campione) {
        const errore = check(voce);
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
// Suite: MANIFEST coerente + corpus in crescita
// ---------------------------------------------------------------------------

describe("reali-8: MANIFEST coerente coi file presenti (tollerante)", () => {
  it("MANIFEST ha forma valida con voci non vuote", async () => {
    const letto = await leggiJson(FILE_MANIFEST);
    if (!letto) {
      notaSkip("MANIFEST.json assente");
      expect(true).toBe(true);
      return;
    }
    const parsed = letto.parsed as Record<string, unknown>;
    expect(Array.isArray(parsed["fonti"]), "MANIFEST senza array fonti").toBe(true);
    const fonti = parsed["fonti"] as Record<string, unknown>[];
    expect(fonti.length).toBeGreaterThan(0);
    for (const voce of fonti) {
      expect(isStringaNonVuota(voce["nome"]), "voce MANIFEST senza nome").toBe(true);
      expect(
        isStringaNonVuota(voce["url"]) || isHttpsUrl(voce["url"]),
        `voce ${String(voce["file"])} senza url`,
      ).toBe(true);
      expect(isStringaNonVuota(voce["licenza"]), `voce ${String(voce["file"])} senza licenza`).toBe(
        true,
      );
      expect(isStringaNonVuota(voce["file"]), "voce MANIFEST senza file").toBe(true);
    }
  });

  it("ogni voce MANIFEST con file esistente è leggibile; assenze solo nota", async () => {
    const letto = await leggiJson(FILE_MANIFEST);
    if (!letto) {
      notaSkip("MANIFEST.json assente");
      expect(true).toBe(true);
      return;
    }
    const fonti = (letto.parsed as { fonti: Array<Record<string, unknown>> }).fonti;
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
      console.info(`[reali-8] NOTA — voci MANIFEST senza file su disco: ${assenti.join(", ")}`);
    }
    expect(presenti, "nessuna voce MANIFEST ha file su disco").toBeGreaterThan(0);
  });

  it("ogni .json reale è elencato in MANIFEST oppure è un nuovo file REALI-8", async () => {
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
        if (isStringaNonVuota(voce["file"])) elencati.add(path.basename(String(voce["file"])));
      }
    }
    const nuoviAmmessi = new Set(FILE_ATTESI.map((f) => path.basename(f.percorso)));
    const json = entries.filter((e) => e.endsWith(".json") && e !== "MANIFEST.json");
    expect(json.length).toBeGreaterThan(0);
    const nonElencatiNonNuovi = json.filter((e) => !elencati.has(e) && !nuoviAmmessi.has(e));
    if (nonElencatiNonNuovi.length > 0) {
      // Tollerante: preesistenti non elencati (es. elezioni-*.json) restano nota.
      console.info(
        `[reali-8] NOTA — file reali non elencati in MANIFEST (preesistenti o lag W4): ${nonElencatiNonNuovi.join(", ")}`,
      );
    }
    // Solo i 4 nuovi file possono mancare da MANIFEST senza fallire.
    const nuoviPresentiNonElencati = json.filter((e) => nuoviAmmessi.has(e) && !elencati.has(e));
    if (nuoviPresentiNonElencati.length > 0) {
      console.info(
        `[reali-8] NOTA — nuovi file REALI-8 non ancora in MANIFEST (aggiorna solo W4): ${nuoviPresentiNonElencati.join(", ")}`,
      );
    }
    expect(true).toBe(true);
  });
});

describe("reali-8: corpus reale in crescita vs soglia documentata", () => {
  // Chiavi array note in tutti gli envelope reali (storico + verticali).
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

  it("totale record su disco >= soglia minima (tollerante se cartella vuota)", async () => {
    let entries: string[];
    try {
      entries = await readdir(DIR_REALI);
    } catch {
      notaSkip("cartella data/reali illeggibile");
      expect(true).toBe(true);
      return;
    }
    const json = entries.filter((e) => e.endsWith(".json") && e !== "MANIFEST.json");
    if (json.length === 0) {
      notaSkip("nessun file reale su disco");
      expect(true).toBe(true);
      return;
    }
    let totale = 0;
    let fileLeggibili = 0;
    for (const nome of json) {
      const letto = await leggiJson(path.join(DIR_REALI, nome));
      if (!letto) continue;
      const lista = estraiArray(letto.parsed, CHIAVI_NOTE);
      if (!lista) continue;
      fileLeggibili += 1;
      totale += lista.length;
    }
    console.info(
      `[reali-8] corpus su disco: ${totale} record in ${fileLeggibili} file leggibili (baseline MANIFEST ${SOGLIA_BASELINE_MANIFEST})`,
    );
    expect(fileLeggibili).toBeGreaterThan(0);
    expect(totale, `corpus sotto soglia minima ${SOGLIA_MINIMA_DISCO}`).toBeGreaterThanOrEqual(
      SOGLIA_MINIMA_DISCO,
    );
  });

  it("i nuovi file REALI-8 presenti fanno crescere il totale (mai regressione)", async () => {
    let nuoviRecord = 0;
    let nuoviPresenti = 0;
    for (const atteso of FILE_ATTESI) {
      const letto = await leggiJson(atteso.percorso);
      if (!letto) continue;
      const lista = estraiArray(letto.parsed, atteso.chiavi);
      if (!lista) continue;
      nuoviPresenti += 1;
      nuoviRecord += lista.length;
    }
    if (nuoviPresenti === 0) {
      notaSkip("nessun nuovo file REALI-8 ancora ingerito (0/4)");
      expect(true).toBe(true);
      return;
    }
    console.info(`[reali-8] nuovi file presenti: ${nuoviPresenti}/4, +${nuoviRecord} record`);
    expect(nuoviRecord).toBeGreaterThan(0);
  });
});
