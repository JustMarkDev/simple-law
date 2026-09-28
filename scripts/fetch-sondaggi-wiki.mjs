#!/usr/bin/env node
/**
 * Ingest sondaggi nazionali (voto di partito) da Wikipedia via MediaWiki API.
 *
 * Fonte (unica, dal giudice REALI-10 §1): voce inglese
 * "Opinion polling for the next Italian general election" (pageid 71355617),
 * endpoint `action=parse&prop=wikitext` + controllo licenza
 * `meta=siteinfo&siprop=rightsinfo` (atteso CC BY-SA 4.0).
 *
 * Scope: SOLO sezione "Party vote" nazionale (tabelle per anno 2026→2022).
 * Esclusi: righe-nota (colspan, by-election), approval/primarie/ipotetici
 * (altre sezioni, mai lette), aggregatori di secondo livello come istituto
 * (PolitPro, BiDiMedia, Cassandra, Youtrend, Europe Elects).
 *
 * Record: {istituto, fieldwork_da, fieldwork_a, campione_n, fdi, pd, m5s,
 * lega, fi, azione, iv, avs, piu_europa, nm, fn, altri, lead, csx, cdx,
 * url_fonte, revid_wiki, estratto_il}.
 *
 * Cap: ultimi N=30 (default, max 60), refresh documentato in avvertenze.
 * Output: data/reali/sondaggi-nazionali.json (envelope con provenance,
 * licenza CC BY-SA 4.0, attribuzione voce+revid+fonti originarie).
 * Cap hard <=950KB: oltre, exit 1 senza parziali (nessun file scritto).
 * Se API non-200, licenza diversa o wikitable sparita: exit 1, solo errore.
 *
 * Uso: `node scripts/fetch-sondaggi-wiki.mjs [--limite N] [--dry-run] [--help]`
 */

const PAGEID = 71355617;
const API = "https://en.wikipedia.org/w/api.php";
const VOCE = "Opinion polling for the next Italian general election";
const URL_VOCE_CURID = `https://en.wikipedia.org/?curid=${PAGEID}`;
const LICENZA_ATTESA = "CC BY-SA 4.0";
const MAX_RECORD = 60;
const DEFAULT_LIMITE = 30;
const MAX_BYTE_OUT = 950 * 1024;
const MAX_BYTE_RETE = 2 * 1024 * 1024;
const TIMEOUT_MS = 30000;

const AGGREGATORI_ESCLUSI = ["politpro", "bidimedia", "cassandra", "youtrend", "europe elects"];

const MESI = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/* ------------------------------------------------------------------ */
/* Helper puri (esportati per i test, mai rete).                        */
/* ------------------------------------------------------------------ */

/** Mese inglese (nome intero o abbreviazione) -> 1..12, altrimenti null. */
export function meseANumero(raw) {
  try {
    const t = String(raw ?? "").trim().toLowerCase();
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(MESI, t)) return MESI[t];
    const tre = t.slice(0, 3);
    if (tre === "jun" && t.startsWith("july")) return 7;
    if (tre === "jun") return 6;
    if (Object.prototype.hasOwnProperty.call(MESI, tre)) return MESI[tre];
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse di {{Opdrts|g1|g2|Mese|Anno}} -> {da, a} ISO (YYYY-MM-DD).
 * Primo giorno vuoto o 0 = giorno singolo (vale il secondo).
 * Null se non valido. Mai lancia.
 */
export function parseOpdrts(template) {
  try {
    const m = String(template ?? "").match(/\{\{\s*Opdrts\s*\|([^}]*)\}\}/i);
    if (!m) return null;
    const parti = m[1].split("|").map((s) => s.trim());
    if (parti.length < 4) return null;
    const [g1raw, g2raw, meseRaw, annoRaw] = parti;
    const mese = meseANumero(meseRaw);
    const anno = /^\d{4}$/.test(annoRaw) ? Number(annoRaw) : NaN;
    if (!mese || !Number.isFinite(anno) || anno < 2022 || anno > 2027) return null;
    let g1 = /^\d{1,2}$/.test(g1raw) ? Number(g1raw) : NaN;
    const g2 = /^\d{1,2}$/.test(g2raw) ? Number(g2raw) : NaN;
    if (!Number.isFinite(g2) || g2 < 1 || g2 > 31) return null;
    if (!Number.isFinite(g1) || g1 < 1 || g1 > 31) g1 = g2;
    const da = g1 <= g2 ? g1 : g2;
    const a = g1 <= g2 ? g2 : g1;
    const mm = String(mese).padStart(2, "0");
    return {
      da: `${anno}-${mm}-${String(da).padStart(2, "0")}`,
      a: `${anno}-${mm}-${String(a).padStart(2, "0")}`,
    };
  } catch {
    return null;
  }
}

