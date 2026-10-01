/**
 * Finanziamenti ai partiti 2024-2026 (verticale-A REALI-14): contratto dello
 * scrittore V1.
 *
 * Tutto offline e deterministico:
 * - fixture INLINE come base obbligatoria (zero rete/disco obbligatorio);
 * - integrazione disco solo se `data/reali/finanziamenti-erogazioni-2024-2026.json`
 *   esiste davvero (tollerante, mai fallito per file assente);
 * - API `/api/finanziamenti` mai-500 con bound su q/per;
 * - mai inventare dati: campi assenti -> omessi, mai ricostruiti;
 * - zero nominativi eroganti: le voci hanno SOLO chiavi aggregate.
 *
 * Rete vietata (fetch stubbato a lanciare).
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { GET as finanziamentiGET } from "@/app/api/finanziamenti/route";
import {
  aErogazione,
  azzeraCacheFinanziamenti,
  cercaErogazioni,
  filtraPerAnno,
  LICENZA_FINANZIAMENTI,
  ordinaErogazioni,
  paginaFinanziamenti,
  tutteErogazioni,
  type ErogazionePartito,
} from "@/lib/finanziamenti-dati";
import {
  aggregaPdfFinanziamenti,
  decodificaCp1252,
  decodificaStringaPdf,
  estraiHrefPdfFinanziamenti,
  isIntestazioneBeneficiario,
  lastModifiedIso,
  parseRigaErogazione,
  rapportoMaiuscole,
  selezionaPdfPerPeriodo,
  unisciEOrdinaFinanziamenti,
  type AggregatiFile,
} from "../scripts/ingest-reale-finanziamenti";

beforeEach(() => {
  azzeraCacheFinanziamenti();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("rete vietata in tests/finanziamenti.test.ts");
    }),
  );
});

const RADICE = process.cwd();
const FILE_REALE = path.join(RADICE, "data/reali/finanziamenti-erogazioni-2024-2026.json");
const MAX_BYTE = 1024 * 1024;

const VOCE_VALIDA = {
  beneficiario: "PARTITO ESEMPIO",
  anno: 2025,
  n_erogazioni: 12,
  totale_euro: 34567.89,
  fonte_pdf: "https://parlamento18.camera.it/application/xmanager/uploads/000/000/007/prova.pdf",
  lastModified: "Thu, 11 Jun 2026 15:39:23 GMT",
};

const CHIAVI_VOCE = [
  "anno",
  "beneficiario",
  "fonte_pdf",
  "lastModified",
  "n_erogazioni",
  "totale_euro",
].sort();

// ---------------------------------------------------------------------------
// Script: decodifica low-level (offline, fixture inline)
// ---------------------------------------------------------------------------

describe("finanziamenti ingest: decodifica PDF low-level", () => {
  it("decodificaCp1252 mappa € e ’ e conserva Latin-1", () => {
    expect(decodificaCp1252([0x80, 0x20, 0x33])).toBe("€ 3");
    expect(decodificaCp1252([0x92])).toBe("’");
    expect(decodificaCp1252([0xc0, 0xd6, 0xdf])).toBe("ÀÖß");
    expect(decodificaCp1252([])).toBe("");
  });

  it("decodificaStringaPdf scioglie escape e ottali", () => {
    expect(decodificaStringaPdf("CEMIN CLAUDIO")).toBe("CEMIN CLAUDIO");
    expect(decodificaStringaPdf("\\(prova\\)")).toBe("(prova)");
    expect(decodificaStringaPdf("\\200")).toBe("€");
    expect(decodificaStringaPdf("N\\260eroganti")).toBe("N°eroganti");
  });

  it("parseRigaErogazione accetta no/sì, negativi e annotazioni in coda", () => {
    const base = "05/05/2025 2025 25/01/2026 CEMIN CLAUDIO 1 € 354,00 no";
    expect(parseRigaErogazione(base, 7)).toEqual({ anno: 2025, n: 1, centesimi: 35400 });
    expect(parseRigaErogazione("01/01/2026 2026 02/02/2026 ROSSI MARIO 1 € 100,00 sì", 8)).toEqual({
      anno: 2026,
      n: 1,
      centesimi: 10000,
    });
    expect(parseRigaErogazione("17/12/2024 2024 07/03/2025 FAGGI SIMONE 1 € -59,40 no", 7)).toEqual(
      { anno: 2024, n: 1, centesimi: -5940 },
    );
    expect(
      parseRigaErogazione(
        "08/04/2025 2025 30/05/2025 VIZIANO DAVIDE 1 € 300,00 no Erogazione integrata con comunicazione",
        8,
      ),
    ).toEqual({ anno: 2025, n: 1, centesimi: 30000 });
    // Il nominativo erogante NON e' tra i campi restituiti.
    expect(Object.keys(parseRigaErogazione(base, 7) ?? {}).sort()).toEqual([
      "anno",
      "centesimi",
      "n",
    ]);
  });

  it("parseRigaErogazione rifiuta intestazioni e anni assurdi", () => {
    expect(parseRigaErogazione("Data erogazione/anno Data trasmissione Importo", 7)).toBeNull();
    expect(parseRigaErogazione("ASSOCIAZIONE CAMPOBASE", 1)).toBeNull();
    expect(parseRigaErogazione("05/05/1999 1999 25/01/2026 X 1 € 10,00 no", 7)).toBeNull();
    expect(parseRigaErogazione("05/05/2025 2025 25/01/2026 X 1 € 10,00 no", 2)).toBeNull();
  });

  it("rapportoMaiuscole e isIntestazioneBeneficiario", () => {
    expect(rapportoMaiuscole("FORZA ITALIA")).toBe(1);
    expect(rapportoMaiuscole("Erogazione integrata con comunicazione")).toBeLessThan(0.85);
    expect(isIntestazioneBeneficiario(["FORZA ITALIA"], [27], "FORZA ITALIA")).toBe(true);
    expect(isIntestazioneBeneficiario(["STIFTELSEN"], [204.04], "STIFTELSEN")).toBe(false);
    expect(isIntestazioneBeneficiario(["- 3 -"], [413.78], "- 3 -")).toBe(false);
    expect(isIntestazioneBeneficiario(["A", "B"], [27, 204], "A B")).toBe(false);
    expect(isIntestazioneBeneficiario(["05/05/2025 X"], [27], "05/05/2025 X")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Script: indice -> selezione PDF (offline, fixture inline)
// ---------------------------------------------------------------------------

describe("finanziamenti ingest: indice e selezione PDF", () => {
  const HTML = `
    <a href="/application/xmanager/projects/parlamento18/attachments/file_parlamento/uploads/000/000/006/ART_5_2024_agg.13052025.pdf">Erogazioni 2024</a>
    <a href="/application/xmanager/projects/parlamento18/attachments/file_parlamento/uploads/000/000/007/ART_5_2025_agg._11062026.pdf">Erogazioni 2025</a>
    <a href="/application/xmanager/projects/parlamento18/attachments/file_parlamento/uploads/000/000/008/ART_5_2026_v._65.pdf">Erogazioni 2026</a>
    <a href="https://example.com/esterno.pdf">Esterno (scartato)</a>
  `
    .replaceAll("ART_5_2024", "ART_5_DL_149_2013_L_3_2019_dal_01012024_al_31122024")
    .replaceAll("ART_5_2025", "ART_5_DL_149_2013_L_3_2019_dal_01012025_al_31122025")
    .replaceAll("ART_5_2026", "ART_5_DL_149_2013_L_3_2019_dal_01012026");

  it("estrae solo gli uploads parlamento18 assoluti", () => {
    const hrefs = estraiHrefPdfFinanziamenti(HTML, "https://parlamento18.camera.it/199");
    expect(hrefs).toHaveLength(3);
    for (const h of hrefs) {
      expect(h.startsWith("https://parlamento18.camera.it/")).toBe(true);
    }
  });

  it("seleziona un PDF per periodo, errore se ambiguo o assente", () => {
    const hrefs = estraiHrefPdfFinanziamenti(HTML, "https://parlamento18.camera.it/199");
    const mappa = selezionaPdfPerPeriodo(hrefs);
    expect(mappa.size).toBe(3);
    expect(mappa.get("dal_01012024") ?? "").toContain("006");
    expect(() => selezionaPdfPerPeriodo(hrefs.slice(0, 2))).toThrow();
    expect(() => selezionaPdfPerPeriodo([...hrefs, `${hrefs[0]}?x=2`])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Script: aggregazione PDF sintetico (offline, costruito con deflate)
// ---------------------------------------------------------------------------

/** Intestazione tabella realistica (7 celle, come nei PDF ufficiali). */
const THEAD_SINTETICA: Array<[number, number, string]> = [
  [27, 570, "Data erogazione/anno"],
  [123, 570, "Data trasmissione"],
  [203, 570, "Soggetto erogante"],
  [363, 570, "N°eroganti"],
  [419, 570, "Importo"],
  [499, 570, "Non in denaro"],
  [579, 570, "Annotazioni"],
];

