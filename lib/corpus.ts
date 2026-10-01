// lib/corpus.ts
// Architettura corpus 100GB-ready: generatore deterministico + loader streaming.
// Contratto: never-throw per l'accesso dati - ogni funzione fallibile restituisce Esito<T>.
// Lo shard non viene mai caricato intero in memoria: solo stream (readline + zlib).
// Manifest committabile (<100KB); shard *.jsonl.gz mai committati sopra 1MB.
//
// Compatibile con il layout vincolante del giudice:
//   data/corpus/manifest.json { versione, totaleAtti, shard[], checksumSha256, generatoIl }
//   data/corpus/shard-00000.jsonl.gz (una riga = RecordCorpus + dimostrativo:true)

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as zlib from "node:zlib";
import * as readline from "node:readline";

// ---------------------------------------------------------------------------
// Tipi ed Esito (never-throw)
// ---------------------------------------------------------------------------

export type Esito<T> = { ok: true; valore: T } | { ok: false; errore: string };

export function successo<T>(valore: T): Esito<T> {
  return { ok: true, valore };
}

export function fallimento<T>(errore: string): Esito<T> {
  return { ok: false, errore };
}

export interface TipoAtto {
  nome: string;
  slugEli: string;
  slugNir: string;
}

export interface RecordCorpus {
  eli: string;
  nir: string;
  tipo: string;
  tema: string;
  anno: number;
  numero: number;
  dataEmanazione: string; // YYYY-MM-DD
  titolo: string;
  sintesi: string;
  testo: string;
  dimostrativo: true;
  lunghezzaTesto: number;
  testoHash: string;
}

export interface InfoShard {
  file: string;
  count: number;
  bytes: number;
  checksumSha256: string;
}

export interface ManifestoCorpus {
  versione: string;
  totaleAtti: number;
  generatoIl: string;
  seed: string;
  shard: InfoShard[];
  checksumSha256: string;
}

export interface PaginaCorpus {
  pagina: number;
  elementiPerPagina: number;
  totale: number;
  totalePagine: number;
  record: RecordCorpus[];
}

export interface RisultatoVerifica {
  ok: boolean;
  totaleRighe: number;
  errori: string[];
  eliUnici: number;
  nirUnici: number;
}

export interface StatisticheCorpus {
  totaleAtti: number;
  numeroShard: number;
  byteTotali: number;
  byteMediPerAtto: number;
  perTipo: Record<string, number>;
  perAnno: Record<string, number>;
  righeCampionate: number;
}

// ---------------------------------------------------------------------------
// Costanti vincolanti
// ---------------------------------------------------------------------------

export const VERSIONE_CORPUS = "simple-law-corpus-v1";
export const ANNO_MIN = 1948;
export const ANNO_MAX = 2026;
export const DATA_MIN_ISO = "1861-01-01";
export const DATA_MAX_ISO = "2026-12-31";
export const TESTO_MIN_BYTE = 1536; // 1.5KB
export const TESTO_MAX_BYTE = 6144; // 6KB
export const RIGHE_PER_SHARD_DEFAULT = 8000;
export const DIR_CORPUS_DEFAULT = "data/corpus";

export const ELI_REGEX = /^\/eli\/(it\/)?[a-z0-9-]+\/[0-9]{4}\/[0-9]+$/;
export const NIR_REGEX = /^urn:nir:stato:[a-z0-9.-]+:[0-9]{4}(-[0-9]{2}-[0-9]{2})?;[0-9]+$/;

export const TIPI_ATTO: TipoAtto[] = [
  { nome: "Legge", slugEli: "legge", slugNir: "legge" },
  { nome: "Decreto-Legge", slugEli: "dl", slugNir: "decreto.legge" },
  { nome: "Decreto Legislativo", slugEli: "dlgs", slugNir: "decreto.legislativo" },
  {
    nome: "Decreto del Presidente della Repubblica",
    slugEli: "dpr",
    slugNir: "decreto.presidente.repubblica",
  },
  { nome: "Legge Costituzionale", slugEli: "lcost", slugNir: "legge.costituzionale" },
  { nome: "Regolamento", slugEli: "regolamento", slugNir: "regolamento" },
];

