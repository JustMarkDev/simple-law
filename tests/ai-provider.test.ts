import { describe, expect, it, vi } from "vite-plus/test";
import { chiediJSON, getOpencodeConfig } from "@/lib/ai-provider";

const URL_OC = "http://opencode.test";

interface Scenario {
  /** Risposta v2 con output strutturato, oppure errore HTTP sulla v2. */
  v2?: "strutturata" | "errore";
  testo?: string;
}

/** Finto server opencode: distingue v1/v2 dalla presenza di `format` nel body. */
function fintoOpencode(scenario: Scenario = {}) {
  const chiamate: { metodo: string; path: string; body: Record<string, unknown> | null }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const { pathname } = new URL(req.url);
    const testo = await req.text();
    const body = testo ? (JSON.parse(testo) as Record<string, unknown>) : null;
    chiamate.push({ metodo: req.method, path: pathname, body });
    const json = (dati: unknown, status = 200) =>
      new Response(JSON.stringify(dati), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (req.method === "POST" && pathname === "/session") return json({ id: "ses_1" });
    if (req.method === "DELETE") return json(true);
    if (req.method === "POST" && pathname === "/session/ses_1/message") {
      const v2 = Boolean(body?.format);
      if (v2 && scenario.v2 === "errore") return json({ message: "no" }, 400);
      if (v2 && scenario.v2 === "strutturata")
        return json({ info: { structured: { da: "v2" } }, parts: [] });
      return json({
        info: {},
        parts: [{ type: "text", text: scenario.testo ?? '```json\n{"da":"testo"}\n```' }],
      });
    }
    return json({}, 404);
  }) as unknown as typeof fetch;
  return { fetchImpl, chiamate };
}

describe("getOpencodeConfig", () => {
  it("usa muse-spark-1.3-contributor di opencode-go e api auto", () => {
    const c = getOpencodeConfig({});
    expect(c.providerID).toBe("opencode-go");
    expect(c.modelID).toBe("muse-spark-1.3-contributor");
    expect(c.api).toBe("auto");
  });

  it("rispetta le opzioni esplicite", () => {
    const c = getOpencodeConfig({ url: URL_OC, model: "opencode-go/glm-5.3", api: "v1" });
    expect(c).toMatchObject({
      url: URL_OC,
      providerID: "opencode-go",
      modelID: "glm-5.3",
      api: "v1",
    });
  });
});

describe("chiediJSON", () => {
  it("nessuna chiamata con l'AI spenta", async () => {
    const { fetchImpl } = fintoOpencode();
    expect(await chiediJSON("s", "u", { disattivata: true, url: URL_OC, fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("v2: usa l'output strutturato con lo schema", async () => {
    const { fetchImpl, chiamate } = fintoOpencode({ v2: "strutturata" });
    const schema = { type: "object" };
    const r = await chiediJSON("s", "u", { url: URL_OC, api: "v2", schema, fetchImpl });
    expect(r).toEqual({ da: "v2" });
    const prompt = chiamate.find((c) => c.path.endsWith("/message"));
    expect(prompt?.body?.format).toEqual({ type: "json_schema", schema, retryCount: 1 });
    expect(prompt?.body?.model).toEqual({
      providerID: "opencode-go",
      modelID: "muse-spark-1.3-contributor",
    });
  });

  it("v1: estrae il JSON dal testo, anche dentro ```json", async () => {
    const { fetchImpl, chiamate } = fintoOpencode();
    const r = await chiediJSON("s", "u", {
      url: URL_OC,
      api: "v1",
      schema: { type: "object" },
      fetchImpl,
    });
    expect(r).toEqual({ da: "testo" });
    expect(chiamate.find((c) => c.path.endsWith("/message"))?.body?.format).toBeUndefined();
  });

  it("v2: se il modello rifiuta lo schema ripiega sul testo, sempre in v2", async () => {
    const { fetchImpl, chiamate } = fintoOpencode({ v2: "errore" });
    const r = await chiediJSON("s", "u", {
      url: URL_OC,
      api: "v2",
      model: "opencode-go/muse-x",
      schema: { type: "object" },
      fetchImpl,
    });
    expect(r).toEqual({ da: "testo" });
    const prompt = chiamate.filter((c) => c.path.endsWith("/message"));
    expect(prompt.map((c) => Boolean(c.body?.format))).toEqual([true, false]);
  });

  it("auto: risponde anche se lo schema fallisce", async () => {
    const { fetchImpl } = fintoOpencode({ v2: "errore" });
    const r = await chiediJSON("s", "u", { url: URL_OC, schema: { type: "object" }, fetchImpl });
    expect(r).toEqual({ da: "testo" });
  });

  it("null se la risposta non contiene JSON", async () => {
    const { fetchImpl } = fintoOpencode({ testo: "non so" });
    expect(await chiediJSON("s", "u", { url: URL_OC, api: "v1", fetchImpl })).toBeNull();
  });

  it("chiude sempre la sessione", async () => {
    const { fetchImpl, chiamate } = fintoOpencode({ v2: "strutturata" });
    await chiediJSON("s", "u", { url: URL_OC, api: "v2", fetchImpl });
    await new Promise((r) => setTimeout(r, 0));
    expect(chiamate.some((c) => c.metodo === "DELETE" && c.path === "/session/ses_1")).toBe(true);
  });
});
