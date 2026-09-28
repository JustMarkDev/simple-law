import { describe, expect, it } from "vitest";
import { buildFonti, FONTI_LABELS, GOVERNO_ARCHIVIO_URL } from "@/lib/fonti";
import { SEED_LAWS } from "@/lib/seed-data";

const NORMATTIVA_DL133 =
  "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2026-07-27;133";
const GU_ELI_DL133 = "https://www.gazzettaufficiale.it/eli/id/2026/07/27/26G00155/sg";
const NORMATTIVA_DL139 =
  "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:2026-08-05;139";

describe("buildFonti", () => {
  it("costruisce sempre il permalink Normattiva URN da tipo, data e numero", () => {
    const fonti = buildFonti({
      tipo: "decreto.legge",
      numero: "133",
      dataEmanazione: "2026-07-27",
    });
    expect(fonti.normattiva).toBe(NORMATTIVA_DL133);
  });

  it("costruisce la GU ELI dal codice redazionale e dalla data GU", () => {
    const fonti = buildFonti({
      tipo: "decreto.legge",
      numero: "133",
      dataEmanazione: "2026-07-27",
      codiceRedazionale: "26G00155",
      dataGU: "2026-07-27",
      numeroGU: "172",
    });
    expect(fonti.normattiva).toBe(NORMATTIVA_DL133);
    expect(fonti.gazzetta).toBe(GU_ELI_DL133);
  });

  it("preferisce la ELI al dettaglio del numero GU quando c'e' il codice", () => {
    const fonti = buildFonti({
      tipo: "decreto.legge",
      numero: "133",
      dataEmanazione: "2026-07-27",
      codiceRedazionale: "26G00155",
      dataGU: "2026-07-27",
      numeroGU: "172",
    });
    expect(fonti.gazzetta).toBe(GU_ELI_DL133);
    expect(fonti.gazzetta).not.toContain("caricaDettaglio");
  });

  it("usa il dettaglio del numero GU solo con numero e data, senza codice", () => {
    const fonti = buildFonti({
      tipo: "decreto.legge",
      numero: "139",
      dataEmanazione: "2026-08-05",
      dataGU: "2026-08-05",
      numeroGU: "180",
    });
    expect(fonti.gazzetta).toBe(
      "https://www.gazzettaufficiale.it/gazzetta/serie_generale/caricaDettaglio?dataPubblicazioneGazzetta=2026-08-05&numeroGazzetta=180",
    );
  });

  it("omette la Gazzetta senza codice ne' numero+data", () => {
    const fonti = buildFonti({
      tipo: "decreto.legge",
      numero: "139",
      dataEmanazione: "2026-08-05",
    });
    expect(fonti.gazzetta).toBeUndefined();
  });

  it("aggiunge sempre l'archivio del Consiglio dei ministri", () => {
    const fonti = buildFonti({ tipo: "legge", numero: "124", dataEmanazione: "2025-12-19" });
    expect(fonti.governo).toBe(GOVERNO_ARCHIVIO_URL);
    expect(fonti.governo).toBe("https://www.governo.it/it/archivio-consiglio-dei-ministri");
  });

  it("omette il Senato quando manca il did", () => {
    const fonti = buildFonti({ tipo: "legge", numero: "124", dataEmanazione: "2025-12-19" });
    expect(fonti.senato).toBeUndefined();
  });

  it("include il Senato solo con il did", () => {
    const fonti = buildFonti({
      tipo: "legge",
      numero: "124",
      dataEmanazione: "2025-12-19",
      senatoDid: "12345",
    });
    expect(fonti.senato).toBe(
      "https://www.senato.it/leggi-e-documenti/disegni-di-legge/scheda-ddl?did=12345",
    );
  });

  it("omette la Camera quando manca l'idDocumento", () => {
    const fonti = buildFonti({ tipo: "legge", numero: "124", dataEmanazione: "2025-12-19" });
    expect(fonti.camera).toBeUndefined();
  });

  it("include la Camera solo con idDocumento e legislatura", () => {
    const fonti = buildFonti({
      tipo: "legge",
      numero: "124",
      dataEmanazione: "2025-12-19",
      cameraId: "1234",
      legislatura: "19",
    });
    expect(fonti.camera).toBe("https://www.camera.it/leg19/126?idDocumento=1234");
  });
});

describe("FONTI_LABELS", () => {
  it("etichetta l'archivio del Governo come Archivio CdM", () => {
    expect(FONTI_LABELS.governo).toBe("Archivio CdM");
  });

  it("copre tutte le chiavi delle fonti", () => {
    expect(Object.keys(FONTI_LABELS).sort()).toEqual(
      ["camera", "gazzetta", "governo", "normattiva", "senato"].sort(),
    );
  });
});

describe("fonti del seed", () => {
  it("il DL 133/2026 usa i template verificati", () => {
    const dl133 = SEED_LAWS.find((law) => law.numero === "133");
    expect(dl133).toBeDefined();
    expect(dl133?.fonti?.normattiva).toBe(NORMATTIVA_DL133);
    expect(dl133?.fonti?.gazzetta).toBe(GU_ELI_DL133);
    expect(dl133?.fonti?.governo).toBe(GOVERNO_ARCHIVIO_URL);
  });

  it("il DL 139/2026 non include una GU ELI inventata", () => {
    const dl139 = SEED_LAWS.find((law) => law.numero === "139" && law.tipo === "decreto.legge");
    expect(dl139).toBeDefined();
    expect(dl139?.fonti?.normattiva).toBe(NORMATTIVA_DL139);
    expect(dl139?.fonti?.gazzetta).toBeUndefined();
    expect(JSON.stringify(dl139?.fonti)).not.toContain("26G00161");
  });

  it("nessuna legge seed espone Camera o Senato generici", () => {
    for (const law of SEED_LAWS) {
      expect(law.fonti?.camera, `camera non attesa per ${law.numero}`).toBeUndefined();
      expect(law.fonti?.senato, `senato non atteso per ${law.numero}`).toBeUndefined();
    }
  });

  it("ogni legge seed ha un permalink Normattiva URN valido", () => {
    for (const law of SEED_LAWS) {
      expect(law.fonti?.normattiva, `normattiva mancante per ${law.numero}`).toMatch(
        /^https:\/\/www\.normattiva\.it\/uri-res\/N2Ls\?urn:nir:stato:[a-z.]+:\d{4}-\d{2}-\d{2};/,
      );
    }
  });

  it("nessuna fonte del seed punta a pagine di ricerca", () => {
    for (const law of SEED_LAWS) {
      for (const url of Object.values(law.fonti ?? {})) {
        expect(url).not.toMatch(/ricerca|search/i);
      }
    }
  });
});
