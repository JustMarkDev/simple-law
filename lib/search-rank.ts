/**
 * Ranking testuale per la ricerca norme (BM25-lite + normalizzazione italiana).
 *
 * Contratto never-throw: nessuna funzione di questo modulo lancia, nemmeno con
 * input imprevisti (`null`, `undefined`, oggetti malformati). In caso di errore
 * interno si restituisce un fallback sicuro (stringa vuota, punteggio 0,
 * lista invariata).
 *
 * Pesi di campo: titolo x3 > sintesi x2 > numero x1.5 > tipo x1.
 * Le frasi tra virgolette (`"..."`, `"..."`, `«...»`) danno un bonus da frase esatta.
 * Le query con meno di 2 caratteri non vengono rankate (fallback ILIKE nel DB).
 */

/** Elemento minimo rankabile (sottoinsieme di `LawRecord`). */
export interface ElementoRankabile {
  titolo?: unknown;
  sintesi?: unknown;
  numero?: unknown;
  tipo?: unknown;
  nir?: unknown;
  eli?: unknown;
  stato?: unknown;
}

/** Stopword italiane rimosse in fase di tokenizzazione (non nella normalizzazione base). */
const STOPWORD_IT: ReadonlySet<string> = new Set([
  "di",
  "a",
  "da",
  "in",
  "con",
  "su",
  "per",
  "tra",
  "fra",
  "il",
  "lo",
  "la",
  "i",
  "gli",
  "le",
  "un",
  "uno",
  "una",
  "che",
  "come",
  "anche",
  "non",
  "piu",
  "puo",
  "sono",
  "era",
  "erano",
  "stato",
  "stata",
  "stati",
  "state",
  "essere",
  "avere",
  "hanno",
  "questo",
  "questa",
  "questi",
  "queste",
  "quello",
  "quella",
  "quelli",
  "quelle",
  "della",
  "dello",
  "degli",
  "delle",
  "alla",
  "allo",
  "alla",
  "della",
  "alla",
  "allo",
  "nello",
  "nella",
  "negli",
  "nelle",
  "sullo",
  "sulla",
  "sugli",
  "sulle",
  "dallo",
  "dalla",
  "dagli",
  "dalle",
  "della",
  "dello",
  "alla",
  "allo",
  "dal",
  "del",
  "dei",
  "della",
  "alla",
  "al",
  "alla",
  "ai",
  "alla",
  "sul",
  "sui",
  "mio",
  "mia",
  "miei",
  "mie",
  "tuo",
  "tua",
  "tuoi",
  "tue",
  "suo",
  "sua",
  "suoi",
  "sue",
  "nostro",
  "nostra",
  "nostri",
  "nostre",
  "vostro",
  "vostra",
  "vostri",
  "vostre",
  "loro",
  "molto",
  "tutto",
  "tutti",
  "tutte",
  "ogni",
  "sempre",
  "solo",
  "gia",
  "dopo",
  "prima",
  "quando",
  "dove",
  "quale",
  "quali",
  "quanto",
  "quanta",
  "quest",
  "quell",
  "dell",
  "all",
  "dall",
  "nell",
  "sull",
  "ed",
  "od",
  "ma",
  "se",
  "oppure",
  "quindi",
  "perche",
  "poiche",
  "legge",
  "decreto",
]);

/** Suffissi italiani per lo stemming leggero (ordine: piu' lungo prima). */
const SUFFISSI_STEM: readonly string[] = [
  "zione",
  "zioni",
  "tore",
  "trice",
  "mente",
  "mento",
  "menti",
  "abile",
  "abili",
  "ibile",
  "ibili",
  "ismo",
  "ismi",
  "ista",
  "iste",
  "isti",
  "ita",
  "oso",
  "osa",
  "osi",
  "ose",
  "ico",
  "ica",
  "ici",
  "iche",
  "ale",
  "ali",
  "are",
  "ere",
  "ire",
  "ato",
  "ata",
  "ati",
  "ate",
  "ito",
  "ita",
  "iti",
  "ite",
  "uto",
  "uta",
  "uti",
  "ute",
];

/** Pesi di campo: titolo > sintesi > numero > tipo. */
const PESO_TITOLO = 3;
const PESO_SINTESI = 2;
const PESO_NUMERO = 1.5;
const PESO_TIPO = 1;

