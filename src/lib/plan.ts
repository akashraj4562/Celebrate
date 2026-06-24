// ── src/lib/plan.ts ─────────────────────────────────────────────────────────
// Pure construction helpers for plan state. Reused by the store and (later) the
// cascade / activation / budget engines.

import type { BudgetSummary, EventInput, Moment, PlanState } from '../types';
import { PRIMARY_MOMENT_ID } from '../types';

/** Short, collision-resistant id. */
export function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return prefix ? `${prefix}_${raw}` : raw;
}

/** A zeroed budget anchored to the user's total. */
export function emptyBudget(budget: number): BudgetSummary {
  return {
    totalEstimated: 0,
    totalQuoted: 0,
    totalActual: 0,
    grandTotal: 0,
    budget,
    variance: budget,
    allocation: [],
    pressure: [],
  };
}

/** The single primary Moment every plan starts with (the main party). */
export function primaryMoment(): Moment {
  return {
    id: PRIMARY_MOMENT_ID,
    label: 'Main celebration',
    time: '',
    scope: 'full',
    isPrimary: true,
  };
}

/** A fresh plan from raw input — no deliverables yet (those come from generate-all). */
export function newPlanState(input: EventInput): PlanState {
  return {
    input,
    moments: [primaryMoment()],
    deliverables: {},
    budget: emptyBudget(input.budgetTotal),
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

/** Days from today (UTC date math) until the event; can be negative if past. */
export function daysLeft(isoDate: string, from: Date = new Date()): number {
  const event = new Date(isoDate);
  const a = Date.UTC(event.getFullYear(), event.getMonth(), event.getDate());
  const b = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a - b) / 86_400_000);
}
