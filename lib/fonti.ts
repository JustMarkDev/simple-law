/**
 * Costruzione degli URL delle fonti ufficiali di una norma.
 *
 * Regole:
 * - ogni URL deriva da un template verificato; non vengono mai inventati
 *   codici redazionali, numeri di Gazzetta o identificativi parlamentari;
 * - Normattiva usa sempre il permalink URN (deterministico da tipo, data e
 *   numero);
 * - quando manca il dato necessario, la fonte viene omessa anziche' generare
 *   un link rotto;
 * - non esistono URL GET per le ricerche su Normattiva/Gazzetta, quindi non
 *   vengono mai generati link a pagine di ricerca.
 */

import { formatNIR } from "./nir";
import type { Fonti } from "./seed-data";

export interface FontiInput {
  /** Tipo dell'atto nel vocabolario NIR, es. `decreto.legge`, `legge`. */
  tipo: string;
  /** Numero dell'atto (stringa per preservare zeri/lettere). */
  numero: string;
  /** Data di emanazione in formato ISO `YYYY-MM-DD`. */
  dataEmanazione: string;
  /** Codice redazionale della Gazzetta Ufficiale, es. `26G00155`. */
  codiceRedazionale?: string;
  /** Data di pubblicazione in Gazzetta Ufficiale, formato ISO `YYYY-MM-DD`. */
  dataGU?: string;
  /** Numero della Gazzetta Ufficiale. */
  numeroGU?: string;
  /** Legislatura della Camera, es. `19`. Necessaria insieme a `cameraId`. */
  legislatura?: string;
  /** Identificativo A.C. (idDocumento) del provvedimento alla Camera. */
  cameraId?: string;
  /** Identificativo del disegno di legge al Senato (did). */
  senatoDid?: string;
}

/** Etichette leggibili delle fonti, condivise tra data layer e UI. */
export const FONTI_LABELS: Record<keyof Fonti, string> = {
  normattiva: "Normattiva",
  gazzetta: "Gazzetta Ufficiale",
  governo: "Archivio CdM",
  camera: "Camera dei deputati",
  senato: "Senato della Repubblica",
};

/** Archivio dei comunicati del Consiglio dei ministri (URL stabile e verificato). */
export const GOVERNO_ARCHIVIO_URL = "https://www.governo.it/it/archivio-consiglio-dei-ministri";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODICE_RE = /^[0-9A-Za-z]+$/;
const NUMERO_RE = /^\d+$/;

function taglia(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

function isIsoDate(value: string | undefined): value is string {
  return typeof value === "string" && ISO_DATE_RE.test(value);
}

/**
 * Permalink Normattiva: `uri-res/N2Ls?urn:nir:stato:<tipo>:<data>;<numero>`.
 * Deterministico: richiede solo tipo, data e numero. `undefined` se non
 * costruibile in modo valido.
 */
function normattivaPermalink(input: FontiInput): string | undefined {
  const urn = formatNIR({
    tipo: taglia(input.tipo),
    data: taglia(input.dataEmanazione),
    numero: taglia(input.numero),
  });
  return urn ? `https://www.normattiva.it/uri-res/N2Ls?${urn}` : undefined;
}

/**
 * Gazzetta Ufficiale via ELI: richiede il codice redazionale. La data del
 * percorso e' quella di pubblicazione in GU (con fallback alla data di
 * emanazione, coincidenti nella quasi totalita' dei casi pubblicati in Gazzetta).
 */
function gazzettaEli(input: FontiInput): string | undefined {
  const codice = taglia(input.codiceRedazionale);
  const data = taglia(input.dataGU) ?? taglia(input.dataEmanazione);
  if (!codice || !CODICE_RE.test(codice) || !isIsoDate(data)) return undefined;
  const [anno, mese, giorno] = data.split("-");
  if (!anno || !mese || !giorno) return undefined;
  return `https://www.gazzettaufficiale.it/eli/id/${anno}/${mese}/${giorno}/${codice}/sg`;
}

/** Dettaglio del numero di Gazzetta: richiede data e numero della GU. */
function gazzettaIssue(input: FontiInput): string | undefined {
  const data = taglia(input.dataGU);
  const numero = taglia(input.numeroGU);
  if (!isIsoDate(data) || !numero || !NUMERO_RE.test(numero)) return undefined;
  const params = new URLSearchParams({
    dataPubblicazioneGazzetta: data,
    numeroGazzetta: numero,
  });
  return `https://www.gazzettaufficiale.it/gazzetta/serie_generale/caricaDettaglio?${params.toString()}`;
}

/** Camera: solo con idDocumento e legislatura noti. */
function cameraLink(input: FontiInput): string | undefined {
  const cameraId = taglia(input.cameraId);
  const legislatura = taglia(input.legislatura);
  if (!cameraId || !legislatura) return undefined;
  if (!NUMERO_RE.test(cameraId) || !NUMERO_RE.test(legislatura)) return undefined;
  return `https://www.camera.it/leg${legislatura}/126?idDocumento=${cameraId}`;
}

/** Senato: solo con il `did` noto (non esiste un link valido per numero). */
function senatoLink(input: FontiInput): string | undefined {
  const did = taglia(input.senatoDid);
  if (!did || !NUMERO_RE.test(did)) return undefined;
  return `https://www.senato.it/leggi-e-documenti/disegni-di-legge/scheda-ddl?did=${did}`;
}

/**
 * Costruisce l'insieme delle fonti ufficiali a partire dai metadati noti.
 * Normattiva e l'archivio CdM sono sempre presenti; le altre fonti solo se
 * costruibili da dati verificati.
 */
export function buildFonti(input: FontiInput): Fonti {
  const fonti: Fonti = { governo: GOVERNO_ARCHIVIO_URL };

  const normattiva = normattivaPermalink(input);
  if (normattiva) fonti.normattiva = normattiva;

  const gazzetta = gazzettaEli(input) ?? gazzettaIssue(input);
  if (gazzetta) fonti.gazzetta = gazzetta;

  const camera = cameraLink(input);
  if (camera) fonti.camera = camera;

  const senato = senatoLink(input);
  if (senato) fonti.senato = senato;

  return fonti;
}
