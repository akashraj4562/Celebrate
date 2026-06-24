// Seeds a board with varied lead times (incl. an infeasible destination activity
// and a midnight cake/bouquet), switches the rail to the Timeline tab, and
// screenshots the backward-planned schedule. No model calls.
import { chromium } from 'playwright';

const mk = (moduleId, lead, feas = 'ok', momentId = 'main', cost = 0) => ({
  instanceId: moduleId + '__' + momentId,
  moduleId,
  momentId,
  title: moduleId,
  recommendation: moduleId + ' pick',
  reasoning: ['A specific reason.', 'A second factor.'],
  alternatives: [],
  costLines: cost ? [{ id: moduleId, label: moduleId, amount: cost, basis: 'estimated' }] : [],
  leadTimeDays: lead,
  status: 'suggested',
  feasibility: feas,
  confidence: 'high',
  stale: false,
  active: true,
  locked: false,
  chat: [],
  tags: [],
});

const dlist = [
  mk('theme', 14, 'ok', 'main', 15000),
  mk('timing', 10),
  mk('venue', 21, 'ok', 'main', 48000),
  mk('food', 12, 'ok', 'main', 35000),
  mk('gifts', 20, 'ok', 'main', 12000),
  mk('photography', 25, 'ok', 'main', 30000),
  mk('decoration', 12, 'ok', 'main', 22000),
  mk('activities', 75, 'infeasible', 'main', 35000),
  mk('transportation', 5, 'ok', 'main', 9000),
  mk('midnightCake', 3, 'ok', 'midnight', 2200),
  mk('midnightBouquet', 2, 'ok', 'midnight', 900),
];
const deliverables = {};
for (const d of dlist) deliverables[d.instanceId] = d;

const plan = {
  input: {
    eventType: 'birthday',
    honorees: [{ id: 'h1', name: 'Lalita', relation: 'mother', age: 60 }],
    date: '2026-08-15',
    budgetTotal: 250000,
    location: { city: 'Bengaluru' },
    cohorts: [{ id: 'c1', label: 'Adults', count: 50, portionFactor: 1 }],
    exceptions: [],
    alcohol: false,
    memoryValue: 'high',
    innerCircle: [],
  },
  moments: [
    { id: 'main', label: 'Main celebration', time: '', scope: 'full', isPrimary: true },
    { id: 'midnight', label: 'Midnight cake-cutting (family)', time: '00:00', scope: 'family', reason: 'Near-universal for birthdays.' },
  ],
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
await page.waitForSelector('.rail-tabs');
await page.getByRole('button', { name: 'Timeline' }).click();
await page.waitForSelector('.tl-bucket');
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/celebrate-shots/timeline.png', fullPage: true });

const startBy = await page.locator('.br-total').innerText();
const buckets = await page.locator('.tl-head').allInnerTexts();
await browser.close();

console.log('start planning by:', startBy);
console.log('buckets:', buckets.join(' | '));
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('OK — prep timeline UI verified.');