function pdfSintetico(celle: Array<[number, number, string]>): Buffer {
  const escape = (t: string) =>
    t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let ops = "";
  for (const [x, y, t] of celle) {
    ops += `BT\n1 0 0 1 ${x} ${y} Tm\n/F1 8 Tf\n(${escape(t)})Tj\nET\n`;
  }
  // "€" (U+20AC) non e' Latin-1: va codificato come byte WinAnsi 0x80.
  const comp = deflateSync(Buffer.from(ops.replace(/€/g, ""), "latin1"));
  return Buffer.concat([
    Buffer.from("%PDF-1.5\n1 0 obj\n<< /Length "),
    Buffer.from(String(comp.length)),
    Buffer.from(" >>\nstream\n"),
    comp,
    Buffer.from("\nendstream\nendobj\n"),
  ]);
}

describe("finanziamenti ingest: aggregazione content-stream", () => {
  it("aggrega (beneficiario, anno) e scarta il nominativo erogante", () => {
    const pdf = pdfSintetico([
      ...THEAD_SINTETICA,
      [27, 554, "PARTITO ESEMPIO"],
      [32, 542, "05/05/2025"],
      [86.74, 542, "2025"],
      [125.84, 542, "25/01/2026"],
      [204.04, 542, "TIZIO CAIO"],
      [378.44, 542, "1"],
      [418.18, 542, "€ 354,00"],
      [511.38, 542, "no"],
      [32, 530, "06/05/2025"],
      [86.74, 530, "2025"],
      [125.84, 530, "25/01/2026"],
      [204.04, 530, "TIZIA CAIA"],
      [378.44, 530, "2"],
      [418.18, 530, "€ 100,00"],
      [511.38, 530, "no"],
    ]);
    const agg = aggregaPdfFinanziamenti(pdf);
    expect(agg.righe).toBe(2);
    const voce = agg.coppie.get("PARTITO ESEMPIO|||2025");
    expect(voce).toEqual({ beneficiario: "PARTITO ESEMPIO", anno: 2025, n: 2, centesimi: 45400 });
    expect(JSON.stringify([...agg.coppie.values()])).not.toContain("TIZIO");
  });

  it("ignora continuazioni maiuscole fuori colonna beneficiario", () => {
    const pdf = pdfSintetico([
      ...THEAD_SINTETICA,
      [27, 554, "PARTITO ESEMPIO"],
      [32, 542, "05/05/2025"],
      [86.74, 542, "2025"],
      [125.84, 542, "25/01/2026"],
      [204.04, 542, "FONDAZIONE DEMOKRATI PLURALISM"],
      [378.44, 542, "1"],
      [418.18, 542, "€ 10,00"],
      [511.38, 542, "no"],
      [204.04, 534, "STIFTELSEN"],
    ]);
    const agg = aggregaPdfFinanziamenti(pdf);
    expect(agg.righe).toBe(1);
    expect([...agg.coppie.keys()]).toEqual(["PARTITO ESEMPIO|||2025"]);
  });

  it("lastModifiedIso converte l'header HTTP in ISO, errore se inventato", () => {
    expect(lastModifiedIso("Thu, 11 Jun 2026 15:39:23 GMT", "https://x/y.pdf")).toBe(
      "2026-06-11T15:39:23.000Z",
    );
    expect(() => lastModifiedIso("", "https://x/y.pdf")).toThrow();
    expect(() => lastModifiedIso("non una data", "https://x/y.pdf")).toThrow();
  });

  it("aggrega scarta le righe con anno fuori 2024-2026 (scope REALI-14)", () => {
    const pdf = pdfSintetico([
      ...THEAD_SINTETICA,
      [27, 554, "PARTITO ESEMPIO"],
      [32, 542, "19/08/2022"],
      [86.74, 542, "2022"],
      [125.84, 542, "27/03/2024"],
      [204.04, 542, "TIZIO CAIO"],
      [378.44, 542, "1"],
      [418.18, 542, "€ 800000,00"],
      [511.38, 542, "no"],
      [32, 530, "05/05/2025"],
      [86.74, 530, "2025"],
      [125.84, 530, "25/01/2026"],
      [204.04, 530, "TIZIA CAIA"],
      [378.44, 530, "1"],
      [418.18, 530, "€ 100,00"],
      [511.38, 530, "no"],
    ]);
    const agg = aggregaPdfFinanziamenti(pdf);
    expect(agg.righe).toBe(1);
    expect(agg.scartateFuoriAnno).toBe(1);
    expect([...agg.coppie.keys()]).toEqual(["PARTITO ESEMPIO|||2025"]);
  });

  it("last-wins: il testo stantio sovrastampato non crea beneficiari fantasma", () => {
    const pdf = pdfSintetico([
      ...THEAD_SINTETICA,
      [27, 554, "PARTITO VECCHIO"],
      [27, 554, "PARTITO ESEMPIO"],
      [32, 542, "05/05/2025"],
      [86.74, 542, "2025"],
      [125.84, 542, "25/01/2026"],
      [204.04, 542, "TIZIO CAIO"],
      [378.44, 542, "1"],
      [418.18, 542, "€ 10,00"],
      [511.38, 542, "no"],
    ]);
    const agg = aggregaPdfFinanziamenti(pdf);
    expect([...agg.coppie.keys()]).toEqual(["PARTITO ESEMPIO|||2025"]);
  });
});

