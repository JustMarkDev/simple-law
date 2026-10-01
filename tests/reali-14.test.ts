/**
 * REALI-14 — test trasversali wiring + finanziamenti + regionali residue +
 * finestre Normattiva 2012/2018 (zero rete, tolleranti).
 *
 * Ruolo: scrittore wiring+test+perimetro REALI-14. Possiede SOLO questo file
 * (+ righe PERCORSI_ATTI_REALI in lib/sources.ts, righe registry nuove
 * consultazioni in lib/elezioni-dati.ts, app/elezioni/** e app/api/elezioni/**,
 * docs/PERIMETRO-FONTI.md). Zero rete, zero scritture, mai inventare
 * numeri/URL/date/stati. Tutti i controlli sui nuovi file sono TOLLERANTI:
 * se gli altri scrittori non hanno ancora generato il loro file, il test
 * passa con nota (skip), mai fail. I loader su disco saltano gli assenti.
 *
 * Nuovi file REALI-14 (assegnazione disgiunta):
 * - W1 Finanziamenti (solo beneficiario×anno, zero nominativi eroganti):
 *   data/reali/finanziamenti-erogazioni-2024-2026.json (max 50 voci).
 * - W2 Regionali-ER: data/reali/elezioni-regionali-2024-emilia-romagna.json.
 * - W3 Regionali-Sud: data/reali/elezioni-regionali-2025-campania.json,
 *   data/reali/elezioni-regionali-2025-puglia.json,
 *   data/reali/elezioni-regionali-2025-veneto.json (ognuno <=950KB).
 * - W4 Finestre Normattiva (cap 80 atti/finestra, stesso schema 2020):
 *   data/reali/normattiva-storico-2012.json,
 *   data/reali/normattiva-storico-2018.json.
 *
 * Formula getCorpusInfo (definita in lib/sources.ts, legacy invariato):
 * base = 5 seed; totale = getSeedLaws().length; espansi = totale - base;
 * reali = record con dimostrativo === false.
 *
 * Soglia REALI-14: reali >= 1763 (misurati il 2026-09-28 con corpus 6766:
 * 5 seed + 1763 reali dimostrativo=false + ~4998 sintetici). Con le finestre
 * 2012/2018 presenti il conteggio cresce, con file assenti resta uguale:
 * per questo la soglia e' >= (tollerante), mai > stretto. Mai rete.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import {
  caricaRegionale,
  caricaRegionaleResult,
  elencaRegionali,
  normalizzaIdRegionale,
  voceRegistroRegionale,
} from "../lib/elezioni-dati";
import {
  estraiListaAttiReali,
  getCorpusInfo,
  getSeedLaws,
  normalizzaAttoReale,
} from "../lib/sources";

const RADICE = process.cwd();
const DIR_REALI = path.resolve(RADICE, "data/reali");
const FILE_SOURCES = path.resolve(RADICE, "lib/sources.ts");
const FILE_ELEZIONI_DATI = path.resolve(RADICE, "lib/elezioni-dati.ts");
const FILE_HUB = path.resolve(RADICE, "app/elezioni/page.tsx");
const FILE_DETTAGLIO = path.resolve(RADICE, "app/elezioni/[id]/page.tsx");
const FILE_API_REGIONALE = path.resolve(RADICE, "app/api/elezioni/regionali/[id]/route.ts");

/** 1 MB: cap hard, nessun file dati reale committabile lo supera. */
const MAX_BYTE = 1024 * 1024;
/** 950 KB: cap hard elezioni (cfr. direttive REALI-13/14). */
const MAX_BYTE_ELEZIONI = 950 * 1024;

/** Soglia REALI-14: corpus reale in crescita (precedente 1763, corpus 6766). */
const SOGLIA_REALI_14 = 1763;

type FileAtteso = {
  nome: string;
  chiavi: string[];
  max: number;
  nota: string;
};

