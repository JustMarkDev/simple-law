import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Law as PrismaLaw } from "@prisma/client";
import { countLaws, getStats, listLaws, mapLaw, resetPrisma, toPrismaData } from "@/lib/db";
import { getSeedLaws } from "@/lib/sources";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "");
  resetPrisma();
});

/**
 * Fedelta' del round-trip DB: i campi arricchiti (air, attuativi, testo,
 * fiducia, omnibus, dimostrativo) devono sopravvivere a persistenza e lettura.
 * Usa una riga finta: nessuna connessione reale.
 */
describe("round-trip DB (toPrismaData -> mapLaw)", () => {
  it("conserva air, attuativi, testo, fiducia, omnibus", () => {
    const originale = getSeedLaws()[0];
    if (!originale) throw new Error("seed vuoto");
    const data = toPrismaData(originale);
    expect(data.extra).not.toBeNull();

    const riga = {
      eli: originale.eli,
      ...data,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    } as PrismaLaw;
    const riletta = mapLaw(riga);

    expect(riletta.eli).toBe(originale.eli);
    expect(riletta.air).toBe(originale.air);
    expect(riletta.attuativi).toEqual(originale.attuativi);
    expect(riletta.testo).toBe(originale.testo);
    expect(riletta.fiducia).toBe(originale.fiducia);
    expect(riletta.omnibus).toBe(originale.omnibus);
  });

  it("righe senza extra restano valide (campi arricchiti assenti)", () => {
    const originale = getSeedLaws()[0];
    if (!originale) throw new Error("seed vuoto");
    const base = { ...originale };
    delete base.air;
    delete base.attuativi;
    delete base.testo;
    delete base.fiducia;
    delete base.omnibus;
    delete base.dimostrativo;
    const data = toPrismaData(base);
    const riga = {
      eli: base.eli,
      ...data,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    } as PrismaLaw;
    const riletta = mapLaw(riga);
    expect(riletta.air).toBeUndefined();
    expect(riletta.testo).toBeUndefined();
  });

  it("conserva i metadati Normattiva e la semplificazione", () => {
    const originale = getSeedLaws()[0];
    if (!originale) throw new Error("seed vuoto");
    const semplificata = {
      in10Secondi: "In breve: la norma interviene sull'energia.",
      perTe: {
        guida: "Se guidi, controlla i costi.",
        lavoro: "Se lavori, verifica le tutele.",
        impresa: "Se hai un'impresa, controlla gli incentivi.",
        studio: "Se studi, verifica le agevolazioni.",
      },
      cosaFare: ["Consulta il testo ufficiale."],
      statoLavora: { colore: "giallo" as const, motivo: "Attende un decreto attuativo." },
      proContro: { pro: ["Misure concrete"], contro: ["Iter da completare"] },
      gulpease: 48,
    };
    const data = toPrismaData({
      ...originale,
      codiceRedazionale: "26G00155",
      dataGU: "2026-07-27",
      numeroGU: "174",
      cameraId: "C1234",
      senatoDid: "S5678",
      urn: "urn:nir:stato:decreto.legge:2026-07-27;133",
      source: "normattiva.storico",
      syncedAt: "2026-09-01T00:00:00.000Z",
      qualita: 77,
      semplificata,
    });

    const riga = {
      eli: originale.eli,
      ...data,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    } as PrismaLaw;
    const riletta = mapLaw(riga);

    expect(riletta.codiceRedazionale).toBe("26G00155");
    expect(riletta.dataGU).toBe("2026-07-27");
    expect(riletta.numeroGU).toBe("174");
    expect(riletta.cameraId).toBe("C1234");
    expect(riletta.senatoDid).toBe("S5678");
    expect(riletta.urn).toBe("urn:nir:stato:decreto.legge:2026-07-27;133");
    expect(riletta.source).toBe("normattiva.storico");
    expect(riletta.syncedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(riletta.qualita).toBe(77);
    expect(riletta.semplificata).toEqual(semplificata);
  });

  it("scarta una semplificazione malformata", () => {
    const originale = getSeedLaws()[0];
    if (!originale) throw new Error("seed vuoto");
    const data = toPrismaData({
      ...originale,
      semplificata: { in10Secondi: 42, perTe: {} } as never,
    });
    const riga = {
      eli: originale.eli,
      ...data,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    } as PrismaLaw;
    expect(mapLaw(riga).semplificata).toBeUndefined();
  });
});

describe("query e statistiche (fallback seed)", () => {
  it("listLaws pagina i risultati", async () => {
    const prima = await listLaws({ page: 1, per: 2 });
    expect(prima.total).toBe(5);
    expect(prima.items).toHaveLength(2);
    expect(prima.page).toBe(1);
    expect(prima.per).toBe(2);

    const terza = await listLaws({ page: 3, per: 2 });
    expect(terza.items).toHaveLength(1);
  });

  it("listLaws applica i filtri tipo, anno e q", async () => {
    const decreti = await listLaws({ tipo: "decreto.legge" });
    expect(decreti.total).toBe(2);
    const anno = await listLaws({ anno: "2026" });
    expect(anno.total).toBeGreaterThanOrEqual(1);
    const cerca = await listLaws({ q: "carburanti" });
    expect(cerca.total).toBeGreaterThanOrEqual(1);
    const vuoto = await listLaws({ q: "zzz-inesistente" });
    expect(vuoto.total).toBe(0);
  });

  it("listLaws ordina per titolo", async () => {
    const risultato = await listLaws({ sort: "titolo_asc", per: 100 });
    const titoli = risultato.items.map((law) => law.titolo);
    expect(titoli).toEqual([...titoli].sort((a, b) => a.localeCompare(b, "it")));
  });

  it("countLaws conta i filtrati", async () => {
    expect(await countLaws()).toBe(5);
    expect(await countLaws({ tipo: "decreto.legge" })).toBe(2);
  });

  it("getStats aggrega il corpus", async () => {
    const stats = await getStats();
    expect(stats.totale).toBe(5);
    expect(stats.perTipo["decreto.legge"]).toBe(2);
    expect(stats.attuativiTotali.totale).toBeGreaterThan(0);
    expect(stats.qualitaMedia).not.toBeNull();
  });
});