// ---------------------------------------------------------------------------
// Script: merge + top (offline, fixture inline)
// ---------------------------------------------------------------------------

describe("finanziamenti ingest: merge e top deterministico", () => {
  function fileDi(coppie: Array<[string, number, number, number]>): AggregatiFile {
    const mappa = new Map<
      string,
      { beneficiario: string; anno: number; n: number; centesimi: number }
    >();
    for (const [b, a, n, c] of coppie)
      mappa.set(`${b}|||${a}`, { beneficiario: b, anno: a, n, centesimi: c });
    return { coppie: mappa, righe: 1, scartateFuoriAnno: 0 };
  }

  it("somma le coppie tra file, fonte = file con piu' righe", () => {
    const voci = unisciEOrdinaFinanziamenti(
      [
        fileDi([["PARTITO ESEMPIO", 2025, 10, 100000]]),
        fileDi([["PARTITO ESEMPIO", 2025, 3, 50000]]),
      ],
      50,
    );
    expect(voci).toHaveLength(1);
    expect(voci[0]).toMatchObject({
      beneficiario: "PARTITO ESEMPIO",
      anno: 2025,
      n: 13,
      centesimi: 150000,
      indiceFile: 0,
    });
  });

  it("top per totale desc con cap e spareggio deterministico", () => {
    const voci = unisciEOrdinaFinanziamenti(
      [
        fileDi([
          ["B ALTO", 2024, 1, 99900],
          ["A BASSO", 2024, 1, 100],
          ["C MEDIO", 2025, 1, 50000],
        ]),
      ],
      2,
    );
    expect(voci.map((v) => v.beneficiario)).toEqual(["B ALTO", "C MEDIO"]);
  });
});

