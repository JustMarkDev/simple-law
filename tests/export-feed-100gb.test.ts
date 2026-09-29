import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LawRecordExtra } from "@/lib/db";

vi.mock("@/lib/db", () => ({
  queryLaws: vi.fn(),
  listLaws: vi.fn(),
  countLaws: vi.fn(),
  getLawsFromDBorSeed: vi.fn(),
}));

import { countLaws, getLawsFromDBorSeed, listLaws, queryLaws } from "@/lib/db";
import { EXPORT_BATCH, EXPORT_CAP, GET as exportGET, azzeraLimiteExport } from "@/app/api/export/route";
import { FEED_MAX, GET as feedGET } from "@/app/api/feed/route";

function riga(indice: number, titolo?: string): LawRecordExtra {
  const numero = String(indice).padStart(4, "0");
  return {
    eli: `/it/legge/2026/${numero}/titolo-${indice}`,
    nir: `urn:nir:stato:legge:2026;${indice}`,
    tipo: "legge",
    numero: String(indice),
    dataEmanazione: "2026-03-15",
    titolo: titolo ?? `Legge di prova numero ${indice}`,
    sintesi: `Sintesi della legge ${indice} con testo semplice.`,
    stato: "in_vigore",
    gulpease: 55,
    fonti: null,
    testo: `Testo integrale lunghissimo della legge ${indice} che non deve mai uscire in export.`,
    semplificata: {
      in10Secondi: "Spiegazione breve.",
      perTe: { lavoro: "Ti riguarda." },
      cosaFare: ["Leggi il testo"],
      statoLavora: { colore: "verde", motivo: "Tutto chiaro" },
      proContro: { pro: ["Chiarezza"], contro: ["Lunghezza"] },
      gulpease: 60,
    },
    qualita: 80,
    codiceRedazionale: `26G00${String(indice).padStart(3, "0")}`,
    dataGU: "2026-03-16",
    numeroGU: "60",
  } as unknown as LawRecordExtra;
}

