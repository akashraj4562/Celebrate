// Seeds a PAST-dated plan with locked/quoted cards, archives it through the UI,
// and verifies: archive banner → dialog preview → lands home → Past celebrations
// panel → "Plan one like this" prefills the wizard. No model calls.
import { chromium } from 'playwright';

const mk = (moduleId, recommendation, cost, opts = {}) => ({
  instanceId: moduleId + '__main',
  moduleId,
  momentId: 'main',
  title: moduleId,
  recommendation,
  reasoning: ['A specific reason for ' + moduleId + '.', 'A second concrete factor.'],
  alternatives: [],
  costLines: cost ? [{ id: moduleId + 'cl', label: moduleId, amount: cost, basis: opts.basis || 'estimated' }] : [],
  leadTimeDays: 14,
  status: opts.status || 'suggested',
  feasibility: 'ok',
  confidence: 'high',
  stale: false,
  active: true,
  locked: !!opts.locked,
  chat: [],
});

const dlist = [
  mk('venue', 'Tamarind Tree — open-garden restaurant', 48000, { basis: 'actual', locked: true }),
  mk('photography', 'Lensanche Studios — photo + video', 20000, { basis: 'quoted' }),
  mk('food', 'South Indian veg lunch', 55000, { basis: 'estimated' }),
  mk('gifts', 'A silk saree', 12000, { basis: 'estimated', status: 'overridden' }),
];
const deliverables = {};
for (const d of dlist) deliverables[d.instanceId] = d;

const plan = {
  input: {
    eventType: 'birthday',
    honorees: [{ id: 'h1', name: 'Lalita', relation: 'mother', age: 60 }],
    date: '2020-01-15', // safely in the past regardless of the test clock
    budgetTotal: 150000,
    location: { city: 'Bengaluru', area: 'Jayanagar' },
    cohorts: [{ id: 'c1', label: 'Adults', count: 50, portionFactor: 1 }],
    exceptions: [],
    alcohol: false,
    memoryValue: 'high',
    innerCircle: [],
  },
  moments: [{ id: 'main', label: 'Main celebration', time: '', scope: 'full', isPrimary: true }],
  deliverables,
  budget: { totalEstimated: 0, totalQuoted: 0, totalActual: 0, grandTotal: 0, budget: 150000, variance: 150000, allocation: [], pressure: [] },
  version: 1,
  updatedAt: '',
};
const saved = { id: 'plan_seed', name: 'seed', plan, createdAt: '', updatedAt: '' };
const store = { state: { plans: { plan_seed: saved }, currentPlanId: 'plan_seed', archivedEvents: [] }, version: 1 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 1600 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.addInitScript((s) => localStorage.setItem('celebrate-store', s), JSON.stringify(store));
await page.goto('http://localhost:5200', { waitUntil: 'networkidle' });
await page.waitForSelector('.card');

// 1 · the date-passed banner appears
await page.waitForSelector('.archive-banner', { timeout: 5000 });

// 2 · open the dialog and check the preview
await page.getByRole('button', { name: /Archive celebration/ }).click();
await page.waitForSelector('.modal', { timeout: 5000 });
const total = await page.locator('.arch-total b').innerText();
const factCount = await page.locator('.arch-facts li').count();
await page.locator('.modal textarea').fill('The garden was perfect at sunset.');
await page.screenshot({ path: '/tmp/celebrate-shots/archive-dialog.png', fullPage: true });

// 3 · archive → lands home → Past celebrations panel shows
await page.getByRole('button', { name: 'Archive this celebration' }).click();
await page.waitForSelector('.past-panel', { timeout: 5000 });
const pastTitle = await page.locator('.past-title').first().innerText();
const pastNote = await page.locator('.past-note').first().innerText();

// 4 · "Plan one like this" prefills the wizard
await page.getByRole('button', { name: /Plan one like this/ }).click();
await page.waitForTimeout(300);
const budgetVal = await page.locator('input[type="number"]').first().inputValue();
const typeOn = await page.locator('.seg button.on').first().innerText();
const honoreeVal = await page.locator('input[placeholder="e.g. Meera"]').inputValue();
await page.screenshot({ path: '/tmp/celebrate-shots/archive-prefill.png', fullPage: true });

await browser.close();

console.log('dialog total:', total, '| facts:', factCount);
console.log('past card:', pastTitle.replace(/\n/g, ' '), '| note:', pastNote);
console.log('prefill — budget:', budgetVal, '| type:', typeOn, '| honoree:', honoreeVal);

let bad = 0;
const assert = (c, m) => { if (!c) { console.error('✗ ' + m); bad++; } };
assert(factCount === 3, 'dialog should preview 3 finalized facts');
assert(total.includes('1,35,000'), 'dialog total should be ₹1,35,000');
assert(/birthday/i.test(pastTitle), 'past card titled birthday');
assert(budgetVal === '135000', 'budget prefilled to last spend');
assert(/birthday/i.test(typeOn), 'event type prefilled to birthday');
assert(honoreeVal === 'Lalita', 'honoree name prefilled');
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
if (bad) { console.error(`\nFAILED — ${bad} assertion(s).`); process.exit(1); }
console.log('\nOK — archive flow verified end to end, no console errors.');
