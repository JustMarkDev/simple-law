import { describe, expect, it } from "vitest";
import { normalizzaAttoReale } from "@/lib/sources";
import { statoCorrettoTestata } from "../scripts/normalizza-stati-testata";

const BASE = {
  titolo: "LEGGE 8 giugno 1990, n. 142",
  tipo: "legge",
  numero: "142",
  dataEmanazione: "1990-06-08",
  nir: "urn:nir:stato:legge:1990-06-08;142",
  eli: "/eli/id/1990/06/08/090G0123/sg",
  stato: "in_vigore",
  sintesi: "Ordinamento delle autonomie locali.",
};

describe("stati di testata: header formale di abrogazione/decadenza", () => {
  it("spazio dopo (( -> abrogato (regressione L. 142/1990)", () => {
    expect(
      statoCorrettoTestata(
        "Art. 1 (( PROVVEDIMENTO ABROGATO DAL D. LGS. 18 AGOSTO 2000, N. 267 ))",
        "in_vigore",
      ),
    ).toBe("abrogato");
    const record = normalizzaAttoReale({
      ...BASE,
      stato: "in_vigore",
      testo: "Art. 1 (( PROVVEDIMENTO ABROGATO DAL D. LGS. 18 AGOSTO 2000, N. 267 ))",
    });
    expect(record?.stato).toBe("abrogato");
  });

  it("Articolo unico. interposto -> abrogato", () => {
    const testo =
      "Art. 1 Articolo unico. ((PROVVEDIMENTO ABROGATO DAL D.L. 25 GIUGNO 2008, N. 112 ))";
    expect(statoCorrettoTestata(testo, "in_vigore")).toBe("abrogato");
    expect(normalizzaAttoReale({ ...BASE, stato: "in_vigore", testo })?.stato).toBe("abrogato");
  });

  it("header senza spazio resta abrogato", () => {
    expect(
      statoCorrettoTestata("Art. 1 ((PROVVEDIMENTO ABROGATO - testo", "in_vigore"),
    ).toBe("abrogato");
  });

  it("DECRETO DECADUTO -> decaduto", () => {
    expect(statoCorrettoTestata("Art. 1 DECRETO DECADUTO", "in_vigore")).toBe("decaduto");
    expect(
      normalizzaAttoReale({ ...BASE, stato: "in_vigore", testo: "Art. 1 DECRETO DECADUTO" })
        ?.stato,
    ).toBe("decaduto");
  });

  it("ARTICOLO ABROGATO singolo resta in_vigore (mai toccare)", () => {
    const testo = "Art. 1 ((ARTICOLO ABROGATO DAL D. LGS. 19 DICEMBRE 2002, N. 297 ))";
    expect(statoCorrettoTestata(testo, "in_vigore")).toBeNull();
    expect(normalizzaAttoReale({ ...BASE, stato: "in_vigore", testo })?.stato).toBe(
      "in_vigore",
    );
  });

  it("mai retrocedere abrogato/decaduto/sconosciuto", () => {
    const testo = "Art. 1 (( PROVVEDIMENTO ABROGATO DAL D. LGS. 18 AGOSTO 2000, N. 267 ))";
    expect(statoCorrettoTestata(testo, "abrogato")).toBeNull();
    expect(statoCorrettoTestata(testo, "decaduto")).toBeNull();
    expect(statoCorrettoTestata(testo, "sconosciuto")).toBeNull();
    expect(
      normalizzaAttoReale({ ...BASE, stato: "abrogato", testo })?.stato,
    ).toBe("abrogato");
    expect(
      normalizzaAttoReale({ ...BASE, stato: "decaduto", testo })?.stato,
    ).toBe("decaduto");
    // dettaglio assente senza testo verificato resta sconosciuto anche con header in sintesi
    expect(
      normalizzaAttoReale({ ...BASE, stato: "sconosciuto", dettaglio: false })?.stato,
    ).toBe("sconosciuto");
  });

  it("testo senza header non cambia stato", () => {
    expect(statoCorrettoTestata("Art. 1 Il comune e' ente locale.", "in_vigore")).toBeNull();
    expect(
      normalizzaAttoReale({
        ...BASE,
        stato: "in_vigore",
        testo: "Art. 1 Il comune e' ente locale.",
      })?.stato,
    ).toBe("in_vigore");
  });
});