/** True se l'istituto e' un aggregatore di secondo livello (escluso). */
export function isAggregatore(istituto) {
  try {
    const t = String(istituto ?? "").toLowerCase();
    if (!t) return true;
    return AGGREGATORI_ESCLUSI.some((s) => t.includes(s));
  } catch {
    return true;
  }
}

/**
 * Estrae [url nome] da una cella wiki -> {url, istituto} o null.
 * URL deve essere http(s); nome 2..80 ch. Mai lancia.
 */
export function estraiLink(cella) {
  try {
    const m = String(cella ?? "").match(/\[(https?:\/\/[^\s\]]+)\s+([^\]]+)\]/);
    if (!m) return null;
    const url = m[1].trim();
    const istituto = m[2].trim().replace(/\s+/g, " ").slice(0, 80);
    if (!/^https?:\/\//i.test(url) || url.length > 500) return null;
    if (istituto.length < 2) return null;
    return { url, istituto };
  } catch {
    return null;
  }
}

/**
 * Primo numero in una cella wiki (percentuale 0..100) o null.
 * Gestisce template ({{Hidden|4.3|...}} -> 4.3), bold, style-prefix,
 * virgola decimale ("27,4") e migliaia ("1,200" -> fuori range %).
 * Mai lancia, mai inventa: nessun default.
 */
