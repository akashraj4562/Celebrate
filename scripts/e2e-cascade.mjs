// Seeds a board into localStorage, promotes venue's alternative, and verifies the
// cascade (downstream goes stale + the batched banner appears). No model calls.
import { chromium } from 'playwright';

const mk = (moduleId, recommendation, cost, opts = {}) => ({
  instanceId: moduleId + '__main',
  moduleId,
  momentId: 'main',
  title: moduleId,
  recommendation,
  reasoning: ['A specific reason for ' + moduleId + '.', 'A second concrete factor.'],
  alternatives: opts.alternatives || [],
  costLines: cost ? [{ id: moduleId + 'cl', label: moduleId, amount: cost, basis: 'estimated' }] : [],
  leadTimeDays: 14,
  status: 'suggested',
  feasibility: 'ok',
  confidence: 'high',
  stale: false,
  active: true,
  locked: !!opts.locked,
  chat: [],
});

const dlist = [
  mk('theme', 'Carnatic-music garden theme', 15000),
  mk('timing', 'Indoor lunch, 12:30–3:30 PM', 0),
  mk('venue', 'Tamarind Tree — open-garden restaurant', 48000, {
    alternatives: [{ recommendation: 'A banquet hall in Jayanagar', reasoning: 'Cheaper, weather-proof, but generic.', estimatedCost: 60000 }],
  }),
  mk('decoration', 'Floral arch + fairy lights', 37000),
  mk('food', 'South Indian veg lunch', 55000),
  mk('photography', 'Photo + video + album', 20000),
  mk('gifts', 'A silk saree', 12000),
  mk('transportation', 'Shared tempo + cabs', 11000, { locked: true }),
];
const deliverables = {};
for (const d of dlist) deliverables[d.instanceId] = d;

const plan = {
  input: {
    eventType: 'birthday',
    honorees: [{ id: 'h1', name: 'Lalita', relation: 'mother', age: 60 }],
    date: '2026-07-12',
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

const venue = page.locator('.card').filter({ has: page.locator('.card-module', { hasText: /^venue$/ }) });
await venue.locator('.card-head').click();
await page.getByRole('button', { name: 'Promote' }).first().click();
await page.waitForSelector('.stale-banner', { timeout: 5000 });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/celebrate-shots/cascade.png', fullPage: true });

const bannerText = await page.locator('.stale-banner').innerText();
const staleBadges = await page.locator('.badge.b-stale').count();
await browser.close();

console.log('banner:', bannerText.replace(/\n/g, ' '));
console.log('stale badges visible:', staleBadges);
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('OK — cascade UI verified, no console errors.');
