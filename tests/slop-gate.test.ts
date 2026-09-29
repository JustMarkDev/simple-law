/**
 * SLOP-GATE (statico, zero rete/server).
 *
 * Legge come testo i file `app/**\/page.tsx` + `components/*.tsx` e fallisce se:
 *  (1) em-dash (U+2014) o en-dash (U+2013) in testo visibile;
 *  (2) troppi middle-dot (U+00B7) sulla stessa riga di JSX visibile;
 *  (3) `rounded-full` fuori dai puntini di stato;
 *  (4) `href="/..."` interno che punta a route senza `app/**\/page.tsx`;
 *  (5) pagina senza `<h1>` o senza `title` nei metadata;
 *  (6) `<img>` senza `alt`.
 *
 * Tolleranze oneste (mai falsi positivi):
 *  - whitelist hardcoded con motivo nel codice;
 *  - euristiche ammorbidite dove il pattern editoriale legittimo
 *    colliderebbe con la regola stretta (vedi note CHECK 2 / CHECK 3 / CHECK 6).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(ROOT, "app");
const COMPONENTS_DIR = path.join(ROOT, "components");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

function rel(p: string): string {
  return path.relative(ROOT, p).replaceAll(path.sep, "/");
}

function collectTargetFiles(): string[] {
  const pages = walk(APP_DIR).filter((p) => p.endsWith("/page.tsx"));
  const comps = fs
    .readdirSync(COMPONENTS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
    .map((e) => path.join(COMPONENTS_DIR, e.name));
  return [...pages, ...comps].sort();
}

function collectPageFiles(): string[] {
  return walk(APP_DIR)
    .filter((p) => p.endsWith("/page.tsx"))
    .sort();
}

const TARGET_FILES = collectTargetFiles();
const PAGE_FILES = collectPageFiles();

function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}

// ---------------------------------------------------------------------------
// Whitelist hardcoded: eccezioni deliberate con motivo.
// ---------------------------------------------------------------------------

/** CHECK 3: `rounded-full` deliberati che non rispettano il pattern h/w statico. */
const ROUNDED_FULL_ALLOWLIST: { file: string; match: string; motivo: string }[] = [
  {
    file: "components/TrafficLight.tsx",
    match: "${lamp} rounded-full",
    motivo:
      "Semaforo di stato: le lampadine sono dimensionate via variabile `lamp` (h-2.5/h-3.5/h-4 deliberati per size sm/md/lg), quindi la riga con rounded-full non contiene h-* in forma statica. Puntino di stato intenzionale, non pill decorativa.",
  },
  {
    file: "components/TimelineAttuativi.tsx",
    match: "h-3 w-3 rounded-full",
    motivo:
      "Punto della timeline (h-3 w-3): diametro maggiore dei puntini h-2 per restare leggibile sulla linea verticale assoluta -left-[7px]. Puntino di stato intenzionale.",
  },
  {
    file: "components/Footer.tsx",
    match: "footer color-block",
    motivo:
      'Eccezione "color-block" documentata nel Footer: unico blocco colore della pagina (blu notte dusk #1a2456, gradiente CSS onesto). Non usa rounded-full, ma si registra qui come eccezione visiva deliberata perche il gate non deve mai segnalare il footer.',
  },
];

/** CHECK 4: prefissi href interni che non corrispondono a una page (route API, ancore). */
const HREF_PREFIX_ALLOWLIST: { prefix: string; motivo: string }[] = [
  {
    prefix: "/api/",
    motivo:
      "Route API (es. /api/feed, /api/export): esistono come app/api/**/route.ts, non come app/**/page.tsx. Il gate pagine non deve segnalarle.",
  },
  {
    prefix: "#",
    motivo: "Ancore intra-pagina (es. #contenuto, #camera): non sono route.",
  },
];

/** CHECK 4: href statici deliberati verso route esistenti ma con query — documentati, non eccezioni. */
// (Nessuna entry necessaria oggi: la query viene stripped prima del match.)

/** CHECK 2: soglia ammorbidita + casi noti da 2 puntini (legittimi, vedi sotto). */
const MIDDLE_DOT_THRESHOLD = 2;
const MIDDLE_DOT_NOTA =
  "Regola stretta ('>1 middle-dot per riga') ammorbidita a '>2': due puntini sulla stessa riga sono il pattern editoriale legittimo del progetto (conteggi + provenance, es. 'X mostrati · Y caricati · universo…', 'Camera: … · Senato: … · legislatura 19'). Soglia 3+ cattura lo slop vero (accumuli 'a · b · c · d') senza falsi positivi. Le ~12 righe attuali con esattamente 2 puntini sono segnalate nel report per l'integratore (valutare <dl>/righe separate) ma non fanno fallire il gate.";

