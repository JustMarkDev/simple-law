/**
 * CLI per il bulk storico Normattiva.
 *
 * Uso:
 *   npm run sync:storico -- --limit=500 --annoDa=2024 --maxPages=10
 *   npm run sync:storico -- --collezioni="DL e leggi di conversione"
 *   npm run sync:storico -- --denominazioni="DECRETO-LEGGE,LEGGE" --dry
 *
 * Senza `--collezioni` non viene scaricato alcun archivio (solo inventario).
 * `--dry` non scrive nulla su DB. Il processo esce con codice 1 se il report
 * contiene errori.
 */

import { Effect } from "effect";
import {
  normattivaLayer,
  type NormattivaConfig,
} from "../lib/normattiva";
import { storicoEffect } from "../lib/sync";
import type { StoricoSyncOptions, SyncProgress } from "../lib/sync";

function argomento(nome: string): string | undefined {
  const prefisso = `--${nome}=`;
  const trovato = process.argv.find((arg) => arg.startsWith(prefisso));
  return trovato ? trovato.slice(prefisso.length) : undefined;
}

function numero(nome: string): number | undefined {
  const grezzo = argomento(nome);
  if (!grezzo) return undefined;
  const parsed = Number.parseInt(grezzo, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function lista(nome: string): string[] | undefined {
  const grezzo = argomento(nome);
  if (!grezzo) return undefined;
  const voci = grezzo
    .split(",")
    .map((voce) => voce.trim())
    .filter(Boolean);
  return voci.length > 0 ? voci : undefined;
}

const options: StoricoSyncOptions = {
  limit: numero("limit"),
  pageSize: numero("pageSize"),
  maxPages: numero("maxPages"),
  annoDa: argomento("annoDa"),
  annoA: argomento("annoA"),
  denominazioni: lista("denominazioni"),
  collezioni: lista("collezioni"),
  zipDir: argomento("zipDir"),
  persist: process.argv.includes("--dry") ? false : undefined,
  emit: (progresso: SyncProgress) => {
    const avanzamento =
      progresso.done !== undefined && progresso.total !== undefined
        ? ` (${progresso.done}/${progresso.total})`
        : progresso.done !== undefined
          ? ` (${progresso.done})`
          : "";
    console.log(`[${progresso.phase}] ${progresso.message}${avanzamento}`);
  },
};

const base = argomento("apiBase");
const overrides: Partial<NormattivaConfig> = base ? { baseUrl: base } : {};

const programma = storicoEffect(options);

Effect.runPromise(Effect.provide(programma, normattivaLayer(overrides)))
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  })
  .catch((errore: unknown) => {
    console.error("Sync storico fallito:", errore);
    process.exitCode = 1;
  });
