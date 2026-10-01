import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { Effect, Layer } from "effect";
import { resetPrisma } from "@/lib/db";
import type { LawRecordExtra } from "@/lib/db";
import { Normattiva, NormattivaError, type AttoDto, type NormattivaShape } from "@/lib/normattiva";
import { attoToLawRecord, enrichLaw, recenteEffect, storicoEffect } from "@/lib/sync";
import { anniDaSelezionare } from "@/lib/sync";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetPrisma();
});

interface Chiamata {
  method: string;
  path: string;
  body?: unknown;
}

interface FintoConfig {
  collections?: unknown;
  denominazioni?: unknown;
  avanzata?: (pagina: number) => unknown;
  aggiornati?: unknown;
  dettaglio?: unknown;
  fallisciAvanzata?: boolean;
}

function servizioFinto(config: FintoConfig = {}): {
  layer: Layer.Layer<Normattiva>;
  chiamate: Chiamata[];
} {
  const chiamate: Chiamata[] = [];

  const shape: NormattivaShape = {
    request: (method, path, body) => {
      chiamate.push({ method, path, body });
      if (path.includes("collection-predefinite")) {
        return Effect.succeed(config.collections ?? { data: [] });
      }
      if (path.includes("tipologiche/denominazione-atto")) {
        return Effect.succeed(config.denominazioni ?? []);
      }
      if (path.includes("ricerca/avanzata")) {
        if (config.fallisciAvanzata) {
          return Effect.fail(
            new NormattivaError({
              message: "avanzata ko",
              url: path,
              status: 500,
              retryable: false,
            }),
          );
        }
        const pagina =
          body && typeof body === "object" && "pagina" in body
            ? Number((body as { pagina?: unknown }).pagina)
            : 1;
        return Effect.succeed(config.avanzata?.(pagina) ?? { atti: [], total: 0 });
      }
      if (path.includes("ricerca/aggiornati")) {
        return Effect.succeed(config.aggiornati ?? { hits: [] });
      }
      if (path.includes("dettaglio-atto-urn")) {
        return Effect.succeed(config.dettaglio ?? null);
      }
      return Effect.fail(
        new NormattivaError({
          message: `rotta non gestita: ${path}`,
          url: path,
          status: 404,
          retryable: false,
        }),
      );
    },
    download: () =>
      Effect.fail(
        new NormattivaError({
          message: "download non usato",
          url: "",
          status: null,
          retryable: false,
        }),
      ),
  };

  return { layer: Layer.succeed(Normattiva, shape), chiamate };
}

const ATTO_A = {
  titolo: "Disposizioni urgenti in materia di energia",
  sottoTitolo: "Misure per la riconversione industriale",
  testo:
    "Il Governo adotta misure per la riconversione degli impianti. Le amministrazioni provvedono.",
  denominazioneAtto: "DECRETO-LEGGE",
  numero: "133",
  dataEmanazione: "2026-07-27",
  codiceRedazionale: "26G00155",
  urn: "urn:nir:stato:decreto.legge:2026-07-27;133",
};

const ATTO_B = {
  titolo: "Legge annuale per il mercato e la concorrenza",
  sottoTitolo: "Misure per la concorrenza",
  testo: "La presente legge reca disposizioni per la promozione della concorrenza.",
  denominazioneAtto: "LEGGE",
  numero: "124",
  dataEmanazione: "2025-12-19",
  codiceRedazionale: "25G00134",
  urn: "urn:nir:stato:legge:2025-12-19;124",
};

