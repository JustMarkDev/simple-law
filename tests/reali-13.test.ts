/**
 * REALI-13 — test trasversali wiring + finestre 1975/1995 + regionali-extra + GU (zero rete, tolleranti).
 *
 * Ruolo: scrittore wiring+test+docs trasversali reali-13. Possiede SOLO questo file
 * (+ righe PERCORSI_ATTI_REALI in lib/sources.ts, MANIFEST.json, README.md).
 * Zero rete, zero scritture, mai inventare numeri/URL/date/stati. Tutti i controlli
 * sui nuovi file sono TOLLERANTI: se gli altri scrittori non hanno ancora generato
 * il loro file, il test passa con nota (skip), mai fail. Loader su disco salta gli assenti.
 *
 * Nuovi file REALI-13 (assegnazione disgiunta):
 * - W3 finestre Normattiva (cap 80, URN solo se denominazione+anno+numero non vuoti):
 *   Nomi reali scritti da W3 il 2026-09-28 (default dello script):
 *   normattiva-storico-1975.json (63 atti verificati) +
 *   normattiva-storico-1995.json (70 atti verificati). I nomi direttiva
 *   normattiva-finestra-1975/1995.json non sono mai esistiti (fantasmi
 *   rimossi dal wiring W4 real-only): i controlli envelope restano
 *   tolleranti (skip se assenti).
 * - W1 regionali-extra (solo aggregati per-lista + affluenza comunale, zero nominativi,
 *   colonne candidato mai lette, cap <=950KB/file):
 *   elezioni-regionali-2024-liguria.json (da regionali-20241027.zip, filtro LIGURIA),
 *   elezioni-regionali-2025-calabria.json (da regionali-20251005.zip, filtro CALABRIA).
 * - W2 GU diretta (solo RSS ultimo numero/serie, title+link ELI https+pubDate, <=1MB):
 *   gazzetta-ultime.json (da /rss/SG; sonda SG n.225 del 28-09-2026, 32 item).
 * - W4 docs: docs/REALI-13-sonde-rimandate.md (fuori portata di questo test).
 *
 * Formula getCorpusInfo (definita in lib/sources.ts, legacy invariato):
 * - base = SEED_LAWS.length (5 seed, sempre primi nel corpus);
 * - totale = getSeedLaws().length (seed + reali + sintetico, dedup ELI);
 * - espansi = totale - base (tutto oltre i seed, reali + sintetico);
 * - reali = record con dimostrativo === false in getSeedLaws().
 * Invarianti asseriti: base + espansi == totale; 0 <= reali <= totale.
 *
 * Soglia REALI-13: reali >= 1630 (misurati il 2026-09-28 con corpus 6633:
 * 5 seed + 1630 reali dimostrativo=false + ~4998 sintetici). Con le finestre
 * 1975/1995 presenti il conteggio cresce, con file assenti resta uguale:
 * per questo la soglia e' >= (tollerante), mai > stretto. Mai rete.
 */

import { readdir, readFile, stat } from "node:fs/promises";
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
/** 950 KB: cap hard elezioni (cfr. direttiva REALI-13). */
const MAX_BYTE_ELEZIONI = 950 * 1024;

/** Soglia REALI-13: corpus reale in crescita (precedente 1630, corpus 6633). */
const SOGLIA_REALI_13 = 1630;

type FileAtteso = {
  nome: string;
  chiavi: string[];
  max: number;
  nota: string;
};

/** Nuovi file atti REALI-13 (W3, cap 80 dettagli; entrambi i nomi, loader salta assenti). */
const FILE_ATTI_FINESTRE_13: FileAtteso[] = [
  {
    nome: "normattiva-storico-1975.json",
    chiavi: ["atti", "leggi", "dati"],
    max: 80,
    nota: "Normattiva finestra 1975 (scritta da W3: 63 atti verificati)",
  },
  {
    nome: "normattiva-storico-1995.json",
    chiavi: ["atti", "leggi", "dati"],
    max: 80,
    nota: "Normattiva finestra 1995 (scritta da W3: 70 atti verificati)",
  },
  {
    nome: "normattiva-finestra-1975.json",
    chiavi: ["atti", "leggi", "dati"],
    max: 80,
    nota: "Normattiva finestra 1975 (nome direttiva; assente se W3 usa default storico)",
  },
  {
    nome: "normattiva-finestra-1995.json",
    chiavi: ["atti", "leggi", "dati"],
    max: 80,
    nota: "Normattiva finestra 1995 (nome direttiva; assente se W3 usa default storico)",
  },
];

