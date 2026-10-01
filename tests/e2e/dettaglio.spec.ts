import { expect, test } from "@playwright/test";

interface VoceLegge {
  eli: string;
  titolo: string;
  fonti?: Record<string, string>;
}

/** Prima legge API con almeno una fonte ufficiale, altrimenti la prima in assoluto. */
async function primaLeggeConFonti(baseURL: string): Promise<VoceLegge> {
  const res = await fetch(`${baseURL}/api/leggi?per=50`);
  if (!res.ok) throw new Error(`API leggi: ${res.status}`);
  const data = (await res.json()) as { items: VoceLegge[] };
  if (!data.items || data.items.length === 0) throw new Error("API leggi senza items");
  return (
    data.items.find((voce) => voce.fonti && Object.values(voce.fonti).some(Boolean)) ??
    data.items[0]
  );
}

test.describe("dettaglio legge", () => {
  test("h1, fonti ufficiali cliccabili, dark-mode non rompe", async ({ page }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://127.0.0.1:3200";
    const legge = await primaLeggeConFonti(baseURL);

    await page.goto(`/leggi/${legge.eli.replace(/^\/+/, "")}`);

    // h1 della scheda con il titolo della legge.
    const h1 = page.locator("h1").first();
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(legge.titolo.slice(0, 40));

    // Fonti ufficiali: link https che si aprono in nuova scheda, oppure
    // messaggio onesto quando non ci sono link diretti.
    const sezioneFonti = page.locator("section", { hasText: "Fonti ufficiali" }).last();
    await expect(sezioneFonti).toBeVisible();
    const linkFonti = sezioneFonti.locator('a[target="_blank"]');
    const nLink = await linkFonti.count();
    if (nLink > 0) {
      for (let i = 0; i < nLink; i++) {
        const link = linkFonti.nth(i);
        await expect(link).toBeVisible();
        await expect(link).toBeEnabled();
        const href = await link.getAttribute("href");
        expect(href).toMatch(/^https:\/\//);
      }
    } else {
      await expect(sezioneFonti).toContainText(/non ci sono link diretti/i);
    }

    // Dark-mode (emulateMedia): la pagina resta integra in tema scuro.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    await expect(page.locator("html.dark")).toBeAttached();
    await expect(h1).toBeVisible();

    // Toggle tema manuale: cliccabile e pagina non rotta dopo il cambio.
    const toggle = page.locator('button[aria-label^="Passa al tema"]').first();
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(h1).toBeVisible();
    await expect(sezioneFonti).toBeVisible();
  });
});
