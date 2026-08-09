import { test, expect } from '@playwright/test';

/**
 * Every page reachable from the nav (plus the articles not yet in nav) must
 * actually render its real content, not get stuck on the "Loading..."
 * placeholder site-engine.js sets before a page's fetch/preload resolves.
 * Reported live: "the only loading page now is docs, and error log" --
 * this pins down exactly which pages are affected, on a real page load
 * (not the ad hoc manual browser checks that kept getting confused by
 * stacked navigation history across many test tabs).
 */
const SPA_PAGES = ['home', 'about', 'docs', 'issues', 'introduction', 'nar', 'articles', 'test'];

for (const page of SPA_PAGES) {
  test(`?page=${page} renders real content, not stuck on "Loading..."`, async ({ page: browserPage }) => {
    await browserPage.goto(`/?page=${page}`);
    const main = browserPage.locator('#main');

    // Give it a real chance to settle (preloadCssForHtml is capped at 2s,
    // plus fetch/render time) before deciding it's actually stuck.
    await expect(async () => {
      const text = (await main.innerText()).trim();
      expect(text, `#main text was: "${text.slice(0, 100)}"`).not.toBe('Loading...');
      expect(text.length, 'page rendered essentially no content').toBeGreaterThan(20);
    }).toPass({ timeout: 8000 });
  });
}

test('errors-viewer.html renders real content, not stuck on "Loading errors..."', async ({ page }) => {
  await page.goto('/errors-viewer.html');
  const container = page.locator('#error-container');

  await expect(async () => {
    const text = (await container.innerText()).trim();
    expect(text, `#error-container text was: "${text.slice(0, 100)}"`).not.toContain('Loading errors...');
  }).toPass({ timeout: 8000 });
});
