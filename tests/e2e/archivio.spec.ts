import { expect, test, type Page } from "@playwright/test";

/** Titoli H3 delle schede risultato attualmente in pagina. */
async function titoliRisultati(page: Page): Promise<string[]> {
  return page.locator("main ul li h3").allTextContents();
}

test.describe("archivio", () => {
  test('ricerca "lavoro" mostra risultati reali, filtri vigenza cambiano lista', async ({
    page,
  }) => {
    await page.goto("/leggi");

    // Ricerca "lavoro" via form (submit client-side verso ?q=lavoro).
    await page.locator("#ricerca-legge-archivio").fill("lavoro");
    await page.locator('form[role="search"] button[type="submit"]').click();
    await page.waitForURL(/\/leggi\?.*q=lavoro/);

    // Risultati reali: almeno una scheda, titoli senza "Variante" (sintetico).
    const status = page.locator('p[role="status"]').first();
    await expect(status).toContainText(/\d+ norme? trovate?/i);
    const titoli = await titoliRisultati(page);
    expect(titoli.length).toBeGreaterThan(0);
    for (const titolo of titoli) {
      expect(titolo).not.toMatch(/variante/i);
    }

    // Filtri vigenza: aprire "Altri filtri" e cambiare "Vale ancora?".
    const prima = titoli.join("|||");
    await page.locator("summary", { hasText: "Altri filtri" }).click();
    await page.locator("#filtro-vigenza").selectOption("abrogato");
    await page.waitForURL(/vigenza=abrogato/);

    // La lista cambia: titoli diversi oppure stato vuoto onesto.
    const dopo = await titoliRisultati(page);
    const listaCambiata = dopo.join("|||") !== prima;
    const statoVuoto = await page
      .locator("main", { hasText: "Niente da mostrare" })
      .isVisible()
      .catch(() => false);
    expect(listaCambiata || statoVuoto || dopo.length === 0).toBe(true);
    if (dopo.length > 0) {
      for (const titolo of dopo) {
        expect(titolo).not.toMatch(/variante/i);
      }
    }
  });
});
