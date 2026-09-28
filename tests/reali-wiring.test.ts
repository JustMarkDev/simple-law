import { describe, expect, it } from "vitest";
import { SEED_LAWS } from "@/lib/seed-data";
import {
  estraiListaAttiReali,
  estraiListaComunicatiReali,
  getSeedCdm,
  getSeedLaws,
  normalizzaAttoReale,
  normalizzaComunicatoReale,
} from "@/lib/sources";

const ATTO_FIXTURE = {
  chiave: "decreto.legge-2026-133",
  titolo: "Disposizioni urgenti in materia di energia",
  tipo: "decreto.legge",
  numero: "133",
  dataEmanazione: "2026-07-27",
  nir: "urn:nir:stato:decreto.legge:2026-07-27;133",
  eli: "/eli/id/2026/07/27/26G00155/sg",
  stato: "in_vigore",
  sintesi: "Sintesi verificata del comunicato ufficiale.",
  codiceRedazionale: "26G00155",
  dataGU: "2026-07-27",
  numeroGU: "172",
};

const COMUNICATO_FIXTURE = {
  id: "cdm-reale-1",
  data: "2026-09-15",
  numero: "190",
  titolo: "Comunicato stampa del Consiglio dei ministri n. 190",
  sintesi: "Sintesi verificata dal feed ufficiale.",
  url: "https://www.governo.it/it/articolo/esempio-reale",
};

describe("wiring reali -> app (fixture inline, zero rete, zero disco)", () => {
  it("normalizza un atto reale valido con dimostrativo=false forzato", () => {
    const record = normalizzaAttoReale(ATTO_FIXTURE);
    expect(record).not.toBeNull();
    expect(record?.titolo).toBe(ATTO_FIXTURE.titolo);
    expect(record?.eli).toBe(ATTO_FIXTURE.eli);
    expect(record?.dimostrativo).toBe(false);
    expect(record?.fonti).toBeTruthy();
    expect(record?.gulpease === null || typeof record?.gulpease === "number").toBe(true);
  });

  it("scarta gli atti senza titolo o senza eli (validazione minima)", () => {
    expect(normalizzaAttoReale({ ...ATTO_FIXTURE, titolo: "  " })).toBeNull();
    expect(normalizzaAttoReale({ ...ATTO_FIXTURE, eli: "" })).toBeNull();
    expect(normalizzaAttoReale(null)).toBeNull();
    expect(normalizzaAttoReale(undefined)).toBeNull();
    expect(normalizzaAttoReale("stringa")).toBeNull();
    expect(normalizzaAttoReale([])).toBeNull();
  });

  it("non lancia mai su input malformati", () => {
    expect(() => normalizzaAttoReale({})).not.toThrow();
    expect(() => normalizzaAttoReale({ titolo: 123, eli: null })).not.toThrow();
    expect(() => normalizzaAttoReale({ titolo: "x", eli: "y", dataEmanazione: "non-una-data" })).not.toThrow();
  });

  it("estrae atti sia da envelope sia da array diretto", () => {
    expect(estraiListaAttiReali([ATTO_FIXTURE])).toHaveLength(1);
    expect(estraiListaAttiReali({ leggi: [ATTO_FIXTURE] })).toHaveLength(1);
    expect(estraiListaAttiReali({ dati: [ATTO_FIXTURE] })).toHaveLength(1);
    expect(estraiListaAttiReali({ atti: [ATTO_FIXTURE] })).toHaveLength(1);
    expect(estraiListaAttiReali({})).toEqual([]);
    expect(estraiListaAttiReali(null)).toEqual([]);
    expect(() => estraiListaAttiReali(undefined)).not.toThrow();
  });

  it("normalizza un comunicato reale valido", () => {
    const comunicato = normalizzaComunicatoReale(COMUNICATO_FIXTURE);
    expect(comunicato).not.toBeNull();
    expect(comunicato?.id).toBe(COMUNICATO_FIXTURE.id);
    expect(comunicato?.titolo).toBe(COMUNICATO_FIXTURE.titolo);
    expect(comunicato?.url).toBe(COMUNICATO_FIXTURE.url);
  });

  it("scarta i comunicati senza id, titolo o url", () => {
    expect(normalizzaComunicatoReale({ ...COMUNICATO_FIXTURE, id: "" })).toBeNull();
    expect(normalizzaComunicatoReale({ ...COMUNICATO_FIXTURE, titolo: " " })).toBeNull();
    expect(normalizzaComunicatoReale({ ...COMUNICATO_FIXTURE, url: "" })).toBeNull();
    expect(normalizzaComunicatoReale({ ...COMUNICATO_FIXTURE, url: "non-un-url" })).toBeNull();
    expect(normalizzaComunicatoReale(null)).toBeNull();
    expect(() => normalizzaComunicatoReale({})).not.toThrow();
  });

  it("estrae comunicati sia da envelope sia da array diretto", () => {
    expect(estraiListaComunicatiReali([COMUNICATO_FIXTURE])).toHaveLength(1);
    expect(estraiListaComunicatiReali({ comunicati: [COMUNICATO_FIXTURE] })).toHaveLength(1);
    expect(estraiListaComunicatiReali({ dati: [COMUNICATO_FIXTURE] })).toHaveLength(1);
    expect(estraiListaComunicatiReali({})).toEqual([]);
    expect(() => estraiListaComunicatiReali("x")).not.toThrow();
  });

  it("getSeedLaws non lancia e tiene i 5 seed primi (file assenti -> invariato)", () => {
    let leggi: ReturnType<typeof getSeedLaws> = [];
    expect(() => {
      leggi = getSeedLaws();
    }).not.toThrow();
    expect(leggi.length).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < SEED_LAWS.length; i++) {
      expect(leggi[i]?.eli).toBe(SEED_LAWS[i]?.eli);
    }
    const chiavi = leggi.map((l) => String(l.eli).trim().toLowerCase());
    expect(new Set(chiavi).size).toBe(chiavi.length);
  });

  it("getSeedCdm non lancia e restituisce copie difensive con id, titolo e url", () => {
    let items: ReturnType<typeof getSeedCdm> = [];
    expect(() => {
      items = getSeedCdm();
    }).not.toThrow();
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(item.id.length).toBeGreaterThan(0);
      expect(item.titolo.length).toBeGreaterThan(0);
      expect(item.url.length).toBeGreaterThan(0);
    }
    items[0].titolo = "MANOMESSO";
    expect(getSeedCdm()[0]?.titolo).not.toBe("MANOMESSO");
  });
});
