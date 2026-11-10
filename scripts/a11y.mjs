// Automated accessibility scan (axe-core, WCAG 2.0/2.1/2.2 A & AA rules) of the main workspaces.
// Automated rules catch roughly a third of WCAG issues; a formal manual assessment is still required (NFR-007).
// Usage:
//   npm i --prefix /tmp/axe axe-core@4.10.2
//   BASE_URL=http://localhost:8088 DEMO_PASSWORD=... AXE_PATH=/tmp/axe/node_modules/axe-core/axe.min.js node scripts/a11y.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const PW = process.env.DEMO_PASSWORD;
const AXE = readFileSync(process.env.AXE_PATH, 'utf8');
const routes = ['/', '/my-work', '/strategy', '/portfolio', '/demand', '/programmes', '/projects', 'PROJECT', 'PROJECT#Schedule & baseline', 'PROJECT#RACI', 'PROJECT#People & change',
  '/products', 'PRODUCT', 'PRODUCT#Health, metrics & launch', '/discovery', '/raid', '/changes', '/quality', '/operations', '/resilience', '/processes', '/finance', '/resources', '/vendors', '/documents', '/governance', '/architecture', '/ai', '/admin'];
const browser = await chromium.launch();
const results = [];
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, bypassCSP: true }); // the app's CSP correctly blocks injected scripts; bypass only for this test
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.fill('#email', 'admin@demo.example'); await page.fill('#pw', PW); await page.click('form.login-card button');
  await page.waitForSelector('.sidebar');
  if (theme === 'dark') await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  const ids = await page.evaluate(async () => ({
    project: (await (await fetch('/api/r/projects?q=Mobile')).json()).data[0].id,
    product: (await (await fetch('/api/r/products?q=Mobile')).json()).data[0].id,
  }));
  for (const r of routes) {
    const [p, tab] = r.split('#');
    const url = p === 'PROJECT' ? `/projects/${ids.project}` : p === 'PRODUCT' ? `/products/${ids.product}` : p;
    await page.goto(BASE + url); await page.waitForLoadState('networkidle');
    if (theme === 'dark') await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    if (tab) { await page.locator('button.tab', { hasText: tab }).first().click(); await page.waitForLoadState('networkidle'); }
    await page.waitForTimeout(600);
    await page.addScriptTag({ content: AXE });
    const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })).violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') })));
    results.push({ theme, route: r, violations: res });
  }
  await ctx.close();
}
await browser.close();
const all = results.flatMap((r) => r.violations.map((v) => ({ ...v, theme: r.theme, route: r.route })));
const byRule = {};
for (const v of all) { byRule[v.id] ??= { impact: v.impact, help: v.help, pages: 0, nodes: 0, sample: `${v.theme} ${v.route}: ${v.sample}` }; byRule[v.id].pages++; byRule[v.id].nodes += v.nodes; }
console.log(JSON.stringify({ pages_scanned: results.length, violations_total: all.length, by_rule: byRule }, null, 1));
process.exitCode = all.some((v) => ['critical', 'serious'].includes(v.impact)) ? 1 : 0;
