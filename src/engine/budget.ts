// ── src/engine/budget.ts ────────────────────────────────────────────────────
// The cost engine (spec §8). Bottoms-up, INR, defensible. Computes by-basis
// subtotals + grand total + variance, plus allocation (target % vs actual, with
// reasoning) and per-category budget pressure (under/ok/over). Pure — recomputed
// on every store mutation.

import type { BudgetSummary, CostLine, MemoryValue, ModuleId, PlanState } from '../types';

type Category = 'gifts' | 'venueFood' | 'decor' | 'photo' | 'transport' | 'other';

const CATEGORY_OF: Partial<Record<ModuleId, Category>> = {
  gifts: 'gifts',
  notes: 'gifts',
  midnightGifts: 'gifts',
  venue: 'venueFood',
  food: 'venueFood',
  caterer: 'venueFood',
  rentals: 'venueFood',
  bar: 'venueFood',
  midnightCake: 'venueFood',
  theme: 'decor',
  decoration: 'decor',
  lighting: 'decor',
  comfortMitigation: 'decor',
  weatherBackup: 'decor',
  midnightDecor: 'decor',
  midnightBouquet: 'decor',
  wakeupBalloons: 'decor',
  photography: 'photo',
  content: 'photo',
  transportation: 'transport',
};
const categoryOf = (m: ModuleId): Category => CATEGORY_OF[m] ?? 'other';

const CATEGORY_ORDER: Category[] = ['venueFood', 'gifts', 'photo', 'decor', 'transport', 'other'];
const CATEGORY_LABEL: Record<Category, string> = {
  gifts: 'Gifts & Notes',
  venueFood: 'Venue & Food',
  decor: 'Decor & Theme',
  photo: 'Photo & Video',
  transport: 'Transport',
  other: 'Everything else',
};

// Sensible default split; shifts toward Photo for once-in-a-lifetime events.
function targets(mv: MemoryValue): Record<Category, { pct: number; reason: string }> {
  const high = mv === 'high';
  return {
    venueFood: { pct: high ? 40 : 45, reason: 'The biggest line — where the guests actually spend the day.' },
    gifts: { pct: 25, reason: 'The emotional core — the gift and the words are what’s remembered.' },
    photo: {
      pct: high ? 15 : 10,
      reason: high
        ? 'Once-in-a-lifetime: the one thing you can’t redo later — worth over-investing.'
        : 'The keepsake that outlives the day.',
    },
    decor: { pct: 10, reason: 'Sets the mood; scales with the space, not the guest count.' },
    transport: { pct: 5, reason: 'Getting everyone there and home — matters more with elders or alcohol.' },
    other: { pct: 5, reason: 'Outfits, activities, the small things, and a buffer.' },
  };
}

const sumLines = (ls: CostLine[]) => ls.reduce((s, l) => s + (l.amount || 0), 0);

function addByBasis(lines: CostLine[], acc: { est: number; quo: number; act: number }) {
  for (const l of lines) {
    const amt = l.amount || 0;
    if (l.basis === 'actual') acc.act += amt;
    else if (l.basis === 'quoted') acc.quo += amt;
    else acc.est += amt;
  }
}

export function recomputeBudget(plan: PlanState): BudgetSummary {
  const acc = { est: 0, quo: 0, act: 0 };
  const byCat: Record<Category, number> = { gifts: 0, venueFood: 0, decor: 0, photo: 0, transport: 0, other: 0 };

  for (const d of Object.values(plan.deliverables)) {
    if (!d.active) continue;
    addByBasis(d.costLines, acc);
    let total = sumLines(d.costLines);
    if (d.subItems) {
      for (const si of d.subItems) {
        addByBasis(si.costLines, acc);
        total += sumLines(si.costLines);
      }
    }
    byCat[categoryOf(d.moduleId)] += total;
  }

  const grandTotal = acc.est + acc.quo + acc.act;
  const budget = plan.input.budgetTotal;
  const tp = targets(plan.input.memoryValue);

  const allocation = CATEGORY_ORDER.map((c) => ({
    category: CATEGORY_LABEL[c],
    targetPct: tp[c].pct,
    actual: byCat[c],
    reason: tp[c].reason,
  }));

  const pressure = CATEGORY_ORDER.map((c) => {
    const target = (budget * tp[c].pct) / 100;
    const a = byCat[c];
    const state: 'under' | 'ok' | 'over' = a > target * 1.05 ? 'over' : a < target * 0.5 ? 'under' : 'ok';
    return { category: CATEGORY_LABEL[c], state };
  });

  return {
    totalEstimated: acc.est,
    totalQuoted: acc.quo,
    totalActual: acc.act,
    grandTotal,
    budget,
    variance: budget - grandTotal,
    allocation,
    pressure,
  };
}
