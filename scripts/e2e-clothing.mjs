// Seeds a clothing card with per-person sub-items + code-built shoppable links,
// then verifies the sub-cards render with per-person cost, the card total sums the
// sub-items, and the link chips carry real search URLs (no fabricated SKU). No model calls.
import { chromium } from 'playwright';

const link = (label, url) => ({ label, url, kind: 'search' });

const clothing = {
  instanceId: 'clothing__main',
  moduleId: 'clothing',
  momentId: 'main',
  title: 'Outfits to Buy',
  recommendation: 'Coordinated jewel-tone family looks anchored to the silk dress code',
  reasoning: [
    '12 days out: a custom-stitched / tailored outfit is realistic — online or in-store both work.',
    'Inherits the emerald + gold palette from the dress code so the family photographs as a set.',
  ],
  alternatives: [],
  costLines: [],
  leadTimeDays: 12,
  status: 'suggested',
  feasibility: 'ok',
  confidence: 'high',
  stale: false,
  active: true,
  locked: false,
  chat: [],
  tags: [],
  subItems: [
    {
      id: 'si1',
      personId: 'h1',
      personName: 'Lalita',
      recommendation: 'Emerald green Kanjeevaram silk saree with gold zari border',
      reasoning: ['Matches the dress-code palette.', 'Festive yet comfortable, seated-friendly for a 60th.'],
      costLines: [{ id: 'c1', label: 'Saree', amount: 18000, basis: 'estimated' }],
      links: [
        link('Myntra · emerald green silk saree', 'https://www.myntra.com/emerald-green-silk-saree'),
        link('Ajio · emerald green silk saree', 'https://www.ajio.com/search/?text=emerald%20green%20silk%20saree'),
      ],
      size: 'free / 6.3m',
      styleNotes: 'prefers traditional',
      status: 'suggested',
      locked: false,
      chat: [],
    },
    {
      id: 'si2',
      personId: 'h2',
      personName: 'Arjun',
      recommendation: 'Navy bandhgala with a gold pocket-square',
      reasoning: ['Picks up the gold accent.', 'Formal enough for the resort norm.'],
      costLines: [{ id: 'c2', label: 'Bandhgala', amount: 12000, basis: 'estimated' }],
      links: [link('Myntra · navy bandhgala men', 'https://www.myntra.com/navy-bandhgala-men')],
      size: '40',
      status: 'suggested',
      locked: false,
      chat: [],
    },
  ],
};

const deliverables = { [clothing.instanceId]: clothing };
const plan = {
  input: {
    eventType: 'birthday',
    honorees: [{ id: 'h1', name: 'Lalita', relation: 'mother', age: 60 }],
    date: '2026-09-01',
    budgetTotal: 150000,
    location: { city: 'Bengaluru' },
    cohorts: [{ id: 'co1', label: 'Adults', count: 40, portionFactor: 1 }],
    exceptions: [],
    alcohol: false,
    memoryValue: 'high',
    innerCircle: [{ id: 'h1', name: 'Lalita', relation: 'mother' }, { id: 'h2', name: 'Arjun', relation: 'son' }],
  },
  moments: [{ id: 'main', label: 'Main celebration', time: '', scope: 'full', isPrimary: true }],
  deliverables,
  budget: { totalEstimated: 0, totalQuoted: 0, totalActual: 0, grandTotal: 0, budget: 150000, variance: 150000, allocation: [], pressure: [] },
  version: 1,
  updatedAt: '',
};
const store = { state: { plans: { plan_seed: { id: 'plan_seed', name: 'seed', plan, createdAt: '', updatedAt: '' } }, currentPlanId: 'plan_seed', archivedEvents: [] }, version: 1 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 1400 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.addInitScript((s) => localStorage.setItem('celebrate-store', s), JSON.stringify(store));
await page.goto('http://localhost:5200', { waitUntil: 'networkidle' });
await page.waitForSelector('.card');

const card = page.locator('.card').filter({ has: page.locator('.card-module', { hasText: /^clothing$/ }) });
// Card head shows the summed sub-item total (18000 + 12000 = 30000), not "no direct cost".
const headCost = await card.locator('.card-cost .amt').innerText();
await card.locator('.card-head').click();
await page.waitForSelector('.subcard');

const subCount = await page.locator('.subcard').count();
const names = await page.locator('.subcard-name').allInnerTexts();
const chips = page.locator('.shop-chip');
const chipCount = await chips.count();
const hrefs = await chips.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
await page.screenshot({ path: '/tmp/celebrate-shots/clothing.png', fullPage: true });
await browser.close();

console.log('head cost:', headCost, '| sub-cards:', subCount, names.join(', '));
console.log('chips:', chipCount);
console.log('hrefs:', JSON.stringify(hrefs));

let bad = 0;
const assert = (c, m) => { if (!c) { console.error('✗ ' + m); bad++; } };
assert(headCost.includes('30,000'), 'card total sums sub-item costs (₹30,000)');
assert(subCount === 2, 'two per-person sub-cards render');
assert(names.includes('Lalita') && names.includes('Arjun'), 'both honoree names shown');
assert(chipCount === 3, 'three shoppable link chips render');
assert(hrefs.every((h) => /^https:\/\/(www\.myntra\.com|www\.ajio\.com)/.test(h)), 'chips point at real platform search URLs');
assert(hrefs.every((h) => !/SKU|FAKE|\/p\//i.test(h || '')), 'no fabricated product/SKU URLs');
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
if (bad) { console.error(`\nFAILED — ${bad} assertion(s).`); process.exit(1); }
console.log('\nOK — clothing sub-cards + shoppable links verified, no console errors.');
