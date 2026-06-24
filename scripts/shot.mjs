// Headless screenshot + console-error check. Usage:
//   node scripts/shot.mjs [url] [outPath] [waitMs]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5200';
const out = process.argv[3] ?? '/tmp/celebrate-shots/shot.png';
const waitMs = Number(process.argv[4] ?? 900);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1500 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const clickSel = process.argv[5];
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(waitMs);
if (clickSel) {
  await page.click(clickSel);
  await page.waitForTimeout(450);
}
await page.screenshot({ path: out, fullPage: true });
await browser.close();

if (errors.length) {
  console.error('CONSOLE ERRORS (' + errors.length + '):\n' + errors.join('\n---\n'));
  process.exit(1);
}
console.log('OK — no console errors → ' + out);
