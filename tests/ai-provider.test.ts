import { describe, expect, it, vi } from "vitest";
import { getLLMConfig, simplifyWithProvider } from "@/lib/ai-provider";

const INPUT = {
  titolo: "Norma di prova",
  testo: "Il decreto stabilisce regole semplici. Si applica da subito.",
};

const RISPOSTA_VALIDA = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          in10Secondi: "In breve: prova",
          perTe: { guida: "spiegazione semplice" },
          cosaFare: ["Leggi il testo"],
          statoLavora: { colore: "verde", motivo: "Tutto ok" },
          proContro: { pro: ["Semplice"], contro: ["Generica"] },
          gulpease: 42,
        }),
      },
    },
  ],
};

function fetchOk(): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(RISPOSTA_VALIDA), { status: 200 })) as unknown as typeof fetch;
}

describe("getLLMConfig", () => {
  it("usa i default quando manca la chiave", () => {
    const config = getLLMConfig({ apiKey: "" });
    expect(config.apiKey).toBe("");
    expect(config.baseUrl).toContain("http");
    expect(config.model.length).toBeGreaterThan(0);
  });

  it("rispetta le opzioni esplicite", () => {
    const config = getLLMConfig({ apiKey: "abc", baseUrl: "http://localhost:1234/v1", model: "m" });
    expect(config).toEqual({ apiKey: "abc", baseUrl: "http://localhost:1234/v1", model: "m" });
  });
});

describe("simplifyWithProvider", () => {
  it("usa l'euristica (nessuna fetch) senza chiave", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { usatoLLM, risultato } = await simplifyWithProvider(INPUT, { apiKey: "", fetchImpl });
    expect(usatoLLM).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(risultato.perTe.guida).toBeTruthy();
  });

  it("usa il LLM quando la chiave e' presente", async () => {
    const { usatoLLM, risultato } = await simplifyWithProvider(INPUT, {
      apiKey: "test-key",
      fetchImpl: fetchOk(),
    });
    expect(usatoLLM).toBe(true);
    expect(risultato.in10Secondi).toBe("In breve: prova");
    expect(risultato.gulpease).toBe(42);
    expect(risultato.statoLavora.colore).toBe("verde");
  });

  it("ricade sull'euristica se il provider fallisce", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("rete non disponibile");
    }) as unknown as typeof fetch;
    const { usatoLLM, risultato } = await simplifyWithProvider(INPUT, { apiKey: "test-key", fetchImpl });
    expect(usatoLLM).toBe(false);
    expect(risultato.perTe.guida).toBeTruthy();
  });

  it("ignora le chiavi perTe fuori schema", async () => {
    const payload = {
      choices: [
        {
          message: {
            content: JSON.stringify({ perTe: { cittadini: "fuori schema", guida: "ok" } }),
          },
        },
      ],
    };
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(payload), { status: 200 }),
    ) as unknown as typeof fetch;
    const { risultato } = await simplifyWithProvider(INPUT, { apiKey: "k", fetchImpl });
    expect(risultato.perTe.guida).toBe("ok");
    expect(risultato.perTe.cittadini).toBeUndefined();
    expect(Object.keys(risultato.perTe).sort()).toEqual([
      "guida",
      "impresa",
      "lavoro",
      "studio",
    ]);
  });

  it("ritenta senza response_format dopo un 400", async () => {
    let chiamate = 0;
    const fetchImpl = vi.fn(async () => {
      chiamate += 1;
      if (chiamate === 1) return new Response("bad request", { status: 400 });
      return new Response(JSON.stringify(RISPOSTA_VALIDA), { status: 200 });
    }) as unknown as typeof fetch;

    const { usatoLLM } = await simplifyWithProvider(INPUT, { apiKey: "test-key", fetchImpl });
    expect(chiamate).toBe(2);
    expect(usatoLLM).toBe(true);
  });
});
