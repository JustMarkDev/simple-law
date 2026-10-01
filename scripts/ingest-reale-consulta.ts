/**
 * Ingest reale Corte Costituzionale — pronunce 2001 (primi 50 atti).
 *
 * Sorgente unica: ZIP ufficiale
 * `https://dati.cortecostituzionale.it/opendata/distribuzione/pronunce/P_json2001_oggi.zip`
 * (contenitore annuale; si estrae solo `Cc_Opendata_Pronunce_2001_json.zip`,
 * JSON codificato cp1252 con radice `{"elenco_pronunce":[...]}`).
 * Pagina di distribuzione e licenza:
 * `https://dati.cortecostituzionale.it/Scarica_i_dati/Scarica_i_dati`
 * (licenza CC BY-SA 3.0, dataset aggiornati con cadenza settimanale).
 *
 * Nessun dato inventato: ogni campo proviene dalle chiavi osservate
 * (`numero_pronuncia/anno_pronuncia/data_decisione/data_deposito/
 * tipologia_pronuncia/presidente/redattore_pronuncia/relatore_pronuncia/
 * epigrafe/dispositivo/ecli`). I campi assenti o malformati vengono omessi,
 * mai ricostruiti. Le date `DD/MM/YYYY` diventano `YYYY-MM-DD` solo se
 * valide. La scheda `https://www.cortecostituzionale.it/scheda-pronuncia/
 * {AAAA}/{N}` e' costruita solo da numero+anno verificati (pattern
 * prescritto dal contratto, nient'altro). `tipologia` resta raw (`S`/`O`).
 *
 * Bound: max 50 record (primi per numero), epigrafe/dispositivo troncati a
 * 2000 caratteri (`testo_troncato: true` quando tagliati), file <= 950KB.
 * Fallimento di rete, ZIP inatteso o zero record utilizzabili -> exit 1
 * senza scrivere alcun file (mai parziali).
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ZIP_URL =
  "https://dati.cortecostituzionale.it/opendata/distribuzione/pronunce/P_json2001_oggi.zip";
const PAGINA_DATI = "https://dati.cortecostituzionale.it/Scarica_i_dati/Scarica_i_dati";
const INNER_ZIP = "Cc_Opendata_Pronunce_2001_json.zip";
const FONTE = "cortecostituzionale";
const LICENZA = "CC BY-SA 3.0";
const TIMEOUT_MS = 120000;
const MAX_ZIP_BYTE = 120_000_000;
const MAX_RECORD = 50;
const MAX_EPI = 2000;
const MAX_DIS = 2000;
const MAX_BYTE = 950 * 1024;

const DIR_REALI = resolve(dirname(fileURLToPath(import.meta.url)), "..", "data", "reali");
const FILE_PRONUNCE = resolve(DIR_REALI, "consulta-pronunce-2001.json");

interface Pronuncia {
  readonly numero: string;
  readonly anno: string;
  readonly dataDecisione?: string;
  readonly dataDeposito?: string;
  readonly tipologia?: string;
  readonly presidente?: string;
  readonly redattore?: string;
  readonly relatore?: string;
  readonly epigrafe?: string;
  readonly dispositivo?: string;
  readonly testo_troncato?: true;
  readonly ecli?: string;
  readonly scheda: string;
}

function argomenti(): { aiuto: boolean; max: number; sorgente: string } {
  let max = MAX_RECORD;
  let sorgente = ZIP_URL;
  let aiuto = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--help" || arg === "-h") aiuto = true;
    else if (arg.startsWith("--max=")) {
      const n = Number.parseInt(arg.slice("--max=".length), 10);
      if (Number.isFinite(n)) max = Math.min(MAX_RECORD, Math.max(1, Math.floor(n)));
    } else if (arg.startsWith("--sorgente=")) {
      const v = arg.slice("--sorgente=".length).trim();
      if (v) sorgente = v;
    }
  }
  return { aiuto, max, sorgente };
}

function pulisci(testo: string): string {
  return testo.replace(/\s+/g, " ").trim();
}

function decodificaEntita(testo: string): string {
  return testo
    .replace(/&#(\d+);/g, (_m, codice: string) => {
      const n = Number(codice);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_m, codice: string) => {
      const n = parseInt(codice, 16);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : "";
    })
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function testoPulito(grezzo: unknown): string {
  if (typeof grezzo !== "string") return "";
  return pulisci(
    decodificaEntita(grezzo)
      .replace(/<[^>]*>/g, " ")
      .replace(/\r/g, " "),
  );
}

function tronca(testo: string, limite: number): { valore: string; tagliato: boolean } {
  if (testo.length <= limite) return { valore: testo, tagliato: false };
  return { valore: testo.slice(0, limite).trimEnd(), tagliato: true };
}

function dataIso(grezza: unknown): string {
  if (typeof grezza !== "string") return "";
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(grezza);
  if (!m) return "";
  const g = Number(m[1]);
  const me = Number(m[2]);
  const a = Number(m[3]);
  if (g < 1 || g > 31 || me < 1 || me > 12 || a < 1900 || a > 2100) return "";
  const iso = `${String(a).padStart(4, "0")}-${String(me).padStart(2, "0")}-${String(g).padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : iso;
}

function soloCifre(valore: unknown): string {
  if (typeof valore !== "string" && typeof valore !== "number") return "";
  const s = String(valore).trim();
  return /^\d+$/.test(s) ? String(Number.parseInt(s, 10)) : "";
}

function ecliValida(valore: unknown): string {
  if (typeof valore !== "string") return "";
  const s = valore.trim();
  return /^ECLI:IT:COST:\d{4}:\d+$/.test(s) ? s : "";
}

function normalizzaVoce(voce: unknown): Pronuncia | null {
  if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
  const o = voce as Record<string, unknown>;
  const numero = soloCifre(o["numero_pronuncia"]);
  const anno = soloCifre(o["anno_pronuncia"]);
  if (!numero || !anno) return null;
  if (anno !== "2001") return null;
  const record: { -readonly [K in keyof Pronuncia]: Pronuncia[K] } = {
    numero,
    anno,
    scheda: `https://www.cortecostituzionale.it/scheda-pronuncia/${anno}/${numero}`,
  } as { -readonly [K in keyof Pronuncia]: Pronuncia[K] };
  const dec = dataIso(o["data_decisione"]);
  if (dec) record.dataDecisione = dec;
  const dep = dataIso(o["data_deposito"]);
  if (dep) record.dataDeposito = dep;
  const tipo =
    typeof o["tipologia_pronuncia"] === "string"
      ? o["tipologia_pronuncia"].trim().toUpperCase().slice(0, 4)
      : "";
  if (tipo) record.tipologia = tipo;
  for (const [chiave, campo] of [
    ["presidente", "presidente"],
    ["redattore_pronuncia", "redattore"],
    ["relatore_pronuncia", "relatore"],
  ] as const) {
    const v =
      typeof o[chiave] === "string" ? o[chiave].trim().replace(/\s+/g, " ").slice(0, 200) : "";
    if (v) (record as Record<string, unknown>)[campo] = v;
  }
  let tagliato = false;
  const epi = tronca(testoPulito(o["epigrafe"]).slice(0, 30000), MAX_EPI);
  if (epi.valore) record.epigrafe = epi.valore;
  tagliato = tagliato || epi.tagliato;
  const dis = tronca(testoPulito(o["dispositivo"]).slice(0, 30000), MAX_DIS);
  if (dis.valore) record.dispositivo = dis.valore;
  tagliato = tagliato || dis.tagliato;
  if (tagliato) record.testo_troncato = true;
  const ecli = ecliValida(o["ecli"]);
  if (ecli) record.ecli = ecli;
  return record as Pronuncia;
}

async function scaricaZip(sorgente: string, cartella: string): Promise<string> {
  if (!/^https?:\/\//i.test(sorgente)) {
    const percorso = resolve(sorgente);
    const contenuto = readFileSync(percorso);
    if (contenuto.length === 0 || contenuto.length > MAX_ZIP_BYTE) {
      throw new Error("file sorgente vuoto o oltre il limite");
    }
    if (contenuto[0] !== 0x50 || contenuto[1] !== 0x4b)
      throw new Error("sorgente locale non e' uno ZIP");
    const destino = join(cartella, "esterno.zip");
    writeFileSync(destino, contenuto);
    return destino;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const risposta = await fetch(sorgente, {
      signal: controller.signal,
      headers: { accept: "application/zip, application/octet-stream" },
    });
    if (!risposta.ok) throw new Error(`download ZIP: HTTP ${risposta.status}`);
    const buf = Buffer.from(await risposta.arrayBuffer());
    if (buf.length === 0) throw new Error("ZIP vuoto");
    if (buf.length > MAX_ZIP_BYTE) throw new Error("ZIP oltre il limite");
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error("risposta non e' uno ZIP");
    const destino = join(cartella, "esterno.zip");
    writeFileSync(destino, buf);
    return destino;
  } finally {
    clearTimeout(timer);
  }
}

function estraiJson2001(zipEsterno: string, cartella: string): string {
  const internoZip = join(cartella, INNER_ZIP);
  const estratto = execFileSync("unzip", ["-p", zipEsterno, INNER_ZIP], {
    maxBuffer: MAX_ZIP_BYTE,
  }) as Buffer;
  if (!estratto || estratto.length === 0) throw new Error("inner ZIP 2001 vuoto");
  writeFileSync(internoZip, estratto);
  const jsonBytes = execFileSync("unzip", ["-p", internoZip, "*.json"], {
    maxBuffer: MAX_ZIP_BYTE,
  }) as Buffer;
  if (!jsonBytes || jsonBytes.length === 0) throw new Error("JSON 2001 vuoto");
  const testo = new TextDecoder("windows-1252").decode(jsonBytes);
  if (!testo.trimStart().startsWith("{")) throw new Error("JSON 2001 non riconosciuto");
  return testo;
}

function elencoDaJson(testo: string): unknown[] {
  const parsed = JSON.parse(testo) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const elenco = (parsed as Record<string, unknown>)["elenco_pronunce"];
  return Array.isArray(elenco) ? elenco : [];
}

async function main(): Promise<void> {
  const { aiuto, max, sorgente } = argomenti();
  if (aiuto) {
    console.log(
      "Uso: bunx tsx scripts/ingest-reale-consulta.ts [--max=50] [--sorgente=URL-o-file]\n" +
        `Scarica ${ZIP_URL},\nestrae solo ${INNER_ZIP} (anno 2001) e scrive data/reali/consulta-pronunce-2001.json (max 50 record, <=950KB).`,
    );
    return;
  }
  const recuperatoIl = new Date().toISOString();
  const cartella = mkdtempSync(join(tmpdir(), "consulta-"));
  try {
    const zipEsterno = await scaricaZip(sorgente, cartella);
    const testo = estraiJson2001(zipEsterno, cartella);
    const elenco = elencoDaJson(testo);
    if (elenco.length === 0) throw new Error("elenco_pronunce vuoto");
    const ordinate = [...elenco].sort((a, b) => {
      const na = Number.parseInt(
        String((a as Record<string, unknown>)?.["numero_pronuncia"] ?? "0"),
        10,
      );
      const nb = Number.parseInt(
        String((b as Record<string, unknown>)?.["numero_pronuncia"] ?? "0"),
        10,
      );
      return (Number.isFinite(na) ? na : 0) - (Number.isFinite(nb) ? nb : 0);
    });
    const pronunce: Pronuncia[] = [];
    for (const voce of ordinate) {
      if (pronunce.length >= max) break;
      const record = normalizzaVoce(voce);
      if (record) pronunce.push(record);
    }
    if (pronunce.length === 0) throw new Error("nessuna pronuncia 2001 utilizzabile");
    const envelope = {
      provenance: {
        fonte: FONTE,
        url: ZIP_URL,
        paginaDati: PAGINA_DATI,
        recuperatoIl,
        licenza: LICENZA,
      },
      anno: "2001",
      totaleAnno: elenco.length,
      pronunce,
    };
    const json = `${JSON.stringify(envelope, null, 2)}\n`;
    if (Buffer.byteLength(json, "utf8") > MAX_BYTE) {
      throw new Error("consulta-pronunce-2001.json oltre 950KB");
    }
    mkdirSync(DIR_REALI, { recursive: true });
    writeFileSync(FILE_PRONUNCE, json, "utf8");
    const sentenze = pronunce.filter((p) => p.tipologia === "S").length;
    const ordinanze = pronunce.filter((p) => p.tipologia === "O").length;
    console.log(
      `Consulta 2001: ${pronunce.length} pronunce su ${elenco.length} dell'anno ` +
        `(${sentenze} S, ${ordinanze} O). File scritto: data/reali/consulta-pronunce-2001.json.`,
    );
  } finally {
    try {
      rmSync(cartella, { recursive: true, force: true });
    } catch {
      // pulizia best-effort
    }
  }
}

main().catch((errore: unknown) => {
  const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
  console.error(`Ingest Consulta fallito, nessun file scritto: ${messaggio}`);
  process.exit(1);
});
