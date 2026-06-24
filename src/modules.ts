// ── src/modules.ts ──────────────────────────────────────────────────────────
// The module registry (spec §4) + the dependency graph that drives generation
// order and the cascade engine.
//
// Two kinds of edge, kept separate (Tech Lead P0-2):
//   • `dependsOn`: module → module edges. These form a DAG; generation order is
//     its topological sort, and the cascade walks its transitive closure.
//   • `inputs`: which EventInput fields a module reads. Changing one of these
//     marks the module (and its module-graph downstream) stale.
//
// `itinerary` depends on the EXACT set of modules that set the emotional pacing
// (not the spec's vague "most modules"), and `content` is a leaf — nothing
// depends on it — so the graph is provably acyclic. A load-time guard throws if
// that ever stops being true.

import type { ModuleId } from './types';

export type ModuleGroup = 'setting' | 'people' | 'gifts' | 'logistics' | 'capture';
export type ModuleKind = 'always' | 'conditional' | 'moment';
export type MomentSlot = 'primary' | 'midnight' | 'morning';

export type InputField =
  | 'eventType'
  | 'honorees'
  | 'date'
  | 'location'
  | 'budgetTotal'
  | 'cohorts'
  | 'exceptions'
  | 'alcohol'
  | 'memoryValue'
  | 'innerCircle';

export interface ModuleDef {
  id: ModuleId;
  title: string;
  group: ModuleGroup;
  kind: ModuleKind;
  moment: MomentSlot; // default moment placement
  dependsOn: ModuleId[]; // module → module edges (the DAG)
  inputs: InputField[]; // EventInput fields that trigger staleness
}

const def = (
  id: ModuleId,
  title: string,
  group: ModuleGroup,
  kind: ModuleKind,
  dependsOn: ModuleId[],
  inputs: InputField[],
  moment: MomentSlot = 'primary',
): ModuleDef => ({ id, title, group, kind, moment, dependsOn, inputs });

export const MODULES: Record<ModuleId, ModuleDef> = {
  // ── always-active ──
  theme: def('theme', 'Theme', 'setting', 'always', [], ['honorees']),
  timing: def('timing', 'Timing & Setting', 'setting', 'always', [], ['location', 'date', 'honorees', 'cohorts']),
  venue: def('venue', 'Venue', 'setting', 'always', ['timing', 'theme'], ['budgetTotal', 'cohorts']),
  dressCode: def('dressCode', 'Dress Code', 'people', 'always', ['venue'], ['honorees', 'date']),
  clothing: def('clothing', 'Outfits to Buy', 'people', 'always', ['dressCode'], ['innerCircle', 'date']),
  gifts: def('gifts', 'Gifts', 'gifts', 'always', [], ['honorees', 'budgetTotal', 'memoryValue']),
  decoration: def('decoration', 'Decoration', 'setting', 'always', ['theme', 'venue'], []),
  photography: def('photography', 'Photo / Video', 'capture', 'always', ['venue'], ['memoryValue', 'cohorts']),
  food: def('food', 'Food & Menu', 'setting', 'always', ['timing', 'venue'], ['cohorts', 'exceptions']),
  transportation: def('transportation', 'Transportation', 'logistics', 'always', ['venue'], ['cohorts', 'honorees', 'alcohol']),
  activities: def('activities', 'Activities', 'people', 'always', [], ['eventType', 'budgetTotal', 'date', 'honorees']),
  notes: def('notes', 'Notes & Messages', 'gifts', 'always', [], ['honorees', 'memoryValue']),
  itinerary: def('itinerary', 'Itinerary', 'capture', 'always', ['timing', 'venue', 'activities', 'gifts', 'notes', 'food'], ['memoryValue']),
  content: def('content', 'Reels & Content', 'capture', 'always', ['itinerary', 'theme'], []),

  // ── conditional (spawned by activation rules, §6) ──
  caterer: def('caterer', 'Caterer', 'logistics', 'conditional', ['venue'], ['cohorts']),
  rentals: def('rentals', 'Rentals', 'logistics', 'conditional', ['venue'], ['cohorts']),
  weatherBackup: def('weatherBackup', 'Weather Backup', 'setting', 'conditional', ['timing', 'venue'], []),
  lighting: def('lighting', 'Lighting', 'setting', 'conditional', ['timing', 'venue'], []),
  comfortMitigation: def('comfortMitigation', 'Heat / Insect Mitigation', 'setting', 'conditional', ['timing', 'venue'], []),
  bar: def('bar', 'Bar', 'logistics', 'conditional', [], ['alcohol', 'cohorts']),
  kidsProgram: def('kidsProgram', 'Kids Menu & Entertainment', 'people', 'conditional', [], ['cohorts']),
  seatingPlan: def('seatingPlan', 'Seating Plan', 'people', 'conditional', ['venue'], ['honorees', 'exceptions']),

  // ── midnight moment (§4a) ──
  midnightCake: def('midnightCake', 'Midnight Cake', 'setting', 'moment', [], ['honorees'], 'midnight'),
  midnightBouquet: def('midnightBouquet', 'Midnight Bouquet', 'setting', 'moment', [], ['honorees'], 'midnight'),
  midnightGifts: def('midnightGifts', 'Midnight Gifts', 'gifts', 'moment', [], ['honorees'], 'midnight'),
  midnightDecor: def('midnightDecor', 'Midnight Home Setup', 'setting', 'moment', [], [], 'midnight'),

  // ── morning moment (§4a) ──
  wakeupBalloons: def('wakeupBalloons', 'Wake-up Balloons', 'setting', 'moment', [], [], 'morning'),
};

