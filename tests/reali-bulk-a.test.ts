/**
 * Test ingest bulk-A Normattiva (collezione chiusa, lista-only, zero rete).
 *
 * Copre parser/mapping/stato/dedup delle funzioni pure esportate da
 * `scripts/ingest-reale-normattiva-bulk-a.ts` con fixture inline (forma
 * `{metadati: {...}}` osservata negli ZIP preconfezionati) e
 * un'integrazione tollerante sui JSON reali (passa anche se il file
 * bulk-a non e' ancora stato generato).
 */
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { NormattivaError } from "../lib/normattiva";
import {
  caricaChiaviBulkA,
  chiaveEliBulkA,
  eliCandidatiBulkA,
  eseguiBulkA,
  estraiErroreBulkA,
  isIsoDateBulkA,
  normalizzaBulkA,
  outConsentitoBulkA,
  recordDaVoceBulkA,
  statoDaMetadatiBulkA,
  stringaBulkA,
  voceCollezioneDaMetadatiBulkA,
  vociDaZipBulkA,
} from "../scripts/ingest-reale-normattiva-bulk-a";
import type { VoceBulkA } from "../scripts/ingest-reale-normattiva-bulk-a";
import { estraiListaAttiReali, normalizzaAttoReale } from "../lib/sources";

const METADATI_REALE = {
  metadati: {
    urn: "urn:nir:ministero.agricoltura.e.foreste:decreto:1988-04-12;164",
    eli: "eli/id/1988/05/23/088G0223/ORIGINAL",
    emettitore: "MINISTERO DELL'AGRICOLTURA E DELLE FORESTE",
    numDoc: "164",
    tipoDoc: "DECRETO",
    titoloDoc:
      " Modificazioni al decreto ministeriale 9 ottobre 1981,\nrecante norme di applicazione del regolamento CEE n.\n2191/81. \n",
    noteDoc: "Entrata in vigore del decreto: 07/06/1988",
    dataDoc: "1988-04-12",
    dataPubblicazione: "1988-05-23",
    numeroPubblicazione: "119",
    tipoPubblicazione: "NO",
    redazione: "088G0223",
    abrogato: "no",
  },
};

const METADATI_ABROGATO = {
  metadati: {
    urn: "urn:nir:stato:legge:1970-05-16;281",
    eli: "eli/id/1970/05/22/070U0281/ORIGINAL",
    numDoc: "281",
    tipoDoc: "LEGGE",
    titoloDoc: "Provvedimenti finanziari per le Regioni.",
    dataDoc: "1970-05-16",
    dataPubblicazione: "1970-05-22",
    numeroPubblicazione: "127",
    redazione: "070U0281",
    abrogato: "si",
  },
};

const VOCE_ESEMPIO: VoceBulkA = {
  urn: "urn:nir:ministero.agricoltura.e.foreste:decreto:1988-04-12;164",
  eliReale: "/eli/id/1988/05/23/088G0223/ORIGINAL",
  titoloDoc: "Modificazioni al decreto ministeriale 9 ottobre 1981.",
  tipoDoc: "DECRETO",
  numDoc: "164",
  dataDoc: "1988-04-12",
  codice: "088G0223",
  dataGU: "1988-05-23",
  numeroGU: "119",
  abrogato: "no",
};

