/**
 * Ingest reale dei deputati della Camera (leg. 19) da `dati.camera.it`.
 *
 * Uso: `npx tsx scripts/ingest-reale-camera.ts`
 *
 * Esegue 1 lista + 1 query adesioni sull'endpoint SPARQL del verdetto e
 * scrive `data/reali/camera-deputati.json` con envelope (provenance completa
 * + legislatura). Esce con codice 1 se la rete fallisce o i dati sono vuoti:
 * non scrive mai file parziali e non tocca altri file.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  CAMERA_LEGISLATURA,
  CAMERA_SPARQL_ENDPOINT,
  adesioniDaRighe,
  deputatiDaRigheLista,
  envelopeCameraDeputati,
  gruppoCorrentePerDeputato,
  queryAdesioni,
  queryListaDeputati,
  righeDaSparql,
  sparqlCamera,
  type Deputato,
} from "../lib/parlamento";

const DESTINAZIONE = fileURLToPath(
  new URL("../data/reali/camera-deputati.json", import.meta.url),
);
const MASSIMO_BYTE = 1024 * 1024;

function esci(messaggio: string): never {
  console.error(`[ingest-camera] ERRORE: ${messaggio}`);
  process.exit(1);
}

async function main(): Promise<void> {
  console.log(`[ingest-camera] Endpoint: ${CAMERA_SPARQL_ENDPOINT}`);
  console.log(`[ingest-camera] Legislatura: ${CAMERA_LEGISLATURA}`);

  const lista = await sparqlCamera(queryListaDeputati());
  if (!lista.ok) esci(`lista deputati fallita: ${lista.errore}`);
  if (!lista.ok) return;

  const adesioni = await sparqlCamera(queryAdesioni());
  if (!adesioni.ok) esci(`adesioni ai gruppi fallite: ${adesioni.errore}`);
  if (!adesioni.ok) return;

  const base = deputatiDaRigheLista(righeDaSparql(lista.valore));
  if (base.length === 0) esci("lista deputati vuota, nessun file scritto");
  const gruppi = gruppoCorrentePerDeputato(
    adesioniDaRighe(righeDaSparql(adesioni.valore)),
  );

  const deputati: Deputato[] = base.map((dep) => {
    const gruppo = gruppi.get(dep.slug);
    return gruppo && !dep.gruppo ? { ...dep, gruppo } : { ...dep };
  });
  const conGruppo = deputati.filter((dep) => dep.gruppo).length;
  const conScheda = deputati.filter((dep) => dep.urlScheda).length;
  console.log(
    `[ingest-camera] Deputati: ${deputati.length} (con gruppo: ${conGruppo}, con scheda: ${conScheda})`,
  );

  const envelope = envelopeCameraDeputati(deputati, new Date().toISOString());
  const contenuto = `${JSON.stringify(envelope, null, 2)}\n`;
  if (Buffer.byteLength(contenuto, "utf8") > MASSIMO_BYTE) {
    esci("file oltre 1MB, nessun file scritto");
  }
  await mkdir(new URL("../data/reali/", import.meta.url), { recursive: true });
  await writeFile(DESTINAZIONE, contenuto, "utf8");
  console.log(`[ingest-camera] Scritto: ${DESTINAZIONE}`);
}

main().catch((cause: unknown) => {
  esci(cause instanceof Error ? cause.message : String(cause));
});