function richiestaExport(query: string, ip: string): Request {
  return new Request(`http://localhost/api/export${query}`, {
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  vi.mocked(queryLaws).mockReset();
  vi.mocked(listLaws).mockReset();
  vi.mocked(countLaws).mockReset();
  vi.mocked(getLawsFromDBorSeed).mockReset();
  azzeraLimiteExport();
});

/** Simula il corpus per l'export paginato (listLaws a pagine + countLaws). */
function mockRigheExport(righe: LawRecordExtra[]): void {
  vi.mocked(countLaws).mockResolvedValue(righe.length);
  vi.mocked(listLaws).mockImplementation(async (params) => {
    const page = params?.page ?? 1;
    const per = params?.per ?? 500;
    const inizio = (page - 1) * per;
    return { items: righe.slice(inizio, inizio + per), total: righe.length, page, per };
  });
}

describe("export: filtri e limiti", () => {
  it("inoltra a listLaws i filtri troncati (q 200, tipo 80) a pagine da 500", async () => {
    mockRigheExport([]);
    const qLunga = "a".repeat(300);
    const tipoLungo = "b".repeat(120);
    const res = await exportGET(
      richiestaExport(`?formato=json&q=${qLunga}&tipo=${tipoLungo}&anno=2026`, "filtri-1"),
    );
    expect(res.status).toBe(200);
    // Lo stream e' lazy: consumarlo prima di verificare le chiamate.
    const corpo = (await res.json()) as { items: unknown[]; total: number };
    expect(corpo.items).toEqual([]);
    expect(corpo.total).toBe(0);
    expect(vi.mocked(listLaws)).toHaveBeenCalledTimes(1);
    const params = vi.mocked(listLaws).mock.calls[0]?.[0] as {
      q: string;
      tipo: string;
      anno: string;
      page: number;
      per: number;
      sort: string;
    };
    expect(params.q.length).toBeLessThanOrEqual(200);
    expect(params.tipo.length).toBeLessThanOrEqual(80);
    expect(params.anno).toBe("2026");
    expect(params.page).toBe(1);
    expect(params.per).toBe(EXPORT_BATCH);
    expect(params.sort).toBe("data_desc");
    expect(EXPORT_CAP).toBe(10000);
    expect(EXPORT_BATCH).toBe(500);
  });

  it("esporta in streaming 1200 righe con BOM, 12 colonne e header attachment/no-store", async () => {
    const attese = Array.from({ length: 1200 }, (_, i) => riga(i + 1));
    mockRigheExport(attese);
    const res = await exportGET(richiestaExport("?formato=csv", "stream-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("content-type")).toContain("text/csv");
    const resBytes = await exportGET(richiestaExport("?formato=csv", "stream-1-bom"));
    const bytes = new Uint8Array(await resBytes.arrayBuffer());
    // BOM UTF-8 (EF BB BF) come primi 3 byte dello stream.
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    const testo = await res.text();
    const righe = testo.replace(/^\uFEFF/, "").split("\r\n").filter((l) => l.length > 0);
    expect(righe[0]).toBe(
      "eli,nir,tipo,numero,dataEmanazione,titolo,stato,gulpease,qualita,codiceRedazionale,dataGU,numeroGU",
    );
    expect(righe.length).toBe(1201);
    expect(righe[1]).toContain("Legge di prova numero 1");
  });

  it("il JSON proietta solo le 12 colonne e non espone mai testo o semplificata", async () => {
    mockRigheExport([riga(1), riga(2)]);
    const res = await exportGET(richiestaExport("?formato=json", "json-1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("cache-control")).toContain("no-store");
    const corpo = (await res.json()) as { items: Record<string, unknown>[]; total: number };
    expect(corpo.total).toBe(2);
    expect(corpo.items.length).toBe(2);
    for (const voce of corpo.items) {
      expect(Object.keys(voce).sort()).toEqual(
        [
          "codiceRedazionale",
          "dataEmanazione",
          "dataGU",
          "eli",
          "gulpease",
          "nir",
          "numero",
          "numeroGU",
          "qualita",
          "stato",
          "tipo",
          "titolo",
        ].sort(),
      );
      expect(voce).not.toHaveProperty("testo");
      expect(voce).not.toHaveProperty("semplificata");
      expect(voce).not.toHaveProperty("sintesi");
    }
    expect(JSON.stringify(corpo)).not.toContain("Testo integrale lunghissimo");
  });

  it("rifiuta il formato non valido con 400 in italiano", async () => {
    const res = await exportGET(richiestaExport("?formato=xml", "formato-1"));
    expect(res.status).toBe(400);
    const corpo = (await res.json()) as { error: string };
    expect(corpo.error).toMatch(/csv o json/i);
  });

  it("applica il rate-limit 20/min con 429 in italiano", async () => {
    mockRigheExport([]);
    const ip = "limite-1";
    let ultima: Response | null = null;
    for (let i = 0; i < 20; i += 1) {
      ultima = await exportGET(richiestaExport("?formato=csv", ip));
      expect(ultima.status).toBe(200);
    }
    const bloccata = await exportGET(richiestaExport("?formato=csv", ip));
    expect(bloccata.status).toBe(429);
    const corpo = (await bloccata.json()) as { error: string };
    expect(corpo.error).toMatch(/troppe richieste/i);
    expect(bloccata.headers.get("retry-after")).toBe("60");
  });
});

describe("export: anti-injection CSV", () => {
  it("neutralizza formule, bidi e BOM iniziali e mantiene quoting e BOM", async () => {
    const pericolosi = [
      "=cmd|' /C calc'!A0",
      "+39 06 1234",
      "-2+3",
      "@SUM(1,2)",
      "|pipe",
      "%percento",
      "\tTabulazione",
      "\"virgolette\"",
      "  =spazi prima",
      " =nbsp prima",
      "‪=bidi ltr",
      "‮@bidi rtl",
      "﻿=bom interno",
      "=1,2 con virgola",
      "Titolo normale",
    ];
    mockRigheExport(pericolosi.map((t, i) => riga(i + 1, t)));
    const res = await exportGET(richiestaExport("?formato=csv", "injection-1"));
    const csv = await res.text();
    const resBom = await exportGET(richiestaExport("?formato=csv", "injection-1-bom"));
    const bytesBom = new Uint8Array(await resBom.arrayBuffer());
    expect(bytesBom[0]).toBe(0xef);
    expect(bytesBom[1]).toBe(0xbb);
    expect(bytesBom[2]).toBe(0xbf);
    expect(csv).toContain("'=cmd|");
    expect(csv).toContain("'+39 06 1234");
    expect(csv).toContain("'-2+3");
    expect(csv).toContain("'@SUM(1,2)");
    expect(csv).toContain("'|pipe");
    expect(csv).toContain("Titolo normale");
    expect(csv).not.toContain("\n'Titolo normale");
    // La riga con virgola resta quotata dopo la protezione.
    expect(csv).toContain(`"'=1,2 con virgola"`);
    const righe = csv.replace(/^\uFEFF/, "").split("\r\n").slice(1);
    expect(righe.filter((l) => l.length > 0).length).toBe(pericolosi.length);
  });
});

describe("feed RSS", () => {
  it("con 5000 atti espone solo gli ultimi 50 in XML valido con escape", async () => {
    const tutte = Array.from({ length: 5000 }, (_, i) =>
      riga(i + 1, `Legge <${i + 1}> & "speciale" con ]]> dentro`),
    );
    vi.mocked(getLawsFromDBorSeed).mockResolvedValue(tutte);
    const res = await feedGET(new Request("http://localhost/api/feed"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const etag = res.headers.get("etag");
    const lastModified = res.headers.get("last-modified");
    expect(etag && etag.length).toBeGreaterThan(0);
    expect(lastModified && lastModified.length).toBeGreaterThan(0);
    const xml = await res.text();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<rss");
    expect(xml).toContain("<channel>");
    const conteggio = (xml.match(/<item>/g) ?? []).length;
    expect(conteggio).toBe(FEED_MAX);
    expect(FEED_MAX).toBe(50);
    // Titoli con escape XML e senza terminatore CDATA grezzo.
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&amp;");
    expect(xml).not.toContain("]]> dentro");
    expect(xml).toContain("]]&gt; dentro");
    // Base dal sito configurato.
    expect(xml).toContain("<link>");
  });

  it("risponde 304 con If-None-Match o If-Modified-Since", async () => {
    vi.mocked(getLawsFromDBorSeed).mockResolvedValue([riga(1), riga(2)]);
    const prima = await feedGET(new Request("http://localhost/api/feed"));
    const etag = prima.headers.get("etag") ?? "";
    const lastModified = prima.headers.get("last-modified") ?? "";
    expect(prima.status).toBe(200);
    const conEtag = await feedGET(
      new Request("http://localhost/api/feed", { headers: { "if-none-match": etag } }),
    );
    expect(conEtag.status).toBe(304);
    const conData = await feedGET(
      new Request("http://localhost/api/feed", { headers: { "if-modified-since": lastModified } }),
    );
    expect(conData.status).toBe(304);
  });
});

describe("export/feed: mai 500", () => {
  it("export risponde 200 vuoto se listLaws e countLaws lanciano", async () => {
    vi.mocked(listLaws).mockRejectedValue(new Error("db giu"));
    vi.mocked(countLaws).mockRejectedValue(new Error("db giu"));
    const res = await exportGET(richiestaExport("?formato=json", "mai500-1"));
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { items: unknown[]; total: number };
    expect(corpo.items).toEqual([]);
    expect(corpo.total).toBe(0);
  });

  it("feed risponde 200 con RSS valido se il caricamento lancia", async () => {
    vi.mocked(getLawsFromDBorSeed).mockRejectedValue(new Error("db giu"));
    const res = await feedGET(new Request("http://localhost/api/feed"));
    expect(res.status).toBe(200);
    const xml = await res.text();
    expect(xml).toContain("<rss");
    expect(xml).toContain("<channel>");
  });
});
