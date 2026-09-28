/**
 * REALI-15 — coerenza MANIFEST vs disco (zero rete).
 *
 * Gate di coerenza: ogni voce MANIFEST ha file esistente su disco e
 * conteggio pari a una lunghezza reale verificata; nessun orfano su
 * disco, nessun fantasma in MANIFEST; `generatoIl` = max `recuperatoIl`;
 * tutti gli URL (MANIFEST + provenance) sono https. Mai inventare
 * numeri/URL/date: tutto viene letto dai file.
 *
 * Convenzione conteggi elezioni (documentata in MANIFEST `nota`): i file
 * con chiavi liste/regioni/comuni contano le liste, referendum-2025
 * conta i quesiti, eccezione emilia-romagna che conta i comuni.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RADICE = process.cwd();
const DIR_REALI = path.join(RADICE, "data", "reali");
const FILE_MANIFEST = path.join(DIR_REALI, "MANIFEST.json");

/** File elezioni: chiave lista che fa fede per il conteggio. */
const CHIAVE_CONTEGGIO_ELEZIONI: Record<string, string> = {
  "elezioni-europee-2024.json": "liste",
  "elezioni-politiche-2022-camera.json": "liste",
  "elezioni-politiche-2022-senato.json": "liste",
  "elezioni-regionali-2024-umbria.json": "liste",
  "elezioni-regionali-2025-toscana.json": "liste",
  "elezioni-regionali-2024-liguria.json": "liste",
  "elezioni-regionali-2025-calabria.json": "liste",
  "elezioni-regionali-2024-emilia-romagna.json": "comuni",
  "b-elezioni-regionali-2025-campania.json": "liste",
  "b-elezioni-regionali-2025-puglia.json": "liste",
  "b-elezioni-regionali-2025-veneto.json": "liste",
  "referendum-2025.json": "quesiti",
};