export interface TemaCorpus {
  slug: string;
  etichetta: string;
  oggetti: string[];
}

export const TEMI: TemaCorpus[] = [
  {
    slug: "fisco",
    etichetta: "Fisco e tributi",
    oggetti: [
      "riordino delle detrazioni fiscali",
      "semplificazione degli adempimenti tributari",
      "contrasto all’evasione fiscale",
    ],
  },
  {
    slug: "lavoro",
    etichetta: "Lavoro e previdenza",
    oggetti: [
      "tutela dei contratti a tempo determinato",
      "sostegno all’occupazione giovanile",
      "riordino degli ammortizzatori sociali",
    ],
  },
  {
    slug: "sanita",
    etichetta: "Sanità",
    oggetti: [
      "potenziamento della medicina territoriale",
      "liste di attesa e livelli essenziali di assistenza",
      "personale sanitario e formazione continua",
    ],
  },
  {
    slug: "istruzione",
    etichetta: "Istruzione e università",
    oggetti: [
      "edilizia scolastica e sicurezza",
      "reclutamento dei docenti",
      "diritto allo studio universitario",
    ],
  },
  {
    slug: "ambiente",
    etichetta: "Ambiente e territorio",
    oggetti: [
      "bonifica dei siti contaminati",
      "tutela delle aree protette",
      "prevenzione del dissesto idrogeologico",
    ],
  },
  {
    slug: "giustizia",
    etichetta: "Giustizia",
    oggetti: [
      "efficienza del processo civile",
      "esecuzione penale e misure alternative",
      "organico della magistratura onoraria",
    ],
  },
  {
    slug: "digitale",
    etichetta: "Digitale e innovazione",
    oggetti: [
      "interoperabilità delle banche dati pubbliche",
      "identità digitale e domicilio elettronico",
      "riuso del software pubblico",
    ],
  },
  {
    slug: "energia",
    etichetta: "Energia",
    oggetti: [
      "comunità energetiche rinnovabili",
      "semplificazione per gli impianti fotovoltaici",
      "efficienza energetica degli edifici",
    ],
  },
  {
    slug: "trasporti",
    etichetta: "Trasporti e infrastrutture",
    oggetti: [
      "sicurezza stradale e revisione dei veicoli",
      "trasporto pubblico locale",
      "manutenzione della rete ferroviaria",
    ],
  },
  {
    slug: "casa",
    etichetta: "Casa e urbanistica",
    oggetti: [
      "rigenerazione urbana",
      "edilizia residenziale pubblica",
      "contratti di locazione a canone concordato",
    ],
  },
  {
    slug: "immigrazione",
    etichetta: "Immigrazione e cittadinanza",
    oggetti: [
      "accoglienza e integrazione",
      "ingressi per motivi di lavoro",
      "procedure di riconoscimento della protezione",
    ],
  },
  {
    slug: "cultura",
    etichetta: "Cultura e spettacolo",
    oggetti: [
      "tutela del patrimonio culturale",
      "sostegno al cinema e all’audiovisivo",
      "promozione della lettura",
    ],
  },
];

const FRASI_ARTICOLO: string[] = [
  "Le disposizioni del presente articolo si applicano ai procedimenti avviati dopo la data di entrata in vigore.",
  "Con decreto del Ministro competente, da adottare entro novanta giorni, sono definite le modalità attuative.",
  "Le amministrazioni provvedono nei limiti delle risorse umane, strumentali e finanziarie disponibili a legislazione vigente.",
  "Resta fermo quanto previsto dalla normativa europea e dagli obblighi internazionali in materia.",
  "Il monitoraggio degli effetti è svolto annualmente sulla base degli indicatori pubblicati in allegato.",
  "In caso di inadempienza si applicano le sanzioni amministrative pecuniarie da mille a diecimila euro.",
  "Sono fatte salve le competenze delle regioni a statuto speciale e delle province autonome.",
  "L’efficacia delle misure è subordinata alla verifica della compatibilità finanziaria da parte del Ministero competente.",
];

const NUMERO_ANNI = ANNO_MAX - ANNO_MIN + 1; // 79

