// End-to-end: wizard → build → GENERATE FULL PLAN → screenshot the filling board.
// Makes ~14 real model calls; allow a few minutes. Usage: node scripts/e2e-generate-all.mjs
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 1700 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('http://localhost:5200', { waitUntil: 'networkidle' });

// fill wizard
await page.getByRole('button', { name: 'birthday', exact: true }).click();
await page.locator('input[type="date"]').fill('2026-07-12');
await page.getByPlaceholder('e.g. 80000').fill('150000');
await page.getByPlaceholder('e.g. Bengaluru').fill('Bengaluru');
await page.getByPlaceholder('e.g. Indiranagar').fill('Jayanagar');
await page.getByPlaceholder('e.g. Meera').fill('Lalita');
await page.getByPlaceholder('e.g. mother').fill('mother');
await page.locator('input.count').first().fill('50');
await page.getByRole('button', { name: /Build the plan/ }).click();
await page.waitForTimeout(500);

// generate full plan
const t0 = Date.now();
await page.getByRole('button', { name: /Generate full plan/ }).click();

// mid-flight capture (skeletons + early cards)
await page.waitForTimeout(8000);
await page.screenshot({ path: '/tmp/celebrate-shots/genall-mid.png', fullPage: true });

// wait for completion (button returns to "Regenerate all")
await page.getByRole('button', { name: 'Regenerate all' }).waitFor({ timeout: 240000 });
const secs = Math.round((Date.now() - t0) / 1000);
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/celebrate-shots/genall-final.png', fullPage: true });

const cards = await page.locator('.card:not(.skeleton)').count();
await browser.close();

console.log(`done in ${secs}s · cards rendered: ${cards}`);
if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n---\n'));
  process.exit(1);
}
console.log('OK — full board generated, no console errors.');