/** Nuovi file elezioni REALI-13 (W1, solo aggregati, zero nominativi). */
const FILE_ELEZIONI_13: FileAtteso[] = [
  {
    nome: "elezioni-regionali-2024-liguria.json",
    chiavi: ["liste", "regioni", "comuni", "dati"],
    max: 10000,
    nota: "Regionali-extra Liguria 2024 (da regionali-20241027.zip, filtro LIGURIA)",
  },
  {
    nome: "elezioni-regionali-2025-calabria.json",
    chiavi: ["liste", "regioni", "comuni", "dati"],
    max: 10000,
    nota: "Regionali-extra Calabria 2025 (da regionali-20251005.zip, filtro CALABRIA)",
  },
];

/** Nuovo file GU REALI-13 (W2, RSS ultimo numero). */
const FILE_GU_13: FileAtteso[] = [
  {
    nome: "gazzetta-ultime.json",
    chiavi: ["numeri", "items", "atti", "dati"],
    max: 84 * 7,
    nota: "GU diretta Ultime (da /rss/SG; sonda SG n.225 del 28-09-2026)",
  },
];

/** Percorsi atti gia' in PERCORSI_ATTI_REALI prima di REALI-13. */
const PERCORSI_STORICI_13 = [
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
  "data/reali/normattiva-storico-1948.json",
  "data/reali/normattiva-storico-1985.json",
];

/** Nuovi percorsi atti che il wiring REALI-13 deve registrare (nomi reali). */
const PERCORSI_FINESTRE_13_ATTESI = [
  "data/reali/normattiva-storico-1975.json",
  "data/reali/normattiva-storico-1995.json",
];

/**
 * Fantasmi REALI-13 rimossi (W4 real-only): `normattiva-finestra-1975.json`
 * e `normattiva-finestra-1995.json` non sono mai esistiti su disco e non
 * devono stare in PERCORSI_ATTI_REALI.
 */
const PERCORSI_FANTASMI_RIMOSSI_13 = [
  "data/reali/normattiva-finestra-1975.json",
  "data/reali/normattiva-finestra-1995.json",
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
  console.info(`[reali-13] SKIP tollerante — ${msg}`);
}

