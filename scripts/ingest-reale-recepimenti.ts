/**
 * Ingest mappa recepimenti direttive UE 2026 -> atti IT (ibrida A+B, cache-build).
 *
 * Strada del giudice (REALI-6 W3):
 *  - A (EU-side, CELLAR, best-effort): NIM-ITA per direttiva via SPARQL
 *    `https://publications.europa.eu/webapi/rdf/sparql` (PREFIX
 *    `cdm:<http://publications.europa.eu/ontology/cdm#>`) + 1 fetch REST
 *    `/resource/celex/<CELEX>` per `date_transposition`. Mai live in pagina,
 *    solo qui a build. Se A fallisce -> solo B, con `termineUE: null`
 *    ("non rilevato" esplicito in UI, mai inventato).
 *  - B (IT-side, zero rete): match testuale nel corpus Normattiva
 *    `data/reali/normattiva-*.json` (356 atti). Match SOLO su riferimenti
 *    espliciti con anno+numero entrambi (`direttiva (UE|CE|CEE) AAAA/N` o
 *    `direttiva ... NNNN/AAAA` con parola "direttiva/e" entro 60 caratteri
 *    prima del riferimento). MAI fuzzy, MAI bare `NNNN/AAAA` senza contesto.
 *
 * Onesta' (regole ferree):
 *  - MAI inventare numeri/URL/date: titolo/URL solo se osservati
 *    (LawRecord.titolo + fonti.normattiva/gazzetta; NIM solo se osservati
 *    in SPARQL). URL mai costruiti qui.
 *  - Direttive senza match -> voce con `atti: []` (onesto).
 *  - Bounded: max 50 direttive, timeout 25s/richiesta, pausa 2s tra richieste
 *    rete (1req/2s), exit 1 senza scrivere parziali in caso di errore fatale.
 *  - Output `data/reali/eurlex-recepimenti.json` <= 500KB (atteso < 50KB).
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR_BASE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_REALI = resolve(DIR_BASE, "data", "reali");
const FILE_EURLEX = resolve(DIR_REALI, "eurlex-2026.json");
const FILE_OUT = resolve(DIR_REALI, "eurlex-recepimenti.json");

const CELLAR_SPARQL = "https://publications.europa.eu/webapi/rdf/sparql";
const LICENZA = "riuso con attribuzione Dec.2011/833/UE";
const MAX_DIRETTIVE = 50;
const MAX_BYTE_OUT = 500_000;
const TIMEOUT_MS = 25_000;
const PAUSA_MS = 2000;

const CELEX_DIR_RE = /^3(\d{4})L(\d{1,4})$/;

/* ------------------------------------------------------------------ */
/* Matcher puro (esportato per i test). Mai throw.                     */
/* ------------------------------------------------------------------ */

/** Anno+numero da CELEX direttiva (`32026L1472` -> {2026,1472}). Mai throw. */
export function estraiAnnoNumeroDaCelex(celex: unknown): {
  anno: string;
  numero: string;
} | null {
  try {
    const s = typeof celex === "string" ? celex.trim().toUpperCase() : "";
    const m = CELEX_DIR_RE.exec(s);
    if (!m) return null;
    const anno = m[1] ?? "";
    const numero = String(Number.parseInt(m[2] ?? "", 10));
    if (!/^\d{4}$/.test(anno) || !/^\d{1,4}$/.test(numero)) return null;
    return { anno, numero };
  } catch {
    return null;
  }
}

function cifreSenzaZeri(v: string): string {
  try {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? String(n) : "";
  } catch {
    return "";
  }
}

/**
 * `true` se `testo` cita esplicitamente la direttiva (anno+numero entrambi).
 * Forme ammesse (case-insensitive, slash obbligatorio, bordi numerici):
 *  - `direttiva/e ... AAAA/NNNN` (es. "direttiva (UE) 2024/1788")
 *  - `direttiva/e ... NNNN/AAAA` (es. "direttiva 2023/2226/UE", "direttiva n. 50/2016")
 * con la parola `direttiva`/`direttive` entro 60 caratteri prima del match.
 * Falsi amici rifiutati: `legge 136/2026`, `regolamento (UE) 2024/1789`,
 * numeri parziali, anno o numero da soli. Mai throw.
 */
