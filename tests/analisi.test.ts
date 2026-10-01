import { describe, expect, it, vi } from "vite-plus/test";
import { analizza, analisiEuristica, estraiNumeri, promptAnalisi } from "@/lib/analisi";

const INPUT = {
  titolo: "Sconto sul gasolio",
  testo:
    "Il diesel costa 17 centesimi in meno al litro per 8 giorni. Sono stanziati 100,5 milioni di euro per l'ILVA. L'articolo 3 abroga il comma 2.",
  pro: ["Prezzi più bassi"],
  contro: ["Dura poco"],
};

describe("estraiNumeri", () => {
  it("prende solo cifre con unità, non i numeri di articolo", () => {
    const valori = estraiNumeri(INPUT.testo).map((n) => n.valore);
    expect(valori).toEqual(["17 centesimi", "8 giorni", "100,5 milioni di euro"]);
  });
});

describe("analisiEuristica", () => {
  it("non inventa un voto nel merito", () => {
    const a = analisiEuristica(INPUT);
    expect(a.conAI).toBe(false);
    expect(a.giudizio.voto).toBeNull();
    expect(a.giudizio.pro).toEqual(["Prezzi più bassi"]);
    expect(a.inPocheParole).toContain("17 centesimi");
  });
});

describe("analizza", () => {
  it("usa il modello e limita il voto a 1-10", async () => {
    const strutturata = {
      inPocheParole: "Diesel scontato per 8 giorni",
      numeri: [{ valore: "17 cent/l", cosa: "sconto", stima: false }],
      giudizio: {
        voto: 14,
        verdetto: "Toppa costosa",
        perche: "Dura poco.",
        pro: ["a"],
        contro: ["b"],
      },
    };
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = input instanceof Request ? input : new Request(input, init);
      const dati =
        new URL(req.url).pathname === "/session"
          ? { id: "s1" }
          : { info: { structured: strutturata }, parts: [] };
      return new Response(JSON.stringify(dati), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const a = await analizza(INPUT, { url: "http://opencode.test", api: "v2", fetchImpl });
    expect(a.conAI).toBe(true);
    expect(a.giudizio.voto).toBe(10);
    expect(a.inPocheParole).toBe("Diesel scontato per 8 giorni");
    expect(a.spiegazione.length).toBeGreaterThan(0);
  });

  it("con l'AI spenta ricade sull'euristica", async () => {
    const a = await analizza(INPUT, { disattivata: true });
    expect(a.conAI).toBe(false);
  });

  it("il prompt separa merito e scrittura", () => {
    expect(promptAnalisi(INPUT)).toContain("MERITO");
  });
});

describe("analisiEuristica senza testo", () => {
  it("non ripete il titolo come spiegazione", () => {
    const a = analisiEuristica({
      titolo: "Regolamento X.",
      testo: "Regolamento X.. Regolamento X.",
    });
    expect(a.spiegazione).toMatch(/solo il titolo/);
  });
});