export function estraiPercentuale(cella) {
  try {
    let t = String(cella ?? "");
    if (!t.trim()) return null;
    // Rimuove attributi di stile e colori hex (es. #FFD0D7) che
    // contengono cifre prima del valore reale. Mai inventa: solo pulizia.
    t = t.replace(/\sstyle\s*=\s*"[^"]*"/gi, "");
    t = t.replace(/#[0-9A-Fa-f]{3,8}\b/g, "");
    const m = t.match(/(\d{1,3}(?:[.,]\d+)?)/);
    if (!m) return null;
    let raw = m[1];
    if (raw.includes(",") && raw.includes(".")) {
      raw = raw.replace(/,/g, "");
    } else if (raw.includes(",")) {
      if (/,\d{3}$/.test(raw)) raw = raw.replace(/,/g, "");
      else raw = raw.replace(",", ".");
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return Math.round(n * 10) / 10;
  } catch {
    return null;
  }
}

/**
 * Campione da cella ("1,200" -> 1200) o null se assente/invalido.
 * Bound 100..50000 (sondaggi nazionali reali). Mai lancia.
 */
export function parseCampione(cella) {
  try {
    const t = String(cella ?? "").trim();
    if (!t) return null;
    const cifre = t.replace(/[^0-9]/g, "");
    if (!cifre) return null;
    const n = Number(cifre);
    if (!Number.isSafeInteger(n) || n < 100 || n > 50000) return null;
    return n;
  } catch {
    return null;
  }
}

/**
 * Parse di un blocco riga ("|-"...) della tabella Party vote.
 * Ritorna il record o null (nota/colspan, link assente, aggregatore,
 * date invalide, partiti principali assenti). Mai lancia, mai inventa.
 */
export function parseRigaBlocco(blocco, revid, estrattoIl) {
  try {
    if (!blocco || typeof blocco !== "string") return null;
    if (!blocco.includes("Opdrts")) return null;
    if (/colspan/i.test(blocco)) return null;
    const celle = blocco.split("\n|");
    // celle[0] precede il primo "|"; servono almeno opdrts+firm+sample+17 dati
    if (celle.length < 20) return null;
    const op = parseOpdrts(celle[1]);
    if (!op) return null;
    const link = estraiLink(celle[2]);
    if (!link) return null;
    if (isAggregatore(link.istituto)) return null;
    const campione = parseCampione(celle[3]);
    const idx = {
      fdi: 4, pd: 5, m5s: 6, lega: 7, fi: 8, azione: 9, iv: 10,
      avs: 11, piu_europa: 12, nm: 13, fn: 16, altri: 17,
      lead: 18, csx: 19, cdx: 20,
    };
    const val = (i) => (i < celle.length ? estraiPercentuale(celle[i]) : null);
    const fdi = val(idx.fdi);
    const pd = val(idx.pd);
    const m5s = val(idx.m5s);
    if (fdi === null || pd === null || m5s === null) return null;
    return {
      istituto: link.istituto,
      fieldwork_da: op.da,
      fieldwork_a: op.a,
      campione_n: campione,
      fdi,
      pd,
      m5s,
      lega: val(idx.lega),
      fi: val(idx.fi),
      azione: val(idx.azione),
      iv: val(idx.iv),
      avs: val(idx.avs),
      piu_europa: val(idx.piu_europa),
      nm: val(idx.nm),
      fn: val(idx.fn),
      altri: val(idx.altri),
      lead: val(idx.lead),
      csx: val(idx.csx),
      cdx: val(idx.cdx),
      url_fonte: link.url,
      revid_wiki: revid,
      estratto_il: estrattoIl,
    };
  } catch {
    return null;
  }
}

/**
 * Estrae la sezione Party vote (livello 2) dal wikitext: dal titolo
 * "== Party vote ==" alla successiva intestazione di livello 2.
 * Null se non trovata. Mai lancia.
 */
export function estraiSezionePartyVote(wikitext) {
  try {
    const t = String(wikitext ?? "");
    const inizio = t.search(/==\s*Party vote\s*==/);
    if (inizio === -1) return null;
    const resto = t.slice(inizio);
    const primaRigaFine = resto.indexOf("\n");
    const corpo = resto.slice(primaRigaFine + 1);
    const m = corpo.match(/\n==[^=].*?==\n/);
    const sezione = m ? corpo.slice(0, m.index + 1) : corpo;
    if (!sezione.includes("wikitable")) return null;
    return sezione;
  } catch {
    return null;
  }
}

/**
 * Ordina le tabelle annuali dalla piu' recente (2026→2022...) e
 * raccoglie i record validi fino a `limite`. Mai lancia.
 */
export function parseSezionePartyVote(sezione, revid, estrattoIl, limite) {
  try {
    const out = [];
    const cap = Math.min(Math.max(limite || DEFAULT_LIMITE, 1), MAX_RECORD);
    const parti = String(sezione).split(/===\s*(\d{4})\s*===/);
    // parti: [pre, anno1, corpo1, anno2, corpo2, ...]
    const anni = [];
    for (let i = 1; i + 1 < parti.length; i += 2) {
      anni.push({ anno: parti[i], corpo: parti[i + 1] ?? "" });
    }
    anni.sort((a, b) => Number(b.anno) - Number(a.anno));
    for (const { corpo } of anni) {
      const blocchi = corpo.split("|-");
      for (const b of blocchi) {
        if (out.length >= cap) break;
        const r = parseRigaBlocco(b, revid, estrattoIl);
        if (r) out.push(r);
      }
      if (out.length >= cap) break;
    }
    return out;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Rete bounded + orchestrazione (mai parziali su disco).               */
/* ------------------------------------------------------------------ */

function aiuto() {
  return [
    "Ingest sondaggi nazionali (Party vote) da Wikipedia via MediaWiki API.",
    "",
    "Uso:",
    "  node scripts/fetch-sondaggi-wiki.mjs [--limite N] [--dry-run] [--help]",
    "",
    "Opzioni:",
    "  --limite N   ultimi N sondaggi nazionali (default 30, max 60).",
    "  --dry-run    stampa le statistiche e NON scrive il file JSON.",
    "  --help       mostra questo aiuto.",
    "",
    `Sorgente: ${API} pageid ${PAGEID} ("${VOCE}").`,
    `Output: data/reali/sondaggi-nazionali.json (cap ${MAX_BYTE_OUT} byte).`,
  ].join("\n");
}

export function parseArgomenti(argv) {
  let limite = DEFAULT_LIMITE;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--help" || arg === "-h") return "help";
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--limite") {
      const raw = argv[i + 1] ?? "";
      i += 1;
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_RECORD) {
        console.error(`--limite richiede un intero 1..${MAX_RECORD}`);
        return null;
      }
      limite = Number(raw);
      continue;
    }
    if (arg.startsWith("--limite=")) {
      const raw = arg.slice("--limite=".length);
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_RECORD) {
        console.error(`--limite richiede un intero 1..${MAX_RECORD}`);
        return null;
      }
      limite = Number(raw);
      continue;
    }
    console.error(`Argomento sconosciuto: ${arg}`);
    return null;
  }
  return { limite, dryRun };
}

