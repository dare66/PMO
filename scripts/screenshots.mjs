// Visual QA: signs in and captures every major workspace. Usage:
//   BASE_URL=http://localhost:8080 DEMO_PASSWORD=... node scripts/screenshots.mjs [scale]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // uses the globally installed Playwright
const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const PW = process.env.DEMO_PASSWORD;
const scale = Number(process.argv[2] ?? 1);
const out = process.env.OUT_DIR ?? 'docs/screenshots';
const pages = [
  ['01-command-centre', '/', 'ceo'], ['02-portfolio', '/portfolio', 'portfolio'], ['03-strategy', '/strategy', 'portfolio'],
  ['04-projects', '/projects', 'pmo'], ['05-project-workspace', 'PROJECT', 'pm2'], ['06-project-timeline', 'PROJECT#plan', 'pm2'],
  ['07-products', '/products', 'product'], ['08-product-workspace', 'PRODUCT', 'product'], ['09-discovery', '/discovery', 'product'],
  ['10-raid', '/raid', 'pmo'], ['11-changes', '/changes', 'pmo'], ['12-quality-release', '/quality', 'release'],
  ['13-resilience', '/resilience', 'bcm'], ['14-bia-detail', 'BIA', 'bcm'], ['15-traceability', '/resilience#trace', 'bcm'], ['16-processes', '/processes', 'ba'],
  ['17-finance', '/finance', 'finance'], ['18-resources', '/resources', 'resources'], ['19-operations', '/operations', 'ops'],
  ['20-documents', '/documents', 'pmo'], ['21-governance', '/governance', 'finance'], ['22-ai', '/ai', 'pmo'], ['23-vendors', '/vendors', 'procurement'], ['24-admin', '/admin', 'admin'],
];
const browser = await chromium.launch();
const errors = [];
const states = {};
for (const [name, path, user] of pages) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale, storageState: states[user] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: console ${m.text()}`); });
  await page.goto(BASE + '/');
  if (!states[user]) { await page.fill('#email', `${user}@demo.example`); await page.fill('#pw', PW); await page.click('form.login-card button'); }
  await page.waitForSelector('.sidebar', { timeout: 15000 });
  states[user] = await ctx.storageState();
  let target = path;
  if (path.startsWith('PROJECT')) { const r = await page.evaluate(async () => (await (await fetch('/api/r/projects?q=Payments')).json()).data[0].id); target = `/projects/${r}`; }
  if (path.startsWith('PRODUCT')) { const r = await page.evaluate(async () => (await (await fetch('/api/r/products?q=Mobile')).json()).data[0].id); target = `/products/${r}`; }
  if (path === 'BIA') { const r = await page.evaluate(async () => (await (await fetch('/api/r/bia_assessments?q=Complaint')).json()).data[0].id); target = `/resilience/bia/${r}`; }
  const [p, tab] = target.split('#');
  await page.goto(BASE + p);
  await page.waitForLoadState('networkidle');
  if (tab) { const labels = { plan: 'Plan & timeline', trace: 'Traceability map' }; await page.locator('button.tab', { hasText: labels[tab] }).click(); await page.waitForLoadState('networkidle'); }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await ctx.close();
}
// mobile check
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: scale, isMobile: true });
const mp = await m.newPage();
await mp.goto(BASE + '/'); await mp.fill('#email', 'pm1@demo.example'); await mp.fill('#pw', PW); await mp.click('form.login-card button'); await mp.waitForSelector('.topbar');
await mp.goto(BASE + '/governance'); await mp.waitForLoadState('networkidle'); await mp.waitForTimeout(600);
await mp.screenshot({ path: `${out}/25-mobile-approvals.png`, fullPage: false });
const ov = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
await browser.close();
console.log(JSON.stringify({ captured: pages.length + 1, mobileHorizontalOverflow: ov, errors }, null, 1));
