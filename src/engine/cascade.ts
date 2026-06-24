// ── src/engine/cascade.ts ───────────────────────────────────────────────────
// The cascade engine (spec §5) — VALUE edges. When a module's value changes
// (override, alternative-promote, chat-apply), every module that depends on it
// (directly or transitively) goes stale — UNLESS it is locked. Locks are
// absolute: a locked card is never marked stale and never overwritten. The
// budget recomputes after.
//
// Cascade is scoped to the changed module's Moment (a midnight-cake change
// doesn't stale the main-party board). Generation does NOT cascade — the wave
// order already produces fresh downstream values; cascade is for USER changes.

import { recomputeBudget } from './budget';
import { transitiveDependents } from '../modules';
import type { ModuleId, PlanState } from '../types';
import { instanceIdOf } from '../types';

/** Mark the transitive downstream of `changedModuleId` (within `momentId`) stale. */
export function cascadeFrom(plan: PlanState, changedModuleId: ModuleId, momentId: string): PlanState {
  const present = Object.values(plan.deliverables)
    .filter((d) => d.momentId === momentId && d.active)
    .map((d) => d.moduleId);

  const downstream = transitiveDependents(changedModuleId, present);
  const deliverables = { ...plan.deliverables };
  for (const dep of downstream) {
    const inst = instanceIdOf(dep, momentId);
    const d = deliverables[inst];
    if (d && !d.locked && !d.stale) deliverables[inst] = { ...d, stale: true };
  }

  const next: PlanState = { ...plan, deliverables };
  return { ...next, budget: recomputeBudget(next) };
}
