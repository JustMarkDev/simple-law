/**
 * Ingest mappa recepimenti-atti: direttive UE -> atti Camera/Normattiva
 * che le citano esplicitamente (cache-build, zero rete).
 *
 * Regole (stesse del recepimenti esistente, MAI fuzzy):
 *  - match SOLO su riferimenti espliciti con anno+numero entrambi
 *    (`direttiva (UE|CE|CEE) AAAA/N` o `direttiva ... NNNN/AAAA` con la
 *    parola "direttiva/e" entro 60 caratteri prima del riferimento);
 *  - MAI bare `NNNN/AAAA` senza contesto, MAI numeri parziali;
 *  - sorgenti: label/titolo Camera (`data/reali/camera-atti-leg19-*.json`)
 *    + titolo/sintesi/testo Normattiva (`data/reali/normattiva-*.json`);
 *  - direttive senza match -> assenti (non voci vuote);
 *  - MAI inventare numeri/URL/date: titolo/uri solo se osservati nei file
 *    (URL mai costruiti qui); direttive solo da `data/reali/eurlex-2026.json`;
 *  - Bounded: max 50 direttive, max 20 atti/direttiva, output <= 500KB,
 *    exit 1 senza scrivere parziali in caso di errore fatale o oversize.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR_BASE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_REALI = resolve(DIR_BASE, "data", "reali");
const FILE_EURLEX = resolve(DIR_REALI, "eurlex-2026.json");
const FILE_OUT = resolve(DIR_REALI, "eurlex-recepimenti-atti.json");

const MAX_DIRETTIVE = 50;
const MAX_ATTI_PER_DIRETTIVA = 20;
const MAX_BYTE_OUT = 500_000;
const MAX_ATTI_SORGENTE = 5000;
const MAX_TESTO_SCAN = 20000;

const CELEX_DIR_RE = /^3(\d{4})L(\d{1,4})$/;

/* ------------------------------------------------------------------ */
/* Matcher puro (stesse regole di ingest-reale-recepimenti, mai throw). */
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
 *  - `direttiva/e ... NNNN/AAAA` (es. "direttiva 2023/2226/UE")
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
    const rif = /(\d{4})\s*\/\s*(0*\d{1,4})|(0*\d{1,4})\s*\/\s*(\d{4})/g;
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
/* Letture locali (zero rete).                                          */
/* ------------------------------------------------------------------ */

interface AttoEurlexGrezzo {
  celex?: unknown;
  tipo?: unknown;
}

interface AttoCameraGrezzo {
  titolo?: unknown;
  label?: unknown;
  scheda?: unknown;
  uri?: unknown;
}

interface LawRecord {
  chiave?: unknown;
  titolo?: unknown;
  sintesi?: unknown;
  testo?: unknown;
  fonti?: unknown;
}

function stringaPulita(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** URL osservato nei file (mai costruito): Camera http(s) o Normattiva/GU https. */
function urlOsservato(v: unknown): string {
  try {
    const s = stringaPulita(v);
    if (!s || s.length > 500) return "";
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (
      (u.protocol === "http:" || u.protocol === "https:") &&
      (host === "dati.camera.it" || host === "www.camera.it")
    )
      return s;
    if (
      u.protocol === "https:" &&
      (host === "www.normattiva.it" || host === "www.gazzettaufficiale.it")
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

function leggiCameraAtti(): AttoCameraGrezzo[] {
  const nomi = readdirSync(DIR_REALI).filter(
    (f) => f.startsWith("camera-atti-leg19-") && f.endsWith(".json"),
  );
  const atti: AttoCameraGrezzo[] = [];
  for (const nome of nomi.sort()) {
    const raw = readFileSync(resolve(DIR_REALI, nome), "utf8");
    const parsed = JSON.parse(raw) as { atti?: unknown };
    const lista = Array.isArray(parsed.atti) ? parsed.atti : [];
    for (const v of lista) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        atti.push(v as AttoCameraGrezzo);
        if (atti.length >= MAX_ATTI_SORGENTE) return atti;
      }
    }
  }
  return atti;
}

function leggiNormattiva(): LawRecord[] {
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
        if (atti.length >= MAX_ATTI_SORGENTE) return atti;
      }
    }
  }
  return atti;
}

/* ------------------------------------------------------------------ */
/* Main (solo esecuzione diretta; importabile nei test senza effetti). */
/* ------------------------------------------------------------------ */

export interface AttoCollegatoMappa {
  titolo: string;
  uri?: string;
  fonte: "camera" | "normattiva";
  nota?: string;
}