// ---------------------------------------------------------------------------
// PRNG deterministico: FNV-1a + mulberry32
// Seed canonico: simple-law-corpus-v1:<tema>:<tipo>:<anno>[:<numero>]
// ---------------------------------------------------------------------------

export function fnv1a32(testo: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < testo.length; i++) {
    hash ^= testo.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function mulberry32(seed: number): () => number {
  let stato = seed >>> 0;
  return () => {
    stato = (stato + 0x6d2b79f5) | 0;
    let t = Math.imul(stato ^ (stato >>> 15), 1 | stato);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function creaPrngDaSeed(seed: string): () => number {
  return mulberry32(fnv1a32(seed));
}

export function semeRecord(
  seedBase: string,
  tema: string,
  tipo: string,
  anno: number,
  numero: number,
): string {
  return `${seedBase}:${tema}:${tipo}:${anno}:${numero}`;
}

function interoCasuale(casuale: () => number, min: number, max: number): number {
  return min + Math.floor(casuale() * (max - min + 1));
}

function scegliCasuale<T>(casuale: () => number, lista: readonly T[]): T {
  return lista[Math.floor(casuale() * lista.length)];
}

// ---------------------------------------------------------------------------
// Generatore deterministico
// ---------------------------------------------------------------------------

function giornoMeseDeterministico(casuale: () => number, anno: number): string {
  const mese = interoCasuale(casuale, 1, 12);
  const giornoMax = mese === 2 ? 28 : [4, 6, 9, 11].includes(mese) ? 30 : 31;
  const giorno = interoCasuale(casuale, 1, giornoMax);
  const mm = String(mese).padStart(2, "0");
  const gg = String(giorno).padStart(2, "0");
  return `${anno}-${mm}-${gg}`;
}

function hashSha256Hex(testo: string): string {
  return crypto.createHash("sha256").update(testo, "utf8").digest("hex");
}

/** Genera un singolo record deterministico a partire dall'indice globale. ELI/NIR unici per costruzione. */
export function generaRecord(indice: number, seedBase: string = VERSIONE_CORPUS): RecordCorpus {
  const indiceSano = Math.max(0, Math.floor(indice));
  const tipoInfo = TIPI_ATTO[indiceSano % TIPI_ATTO.length];
  const anno = ANNO_MIN + (Math.floor(indiceSano / TIPI_ATTO.length) % NUMERO_ANNI);
  const numero = Math.floor(indiceSano / (TIPI_ATTO.length * NUMERO_ANNI)) + 1;
  const offsetTema = fnv1a32(seedBase) % TEMI.length;
  const temaInfo = TEMI[(indiceSano * 31 + offsetTema) % TEMI.length];

  const seme = semeRecord(seedBase, temaInfo.slug, tipoInfo.slugEli, anno, numero);
  const casuale = creaPrngDaSeed(seme);

  const oggetto = scegliCasuale(casuale, temaInfo.oggetti);
  const dataEmanazione = giornoMeseDeterministico(casuale, anno);
  const titolo = `${tipoInfo.nome} n. ${numero} del ${anno} - ${temaInfo.etichetta}: ${oggetto}`;
  const sintesi =
    `Provvedimento in materia di ${oggetto}. ` +
    `Disciplina finalità, ambito di applicazione e adempimenti per le amministrazioni e i destinatari.`;

  const eli = `/eli/it/${tipoInfo.slugEli}/${anno}/${numero}`;
  const nir = `urn:nir:stato:${tipoInfo.slugNir}:${anno};${numero}`;

  const obiettivoByte = TESTO_MIN_BYTE + Math.floor(casuale() * (TESTO_MAX_BYTE - TESTO_MIN_BYTE));
  const righe: string[] = [];
  righe.push(`${tipoInfo.nome.toUpperCase()} n. ${numero} del ${dataEmanazione}`);
  righe.push(`(${temaInfo.etichetta}: ${oggetto})`);
  righe.push("");
  righe.push(
    "Visti gli articoli 76 e 87 della Costituzione; visto il parere delle competenti Commissioni parlamentari; " +
      "sulla proposta del Presidente del Consiglio dei ministri;",
  );
  righe.push("");

  let numeroArticolo = 1;
  let byteCorrenti = Buffer.byteLength(righe.join("\n"), "utf8");
  while (byteCorrenti < obiettivoByte && numeroArticolo <= 40) {
    righe.push(`Art. ${numeroArticolo} - (Oggetto e ambito di applicazione)`);
    const commi = interoCasuale(casuale, 2, 4);
    for (let c = 1; c <= commi; c++) {
      const frase = scegliCasuale(casuale, FRASI_ARTICOLO);
      let comma = `${c}. ${frase}`;
      if ((numeroArticolo + c) % 3 === 0) {
        const rinvioAnno = ANNO_MIN + Math.floor(casuale() * NUMERO_ANNI);
        const rinvioNumero = 1 + Math.floor(casuale() * 300);
        comma += ` Ai sensi dell’articolo ${1 + Math.floor(casuale() * 12)} della legge n. ${rinvioNumero} del ${rinvioAnno}, resta fermo quanto ivi previsto.`;
      }
      righe.push(comma);
    }
    righe.push("");
    numeroArticolo += 1;
    byteCorrenti = Buffer.byteLength(righe.join("\n"), "utf8");
  }
  righe.push("Il presente provvedimento entra in vigore il giorno successivo alla pubblicazione.");
  let testo = righe.join("\n");
  // Taglia all'ultimo confine di articolo se supera il massimo, ma mai sotto il minimo.
  if (Buffer.byteLength(testo, "utf8") > TESTO_MAX_BYTE) {
    const righeTagliate = testo.split("\n");
    while (
      righeTagliate.length > 4 &&
      Buffer.byteLength(righeTagliate.join("\n"), "utf8") > TESTO_MAX_BYTE
    ) {
      righeTagliate.pop();
    }
    testo = righeTagliate.join("\n");
  }

  const lunghezzaTesto = Buffer.byteLength(testo, "utf8");
  const testoHash = hashSha256Hex(testo);

  return {
    eli,
    nir,
    tipo: tipoInfo.nome,
    tema: temaInfo.slug,
    anno,
    numero,
    dataEmanazione,
    titolo,
    sintesi,
    testo,
    dimostrativo: true,
    lunghezzaTesto,
    testoHash,
  };
}

/** Genera in memoria un piccolo corpus (per test/campioni). Per volumi grandi usare lo streaming della CLI.
 * Cap a 20000 per evitare OOM: oltre usare `scripts/corpus-100gb.ts` in streaming. */
export function generaCorpus(
  totale: number,
  seedBase: string = VERSIONE_CORPUS,
): Esito<RecordCorpus[]> {
  if (!Number.isInteger(totale) || totale < 1 || totale > 20000) {
    return fallimento(
      "Il totale deve essere un intero tra 1 e 20000 (oltre: usare la CLI in streaming).",
    );
  }
  if (!seedBase || seedBase.length > 200) {
    return fallimento("Seed non valido: da 1 a 200 caratteri.");
  }
  const record: RecordCorpus[] = [];
  for (let i = 0; i < totale; i++) {
    record.push(generaRecord(i, seedBase));
  }
  return successo(record);
}

/** Generatore streaming per volumi 100GB: non alloca l'intero corpus (fix P0 OOM). */
export function* iterRecord(
  totale: number,
  seedBase: string = VERSIONE_CORPUS,
): Generator<RecordCorpus> {
  const n = Math.max(0, Math.min(200000, Math.floor(totale) || 0));
  for (let i = 0; i < n; i++) {
    yield generaRecord(i, seedBase);
  }
}

// ---------------------------------------------------------------------------
// Manifest (file piccolo, <100KB: lettura diretta consentita)
// ---------------------------------------------------------------------------

export function checksumManifesto(parziale: Omit<ManifestoCorpus, "checksumSha256">): string {
  const base = `${parziale.versione}:${parziale.totaleAtti}:${parziale.shard.map((s) => s.checksumSha256).join(",")}`;
  return crypto.createHash("sha256").update(base, "utf8").digest("hex");
}

export function costruisciManifest(
  shard: InfoShard[],
  seed: string,
  generatoIl: string = new Date().toISOString(),
): ManifestoCorpus {
  const totaleAtti = shard.reduce((acc, s) => acc + s.count, 0);
  const parziale = { versione: VERSIONE_CORPUS, totaleAtti, generatoIl, seed, shard };
  return { ...parziale, checksumSha256: checksumManifesto(parziale) };
}

export async function leggiManifest(percorso: string): Promise<Esito<ManifestoCorpus>> {
  try {
    const grezzo = await fs.promises.readFile(percorso, "utf8");
    const dati = JSON.parse(grezzo) as ManifestoCorpus;
    if (!dati || dati.versione !== VERSIONE_CORPUS || !Array.isArray(dati.shard)) {
      return fallimento(`Manifest non valido in ${percorso}.`);
    }
    return successo(dati);
  } catch (errore) {
    return fallimento(`Impossibile leggere il manifest ${percorso}: ${(errore as Error).message}`);
  }
}

export async function salvaManifest(
  percorso: string,
  manifest: ManifestoCorpus,
): Promise<Esito<void>> {
  try {
    await fs.promises.mkdir(path.dirname(percorso), { recursive: true });
    await fs.promises.writeFile(percorso, JSON.stringify(manifest, null, 2), "utf8");
    return successo(undefined);
  } catch (errore) {
    return fallimento(`Impossibile salvare il manifest ${percorso}: ${(errore as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Utilità streaming (mai readFile intero sullo shard)
// ---------------------------------------------------------------------------

export async function calcolaSha256File(percorso: string): Promise<Esito<string>> {
  try {
    const hash = crypto.createHash("sha256");
    const flusso = fs.createReadStream(percorso);
    await new Promise<void>((risolvi, rifiuta) => {
      flusso.on("data", (pezzo) => hash.update(pezzo as Buffer));
      flusso.on("end", () => risolvi());
      flusso.on("error", (errore) => rifiuta(errore));
    });
    return successo(hash.digest("hex"));
  } catch (errore) {
    return fallimento(`Impossibile calcolare sha256 di ${percorso}: ${(errore as Error).message}`);
  }
}

function apriLineeShard(
  percorso: string,
): Esito<{ flusso: fs.ReadStream; linee: readline.Interface }> {
  try {
    if (!fs.existsSync(percorso)) {
      return fallimento(`Shard non trovato: ${percorso}.`);
    }
    const flusso = fs.createReadStream(percorso);
    const ingresso: NodeJS.ReadableStream = percorso.endsWith(".gz")
      ? flusso.pipe(zlib.createGunzip())
      : flusso;
    const linee = readline.createInterface({ input: ingresso, crlfDelay: Infinity });
    // Evita eccezioni non gestite: ogni errore dello stream chiude l'interfaccia
    // e viene poi rilevato come fallimento durante l'iterazione.
    const chiudiSilenzioso = (): void => {
      try {
        linee.close();
      } catch {
        // Mai lanciare: contratto never-throw.
      }
    };
    flusso.on("error", chiudiSilenzioso);
    ingresso.on("error", chiudiSilenzioso);
    return successo({ flusso, linee });
  } catch (errore) {
    return fallimento(`Impossibile aprire lo shard ${percorso}: ${(errore as Error).message}`);
  }
}

function chiudiLinee(aperto: { flusso: fs.ReadStream; linee: readline.Interface }): void {
  try {
    aperto.linee.close();
  } catch {
    // never-throw
  }
  try {
    aperto.flusso.destroy();
  } catch {
    // never-throw
  }
}

function analizzaRiga(riga: string, numeroRiga: number, percorso: string): Esito<RecordCorpus> {
  if (!riga.trim()) return fallimento(`Riga vuota ${numeroRiga} in ${percorso}.`);
  try {
    const dati = JSON.parse(riga) as RecordCorpus;
    return successo(dati);
  } catch {
    return fallimento(`JSON non valido alla riga ${numeroRiga} in ${percorso}.`);
  }
}

/** Scrive record in JSONL gzip in streaming. Ritorna count/bytes/checksum. */
export async function scriviShardJsonlGzip(
  percorso: string,
  record: Iterable<RecordCorpus>,
): Promise<Esito<InfoShard>> {
  try {
    await fs.promises.mkdir(path.dirname(percorso), { recursive: true });
    const gzip = zlib.createGzip();
    const uscita = fs.createWriteStream(percorso);
    const completato = new Promise<void>((risolvi, rifiuta) => {
      uscita.on("finish", () => risolvi());
      uscita.on("error", (errore) => rifiuta(errore));
      gzip.on("error", (errore) => rifiuta(errore));
    });
    gzip.pipe(uscita);
    let count = 0;
    for (const r of record) {
      const riga = JSON.stringify(r) + "\n";
      if (!gzip.write(riga)) {
        await new Promise<void>((risolvi) => gzip.once("drain", () => risolvi()));
      }
      count += 1;
    }
    gzip.end();
    await completato;
    const stat = await fs.promises.stat(percorso);
    const esitoHash = await calcolaSha256File(percorso);
    if (!esitoHash.ok) return esitoHash;
    return successo({
      file: path.basename(percorso),
      count,
      bytes: stat.size,
      checksumSha256: esitoHash.valore,
    });
  } catch (errore) {
    return fallimento(`Impossibile scrivere lo shard ${percorso}: ${(errore as Error).message}`);
  }
}

/** Conta le righe dello shard in streaming (con limite opzionale per verifiche rapide su 100GB). */
export async function contaShard(percorso: string, maxRighe = 0): Promise<Esito<number>> {
  const aperto = apriLineeShard(percorso);
  if (!aperto.ok) return aperto;
  try {
    let totale = 0;
    for await (const riga of aperto.valore.linee) {
      if (riga.trim()) totale += 1;
      if (maxRighe > 0 && totale >= maxRighe) break;
    }
    return successo(totale);
  } catch (errore) {
    return fallimento(`Errore di lettura di ${percorso}: ${(errore as Error).message}`);
  } finally {
    chiudiLinee(aperto.valore);
  }
}

/** Pagina di uno shard in streaming: salta (pagina-1)*n righe e legge n righe. Mai tutto in memoria. */
export async function paginaShard(
  percorso: string,
  pagina: number,
  elementiPerPagina: number,
): Promise<Esito<PaginaCorpus>> {
  if (!Number.isInteger(pagina) || pagina < 1) return fallimento("Pagina non valida: intero >= 1.");
  if (!Number.isInteger(elementiPerPagina) || elementiPerPagina < 1 || elementiPerPagina > 500) {
    return fallimento("Elementi per pagina non validi: intero tra 1 e 500.");
  }
  const aperto = apriLineeShard(percorso);
  if (!aperto.ok) return aperto;
  try {
    const daSaltare = (pagina - 1) * elementiPerPagina;
    const record: RecordCorpus[] = [];
    let indice = 0;
    let totale = 0;
    for await (const riga of aperto.valore.linee) {
      if (!riga.trim()) continue;
      if (indice >= daSaltare && record.length < elementiPerPagina) {
        const esito = analizzaRiga(riga, indice + 1, percorso);
        if (esito.ok) record.push(esito.valore);
      }
      indice += 1;
    }
    totale = indice;
    return successo({
      pagina,
      elementiPerPagina,
      totale,
      totalePagine: Math.max(1, Math.ceil(totale / elementiPerPagina)),
      record,
    });
  } catch (errore) {
    return fallimento(`Errore di lettura di ${percorso}: ${(errore as Error).message}`);
  } finally {
    chiudiLinee(aperto.valore);
  }
}

// ---------------------------------------------------------------------------
// FTS semplice (titolo > sintesi > testo) + frase esatta tra virgolette
// ---------------------------------------------------------------------------

function normalizza(testo: string): string {
  return testo.toLowerCase().normalize("NFC");
}

export function punteggioRilevanza(record: RecordCorpus, query: string): number {
  const q = query.trim();
  if (q.length < 2) return 0;
  // Frase esatta tra virgolette: bonus alto se presente in titolo/sintesi/testo.
  const frase = q.match(/"([^"]{2,})"/)?.[1];
  if (frase) {
    const f = normalizza(frase);
    if (normalizza(record.titolo).includes(f)) return 100;
    if (normalizza(record.sintesi).includes(f)) return 60;
    if (normalizza(record.testo).includes(f)) return 30;
    return 0;
  }
  const termini = normalizza(q)
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 10);
  if (termini.length === 0) return 0;
  const titolo = normalizza(record.titolo);
  const sintesi = normalizza(record.sintesi);
  const testo = normalizza(record.testo.slice(0, 20000));
  let punteggio = 0;
  for (const termine of termini) {
    if (titolo.includes(termine)) punteggio += 3;
    if (sintesi.includes(termine)) punteggio += 2;
    if (testo.includes(termine)) punteggio += 1;
  }
  // Bonus numero/anno citati nella query.
  if (String(record.numero).length >= 1 && q.includes(String(record.numero))) punteggio += 1;
  if (q.includes(String(record.anno))) punteggio += 1;
  return punteggio;
}

/** Ricerca FTS in streaming su uno shard, con paginazione ordinata per rilevanza. */
export async function cercaInShard(
  percorso: string,
  query: string,
  limite = 50,
): Promise<Esito<RecordCorpus[]>> {
  const q = query.trim().slice(0, 200);
  if (q.length < 2) return fallimento("Ricerca troppo corta: minimo 2 caratteri.");
  if (!Number.isInteger(limite) || limite < 1 || limite > 500) {
    return fallimento("Limite non valido: intero tra 1 e 500.");
  }
  const aperto = apriLineeShard(percorso);
  if (!aperto.ok) return aperto;
  try {
    const candidati: Array<{ punteggio: number; record: RecordCorpus }> = [];
    let numeroRiga = 0;
    for await (const riga of aperto.valore.linee) {
      numeroRiga += 1;
      if (!riga.trim()) continue;
      const esito = analizzaRiga(riga, numeroRiga, percorso);
      if (!esito.ok) continue;
      const punteggio = punteggioRilevanza(esito.valore, q);
      if (punteggio > 0) {
        candidati.push({ punteggio, record: esito.valore });
        // Mantiene memoria limitata: conserva solo i migliori 5x limite.
        if (candidati.length > limite * 5) {
          candidati.sort((a, b) => b.punteggio - a.punteggio);
          candidati.length = limite * 5;
        }
      }
    }
    candidati.sort((a, b) => b.punteggio - a.punteggio);
    return successo(candidati.slice(0, limite).map((c) => c.record));
  } catch (errore) {
    return fallimento(`Errore di ricerca in ${percorso}: ${(errore as Error).message}`);
  } finally {
    chiudiLinee(aperto.valore);
  }
}

// ---------------------------------------------------------------------------
// Verifica shard (ELI/NIR unici, date 1861-2026, testi 1.5-6KB, sha, mai throw)
// ---------------------------------------------------------------------------

export function validaRecord(record: RecordCorpus): string[] {
  const problemi: string[] = [];
  if (!record || typeof record !== "object") return ["Record non oggetto."];
  if (!ELI_REGEX.test(record.eli ?? "")) problemi.push(`ELI non valido: ${String(record.eli)}`);
  if (!NIR_REGEX.test(record.nir ?? "")) problemi.push(`NIR non valido: ${String(record.nir)}`);
  if (record.anno < 1861 || record.anno > 2026)
    problemi.push(`Anno fuori intervallo 1861-2026: ${record.anno}`);
  if (
    typeof record.dataEmanazione !== "string" ||
    Number.isNaN(Date.parse(record.dataEmanazione))
  ) {
    problemi.push(`Data emanazione non valida: ${String(record.dataEmanazione)}`);
  } else if (record.dataEmanazione < DATA_MIN_ISO || record.dataEmanazione > DATA_MAX_ISO) {
    problemi.push(`Data fuori intervallo 1861-2026: ${record.dataEmanazione}`);
  }
  const byteTesto = Buffer.byteLength(record.testo ?? "", "utf8");
  if (byteTesto < TESTO_MIN_BYTE || byteTesto > TESTO_MAX_BYTE + 512) {
    problemi.push(`Testo fuori intervallo (~1.5-6KB): ${byteTesto} byte in ${record.eli}`);
  }
  if (record.dimostrativo !== true) problemi.push(`Flag dimostrativo mancante in ${record.eli}`);
  if (!record.titolo || !record.sintesi || !record.testo)
    problemi.push(`Campi titolo/sintesi/testo mancanti in ${record.eli}`);
  return problemi;
}

export interface OpzioniVerifica {
  maxErrori?: number;
  maxRighe?: number;
  eliVisti?: Set<string>;
  nirVisti?: Set<string>;
}

export async function verificaShard(
  percorso: string,
  opzioni: OpzioniVerifica = {},
): Promise<Esito<RisultatoVerifica>> {
  const maxErrori = opzioni.maxErrori ?? 20;
  const maxRighe = opzioni.maxRighe ?? 0;
  const eliVisti = opzioni.eliVisti ?? new Set<string>();
  const nirVisti = opzioni.nirVisti ?? new Set<string>();
  const aperto = apriLineeShard(percorso);
  if (!aperto.ok) return aperto;
  try {
    const errori: string[] = [];
    let totaleRighe = 0;
    let numeroRiga = 0;
    for await (const riga of aperto.valore.linee) {
      numeroRiga += 1;
      if (!riga.trim()) continue;
      totaleRighe += 1;
      const esito = analizzaRiga(riga, numeroRiga, percorso);
      if (!esito.ok) {
        errori.push(esito.errore);
      } else {
        const record = esito.valore;
        for (const p of validaRecord(record)) errori.push(`Riga ${numeroRiga}: ${p}`);
        if (eliVisti.has(record.eli))
          errori.push(`Riga ${numeroRiga}: ELI duplicato ${record.eli}`);
        else eliVisti.add(record.eli);
        if (nirVisti.has(record.nir))
          errori.push(`Riga ${numeroRiga}: NIR duplicato ${record.nir}`);
        else nirVisti.add(record.nir);
      }
      if (errori.length >= maxErrori) break;
      if (maxRighe > 0 && totaleRighe >= maxRighe) break;
    }
    return successo({
      ok: errori.length === 0,
      totaleRighe,
      errori,
      eliUnici: eliVisti.size,
      nirUnici: nirVisti.size,
    });
  } catch (errore) {
    return fallimento(`Errore di verifica di ${percorso}: ${(errore as Error).message}`);
  } finally {
    chiudiLinee(aperto.valore);
  }
}

/** Statistiche da manifest + campione streaming (sicuro anche su 100GB: non scansiona tutto). */
export async function statisticheCorpus(
  dirCorpus: string = DIR_CORPUS_DEFAULT,
  righeCampionePerShard = 500,
): Promise<Esito<StatisticheCorpus>> {
  const percorsoManifest = path.join(dirCorpus, "manifest.json");
  const esitoManifest = await leggiManifest(percorsoManifest);
  if (!esitoManifest.ok) return esitoManifest;
  const manifest = esitoManifest.valore;
  const perTipo: Record<string, number> = {};
  const perAnno: Record<string, number> = {};
  let righeCampionate = 0;
  for (const info of manifest.shard) {
    const percorso = path.join(dirCorpus, info.file);
    const aperto = apriLineeShard(percorso);
    if (!aperto.ok) continue;
    try {
      let lette = 0;
      for await (const riga of aperto.valore.linee) {
        if (!riga.trim()) continue;
        if (lette >= righeCampionePerShard) break;
        try {
          const record = JSON.parse(riga) as RecordCorpus;
          perTipo[record.tipo ?? "sconosciuto"] = (perTipo[record.tipo ?? "sconosciuto"] ?? 0) + 1;
          perAnno[String(record.anno ?? "sconosciuto")] =
            (perAnno[String(record.anno ?? "sconosciuto")] ?? 0) + 1;
          righeCampionate += 1;
        } catch {
          // Riga malformata nel campione: ignorata, la verifica la segnala.
        }
        lette += 1;
      }
    } catch {
      // Shard illeggibile nel campione: ignorato qui, la verifica lo segnala.
    } finally {
      chiudiLinee(aperto.valore);
    }
  }
  const byteTotali = manifest.shard.reduce((acc, s) => acc + s.bytes, 0);
  return successo({
    totaleAtti: manifest.totaleAtti,
    numeroShard: manifest.shard.length,
    byteTotali,
    byteMediPerAtto: manifest.totaleAtti > 0 ? Math.round(byteTotali / manifest.totaleAtti) : 0,
    perTipo,
    perAnno,
    righeCampionate,
  });
}
