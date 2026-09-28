/**
 * Ultima Gazzetta Ufficiale (solo metadati + link, mai mirror: fa fede la
 * GU a stampa). Server-only di fatto (node:fs via accesso pigro, mai
 * import statico `node:`). Tutto never-throw.
 */

export interface AttoGazzetta {
  titolo: string;
  url: string;
  data: string;
}

export interface GazzettaUltima {
  serie: string;
  numero: string;
  data: string;
  testata: string;
  atti: AttoGazzetta[];
  provenance: {
    fonte?: string;
    url?: string;
    recuperatoIl?: string;
    licenza?: string;
  };
}

export const PERCORSO_GAZZETTA = "data/reali/gazzetta-ultime.json";
export const MAX_JSON_BYTES = 1048576;

interface ModuliNode {
  existsSync(p: string): boolean;
  readFileSync(p: string, enc: string): string;
  join(...p: string[]): string;
}

function moduliNode(): ModuliNode | null {
  try {
    if (typeof process === "undefined") return null;
    if (typeof window !== "undefined") return null;
    const g = globalThis as unknown & {
      process?: { getBuiltinModule?: (m: string) => unknown };
    };
    const proc = g.process;
    if (proc && typeof proc.getBuiltinModule === "function") {
      const fs = proc.getBuiltinModule("node:fs") as {
        existsSync(p: string): boolean;
        readFileSync(p: string, enc: string): string;
      };
      const path = proc.getBuiltinModule("node:path") as {
        join(...p: string[]): string;
      };
      if (fs && path && typeof fs.readFileSync === "function") {
        return { existsSync: fs.existsSync, readFileSync: fs.readFileSync, join: path.join };
      }
    }
  } catch {
    // nessun modulo node disponibile
  }
  return null;
}

function stringa(value: unknown, max: number): string {
  try {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, max);
  } catch {
    return "";
  }
}

function urlHttp(value: unknown): string {
  const s = stringa(value, 500);
  return /^https?:\/\//i.test(s) ? s : "";
}

function aAtto(voce: unknown): AttoGazzetta | null {
  try {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const o = voce as Record<string, unknown>;
    const titolo = stringa(o["titolo"], 500);
    const url = urlHttp(o["url"]);
    if (!titolo || titolo.length < 5 || !url) return null;
    const data = stringa(o["data"], 16);
    return { titolo, url, data };
  } catch {
    return null;
  }
}

/** Azzera la cache (utile nei test). Non lancia mai. */
let cache: GazzettaUltima | null | undefined;
export function azzeraCacheGazzetta(): void {
  try {
    cache = undefined;
  } catch {
    // mai lanciare
  }
}

/**
 * Carica l'ultima GU (copia difensiva) o null se assente/invalida.
 * Mai lancia, mai numeri inventati.
 */
export async function caricaGazzettaUltima(): Promise<GazzettaUltima | null> {
  try {
    if (cache !== undefined) {
      return cache ? { ...cache, atti: cache.atti.map((a) => ({ ...a })) } : null;
    }
    const mod = moduliNode();
    if (!mod) {
      cache = null;
      return null;
    }
    let base = "";
    try {
      base = typeof process !== "undefined" && process.cwd ? process.cwd() : "";
    } catch {
      cache = null;
      return null;
    }
    if (!base) {
      cache = null;
      return null;
    }
    const ass = mod.join(base, PERCORSO_GAZZETTA);
    if (!mod.existsSync(ass)) {
      cache = null;
      return null;
    }
    const raw = mod.readFileSync(ass, "utf8");
    if (!raw || raw.length > MAX_JSON_BYTES) {
      cache = null;
      return null;
    }
    const grezzo = JSON.parse(raw) as unknown;
    if (!grezzo || typeof grezzo !== "object" || Array.isArray(grezzo)) {
      cache = null;
      return null;
    }
    const o = grezzo as Record<string, unknown>;
    if (!Array.isArray(o["atti"]) || o["atti"].length === 0) {
      cache = null;
      return null;
    }
    const atti: AttoGazzetta[] = [];
    for (const voce of o["atti"] as unknown[]) {
      const a = aAtto(voce);
      if (a) atti.push(a);
      if (atti.length >= 200) break;
    }
    if (atti.length === 0) {
      cache = null;
      return null;
    }
    const prov =
      o["provenance"] && typeof o["provenance"] === "object" && !Array.isArray(o["provenance"])
        ? (o["provenance"] as Record<string, unknown>)
        : {};
    const dati: GazzettaUltima = {
      serie: stringa(o["serie"], 80) || "Serie Generale",
      numero: stringa(o["numero"], 20),
      data: stringa(o["data"], 16),
      testata: stringa(o["testata"], 200),
      atti,
      provenance: {
        fonte: stringa(prov["fonte"], 160) || undefined,
        url: urlHttp(prov["url"]) || undefined,
        recuperatoIl: stringa(prov["recuperatoIl"], 32) || undefined,
        licenza: stringa(prov["licenza"], 300) || undefined,
      },
    };
    cache = dati;
    return { ...dati, atti: dati.atti.map((a) => ({ ...a })) };
  } catch {
    return null;
  }
}
