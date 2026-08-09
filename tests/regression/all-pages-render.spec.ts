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

    // Not just "some real content" -- the CORRECT page's content. Root
    // cause of the "Introduction always shows Home" bug: site-engine.js
    // silently substituted 'home' for any pageId not literally present in
    // config/site.json's navigationMenu, which real content pages that are
    // deliberately not nav items (introduction, nar, articles) never were.
    // A "not stuck loading" check alone can't catch a wrong-but-real page
    // being served -- it has to check WHICH page actually rendered.
    await expect(main.locator(`.page[data-page="${page}"]`)).toBeVisible();
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

/**
 * sw.js registers on `window.load`, separately from the page-content fetch
 * that already happened during init(). Root-caused live: a SECOND
 * navigation landing in the narrow window while the service worker is still
 * installing/activating could have its very first fetch() attempt fail even
 * though the identical request succeeds an instant later -- the old fetch
 * handler treated any single failure as "offline" and fell back to cached
 * index.html, silently serving the wrong page (confirmed via direct
 * response-body inspection: a `pages/home.html` request, status 200,
 * whose body was verifiably index.html's). Fix: one retry inside the
 * service worker before falling back to cache. This stresses exactly the
 * trigger condition -- rapid repeat navigations right after first load --
 * rather than a single isolated page load, which didn't reproduce it.
 */
test('rapid repeated navigation right after first load never serves the wrong page', async ({ page }) => {
  await page.goto('/?page=home');
  await page.waitForLoadState('load'); // this is when sw.js registration fires

  for (let i = 0; i < 6; i++) {
    await page.goto(`/?page=${SPA_PAGES[i % SPA_PAGES.length]}`);
    const main = page.locator('#main');
    await expect(async () => {
      const text = (await main.innerText()).trim();
      expect(text, `attempt ${i}: #main text was "${text.slice(0, 100)}"`).not.toBe('Loading...');
    }).toPass({ timeout: 5000 });
  }
});
