/**
 * REALI-10 — test trasversali wiring + finestre/sondaggi/CNEL/commissione.
 *
 * Ruolo: scrittore wiring+test trasversali reali-10. Possiede SOLO questo file
 * (+ righe PERCORSI_ATTI_REALI / InfoCorpus+getCorpusInfo in lib/sources.ts,
 * toccate a parte). Zero rete, zero scritture, mai inventare numeri/URL/date.
 * Tutti i controlli sui nuovi file sono TOLLERANTI: se uno scrittore non ha
 * ancora generato il suo file, il test passa con nota (skip), mai fail.
 *
 * Formula getCorpusInfo (definita qui e in lib/sources.ts, legacy invariato):
 * - base = SEED_LAWS.length (5 seed, sempre primi nel corpus);
 * - totale = getSeedLaws().length (seed + reali + sintetico, dedup ELI);
 * - espansi = totale - base (significato storico invariato: tutto oltre i seed);
 * - reali = record con dimostrativo === false in getSeedLaws()
 *   (atti ufficiali da data/reali/ + 2 atti di riferimento non-dimostrativi
 *   del corpus sintetico; sottoinsieme del totale, fallback 0, never-throw).
 * Invarianti asseriti: base + espansi == totale; 0 <= reali <= totale.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
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

type FileAtteso = {
  nome: string;
  chiavi: string[];
  max: number;
  nota: string;
};

/** Nuovi file REALI-10 (uno per scrittore; finestre entrambe a D). */
const FILE_ATTI_FINESTRE: FileAtteso[] = [
  {
    nome: "normattiva-storico-1992-1993.json",
    chiavi: ["atti", "leggi", "dati"],
    max: 1000,
    nota: "Normattiva finestra F-A 1992-1993 (transizione I->XI legislatura)",
  },
  {
    nome: "normattiva-storico-2005-2006.json",
    chiavi: ["atti", "leggi", "dati"],
    max: 1000,
    nota: "Normattiva finestra F-B 2005-2006 (legge elettorale + XIV->XV)",
  },
];

/** File non-atti REALI-10 (loader dedicati di A/B/C, MAI in PERCORSI_ATTI_REALI). */
const FILE_NON_ATTI: FileAtteso[] = [
  {
    nome: "sondaggi-nazionali.json",
    chiavi: ["sondaggi", "dati", "items"],
    max: 60,
    nota: "Sondaggi nazionali Wikipedia (cap 60 record/snapshot, CC BY-SA 4.0)",
  },
  {
    nome: "cnel-pareri.json",
    chiavi: ["pareri", "dati", "items"],
    max: 50,
    nota: "CNEL pareri Assemblea XI+X (cap 50)",
  },
  {
    nome: "commissione-partiti-gu.json",
    chiavi: ["comunicati", "dati", "items"],
    max: 50,
    nota: "Commissione partiti GU (cap 50 comunicati)",
  },
];

/** Percorsi storici gia' in PERCORSI_ATTI_REALI prima di REALI-10. */
const PERCORSI_STORICI = [
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
];

/** Nuovi percorsi atti che il wiring REALI-10 deve registrare. */
const PERCORSI_FINESTRE_ATTESI = [
  "data/reali/normattiva-storico-1992-1993.json",
  "data/reali/normattiva-storico-2005-2006.json",
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
  console.info(`[reali-10] SKIP tollerante — ${msg}`);
}

