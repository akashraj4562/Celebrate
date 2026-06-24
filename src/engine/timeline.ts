// ── src/engine/timeline.ts ──────────────────────────────────────────────────
// The prep timeline (spec §7e) — pure, derived from each deliverable's
// leadTimeDays. action-by date = eventDate − leadTimeDays; items bucket by how
// soon they must be actioned; the "Start planning by" date is the longest pole
// (eventDate − max leadTime across active deliverables). Recomputed live.

import { daysLeft } from '../lib/plan';
import type { Feasibility, ModuleId, PlanState } from '../types';

export interface PrepItem {
  instanceId: string;
  moduleId: ModuleId;
  title: string;
  momentLabel?: string;
  leadTimeDays: number;
  actionBy: string; // ISO date
  daysUntilAction: number;
  feasibility: Feasibility;
}

export interface PrepBucket {
  id: string;
  label: string;
  tone: 'red' | 'now' | 'normal' | 'final';
  items: PrepItem[];
}

export interface PrepTimeline {
  startByDate: string | null;
  daysUntilStart: number | null;
  buckets: PrepBucket[];
}

function subDaysIso(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const BUCKET_DEFS: { id: string; label: string; tone: PrepBucket['tone'] }[] = [
  { id: 'infeasible', label: 'Tight on time', tone: 'red' },
  { id: 'now', label: 'Do now', tone: 'now' },
  { id: 'week', label: 'This week', tone: 'normal' },
  { id: 'weeks', label: 'In the coming weeks', tone: 'normal' },
  { id: 'later', label: 'Plenty of time yet', tone: 'normal' },
  { id: 'final', label: 'Final days before the event', tone: 'final' },
];

export function computeTimeline(plan: PlanState): PrepTimeline {
  const eventDate = plan.input.date;
  const momentLabelOf = (id: string) => plan.moments.find((m) => m.id === id && !m.isPrimary)?.label;

  const items: PrepItem[] = Object.values(plan.deliverables)
    .filter((d) => d.active)
    .map((d) => {
      const actionBy = subDaysIso(eventDate, d.leadTimeDays);
      return {
        instanceId: d.instanceId,
        moduleId: d.moduleId,
        title: d.title,
        momentLabel: momentLabelOf(d.momentId),
        leadTimeDays: d.leadTimeDays,
        actionBy,
        daysUntilAction: daysLeft(actionBy),
        feasibility: d.feasibility,
      };
    });

  const maxLead = items.length ? Math.max(...items.map((i) => i.leadTimeDays)) : 0;
  const startByDate = items.length ? subDaysIso(eventDate, maxLead) : null;
  const daysUntilStart = startByDate ? daysLeft(startByDate) : null;

  const bucketOf = (it: PrepItem): string => {
    if (it.feasibility === 'infeasible') return 'infeasible';
    if (it.leadTimeDays <= 4) return 'final'; // cake, bouquet, balloons — done last by nature
    if (it.daysUntilAction <= 2) return 'now';
    if (it.daysUntilAction <= 7) return 'week';
    if (it.daysUntilAction <= 30) return 'weeks';
    return 'later';
  };

  const buckets = BUCKET_DEFS.map((b) => ({
    ...b,
    items: items.filter((i) => bucketOf(i) === b.id).sort((a, c) => a.daysUntilAction - c.daysUntilAction),
  })).filter((b) => b.items.length > 0);

  return { startByDate, daysUntilStart, buckets };
}