export function testoCitaDirettiva(
  testo: unknown,
  anno: unknown,
  numero: unknown,
): boolean {
  try {
    if (typeof testo !== "string" || !testo) return false;
    const a = typeof anno === "string" ? anno.trim() : "";
    const nRaw = typeof numero === "string" ? numero.trim() : "";
    if (!/^\d{4}$/.test(a)) return false;
    const n = cifreSenzaZeri(nRaw);
    if (!/^\d{1,4}$/.test(n)) return false;
    const t = testo.toLowerCase();
    if (!t.includes("direttiva") && !t.includes("direttive")) return false;
    // Riferimenti AAAA/NNNN e NNNN/AAAA con slash, bordi non-cifra, zeri ammessi.
    const rif =
      /(\d{4})\s*\/\s*(0*\d{1,4})|(0*\d{1,4})\s*\/\s*(\d{4})/g;
    let m: RegExpExecArray | null;
    while ((m = rif.exec(t)) !== null) {
      let annoTrovato = "";
      let numeroTrovato = "";
      if (m[1] && m[2] !== undefined) {
        annoTrovato = m[1];
        numeroTrovato = cifreSenzaZeri(m[2]);
      } else if (m[3] !== undefined && m[4]) {
        numeroTrovato = cifreSenzaZeri(m[3]);
        annoTrovato = m[4];
      } else {
        continue;
      }
      if (annoTrovato !== a || numeroTrovato !== n) continue;
      // Contesto: "direttiv..." entro 60 caratteri prima della fine del match.
      const fine = (m.index ?? 0) + m[0].length;
      const inizio = Math.max(0, (m.index ?? 0) - 60);
      const finestra = t.slice(inizio, fine);
      if (/direttiv[aei]/.test(finestra)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Letture locali (zero rete per B).                                   */
/* ------------------------------------------------------------------ */

interface AttoEurlexGrezzo {
  celex?: unknown;
  tipo?: unknown;
}

interface LawRecord {
  chiave?: unknown;
  titolo?: unknown;
  tipo?: unknown;
  sintesi?: unknown;
  testo?: unknown;
  eli?: unknown;
  fonti?: unknown;
  dataGU?: unknown;
}

function stringaPulita(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function urlOsservato(v: unknown): string {
  try {
    const s = stringaPulita(v);
    if (!s || s.length > 500) return "";
    const u = new URL(s);
    if (u.protocol !== "https:") return "";
    const host = u.hostname.toLowerCase();
    if (
      host === "www.normattiva.it" ||
      host === "www.gazzettaufficiale.it" ||
      host === "eur-lex.europa.eu"
    )
      return s;
    return "";
  } catch {
    return "";
  }
}

function leggiDirettive(): { celex: string; anno: string; numero: string }[] {
  const raw = readFileSync(FILE_EURLEX, "utf8");
  const parsed = JSON.parse(raw) as { atti?: AttoEurlexGrezzo[] };
  const atti = Array.isArray(parsed.atti) ? parsed.atti : [];
  const out: { celex: string; anno: string; numero: string }[] = [];
  const visti = new Set<string>();
  for (const a of atti) {
    const celex = stringaPulita(a?.celex).toUpperCase();
    const tipo = stringaPulita(a?.tipo);
    if (tipo !== "DIR" && tipo !== "DIR_IMPL" && tipo !== "DIR_DEL") continue;
    const parti = estraiAnnoNumeroDaCelex(celex);
    if (!parti || visti.has(celex)) continue;
    visti.add(celex);
    out.push({ celex, anno: parti.anno, numero: parti.numero });
    if (out.length >= MAX_DIRETTIVE) break;
  }
  return out;
}

function leggiCorpus(): LawRecord[] {
  const nomi = readdirSync(DIR_REALI).filter(
    (f) => f.startsWith("normattiva-") && f.endsWith(".json"),
  );
  const atti: LawRecord[] = [];
  for (const nome of nomi.sort()) {
    const raw = readFileSync(resolve(DIR_REALI, nome), "utf8");
    const parsed = JSON.parse(raw) as { atti?: unknown };
    const lista = Array.isArray(parsed.atti) ? parsed.atti : [];
    for (const v of lista) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        atti.push(v as LawRecord);
        if (atti.length >= 5000) return atti;
      }
    }
  }
  return atti;
}

/* ------------------------------------------------------------------ */
/* Strada A (CELLAR, best-effort, mai inventare).                      */
/* ------------------------------------------------------------------ */

function dormi(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchConTimeout(
  url: string,
  accept: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept },
    });
    if (!res.ok) return null;
    const txt = await res.text();
    return txt && txt.length < 1_000_000 ? txt : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** NIM-ITA osservati per direttiva (titoli/ruoli reali, mai inventati). */
async function cercaNimIta(
  celex: string,
): Promise<{ titolo: string; celexNim: string }[]> {
  try {
    const q =
      `PREFIX cdm:<http://publications.europa.eu/ontology/cdm#> ` +
      `SELECT ?titolo ?celexNim WHERE { ` +
      `?nim cdm:measure_national_implementing_implements_resource_legal ?dir . ` +
      `?dir cdm:resource_legal_id_celex "${celex}" . ` +
      `?nim cdm:implemented_by_country <http://publications.europa.eu/resource/authority/country/ITA> . ` +
      `OPTIONAL { ?nim cdm:work_title ?titolo } ` +
      `OPTIONAL { ?nim cdm:resource_legal_id_celex ?celexNim } } LIMIT 20`;
    const url = `${CELLAR_SPARQL}?query=${encodeURIComponent(q)}&format=application%2Fsparql-results%2Bjson`;
    const txt = await fetchConTimeout(
      url,
      "application/sparql-results+json, application/json",
    );
    if (!txt) return [];
    const corpo = JSON.parse(txt) as {
      results?: { bindings?: Record<string, { value?: string }>[] };
    };
    const righe = corpo.results?.bindings;
    if (!Array.isArray(righe)) return [];
    const out: { titolo: string; celexNim: string }[] = [];
    for (const r of righe.slice(0, 20)) {
      const titolo = stringaPulita(r["titolo"]?.value).slice(0, 500);
      const celexNim = stringaPulita(r["celexNim"]?.value);
      if (titolo.length >= 10) out.push({ titolo, celexNim });
    }
    return out;
  } catch {
    return [];
  }
}

/** Termine di recepimento UE via REST (solo se osservato, altrimenti null). */
async function cercaTermineUE(celex: string): Promise<string | null> {
  try {
    const url = `https://publications.europa.eu/resource/celex/${encodeURIComponent(celex)}`;
    const txt = await fetchConTimeout(url, "application/json, text/plain");
    if (!txt) return null;
    // Cerca `date_transposition` in JSON o testo (ISO YYYY-MM-DD), mai inventare.
    const m = /date_transposition[^0-9]*(\d{4}-\d{2}-\d{2})/i.exec(txt);
    if (!m) return null;
    const iso = (m[1] ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : iso;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Main (solo esecuzione diretta; importabile nei test senza effetti). */
/* ------------------------------------------------------------------ */

export interface AttoMappa {
  titolo: string;
  titoloNim?: string;
  tipoNim?: string;
  ojData?: string;
  chiaveNormattiva?: string;
  eliNormattiva?: string;
  eli?: string;
  urlGU?: string;
  fonte: "normattiva" | "cellar";
  nota?: string;
}

async function main(): Promise<void> {
  const recuperatoIl = new Date().toISOString();
  let direttive: { celex: string; anno: string; numero: string }[];
  try {
    direttive = leggiDirettive();
  } catch (e) {
    console.error(
      `Ingest recepimenti fallito (eurlex-2026 illeggibile), nessun file scritto: ${e instanceof Error ? e.message : "?"}`,
    );
    process.exit(1);
    return;
  }
  if (direttive.length === 0) {
    console.error("Ingest recepimenti fallito (nessuna direttiva), nessun file scritto.");
    process.exit(1);
    return;
  }
  let corpus: LawRecord[];
  try {
    corpus = leggiCorpus();
  } catch (e) {
    console.error(
      `Ingest recepimenti fallito (corpus illeggibile), nessun file scritto: ${e instanceof Error ? e.message : "?"}`,
    );
    process.exit(1);
    return;
  }

  const voci: Record<string, unknown>[] = [];
  for (const dir of direttive) {
    // B: match testuale (zero rete), solo riferimenti espliciti.
    const atti: AttoMappa[] = [];
    for (const rec of corpus) {
      const titolo = stringaPulita(rec.titolo);
      if (!titolo) continue;
      const hay = `${stringaPulita(rec.titolo)}\n${stringaPulita(rec.sintesi)}\n${stringaPulita(rec.testo).slice(0, 20000)}`;
      if (!testoCitaDirettiva(hay, dir.anno, dir.numero)) continue;
      const fonti =
        rec.fonti && typeof rec.fonti === "object" && !Array.isArray(rec.fonti)
          ? (rec.fonti as Record<string, unknown>)
          : {};
      const eliOsservato = urlOsservato(fonti["normattiva"]);
      const guOsservata = urlOsservato(fonti["gazzetta"]);
      const voce: AttoMappa = {
        titolo: titolo.slice(0, 500),
        fonte: "normattiva",
        nota: `riferimento esplicito a direttiva ${dir.anno}/${dir.numero} in titolo/sintesi/testo del corpus Normattiva`,
      };
      if (eliOsservato) voce.eli = eliOsservato;
      if (guOsservata) voce.urlGU = guOsservata;
      const chiave = stringaPulita(rec.chiave);
      if (chiave) voce.chiaveNormattiva = chiave.slice(0, 200);
      const eliRel = stringaPulita(rec.eli);
      if (eliRel) voce.eliNormattiva = eliRel.slice(0, 200);
      const dataGU = stringaPulita(rec.dataGU);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dataGU)) voce.ojData = dataGU;
      const tipo = stringaPulita(rec.tipo);
      if (tipo) voce.tipoNim = tipo.slice(0, 80);
      voce.titoloNim = titolo.slice(0, 500);
      atti.push(voce);
      if (atti.length >= 20) break;
    }

    // A: CELLAR best-effort (1req/2s), mai bloccare/inventare.
    let termineUE: string | null = null;
    let nim: { titolo: string; celexNim: string }[] = [];
    try {
      nim = await cercaNimIta(dir.celex);
      await dormi(PAUSA_MS);
      termineUE = await cercaTermineUE(dir.celex);
      await dormi(PAUSA_MS);
    } catch {
      nim = [];
      termineUE = null;
    }
    for (const n of nim.slice(0, 10)) {
      // Solo titoli osservati; URL mai costruiti (revoca regola anti-invenzione).
      atti.push({
        titolo: n.titolo.slice(0, 500),
        titoloNim: n.titolo.slice(0, 500),
        fonte: "cellar",
        nota: "notifica dello Stato membro registrata in CELLAR (NIM), non legge italiana",
      });
      if (atti.length >= 20) break;
    }

    const haNim = nim.length > 0 ? "sì" : "no";
    voci.push({
      celexDirettiva: dir.celex,
      annoDirettiva: dir.anno,
      numeroDirettiva: dir.numero,
      termineUE,
      haNimITA: haNim,
      numNimTot: nim.length,
      attiIT: atti.map((a) => ({ ...a })),
      atti: atti.map((a) => ({ ...a })),
      nota: "NTM UE: notifiche degli Stati membri, non leggi italiane; atti IT solo se con riferimento esplicito anno+numero",
    });
  }

  const envelope = {
    provenance: {
      fonte: "CELLAR SPARQL + corpus Normattiva data/reali/normattiva-*.json",
      url: CELLAR_SPARQL,
      recuperatoIl,
      licenza: LICENZA,
      metodo: "ibrida A+B cache-build (A best-effort, B zero-rete); mai affermare senza dati",
      direttive: direttive.length,
      attiCorpus: corpus.length,
    },
    direttive: voci,
  };
  const json = `${JSON.stringify(envelope, null, 2)}\n`;
  if (Buffer.byteLength(json, "utf8") > MAX_BYTE_OUT) {
    console.error("Ingest recepimenti fallito (output oltre 500KB), nessun file scritto.");
    process.exit(1);
    return;
  }
  // Scrittura unica alla fine: mai parziali.
  mkdirSync(DIR_REALI, { recursive: true });
  writeFileSync(FILE_OUT, json, "utf8");
  const conAtti = voci.filter((v) =>
    Array.isArray((v as { atti?: unknown[] }).atti) &&
    ((v as { atti?: unknown[] }).atti ?? []).length > 0
  ).length;
  console.log(
    `Recepimenti: ${voci.length} direttive, ${conAtti} con >=1 atto. File scritto: data/reali/eurlex-recepimenti.json.`,
  );
}

const eseguitoDiretto =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("ingest-reale-recepimenti");

if (eseguitoDiretto) {
  main().catch((e: unknown) => {
    console.error(
      `Ingest recepimenti fallito, nessun file scritto: ${e instanceof Error ? e.message : "errore sconosciuto"}`,
    );
    process.exit(1);
  });
}