/** Nuovi file atti REALI-14 (W4, cap 80 dettagli per finestra). */
const FILE_ATTI_FINESTRE_14: FileAtteso[] = [
  {
    nome: "normattiva-storico-2012.json",
    chiavi: ["atti", "leggi", "dati"],
    max: 80,
    nota: "Normattiva finestra 2012 (sonda: URN 980, dettaglio-ok ~75%)",
  },
  {
    nome: "normattiva-storico-2018.json",
    chiavi: ["atti", "leggi", "dati"],
    max: 80,
    nota: "Normattiva finestra 2018 (sonda: URN 667, dettaglio-ok ~86%)",
  },
];

/** Nuovi file elezioni REALI-14 (W2/W3, solo aggregati, zero nominativi). */
const FILE_ELEZIONI_14: FileAtteso[] = [
  {
    nome: "elezioni-regionali-2024-emilia-romagna.json",
    chiavi: ["liste", "regioni", "comuni", "dati"],
    max: 10000,
    nota: "Regionali ER 2024-11-17 (da regionali-20241117.zip, riuso parser)",
  },
  {
    nome: "elezioni-regionali-2025-campania.json",
    chiavi: ["liste", "regioni", "comuni", "dati"],
    max: 10000,
    nota: "Regionali Campania 2025-11-23 (da regionali-20251123.zip, split REGIONE)",
  },
  {
    nome: "elezioni-regionali-2025-puglia.json",
    chiavi: ["liste", "regioni", "comuni", "dati"],
    max: 10000,
    nota: "Regionali Puglia 2025-11-23 (da regionali-20251123.zip, split REGIONE)",
  },
  {
    nome: "elezioni-regionali-2025-veneto.json",
    chiavi: ["liste", "regioni", "comuni", "dati"],
    max: 10000,
    nota: "Regionali Veneto 2025-11-23 (da regionali-20251123.zip, split REGIONE)",
  },
];

/** Nuovo file finanziamenti REALI-14 (W1, aggregati beneficiario×anno). */
const FILE_FINANZIAMENTI_14: FileAtteso = {
  nome: "finanziamenti-erogazioni-2024-2026.json",
  chiavi: ["erogazioni", "dati"],
  max: 50,
  nota: "Finanziamenti partiti 2024-2026 (solo beneficiario×anno, max 50 voci)",
};

/** Nuovi percorsi atti che il wiring REALI-14 deve registrare. */
const PERCORSI_FINESTRE_14_ATTESI = [
  "data/reali/normattiva-storico-2012.json",
  "data/reali/normattiva-storico-2018.json",
];

/** Nuovi id regionali REALI-14 nel registry (hub, dettaglio, API, lib). */
const ID_REGIONALI_14 = [
  "regionali-2024-emilia-romagna",
  "regionali-2025-campania",
  "regionali-2025-puglia",
  "regionali-2025-veneto",
] as const;

/** Percorsi storici che il wiring non deve mai perdere. */
const PERCORSI_STORICI_14 = [
  "data/reali/normattiva-recenti.json",
  "data/reali/normattiva-storico-2020.json",
  "data/reali/normattiva-bulk-a-attuazione-ue.json",
  "data/reali/normattiva-bulk-b-finestra-2005.json",
];

// ---------------------------------------------------------------------------
// Helper puri (never-throw, mai rete: solo fs locale + lib sincrone)
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

async function leggiJson(
  percorso: string,
): Promise<{ parsed: unknown; byte: number; raw: string } | null> {
  try {
    const raw = await readFile(percorso, "utf8");
    const byte = Buffer.byteLength(raw, "utf8");
    return { parsed: JSON.parse(raw) as unknown, byte, raw };
  } catch {
    return null;
  }
}

function notaSkip(msg: string): void {
  console.info(`[reali-14] SKIP tollerante — ${msg}`);
}

// ---------------------------------------------------------------------------
// Spot-check atti finestra (solo campi presenti, mai inventare)
// ---------------------------------------------------------------------------

const STATI_ONESTI = ["in_vigore", "abrogato", "decaduto", "sconosciuto"];