/** Parametri BM25-lite. */
const BM25_K1 = 1.2;
const BM25_B = 0.75;

/** Bonus frase esatta: nel titolo vale di piu' che altrove. */
const BONUS_FRASE_TITOLO = 6;
const BONUS_FRASE_ALTROVE = 3;

/**
 * Normalizzazione italiana di base: minuscole, NFD senza diacritici,
 * spazi compattati. Non rimuove stopword né applica stemming (vedi
 * `tokenizzaIT`): cosi' il confronto per frasi esatte resta fedele.
 * Non lancia mai.
 */
export function normalizeIT(testo: unknown): string {
  try {
    const grezzo = typeof testo === "string" ? testo : String(testo ?? "");
    return grezzo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);
  } catch {
    return "";
  }
}

/** Stemming leggero italiano: rimuove un solo suffisso noto (minimo 3 lettere residue). Non lancia. */
export function stemIT(parola: unknown): string {
  try {
    const p = normalizeIT(parola).replace(/\s+/g, "");
    if (!p || p.length <= 3) return p;
    for (const suffisso of SUFFISSI_STEM) {
      if (p.length - suffisso.length >= 3 && p.endsWith(suffisso)) {
        return p.slice(0, p.length - suffisso.length);
      }
    }
    // Plurali semplici in -i/-e per radici lunghe (es. "carburanti" -> "carburant").
    if (p.length > 5 && (p.endsWith("i") || p.endsWith("e"))) {
      return p.slice(0, -1);
    }
    return p;
  } catch {
    return "";
  }
}

/**
 * Tokenizza applicando normalizzazione + rimozione stopword + stemming leggero.
 * Token <2 caratteri scartati, massimo 32 token. Non lancia mai.
 */
export function tokenizzaIT(testo: unknown): string[] {
  try {
    const normalizzato = normalizeIT(testo);
    if (!normalizzato) return [];
    const grezzi = normalizzato.split(" ").filter((t) => t.length >= 2);
    const out: string[] = [];
    for (const grezzo of grezzi) {
      if (STOPWORD_IT.has(grezzo)) continue;
      const radice = stemIT(grezzo);
      if (radice && radice.length >= 2) out.push(radice);
      if (out.length >= 32) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Frasi tra virgolette (`"..."`, `"..."`, `«...»`) estratte dalla query. Non lancia. */
export function estraiFrasi(query: unknown): string[] {
  try {
    const q = typeof query === "string" ? query : String(query ?? "");
    const frasi: string[] = [];
    const pattern = /"([^"]{1,200})"|“([^”]{1,200})”|«([^»]{1,200})»/g;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(q)) !== null) {
      const frase = (m[1] ?? m[2] ?? m[3] ?? "").trim();
      if (frase) frasi.push(frase.slice(0, 200));
      if (frasi.length >= 4) break;
    }
    return frasi;
  } catch {
    return [];
  }
}

function campoTesto(item: ElementoRankabile, campo: keyof ElementoRankabile): string {
  try {
    const v = item?.[campo];
    if (typeof v === "string") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return "";
  } catch {
    return "";
  }
}

/** Testo normalizzato completo di un atto (per match di frase esatta). Non lancia. */
export function testoNormalizzatoAtto(item: ElementoRankabile): string {
  try {
    if (!item || typeof item !== "object") return "";
    return normalizeIT(
      `${campoTesto(item, "titolo")} ${campoTesto(item, "sintesi")} ${campoTesto(item, "numero")} ${campoTesto(item, "tipo")}`,
    );
  } catch {
    return "";
  }
}

function frequenza(token: string, tokenCampo: string[]): number {
  let n = 0;
  for (const t of tokenCampo) if (t === token) n += 1;
  return n;
}

function bm25(tf: number, lunghezzaCampo: number, lunghezzaMedia: number): number {
  if (tf <= 0) return 0;
  const media = lunghezzaMedia > 0 ? lunghezzaMedia : 1;
  const len = Math.max(1, lunghezzaCampo);
  return (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (len / media)));
}

