/**
 * Test ingest storico Normattiva: fixture inline, zero rete, zero disco
 * (salvo un percorso inesistente per `caricaChiaviRecenti`).
 *
 * Copre parser/mapping/dedup/stato delle funzioni pure esportate da
 * `scripts/ingest-reale-normattiva-storico.ts`.
 */
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vite-plus/test";
import {
  caricaChiaviRecenti,
  chiaveEliStorico,
  dettaglioToRecordStorico,
  eliCandidatiVoce,
  isIsoDateStorico,
  normalizzaStorico,
  statoDaFineVigenza,
  stringaStorico,
  urnDaVoceLista,
  voceCollezioneDaMetadati,
  vociDaZipCollezione,
} from "../scripts/ingest-reale-normattiva-storico";
import type { VoceLista } from "../scripts/ingest-reale-normattiva-storico";

const VOCE_AGGIORNATI_1980 = {
  numeroAtto: "2",
  numeroAttoAlfanumerico: "799",
  dataGU: "1980-12-06",
  numeroGU: "335",
  codiceRedazionale: "080U0799",
  titoloAtto: "Ulteriori interventi urgenti in favore delle popolazioni.",
  giornoProvvedimento: "5",
  meseProvvedimento: "12",
  annoProvvedimento: "1980",
  numeroProvvedimento: "799",
  denominazioneAtto: "DECRETO-LEGGE",
  descrizioneAtto: "DECRETO-LEGGE 5 dicembre 1980, n. 799",
};

const METADATI_COLLEZIONE = {
  metadati: {
    urn: "urn:nir:stato:regio.decreto:1930-10-19;1398",
    eli: "eli/id/1930/10/26/030U1398/ORIGINAL",
    numDoc: "1398",
    tipoDoc: "REGIO DECRETO",
    titoloDoc: "Approvazione del testo definitivo del Codice Penale. (030U1398)",
    dataDoc: "1930-10-19",
    dataPubblicazione: "1930-10-26",
    numeroPubblicazione: "251",
    redazione: "030U1398",
    abrogato: "no",
  },
};

const VOCE_1980: VoceLista = {
  urn: "urn:nir:stato:decreto.legge:1980-12-05;799",
  codice: "080U0799",
  dataGU: "1980-12-06",
  numeroGU: "335",
  eliReale: "",
};

const DETTAGLIO_1980 = {
  data: {
    atto: {
      titolo: "DECRETO-LEGGE 5 dicembre 1980, n. 799",
      sottoTitolo: "Ulteriori interventi urgenti in favore delle popolazioni.",
      articoloHtml: "<div><p>Testo reale di prova con piu' parole per la sintesi.</p></div>",
      tipoProvvedimentoDescrizione: "DECRETO-LEGGE",
      annoProvvedimento: 1980,
      meseProvvedimento: 12,
      giornoProvvedimento: 5,
      numeroProvvedimento: 799,
      annoGU: 1980,
      meseGU: 12,
      giornoGU: 6,
      numeroGU: 335,
      articoloDataInizioVigenza: "19801225",
      articoloDataFineVigenza: "99999999",
    },
  },
};

/** Costruisce uno ZIP minimo in memoria (stored + deflate) senza dipendenze. */
function zipMinimo(
  entries: Array<{ nome: string; contenuto: string; deflate: boolean }>,
): Uint8Array {
  const parti: Buffer[] = [];
  const centrale: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const nome = Buffer.from(entry.nome, "utf8");
    const dati = entry.deflate
      ? deflateRawSync(Buffer.from(entry.contenuto, "utf8"))
      : Buffer.from(entry.contenuto, "utf8");
    const locale = Buffer.alloc(30);
    locale.writeUInt32LE(0x04034b50, 0);
    locale.writeUInt16LE(20, 4);
    locale.writeUInt16LE(0, 6);
    locale.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    locale.writeUInt32LE(0, 14);
    locale.writeUInt32LE(dati.length, 18);
    locale.writeUInt32LE(dati.length, 22);
    locale.writeUInt16LE(nome.length, 26);
    locale.writeUInt16LE(0, 28);
    parti.push(locale, nome, Buffer.from(dati));
    const centraleVoce = Buffer.alloc(46);
    centraleVoce.writeUInt32LE(0x02014b50, 0);
    centraleVoce.writeUInt16LE(entry.deflate ? 8 : 0, 10);
    centraleVoce.writeUInt32LE(dati.length, 20);
    centraleVoce.writeUInt32LE(dati.length, 24);
    centraleVoce.writeUInt16LE(nome.length, 28);
    centraleVoce.writeUInt32LE(offset, 42);
    centrale.push(centraleVoce, nome);
    offset += 30 + nome.length + dati.length;
  }
  const dirOffset = offset;
  const dir = Buffer.concat(centrale);
  offset += dir.length;
  const fine = Buffer.alloc(22);
  fine.writeUInt32LE(0x06054b50, 0);
  fine.writeUInt16LE(entries.length, 8);
  fine.writeUInt16LE(entries.length, 10);
  fine.writeUInt32LE(dir.length, 12);
  fine.writeUInt32LE(dirOffset, 16);
  const blob = Buffer.concat([...parti, dir, fine]);
  return new Uint8Array(blob.buffer, blob.byteOffset, blob.byteLength);
}