export const ALL_MODULE_IDS = Object.keys(MODULES) as ModuleId[];
export const ALWAYS_ACTIVE_IDS = ALL_MODULE_IDS.filter((id) => MODULES[id].kind === 'always');

export const GROUP_ORDER: ModuleGroup[] = ['setting', 'people', 'gifts', 'logistics', 'capture'];
export const GROUP_LABEL: Record<ModuleGroup, string> = {
  setting: 'Setting',
  people: 'People',
  gifts: 'Gifts & Notes',
  logistics: 'Logistics',
  capture: 'Capture',
};

/**
 * Topological sort (Kahn) over the subgraph induced by `activeIds`, using only
 * edges where both endpoints are active. Returns ids in dependency order (deps
 * before dependents). Throws on any cycle.
 */
export function generationOrder(activeIds: ModuleId[] = ALWAYS_ACTIVE_IDS): ModuleId[] {
  const active = new Set(activeIds);
  const indegree = new Map<ModuleId, number>();
  const dependents = new Map<ModuleId, ModuleId[]>(); // dep → modules that depend on it

  for (const id of activeIds) {
    indegree.set(id, 0);
    dependents.set(id, []);
  }
  for (const id of activeIds) {
    for (const dep of MODULES[id].dependsOn) {
      if (!active.has(dep)) continue; // ignore edges to inactive modules
      indegree.set(id, (indegree.get(id) ?? 0) + 1);
      dependents.get(dep)!.push(id);
    }
  }

  const queue = activeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: ModuleId[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const dependent of dependents.get(id)!) {
      const d = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, d);
      if (d === 0) queue.push(dependent);
    }
  }

  if (order.length !== activeIds.length) {
    const cyclic = activeIds.filter((id) => !order.includes(id));
    throw new Error(`Module dependency graph has a cycle involving: ${cyclic.join(', ')}`);
  }
  return order;
}

/**
 * Every active module that depends — directly or transitively — on `changed`.
 * Used by the cascade engine to mark downstream cards stale.
 */
export function transitiveDependents(changed: ModuleId, activeIds: ModuleId[] = ALWAYS_ACTIVE_IDS): ModuleId[] {
  const active = new Set(activeIds);
  const directDependents = (dep: ModuleId) =>
    activeIds.filter((id) => MODULES[id].dependsOn.includes(dep));
  const out = new Set<ModuleId>();
  const stack = [...directDependents(changed)];
  while (stack.length) {
    const id = stack.pop()!;
    if (!active.has(id) || out.has(id)) continue;
    out.add(id);
    for (const next of directDependents(id)) stack.push(next);
  }
  return [...out];
}

/** Modules whose `inputs` include the given EventInput field. */
export function modulesReadingInput(field: InputField, activeIds: ModuleId[] = ALWAYS_ACTIVE_IDS): ModuleId[] {
  return activeIds.filter((id) => MODULES[id].inputs.includes(field));
}

// ── Load-time DAG guard (Tech Lead P0-2): fail fast if the graph ever cycles. ──
generationOrder(ALL_MODULE_IDS);
