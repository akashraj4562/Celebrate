// ── src/engine/budget.ts ────────────────────────────────────────────────────
// Bottoms-up budget recompute (spec §8). Step 8 wires the live totals + by-basis
// subtotals + variance; allocation/pressure are filled in by the cost engine
// (Step 10) and preserved here meanwhile.

import type { BudgetSummary, CostLine, PlanState } from '../types';

function addLines(lines: CostLine[], acc: { est: number; quo: number; act: number }) {
  for (const l of lines) {
    const amt = l.amount || 0;
    if (l.basis === 'actual') acc.act += amt;
    else if (l.basis === 'quoted') acc.quo += amt;
    else acc.est += amt;
  }
}

/** Recompute totals across all active deliverables (and clothing sub-items). */
export function recomputeBudget(plan: PlanState): BudgetSummary {
  const acc = { est: 0, quo: 0, act: 0 };
  for (const d of Object.values(plan.deliverables)) {
    if (!d.active) continue;
    addLines(d.costLines, acc);
    if (d.subItems) for (const si of d.subItems) addLines(si.costLines, acc);
  }
  const grandTotal = acc.est + acc.quo + acc.act;
  const budget = plan.input.budgetTotal;
  return {
    totalEstimated: acc.est,
    totalQuoted: acc.quo,
    totalActual: acc.act,
    grandTotal,
    budget,
    variance: budget - grandTotal,
    allocation: plan.budget.allocation, // preserved; the cost engine (Step 10) fills these
    pressure: plan.budget.pressure,
  };
}