function spotCheckAttoFinestra14(voce: unknown): string | null {
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

/** Segnali vietati nei file elettorali (colonne candidato / nominativi). */
const SEGNALI_NOMINATIVI = [
  "cognome",
  "num_candidato",
  "numero_candidato",
  "nome_candidato",
  "preferenze",
  "nominativo",
  "datanascita",
  "luogonascita",
];

function spotCheckElezioni14(raw: string, parsed: unknown): string | null {
  const basso = raw.toLowerCase();
  for (const s of SEGNALI_NOMINATIVI) {
    if (basso.includes(`"${s}"`) || basso.includes(`'${s}'`)) {
      return `segnale nominativo vietato: ${s}`;
    }
  }
  const prov = provenanceDi(parsed);
  if (!prov) return "senza provenance";
  if (!isStringaNonVuota(prov["fonte"])) return "fonte assente";
  if (!isHttpsUrl(prov["url"])) return "url non https";
  if (!isRecuperatoIl(prov["recuperatoIl"] ?? prov["estratto_il"])) {
    return "recuperatoIl/estratto_il non reale";
  }
  if (!isStringaNonVuota(prov["licenza"])) return "licenza assente";
  return null;
}

/**
 * Spot-check riga erogazione finanziamenti: solo chiavi aggregate
 * (beneficiario, anno, n_erogazioni, totale_euro, fonte_pdf, lastModified).
 * Segnali erogante-nominativo (cognome, codice fiscale, datanascita)
 * invalidano la riga. Mai inventare: campi assenti o invalidi = errore.
 */
const CHIAVI_EROGAZIONE_AMMESSE = new Set([
  "beneficiario",
  "anno",
  "n_erogazioni",
  "totale_euro",
  "fonte_pdf",
  "lastmodified",
]);

const SEGNALI_EROGANTE_VIETATI = [
  "cognome",
  "codice_fiscale",
  "codicefiscale",
  "datanascita",
  "luogonascita",
  "erogante",
  "donatore",
];

function spotCheckErogazione14(voce: unknown): string | null {
  if (!voce || typeof voce !== "object" || Array.isArray(voce)) {
    return "voce non oggetto";
  }
  const r = voce as Record<string, unknown>;
  const chiaviBasse = Object.keys(r).map((k) => k.toLowerCase());
  for (const s of SEGNALI_EROGANTE_VIETATI) {
    if (chiaviBasse.some((k) => k.includes(s))) {
      return `segnale erogante vietato: ${s}`;
    }
  }
  for (const k of chiaviBasse) {
    if (!CHIAVI_EROGAZIONE_AMMESSE.has(k)) return `chiave non aggregata: ${k}`;
  }
  const beneficiario = r["beneficiario"];
  if (!isStringaNonVuota(beneficiario)) return "beneficiario assente";
  if (haSegnaleInventato(beneficiario)) return "beneficiario inventato";
  const anno = r["anno"];
  if (typeof anno !== "number" || !Number.isFinite(anno)) {
    return "anno non numerico";
  }
  if (Math.floor(anno) < 2024 || Math.floor(anno) > 2026) {
    return "anno fuori 2024-2026";
  }
  const n = r["n_erogazioni"];
  if (typeof n !== "number" || !Number.isFinite(n) || Math.floor(n) < 0) {
    return "n_erogazioni invalido";
  }
  const totale = r["totale_euro"];
  if (typeof totale !== "number" || !Number.isFinite(totale) || totale < 0) {
    return "totale_euro invalido";
  }
  const pdf = r["fonte_pdf"];
  if (pdf !== undefined && pdf !== null && pdf !== "" && !isHttpsUrl(pdf)) {
    return "fonte_pdf non https";
  }
  const lm = r["lastModified"] ?? r["lastmodified"];
  if (lm !== undefined && lm !== null && lm !== "" && !isIsoDate(lm)) {
    return "lastModified non ISO";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Suite 1: envelope + cap + spot-check finestre 2012/2018 (skip se assenti)
// ---------------------------------------------------------------------------

describe("reali-14: envelope finestre Normattiva 2012/2018 (skip se assenti)", () => {
  for (const atteso of FILE_ATTI_FINESTRE_14) {
    it(`${atteso.nome}: envelope + licenza + conteggio>0 + cap 80`, async () => {
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
        const errore = spotCheckAttoFinestra14(voce);
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
// Suite 2: regionali residue ER24/Campania25/Puglia25/Veneto25 (skip se assenti)
// ---------------------------------------------------------------------------

describe("reali-14: regionali residue (skip se assenti)", () => {
  for (const atteso of FILE_ELEZIONI_14) {
    it(`${atteso.nome}: envelope + cap 950KB + zero nominativi`, async () => {
      const letto = await leggiJson(path.join(DIR_REALI, atteso.nome));
      if (!letto) {
        notaSkip(`${atteso.nome} assente — ${atteso.nota}`);
        expect(true).toBe(true);
        return;
      }
      expect(letto.byte, `${atteso.nome}: oltre 950KB`).toBeLessThanOrEqual(MAX_BYTE_ELEZIONI);
      const errore = spotCheckElezioni14(letto.raw, letto.parsed);
      expect(errore, `${atteso.nome}: ${errore}`).toBeNull();
      const lista = estraiArrayDati(letto.parsed, atteso.chiavi);
      expect(lista, `${atteso.nome}: nessun array dati`).not.toBeNull();
      expect(lista?.length ?? 0, `${atteso.nome}: conteggio zero`).toBeGreaterThan(0);
    });

    it(`${atteso.nome}: loader tollerante (null se assente, envelope se presente)`, async () => {
      const id = atteso.nome.replace(/^elezioni-/, "").replace(/\.json$/, "");
      let risultato: unknown = "non-chiamato";
      try {
        risultato = await caricaRegionale(id);
      } catch (e) {
        expect(e, `${atteso.nome}: caricaRegionale ha lanciato`).toBeNull();
        return;
      }
      const letto = await leggiJson(path.join(DIR_REALI, atteso.nome));
      if (!letto) {
        expect(risultato, `${atteso.nome}: file assente ma loader non null`).toBeNull();
        return;
      }
      if (risultato === null) {
        notaSkip(`${atteso.nome} presente ma non valido — loader null onesto`);
        expect(true).toBe(true);
        return;
      }
      const d = risultato as Record<string, unknown>;
      expect(Array.isArray(d["liste"]), `${atteso.nome}: liste assenti`).toBe(true);
      expect(Array.isArray(d["comuni"]), `${atteso.nome}: comuni assenti`).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 3: finanziamenti partiti (skip se assente)
// ---------------------------------------------------------------------------

describe("reali-14: finanziamenti erogazioni 2024-2026 (skip se assente)", () => {
  it(`${FILE_FINANZIAMENTI_14.nome}: envelope + licenza riuso non commerciale`, async () => {
    const letto = await leggiJson(path.join(DIR_REALI, FILE_FINANZIAMENTI_14.nome));
    if (!letto) {
      notaSkip(`${FILE_FINANZIAMENTI_14.nome} assente — ${FILE_FINANZIAMENTI_14.nota}`);
      expect(true).toBe(true);
      return;
    }
    expect(
      letto.byte,
      `${FILE_FINANZIAMENTI_14.nome}: oltre 1MB (vietati PDF integrali)`,
    ).toBeLessThanOrEqual(MAX_BYTE);
    const prov = provenanceDi(letto.parsed);
    expect(prov, `${FILE_FINANZIAMENTI_14.nome}: senza provenance`).not.toBeNull();
    expect(isStringaNonVuota(prov?.["fonte"]), `${FILE_FINANZIAMENTI_14.nome}: fonte assente`).toBe(
      true,
    );
    expect(isHttpsUrl(prov?.["url"]), `${FILE_FINANZIAMENTI_14.nome}: url non https`).toBe(true);
    expect(
      isRecuperatoIl(prov?.["recuperatoIl"] ?? prov?.["estratto_il"]),
      `${FILE_FINANZIAMENTI_14.nome}: recuperatoIl non reale`,
    ).toBe(true);
    const licenza = String(prov?.["licenza"] ?? "");
    expect(
      licenza.toLowerCase().includes("camera.it"),
      `${FILE_FINANZIAMENTI_14.nome}: licenza senza camera.it`,
    ).toBe(true);
    expect(
      licenza.toLowerCase().includes("non commerciale"),
      `${FILE_FINANZIAMENTI_14.nome}: licenza senza vincolo non commerciale`,
    ).toBe(true);
    const lista = estraiArrayDati(letto.parsed, FILE_FINANZIAMENTI_14.chiavi);
    expect(lista, `${FILE_FINANZIAMENTI_14.nome}: nessun array erogazioni`).not.toBeNull();
    expect(lista?.length ?? 0, `${FILE_FINANZIAMENTI_14.nome}: conteggio zero`).toBeGreaterThan(0);
    expect(
      lista?.length ?? 0,
      `${FILE_FINANZIAMENTI_14.nome}: oltre cap ${FILE_FINANZIAMENTI_14.max}`,
    ).toBeLessThanOrEqual(FILE_FINANZIAMENTI_14.max);
  });

  it(`${FILE_FINANZIAMENTI_14.nome}: solo aggregati, zero nominativi eroganti`, async () => {
    const letto = await leggiJson(path.join(DIR_REALI, FILE_FINANZIAMENTI_14.nome));
    if (!letto) {
      notaSkip(`${FILE_FINANZIAMENTI_14.nome} assente — spot-check rimandato`);
      expect(true).toBe(true);
      return;
    }
    const lista = estraiArrayDati(letto.parsed, FILE_FINANZIAMENTI_14.chiavi);
    if (!lista || lista.length === 0) {
      notaSkip(`${FILE_FINANZIAMENTI_14.nome} array vuoto — spot-check rimandato`);
      expect(true).toBe(true);
      return;
    }
    for (const voce of lista) {
      const errore = spotCheckErogazione14(voce);
      expect(
        errore,
        `${FILE_FINANZIAMENTI_14.nome}: riga non valida (${errore}): ${JSON.stringify(voce).slice(0, 200)}`,
      ).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 4: wiring registry + UI/API nuove consultazioni (mai rete)
// ---------------------------------------------------------------------------

describe("reali-14: wiring percorsi atti + registry regionali", () => {
  it("PERCORSI_ATTI_REALI contiene 2012/2018 e conserva gli storici", async () => {
    let testo: string;
    try {
      testo = await readFile(FILE_SOURCES, "utf8");
    } catch {
      notaSkip("lib/sources.ts illeggibile");
      expect(true).toBe(true);
      return;
    }
    for (const p of PERCORSI_FINESTRE_14_ATTESI) {
      expect(testo.includes(p), `PERCORSI_ATTI_REALI senza ${p}`).toBe(true);
    }
    for (const p of PERCORSI_STORICI_14) {
      expect(testo.includes(p), `PERCORSI_ATTI_REALI ha perso ${p}`).toBe(true);
    }
  });

  it("registry lib riconosce i 4 nuovi id regionali (mai throw)", () => {
    for (const id of ID_REGIONALI_14) {
      expect(normalizzaIdRegionale(id), `id non normalizzato: ${id}`).toBe(id);
      const voce = voceRegistroRegionale(id);
      expect(voce, `voce registry assente: ${id}`).not.toBeNull();
      expect(voce?.file.endsWith(".json"), `file non json: ${id}`).toBe(true);
    }
    expect(normalizzaIdRegionale("regionali-2025-atlantide")).toBeNull();
    expect(voceRegistroRegionale("inesistente")).toBeNull();
  });

  it("hub + dettaglio + API citano i 4 nuovi id (loader resta tollerante)", async () => {
    for (const [etichetta, percorso] of [
      ["hub", FILE_HUB],
      ["dettaglio", FILE_DETTAGLIO],
      ["lib", FILE_ELEZIONI_DATI],
      ["api-regionale", FILE_API_REGIONALE],
    ] as const) {
      let testo = "";
      try {
        testo = await readFile(percorso, "utf8");
      } catch {
        notaSkip(`${etichetta} illeggibile: ${percorso}`);
        continue;
      }
      for (const id of ID_REGIONALI_14) {
        expect(testo.includes(id), `${etichetta} senza ${id}`).toBe(true);
      }
    }
  });

  it("elencaRegionali never-throw e contiene solo id noti (mai rete)", async () => {
    let voci: Awaited<ReturnType<typeof elencaRegionali>> = [];
    try {
      voci = await elencaRegionali();
    } catch (e) {
      expect(e, "elencaRegionali ha lanciato").toBeNull();
      return;
    }
    expect(Array.isArray(voci)).toBe(true);
    const noti = new Set<string>([
      "regionali-2025-toscana",
      "regionali-2024-umbria",
      ...ID_REGIONALI_14,
    ]);
    for (const v of voci) {
      expect(noti.has(v.id), `id non noto in elenco: ${v.id}`).toBe(true);
      expect(v.disponibile).toBe(true);
    }
  });

  it("caricaRegionaleResult mai throw su ignoto/assente (mai rete)", async () => {
    const ignoto = await caricaRegionaleResult("regionali-2025-atlantide");
    expect(ignoto.ok).toBe(false);
    for (const id of ID_REGIONALI_14) {
      const esito = await caricaRegionaleResult(id);
      expect(typeof esito.ok).toBe("boolean");
      if (!esito.ok) {
        expect(isStringaNonVuota(esito.errore), `errore vuoto per ${id}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 5: nessun ELI duplicato + MANIFEST tollerante (mai rete)
// ---------------------------------------------------------------------------

describe("reali-14: dedup ELI con finestre 2012/2018", () => {
  it("nessun ELI duplicato tra storici presenti e finestre 2012/2018", async () => {
    const candidati = [...PERCORSI_STORICI_14, ...PERCORSI_FINESTRE_14_ATTESI].map((p) =>
      path.join(RADICE, p),
    );
    const visti = new Map<string, string>();
    const duplicati: string[] = [];
    let fileVerificati = 0;
    for (const percorso of candidati) {
      const letto = await leggiJson(percorso);
      if (!letto) continue;
      const lista = estraiListaAttiReali(letto.parsed);
      if (lista.length === 0) continue;
      fileVerificati += 1;
      const perFile = new Set<string>();
      for (const voce of lista) {
        const r = voce as Record<string, unknown>;
        const chiave = String(r["eli"] ?? r["urn"] ?? r["nir"] ?? r["chiave"] ?? "")
          .trim()
          .toLowerCase();
        if (!chiave) continue;
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
    console.info(`[reali-14] dedup su ${fileVerificati} file, ${visti.size} chiavi uniche`);
    expect(duplicati, `ELI duplicati:\n${duplicati.slice(0, 10).join("\n")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: getCorpusInfo coerente + corpus in crescita + never-throw (mai rete)
// ---------------------------------------------------------------------------

describe("reali-14: getCorpusInfo coerente + corpus in crescita (mai rete)", () => {
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

  it(`corpus in crescita: reali >= soglia precedente ${SOGLIA_REALI_14} (tollerante)`, () => {
    const info = getCorpusInfo();
    console.info(
      `[reali-14] corpus: base=${info.base} reali=${info.reali} totale=${info.totale} (soglia ${SOGLIA_REALI_14})`,
    );
    expect(
      info.reali,
      `corpus sotto soglia REALI-14 (${SOGLIA_REALI_14}): regressione reali`,
    ).toBeGreaterThanOrEqual(SOGLIA_REALI_14);
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
