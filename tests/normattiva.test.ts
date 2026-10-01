import { describe, expect, it, vi } from "vite-plus/test";
import { Effect, Exit } from "effect";
import {
  buildNirUrn,
  downloadCollection,
  eliFromUrn,
  getCollections,
  normalizzaData,
  parseAggiornati,
  parseAttoDto,
  parseCollections,
  parseEstensioni,
  parseRicercaAvanzata,
  parseTipologica,
  parseZipEntries,
  runNormattiva,
  runNormattivaExit,
  stripHtml,
  summarizeZip,
  tipoFromDenominazione,
} from "@/lib/normattiva";

function fetchJson(payload: unknown, status = 200): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

function buildZip(entries: { name: string; size: number }[]): Uint8Array {
  const encoder = new TextEncoder();
  const parti: Uint8Array[] = [];
  let cdSize = 0;
  for (const entry of entries) {
    const nome = encoder.encode(entry.name);
    const header = new Uint8Array(46 + nome.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(10, 0, true);
    view.setUint32(20, entry.size, true);
    view.setUint32(24, entry.size, true);
    view.setUint16(28, nome.length, true);
    header.set(nome, 46);
    parti.push(header);
    cdSize += header.length;
  }
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, 0, true);

  const out = new Uint8Array(cdSize + eocd.length);
  let offset = 0;
  for (const parte of parti) {
    out.set(parte, offset);
    offset += parte.length;
  }
  out.set(eocd, offset);
  return out;
}

describe("parser puri", () => {
  it("parseCollections accetta piu' forme di involucro", () => {
    const items = parseCollections({
      data: [
        { nome: "DL e leggi di conversione", numeroAtti: 7440 },
        { name: "Leggi ordinarie", count: "12" },
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0].nome).toBe("DL e leggi di conversione");
    expect(items[0].numeroAtti).toBe(7440);
    expect(items[1].numeroAtti).toBe(12);
    expect(parseCollections(null)).toEqual([]);
  });

  it("parseAggiornati normalizza le date italiane", () => {
    const hits = parseAggiornati({
      hits: [
        {
          numeroAtto: "133",
          codiceRedazionale: "26G00155",
          dataGU: "27/07/2026",
          numeroGU: "174",
          dataUltimaModifica: "2026-08-01T10:00:00Z",
        },
      ],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].dataGU).toBe("2026-07-27");
    expect(hits[0].dataUltimaModifica).toBe("2026-08-01");
    expect(hits[0].numeroGU).toBe("174");
  });

  it("parseAttoDto mappa tipo, data e testo", () => {
    const atto = parseAttoDto({
      data: {
        urn: "urn:nir:stato:decreto.legge:2026-07-27;133",
        titolo: "Disposizioni urgenti",
        sottoTitolo: "Energia",
        articoloHtml: "<p>Testo <b>norma</b></p>",
        denominazioneAtto: "DECRETO-LEGGE",
        numero: "133",
        dataEmanazione: "2026-07-27",
        codiceRedazionale: "26G00155",
      },
    });
    expect(atto).not.toBeNull();
    expect(atto?.tipo).toBe("decreto.legge");
    expect(atto?.numero).toBe("133");
    expect(atto?.dataEmanazione).toBe("2026-07-27");
    expect(atto?.testo).toBe("Testo norma");
    expect(parseAttoDto({})).toBeNull();
  });

  it("parseRicercaAvanzata calcola hasNext", () => {
    const raw = {
      atti: [
        { titolo: "A", denominazioneAtto: "LEGGE", numero: "1", dataEmanazione: "2024-01-01" },
        { titolo: "B", denominazioneAtto: "LEGGE", numero: "2", dataEmanazione: "2024-01-02" },
      ],
      total: 120,
    };
    const prima = parseRicercaAvanzata(raw, 1, 2);
    expect(prima.items).toHaveLength(2);
    expect(prima.total).toBe(120);
    expect(prima.hasNext).toBe(true);
    const ultima = parseRicercaAvanzata(raw, 60, 2);
    expect(ultima.hasNext).toBe(false);
  });

  it("parseTipologica e parseEstensioni", () => {
    expect(parseTipologica([{ value: "DECRETO-LEGGE", label: "Decreto-legge" }])).toEqual([
      { value: "DECRETO-LEGGE", label: "Decreto-legge" },
    ]);
    expect(parseEstensioni([{ estensione: "akn" }, "json"])).toEqual(["AKN", "JSON"]);
  });

  it("tipoFromDenominazione copre i tipi principali", () => {
    expect(tipoFromDenominazione("DECRETO-LEGGE")).toBe("decreto.legge");
    expect(tipoFromDenominazione("DECRETO LEGGE")).toBe("decreto.legge");
    expect(tipoFromDenominazione("LEGGE")).toBe("legge");
    expect(tipoFromDenominazione("DECRETO LEGISLATIVO")).toBe("decreto.legislativo");
    expect(tipoFromDenominazione("LEGGE COSTITUZIONALE")).toBe("legge.costituzionale");
    expect(tipoFromDenominazione("")).toBe("");
  });

  it("buildNirUrn ed eliFromUrn", () => {
    const urn = buildNirUrn({
      tipo: "decreto.legge",
      anno: 2026,
      mese: 7,
      giorno: 27,
      numero: 133,
    });
    expect(urn).toBe("urn:nir:stato:decreto.legge:2026-07-27;133");
    expect(eliFromUrn(urn, "26G00155")).toBe("/eli/id/2026/07/27/26G00155/sg");
    expect(eliFromUrn("non-urn", "26G00155")).toBe("");
  });

  it("normalizzaData e stripHtml", () => {
    expect(normalizzaData("27/07/2026")).toBe("2026-07-27");
    expect(normalizzaData("2026-07-27T00:00:00Z")).toBe("2026-07-27");
    expect(normalizzaData("non-data")).toBe("");
    expect(stripHtml("<p>Ciao <b>mondo</b> &amp; altri</p>")).toBe("Ciao mondo & altri");
  });

  it("stripHtml decodifica le entita' numeriche", () => {
    expect(stripHtml("l&#39;articolo &#x27;x&#x27; e &#34;y&#34;")).toBe("l'articolo 'x' e \"y\"");
  });
});

describe("lettore ZIP", () => {
  it("legge l'indice centrale", () => {
    const zip = buildZip([
      { name: "atti/atto1.json", size: 10 },
      { name: "atti/atto2.json", size: 20 },
    ]);
    const entries = parseZipEntries(zip);
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.name)).toEqual(["atti/atto1.json", "atti/atto2.json"]);
    expect(entries[0].uncompressedSize).toBe(10);
    const summary = summarizeZip(zip);
    expect(summary.entries).toBe(2);
    expect(summary.totalUncompressed).toBe(30);
  });

  it("restituisce [] su dati non validi", () => {
    expect(parseZipEntries(new Uint8Array([1, 2, 3, 4]))).toEqual([]);
  });
});

