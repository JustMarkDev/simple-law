import { expect, test } from '@playwright/test';

test.describe('home', () => {
  test('h1 visibile, CTA nel viewport iniziale, nessun errore console, skip-link da tastiera', async ({
    page,
  }) => {
    const erroriConsole: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') erroriConsole.push(msg.text());
    });
    page.on('pageerror', (err) => {
      erroriConsole.push(String(err));
    });

    await page.goto('/');

    // h1 visibile con il titolo atteso.
    const h1 = page.locator('h1').first();
    await expect(h1).toBeVisible();
    await expect(h1).toContainText(/spiegate con calma/i);

    // CTA "Vedi tutte le norme" già nel viewport iniziale (link hero).
    const cta = page.locator('main a', { hasText: 'Vedi tutte le norme' }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toBeInViewport();

    // Skip-link raggiungibile e funzionante da tastiera: a documento appena
    // caricato il focus parte dall'inizio, i primi Tab danno gli skip-link.
    let skipFocused = false;
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      const text = ((await focused.textContent()) ?? '').trim();
      const href = await focused.getAttribute('href');
      if (href === '#contenuto' && /contenuto/i.test(text)) {
        skipFocused = true;
        break;
      }
    }
    expect(skipFocused).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#contenuto')).toBeInViewport();

    // Nessun errore console/pageerror durante il giro.
    expect(erroriConsole).toEqual([]);
  });
});
