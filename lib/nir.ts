/**
 * NIR (URN) ed ELI: identificatori standard degli atti normativi italiani.
 *
 * - NIR: `urn:nir:<autorita>:<tipo>:<YYYY-MM-DD>;<numero>`
 *   es. `urn:nir:stato:decreto.legge:2026-07-27;133`
 * - ELI: `<origin>/eli/id/<YYYY>/<MM>/<DD>/<codiceRedazionale>/<versione>`
 *   es. `/eli/id/2026/07/27/26G00155/sg`
 *
 * Nota: ELI e NIR non sono convertibili in modo univoco, perche' il codice
 * redazionale della Gazzetta Ufficiale non contiene tipo e numero dell'atto.
 * `eliToNir` / `nirToEli` accettano quindi metadati opzionali e restituiscono
 * `null` quando la conversione non e' determinabile.
 */

export interface NirParts {
  /** Autorita' emanante, es. `stato`, `regione.lombardia`. */
  autorita: string;
  /** Tipo dell'atto, es. `decreto.legge`, `legge`. */
  tipo: string;
  /** Data di emanazione in formato ISO `YYYY-MM-DD`. */
  data: string;
  /** Numero dell'atto (stringa per preservare zeri/lettere). */
  numero: string;
  /** URN originale. */
  raw: string;
}

export interface EliParts {
  /** Segmento identificativo, normalmente `id`. */
  id: string;
  anno: string;
  mese: string;
  giorno: string;
  /** Codice redazionale, es. `26G00155`. */
  codice: string;
  /** Versione ELI, es. `sg`, `originario`, `consolidated`. */
  versione: string | null;
  /** URI originale normalizzata al solo path (senza origin/query). */
  raw: string;
}

export interface NirInput {
  autorita?: string;
  tipo: string;
  data: string;
  numero: string | number;
}

export interface EliToNirMeta {
  tipo?: string;
  numero?: string | number;
  autorita?: string;
}

export interface NirToEliMeta {
  codice?: string;
  versione?: string;
}

const NIR_RE =
  /^urn:nir:([a-z0-9][a-z0-9._-]*):([a-z0-9][a-z0-9._-]*):(\d{4}-\d{2}-\d{2});([0-9A-Za-z][0-9A-Za-z._-]*)$/i;

const ELI_RE = /^\/eli\/id\/(\d{4})\/(\d{2})\/(\d{2})\/([0-9A-Za-z]+)(?:\/([0-9A-Za-z._-]+))?$/i;

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Verifica che la data sia nel formato `YYYY-MM-DD` ed esista sul calendario. */
function isIsoDate(value: string): boolean {
  if (!DATA_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Analizza un URN NIR. Restituisce `null` se malformato. */
export function parseNIR(urn: string): NirParts | null {
  if (typeof urn !== "string") return null;
  const match = NIR_RE.exec(urn.trim());
  if (!match) return null;
  const [, autorita, tipo, data, numero] = match;
  if (!autorita || !tipo || !data || !numero) return null;
  if (!isIsoDate(data)) return null;
  return { autorita, tipo, data, numero, raw: urn.trim() };
}

/** Compone un URN NIR a partire dalle sue parti. Restituisce `""` se invalido. */
export function formatNIR(parts: NirInput | Partial<NirParts>): string {
  const autorita = parts.autorita?.trim() || "stato";
  const tipo = parts.tipo?.trim();
  const data = parts.data?.trim();
  const numero = parts.numero === undefined ? "" : String(parts.numero).trim();

  if (!tipo || !data || !numero) return "";
  if (!isIsoDate(data)) return "";
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(autorita)) return "";
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(tipo)) return "";

  const urn = `urn:nir:${autorita}:${tipo}:${data};${numero}`;
  return NIR_RE.test(urn) ? urn : "";
}

/** Normalizza un'URI ELI al solo path `/eli/id/...`, rimuovendo origin, query e hash. */
export function normalizeEli(uri: string): string {
  if (typeof uri !== "string") return "";
  let value = uri.trim();
  if (!value) return "";
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      value = new URL(value).pathname;
    }
  } catch {
    // non e' un URL assoluto: continua con l'input grezzo
  }
  const hashIndex = value.indexOf("#");
  if (hashIndex >= 0) value = value.slice(0, hashIndex);
  const queryIndex = value.indexOf("?");
  if (queryIndex >= 0) value = value.slice(0, queryIndex);
  if (!value.startsWith("/")) value = `/${value}`;
  return value.replace(/\/+$/, "") || "/";
}

/** Analizza un'URI ELI. Restituisce `null` se non e' un ELI riconoscibile. */
export function parseELI(uri: string): EliParts | null {
  if (typeof uri !== "string") return null;
  const path = normalizeEli(uri);
  const match = ELI_RE.exec(path);
  if (!match) return null;
  const [, anno, mese, giorno, codice, versione] = match;
  if (!anno || !mese || !giorno || !codice) return null;
  return {
    id: "id",
    anno,
    mese,
    giorno,
    codice,
    versione: versione ?? null,
    raw: path,
  };
}

/** Indica se la stringa e' un ELI valido secondo il pattern supportato. */
export function isValidELI(uri: string): boolean {
  return parseELI(uri) !== null;
}

/**
 * Converte un ELI in NIR. Tipo e numero non sono contenuti nell'ELI: vanno
 * forniti in `meta`. Restituisce `null` se la conversione non e' determinabile.
 */
export function eliToNir(eli: string, meta?: EliToNirMeta): string | null {
  const parsed = parseELI(eli);
  if (!parsed) return null;
  if (!meta?.tipo || meta.numero === undefined || meta.numero === null) return null;
  const urn = formatNIR({
    autorita: meta.autorita,
    tipo: meta.tipo,
    data: `${parsed.anno}-${parsed.mese}-${parsed.giorno}`,
    numero: meta.numero,
  });
  return urn || null;
}

/**
 * Converte un NIR in ELI. Il codice redazionale non e' contenuto nel NIR: va
 * fornito in `meta`. Restituisce `null` se la conversione non e' determinabile.
 */
export function nirToEli(nir: string, meta?: NirToEliMeta): string | null {
  const parsed = parseNIR(nir);
  if (!parsed || !meta?.codice) return null;
  const [anno, mese, giorno] = parsed.data.split("-");
  if (!anno || !mese || !giorno) return null;
  const base = `/eli/id/${anno}/${mese}/${giorno}/${meta.codice}`;
  return meta.versione ? `${base}/${meta.versione}` : base;
}