async function main(): Promise<void> {
  const recuperatoIl = new Date().toISOString();
  let direttive: { celex: string; anno: string; numero: string }[];
  try {
    direttive = leggiDirettive();
  } catch (e) {
    console.error(
      `Ingest recepimenti-atti fallito (eurlex-2026 illeggibile), nessun file scritto: ${e instanceof Error ? e.message : "?"}`,
    );
    process.exit(1);
    return;
  }
  if (direttive.length === 0) {
    console.error(
      "Ingest recepimenti-atti fallito (nessuna direttiva), nessun file scritto.",
    );
    process.exit(1);
    return;
  }
  let camera: AttoCameraGrezzo[];
  let corpus: LawRecord[];
  try {
    camera = leggiCameraAtti();
    corpus = leggiNormattiva();
  } catch (e) {
    console.error(
      `Ingest recepimenti-atti fallito (sorgenti illeggibili), nessun file scritto: ${e instanceof Error ? e.message : "?"}`,
    );
    process.exit(1);
    return;
  }

  const voci: Record<string, unknown>[] = [];
  for (const dir of direttive) {
    const atti: AttoCollegatoMappa[] = [];
    // Camera: label/titolo (solo riferimenti espliciti anno+numero).
    for (const rec of camera) {
      if (atti.length >= MAX_ATTI_PER_DIRETTIVA) break;
      const titolo = stringaPulita(rec.titolo) || stringaPulita(rec.label);
      if (!titolo) continue;
      const hay = `${stringaPulita(rec.titolo)}\n${stringaPulita(rec.label)}`;
      if (!testoCitaDirettiva(hay, dir.anno, dir.numero)) continue;
      const uri = urlOsservato(rec.scheda) || urlOsservato(rec.uri);
      const voce: AttoCollegatoMappa = {
        titolo: titolo.slice(0, 500),
        fonte: "camera",
        nota: `riferimento esplicito a direttiva ${dir.anno}/${dir.numero} nella label Camera`,
      };
      if (uri) voce.uri = uri;
      atti.push(voce);
    }
    // Normattiva: titolo/sintesi/testo (solo riferimenti espliciti).
    for (const rec of corpus) {
      if (atti.length >= MAX_ATTI_PER_DIRETTIVA) break;
      const titolo = stringaPulita(rec.titolo);
      if (!titolo) continue;
      const hay = `${stringaPulita(rec.titolo)}\n${stringaPulita(rec.sintesi)}\n${stringaPulita(rec.testo).slice(0, MAX_TESTO_SCAN)}`;
      if (!testoCitaDirettiva(hay, dir.anno, dir.numero)) continue;
      const fonti =
        rec.fonti && typeof rec.fonti === "object" && !Array.isArray(rec.fonti)
          ? (rec.fonti as Record<string, unknown>)
          : {};
      const uri =
        urlOsservato(fonti["normattiva"]) || urlOsservato(fonti["gazzetta"]);
      const voce: AttoCollegatoMappa = {
        titolo: titolo.slice(0, 500),
        fonte: "normattiva",
        nota: `riferimento esplicito a direttiva ${dir.anno}/${dir.numero} in titolo/sintesi/testo del corpus Normattiva`,
      };
      if (uri) voce.uri = uri;
      atti.push(voce);
    }
    // Direttive senza match -> assenti (non voci vuote).
    if (atti.length === 0) continue;
    voci.push({
      celexDirettiva: dir.celex,
      annoDirettiva: dir.anno,
      numeroDirettiva: dir.numero,
      atti,
    });
  }

  const envelope = {
    provenance: {
      fonte:
        "corpus Camera data/reali/camera-atti-leg19-*.json + corpus Normattiva data/reali/normattiva-*.json",
      url: "",
      recuperatoIl,
      licenza: "Camera OCD CC-BY 4.0 + Normattiva/GU riuso con attribuzione",
      metodo:
        "match testuale esplicito anno+numero con parola direttiva/e entro 60ch (stesse regole di ingest-reale-recepimenti.ts); zero rete; mai fuzzy; direttive senza match assenti",
      direttiveScansionate: direttive.length,
      attiCamera: camera.length,
      attiNormattiva: corpus.length,
      vociConMatch: voci.length,
    },
    direttive: voci,
  };
  const json = `${JSON.stringify(envelope, null, 2)}\n`;
  if (Buffer.byteLength(json, "utf8") > MAX_BYTE_OUT) {
    console.error(
      "Ingest recepimenti-atti fallito (output oltre 500KB), nessun file scritto.",
    );
    process.exit(1);
    return;
  }
  // Scrittura unica alla fine: mai parziali.
  mkdirSync(DIR_REALI, { recursive: true });
  writeFileSync(FILE_OUT, json, "utf8");
  console.log(
    `Recepimenti-atti: ${direttive.length} direttive scansionate, ${voci.length} con >=1 atto (camera ${camera.length}, normattiva ${corpus.length}). File scritto: data/reali/eurlex-recepimenti-atti.json.`,
  );
}

const eseguitoDiretto =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("ingest-reale-recepimenti-atti");

if (eseguitoDiretto) {
  main().catch((e: unknown) => {
    console.error(
      `Ingest recepimenti-atti fallito, nessun file scritto: ${e instanceof Error ? e.message : "errore sconosciuto"}`,
    );
    process.exit(1);
  });
}
