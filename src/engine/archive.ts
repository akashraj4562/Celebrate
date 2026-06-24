// ── src/engine/archive.ts ───────────────────────────────────────────────────
// Past-event archive (spec §12a). Pure functions: snapshot a finished plan into
// an ArchivedEvent of ACTUALS (real vendors + real per-category spend, not the
// estimates), and derive the compact `pastEventsIndex` the chat agent reads so it
// can answer "what did the cake cost last Diwali?" / "use the same photographer".

import type { ArchivedEvent, ArchivedFact, Deliverable, PlanState } from '../types';
import { uid } from '../lib/plan';
import { GROUP_ORDER, MODULES } from '../modules';

/** Best-available spend for a card: prefer actual, then quoted, then estimated. */
export function cardCost(d: Deliverable): { amount: number; basis: 'actual' | 'quoted' | 'estimated' | 'none' } {
  const sum = (b: string) => d.costLines.filter((l) => l.basis === b).reduce((n, l) => n + l.amount, 0);
  const actual = sum('actual');
  if (actual > 0) return { amount: actual, basis: 'actual' };
  const quoted = sum('quoted');
  if (quoted > 0) return { amount: quoted, basis: 'quoted' };
  const est = sum('estimated');
  if (est > 0) return { amount: est, basis: 'estimated' };
  return { amount: 0, basis: 'none' };
}

/** A card is a "finalized decision" worth remembering if the user committed to it. */
export function isFinalized(d: Deliverable): boolean {
  return d.locked || d.status === 'overridden' || d.costLines.some((l) => l.basis === 'actual' || l.basis === 'quoted');
}

const groupRank = (d: Deliverable): number => {
  const g = MODULES[d.moduleId]?.group;
  const i = g ? GROUP_ORDER.indexOf(g) : -1;
  return i < 0 ? GROUP_ORDER.length : i;
};

/** The vendors/decisions worth carrying forward — locked, overridden, or with a real (quoted/actual) cost. */
export function archiveFacts(plan: PlanState): ArchivedFact[] {
  return Object.values(plan.deliverables)
    .filter((d) => d.active && isFinalized(d))
    .sort((a, b) => groupRank(a) - groupRank(b))
    .map((d) => {
      const { amount } = cardCost(d);
      const fact: ArchivedFact = {
        category: MODULES[d.moduleId]?.title ?? d.title,
        detail: d.recommendation,
      };
      if (amount > 0) fact.actualCost = amount;
      return fact;
    });
}

/** Real total spend = each active card's most-final cost line, summed (no double-count). */
export function totalSpend(plan: PlanState): number {
  return Object.values(plan.deliverables)
    .filter((d) => d.active)
    .reduce((n, d) => n + cardCost(d).amount, 0);
}

/** Snapshot a finished plan into an archivable record of actuals. */
export function buildArchivedEvent(plan: PlanState, whatWorked?: string): ArchivedEvent {
  const event: ArchivedEvent = {
    id: uid('arch'),
    eventType: plan.input.eventType,
    honorees: plan.input.honorees.map((h) => h.name),
    date: plan.input.date,
    totalSpend: totalSpend(plan),
    facts: archiveFacts(plan),
  };
  const note = whatWorked?.trim();
  if (note) event.whatWorked = note;
  return event;
}

/** Compact, token-cheap index of past events for the chat agent (§12a / §11). */
export function pastEventsIndex(events: ArchivedEvent[]): string {
  if (events.length === 0) return '';
  const inr = (n: number) => 'Rs.' + Math.round(n).toLocaleString('en-IN');
  return events
    .slice(0, 12)
    .map((e) => {
      const facts = e.facts
        .map((f) => `${f.category}: ${f.detail}${f.actualCost ? ` (${inr(f.actualCost)})` : ''}`)
        .join('; ');
      return [
        `• ${e.eventType} for ${e.honorees.join(' & ')} on ${e.date} — total ${inr(e.totalSpend)}.`,
        facts ? ` Actuals — ${facts}.` : '',
        e.whatWorked ? ` What worked: ${e.whatWorked}` : '',
      ].join('');
    })
    .join('\n');
}
