// ── src/engine/activation.ts ────────────────────────────────────────────────
// The activation engine (spec §6) — EXISTENCE edges. Rules are evaluated against
// the PlanState; when one fires it spawns conditional modules (and, for the
// midnight/morning rules, a Moment). When a rule stops being true, the spawned
// module is deactivated if it is unlocked & unedited; if the user locked or
// edited it, it is kept and flagged `orphaned`. Spawned modules are returned for
// generation; the caller generates them and then they flow through the cascade.
//
// Content-dependent conditions (venue at-home, timing outdoor/evening) read the
// machine-readable `tags` the generator emits — never free-text parsing.

import { MODULES } from '../modules';
import {
  MIDNIGHT_MOMENT_ID,
  MORNING_MOMENT_ID,
  PRIMARY_MOMENT_ID,
  instanceIdOf,
  type Moment,
  type ModuleId,
  type MomentScope,
  type PlanState,
} from '../types';

const MOMENT_ID: Record<'primary' | 'midnight' | 'morning', string> = {
  primary: PRIMARY_MOMENT_ID,
  midnight: MIDNIGHT_MOMENT_ID,
  morning: MORNING_MOMENT_ID,
};

// ── condition helpers ──
const tag = (s: PlanState, moduleId: ModuleId, t: string) =>
  s.deliverables[instanceIdOf(moduleId, PRIMARY_MOMENT_ID)]?.tags?.includes(t) ?? false;

const headcount = (s: PlanState) => s.input.cohorts.reduce((n, c) => n + (c.count || 0), 0);
const kidsCount = (s: PlanState) =>
  s.input.cohorts.filter((c) => c.isKids).reduce((n, c) => n + (c.count || 0), 0);
const hasLimitedMobility = (s: PlanState) =>
  s.input.honorees.some((h) => h.mobility === 'limited') ||
  s.input.exceptions.some((x) => /elder|wheelchair|mobility|walking|knee|old age|grandmother|grandfather/i.test(x.note));
const isBirthday = (s: PlanState) => /birthday|bday/i.test(s.input.eventType);
const youngestAge = (s: PlanState) =>
  Math.min(999, ...s.input.honorees.map((h) => h.age ?? 999));

interface ActivationRule {
  id: string;
  when: (s: PlanState) => boolean;
  activate: ModuleId[];
  reason: string;
  moment?: { id: string; label: string; time: string; scope: MomentScope };
}

export const ACTIVATION_RULES: ActivationRule[] = [
  {
    id: 'home-catering',
    when: (s) => tag(s, 'venue', 'at-home') && headcount(s) > 15,
    activate: ['caterer', 'rentals'],
    reason: "Self-cooking breaks past ~15 guests — you'll need catering + rented seating/tableware.",
  },
  {
    id: 'outdoor-backup',
    when: (s) => tag(s, 'timing', 'outdoor'),
    activate: ['weatherBackup', 'comfortMitigation'],
    reason: "Outdoor events have failure modes indoor ones don't — a weather fallback and a heat/insect plan are non-optional for a dated event.",
  },
  {
    id: 'outdoor-evening-light',
    when: (s) => tag(s, 'timing', 'outdoor') && (tag(s, 'timing', 'evening') || tag(s, 'timing', 'night')),
    activate: ['lighting'],
    reason: 'An outdoor evening needs a lighting plan once the sun sets.',
  },
  {
    id: 'alcohol',
    when: (s) => s.input.alcohol,
    activate: ['bar'],
    reason: 'Alcohol adds a bar line and makes safe transport important.',
  },
  {
    id: 'kids',
    when: (s) => kidsCount(s) > 0,
    activate: ['kidsProgram'],
    reason: 'Kids present — a kids menu and supervised entertainment keep them happy and parents relaxed.',
  },
  {
    id: 'mobility',
    when: (s) => hasLimitedMobility(s),
    activate: ['seatingPlan'],
    reason: 'An elderly / limited-mobility guest — seating, daytime timing and step-free access reduce friction.',
  },
  {
    id: 'midnight-celebration',
    when: (s) => isBirthday(s),
    activate: ['midnightCake', 'midnightBouquet', 'midnightGifts', 'midnightDecor'],
    reason: 'An intimate 12am family cake-cutting is near-universal for Indian birthdays — cake, flowers, a personal gift, a little home setup. Dismiss if you don’t want it.',
    moment: { id: MIDNIGHT_MOMENT_ID, label: 'Midnight cake-cutting (family)', time: '00:00', scope: 'family' },
  },
  {
    id: 'morning-balloons',
    when: (s) => isBirthday(s) && youngestAge(s) <= 6,
    activate: ['wakeupBalloons'],
    reason: 'For a young child, waking to a room full of balloons is a small, high-joy ritual — set it up the night before. Dismiss if you don’t want it.',
    moment: { id: MORNING_MOMENT_ID, label: 'Birthday-morning wake-up', time: '07:00', scope: 'family' },
  },
];

export interface ActivationOutcome {
  plan: PlanState;
  spawn: { moduleId: ModuleId; reason: string }[];
}

const momentIdFor = (moduleId: ModuleId, ruleMomentId?: string): string => {
  const slot = MODULES[moduleId].moment;
  return slot === 'primary' ? PRIMARY_MOMENT_ID : ruleMomentId ?? MOMENT_ID[slot];
};

/**
 * Evaluate all rules; add/remove Moments, deactivate no-longer-needed conditional
 * modules, and return the modules that must now be generated (with their reason).
 */
export function activate(plan: PlanState): ActivationOutcome {
  const dismissed = new Set(plan.dismissedMoments ?? []);
  const moments: Moment[] = [...plan.moments];
  const deliverables = { ...plan.deliverables };
  const desired = new Map<string, string>(); // instanceId -> reason
  const desiredMomentIds = new Set<string>();
  const spawn: { moduleId: ModuleId; reason: string }[] = [];

  for (const rule of ACTIVATION_RULES) {
    if (rule.moment && dismissed.has(rule.moment.id)) continue;
    if (!rule.when(plan)) continue;

    if (rule.moment) {
      desiredMomentIds.add(rule.moment.id);
      if (!moments.some((m) => m.id === rule.moment!.id)) {
        moments.push({
          id: rule.moment.id,
          label: rule.moment.label,
          time: rule.moment.time,
          scope: rule.moment.scope,
          reason: rule.reason,
        });
      }
    }
    for (const mid of rule.activate) {
      const inst = instanceIdOf(mid, momentIdFor(mid, rule.moment?.id));
      desired.set(inst, rule.reason);
      if (!deliverables[inst] && !spawn.some((sp) => sp.moduleId === mid)) {
        spawn.push({ moduleId: mid, reason: rule.reason });
      }
    }
  }

  // Deactivate present conditional / moment instances that are no longer desired.
  for (const [inst, d] of Object.entries(deliverables)) {
    const kind = MODULES[d.moduleId].kind;
    if (kind !== 'conditional' && kind !== 'moment') continue;
    if (desired.has(inst)) {
      if (!d.reason) deliverables[inst] = { ...d, reason: desired.get(inst) };
      continue;
    }
    if (!d.locked && d.status === 'suggested') {
      delete deliverables[inst]; // clean deactivation
    } else {
      deliverables[inst] = { ...d, orphaned: true }; // user-touched — keep but flag
    }
  }

  // Drop auto-added moments that ended up with no deliverables.
  const keptMoments = moments.filter(
    (m) => m.isPrimary || desiredMomentIds.has(m.id) || Object.values(deliverables).some((d) => d.momentId === m.id),
  );

  return { plan: { ...plan, moments: keptMoments, deliverables }, spawn };
}
