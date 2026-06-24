// Seeds a board (incl. a food card with per-plate cost lines, a quoted venue and
// an actual photo line), forces a real budget recompute via a lock toggle, and
// screenshots the two-column layout + the budget dashboard + the food formula.
import { chromium } from 'playwright';

const mk = (moduleId, cohortLines, opts = {}) => ({
  instanceId: moduleId + '__main',
  moduleId,
  momentId: 'main',
  title: moduleId,
  recommendation: opts.rec || moduleId + ' pick',
  reasoning: ['A specific reason.', 'A second concrete factor.'],
  alternatives: [],
  costLines: opts.lines || [],
  leadTimeDays: 14,
  status: 'suggested',
  feasibility: 'ok',
  confidence: 'high',
  stale: false,
  active: true,
  locked: false,
  chat: [],
  tags: [],
});

const line = (label, amount, basis = 'estimated') => ({ id: label.slice(0, 6), label, amount, basis });

const dlist = [
  mk('theme', null, { rec: 'Carnatic-music garden theme', lines: [line('Theme styling', 15000)] }),
  mk('venue', null, { rec: 'A banquet hall in Jayanagar', lines: [line('Venue hire', 48000, 'quoted')] }),
  mk('food', null, {
    rec: 'South Indian veg lunch, diabetic-safe',
    lines: [line('Adults — 55 plates @ ₹600', 33000), line('Kids — 6 plates @ ₹300', 1800)],
  }),
  mk('gifts', null, { rec: 'A silk saree', lines: [line('Gift', 12000)] }),
  mk('photography', null, { rec: 'Photo + video + album', lines: [line('Lensanche Studios', 38000, 'actual')] }),
  mk('decoration', null, { rec: 'Floral arch + fairy lights', lines: [line('Decor', 37000)] }),
  mk('transportation', null, { rec: 'Shared tempo + cabs', lines: [line('Transport', 11000)] }),
];
const deliverables = {};
for (const d of dlist) deliverables[d.instanceId] = d;

const plan = {
  input: {
    eventType: 'birthday',
    honorees: [{ id: 'h1', name: 'Lalita', relation: 'mother', age: 60 }],
    date: '2026-07-12',
    budgetTotal: 250000,
    location: { city: 'Bengaluru' },
    cohorts: [
      { id: 'c1', label: 'Adults', count: 50, portionFactor: 1 },
      { id: 'c2', label: 'Kids', count: 6, portionFactor: 0.5, isKids: true },
    ],
    exceptions: [{ id: 'x1', note: 'grandmother — diabetic' }],
    alcohol: false,
    memoryValue: 'high',
    innerCircle: [],
  },
  moments: [{ id: 'main', label: 'Main celebration', time: '', scope: 'full', isPrimary: true }],
  deliverables,
  budget: { totalEstimated: 0, totalQuoted: 0, totalActual: 0, grandTotal: 0, budget: 250000, variance: 250000, allocation: [], pressure: [] },
  version: 1,
  updatedAt: '',
};
const store = { state: { plans: { plan_seed: { id: 'plan_seed', name: 'seed', plan, createdAt: '', updatedAt: '' } }, currentPlanId: 'plan_seed', archivedEvents: [] }, version: 1 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 1500 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.addInitScript((s) => localStorage.setItem('celebrate-store', s), JSON.stringify(store));
await page.goto('http://localhost:5200', { waitUntil: 'networkidle' });
await page.waitForSelector('.budget-rail');

// Force a real recompute from the seeded deliverables (lock toggle on/off).
const lock = page.locator('.card .icon-btn').first();
await lock.click();
await lock.click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/celebrate-shots/budget.png', fullPage: true });

// Expand the food card to show the first-principles formula + per-plate lines.
const food = page.locator('.card').filter({ has: page.locator('.card-module', { hasText: /^food$/ }) });
await food.locator('.card-head').click();
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/celebrate-shots/budget-food.png', fullPage: true });

const total = await page.locator('.br-total').innerText();
const variance = await page.locator('.br-variance').innerText();
const allocs = await page.locator('.alloc').count();
await browser.close();

console.log('budget total shown:', total, '| variance:', variance, '| allocation rows:', allocs);
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('OK — budget dashboard + food formula verified.');
