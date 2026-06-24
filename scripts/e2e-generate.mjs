// End-to-end: wizard → build plan → generate timing → screenshot the rendered card.
// Usage: node scripts/e2e-generate.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('http://localhost:5200', { waitUntil: 'networkidle' });

// ── fill the wizard ──
await page.getByRole('button', { name: 'birthday', exact: true }).click();
await page.locator('input[type="date"]').fill('2026-07-12');
await page.getByPlaceholder('e.g. 80000').fill('150000');
await page.getByPlaceholder('e.g. Bengaluru').fill('Bengaluru');
await page.getByPlaceholder('e.g. Indiranagar').fill('Jayanagar');
await page.getByPlaceholder('e.g. Meera').fill('Lalita');
await page.getByPlaceholder('e.g. mother').fill('mother');
await page.locator('input.count').first().fill('50');

// ── build the plan ──
await page.getByRole('button', { name: /Build the plan/ }).click();
await page.waitForTimeout(600);

// ── generate the timing card (real model call) ──
await page.getByRole('button', { name: /Generate timing/ }).click();
await page.waitForSelector('.card', { timeout: 90000 });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/celebrate-shots/generated.png', fullPage: true });

// ── expand it ──
await page.locator('.card .card-head').first().click();
await page.waitForTimeout(450);
await page.screenshot({ path: '/tmp/celebrate-shots/generated-expanded.png', fullPage: true });

await browser.close();
if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n---\n'));
  process.exit(1);
}
console.log('OK — generated + rendered, no console errors.');