// ---------------------------------------------------------------------------
// Lib: normalizzazione e helper (offline)
// ---------------------------------------------------------------------------

describe("finanziamenti lib: normalizzazione e helper", () => {
  it("aErogazione accetta la voce valida e rifiuta le malformate", () => {
    expect(aErogazione(VOCE_VALIDA)).toEqual(VOCE_VALIDA);
    expect(aErogazione({ ...VOCE_VALIDA, anno: 1999 })).toBeNull();
    expect(aErogazione({ ...VOCE_VALIDA, n_erogazioni: 0 })).toBeNull();
    expect(aErogazione({ ...VOCE_VALIDA, totale_euro: Number.NaN })).toBeNull();
    expect(
      aErogazione({ ...VOCE_VALIDA, fonte_pdf: "http://parlamento18.camera.it/x.pdf" }),
    ).toBeNull();
    expect(aErogazione({ ...VOCE_VALIDA, beneficiario: "X" })).toBeNull();
    expect(aErogazione({ ...VOCE_VALIDA, lastModified: "" })).toBeNull();
    expect(aErogazione(null)).toBeNull();
    expect(aErogazione({})).toBeNull();
  });

  it("cerca/filtra/ordina/pagina never-throw", () => {
    const voci: ErogazionePartito[] = [
      { ...VOCE_VALIDA, beneficiario: "LEGA PER SALVINI PREMIER", anno: 2025, totale_euro: 100 },
      { ...VOCE_VALIDA, beneficiario: "FORZA ITALIA", anno: 2024, totale_euro: 300 },
      { ...VOCE_VALIDA, beneficiario: "PARTITO DEMOCRATICO", anno: 2025, totale_euro: 200 },
    ];
    expect(cercaErogazioni(voci, "forza").map((v) => v.beneficiario)).toEqual(["FORZA ITALIA"]);
    expect(cercaErogazioni(voci, "x")).toHaveLength(3);
    expect(filtraPerAnno(voci, 2025)).toHaveLength(2);
    expect(filtraPerAnno(voci, "nope")).toHaveLength(3);
    expect(ordinaErogazioni(voci, "totale_desc").map((v) => v.totale_euro)).toEqual([
      300, 200, 100,
    ]);
    expect(ordinaErogazioni(voci, "nome_asc")[0].beneficiario).toBe("FORZA ITALIA");
    const dodici: ErogazionePartito[] = Array.from({ length: 12 }, (_, i) => ({
      ...VOCE_VALIDA,
      beneficiario: `PARTITO ${String(i).padStart(2, "0")}`,
    }));
    expect(paginaFinanziamenti(dodici, 2, 10)).toHaveLength(2);
    expect(paginaFinanziamenti(dodici, 1, 7)).toHaveLength(12);
    expect(cercaErogazioni(null as unknown as ErogazionePartito[], "q")).toEqual([]);
    expect(filtraPerAnno(null as unknown as ErogazionePartito[], 2025)).toEqual([]);
    expect(ordinaErogazioni(null as unknown as ErogazionePartito[], "x")).toEqual([]);
    expect(paginaFinanziamenti(null as unknown as ErogazionePartito[], 1, 20)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// API: mai-500 (offline, rete stubbata)
// ---------------------------------------------------------------------------

describe("finanziamenti API: mai-500", () => {
  it("GET senza parametri restituisce 200 con envelope stabile", async () => {
    const res = await finanziamentiGET(new Request("https://simple-law.it/api/finanziamenti"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    for (const k of ["items", "total", "page", "per", "count", "provenance", "disclaimer"]) {
      expect(json, `chiave ${k} assente`).toHaveProperty(k);
    }
    expect(Array.isArray(json["items"])).toBe(true);
  });

  it("GET con parametri assurdi non lancia e pagina entro i bound", async () => {
    const res = await finanziamentiGET(
      new Request(
        "https://simple-law.it/api/finanziamenti?q=%20%20&anno=abcd&ord=zzz&page=-5&per=9999",
      ),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { page: number; per: number; items: unknown[] };
    expect(json.page).toBe(1);
    expect(json.per).toBe(50);
    expect(Array.isArray(json.items)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integrazione file reale (tollerante: skip se assente, mai rete)
// ---------------------------------------------------------------------------

function notaSkip(msg: string): void {
  console.info(`[finanziamenti] SKIP tollerante — ${msg}`);
}

describe("finanziamenti: file reale (skip se assente)", () => {
  it("envelope + licenza obbligatoria + cap 1MB/50 voci", async () => {
    let raw: string;
    try {
      await stat(FILE_REALE);
      raw = await readFile(FILE_REALE, "utf8");
    } catch {
      notaSkip("data/reali/finanziamenti-erogazioni-2024-2026.json assente");
      expect(true).toBe(true);
      return;
    }
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(MAX_BYTE);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prov = parsed["provenance"] as Record<string, unknown>;
    expect(prov?.["fonte"]).toBeTruthy();
    expect(String(prov?.["url"] ?? "")).toContain("https://parlamento18.camera.it/199");
    expect(prov?.["licenza"]).toBe(LICENZA_FINANZIAMENTI);
    expect(Date.parse(String(prov?.["recuperatoIl"] ?? ""))).not.toBeNaN();
    const voci = parsed["erogazioni"] as unknown[];
    expect(Array.isArray(voci)).toBe(true);
    expect(voci.length).toBeGreaterThan(0);
    expect(voci.length).toBeLessThanOrEqual(50);
  });

  it("voci solo aggregate: chiavi esatte, mai inventati, ordinate per totale", async () => {
    let raw: string;
    try {
      raw = await readFile(FILE_REALE, "utf8");
    } catch {
      notaSkip("file reale assente — spot-check rimandato");
      expect(true).toBe(true);
      return;
    }
    const parsed = JSON.parse(raw) as { erogazioni: Array<Record<string, unknown>> };
    const visti = new Set<string>();
    let prevTotale = Number.POSITIVE_INFINITY;
    for (const voce of parsed.erogazioni) {
      expect(Object.keys(voce).sort()).toEqual(CHIAVI_VOCE);
      const ben = String(voce["beneficiario"] ?? "");
      expect(ben.length).toBeGreaterThanOrEqual(2);
      expect(ben.includes("€")).toBe(false);
      // Denominazioni ufficiali maiuscole: nessun nominativo erogante trapelato.
      expect(rapportoMaiuscole(ben)).toBeGreaterThanOrEqual(0.85);
      const anno = voce["anno"];
      expect(typeof anno).toBe("number");
      expect(anno as number).toBeGreaterThanOrEqual(2024);
      expect(anno as number).toBeLessThanOrEqual(2026);
      const n = voce["n_erogazioni"];
      expect(typeof n).toBe("number");
      expect(n as number).toBeGreaterThanOrEqual(1);
      const tot = voce["totale_euro"];
      expect(typeof tot).toBe("number");
      expect(Number.isFinite(tot as number)).toBe(true);
      expect(tot as number).toBeGreaterThanOrEqual(0);
      const pdf = String(voce["fonte_pdf"] ?? "");
      expect(pdf.startsWith("https://parlamento18.camera.it/")).toBe(true);
      expect(pdf.endsWith(".pdf")).toBe(true);
      const lm = String(voce["lastModified"] ?? "");
      expect(/^\d{4}-\d{2}-\d{2}T/.test(lm)).toBe(true);
      expect(Date.parse(lm)).not.toBeNaN();
      const chiave = `${ben}|||${anno}`;
      expect(visti.has(chiave)).toBe(false);
      visti.add(chiave);
      expect(tot as number).toBeLessThanOrEqual(prevTotale);
      prevTotale = tot as number;
    }
    expect(visti.size).toBeGreaterThan(0);
  });

  it("lib legge il file reale senza lanciare", async () => {
    let voci: ErogazionePartito[];
    try {
      voci = await tutteErogazioni();
    } catch (e) {
      expect(e, "tutteErogazioni ha lanciato").toBeNull();
      return;
    }
    expect(Array.isArray(voci)).toBe(true);
  });
});
