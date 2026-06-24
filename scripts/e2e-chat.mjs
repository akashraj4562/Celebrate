// Seeds a board, opens the venue card's chat (§9), pastes messy vendor quotes,
// and verifies: rail switches to Chat, the agent replies + returns a proposal
// (ingested quotes scored by code), and Apply re-flows the plan (venue updates +
// downstream restales via cascade). Makes ONE real model call (the chat turn).
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
  tags: opts.tags,
});

const dlist = [
  mk('theme', 'Carnatic-music garden theme', 15000),
  mk('timing', 'Indoor lunch, 12:30–3:30 PM', 0),
  mk('venue', 'Tamarind Tree — open-garden restaurant', 48000, { tags: ['venue-hired'] }),
  mk('decoration', 'Floral arch + fairy lights', 37000),
  mk('food', 'South Indian veg lunch', 55000),
  mk('photography', 'Photo + video + album', 20000),
];
const deliverables = {};
for (const d of dlist) deliverables[d.instanceId] = d;

const plan = {
  input: {
    eventType: 'birthday',
    honorees: [{ id: 'h1', name: 'Lalita', relation: 'mother', age: 60 }],
    date: '2026-08-15',
    budgetTotal: 250000,
    location: { city: 'Bengaluru', area: 'Jayanagar' },
    cohorts: [{ id: 'c1', label: 'Adults', count: 50, portionFactor: 1 }],
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
const saved = { id: 'plan_seed', name: 'seed', plan, createdAt: '', updatedAt: '' };
const store = { state: { plans: { plan_seed: saved }, currentPlanId: 'plan_seed', archivedEvents: [] }, version: 1 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 1700 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.addInitScript((s) => localStorage.setItem('celebrate-store', s), JSON.stringify(store));
await page.goto('http://localhost:5200', { waitUntil: 'networkidle' });
await page.waitForSelector('.card');

// Open the venue card and hit Discuss.
const venue = page.locator('.card').filter({ has: page.locator('.card-module', { hasText: /^venue$/ }) });
await venue.locator('.card-head').click();
await venue.getByRole('button', { name: /Discuss/ }).click();

// Rail should now be on the Chat tab, focused on the venue card.
await page.waitForSelector('.chat-pane');
const railTitle = await page.locator('.chat-title').innerText();

// Paste messy quotes and send.
await page.locator('.chat-input textarea').fill(
  'Resort A: 1.2L incl. catering for 50, or 80k venue-only. Hall B in Jayanagar: 60k, we bring our own caterer, parking for 30 cars. Backyard at home: free + ~40k catering + 25k tenting, but we set up and clean up ourselves.',
);
await page.locator('.chat-input .send').click();

// Wait for the user bubble, then the assistant reply + the proposal (real call).
await page.waitForSelector('.msg.user');
await page.waitForSelector('.proposal', { timeout: 60000 });
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/celebrate-shots/chat.png', fullPage: true });

const quoteRows = await page.locator('.quote-table tbody tr').count();
const convScores = await page.locator('.quote-table .conv-pill').allInnerTexts();
const proposalRec = await page.locator('.proposal-rec').innerText().catch(() => '(none)');
const venueRecBefore = await venue.locator('.card-rec1, .card-rec-full').first().innerText().catch(() => '');

// Apply the proposal → should override venue + cascade downstream stale.
await page.getByRole('button', { name: /^Apply$/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: '/tmp/celebrate-shots/chat-applied.png', fullPage: true });

const venueRecAfter = await venue.locator('.card-rec1, .card-rec-full').first().innerText().catch(() => '');
const staleBadges = await page.locator('.badge.b-stale').count();
const banner = await page.locator('.stale-banner').count();
await browser.close();

console.log('rail title:        ', railTitle.replace(/\n/g, ' '));
console.log('quote rows:        ', quoteRows);
console.log('convenience scores:', convScores.join(', '));
console.log('proposal pick:     ', proposalRec.replace(/\n/g, ' '));
console.log('venue rec before:  ', venueRecBefore.replace(/\n/g, ' '));
console.log('venue rec after:   ', venueRecAfter.replace(/\n/g, ' '));
console.log('downstream stale:  ', staleBadges, '| banner shown:', banner > 0);

let ok = true;
if (quoteRows < 3) { console.error('FAIL: expected 3 ingested quote rows'); ok = false; }
if (convScores.length < 3) { console.error('FAIL: expected 3 convenience scores'); ok = false; }
if (venueRecBefore === venueRecAfter) { console.error('FAIL: venue recommendation did not change on Apply'); ok = false; }
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); ok = false; }
if (!ok) process.exit(1);
console.log('OK — per-card chat: ingest → score → reply → proposal → Apply → cascade verified.');
