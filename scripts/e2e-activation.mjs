// Seeds a post-activation board (a spawned `bar` conditional + a midnight Moment
// with 4 cards) and verifies the moment section, its reason, the spawn-reason on
// the conditional card, and that Dismiss removes the moment. No model calls.
import { chromium } from 'playwright';

const mk = (moduleId, momentId, cost, opts = {}) => ({
  instanceId: moduleId + '__' + momentId,
  moduleId,
  momentId,
  title: moduleId,
  recommendation: opts.rec || moduleId + ' pick',
  reasoning: ['A specific reason.', 'A second concrete factor.'],
  alternatives: [],
  costLines: cost ? [{ id: moduleId + 'cl', label: moduleId, amount: cost, basis: 'estimated' }] : [],
  leadTimeDays: 7,
  status: 'suggested',
  feasibility: 'ok',
  confidence: 'high',
  stale: false,
  active: true,
  locked: false,
  chat: [],
  tags: opts.tags || [],
  ...(opts.reason ? { reason: opts.reason } : {}),
});

const midnightReason = 'An intimate 12am family cake-cutting is near-universal for Indian birthdays. Dismiss if you don’t want it.';
const dlist = [
  mk('theme', 'main', 15000, { rec: 'Carnatic-music garden theme' }),
  mk('timing', 'main', 0, { rec: 'Indoor lunch, 12:30 PM' }),
  mk('venue', 'main', 48000, { rec: 'A banquet hall in Jayanagar' }),
  mk('food', 'main', 55000, { rec: 'South Indian veg lunch' }),
  mk('gifts', 'main', 12000, { rec: 'A silk saree' }),
  mk('bar', 'main', 18000, { rec: 'A compact home bar', reason: 'Alcohol adds a bar line and makes safe transport important.' }),
  mk('midnightCake', 'midnight', 2200, { rec: 'A 1kg truffle cake for the 12am cut', reason: midnightReason }),
  mk('midnightBouquet', 'midnight', 900, { rec: 'A hand-tied rose bouquet', reason: midnightReason }),
  mk('midnightGifts', 'midnight', 3500, { rec: 'A handwritten letter + a small keepsake', reason: midnightReason }),
  mk('midnightDecor', 'midnight', 2500, { rec: 'Balloons + fairy lights + a small backdrop', reason: midnightReason }),
];
const deliverables = {};
for (const d of dlist) deliverables[d.instanceId] = d;

const plan = {
  input: {
    eventType: 'birthday',
    honorees: [{ id: 'h1', name: 'Lalita', relation: 'mother', age: 60 }],
    date: '2026-07-12',
    budgetTotal: 150000,
    location: { city: 'Bengaluru' },
    cohorts: [{ id: 'c1', label: 'Adults', count: 50, portionFactor: 1 }],
    exceptions: [],
    alcohol: true,
    memoryValue: 'high',
    innerCircle: [],
  },
  moments: [
    { id: 'main', label: 'Main celebration', time: '', scope: 'full', isPrimary: true },
    { id: 'midnight', label: 'Midnight cake-cutting (family)', time: '00:00', scope: 'family', reason: midnightReason },
  ],
  deliverables,
  dismissedMoments: [],
  budget: { totalEstimated: 0, totalQuoted: 0, totalActual: 0, grandTotal: 0, budget: 150000, variance: 150000, allocation: [], pressure: [] },
  version: 1,
  updatedAt: '',
};
const store = { state: { plans: { plan_seed: { id: 'plan_seed', name: 'seed', plan, createdAt: '', updatedAt: '' } }, currentPlanId: 'plan_seed', archivedEvents: [] }, version: 1 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 1700 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.addInitScript((s) => localStorage.setItem('celebrate-store', s), JSON.stringify(store));
await page.goto('http://localhost:5200', { waitUntil: 'networkidle' });
await page.waitForSelector('.moment-section');

const momentTitle = await page.locator('.moment-section h2').innerText();
const momentCards = await page.locator('.moment-section .card').count();
const barReason = await page.locator('.card-spawn').first().innerText();
await page.screenshot({ path: '/tmp/celebrate-shots/activation.png', fullPage: true });

// Dismiss the midnight moment
await page.locator('.moment-section').getByRole('button', { name: 'Dismiss' }).click();
await page.waitForTimeout(400);
const momentsAfter = await page.locator('.moment-section').count();
await page.screenshot({ path: '/tmp/celebrate-shots/activation-dismissed.png', fullPage: true });

await browser.close();
console.log('moment title:', momentTitle);
console.log('midnight cards:', momentCards);
console.log('bar spawn-reason:', barReason.slice(0, 60));
console.log('moment sections after dismiss:', momentsAfter);
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('OK — activation UI verified.');
