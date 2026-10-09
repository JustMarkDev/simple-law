// tests/corpus-100gb.test.ts — Test in italiano per l'architettura 100GB-ready.
import { describe, it, expect } from "vite-plus/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ELI_REGEX,
  NIR_REGEX,
  ANNO_MIN,
  ANNO_MAX,
  TESTO_MIN_BYTE,
  TESTO_MAX_BYTE,
  costruisciManifest,
  generaCorpus,
  generaRecord,
  scriviShardJsonlGzip,
  paginaShard,
  cercaInShard,
  verificaShard,
  leggiManifest,
  punteggioRilevanza,
} from "../lib/corpus";

function creaDirTemporanea(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "corpus-100gb-"));
}

describe("generatore deterministico", () => {
  it("genera ELI unici su 2000 atti", () => {
    const esito = generaCorpus(2000, "simple-law-corpus-v1");
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const eli = esito.valore.map((r) => r.eli);
    expect(new Set(eli).size).toBe(eli.length);
    for (const e of eli) expect(e).toMatch(ELI_REGEX);
  });

  it("genera NIR validi e unici", () => {
    const esito = generaCorpus(500, "simple-law-corpus-v1");
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const nir = esito.valore.map((r) => r.nir);
    expect(new Set(nir).size).toBe(nir.length);
    for (const n of nir) expect(n).toMatch(NIR_REGEX);
  });

  it("produce anni realistici 1948-2026 e testi da 1.5 a 6KB con flag dimostrativo", () => {
    const esito = generaCorpus(300, "simple-law-corpus-v1");
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    for (const r of esito.valore) {
      expect(r.anno).toBeGreaterThanOrEqual(ANNO_MIN);
      expect(r.anno).toBeLessThanOrEqual(ANNO_MAX);
      const byte = Buffer.byteLength(r.testo, "utf8");
      expect(byte).toBeGreaterThanOrEqual(TESTO_MIN_BYTE);
      expect(byte).toBeLessThanOrEqual(TESTO_MAX_BYTE + 512);
      expect(r.dimostrativo).toBe(true);
      expect(r.testo).toContain("Art. 1");
    }
  });

  it("è deterministico a parità di seed e indice", () => {
    const a = generaRecord(42, "simple-law-corpus-v1");
    const b = generaRecord(42, "simple-law-corpus-v1");
    expect(a).toEqual(b);
    const c = generaRecord(43, "simple-law-corpus-v1");
    expect(c.eli).not.toBe(a.eli);
  });

  it("rifiuta totali non validi senza lanciare eccezioni", () => {
    expect(generaCorpus(0).ok).toBe(false);
    expect(generaCorpus(-5).ok).toBe(false);
  });
});

