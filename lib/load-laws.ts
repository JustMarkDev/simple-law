/**
 * Caricamento server-side delle norme: preferisce il database, con ricaduta sul seed.
 * Vive fuori da `components/seed-fallback` perche' quel modulo e' importato anche dai
 * componenti client, che non devono trascinare nel bundle il driver Postgres.
 */

import {
  FALLBACK_LAWS,
  findLawByEli,
  normalizeLaw,
  tutteLeLeggi,
  type Law,
} from "@/components/seed-fallback";
import { getLawByEli, getLawsFromDBorSeed } from "@/lib/db";

/**
 * Carica le norme preferendo il database, con ricaduta automatica sul seed.
 * Non lancia mai: se il DB e' assente o vuoto restituisce comunque un corpus.
 */
export async function loadLaws(): Promise<Law[]> {
  try {
    const records = await getLawsFromDBorSeed();
    const leggi = records.map(normalizeLaw);
    return leggi.length > 0 ? leggi : FALLBACK_LAWS;
  } catch {
    return tutteLeLeggi();
  }
}

/** Cerca una norma per ELI/NIR preferendo il DB, con ricaduta sul seed. */
export async function loadLawByEli(eliParam: string): Promise<Law | undefined> {
  try {
    const record = await getLawByEli(eliParam);
    if (record) return { ...normalizeLaw(record), testo: record.testo ?? undefined };
  } catch {
    // ricade sul seed
  }
  return findLawByEli(tutteLeLeggi(), eliParam);
}