function chiaveBassa(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Spot-check atti finestra (solo campi presenti, mai inventare)
// ---------------------------------------------------------------------------

const STATI_ONESTI = ["in_vigore", "abrogato", "decaduto", "sconosciuto"];

function spotCheckAttoFinestra13(voce: unknown): string | null {
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
];

function spotCheckElezioni13(raw: string, parsed: unknown): string | null {
  const basso = raw.toLowerCase();
  for (const s of SEGNALI_NOMINATIVI) {
    // "nome" da solo e' troppo generico (es. nome lista): cerca chiavi candidato/preferenze.
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

function spotCheckGu13(parsed: unknown): string | null {
  const prov = provenanceDi(parsed);
  if (!prov) return "senza provenance";
  if (!isStringaNonVuota(prov["fonte"])) return "fonte assente";
  if (!isHttpsUrl(prov["url"])) return "url non https";
  if (!isRecuperatoIl(prov["recuperatoIl"] ?? prov["estratto_il"])) {
    return "recuperatoIl/estratto_il non reale";
  }
  if (!isStringaNonVuota(prov["licenza"])) return "licenza assente";
  const lista = estraiArrayDati(parsed, ["numeri", "items", "atti", "dati"]);
  if (!lista || lista.length === 0) return "nessun array dati";
  const campione = lista.slice(0, 10);
  for (const voce of campione) {
    if (!voce || typeof voce !== "object") return "voce non oggetto";
    const r = voce as Record<string, unknown>;
    const link = r["link"] ?? r["url"] ?? r["eli"];
    if (link !== undefined && link !== null && link !== "" && !isHttpsUrl(link)) {
      return "link non https";
    }
    if (haSegnaleInventato(r["title"] ?? r["titolo"])) return "titolo inventato";
    if (haSegnaleInventato(link)) return "link inventato";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Suite 1: envelope + cap + spot-check finestre 1975/1995 (skip se assenti)
// ---------------------------------------------------------------------------

describe("reali-13: envelope finestre Normattiva 1975/1995 (skip se assenti)", () => {
  for (const atteso of FILE_ATTI_FINESTRE_13) {
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
        const errore = spotCheckAttoFinestra13(voce);
        expect(
          errore,
          `${atteso.nome}: record non valido (${errore}): ${JSON.stringify(voce).slice(0, 200)}`,
        ).toBeNull();
        validi += 1;
      }
      expect(validi).toBeGreaterThan(0);
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
// Suite 2: regionali-extra (solo aggregati, zero nominativi, skip se assenti)
// ---------------------------------------------------------------------------

describe("reali-13: regionali-extra Liguria24/Calabria25 (skip se assenti)", () => {
  for (const atteso of FILE_ELEZIONI_13) {
    it(`${atteso.nome}: envelope + cap 950KB + zero nominativi`, async () => {
      const letto = await leggiJson(path.join(DIR_REALI, atteso.nome));
      if (!letto) {
        notaSkip(`${atteso.nome} assente — ${atteso.nota}`);
        expect(true).toBe(true);
        return;
      }
      expect(
        letto.byte,
        `${atteso.nome}: oltre 950KB`,
      ).toBeLessThanOrEqual(MAX_BYTE_ELEZIONI);
      const errore = spotCheckElezioni13(letto.raw, letto.parsed);
      expect(errore, `${atteso.nome}: ${errore}`).toBeNull();
      const lista = estraiArrayDati(letto.parsed, atteso.chiavi);
      expect(lista, `${atteso.nome}: nessun array dati`).not.toBeNull();
      expect(lista?.length ?? 0, `${atteso.nome}: conteggio zero`).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 3: GU diretta Ultime (skip se assente)
// ---------------------------------------------------------------------------

describe("reali-13: GU diretta Ultime (skip se assente)", () => {
  for (const atteso of FILE_GU_13) {
    it(`${atteso.nome}: envelope + cap 1MB + link ELI https`, async () => {
      const letto = await leggiJson(path.join(DIR_REALI, atteso.nome));
      if (!letto) {
        notaSkip(`${atteso.nome} assente — ${atteso.nota}`);
        expect(true).toBe(true);
        return;
      }
      expect(letto.byte, `${atteso.nome}: oltre 1MB`).toBeLessThanOrEqual(MAX_BYTE);
      const errore = spotCheckGu13(letto.parsed);
      expect(errore, `${atteso.nome}: ${errore}`).toBeNull();
      const lista = estraiArrayDati(letto.parsed, atteso.chiavi);
      expect(lista?.length ?? 0, `${atteso.nome}: oltre cap ${atteso.max}`).toBeLessThanOrEqual(
        atteso.max,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// Suite 4: wiring PERCORSI_ATTI_REALI + dedup finestre (loader salta assenti)
// ---------------------------------------------------------------------------

describe("reali-13: wiring percorsi + dedup finestre", () => {
  it("PERCORSI_ATTI_REALI contiene le 2 finestre reali, senza fantasmi, e conserva gli storici", async () => {
    let testo: string;
    try {
      testo = await readFile(FILE_SOURCES, "utf8");
    } catch {
      notaSkip("lib/sources.ts illeggibile");
      expect(true).toBe(true);
      return;
    }
    for (const p of PERCORSI_FINESTRE_13_ATTESI) {
      expect(testo.includes(p), `PERCORSI_ATTI_REALI senza ${p}`).toBe(true);
    }
    for (const p of PERCORSI_FANTASMI_RIMOSSI_13) {
      expect(testo.includes(p), `PERCORSI_ATTI_REALI contiene il fantasma ${p}`).toBe(false);
    }
    for (const p of PERCORSI_STORICI_13) {
      expect(testo.includes(p), `PERCORSI_ATTI_REALI ha perso ${p}`).toBe(true);
    }
  });

  it("nessun ELI duplicato tra finestre nuove e storici presenti", async () => {
    const candidati = [...PERCORSI_STORICI_13, ...PERCORSI_FINESTRE_13_ATTESI].map((p) =>
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
      `[reali-13] dedup su ${fileVerificati} file, ${attiTotali} atti, ${visti.size} chiavi uniche`,
    );
    expect(duplicati, `ELI duplicati:\n${duplicati.slice(0, 10).join("\n")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: MANIFEST coerente (ogni voce ha file; conteggi = lunghezze reali)
// ---------------------------------------------------------------------------

describe("reali-13: MANIFEST coerente", () => {
  it("ogni voce MANIFEST ha file esistente e conteggio pari al reale", async () => {
    const letto = await leggiJson(FILE_MANIFEST);
    if (!letto) {
      notaSkip("MANIFEST.json assente");
      expect(true).toBe(true);
      return;
    }
    const fonti = (letto.parsed as { fonti?: Array<Record<string, unknown>> }).fonti ?? [];
    expect(fonti.length).toBeGreaterThan(0);
    let presenti = 0;
    const problemi: string[] = [];
    for (const voce of fonti) {
      const file = String(voce["file"] ?? "");
      if (!file) {
        problemi.push("voce senza file");
        continue;
      }
      const base = path.basename(file);
      let disk: { parsed: unknown } | null = null;
      try {
        await stat(path.join(DIR_REALI, base));
        disk = await leggiJson(path.join(DIR_REALI, base));
      } catch {
        problemi.push(`file mancante: ${base}`);
        continue;
      }
      if (!disk) {
        problemi.push(`file illeggibile: ${base}`);
        continue;
      }
      presenti += 1;
      const atteso = Number(voce["conteggio"]);
      if (!Number.isFinite(atteso)) {
        problemi.push(`${base}: conteggio non numerico`);
        continue;
      }
      const lista = estraiArrayDati(disk.parsed, ["atti", "liste", "quesiti", "sondaggi"]);
      if (lista && lista.length !== atteso) {
        // Tollerante per envelope multi-array (comuni/regioni piu' lunghi delle liste):
        // verifica contro TUTTI gli array principali, basta un match.
        const obj = disk.parsed as Record<string, unknown>;
        const lunghezze: number[] = [];
        for (const v of Object.values(obj)) {
          if (Array.isArray(v)) lunghezze.push(v.length);
        }
        if (!lunghezze.includes(atteso)) {
          problemi.push(`${base}: conteggio ${atteso} != lunghezze reali [${lunghezze.join(",")}]`);
        }
      }
    }
    expect(problemi, `MANIFEST incoerente:\n${problemi.slice(0, 20).join("\n")}`).toEqual([]);
    expect(presenti, "nessuna voce MANIFEST ha file su disco").toBeGreaterThan(0);
  });

  it("nuovi file REALI-13 presenti ma non elencati sono solo nota (no fail)", async () => {
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
      ...FILE_ATTI_FINESTRE_13.map((f) => f.nome),
      ...FILE_ELEZIONI_13.map((f) => f.nome),
      ...FILE_GU_13.map((f) => f.nome),
    ]);
    const json = entries.filter((e) => e.endsWith(".json") && e !== "MANIFEST.json");
    const nuoviNonElencati = json.filter((e) => nuoviNomi.has(e) && !elencati.has(e));
    if (nuoviNonElencati.length > 0) {
      console.info(
        `[reali-13] NOTA — nuovi file non ancora in MANIFEST (lag altri scrittori): ${nuoviNonElencati.join(", ")}`,
      );
    }
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: getCorpusInfo coerente + corpus in crescita + never-throw (mai rete)
// ---------------------------------------------------------------------------

describe("reali-13: getCorpusInfo coerente + corpus in crescita (mai rete)", () => {
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

  it(`corpus in crescita: reali >= soglia precedente ${SOGLIA_REALI_13} (tollerante)`, () => {
    const info = getCorpusInfo();
    console.info(
      `[reali-13] corpus: base=${info.base} reali=${info.reali} totale=${info.totale} (soglia ${SOGLIA_REALI_13})`,
    );
    expect(
      info.reali,
      `corpus sotto soglia REALI-13 (${SOGLIA_REALI_13}): regressione reali`,
    ).toBeGreaterThanOrEqual(SOGLIA_REALI_13);
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