/**
 * Punteggio BM25-lite di un atto per i token della query.
 * Somma tf-idf pesata per campo (titolo^3, sintesi^2, numero, tipo) + bonus frasi.
 * Restituisce 0 se nessun match. Non lancia mai.
 */
export function scoreBM25Lite(
  item: ElementoRankabile,
  tokenQuery: readonly string[],
  opzioni?: {
    idf?: ReadonlyMap<string, number>;
    lunghezzaMedia?: number;
    frasi?: readonly string[];
  },
): number {
  try {
    if (!item || typeof item !== "object") return 0;
    const tokens = (tokenQuery ?? []).filter((t) => typeof t === "string" && t);
    if (tokens.length === 0 && !opzioni?.frasi?.length) return 0;

    const titoloT = tokenizzaIT(campoTesto(item, "titolo"));
    const sintesiT = tokenizzaIT(campoTesto(item, "sintesi"));
    const numeroT = tokenizzaIT(campoTesto(item, "numero"));
    const tipoT = tokenizzaIT(campoTesto(item, "tipo"));
    const lunghezzaDoc =
      titoloT.length * PESO_TITOLO + sintesiT.length * PESO_SINTESI + numeroT.length + tipoT.length;
    const media =
      opzioni?.lunghezzaMedia && opzioni.lunghezzaMedia > 0
        ? opzioni.lunghezzaMedia
        : Math.max(1, lunghezzaDoc);

    let punteggio = 0;
    for (const token of tokens) {
      const idf = opzioni?.idf?.get(token) ?? 1;
      const s =
        PESO_TITOLO * bm25(frequenza(token, titoloT), Math.max(1, titoloT.length), media) +
        PESO_SINTESI * bm25(frequenza(token, sintesiT), Math.max(1, sintesiT.length), media) +
        PESO_NUMERO * bm25(frequenza(token, numeroT), Math.max(1, numeroT.length), media) +
        PESO_TIPO * bm25(frequenza(token, tipoT), Math.max(1, tipoT.length), media);
      punteggio += idf * s;
    }

    const frasi = opzioni?.frasi ?? [];
    if (frasi.length > 0) {
      const testoAtto = testoNormalizzatoAtto(item);
      const titoloNorm = normalizeIT(campoTesto(item, "titolo"));
      for (const frase of frasi) {
        const f = normalizeIT(frase);
        if (!f) continue;
        if (testoAtto.includes(f)) {
          punteggio += BONUS_FRASE_ALTROVE + f.split(" ").length;
          if (titoloNorm.includes(f)) punteggio += BONUS_FRASE_TITOLO;
        }
      }
    }
    return Number.isFinite(punteggio) ? punteggio : 0;
  } catch {
    return 0;
  }
}

/** Calcola le idf BM25 (`log((N-df+0.5)/(df+0.5)+1)`) sui token della query. Non lancia. */
export function calcolaIdf<T extends ElementoRankabile>(
  items: readonly T[],
  tokenQuery: readonly string[],
): Map<string, number> {
  const idf = new Map<string, number>();
  try {
    const n = items.length;
    for (const token of tokenQuery) {
      let df = 0;
      for (const item of items) {
        try {
          const corpus = new Set([
            ...tokenizzaIT(campoTesto(item, "titolo")),
            ...tokenizzaIT(campoTesto(item, "sintesi")),
            ...tokenizzaIT(campoTesto(item, "numero")),
            ...tokenizzaIT(campoTesto(item, "tipo")),
          ]);
          if (corpus.has(token)) df += 1;
        } catch {
          // salta il singolo atto malformato
        }
      }
      idf.set(token, Math.log((n - df + 0.5) / (df + 0.5) + 1));
    }
  } catch {
    // fallback: idf vuota (pesi unitari)
  }
  return idf;
}

/**
 * Filtra e ordina per rilevanza (pura: non muta `items`).
 * - Query vuota o <2 caratteri: restituisce copia invariata (fallback ILIKE nel DB).
 * - Altrimenti: tiene solo gli atti con punteggio > 0, ordinati per punteggio
 *   decrescente (a pari punteggio vale l'ordine originale). Non lancia mai.
 */