describe("enrichLaw", () => {
  it("produce semplificata con le chiavi persona della UI", () => {
    const law: LawRecordExtra = {
      eli: "/eli/id/2026/07/27/26G00155/sg",
      nir: "urn:nir:stato:decreto.legge:2026-07-27;133",
      tipo: "decreto.legge",
      numero: "133",
      dataEmanazione: "2026-07-27",
      titolo: "Disposizioni urgenti",
      sintesi: "Misure per l'energia e la riconversione.",
      stato: "in_vigore",
      gulpease: null,
      fonti: null,
    };
    const arricchita = enrichLaw(law, "normattiva.test", "2026-01-01T00:00:00.000Z");
    expect(arricchita.semplificata).toBeDefined();
    expect(Object.keys(arricchita.semplificata?.perTe ?? {}).sort()).toEqual([
      "guida",
      "impresa",
      "lavoro",
      "studio",
    ]);
    expect(typeof arricchita.qualita).toBe("number");
    expect(typeof arricchita.semplificata?.gulpease).toBe("number");
    expect(arricchita.source).toBe("normattiva.test");
    expect(arricchita.syncedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("attoToLawRecord", () => {
  it("deriva l'ELI da URN e codice redazionale", () => {
    const atto: AttoDto = {
      urn: "urn:nir:stato:legge:2024-01-01;1",
      eli: "",
      titolo: "Titolo di prova",
      sottoTitolo: "",
      articoloHtml: "",
      testo: "Testo.",
      tipo: "legge",
      numero: "1",
      dataEmanazione: "2024-01-01",
      codiceRedazionale: "24G00001",
      stato: "in_vigore",
      raw: {},
    };
    const law = attoToLawRecord(atto);
    expect(law?.eli).toBe("/eli/id/2024/01/01/24G00001/sg");
    expect(law?.nir).toBe("urn:nir:stato:legge:2024-01-01;1");
    expect(attoToLawRecord({ ...atto, titolo: "" })).toBeNull();
  });
});

describe("anniDaSelezionare", () => {
  it("genera l'intervallo tra annoDa e annoA", () => {
    expect(anniDaSelezionare(2023, 2025)).toEqual(["2023", "2024", "2025"]);
    expect(anniDaSelezionare("2026", "2026")).toEqual(["2026"]);
  });

  it("gestisce i singoli estremi e l'assenza di filtro", () => {
    expect(anniDaSelezionare(2024, undefined)).toEqual([2024]);
    expect(anniDaSelezionare(undefined, "2025")).toEqual(["2025"]);
    expect(anniDaSelezionare()).toEqual([undefined]);
  });

  it("non espande intervalli troppo ampi", () => {
    expect(anniDaSelezionare(1990, 2026)).toEqual([1990, 2026]);
  });
});

describe("storicoEffect", () => {
  it("ingerisce gli atti dalla ricerca avanzata", async () => {
    const { layer, chiamate } = servizioFinto({
      avanzata: () => ({ atti: [ATTO_A, ATTO_B], total: 2 }),
    });
    const report = await Effect.runPromise(
      Effect.provide(storicoEffect({ denominazioni: ["DECRETO-LEGGE"], persist: false }), layer),
    );
    expect(report.ok).toBe(true);
    expect(report.fetched).toBe(2);
    expect(report.simplified).toBe(2);
    expect(report.collections).toEqual([]);
    expect(report.notes.length).toBeGreaterThan(0);
    expect(chiamate.some((c) => c.path.includes("ricerca/avanzata"))).toBe(true);
  });

  it("rispetta il limite di atti", async () => {
    const { layer } = servizioFinto({
      avanzata: () => ({ atti: [ATTO_A, ATTO_B], total: 2 }),
    });
    const report = await Effect.runPromise(
      Effect.provide(storicoEffect({ denominazioni: ["LEGGE"], limit: 1, persist: false }), layer),
    );
    expect(report.fetched).toBe(1);
    expect(report.simplified).toBe(1);
  });

  it("cattura gli errori senza lanciare", async () => {
    const { layer } = servizioFinto({ fallisciAvanzata: true });
    const report = await Effect.runPromise(
      Effect.provide(storicoEffect({ denominazioni: ["LEGGE"], persist: false }), layer),
    );
    expect(report.ok).toBe(false);
    expect(report.fetched).toBe(0);
    expect(report.errors.length).toBeGreaterThan(0);
  });

  it("annota il limite massimo di 250 MB per gli archivi", async () => {
    const { layer } = servizioFinto();
    const report = await Effect.runPromise(
      Effect.provide(
        storicoEffect({
          collezioni: ["Collezione A"],
          denominazioni: ["LEGGE"],
          persist: false,
        }),
        layer,
      ),
    );
    expect(report.notes.some((nota) => nota.includes("250 MB"))).toBe(true);
  });
});

describe("recenteEffect", () => {
  it("recupera i dettagli degli atti aggiornati", async () => {
    const { layer, chiamate } = servizioFinto({
      aggiornati: {
        hits: [
          {
            numeroAtto: "133",
            codiceRedazionale: "26G00155",
            urn: "urn:nir:stato:decreto.legge:2026-07-27;133",
            dataGU: "2026-07-27",
          },
        ],
      },
      dettaglio: ATTO_A,
    });
    const report = await Effect.runPromise(
      Effect.provide(recenteEffect({ dal: "2026-07-01", al: "2026-07-31", persist: false }), layer),
    );
    expect(report.ok).toBe(true);
    expect(report.fetched).toBe(1);
    expect(report.simplified).toBe(1);
    const ricerca = chiamate.find((c) => c.path.includes("ricerca/aggiornati"));
    expect(ricerca?.body).toEqual({
      dataInizioAggiornamento: "2026-07-01",
      dataFineAggiornamento: "2026-07-31",
    });
  });

  it("usa l'intervallo di default di 30 giorni", async () => {
    const { layer, chiamate } = servizioFinto({ aggiornati: { hits: [] } });
    await Effect.runPromise(Effect.provide(recenteEffect({ persist: false }), layer));
    const ricerca = chiamate.find((c) => c.path.includes("ricerca/aggiornati"));
    const body = ricerca?.body as {
      dataInizioAggiornamento: string;
      dataFineAggiornamento: string;
    };
    expect(body.dataInizioAggiornamento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.dataFineAggiornamento).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ignora gli hit senza URN con una nota, non un errore", async () => {
    const { layer } = servizioFinto({
      aggiornati: {
        hits: [{ numeroAtto: "999", codiceRedazionale: "", urn: "", dataGU: "2026-01-10" }],
      },
    });
    const report = await Effect.runPromise(
      Effect.provide(recenteEffect({ dal: "2026-01-01", al: "2026-01-31", persist: false }), layer),
    );
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.notes.some((nota) => nota.includes("senza URN"))).toBe(true);
    expect(report.fetched).toBe(0);
  });
});