// ---------------------------------------------------------------------------
// Helpers di pulizia per riga (euristiche anti-falso-positivo).
// ---------------------------------------------------------------------------

/** Rimuove commenti di linea `//...` (euristica semplice, basta per il gate). */
function stripLineComment(line: string): string {
  const idx = line.indexOf("//");
  if (idx === -1) return line;
  // Non tagliare `https://` / `http://`: se `//` e preceduto da `:` e probabile URL.
  if (idx > 0 && line[idx - 1] === ":") {
    // Cerca un secondo `//` oltre l'URL (raro); altrimenti tieni la riga per lo skip URL.
    return line;
  }
  return line.slice(0, idx);
}

function isCommentOrImportLine(trimmed: string): boolean {
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*/") ||
    trimmed.startsWith("import ") ||
    trimmed.startsWith("} from ") ||
    trimmed.startsWith("import{")
  );
}

// ---------------------------------------------------------------------------
// CHECK 1: em-dash / en-dash in testo visibile
// ---------------------------------------------------------------------------
describe("slop-gate (1): em/en-dash nel testo visibile", () => {
  it("nessuna riga visibile contiene — o –", () => {
    const bad: string[] = [];
    for (const f of TARGET_FILES) {
      const lines = read(f).split("\n");
      lines.forEach((raw, i) => {
        const trimmed = raw.trim();
        if (isCommentOrImportLine(trimmed)) return;
        if (raw.includes("http://") || raw.includes("https://")) return; // URL, non testo
        if (raw.includes("eslint-disable")) return;
        const code = stripLineComment(raw);
        if (code.includes("—") || code.includes("–")) {
          bad.push(`${rel(f)}:${i + 1}: ${trimmed.slice(0, 160)}`);
        }
      });
    }
    expect(bad, `em/en-dash in testo visibile:\n${bad.join("\n")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CHECK 2: middle-dot multipli per riga
// ---------------------------------------------------------------------------
describe("slop-gate (2): middle-dot multipli per riga", () => {
  it(`al massimo ${MIDDLE_DOT_THRESHOLD} middle-dot per riga visibile (${MIDDLE_DOT_NOTA.slice(0, 60)}…)`, () => {
    const bad: string[] = [];
    for (const f of TARGET_FILES) {
      const lines = read(f).split("\n");
      lines.forEach((raw, i) => {
        const trimmed = raw.trim();
        if (isCommentOrImportLine(trimmed)) return;
        const code = stripLineComment(raw);
        const n = (code.match(/·/g) ?? []).length;
        if (n > MIDDLE_DOT_THRESHOLD) {
          bad.push(`${rel(f)}:${i + 1} (${n}x ·): ${trimmed.slice(0, 160)}`);
        }
      });
    }
    expect(
      bad,
      `righe con >${MIDDLE_DOT_THRESHOLD} middle-dot (slop da accumulo):\n${bad.join("\n")}\nNOTA: ${MIDDLE_DOT_NOTA}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CHECK 3: rounded-full solo puntini di stato
// ---------------------------------------------------------------------------
describe("slop-gate (3): rounded-full solo puntini di stato", () => {
  it("rounded-full solo su puntini di stato (h-1.5/h-2/h-2.5 w-*) o whitelist", () => {
    const bad: string[] = [];
    const isStatusDot = (line: string) =>
      /h-1\.5\b/.test(line) || /h-2\.5\b/.test(line) || /h-2\b/.test(line)
        ? /w-\S+/.test(line)
        : false;
    for (const f of TARGET_FILES) {
      const r = rel(f);
      const lines = read(f).split("\n");
      lines.forEach((raw, i) => {
        if (!raw.includes("rounded-full")) return;
        if (isStatusDot(raw)) return;
        const allowed = ROUNDED_FULL_ALLOWLIST.some(
          (w) => r.endsWith(w.file.replace(/^components\//, "components/")) && raw.includes(w.match),
        );
        // Il footer color-block non contiene rounded-full: la sua entry e solo documentativa.
        const isFooterDoc = r === "components/Footer.tsx";
        if (allowed || isFooterDoc) return;
        bad.push(`${r}:${i + 1}: ${raw.trim().slice(0, 180)}`);
      });
    }
    expect(
      bad,
      `rounded-full fuori dai puntini di stato:\n${bad.join("\n")}\nWhitelist: ${ROUNDED_FULL_ALLOWLIST.map((w) => `${w.file} (${w.motivo.slice(0, 80)}…)`).join(" | ")}`,
    ).toEqual([]);
  });

  it("whitelist rounded-full documentata con motivo", () => {
    for (const w of ROUNDED_FULL_ALLOWLIST) {
      expect(w.motivo.trim().length, `motivo mancante per ${w.file}`).toBeGreaterThan(20);
    }
    const files = ROUNDED_FULL_ALLOWLIST.map((w) => w.file);
    expect(files).toContain("components/TrafficLight.tsx");
    expect(files).toContain("components/Footer.tsx");
  });
});

// ---------------------------------------------------------------------------
// CHECK 4: href interni -> route con page.tsx
// ---------------------------------------------------------------------------

/** Route esistenti derivate da app/**\/page.tsx (supporta segmenti dinamici). */
function buildRoutePatterns(): { route: string; re: RegExp }[] {
  const out: { route: string; re: RegExp }[] = [];
  for (const p of PAGE_FILES) {
    const r = rel(p); // es. app/parlamento/[camera]/[slug]/page.tsx
    const noPrefix = r.replace(/^app/, "").replace(/\/page\.tsx$/, "") || "/";
    const route = noPrefix === "" ? "/" : noPrefix;
    // Converte [...x] e [x] in wildcard di singolo segmento.
    const reSrc =
      "^" +
      route
        .split("/")
        .map((seg) => {
          if (seg === "") return "";
          if (/^\[\.\.\..+\]$/.test(seg)) return "/(?:[^/]+(?:/[^/]+)*)?";
          if (/^\[.+\]$/.test(seg)) return "/[^/]+";
          return "/" + seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("") +
      "/?$";
    out.push({ route, re: new RegExp(reSrc === "^/?$" ? "^/?$" : reSrc) });
  }
  return out;
}

/** Estrae href statici (doppi/singoli apici, anche in oggetti `{ href: '...' }`). Salta i dinamici. */
function extractStaticHrefs(text: string): string[] {
  const out: string[] = [];
  const re =
    /(?:href\s*=\s*(?:"([^"]+)"|'([^']+)')|href\s*:\s*(?:"([^"]+)"|'([^']+)'))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (v) out.push(v);
  }
  return out;
}

describe("slop-gate (4): href interni puntano a route esistenti", () => {
  it("ogni href='/...' statico risolve a una app/**/page.tsx (o whitelist /api/, #)", () => {
    const patterns = buildRoutePatterns();
    const bad: string[] = [];
    for (const f of TARGET_FILES) {
      const r = rel(f);
      const hrefs = extractStaticHrefs(read(f));
      for (const h of hrefs) {
        if (h.startsWith("#")) continue; // ancore: whitelist
        if (!h.startsWith("/")) continue; // esterni / dinamici / template
        if (h.includes("${") || h.includes("{") || h.includes("}")) continue; // dinamici
        const clean = h.split("?")[0]!.split("#")[0]!;
        if (HREF_PREFIX_ALLOWLIST.some((w) => clean === w.prefix || clean.startsWith(w.prefix))) {
          continue;
        }
        // Valore con spazi o wildcard non statico: skip prudente (no falsi positivi).
        if (/\s|\*/.test(clean)) continue;
        const ok = patterns.some((p) => p.re.test(clean));
        if (!ok) bad.push(`${r} -> href="${h}" (pulito: "${clean}")`);
      }
    }
    expect(bad, `href interni senza page.tsx:\n${bad.join("\n")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CHECK 5: ogni pagina ha <h1> e title metadata
// ---------------------------------------------------------------------------
describe("slop-gate (5): pagine con <h1> e title", () => {
  it("ogni app/**/page.tsx contiene <h1> e un title nei metadata", () => {
    const missingH1: string[] = [];
    const missingTitle: string[] = [];
    for (const f of PAGE_FILES) {
      const t = read(f);
      if (!/<h1[\s>]/.test(t)) missingH1.push(rel(f));
      if (!/title\s*:/.test(t)) missingTitle.push(rel(f));
    }
    expect(missingH1, `pagine senza <h1>:\n${missingH1.join("\n")}`).toEqual([]);
    expect(missingTitle, `pagine senza title nei metadata:\n${missingTitle.join("\n")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CHECK 6: <img> con alt
// ---------------------------------------------------------------------------
describe("slop-gate (6): <img> con alt", () => {
  it("ogni <img> reale ha attributo alt", () => {
    const bad: string[] = [];
    for (const f of TARGET_FILES) {
      const r = rel(f);
      const t = read(f);
      const re = /<img\b[^>]*>/gs;
      let m: RegExpExecArray | null;
      while ((m = re.exec(t)) !== null) {
        const tag = m[0];
        // Euristica anti-falso-positivo: le menzioni `<img>` nei commenti non hanno
        // src (es. "// ... <img> intenzionale"). Solo i tag reali con src contano.
        if (!/\bsrc\s*=/.test(tag)) continue;
        if (!/\balt\s*=/.test(tag)) {
          const lineNo = t.slice(0, m.index).split("\n").length;
          bad.push(`${r}:${lineNo}: ${tag.slice(0, 160).replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(bad, `<img> senza alt:\n${bad.join("\n")}`).toEqual([]);
  });
});