async function getJson(url, etichetta) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const risposta = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "simple-law/1.0 (ingest sondaggi; contatto: sito)" },
    });
    if (!risposta.ok) throw new Error(`${etichetta}: HTTP ${risposta.status}`);
    const dichiarato = Number.parseInt(risposta.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(dichiarato) && dichiarato > MAX_BYTE_RETE) {
      throw new Error(`${etichetta}: dichiarato oltre il cap di rete`);
    }
    const testo = await risposta.text();
    if (!testo || Buffer.byteLength(testo, "utf8") > MAX_BYTE_RETE) {
      throw new Error(`${etichetta}: corpo oltre il cap di rete`);
    }
    return JSON.parse(testo);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const opzioni = parseArgomenti(process.argv.slice(2));
  if (opzioni === "help") {
    console.log(aiuto());
    return;
  }
  if (opzioni === null) process.exit(2);

  // 1) Licenza del sito (deve essere CC BY-SA 4.0).
  const diritti = await getJson(
    `${API}?action=query&meta=siteinfo&siprop=rightsinfo&format=json`,
    "rightsinfo",
  );
  const testoLicenza = diritti?.query?.rightsinfo?.text ?? "";
  const urlLicenza = diritti?.query?.rightsinfo?.url ?? "";
  if (!/Creative Commons Attribution-Share Alike 4\.0/i.test(String(testoLicenza))) {
    throw new Error(`licenza inattesa: ${String(testoLicenza).slice(0, 120)}`);
  }

  // 2) Wikitext della voce (stessa pageid della sonda).
  const parsed = await getJson(
    `${API}?action=parse&pageid=${PAGEID}&prop=wikitext&format=json`,
    "wikitext",
  );
  const titolo = parsed?.parse?.title ?? "";
  const wikitext = parsed?.parse?.wikitext?.["*"] ?? "";
  if (titolo !== VOCE) throw new Error(`titolo inatteso: ${String(titolo).slice(0, 80)}`);
  if (!wikitext || typeof wikitext !== "string") throw new Error("wikitext assente");

  // 3) revid corrente (per provenance e per-record).
  const infoRev = await getJson(
    `${API}?action=query&prop=revisions&pageids=${PAGEID}&rvprop=ids%7Ctimestamp&format=json`,
    "revid",
  );
  const pagine = infoRev?.query?.pages?.[String(PAGEID)];
  const rev = pagine?.revisions?.[0];
  const revid = Number(rev?.revid);
  const timestamp = String(rev?.timestamp ?? "");
  if (!Number.isSafeInteger(revid)) throw new Error("revid non leggibile");
  const estrattoIl = new Date().toISOString().slice(0, 10);

  // 4) Sezione Party vote + record.
  const sezione = estraiSezionePartyVote(wikitext);
  if (!sezione) throw new Error("sezione Party vote o wikitable non trovata: abortito");
  const sondaggi = parseSezionePartyVote(sezione, revid, estrattoIl, opzioni.limite);
  if (sondaggi.length === 0) throw new Error("nessun record Party vote valido: abortito");

  const envelope = {
    provenance: {
      fonte: `Wikipedia — ${VOCE}`,
      url: URL_VOCE_CURID,
      voce: VOCE,
      pageid: PAGEID,
      revid,
      revisione_timestamp: timestamp || undefined,
      estratto_il: estrattoIl,
      licenza: LICENZA_ATTESA,
      licenza_url: urlLicenza || "https://creativecommons.org/licenses/by-sa/4.0/deed.en",
    },
    sezione: "Party vote",
    ambito: "nazionale",
    criteri: {
      ultimi_n: sondaggi.length,
      limite_richiesto: opzioni.limite,
      max_snapshot: MAX_RECORD,
      esclusi: ["approval", "primarie", "ipotetici", "aggregatori secondo livello (PolitPro, BiDiMedia, Cassandra, Youtrend, Europe Elects)"],
    },
    sondaggi,
    metodologia:
      "MediaWiki API action=parse prop=wikitext sulla voce (pageid 71355617), " +
      "solo sezione Party vote nazionale (tabelle annuali dalla piu' recente); " +
      "righe-nota (colspan) scartate; istituto+url dalla cella firm, date da " +
      "template Opdrts, percentuali come primo numero di cella (Hidden -> primo " +
      "parametro); colonne DSP/PLD non pubblicate; refresh consigliato >= 7 giorni.",
    avvertenze:
      "Sondaggi, non risultati elettorali e non leggi: stime con margine di errore, " +
      "mai seggi. Fonti originarie nei link url_fonte degli istituti; riuso con " +
      "attribuzione CC BY-SA 4.0 (voce Wikipedia + revid + istituti).",
    attribuzione:
      `Dati: Wikipedia "${VOCE}" (revid ${revid}, estratto ${estrattoIl}), ` +
      "licenza CC BY-SA 4.0; percentuali dei singoli istituti (vedi url_fonte).",
  };

  const json = `${JSON.stringify(envelope)}\n`;
  const byte = Buffer.byteLength(json, "utf8");
  const istituti = [...new Set(sondaggi.map((s) => s.istituto))].slice(0, 12).join(", ");
  console.log(
    `[fetch-sondaggi-wiki] revid=${revid} record=${sondaggi.length} ` +
      `da=${sondaggi[sondaggi.length - 1]?.fieldwork_da} a=${sondaggi[0]?.fieldwork_a} ` +
      `istituti: ${istituti}`,
  );
  console.log(`[fetch-sondaggi-wiki] output ${byte} byte (cap ${MAX_BYTE_OUT}).`);
  if (byte > MAX_BYTE_OUT) {
    throw new Error(`output ${byte} byte oltre il cap di ${MAX_BYTE_OUT}: nessun file scritto`);
  }
  if (opzioni.dryRun) {
    console.log("[fetch-sondaggi-wiki] dry-run: file JSON non scritto.");
    return;
  }
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { dirname, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const qui = dirname(fileURLToPath(import.meta.url));
  const dirReali = resolve(qui, "..", "data", "reali");
  mkdirSync(dirReali, { recursive: true });
  writeFileSync(resolve(dirReali, "sondaggi-nazionali.json"), json, "utf8");
  console.log("[fetch-sondaggi-wiki] scritto data/reali/sondaggi-nazionali.json.");
}

const eseguitoDiretto =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("fetch-sondaggi-wiki.mjs");
if (eseguitoDiretto) {
  main().catch((errore) => {
    const messaggio = errore instanceof Error ? errore.message : "errore sconosciuto";
    console.error(`Ingest sondaggi fallito, nessun file scritto: ${messaggio}`);
    process.exit(1);
  });
}