function leggiJson(percorso: string): unknown | null {
  try {
    return JSON.parse(readFileSync(percorso, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function listeDi(parsed: unknown): Record<string, number> {
  try {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.length;
    }
    return out;
  } catch {
    return {};
  }
}

function eHttps(v: unknown): boolean {
  try {
    return typeof v === "string" && new URL(v.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

function eDataValida(v: unknown): boolean {
  try {
    if (typeof v !== "string" || !v.trim()) return false;
    const t = Date.parse(v.trim());
    if (!Number.isFinite(t)) return false;
    const anno = new Date(t).getUTCFullYear();
    return anno >= 2025 && anno <= new Date().getUTCFullYear() + 1;
  } catch {
    return false;
  }
}

interface VoceManifest {
  file: string;
  conteggio: number;
  recuperatoIl: string;
  url: string;
}

function vociManifest(): VoceManifest[] | null {
  const parsed = leggiJson(FILE_MANIFEST) as {
    fonti?: unknown;
    generatoIl?: unknown;
    nota?: unknown;
  } | null;
  if (!parsed || !Array.isArray(parsed.fonti)) return null;
  return parsed.fonti as VoceManifest[];
}

describe("reali-15: MANIFEST esiste con voci uniche e generatoIl onesto", () => {
  it("voci con file/conteggio/recuperatoIl validi, senza duplicati", () => {
    const voci = vociManifest();
    expect(voci).not.toBeNull();
    const visti = new Set<string>();
    for (const v of voci ?? []) {
      expect(typeof v.file).toBe("string");
      expect(v.file.endsWith(".json")).toBe(true);
      expect(visti.has(v.file)).toBe(false);
      visti.add(v.file);
      expect(Number.isInteger(v.conteggio) && v.conteggio >= 0).toBe(true);
      expect(eDataValida(v.recuperatoIl)).toBe(true);
      expect(eHttps(v.url)).toBe(true);
    }
  });

  it("generatoIl = max recuperatoIl delle voci", () => {
    const parsed = leggiJson(FILE_MANIFEST) as {
      fonti?: VoceManifest[];
      generatoIl?: unknown;
    } | null;
    expect(parsed).not.toBeNull();
    const voci = parsed?.fonti ?? [];
    const max = voci.map((v) => String(v.recuperatoIl)).sort().at(-1) ?? "";
    expect(parsed?.generatoIl).toBe(max);
  });
});

describe("reali-15: MANIFEST vs disco (zero orfani, zero fantasmi)", () => {
  it("ogni voce ha file esistente, ogni file dati ha voce", () => {
    const voci = vociManifest();
    expect(voci).not.toBeNull();
    const daDisco = readdirSync(DIR_REALI).filter(
      (f) => f.endsWith(".json") && f !== "MANIFEST.json",
    );
    const daManifest = new Set((voci ?? []).map((v) => v.file));
    for (const v of voci ?? []) {
      expect(daDisco.includes(v.file)).toBe(true);
    }
    for (const f of daDisco) {
      expect(daManifest.has(f)).toBe(true);
    }
  });

  it("conteggio = lunghezza reale di una lista del file", () => {
    const voci = vociManifest();
    expect(voci).not.toBeNull();
    for (const v of voci ?? []) {
      const parsed = leggiJson(path.join(DIR_REALI, v.file));
      expect(parsed).not.toBeNull();
      const lunghezze = Object.values(listeDi(parsed));
      expect(lunghezze.includes(v.conteggio)).toBe(true);
    }
  });

  it("convenzione elezioni: liste (emilia=comuni, referendum=quesiti)", () => {
    for (const [file, chiave] of Object.entries(CHIAVE_CONTEGGIO_ELEZIONI)) {
      const parsed = leggiJson(path.join(DIR_REALI, file));
      if (!parsed) continue;
      const liste = listeDi(parsed);
      const voci = vociManifest() ?? [];
      const voce = voci.find((v) => v.file === file);
      expect(voce).toBeDefined();
      expect(voce?.conteggio).toBe(liste[chiave]);
    }
  });
});

describe("reali-15: envelope provenance + link https (zero rete)", () => {
  it("ogni file dati ha provenance con fonte/url/recuperatoIl/licenza", () => {
    const voci = vociManifest();
    expect(voci).not.toBeNull();
    for (const v of voci ?? []) {
      const parsed = leggiJson(path.join(DIR_REALI, v.file)) as {
        provenance?: Record<string, unknown>;
      } | null;
      const prov = parsed?.provenance;
      expect(prov).toBeDefined();
      expect(typeof prov?.["fonte"]).toBe("string");
      // Eccezione documentata: eurlex-recepimenti-atti.json e' derivato
      // localmente (zero match, zero rete) e dichiara onestamente url
      // vuoto con fonte ai corpora locali `data/reali/...` — mai inventare
      // un URL di fonte per un file calcolato.
      const fonte = typeof prov?.["fonte"] === "string" ? prov?.["fonte"] : "";
      const urlVuotaOnesta =
        (prov?.["url"] ?? "") === "" && fonte.includes("data/reali/");
      expect(urlVuotaOnesta || eHttps(prov?.["url"])).toBe(true);
      // Eccezione documentata: sondaggi-nazionali.json usa `estratto_il`
      // + revisione pinnata (pageid/revid/revisione_timestamp) invece di
      // `recuperatoIl` — data di recupero comunque presente e valida.
      const dataRecupero = prov?.["recuperatoIl"] ?? prov?.["estratto_il"];
      expect(eDataValida(dataRecupero)).toBe(true);
      expect(typeof prov?.["licenza"]).toBe("string");
    }
  });

  it("voci CNEL con url scheda https www.cnel.it (mai /media/docs)", () => {
    const parsed = leggiJson(path.join(DIR_REALI, "oversight-cnel-2026.json")) as {
      documenti?: Array<Record<string, unknown>>;
    } | null;
    expect(Array.isArray(parsed?.documenti)).toBe(true);
    for (const doc of parsed?.documenti ?? []) {
      const url = typeof doc["url"] === "string" ? doc["url"] : "";
      expect(url.startsWith("https://www.cnel.it/")).toBe(true);
      expect(url.includes("/media/docs/")).toBe(false);
      expect(doc["id"]).toBe(url);
    }
  });
});
