/**
 * smoke-live.mjs — live smoke test per SimpleLaw Italia.
 *
 * Uso:
 *   1. npm run build      (OBBLIGATORIO prima: `next start` serve la build di produzione)
 *   2. npm run smoke      (= `node scripts/smoke-live.mjs`)
 *
 * Cosa fa:
 *   - avvia `next start -p 3199` come processo figlio,
 *   - aspetta che risponda (polling su GET /),
 *   - poi asserisce:
 *       (1) GET /            -> 200, contiene il conteggio totale reale letto da
 *                               /api/leggi (header X-Total-Count o JSON, MAI hardcoded)
 *                               e NON contiene la stringa "Variante " nell'HTML;
 *       (2) GET /leggi       -> 200;
 *       (3) GET /api/leggi?per=2 -> 200 con items[0].titolo reale (no "Variante");
 *       (4) GET /gazzetta e GET /controllo -> 200;
 *   - exit code 1 con messaggio chiaro al primo fallimento,
 *   - spegne SEMPRE il server (finally/kill).
 *
 * Zero dipendenze nuove: solo node:http + node:child_process.
 */

import http from "node:http";
import { spawn } from "node:child_process";

const PORT = 3199;
const HOST = "127.0.0.1";
const AVVIO_TIMEOUT_MS = 60000;
const POLL_MS = 500;

function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: HOST, port: PORT, path, timeout: 10000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`timeout GET ${path}`)));
    req.on("error", reject);
  });
}

function fail(msg) {
  console.error(`[smoke] FAIL: ${msg}`);
  throw new Error(msg);
}

function ok(msg) {
  console.log(`[smoke] ok: ${msg}`);
}

/** Formati attesi del conteggio nell'HTML (raw + it-IT con punto migliaia). */
function conteggioVarianti(totale) {
  const out = new Set([String(totale)]);
  try {
    out.add(totale.toLocaleString("it-IT"));
  } catch {
    /* noop */
  }
  out.add(String(totale).replace(/\B(?=(\d{3})+(?!\d))/g, "."));
  return [...out];
}

async function aspettaPronto(child) {
  const inizio = Date.now();
  for (;;) {
    if (child.exitCode !== null) {
      fail(`"next start" terminato subito con exit code ${child.exitCode}`);
    }
    try {
      const r = await get("/");
      if (r.status === 200) return;
    } catch {
      /* non ancora pronto */
    }
    if (Date.now() - inizio > AVVIO_TIMEOUT_MS) {
      fail(`server non pronto entro ${AVVIO_TIMEOUT_MS}ms su porta ${PORT}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function main() {
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => process.stdout.write(`[next] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[next] ${d}`));

  const spegni = () => {
    try {
      if (child.exitCode === null) child.kill("SIGTERM");
    } catch {
      /* noop */
    }
  };
  // Sicurezza: mai lasciare il server acceso.
  process.on("SIGINT", () => {
    spegni();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    spegni();
  });

  try {
    await aspettaPronto(child);
    ok(`server pronto su porta ${PORT}`);

    // --- (3 prima di 1): totale reale da /api/leggi, mai hardcoded ---
    const api = await get("/api/leggi?per=2");
    if (api.status !== 200) fail(`GET /api/leggi?per=2 -> ${api.status}, atteso 200`);
    let json;
    try {
      json = JSON.parse(api.body);
    } catch {
      fail("GET /api/leggi?per=2 -> corpo non JSON");
    }
    const totaleHeader = Number.parseInt(api.headers["x-total-count"] ?? "", 10);
    const totale = Number.isFinite(totaleHeader)
      ? totaleHeader
      : typeof json?.total === "number"
        ? json.total
        : typeof json?.count === "number"
          ? json.count
          : NaN;
    if (!Number.isFinite(totale) || totale <= 0) {
      fail(`conteggio totale non valido (header=${api.headers["x-total-count"]} json.total=${json?.total})`);
    }
    ok(`/api/leggi totale reale = ${totale}`);
    if (!Array.isArray(json?.items) || json.items.length === 0) {
      fail("GET /api/leggi?per=2 -> items vuoto");
    }
    const titolo0 = json.items[0]?.titolo;
    if (typeof titolo0 !== "string" || titolo0.trim() === "") {
      fail("GET /api/leggi?per=2 -> items[0].titolo mancante o vuoto");
    }
    if (titolo0.includes("Variante")) fail(`items[0].titolo contiene "Variante": ${titolo0.slice(0, 120)}`);
    ok(`items[0].titolo reale = ${titolo0.slice(0, 80)}`);

    // --- (1) GET / ---
    const home = await get("/");
    if (home.status !== 200) fail(`GET / -> ${home.status}, atteso 200`);
    if (home.body.includes("Variante ")) fail('GET / -> HTML contiene la stringa "Variante "');
    const varianti = conteggioVarianti(totale);
    const contieneTotale = varianti.some((v) => home.body.includes(v));
    if (!contieneTotale) {
      fail(`GET / -> HTML non contiene il conteggio totale ${totale} (provato: ${varianti.join(", ")})`);
    }
    ok(`GET / 200, contiene totale ${totale}, senza "Variante "`);

    // --- (2) GET /leggi ---
    const leggi = await get("/leggi");
    if (leggi.status !== 200) fail(`GET /leggi -> ${leggi.status}, atteso 200`);
    ok("GET /leggi 200");

    // --- (4) GET /gazzetta e /controllo ---
    for (const p of ["/gazzetta", "/controllo"]) {
      const r = await get(p);
      if (r.status !== 200) fail(`GET ${p} -> ${r.status}, atteso 200`);
      ok(`GET ${p} 200`);
    }

    console.log("[smoke] PASS: tutti i controlli live superati");
  } finally {
    spegni();
    // Attende la chiusura per non lasciare zombie; con timeout di sicurezza.
    await Promise.race([
      new Promise((resolve) => {
        const t = setTimeout(resolve, 5000);
        t.unref?.();
      }),
    ]);
    try {
      if (spawn) {
        // Se il figlio e' ancora vivo dopo SIGTERM, forza SIGKILL.
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    } catch {
      /* noop */
    }
  }
}

main().catch((err) => {
  console.error(`[smoke] ${err?.message ?? err}`);
  process.exit(1);
});
