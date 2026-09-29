/**
 * Densificazione TAG D2 (secondo passaggio) -> APPEND in
 * data/reali/normattiva-storico-{1949,1977,1999,2007,2008,2009,2011,2019}.json.
 *
 * Primo passaggio (script finestra-anni A/C/D/E, limite 80/anno su finestra
 * annuale) ha lasciato anni magri (<35 atti). Questo script pagina PIU A
 * FONDO: split mensili (12 POST /ricerca/aggiornati per anno su
 * YYYY-MM-01..ultimo giorno) cosi' ogni mese restituisce le sue voci e si
 * raccolgono atti reali oltre i primi 80 annuali. Dettaglio per URN con le
 * stesse regole d'onesta del primo passaggio (stati solo da
 * articoloDataFineVigenza esplicita o intestazione formale Art.1, mai
 * inferiti; mai inventare; zero em/en-dash).
 *
 * BOUND: max +120 atti NUOVI per file; file finale SEMPRE <=950 KB; APPEND
 * (legge l'esistente, unisce con dedup, riscrive). Dedup ELI contro TUTTI i
 * data/reali/*.json + intra-file + intra-run. Se un anno non rende altro
 * (API esaurita o solo duplicati): file invariato, zero aggiunte oneste.
 *
 * Uso:
 *   npx tsx scripts/dense-D2.ts [--anni=2007,2008] [--max-nuovi=120] [--testo-max=2000]
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";
import { buildFonti } from "../lib/fonti";
import { formatNIR, parseELI, parseNIR } from "../lib/nir";
import {
  Normattiva,
  NormattivaError,
  arrayDa,
  defaultNormattivaConfig,
  eliFromUrn,
  isRecord,
  normalizzaData,
  parseAttoDto,
  runNormattiva,
  stripHtml,
  tipoFromDenominazione,
  unwrapData,
} from "../lib/normattiva";
import type { AttoDto, NormattivaConfig } from "../lib/normattiva";
import { attoToLawRecord } from "../lib/sync";

interface LawRecord {
  chiave: string;
  titolo: string;
  tipo: string;
  numero: string;
  dataEmanazione: string;
  nir: string;
  eli: string;
  dataGU?: string;
  numeroGU?: string;
  codiceRedazionale?: string;
  stato: "in_vigore" | "abrogato" | "decaduto";
  articoloDataFineVigenza?: string;
  sintesi: string;
  testo?: string;
  testoTroncato?: boolean;
  fonti: { normattiva?: string; gazzetta?: string; governo?: string };
}

interface VoceDensa {
  urn: string;
  codice: string;
  dataGU: string;
  numeroGU: string;
  eliReale: string;
}

const ANNI_D2 = ["1949", "1977", "1999", "2007", "2008", "2009", "2011", "2019"] as const;
type AnnoD2 = (typeof ANNI_D2)[number];

const DIM_KB = 1024;
const LIMITE_FILE_KB = 950;
const PAUSA_BATCH_MS = 400;
const DETTAGLI_PER_BATCH = 5;
const TIMEOUT_POST_MS = 15000;
const RETRIES = 2;
const MAX_NUOVI_DEFAULT = 120;

const LICENZA =
  "riproduzione consentita con menzione di fonte, carattere non autentico e gratuito " +
  "(Note legali dati.normattiva.it; solo la Gazzetta Ufficiale a stampa e' autentica)";

function outPerAnno(anno: AnnoD2): string {
  return path.join("data", "reali", `normattiva-storico-${anno}.json`);
}

function oggiCompact(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function normalizza(testo: string): string {
  return (testo ?? "").replace(/\s+/g, " ").trim();
}

function stringa(voce: unknown): string {
  if (typeof voce === "string") return voce.trim();
  if (typeof voce === "number" && Number.isFinite(voce)) return String(voce);
  return "";
}

function isIsoDate(testo: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return false;
  const parsed = new Date(`${testo}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === testo;
}

export function pulisciTestoVisibileD2(testo: string): string {
  const senzaTrattini = String(testo ?? "").replace(/[—–]/g, "-");
  return senzaTrattini
    .split("\n")
    .map((riga) => {
      let visti = 0;
      return riga
        .split("")
        .map((ch) => {
          if (ch !== "·") return ch;
          visti += 1;
          return visti <= 1 ? ch : "-";
        })
        .join("");
    })
    .join("\n");
}

function isoDaParti(anno: unknown, mese: unknown, giorno: unknown): string {
  const iso = `${stringa(anno).padStart(4, "0")}-${stringa(mese).padStart(2, "0")}-${stringa(giorno).padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : "";
}

export function chiaveEliD2(eli: unknown): string {
  return String(eli ?? "").trim().toLowerCase();
}

function pausa(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function erroreDefinitivo(cause: unknown): boolean {
  if (cause instanceof NormattivaError) {
    if (cause.status === 403 || cause.status === 409) return true;
    return /ERR_409|1003|bloccata/i.test(cause.message);
  }
  return /ERR_409/i.test(String(cause));
}

function messaggioDi(cause: unknown): string {
  if (cause instanceof NormattivaError) {
    return `${cause.message} (url=${cause.url}${cause.status ? ` status=${cause.status}` : ""})`;
  }
  return cause instanceof Error ? cause.message : String(cause);
}

export function statoDaFineVigenzaD2(
  fineVigenza: string,
  oggiYYYYMMDD: string,
): "in_vigore" | "abrogato" {
  const valida = /^(\d{4})(\d{2})(\d{2})$/.exec((fineVigenza ?? "").trim());
  if (valida && valida[0] !== "99999999" && valida[0] < oggiYYYYMMDD) return "abrogato";
  return "in_vigore";
}

export function statoDaIntestazioneArt1D2(testo: string): "decaduto" | "abrogato" | null {
  try {
    const righe = String(testo ?? "").split(/\r?\n/);
    for (const riga of righe.slice(0, 8)) {
      const pulita = riga.trim().toUpperCase();
      if (/^ART\.\s*1\s+(\(\()?DECRETO DECADUTO\b/.test(pulita)) return "decaduto";
      if (/^ART\.\s*1\s+\(\(PROVVEDIMENTO ABROGATO\b/.test(pulita)) return "abrogato";
    }
    return null;
  } catch {
    return null;
  }
}

export function urnDaVoceD2(voce: unknown): string {
  if (!isRecord(voce)) return "";
  const denominazione = stringa(voce["denominazioneAtto"] ?? voce["tipoProvvedimentoDescrizione"]);
  const tipo = tipoFromDenominazione(denominazione);
  const numero = stringa(
    voce["numeroProvvedimento"] ?? voce["numero"] ?? voce["numeroAttoAlfanumerico"],
  );
  const iso = isoDaParti(voce["annoProvvedimento"], voce["meseProvvedimento"], voce["giornoProvvedimento"]);
  if (!tipo || !numero || !iso) return "";
  const urn = formatNIR({ tipo, data: iso, numero });
  return parseNIR(urn) ? urn : "";
}

function attoInterno(raw: unknown): Record<string, unknown> | null {
  const involucro = unwrapData(raw);
  if (isRecord(involucro)) {
    const interno = involucro["atto"];
    if (isRecord(interno)) return interno;
    return involucro;
  }
  return null;
}

export function dettaglioToRecordD2(
  voce: VoceDensa,
  raw: unknown,
  testoMax: number,
): LawRecord | null {
  const interno = attoInterno(raw);
  if (!interno) return null;
  const dto: AttoDto | null = parseAttoDto(interno);

  const titoloGrezzo =
    normalizza(dto?.titolo ?? "") ||
    normalizza(stringa(interno["titolo"])) ||
    normalizza(stringa(interno["descrizioneAtto"]));
  if (!titoloGrezzo) return null;
  const titolo = pulisciTestoVisibileD2(titoloGrezzo);
  if (!titolo) return null;

  const tipo =
    dto?.tipo ||
    tipoFromDenominazione(
      stringa(interno["tipoProvvedimentoDescrizione"]) || stringa(interno["denominazioneAtto"]),
    ) ||
    "atto";

  const numero =
    dto?.numero ||
    stringa(interno["numeroProvvedimento"]) ||
    (parseNIR(voce.urn)?.numero ?? "");
  if (!numero) return null;

  const dataEmanazione =
    dto?.dataEmanazione ||
    isoDaParti(interno["annoProvvedimento"], interno["meseProvvedimento"], interno["giornoProvvedimento"]) ||
    normalizzaData(interno["dataEmanazione"]) ||
    (parseNIR(voce.urn)?.data ?? "");
  if (!dataEmanazione) return null;

  const codice = dto?.codiceRedazionale || stringa(interno["codiceRedazionale"]) || voce.codice;

  const html = dto?.articoloHtml || stringa(interno["articoloHtml"]);
  const testoIntegrale = dto?.testo || stripHtml(html);
  const sottoTitolo = dto?.sottoTitolo || normalizza(stringa(interno["sottoTitolo"]));
  const fineVigenzaGrezza = stringa(interno["articoloDataFineVigenza"]);
  const daData = statoDaFineVigenzaD2(fineVigenzaGrezza, oggiCompact());
  const daIntestazione = statoDaIntestazioneArt1D2(testoIntegrale);
  const stato: LawRecord["stato"] =
    daData === "abrogato" ? "abrogato" : (daIntestazione ?? "in_vigore");

  const eliReale = dto?.eli && dto.eli.startsWith("/") ? dto.eli : voce.eliReale;
  const eliValido = eliReale && parseELI(eliReale) ? eliReale : "";
  const eli = eliValido || (codice ? eliFromUrn(voce.urn, codice) : "");
  const chiave = eli || voce.urn;
  if (!chiave) return null;

  const law = attoToLawRecord({
    urn: voce.urn,
    eli,
    titolo,
    sottoTitolo,
    articoloHtml: html,
    testo: testoIntegrale,
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice,
    stato,
    raw: interno,
  });
  if (!law) return null;

  const dataGU =
    isoDaParti(interno["annoGU"], interno["meseGU"], interno["giornoGU"]) ||
    (isIsoDate(voce.dataGU) ? voce.dataGU : "");
  const numeroGU = stringa(interno["numeroGU"]) || (/^\d+$/.test(voce.numeroGU) ? voce.numeroGU : "");

  const fonti = buildFonti({
    tipo,
    numero,
    dataEmanazione,
    codiceRedazionale: codice || undefined,
    dataGU: dataGU || undefined,
    numeroGU: numeroGU || undefined,
  });

  const sintesi = pulisciTestoVisibileD2(
    normalizza(law.sintesi || sottoTitolo || testoIntegrale || titolo),
  ).slice(0, 600);
  if (!sintesi) return null;

  const testoPieno = pulisciTestoVisibileD2((law.testo ?? "").trim());
  const troncato = testoPieno.length > testoMax;
  const record: LawRecord = {
    chiave,
    titolo: pulisciTestoVisibileD2(law.titolo),
    tipo: law.tipo,
    numero: law.numero,
    dataEmanazione: law.dataEmanazione,
    nir: voce.urn,
    eli,
    stato,
    sintesi,
    fonti: {
      ...(fonti.normattiva ? { normattiva: fonti.normattiva } : {}),
      ...(fonti.gazzetta ? { gazzetta: fonti.gazzetta } : {}),
      ...(fonti.governo ? { governo: fonti.governo } : {}),
    },
  };
  if (dataGU) record.dataGU = dataGU;
  if (numeroGU) record.numeroGU = numeroGU;
  if (codice) record.codiceRedazionale = codice;
  if (/^\d{8}$/.test(fineVigenzaGrezza)) record.articoloDataFineVigenza = fineVigenzaGrezza;
  if (testoPieno) record.testo = troncato ? `${testoPieno.slice(0, testoMax)} [...]` : testoPieno;
  if (troncato) record.testoTroncato = true;
  return record;
}

function argomento(nome: string): string | undefined {
  const prefisso = `--${nome}=`;
  const trovato = process.argv.find((arg) => arg.startsWith(prefisso));
  return trovato ? trovato.slice(prefisso.length).trim() || undefined : undefined;
}

function intero(nome: string, fallback: number, min: number, max: number): number {
  const grezzo = argomento(nome);
  if (!grezzo) return fallback;
  const parsed = Number.parseInt(grezzo, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function postJson(
  overrides: Partial<NormattivaConfig>,
  pathApi: string,
  body: unknown,
): Promise<unknown> {
  return runNormattiva(
    Effect.gen(function* () {
      const http = yield* Normattiva;
      return yield* http.request("POST", pathApi, body);
    }),
    overrides,
  );
}

export function vociDaAggiornatiD2(raw: unknown): VoceDensa[] {
  const voci = arrayDa(unwrapData(raw), ["listaAtti", "atti", "risultati", "hits"]);
  const risultato: VoceDensa[] = [];
  const visti = new Set<string>();
  for (const voce of voci) {
    const urn = urnDaVoceD2(voce);
    if (!urn || visti.has(urn)) continue;
    visti.add(urn);
    if (!isRecord(voce)) continue;
    const dataGUCandidata = normalizzaData(voce["dataGU"]);
    const eliGrezzo = stringa(voce["eli"]);
    const eliCandidato = eliGrezzo.startsWith("/") ? eliGrezzo : eliGrezzo ? `/${eliGrezzo}` : "";
    risultato.push({
      urn,
      codice: stringa(voce["codiceRedazionale"]),
      dataGU: isIsoDate(dataGUCandidata) ? dataGUCandidata : "",
      numeroGU: stringa(voce["numeroGU"]),
      eliReale: eliCandidato && parseELI(eliCandidato) ? eliCandidato : "",
    });
  }
  return risultato;
}

function mesiAnno(anno: string): Array<[string, string]> {
  const mesi: Array<[string, string]> = [];
  for (let m = 1; m <= 12; m += 1) {
    const mm = String(m).padStart(2, "0");
    const ultimo = new Date(Date.UTC(Number(anno), m, 0)).toISOString().slice(8, 10);
    mesi.push([`${anno}-${mm}-01`, `${anno}-${mm}-${ultimo}`]);
  }
  return mesi;
}

async function listaMese(
  overrides: Partial<NormattivaConfig>,
  ini: string,
  fin: string,
): Promise<{ voci: VoceDensa[]; limite: boolean }> {
  try {
    const raw = await postJson(overrides, "/api/v1/ricerca/aggiornati", {
      dataInizioAggiornamento: ini,
      dataFineAggiornamento: fin,
    });
    return { voci: vociDaAggiornatiD2(raw), limite: false };
  } catch (cause) {
    if (/superiore al limite|7000|raffinare/i.test(messaggioDi(cause))) {
      // Split onesto a meta' mese (stessa API, stessi parametri).
      const t0 = Date.parse(`${ini}T00:00:00Z`);
      const t1 = Date.parse(`${fin}T00:00:00Z`);
      const mid = new Date(t0 + Math.floor((t1 - t0) / 2)).toISOString().slice(0, 10);
      const dopoMid = new Date(Date.parse(`${mid}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
      if (isIsoDate(mid) && isIsoDate(dopoMid) && ini <= mid && dopoMid <= fin) {
        console.log(`Split mese ${ini}..${fin} (oltre limite 7000 atti).`);
        const a = await listaMese(overrides, ini, mid);
        const b = await listaMese(overrides, dopoMid, fin);
        return { voci: [...a.voci, ...b.voci], limite: a.limite || b.limite };
      }
      return { voci: [], limite: true };
    }
    throw cause;
  }
}
function eliCandidati(voce: VoceDensa): string[] {
  const candidati = new Set<string>();
  const reale = chiaveEliD2(voce.eliReale);
  if (reale) candidati.add(reale);
  if (voce.codice) {
    const derivato = chiaveEliD2(eliFromUrn(voce.urn, voce.codice));
    if (derivato) candidati.add(derivato);
  }
  return [...candidati];
}

async function caricaChiaviGlobali(): Promise<Set<string>> {
  const chiavi = new Set<string>();
  let nomi: string[] = [];
  try {
    nomi = await readdir(path.resolve(path.join("data", "reali")));
  } catch {
    return chiavi;
  }
  for (const nome of nomi.filter((n) => n.startsWith("normattiva-") && n.endsWith(".json"))) {
    try {
      const raw = await readFile(path.resolve("data", "reali", nome), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const lista = arrayDa(
        isRecord(parsed) ? (parsed["atti"] ?? parsed["leggi"] ?? parsed["dati"] ?? []) : parsed,
        [],
      );
      for (const item of Array.isArray(lista) ? lista : []) {
        if (!isRecord(item)) continue;
        for (const campo of ["eli", "nir", "chiave"] as const) {
          const k = chiaveEliD2(item[campo]);
          if (k) chiavi.add(k);
        }
      }
    } catch {
      continue;
    }
  }
  return chiavi;
}

async function main(): Promise<void> {
  const maxNuovi = intero("max-nuovi", MAX_NUOVI_DEFAULT, 1, 120);
  const testoMax = intero("testo-max", 2000, 1000, 61440);
  const anniGrezzi = (argomento("anni") ?? [...ANNI_D2].join(","))
    .split(",")
    .map((a) => a.trim())
    .filter((a) => (ANNI_D2 as readonly string[]).includes(a)) as AnnoD2[];
  const anni: AnnoD2[] = anniGrezzi.length > 0 ? [...new Set(anniGrezzi)] : [...ANNI_D2];
  const apiBase = argomento("api-base");
  const overrides: Partial<NormattivaConfig> = {
    timeoutMs: TIMEOUT_POST_MS,
    retries: RETRIES,
    ...(apiBase ? { baseUrl: apiBase } : {}),
  };
  const baseUrl = defaultNormattivaConfig(overrides).baseUrl;
  const urlLista = `${baseUrl}/api/v1/ricerca/aggiornati`;

  const globali = await caricaChiaviGlobali();
  console.log(`Dedup globale: ${globali.size} chiavi ELI/nir da tutti i normattiva-*.json.`);

  const riepilogo: Array<{ anno: string; prima: number; dopo: number; nuovi: number; nota: string }> = [];
  let stopDefinitivo = false;

  for (const anno of anni) {
    const dest = path.resolve(outPerAnno(anno));
    let esistente: { provenance?: unknown; atti: LawRecord[] } = { atti: [] };
    try {
      const raw = await readFile(dest, "utf8");
      const parsed = JSON.parse(raw) as { provenance?: unknown; atti?: unknown };
      const atti = arrayDa(isRecord(parsed) ? (parsed["atti"] ?? []) : [], []);
      esistente = {
        ...(isRecord(parsed?.["provenance"]) ? { provenance: parsed["provenance"] } : {}),
        atti: atti.filter(isRecord) as unknown as LawRecord[],
      };
    } catch {
      console.log(`Anno ${anno}: file esistente illeggibile, salto onesto (zero aggiunte).`);
      riepilogo.push({ anno, prima: 0, dopo: 0, nuovi: 0, nota: "file illeggibile" });
      continue;
    }
    const prima = esistente.atti.length;

    // Secondo passaggio: split mensili, round-robin per non favorire un mese.
    const perMese: VoceDensa[][] = [];
    if (!stopDefinitivo) {
      for (const [ini, fin] of mesiAnno(anno)) {
        try {
          const { voci, limite } = await listaMese(overrides, ini, fin);
          perMese.push(voci);
          if (limite) console.log(`Anno ${anno} mese ${ini}..${fin}: oltre limite anche dopo split, mese parziale onesto.`);
        } catch (cause) {
          console.log(`Anno ${anno} mese ${ini}..${fin} fallito (${messaggioDi(cause)}).`);
          perMese.push([]);
          if (erroreDefinitivo(cause)) {
            console.log("Errore definitivo (403/409): stop liste, dettaglio solo candidati raccolti.");
            stopDefinitivo = true;
            while (perMese.length < 12) perMese.push([]);
            break;
          }
        }
      }
    } else {
      console.log(`Anno ${anno}: salto liste per stop definitivo precedente (zero aggiunte).`);
      riepilogo.push({ anno, prima, dopo: prima, nuovi: 0, nota: "stop 403/409" });
      continue;
    }
    const totVoci = perMese.reduce((s, m) => s + m.length, 0);
    console.log(`Anno ${anno}: ${totVoci} voci mensili totali (${perMese.map((m) => m.length).join("/")}).`);

    // Round-robin tra mesi per candidati oltre i primi 80 annuali.
    const candidati: VoceDensa[] = [];
    const vistiUrn = new Set<string>();
    let indice = 0;
    let ancora = true;
    while (ancora && candidati.length < maxNuovi + 40) {
      ancora = false;
      for (const mese of perMese) {
        if (indice < mese.length) {
          ancora = true;
          const voce = mese[indice] as VoceDensa;
          const k = chiaveEliD2(voce.urn);
          if (!vistiUrn.has(k)) {
            vistiUrn.add(k);
            const noto = k && globali.has(k);
            const eliNoto = eliCandidati(voce).some((c) => globali.has(c));
            if (!noto && !eliNoto) candidati.push(voce);
          }
        }
      }
      indice += 1;
      if (indice > 2000) break;
    }
    const daProvare = candidati.slice(0, maxNuovi + 40);
    console.log(`Anno ${anno}: ${daProvare.length} candidati nuovi dopo dedup globale.`);

    const nuovi: LawRecord[] = [];
    const visti = new Set<string>();
    const errori: string[] = [];
    let interrotto = false;
    for (let i = 0; i < daProvare.length && nuovi.length < maxNuovi && !interrotto; i += DETTAGLI_PER_BATCH) {
      const batch = daProvare.slice(i, i + DETTAGLI_PER_BATCH);
      for (const voce of batch) {
        if (nuovi.length >= maxNuovi) break;
        try {
          const raw = await postJson(overrides, "/api/v1/atto/dettaglio-atto-urn", { urn: voce.urn });
          const record = dettaglioToRecordD2(voce, raw, testoMax);
          if (!record) {
            errori.push(`dettaglio senza titolo/chiave: ${voce.urn}`);
            continue;
          }
          const impronte = [chiaveEliD2(record.chiave), chiaveEliD2(record.eli), chiaveEliD2(record.nir)].filter(Boolean);
          if (impronte.some((im) => visti.has(im) || globali.has(im))) {
            errori.push(`duplicato escluso: ${voce.urn}`);
            continue;
          }
          for (const im of impronte) {
            visti.add(im);
            globali.add(im);
          }
          nuovi.push(record);
        } catch (cause) {
          errori.push(`dettaglio ${voce.urn}: ${messaggioDi(cause)}`);
          if (erroreDefinitivo(cause)) {
            console.log("Stop su errore definitivo durante i dettagli.");
            interrotto = true;
            stopDefinitivo = true;
            break;
          }
        }
      }
      if (i + DETTAGLI_PER_BATCH < daProvare.length && nuovi.length < maxNuovi && !interrotto) {
        await pausa(PAUSA_BATCH_MS);
      }
    }
    console.log(`Anno ${anno}: ${nuovi.length} nuovi record reali; scarti/errori ${errori.length}.`);

    if (nuovi.length === 0) {
      riepilogo.push({ anno, prima, dopo: prima, nuovi: 0, nota: "API esaurita/solo duplicati" });
      continue;
    }

    const uniti = [...esistente.atti, ...nuovi];
    // Dedup intra-file per sicurezza (tiene la prima occorrenza).
    const finale: LawRecord[] = [];
    const visteFinale = new Set<string>();
    for (const r of uniti) {
      const impronte = [chiaveEliD2(r.chiave), chiaveEliD2(r.eli), chiaveEliD2(r.nir)].filter(Boolean);
      if (impronte.some((im) => visteFinale.has(im))) continue;
      for (const im of impronte) visteFinale.add(im);
      finale.push(r);
    }
    const envelope = {
      provenance: {
        fonte: "normattiva",
        url: urlLista,
        recuperatoIl: new Date().toISOString(),
        licenza: LICENZA,
      },
      atti: finale,
    };
    let json = JSON.stringify(envelope, null, 2);
    // Se oltre 950 KB, riduci i nuovi finche' rientra (mai oltre il limite).
    while (Buffer.byteLength(json, "utf8") / DIM_KB > LIMITE_FILE_KB && nuovi.length > 0) {
      nuovi.pop();
      const ridotti = [...esistente.atti, ...nuovi];
      const dedup: LawRecord[] = [];
      const viste = new Set<string>();
      for (const r of ridotti) {
        const impronte = [chiaveEliD2(r.chiave), chiaveEliD2(r.eli), chiaveEliD2(r.nir)].filter(Boolean);
        if (impronte.some((im) => viste.has(im))) continue;
        for (const im of impronte) viste.add(im);
        dedup.push(r);
      }
      envelope.atti = dedup;
      json = JSON.stringify(envelope, null, 2);
    }
    const kb = Buffer.byteLength(json, "utf8") / DIM_KB;
    if (kb > LIMITE_FILE_KB) {
      console.log(`Anno ${anno}: oltre 950 KB anche senza nuovi, file invariato.`);
      riepilogo.push({ anno, prima, dopo: prima, nuovi: 0, nota: "limite 950KB" });
      continue;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, json, "utf8");
    console.log(`Anno ${anno}: ${prima} -> ${envelope.atti.length} (+${envelope.atti.length - prima}) ${kb.toFixed(1)} KB.`);
    riepilogo.push({
      anno,
      prima,
      dopo: envelope.atti.length,
      nuovi: envelope.atti.length - prima,
      nota: errori.length > 0 ? `${errori.length} scarti` : "ok",
    });
  }

  console.log("RIEPILOGO D2 (anno: prima->dopo):");
  for (const r of riepilogo) console.log(`  ${r.anno}: ${r.prima}->${r.dopo} (+${r.nuovi}) [${r.nota}]`);
}

const eseguitoComeScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.length > 1 &&
  (process.argv[1] ?? "").endsWith("dense-D2.ts");

if (eseguitoComeScript) {
  main().catch((cause: unknown) => {
    console.error(`Densificazione D2 fallita: ${messaggioDi(cause)}`);
    process.exitCode = 1;
  });
}
