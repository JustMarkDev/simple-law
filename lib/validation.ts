/**
 * Validazione condivisa client/server (Variant B, senza nuove dipendenze).
 *
 * Mantiene i contratti esistenti: le funzioni non lanciano, restituiscono
 * valori sanificati + clamp. Usata da API, DB e UI (highlight/facet).
 */

/** Clamp punteggio qualita' 0-100, arrotondato. `undefined` se non finito. */
export function parseQualita(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Anno `YYYY` valido tra 1800 e 2100, altrimenti `""` (nessun filtro). */
export function parseAnno(value: unknown): string {
  const grezzo = value === undefined || value === null ? "" : String(value).trim();
  if (!/^\d{4}$/.test(grezzo)) return "";
  const anno = Number(grezzo);
  if (anno < 1800 || anno > 2100) return "";
  return grezzo;
}

/** Query testuale: trim + cap lunghezza per evitare ReDoS/scan costosi. */
export function parseQuery(value: unknown, max = 200): string {
  const grezzo = value === undefined || value === null ? "" : String(value);
  return grezzo.trim().slice(0, max);
}

/** Tipo normalizzato (lowercase, max 80). Il match resta `includes` per compat. */
export function parseTipo(value: unknown, max = 80): string {
  const grezzo = value === undefined || value === null ? "" : String(value);
  return grezzo.trim().toLowerCase().slice(0, max);
}

/** Paginazione clampata: page 1..10000, per 1..maxPer (default 200). */
export function clampPagina(page: unknown): number {
  const n = Math.floor(Number(page));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(10000, n);
}

export function clampPerPage(per: unknown, maxPer = 200, fallback = 20): number {
  const n = Math.floor(Number(per));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(maxPer, n);
}

/** ELI/NIR: cap lunghezza + charset ristretto per catch-all `[...eli]`. */
export function eliSicuro(value: unknown, max = 500): string | null {
  const grezzo = value === undefined || value === null ? "" : String(value).trim();
  if (!grezzo || grezzo.length > max) return null;
  // oxlint-disable-next-line no-control-regex -- strips control characters on purpose
  if (/[\u0000-\u001f\u007f]/.test(grezzo)) return null;
  return grezzo;
}

/** Escape per costruire RegExp da input utente (highlight). */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Suddivide `testo` in parti {testo, evidenzia} per i token di `q`.
 * Mai RegExp da `q` grezza: token ≤100 char, escape, single-pass lowercase.
 */
export function splitEvidenzia(
  testo: string,
  q: string,
  maxToken = 100,
): { testo: string; evidenzia: boolean }[] {
  const query = q.trim().toLowerCase().slice(0, maxToken);
  if (!testo || !query) return [{ testo, evidenzia: false }];
  const tokens = query
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 8);
  if (tokens.length === 0) return [{ testo, evidenzia: false }];
  const lower = testo.toLowerCase();
  const intervalli: { inizio: number; fine: number }[] = [];
  for (const token of tokens) {
    let from = 0;
    while (from < testo.length) {
      const idx = lower.indexOf(token, from);
      if (idx === -1) break;
      intervalli.push({ inizio: idx, fine: idx + token.length });
      from = idx + Math.max(1, token.length);
      if (intervalli.length > 64) break;
    }
    if (intervalli.length > 64) break;
  }
  if (intervalli.length === 0) return [{ testo, evidenzia: false }];
  intervalli.sort((a, b) => a.inizio - b.inizio);
  const uniti: { inizio: number; fine: number }[] = [];
  for (const iv of intervalli) {
    const ultimo = uniti[uniti.length - 1];
    if (ultimo && iv.inizio <= ultimo.fine) {
      ultimo.fine = Math.max(ultimo.fine, iv.fine);
    } else {
      uniti.push({ ...iv });
    }
  }
  const parti: { testo: string; evidenzia: boolean }[] = [];
  let cursor = 0;
  for (const iv of uniti) {
    if (iv.inizio > cursor) parti.push({ testo: testo.slice(cursor, iv.inizio), evidenzia: false });
    parti.push({ testo: testo.slice(iv.inizio, iv.fine), evidenzia: true });
    cursor = iv.fine;
  }
  if (cursor < testo.length) parti.push({ testo: testo.slice(cursor), evidenzia: false });
  return parti;
}

/** Chiave storage preferiti versionata. */
export const FAVORITES_KEY = "simple-law:preferiti:v1";
export const FAVORITES_MAX = 200;

/** Valida lista ELI da localStorage: solo stringhe corte, dedup. */
export function parsePreferiti(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const visti = new Set<string>();
  for (const voce of value) {
    if (typeof voce !== "string") continue;
    const eli = voce.trim().slice(0, 500);
    if (!eli || visti.has(eli)) continue;
    // oxlint-disable-next-line no-control-regex -- strips control characters on purpose
    if (/[\u0000-\u001f\u007f]/.test(eli)) continue;
    if (eli.includes("..") || /[?#%\\]/.test(eli)) continue;
    visti.add(eli);
    out.push(eli);
    if (out.length >= FAVORITES_MAX) break;
  }
  return out;
}
