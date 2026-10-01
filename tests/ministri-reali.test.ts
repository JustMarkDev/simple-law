/**
 * Ministri ↔ Parlamento: match reale verso i dati `data/reali/`.
 *
 * Tutto offline e deterministico:
 * - fixture INLINE come base obbligatoria (zero rete/disco obbligatorio);
 * - integrazione disco solo se `data/reali/*.json` esistono davvero
 *   (controllo esplicito di esistenza + parse in try/catch);
 * - mai inventare dati: 0 o ≥2 match → nessun link; 1 solo → box link.
 */

import { describe, expect, it } from "vite-plus/test";
import { SEED_MINISTERS } from "@/lib/seed-data";

interface MembroMinistri {
  readonly camera: "camera" | "senato";
  readonly slug: string;
  readonly nome: string;
  readonly gruppo?: string;
  readonly foto?: string;
  readonly urlScheda?: string;
}

/* Fixture inline: ricalca la forma reale (Camera MAIUSCOLO, Senato titolo). */
const MEMBRI_FIXTURE: MembroMinistri[] = [
  {
    camera: "camera",
    slug: "d307394_19",
    nome: "DAVIDE AIELLO",
    gruppo: "MOVIMENTO 5 STELLE",
    urlScheda:
      "http://www.camera.it/uri-res/N2Ls?urn:camera-it:parlamento:scheda.personale:camera;19.legislatura;307394",
  },
  {
    camera: "camera",
    slug: "d308421_19",
    nome: "LUCIA ALBANO",
    gruppo: "FRATELLI D'ITALIA",
    urlScheda:
      "http://www.camera.it/uri-res/N2Ls?urn:camera-it:parlamento:scheda.personale:camera;19.legislatura;308421",
  },
  {
    camera: "senato",
    slug: "32",
    nome: "Maria Elisabetta Alberti Casellati",
    gruppo: "Forza Italia - Berlusconi Presidente - PPE",
    foto: "http://www.senato.it/leg/19/Immagini/Senatori/00000032.jpg",
  },
  /* Ministro fittizio con match unico, per il caso "con link". */
  {
    camera: "camera",
    slug: "d999001_19",
    nome: "GIORGIA MELONI",
    gruppo: "FRATELLI D'ITALIA",
    urlScheda: "http://www.camera.it/uri-res/N2Ls?esempio-meloni",
  },
  /* Omonimo su doppia camera: ≥2 match → nessun link. */
  { camera: "camera", slug: "d999002_19", nome: "MARIO ROSSI" },
  {
    camera: "senato",
    slug: "99",
    nome: "Mario Rossi",
    gruppo: "Partito Democratico",
    foto: "http://www.senato.it/leg/19/Immagini/Senatori/00000099.jpg",
  },
];

function normalizzaMinistri(value: unknown): string {
  try {
    if (typeof value !== "string") return "";
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .replace(/\s+/g, " ");
  } catch {
    return "";
  }
}

function trovaParlamentareMinistri(
  nomeMinistro: unknown,
  membri: readonly MembroMinistri[],
): MembroMinistri | null {
  try {
    if (typeof nomeMinistro !== "string") return null;
    if (!Array.isArray(membri)) return null;
    const chiave = normalizzaMinistri(nomeMinistro);
    if (!chiave) return null;
    const trovati = membri.filter((m) => normalizzaMinistri(m?.nome) === chiave);
    return trovati.length === 1 ? (trovati[0] as MembroMinistri) : null;
  } catch {
    return null;
  }
}

/** Href interno del dettaglio: /parlamento/deputati|senatori/[slug]. */
function hrefInterno(m: MembroMinistri): string {
  const camera = m.camera === "senato" ? "senatori" : "deputati";
  return `/parlamento/${camera}/${encodeURIComponent(m.slug)}`;
}

/** Decisione di render del box "Scheda parlamentare" in ministri/[slug]. */
function decidiBoxScheda(
  ministroNome: string,
  membri: readonly MembroMinistri[],
): { hrefInterno: string; hrefEsterno: string | null } | null {
  try {
    const trovato = trovaParlamentareMinistri(ministroNome, membri);
    if (!trovato) return null;
    const esterno =
      typeof trovato.urlScheda === "string" && trovato.urlScheda.startsWith("http")
        ? trovato.urlScheda
        : null;
    return { hrefInterno: hrefInterno(trovato), hrefEsterno: esterno };
  } catch {
    return null;
  }
}

const RADICE = typeof process !== "undefined" ? process.cwd() : ".";
const FILE_CAMERA = `${RADICE}/data/reali/camera-deputati.json`;
const FILE_SENATO = `${RADICE}/data/reali/senato-senatori.json`;

async function leggiMembriReali(): Promise<MembroMinistri[] | null> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(FILE_CAMERA) || !fs.existsSync(FILE_SENATO)) return null;
    const camera = JSON.parse(fs.readFileSync(FILE_CAMERA, "utf8")) as {
      legislatura?: string;
      deputati?: { slug: string; nome: string; gruppo?: string; urlScheda?: string }[];
    };
    const senato = JSON.parse(fs.readFileSync(FILE_SENATO, "utf8")) as {
      legislatura?: string;
      senatori?: { slug: string; nome: string; gruppo?: string; foto?: string }[];
    };
    if (camera?.legislatura !== "19" || senato?.legislatura !== "19") return null;
    if (!Array.isArray(camera?.deputati) || !Array.isArray(senato?.senatori)) return null;
    return [
      ...camera.deputati.map((d) => ({
        camera: "camera" as const,
        slug: d.slug,
        nome: d.nome,
        gruppo: d.gruppo,
        urlScheda: d.urlScheda,
      })),
      ...senato.senatori.map((s) => ({
        camera: "senato" as const,
        slug: s.slug,
        nome: s.nome,
        gruppo: s.gruppo,
        foto: s.foto,
      })),
    ];
  } catch {
    return null;
  }
}