describe("wrapper Effect", () => {
  it("getCollections usa il fetch iniettato", async () => {
    const fetchImpl = fetchJson({ data: [{ nome: "Collezione A", numeroAtti: 3 }] });
    const items = await runNormattiva(getCollections(), { fetchImpl });
    expect(items).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("ritenta sugli errori 5xx", async () => {
    let chiamate = 0;
    const fetchImpl = vi.fn(async () => {
      chiamate += 1;
      if (chiamate < 3) return new Response("errore", { status: 503 });
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const items = await runNormattiva(getCollections(), { fetchImpl, retries: 2, timeoutMs: 5000 });
    expect(items).toEqual([]);
    expect(chiamate).toBe(3);
  });

  it("non ritenta sugli errori 4xx", async () => {
    const fetchImpl = fetchJson({ errore: "richiesta non valida" }, 400);
    await expect(runNormattiva(getCollections(), { fetchImpl, retries: 2 })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("va in timeout senza restare appeso", async () => {
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;

    const exit = await runNormattivaExit(getCollections(), {
      fetchImpl: hang,
      timeoutMs: 30,
      retries: 0,
    });
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("downloadCollection elenca le voci dello ZIP", async () => {
    const zip = buildZip([{ name: "documento.json", size: 5 }]);
    const fetchImpl = vi.fn(
      async () =>
        new Response(zip as unknown as BodyInit, {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
    ) as unknown as typeof fetch;

    const effetto = downloadCollection({ nome: "Collezione A" });
    const archivio = await Effect.runPromise(
      Effect.provide(effetto, (await import("@/lib/normattiva")).normattivaLayer({ fetchImpl })),
    );
    expect(archivio.entries).toHaveLength(1);
    expect(archivio.entries[0].name).toBe("documento.json");
  });

  it("downloadCollection fallisce se la risposta non e' ZIP", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ errore: "1003" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const { normattivaLayer } = await import("@/lib/normattiva");
    const exit = await Effect.runPromiseExit(
      Effect.provide(downloadCollection({ nome: "X" }), normattivaLayer({ fetchImpl })),
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("rifiuta gli archivi oltre il limite di 250 MB senza ritentare", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(new Uint8Array([0x50, 0x4b, 1, 2]), {
          status: 200,
          headers: {
            "content-type": "application/zip",
            "content-length": String(300 * 1024 * 1024),
          },
        }),
    ) as unknown as typeof fetch;

    await expect(
      runNormattiva(downloadCollection({ nome: "Troppo grande" }), { fetchImpl, retries: 2 }),
    ).rejects.toThrow(/250 MB/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
