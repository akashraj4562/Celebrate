// Pure-function check for the archive engine (§12a) — no server, no browser.
// Run: npx tsx scripts/unit-archive.ts
import { buildArchivedEvent, archiveFacts, totalSpend, cardCost, isFinalized, pastEventsIndex } from '../src/engine/archive';
import type { Deliverable, PlanState } from '../src/types';

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
};

const mk = (moduleId: string, recommendation: string, cost: number, opts: Partial<Deliverable> & { basis?: 'estimated' | 'quoted' | 'actual' } = {}): Deliverable => ({
  instanceId: `${moduleId}__main`,
  moduleId: moduleId as Deliverable['moduleId'],
  momentId: 'main',
  title: moduleId,
  recommendation,
  reasoning: ['r1', 'r2'],
  alternatives: [],
  costLines: cost ? [{ id: moduleId + 'cl', label: moduleId, amount: cost, basis: opts.basis ?? 'estimated' }] : [],
  leadTimeDays: 14,
  status: opts.status ?? 'suggested',
  feasibility: 'ok',
  confidence: 'high',
  stale: false,
  active: opts.active ?? true,
  locked: opts.locked ?? false,
  chat: [],
});

const dlist: Deliverable[] = [
  mk('venue', 'Tamarind Tree — open garden', 48000, { basis: 'actual', locked: true }), // finalized + actual
  mk('photography', 'Lensanche — photo+video', 20000, { basis: 'quoted' }),             // finalized via quoted
  mk('food', 'South Indian veg lunch', 55000, { basis: 'estimated' }),                  // NOT finalized (estimate only)
  mk('gifts', 'Silk saree', 12000, { basis: 'estimated', status: 'overridden' }),       // finalized via override
  mk('decoration', 'Floral arch', 9000, { basis: 'estimated', active: false }),         // inactive → ignored everywhere
];
const deliverables: Record<string, Deliverable> = {};
for (const d of dlist) deliverables[d.instanceId] = d;

const plan: PlanState = {
  input: {
    eventType: 'birthday',
    honorees: [{ id: 'h1', name: 'Lalita', relation: 'mother', age: 60 }],
    date: '2026-05-01',
    budgetTotal: 150000,
    location: { city: 'Bengaluru' },
    cohorts: [{ id: 'c1', label: 'Adults', count: 40, portionFactor: 1 }],
    exceptions: [],
    alcohol: false,
    memoryValue: 'high',
    innerCircle: [],
  },
  moments: [{ id: 'main', label: 'Main', time: '', scope: 'full', isPrimary: true }],
  deliverables,
  budget: { totalEstimated: 0, totalQuoted: 0, totalActual: 0, grandTotal: 0, budget: 150000, variance: 0, allocation: [], pressure: [] },
  version: 1,
  updatedAt: '',
};

// cardCost basis precedence
ok(cardCost(dlist[0]).basis === 'actual', 'cardCost prefers actual');
ok(cardCost(dlist[1]).basis === 'quoted', 'cardCost falls to quoted');
ok(cardCost(dlist[2]).basis === 'estimated', 'cardCost falls to estimated');

// isFinalized
ok(isFinalized(dlist[0]) && isFinalized(dlist[1]) && isFinalized(dlist[3]), 'locked / quoted / overridden are finalized');
ok(!isFinalized(dlist[2]), 'estimate-only suggested card is NOT finalized');

// totalSpend = active cards' best cost, no double-count; decoration (inactive) excluded
ok(totalSpend(plan) === 48000 + 20000 + 55000 + 12000, `totalSpend sums active best-cost = 135000 (got ${totalSpend(plan)})`);

// facts = finalized active only (venue, photography, gifts), food excluded, decoration excluded
const facts = archiveFacts(plan);
ok(facts.length === 3, `archiveFacts has 3 finalized facts (got ${facts.length})`);
ok(facts.every((f) => f.category && f.detail), 'each fact has category + detail');
ok(facts.find((f) => f.detail.includes('Tamarind'))?.actualCost === 48000, 'venue fact carries actual cost');

// buildArchivedEvent shape
const ev = buildArchivedEvent(plan, '  the garden was perfect  ');
ok(ev.id.startsWith('arch_'), 'event id prefixed arch_');
ok(ev.eventType === 'birthday' && ev.honorees[0] === 'Lalita', 'event carries type + honoree names');
ok(ev.totalSpend === 135000, 'event totalSpend matches');
ok(ev.whatWorked === 'the garden was perfect', 'whatWorked is trimmed');
ok(buildArchivedEvent(plan).whatWorked === undefined, 'empty note omitted');

// pastEventsIndex string
const idx = pastEventsIndex([ev]);
ok(idx.includes('birthday for Lalita') && idx.includes('Rs.') && idx.includes('Tamarind'), 'pastEventsIndex is compact + names vendors');
ok(pastEventsIndex([]) === '', 'empty index is empty string');

console.log(failures === 0 ? '\nOK — archive engine verified.' : `\nFAILED — ${failures} assertion(s).`);
process.exit(failures === 0 ? 0 : 1);
