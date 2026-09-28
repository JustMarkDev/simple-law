import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Law as PrismaLaw } from "@prisma/client";
import {
  countLaws,
  getStats,
  listLaws,
  mapLaw,
  queryLaws,
  resetPrisma,
  toPrismaData,
} from "@/lib/db";
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

describe("query e statistiche (fallback seed o corpus grande)", () => {
  it("listLaws pagina i risultati sul totale calcolato", async () => {
    const totale = await countLaws();
    expect(totale).toBeGreaterThanOrEqual(5);
    const per = 2;
    const prima = await listLaws({ page: 1, per });
    expect(prima.total).toBe(totale);
    expect(prima.total).toBeGreaterThanOrEqual(5);
    expect(prima.items).toHaveLength(Math.min(per, totale));
    expect(prima.page).toBe(1);
    expect(prima.per).toBe(per);

    const ultimaPagina = Math.max(1, Math.ceil(totale / per));
    const ultima = await listLaws({ page: ultimaPagina, per });
    const attesiUltima = totale - (ultimaPagina - 1) * per;
    expect(ultima.items).toHaveLength(attesiUltima);
    expect(ultima.total).toBe(totale);
  });

  it("il DL 133/2026 e' presente nel corpus interrogato", async () => {
    const tutto = await listLaws({ page: 1, per: 100 });
    void tutto;
    const cerca133 = await listLaws({ q: "133" });
    expect(cerca133.total).toBeGreaterThanOrEqual(1);
    // Ricerca mirata sul titolo noto del DL 133 (energia) o NIR diretto
    const energia = await listLaws({ q: "energia" });
    expect(energia.total).toBeGreaterThanOrEqual(1);
    const seme = getSeedLaws().find(
      (l) => l.nir === "urn:nir:stato:decreto.legge:2026-07-27;133",
    );
    expect(seme).toBeDefined();
    expect(seme?.numero).toBe("133");
  });

  it("listLaws applica i filtri tipo, anno e q", async () => {
    const decreti = await listLaws({ tipo: "decreto.legge" });
    expect(decreti.total).toBeGreaterThanOrEqual(2);
    const anno = await listLaws({ anno: "2026" });
    expect(anno.total).toBeGreaterThanOrEqual(1);
    const cerca = await listLaws({ q: "carburanti" });
    expect(cerca.total).toBeGreaterThanOrEqual(1);
    const vuoto = await listLaws({ q: "zzz-inesistente" });
    expect(vuoto.total).toBe(0);
  });

  it("listLaws ordina per titolo su 100 righe", async () => {
    const risultato = await listLaws({ sort: "titolo_asc", per: 100 });
    expect(risultato.items.length).toBeGreaterThanOrEqual(1);
    expect(risultato.items.length).toBeLessThanOrEqual(100);
    const titoli = risultato.items.map((law) => law.titolo);
    expect(titoli).toEqual([...titoli].sort((a, b) => a.localeCompare(b, "it")));
  });

  it("countLaws conta i filtrati", async () => {
    expect(await countLaws()).toBeGreaterThanOrEqual(5);
    expect(await countLaws({ tipo: "decreto.legge" })).toBeGreaterThanOrEqual(2);
  });

  it("getStats aggrega il corpus", async () => {
    const stats = await getStats();
    expect(stats.totale).toBeGreaterThanOrEqual(5);
    expect(stats.perTipo["decreto.legge"]).toBeGreaterThanOrEqual(2);
    expect(stats.attuativiTotali.totale).toBeGreaterThan(0);
    expect(stats.qualitaMedia).not.toBeNull();
  });
});

describe("persona server-side (filtro derivato, seed senza DB)", () => {
  it("listLaws/queryLaws/countLaws con persona hanno totale coerente", async () => {
    const filtroPersona = { persona: "lavoro" } as unknown as Parameters<
      typeof listLaws
    >[0];
    const totaleBase = await countLaws();
    const totalePersona = await countLaws(filtroPersona);
    expect(totalePersona).toBeGreaterThan(0);
    expect(totalePersona).toBeLessThanOrEqual(totaleBase);

    const pagina = await listLaws({ ...filtroPersona, page: 1, per: 20 });
    expect(pagina.total).toBe(totalePersona);

    const tutte = await queryLaws(
      filtroPersona,
      Math.min(5000, Math.max(totalePersona, 1)),
    );
    // queryLaws ha cap 5000: coerenza bounded con il totale
    expect(tutte.length).toBe(Math.min(totalePersona, 5000));
  });

  it("pagina piena con persona: prima pagina completa e totali stabili", async () => {
    const filtroPersona = { persona: "lavoro" } as unknown as Parameters<
      typeof listLaws
    >[0];
    const per = 2;
    const prima = await listLaws({ ...filtroPersona, page: 1, per });
    expect(prima.total).toBeGreaterThanOrEqual(1);
    expect(prima.items).toHaveLength(Math.min(per, prima.total));
    const seconda = await listLaws({ ...filtroPersona, page: 2, per });
    expect(seconda.total).toBe(prima.total);
    if (prima.total > per) {
      expect(seconda.items.length).toBeGreaterThan(0);
      const eliPrima = new Set(prima.items.map((l) => l.eli));
      for (const law of seconda.items) {
        expect(eliPrima.has(law.eli)).toBe(false);
      }
    }
  });
});