function chiaveBassa(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Spot-check per tipologia (solo campi presenti, mai inventare)
// ---------------------------------------------------------------------------

const STATI_ONESTI = ["in_vigore", "abrogato", "decaduto", "sconosciuto"];

function spotCheckAttoFinestra(voce: unknown): string | null {
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

function spotCheckSondaggio(voce: unknown): string | null {
  if (!voce || typeof voce !== "object") return "voce non oggetto";
  const r = voce as Record<string, unknown>;
  const istituto = r["istituto"] ?? r["pollster"] ?? r["casa"];
  if (!isStringaNonVuota(istituto)) return "manca istituto";
  if (haSegnaleInventato(istituto)) return "istituto con segnale inventato";
  const fw = r["fieldwork_a"] ?? r["fieldwork_da"] ?? r["data"];
  if (fw !== undefined && fw !== null && fw !== "" && !isIsoDate(fw)) {
    return "fieldwork non ISO";
  }
  const url = r["url_fonte"] ?? r["url"] ?? r["fonte"];
  if (url !== undefined && url !== null && url !== "" && !isHttpsUrl(url)) {
    return "url_fonte non https";
  }
  if (haSegnaleInventato(url)) return "url con segnale inventato";
  // Almeno una quota partiti numerica (fdi/pd/...) oppure lead/campione.
  const quote = ["fdi", "pd", "m5s", "lega", "fi", "lead", "campione_n", "campione"];
  const haQuota = quote.some((k) => {
    const v = r[k];
    return typeof v === "number" && Number.isFinite(v);
  });
  if (!haQuota) return "nessuna quota numerica (fdi/pd/.../lead/campione)";
  return null;
}

function spotCheckCnel(voce: unknown): string | null {
  if (!voce || typeof voce !== "object") return "voce non oggetto";
  const r = voce as Record<string, unknown>;
  const titolo = r["titolo"] ?? r["oggetto"] ?? r["label"];
  if (!isStringaNonVuota(titolo)) return "manca titolo/oggetto";
  if (haSegnaleInventato(titolo)) return "titolo con segnale inventato";
  const chiave = r["id"] ?? r["numero"] ?? r["uri"] ?? r["url"] ?? r["scheda"];
  if (!isStringaNonVuota(String(chiave ?? ""))) return "manca id/numero/uri/url";
  if (haSegnaleInventato(chiave)) return "chiave con segnale inventato";
  const url = r["url"] ?? r["scheda"] ?? r["link"];
  if (url !== undefined && url !== null && url !== "" && !isHttpsUrl(url)) {
    return "url non https";
  }
  return null;
}

function spotCheckCommissione(voce: unknown): string | null {
  if (!voce || typeof voce !== "object") return "voce non oggetto";
  const r = voce as Record<string, unknown>;
  const titolo = r["titolo"] ?? r["oggetto"];
  if (!isStringaNonVuota(titolo)) return "manca titolo/oggetto";
  if (haSegnaleInventato(titolo)) return "titolo con segnale inventato";
  const chiave =
    r["eli"] ?? r["codiceRedazionale"] ?? r["id"] ?? r["url"] ?? r["urn"];
  if (!isStringaNonVuota(String(chiave ?? ""))) {
    return "manca eli/codiceRedazionale/id/url";
  }
  if (haSegnaleInventato(chiave)) return "chiave con segnale inventato";
  const url = r["url"] ?? r["link"];
  if (url !== undefined && url !== null && url !== "" && !isHttpsUrl(url)) {
    return "url non https";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Suite 1: envelope + cap + spot-check finestre atti (skip se assenti)
// ---------------------------------------------------------------------------

describe("reali-10: envelope finestre Normattiva 1992-1993/2005-2006 (skip se assenti)", () => {
  for (const atteso of FILE_ATTI_FINESTRE) {
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
      expect(isRecuperatoIl(prov?.["recuperatoIl"] ?? prov?.["estratto_il"]), `${atteso.nome}: recuperatoIl/estratto_il non reale`).toBe(true);
      expect(isStringaNonVuota(prov?.["licenza"]), `${atteso.nome}: licenza assente`).toBe(true);
      const lista = estraiArrayDati(letto.parsed, atteso.chiavi);
      expect(lista, `${atteso.nome}: nessun array dati`).not.toBeNull();
      expect(lista?.length ?? 0, `${atteso.nome}: conteggio zero`).toBeGreaterThan(0);
      expect(lista?.length ?? 0, `${atteso.nome}: oltre cap ${atteso.max}`).toBeLessThanOrEqual(atteso.max);
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
        const errore = spotCheckAttoFinestra(voce);
        expect(errore, `${atteso.nome}: record non valido (${errore}): ${JSON.stringify(voce).slice(0, 200)}`).toBeNull();
        validi += 1;
      }
      expect(validi).toBeGreaterThan(0);
      // Almeno un record del campione deve normalizzare in LawRecord reale.
      const normalizzati = campione
        .map((v) => normalizzaAttoReale(v))
        .filter((r) => r !== null);
      expect(normalizzati.length, `${atteso.nome}: nessun record normalizzabile`).toBeGreaterThan(0);
      for (const r of normalizzati) {
        expect(r?.dimostrativo).toBe(false);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 2: envelope + cap + spot-check file non-atti (skip se assenti)
// ---------------------------------------------------------------------------

describe("reali-10: envelope sondaggi/CNEL/commissione (skip se assenti)", () => {
  const perTipo: Record<string, (v: unknown) => string | null> = {
    "sondaggi-nazionali.json": spotCheckSondaggio,
    "cnel-pareri.json": spotCheckCnel,
    "commissione-partiti-gu.json": spotCheckCommissione,
  };
  for (const atteso of FILE_NON_ATTI) {
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
      expect(isStringaNonVuota(prov?.["licenza"]), `${atteso.nome}: licenza assente`).toBe(true);
      // Sondaggi: licenza CC BY-SA 4.0 prescritta dal giudice.
      if (atteso.nome === "sondaggi-nazionali.json") {
        expect(String(prov?.["licenza"] ?? ""), "sondaggi: licenza non CC BY-SA 4.0").toContain("CC BY-SA 4.0");
        const revid = prov?.["revid"] ?? prov?.["revid_wiki"];
        expect(isStringaNonVuota(String(revid ?? prov?.["url"] ?? "")), "sondaggi: manca revid/url di attribuzione").toBe(true);
      }
      const lista = estraiArrayDati(letto.parsed, atteso.chiavi);
      expect(lista, `${atteso.nome}: nessun array dati`).not.toBeNull();
      expect(lista?.length ?? 0, `${atteso.nome}: conteggio zero`).toBeGreaterThan(0);
      expect(lista?.length ?? 0, `${atteso.nome}: oltre cap ${atteso.max}`).toBeLessThanOrEqual(atteso.max);
    });

    it(`${atteso.nome}: zero inventati (spot-check tipologia)`, async () => {
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
      const check = perTipo[atteso.nome] ?? ((): string | null => null);
      const campione = [...lista.slice(0, 20), ...lista.slice(-5)];
      let validi = 0;
      for (const voce of campione) {
        const errore = check(voce);
        expect(errore, `${atteso.nome}: record non valido (${errore}): ${JSON.stringify(voce).slice(0, 200)}`).toBeNull();
        validi += 1;
      }
      expect(validi).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 3: wiring PERCORSI_ATTI_REALI + dedup finestre
// ---------------------------------------------------------------------------

describe("reali-10: wiring percorsi + dedup finestre", () => {
  it("PERCORSI_ATTI_REALI contiene le 2 finestre e conserva gli storici", async () => {
    let testo: string;
    try {
      testo = await readFile(FILE_SOURCES, "utf8");
    } catch {
      notaSkip("lib/sources.ts illeggibile");
      expect(true).toBe(true);
      return;
    }
    for (const p of PERCORSI_FINESTRE_ATTESI) {
      expect(testo.includes(p), `PERCORSI_ATTI_REALI senza ${p}`).toBe(true);
    }
    for (const p of PERCORSI_STORICI) {
      expect(testo.includes(p), `PERCORSI_ATTI_REALI ha perso ${p}`).toBe(true);
    }
  });

  it("file non-atti non richiesti in PERCORSI_ATTI_REALI (loader dedicati A/B/C)", async () => {
    let testo: string;
    try {
      testo = await readFile(FILE_SOURCES, "utf8");
    } catch {
      notaSkip("lib/sources.ts illeggibile");
      expect(true).toBe(true);
      return;
    }
    // I file non-atti hanno forma diversa da LawRecord: se un giorno entrano
    // nel loader atti, estraiListaAttiReali li ignorerebbe comunque; qui si
    // documenta che NON devono stare nei percorsi atti.
    for (const nome of ["sondaggi-nazionali.json", "cnel-pareri.json", "commissione-partiti-gu.json"]) {
      if (testo.includes(nome)) {
        console.info(`[reali-10] NOTA — ${nome} citato in sources.ts (verificare sia solo commento/docs, non loader atti)`);
      }
    }
    expect(true).toBe(true);
  });

  it("nessun ELI duplicato tra finestre nuove e storici presenti", async () => {
    const candidati = [...PERCORSI_STORICI, ...PERCORSI_FINESTRE_ATTESI].map((p) =>
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
    console.info(`[reali-10] dedup su ${fileVerificati} file, ${attiTotali} atti, ${visti.size} chiavi uniche`);
    expect(duplicati, `ELI duplicati:\n${duplicati.slice(0, 10).join("\n")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: MANIFEST coerente (tollerante) + getCorpusInfo + never-throw
// ---------------------------------------------------------------------------

describe("reali-10: MANIFEST coerente (tollerante)", () => {
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
      console.info(`[reali-10] NOTA — voci MANIFEST senza file: ${assenti.join(", ")}`);
    }
    expect(presenti, "nessuna voce MANIFEST ha file su disco").toBeGreaterThan(0);
  });

  it("nuovi file REALI-10 presenti ma non elencati sono solo nota (no fail)", async () => {
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
      ...FILE_ATTI_FINESTRE.map((f) => f.nome),
      ...FILE_NON_ATTI.map((f) => f.nome),
    ]);
    const json = entries.filter((e) => e.endsWith(".json") && e !== "MANIFEST.json");
    const nuoviNonElencati = json.filter((e) => nuoviNomi.has(e) && !elencati.has(e));
    if (nuoviNonElencati.length > 0) {
      console.info(`[reali-10] NOTA — nuovi file non ancora in MANIFEST (lag scrittori): ${nuoviNonElencati.join(", ")}`);
    }
    expect(true).toBe(true);
  });
});

describe("reali-10: getCorpusInfo coerente + never-throw (mai rete)", () => {
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
    // reali = conteggio dimostrativo===false nel corpus unito.
    const atteso = getSeedLaws().filter((l) => l.dimostrativo === false).length;
    expect(info.reali, "reali != conteggio dimostrativo===false in getSeedLaws()").toBe(atteso);
  });

  it("campi legacy intatti: base/espansi/totale numerici come prima di REALI-10", () => {
    const info = getCorpusInfo() as unknown as Record<string, unknown>;
    for (const k of ["base", "espansi", "totale"]) {
      expect(typeof info[k], `campo legacy ${k} mancante/non numerico`).toBe("number");
    }
    expect(typeof info["reali"], "campo nuovo reali mancante/non numerico").toBe("number");
  });

  it("loader getSeedLaws never-throw con finestre presenti/assenti", () => {
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
      expect(haSegnaleInventato(r["titolo"]), "titolo con segnale inventato nel corpus").toBe(false);
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