describe("shard caricabile in streaming", () => {
  it("scrive e rilegge uno shard gzip con paginazione coerente", async () => {
    const dir = creaDirTemporanea();
    const percorso = path.join(dir, "shard-00000.jsonl.gz");
    const esitoGen = generaCorpus(120, "test-paginazione");
    expect(esitoGen.ok).toBe(true);
    if (!esitoGen.ok) return;
    const esitoWrite = await scriviShardJsonlGzip(percorso, esitoGen.valore);
    expect(esitoWrite.ok).toBe(true);
    if (!esitoWrite.ok) return;
    expect(esitoWrite.valore.count).toBe(120);

    const pagina1 = await paginaShard(percorso, 1, 50);
    const pagina2 = await paginaShard(percorso, 2, 50);
    const pagina3 = await paginaShard(percorso, 3, 50);
    expect(pagina1.ok && pagina2.ok && pagina3.ok).toBe(true);
    if (!pagina1.ok || !pagina2.ok || !pagina3.ok) return;
    expect(pagina1.valore.record).toHaveLength(50);
    expect(pagina2.valore.record).toHaveLength(50);
    expect(pagina3.valore.record).toHaveLength(20);
    expect(pagina1.valore.totale).toBe(120);
    const eli1 = new Set(pagina1.valore.record.map((r) => r.eli));
    for (const r of pagina2.valore.record) expect(eli1.has(r.eli)).toBe(false);
  });

  it("verifica uno shard valido con ELI/NIR unici", async () => {
    const dir = creaDirTemporanea();
    const percorso = path.join(dir, "shard-00000.jsonl.gz");
    const esitoGen = generaCorpus(200, "test-verify");
    expect(esitoGen.ok).toBe(true);
    if (!esitoGen.ok) return;
    const esitoWrite = await scriviShardJsonlGzip(percorso, esitoGen.valore);
    expect(esitoWrite.ok).toBe(true);
    const esito = await verificaShard(percorso);
    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(esito.valore.ok).toBe(true);
    expect(esito.valore.totaleRighe).toBe(200);
    expect(esito.valore.errori).toHaveLength(0);
  });

  it("la ricerca semplice trova atti per tema e la frase esatta pesa sul titolo", async () => {
    const dir = creaDirTemporanea();
    const percorso = path.join(dir, "shard-00000.jsonl.gz");
    const esitoGen = generaCorpus(200, "test-fts");
    expect(esitoGen.ok).toBe(true);
    if (!esitoGen.ok) return;
    await scriviShardJsonlGzip(percorso, esitoGen.valore);
    const risultati = await cercaInShard(percorso, "sanità", 10);
    expect(risultati.ok).toBe(true);
    if (!risultati.ok) return;
    expect(risultati.valore.length).toBeGreaterThan(0);

    const primo = esitoGen.valore[0];
    const conTitolo = punteggioRilevanza(primo, primo.titolo.split("—")[0].trim());
    const senzaSenso = punteggioRilevanza(primo, "zzzqqq");
    expect(conTitolo).toBeGreaterThan(senzaSenso);
  });

  it("costruisce un manifest coerente con count e checksum", async () => {
    const dir = creaDirTemporanea();
    const percorso = path.join(dir, "shard-00000.jsonl.gz");
    const esitoGen = generaCorpus(50, "test-manifest");
    expect(esitoGen.ok).toBe(true);
    if (!esitoGen.ok) return;
    const esitoWrite = await scriviShardJsonlGzip(percorso, esitoGen.valore);
    expect(esitoWrite.ok).toBe(true);
    if (!esitoWrite.ok) return;
    const manifest = costruisciManifest([esitoWrite.valore], "test-manifest");
    expect(manifest.totaleAtti).toBe(50);
    expect(manifest.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.shard[0].checksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("never-throw", () => {
  it("non lancia su file mancante ma restituisce errore in italiano", async () => {
    const pagina = await paginaShard("/percorso/inesistente/shard.jsonl.gz", 1, 10);
    expect(pagina.ok).toBe(false);
    const ricerca = await cercaInShard("/percorso/inesistente/shard.jsonl.gz", "lavoro", 10);
    expect(ricerca.ok).toBe(false);
    const verifica = await verificaShard("/percorso/inesistente/shard.jsonl.gz");
    expect(verifica.ok).toBe(false);
    const manifest = await leggiManifest("/percorso/inesistente/manifest.json");
    expect(manifest.ok).toBe(false);
  });

  it("rifiuta paginazione e query non valide senza eccezioni", async () => {
    const dir = creaDirTemporanea();
    const percorso = path.join(dir, "shard-00000.jsonl.gz");
    const esitoGen = generaCorpus(10, "test-errori");
    if (!esitoGen.ok) return;
    await scriviShardJsonlGzip(percorso, esitoGen.valore);
    expect((await paginaShard(percorso, 0, 10)).ok).toBe(false);
    expect((await paginaShard(percorso, 1, 0)).ok).toBe(false);
    expect((await cercaInShard(percorso, "x", 10)).ok).toBe(false);
  });
});