describe("ingest bulk-A Normattiva (fixture inline, zero rete)", () => {
  it("voceCollezioneDaMetadatiBulkA legge i campi osservati, mai inventati", () => {
    const voce = voceCollezioneDaMetadatiBulkA(METADATI_REALE);
    expect(voce).not.toBeNull();
    expect(voce?.urn).toBe("urn:nir:ministero.agricoltura.e.foreste:decreto:1988-04-12;164");
    expect(voce?.titoloDoc).toBe(
      "Modificazioni al decreto ministeriale 9 ottobre 1981, recante norme di applicazione del regolamento CEE n. 2191/81.",
    );
    expect(voce?.eliReale).toBe("/eli/id/1988/05/23/088G0223/ORIGINAL");
    expect(voce?.numDoc).toBe("164");
    expect(voce?.dataDoc).toBe("1988-04-12");
    expect(voce?.codice).toBe("088G0223");
    expect(voce?.dataGU).toBe("1988-05-23");
    expect(voce?.numeroGU).toBe("119");
  });

  it("voceCollezioneDaMetadatiBulkA scarta voci senza URN valido o senza titolo", () => {
    expect(voceCollezioneDaMetadatiBulkA({})).toBeNull();
    expect(voceCollezioneDaMetadatiBulkA(null)).toBeNull();
    expect(voceCollezioneDaMetadatiBulkA("stringa")).toBeNull();
    expect(
      voceCollezioneDaMetadatiBulkA({ metadati: { urn: "non-un-urn", titoloDoc: "Titolo" } }),
    ).toBeNull();
    expect(
      voceCollezioneDaMetadatiBulkA({
        metadati: { urn: "urn:nir:stato:legge:1970-05-16;281", titoloDoc: "   " },
      }),
    ).toBeNull();
  });

  it("statoDaMetadatiBulkA: solo 'si' osservato e' abrogato", () => {
    expect(statoDaMetadatiBulkA("si")).toBe("abrogato");
    expect(statoDaMetadatiBulkA("  SI ")).toBe("abrogato");
    expect(statoDaMetadatiBulkA("no")).toBe("in_vigore");
    expect(statoDaMetadatiBulkA("")).toBe("in_vigore");
    expect(statoDaMetadatiBulkA(null)).toBe("in_vigore");
    expect(statoDaMetadatiBulkA(undefined)).toBe("in_vigore");
  });

  it("recordDaVoceBulkA mappa la voce reale in record (titolo=titoloDoc)", () => {
    const record = recordDaVoceBulkA(VOCE_ESEMPIO);
    expect(record).not.toBeNull();
    expect(record?.titolo).toBe(VOCE_ESEMPIO.titoloDoc);
    expect(record?.sintesi).toBe(VOCE_ESEMPIO.titoloDoc);
    expect(record?.nir).toBe(VOCE_ESEMPIO.urn);
    expect(record?.eli).toBe("/eli/id/1988/05/23/088G0223/ORIGINAL");
    expect(record?.chiave).toBe(record?.eli);
    expect(record?.numero).toBe("164");
    expect(record?.dataEmanazione).toBe("1988-04-12");
    expect(record?.stato).toBe("in_vigore");
    expect(record?.codiceRedazionale).toBe("088G0223");
    expect(record?.dataGU).toBe("1988-05-23");
    expect(record?.numeroGU).toBe("119");
    expect(record?.fonte).toBe("normattiva-bff");
    expect(record?.dettaglio).toBe(false);
  });

  it("recordDaVoceBulkA onora abrogato=si e deriva ELI da URN+codice", () => {
    const voce = voceCollezioneDaMetadatiBulkA(METADATI_ABROGATO);
    expect(voce).not.toBeNull();
    const record = recordDaVoceBulkA(voce as VoceBulkA);
    expect(record?.stato).toBe("abrogato");
    const senzaEli: VoceBulkA = { ...VOCE_ESEMPIO, eliReale: "" };
    const derivato = recordDaVoceBulkA(senzaEli);
    expect(derivato?.eli).toBe("/eli/id/1988/04/12/088G0223/sg");
  });

  it("recordDaVoceBulkA scarta voci senza titolo/numero/data/chiave", () => {
    expect(recordDaVoceBulkA({ ...VOCE_ESEMPIO, titoloDoc: "  " })).toBeNull();
    expect(recordDaVoceBulkA({ ...VOCE_ESEMPIO, urn: "non-urn" })).toBeNull();
    expect(recordDaVoceBulkA({ ...VOCE_ESEMPIO, eliReale: "", codice: "" })).toBeNull();
  });

  it("chiaveEliBulkA normalizza con trim+lowercase, mai lancia", () => {
    expect(chiaveEliBulkA("  /ELI/ID/1988/SG  ")).toBe("/eli/id/1988/sg");
    expect(chiaveEliBulkA(null)).toBe("");
    expect(chiaveEliBulkA(undefined)).toBe("");
    expect(chiaveEliBulkA(123)).toBe("123");
  });

  it("eliCandidatiBulkA elenca ELI reale + derivato da URN/codice", () => {
    const candidati = eliCandidatiBulkA(VOCE_ESEMPIO);
    expect(candidati).toContain("/eli/id/1988/05/23/088g0223/original");
    expect(candidati).toContain("/eli/id/1988/04/12/088g0223/sg");
  });

  it("vociDaZipBulkA non lancia su byte invalidi", () => {
    expect(vociDaZipBulkA(new Uint8Array(0), 10)).toEqual([]);
    expect(vociDaZipBulkA(new Uint8Array([1, 2, 3, 4]), 10)).toEqual([]);
    expect(vociDaZipBulkA(new TextEncoder().encode("non uno zip"), 10)).toEqual([]);
  });

  it("outConsentitoBulkA vincola ai file assegnati", () => {
    expect(outConsentitoBulkA("data/reali/normattiva-bulk-a-attuazione-ue.json")).toBe(true);
    expect(outConsentitoBulkA("data/reali/normattiva-bulk-a-x.json")).toBe(true);
    expect(outConsentitoBulkA("data/reali/normattiva-finestra-2015.json")).toBe(false);
    expect(outConsentitoBulkA("data/reali/normattiva-testi-unici.json")).toBe(false);
    expect(outConsentitoBulkA("/tmp/normattiva-bulk-a-x.json")).toBe(false);
  });

  it("utility di base: normalizza, stringa e date ISO", () => {
    expect(normalizzaBulkA("  a   b\nc ")).toBe("a b c");
    expect(stringaBulkA(164)).toBe("164");
    expect(stringaBulkA(" x ")).toBe("x");
    expect(stringaBulkA(null)).toBe("");
    expect(isIsoDateBulkA("1988-04-12")).toBe(true);
    expect(isIsoDateBulkA("1988-13-40")).toBe(false);
    expect(isIsoDateBulkA("non-data")).toBe(false);
  });

  it("caricaChiaviBulkA: never-throw su percorsi assenti, legge chiavi reali", async () => {
    const vuote = await caricaChiaviBulkA(["data/reali/file-che-non-esiste-xyz.json"]);
    expect(vuote.size).toBe(0);
    const dir = await mkdtemp(path.join(tmpdir(), "bulka-"));
    try {
      const fixture = {
        provenance: { fonte: "normattiva", url: "https://example.test", recuperatoIl: "2026-01-01", licenza: "x" },
        atti: [
          { titolo: "T", eli: " /ELI/ID/1988/SG ", nir: "urn:nir:stato:legge:1988-01-01;1" },
        ],
      };
      const p = path.join(dir, "f.json");
      await writeFile(p, JSON.stringify(fixture), "utf8");
      const chiavi = await caricaChiaviBulkA([p]);
      expect(chiavi.has("/eli/id/1988/sg")).toBe(true);
      expect(chiavi.has("urn:nir:stato:legge:1988-01-01;1")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("eseguiBulkA preserva il NormattivaError originale (url+status, zero rete)", async () => {
    const originale = new NormattivaError({
      message: "bloccata",
      url: "https://example.test/x",
      status: 403,
      retryable: false,
    });
    await expect(eseguiBulkA(Effect.fail(originale), {})).rejects.toBe(originale);
    const ok = await eseguiBulkA(Effect.succeed(42), {});
    expect(ok).toBe(42);
    expect(estraiErroreBulkA(null)).toBeNull();
    expect(estraiErroreBulkA({ cause: { failure: originale } })).toBe(originale);
  });

  it("record bulk-A normalizzabile via lib/sources (titolo+eli verificati)", () => {
    const record = recordDaVoceBulkA(VOCE_ESEMPIO);
    const normalizzato = normalizzaAttoReale({ ...record, sintesi: record?.sintesi });
    expect(normalizzato).not.toBeNull();
    expect(normalizzato?.dimostrativo).toBe(false);
    expect(normalizzato?.titolo).toBe(VOCE_ESEMPIO.titoloDoc);
  });
});

describe("integrazione tollerante bulk-A (zero rete, disco read-only)", () => {
  async function elencaBulkA(): Promise<string[]> {
    try {
      const nomi = await readdir(path.resolve("data", "reali"));
      return nomi.filter((n) => n.startsWith("normattiva-bulk-a-") && n.endsWith(".json"));
    } catch {
      return [];
    }
  }

  it("i JSON bulk-a (se presenti) sono envelope validi <=1MB con atti normalizzabili", async () => {
    const nomi = await elencaBulkA();
    for (const nome of nomi) {
      const percorso = path.join("data", "reali", nome);
      let raw: string;
      try {
        raw = await readFile(path.resolve(percorso), "utf8");
      } catch {
        continue;
      }
      expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(1024 * 1024);
      const parsed = JSON.parse(raw) as unknown;
      expect(parsed).toBeTypeOf("object");
      const prov = (parsed as Record<string, unknown>)["provenance"] as Record<string, unknown>;
      expect(typeof prov?.["fonte"]).toBe("string");
      expect(typeof prov?.["url"]).toBe("string");
      expect(typeof prov?.["recuperatoIl"]).toBe("string");
      expect(typeof prov?.["licenza"]).toBe("string");
      const lista = estraiListaAttiReali(parsed);
      expect(lista.length).toBeGreaterThan(0);
      expect(lista.length).toBeLessThanOrEqual(100);
      let validi = 0;
      for (const item of lista) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        validi += 1;
        expect(record.titolo.length).toBeGreaterThan(0);
        expect(record.eli.length).toBeGreaterThan(0);
        expect(["in_vigore", "abrogato", "decaduto", "sconosciuto"]).toContain(record.stato);
        const o = item as Record<string, unknown>;
        if (o["dettaglio"] === false && !(typeof o["testo"] === "string" && o["testo"].trim())) {
          // Atti lista-only senza testo: vigenza non verificabile, mai
          // in_vigore inventato. Fa eccezione il flag esplicito
          // metadati.abrogato=si della collezione (segnale verificato).
          const segnale = String(o["stato"] ?? "").toLowerCase();
          if (!/abrog|decad/.test(segnale)) {
            expect(record.stato).toBe("sconosciuto");
          }
        }
      }
      expect(validi).toBeGreaterThan(0);
    }
  });

  it("dedup ELI cross-file inclusi i bulk-a: nessun duplicato (se i file ci sono)", async () => {
    let nomi: string[];
    try {
      nomi = await readdir(path.resolve("data", "reali"));
    } catch {
      return;
    }
    const visti = new Set<string>();
    let duplicati = 0;
    let totale = 0;
    for (const nome of nomi.filter((n) => n.endsWith(".json"))) {
      const percorso = path.join("data", "reali", nome);
      let raw: string;
      try {
        raw = await readFile(path.resolve(percorso), "utf8");
      } catch {
        continue;
      }
      if (Buffer.byteLength(raw, "utf8") > 1024 * 1024) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        continue;
      }
      for (const item of estraiListaAttiReali(parsed)) {
        const record = normalizzaAttoReale(item);
        if (!record) continue;
        totale += 1;
        const chiave = record.eli.trim().toLowerCase();
        if (visti.has(chiave)) duplicati += 1;
        visti.add(chiave);
      }
    }
    if (totale === 0) return;
    expect(duplicati).toBe(0);
  });
});