describe("ingest storico Normattiva (fixture inline, zero rete)", () => {
  it("urnDaVoceLista costruisce l'URN reale dalla voce aggiornati", () => {
    expect(urnDaVoceLista(VOCE_AGGIORNATI_1980)).toBe("urn:nir:stato:decreto.legge:1980-12-05;799");
  });

  it("urnDaVoceLista restituisce '' se i campi non bastano (mai inventare)", () => {
    expect(urnDaVoceLista({})).toBe("");
    expect(urnDaVoceLista(null)).toBe("");
    expect(urnDaVoceLista({ denominazioneAtto: "LEGGE" })).toBe("");
    expect(urnDaVoceLista("stringa")).toBe("");
  });

  it("voceCollezioneDaMetadati usa solo campi osservati dei JSON bulk", () => {
    const voce = voceCollezioneDaMetadati(METADATI_COLLEZIONE);
    expect(voce).not.toBeNull();
    expect(voce?.urn).toBe("urn:nir:stato:regio.decreto:1930-10-19;1398");
    expect(voce?.codice).toBe("030U1398");
    expect(voce?.dataGU).toBe("1930-10-26");
    expect(voce?.numeroGU).toBe("251");
    expect(voce?.eliReale).toBe("/eli/id/1930/10/26/030U1398/ORIGINAL");
  });

  it("voceCollezioneDaMetadati scarta voci senza URN valido", () => {
    expect(voceCollezioneDaMetadati({})).toBeNull();
    expect(voceCollezioneDaMetadati(null)).toBeNull();
    expect(voceCollezioneDaMetadati({ metadati: { urn: "non-un-urn" } })).toBeNull();
    expect(voceCollezioneDaMetadati({ metadati: {} })).toBeNull();
  });

  it("statoDaFineVigenza: solo la data esplicita fa fede", () => {
    expect(statoDaFineVigenza("99999999", "20260928")).toBe("in_vigore");
    expect(statoDaFineVigenza("19801225", "20260928")).toBe("abrogato");
    expect(statoDaFineVigenza("", "20260928")).toBe("in_vigore");
    expect(statoDaFineVigenza("non-una-data", "20260928")).toBe("in_vigore");
  });

  it("chiaveEliStorico normalizza con trim+lowercase", () => {
    expect(chiaveEliStorico("  /ELI/ID/1980/SG  ")).toBe("/eli/id/1980/sg");
    expect(chiaveEliStorico(null)).toBe("");
    expect(chiaveEliStorico(undefined)).toBe("");
  });

  it("eliCandidatiVoce elenca ELI reale + derivato da URN/codice", () => {
    const candidati = eliCandidatiVoce(VOCE_1980);
    expect(candidati).toContain("/eli/id/1980/12/05/080u0799/sg");
    const conReale: VoceLista = { ...VOCE_1980, eliReale: "/eli/id/1930/10/26/030U1398/ORIGINAL" };
    expect(eliCandidatiVoce(conReale)).toContain("/eli/id/1930/10/26/030u1398/original");
  });

  it("dettaglioToRecordStorico mappa il dettaglio reale in LawRecord", () => {
    const record = dettaglioToRecordStorico(VOCE_1980, DETTAGLIO_1980, 2000);
    expect(record).not.toBeNull();
    expect(record?.titolo).toBe("DECRETO-LEGGE 5 dicembre 1980, n. 799");
    expect(record?.tipo).toBe("decreto.legge");
    expect(record?.numero).toBe("799");
    expect(record?.dataEmanazione).toBe("1980-12-05");
    expect(record?.nir).toBe(VOCE_1980.urn);
    expect(record?.eli).toBe("/eli/id/1980/12/05/080U0799/sg");
    expect(record?.chiave).toBe(record?.eli);
    expect(record?.stato).toBe("in_vigore");
    expect(record?.sintesi.length).toBeLessThanOrEqual(600);
    expect(record?.dataGU).toBe("1980-12-06");
    expect(record?.numeroGU).toBe("335");
    expect(record?.codiceRedazionale).toBe("080U0799");
    expect(record?.fonti.normattiva).toContain(
      "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legge:1980-12-05;799",
    );
    expect(record?.fonti.gazzetta).toBe(
      "https://www.gazzettaufficiale.it/eli/id/1980/12/06/080U0799/sg",
    );
    expect("dimostrativo" in (record as unknown as Record<string, unknown>)).toBe(false);
  });

  it("dettaglioToRecordStorico tronca il testo oltre testoMax con flag", () => {
    const lungo = { ...DETTAGLIO_1980 };
    const record = dettaglioToRecordStorico(VOCE_1980, lungo, 10);
    expect(record?.testoTroncato).toBe(true);
    expect(record?.testo).toContain("[...]");
  });

  it("dettaglioToRecordStorico scarta dettagli senza titolo/chiave", () => {
    expect(dettaglioToRecordStorico(VOCE_1980, {}, 2000)).toBeNull();
    expect(dettaglioToRecordStorico(VOCE_1980, null, 2000)).toBeNull();
    expect(dettaglioToRecordStorico(VOCE_1980, { data: { atto: {} } }, 2000)).toBeNull();
  });

  it("vociDaZipCollezione estrae voci reali da stored + deflate, ignora non-JSON", () => {
    const zip = zipMinimo([
      { nome: "atto1.json", contenuto: JSON.stringify(METADATI_COLLEZIONE), deflate: false },
      {
        nome: "atto2.json",
        contenuto: JSON.stringify({
          metadati: {
            urn: "urn:nir:stato:legge:1980-07-07;100",
            tipoDoc: "LEGGE",
            titoloDoc: "Legge di prova",
            dataDoc: "1980-07-07",
            redazione: "080U0100",
          },
        }),
        deflate: true,
      },
      { nome: "nota.txt", contenuto: "ignora", deflate: false },
    ]);
    const voci = vociDaZipCollezione(zip, 60);
    expect(voci).toHaveLength(2);
    expect(voci[0]?.urn).toBe("urn:nir:stato:regio.decreto:1930-10-19;1398");
    expect(voci[1]?.urn).toBe("urn:nir:stato:legge:1980-07-07;100");
  });

  it("vociDaZipCollezione non lancia mai su byte invalidi", () => {
    expect(vociDaZipCollezione(new Uint8Array([1, 2, 3, 4]), 60)).toEqual([]);
    expect(vociDaZipCollezione(new Uint8Array([]), 60)).toEqual([]);
    expect(() => vociDaZipCollezione(new Uint8Array([80, 75, 3, 4]), 60)).not.toThrow();
  });

  it("caricaChiaviRecenti restituisce set vuoto se il file manca", async () => {
    const chiavi = await caricaChiaviRecenti("data/reali/file-che-non-esiste-xyz.json");
    expect(chiavi.size).toBe(0);
  });

  it("utility di base: normalizza, stringa e date ISO", () => {
    expect(normalizzaStorico("  a   b\nc ")).toBe("a b c");
    expect(stringaStorico(799)).toBe("799");
    expect(stringaStorico(" x ")).toBe("x");
    expect(stringaStorico(null)).toBe("");
    expect(isIsoDateStorico("1980-12-05")).toBe(true);
    expect(isIsoDateStorico("1980-13-40")).toBe(false);
    expect(isIsoDateStorico("non-data")).toBe(false);
  });
});