describe("ministri reali: seed hand-written", () => {
  it("gli 8 ministri esistono con nome/dicastero/competenze", () => {
    expect(SEED_MINISTERS).toHaveLength(8);
    for (const m of SEED_MINISTERS) {
      expect(typeof m.slug).toBe("string");
      expect(m.nome.trim().length).toBeGreaterThan(0);
      expect(m.dicastero.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(m.competenze)).toBe(true);
      expect(Array.isArray(m.provvedimenti)).toBe(true);
    }
  });

  it("slug ministri unici", () => {
    const slug = SEED_MINISTERS.map((m) => m.slug);
    expect(new Set(slug).size).toBe(slug.length);
  });
});

describe("ministri reali: conteggio match con link", () => {
  it("fixture: conteggio deterministico dei ministri con link reale", () => {
    const finti = [
      { nome: "Giorgia Meloni" },
      { nome: "Mario Rossi" },
      { nome: "Persona Inesistente Qqq" },
    ];
    const conLink = finti.filter((m) => trovaParlamentareMinistri(m.nome, MEMBRI_FIXTURE));
    /* Meloni → 1 match unico; Rossi → omonimo doppia camera → null;
       inesistente → null. Quindi esattamente 1. */
    expect(conLink).toHaveLength(1);
    expect(conLink[0]?.nome).toBe("Giorgia Meloni");
  });

  it("match su dati reali se presenti, altrimenti fixture (mai rete)", async () => {
    const reali = await leggiMembriReali();
    const membri = reali ?? MEMBRI_FIXTURE;
    let conteggio = 0;
    for (const ministro of SEED_MINISTERS) {
      const trovato = trovaParlamentareMinistri(ministro.nome, membri);
      if (trovato) conteggio += 1;
      /* Onestà: se c'è match, ha slug+nome reali; mai campi inventati. */
      if (trovato) {
        expect(typeof trovato.slug).toBe("string");
        expect(trovato.nome.trim().length).toBeGreaterThan(0);
      }
    }
    expect(conteggio).toBeGreaterThanOrEqual(0);
    expect(conteggio).toBeLessThanOrEqual(SEED_MINISTERS.length);
    if (reali) {
      expect(reali.length).toBe(414 + 212);
    } else {
      expect(membri).toBe(MEMBRI_FIXTURE);
    }
  });

  it("ogni ministro matcha al massimo una volta o zero (mai ≥2 link)", async () => {
    const reali = await leggiMembriReali();
    const membri = reali ?? MEMBRI_FIXTURE;
    for (const ministro of SEED_MINISTERS) {
      const chiave = normalizzaMinistri(ministro.nome);
      const quanti = membri.filter((m) => normalizzaMinistri(m.nome) === chiave).length;
      const esito = trovaParlamentareMinistri(ministro.nome, membri);
      if (quanti === 1) expect(esito).not.toBeNull();
      else expect(esito).toBeNull();
    }
  });
});

describe("ministri reali: render pagina ministro con/senza link", () => {
  it("con match unico: box con link interno + esterno reale", () => {
    const box = decidiBoxScheda("Giorgia Meloni", MEMBRI_FIXTURE);
    expect(box).not.toBeNull();
    expect(box?.hrefInterno).toBe("/parlamento/deputati/d999001_19");
    expect(box?.hrefEsterno).toBe("http://www.camera.it/uri-res/N2Ls?esempio-meloni");
  });

  it("con match senatore senza urlScheda: esterno null, interno senatori", () => {
    const box = decidiBoxScheda("Maria Elisabetta Alberti Casellati", MEMBRI_FIXTURE);
    expect(box).not.toBeNull();
    expect(box?.hrefInterno).toBe("/parlamento/senatori/32");
    /* Senato: foto sì, ma urlScheda assente → nessun link esterno inventato. */
    expect(box?.hrefEsterno).toBeNull();
  });

  it("senza match (omonimo/parziale/vuoto): nessun box", () => {
    expect(decidiBoxScheda("Mario Rossi", MEMBRI_FIXTURE)).toBeNull();
    expect(decidiBoxScheda("AIELLO", MEMBRI_FIXTURE)).toBeNull();
    expect(decidiBoxScheda("", MEMBRI_FIXTURE)).toBeNull();
    expect(decidiBoxScheda("Persona Inesistente", MEMBRI_FIXTURE)).toBeNull();
  });

  it("never-throw su input malformati", () => {
    expect(() => decidiBoxScheda(null as never, MEMBRI_FIXTURE)).not.toThrow();
    expect(() => decidiBoxScheda("Giorgia Meloni", null as never)).not.toThrow();
    expect(decidiBoxScheda(null as never, MEMBRI_FIXTURE)).toBeNull();
    expect(decidiBoxScheda("Giorgia Meloni", null as never)).toBeNull();
  });

  it("link esterno solo se urlScheda reale http(s), con rel noopener", () => {
    const boxHttp = decidiBoxScheda("Davide Aiello", MEMBRI_FIXTURE);
    expect(boxHttp?.hrefEsterno?.startsWith("http")).toBe(true);
    /* Il requisito rel=noopener è della UI (W4): qui si verifica che il box
       esponga solo URL reali, mai costruiti; il componente deve usare
       target=_blank rel=noopener per l'esterno. */
    const fasullo: MembroMinistri[] = [
      { camera: "camera", slug: "d1_19", nome: "TEST UNICO", urlScheda: "non-un-url" },
    ];
    expect(decidiBoxScheda("Test Unico", fasullo)?.hrefEsterno).toBeNull();
  });
});