export function rankAndFilter<T extends ElementoRankabile>(items: readonly T[], q: unknown): T[] {
  try {
    if (!Array.isArray(items)) return [];
    const query = typeof q === "string" ? q : String(q ?? "");
    if (query.trim().length < 2) return [...items];
    const frasi = estraiFrasi(query);
    const senzaFrasi = query.replace(/"[^"]*"|“[^”]*”|«[^»]*»/g, " ");
    const tokens = tokenizzaIT(senzaFrasi.slice(0, 200));
    const frasiToken = frasi.flatMap((f) => tokenizzaIT(f));
    const tuttiToken = [...new Set([...tokens, ...frasiToken])];
    if (tuttiToken.length === 0 && frasi.length === 0) return [...items];

    const idf = calcolaIdf(items, tuttiToken);
    let sommaLen = 0;
    let conta = 0;
    for (const item of items) {
      try {
        sommaLen +=
          tokenizzaIT(campoTesto(item, "titolo")).length * PESO_TITOLO +
          tokenizzaIT(campoTesto(item, "sintesi")).length * PESO_SINTESI +
          tokenizzaIT(campoTesto(item, "numero")).length +
          tokenizzaIT(campoTesto(item, "tipo")).length;
        conta += 1;
      } catch {
        // ignora
      }
    }
    const media = conta > 0 ? sommaLen / conta : 1;

    const punteggi: { item: T; indice: number; punteggio: number }[] = [];
    items.forEach((item, indice) => {
      const p = scoreBM25Lite(item, tuttiToken, { idf, lunghezzaMedia: media, frasi });
      if (p > 0) punteggi.push({ item, indice, punteggio: p });
    });
    punteggi.sort((a, b) => b.punteggio - a.punteggio || a.indice - b.indice);
    return punteggi.map((p) => p.item);
  } catch {
    try {
      return Array.isArray(items) ? [...items] : [];
    } catch {
      return [];
    }
  }
}

function escapeHtml(testo: string): string {
  return testo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Classe accent-insensitive per una lettera (es. `e` -> `[eèéêë]`). */
function classeAccenti(carattere: string): string {
  switch (carattere) {
    case "a":
      return "[aàáâãäå]";
    case "e":
      return "[eèéêë]";
    case "i":
      return "[iìíîï]";
    case "o":
      return "[oòóôõö]";
    case "u":
      return "[uùúûü]";
    case "c":
      return "[cç]";
    case "n":
      return "[nñ]";
    default:
      return carattere.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}

/**
 * Evidenzia i match della query in un testo con `<mark>`, preservando gli
 * accenti originali (match accent-insensitive) ed escapando l'HTML.
 * Al massimo 8 token/frasi, 64 sostituzioni. Non lancia mai.
 */
export function highlightMatches(testo: unknown, q: unknown): string {
  try {
    const originale = typeof testo === "string" ? testo : String(testo ?? "");
    if (!originale) return "";
    const query = typeof q === "string" ? q : String(q ?? "");
    if (query.trim().length < 2) return escapeHtml(originale);

    const frasi = estraiFrasi(query).slice(0, 4);
    const senzaFrasi = query.replace(/"[^"]*"|“[^”]*”|«[^»]*»/g, " ");
    const tokens = normalizeIT(senzaFrasi.slice(0, 200))
      .split(" ")
      .filter((t) => t.length >= 2 && !STOPWORD_IT.has(t))
      .slice(0, 8);
    const termini = [...frasi.map((f) => normalizeIT(f)), ...tokens]
      .filter((t) => t.length >= 2)
      .sort((a, b) => b.length - a.length)
      .slice(0, 8);
    const sicuro = escapeHtml(originale);
    if (termini.length === 0) return sicuro;

    const pattern = termini
      .map((t) =>
        t
          .split("")
          .map((c) =>
            c >= "a" && c <= "z" ? classeAccenti(c) : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          )
          .join(""),
      )
      .join("|");
    let sostituzioni = 0;
    return sicuro.replace(new RegExp(`(${pattern})`, "gi"), (m) => {
      sostituzioni += 1;
      if (sostituzioni > 64) return m;
      return `<mark>${m}</mark>`;
    });
  } catch {
    try {
      return escapeHtml(typeof testo === "string" ? testo : String(testo ?? ""));
    } catch {
      return "";
    }
  }
}
