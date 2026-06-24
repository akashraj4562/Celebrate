// ── src/store.ts ────────────────────────────────────────────────────────────
// The app store: the current plan, all saved plans, and the SEPARATE past-event
// archive (§12a). Autosaves to localStorage (debounced) and supports JSON
// export/import. Engine code (cascade/activation/budget) mutates the current
// plan via `mutateCurrent`; UI uses the focused setters.

import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type {
  ArchivedEvent,
  BudgetSummary,
  Deliverable,
  EventInput,
  Moment,
  PlanState,
} from './types';
import { newPlanState, uid } from './lib/plan';
import { recomputeBudget } from './engine/budget';
import { cascadeFrom } from './engine/cascade';

export interface SavedPlan {
  id: string;
  name: string;
  plan: PlanState;
  createdAt: string;
  updatedAt: string;
}

interface AppState {
  plans: Record<string, SavedPlan>;
  currentPlanId: string | null;
  archivedEvents: ArchivedEvent[];

  // ── plan lifecycle ──
  createPlan: (name: string, input: EventInput) => string;
  selectPlan: (id: string | null) => void;
  renamePlan: (id: string, name: string) => void;
  deletePlan: (id: string) => void;
  importPlan: (saved: SavedPlan) => string;
  exportCurrent: () => SavedPlan | null;

  // ── editing the current plan ──
  mutateCurrent: (fn: (plan: PlanState) => PlanState) => void;
  setInput: (patch: Partial<EventInput>) => void;
  replacePlan: (plan: PlanState) => void;
  upsertDeliverable: (d: Deliverable) => void;
  patchDeliverable: (instanceId: string, patch: Partial<Deliverable>) => void;
  overrideDeliverable: (instanceId: string, patch: Partial<Deliverable>) => void;
  removeDeliverable: (instanceId: string) => void;
  clearStale: () => void;
  dismissMoment: (momentId: string) => void;
  setMoments: (moments: Moment[]) => void;
  setBudget: (budget: BudgetSummary) => void;

  // ── archive (§12a) ──
  archiveEvent: (event: ArchivedEvent) => void;
  removeArchivedEvent: (id: string) => void;
}

/** localStorage wrapper that debounces writes (autosave on every change, §12). */
function debouncedStorage(delay = 300): StateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const pending = new Map<string, string>();
  const flush = () => {
    for (const [k, v] of pending) localStorage.setItem(k, v);
    pending.clear();
    timer = null;
  };
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      pending.set(name, value);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    removeItem: (name) => {
      pending.delete(name);
      localStorage.removeItem(name);
    },
  };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      // Apply `fn` to the current plan, bump version + updatedAt, write it back.
      const writeCurrent = (fn: (plan: PlanState) => PlanState) =>
        set((s) => {
          const id = s.currentPlanId;
          const saved = id ? s.plans[id] : undefined;
          if (!id || !saved) return s;
          const next = fn(saved.plan);
          const updatedAt = new Date().toISOString();
          return {
            plans: {
              ...s.plans,
              [id]: {
                ...saved,
                plan: { ...next, version: saved.plan.version + 1, updatedAt },
                updatedAt,
              },
            },
          };
        });

      return {
        plans: {},
        currentPlanId: null,
        archivedEvents: [],

        createPlan: (name, input) => {
          const id = uid('plan');
          const now = new Date().toISOString();
          const saved: SavedPlan = {
            id,
            name,
            plan: newPlanState(input),
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ plans: { ...s.plans, [id]: saved }, currentPlanId: id }));
          return id;
        },

        selectPlan: (id) => set({ currentPlanId: id }),

        renamePlan: (id, name) =>
          set((s) => {
            const saved = s.plans[id];
            if (!saved) return s;
            return { plans: { ...s.plans, [id]: { ...saved, name } } };
          }),

        deletePlan: (id) =>
          set((s) => {
            const rest = { ...s.plans };
            delete rest[id];
            return {
              plans: rest,
              currentPlanId: s.currentPlanId === id ? null : s.currentPlanId,
            };
          }),

        importPlan: (saved) => {
          const id = saved.id && !get().plans[saved.id] ? saved.id : uid('plan');
          set((s) => ({ plans: { ...s.plans, [id]: { ...saved, id } }, currentPlanId: id }));
          return id;
        },

        exportCurrent: () => {
          const { currentPlanId, plans } = get();
          return currentPlanId ? plans[currentPlanId] ?? null : null;
        },

        mutateCurrent: (fn) => writeCurrent(fn),

        setInput: (patch) =>
          writeCurrent((plan) => ({ ...plan, input: { ...plan.input, ...patch } })),

        replacePlan: (plan) => writeCurrent(() => plan),

        upsertDeliverable: (d) =>
          writeCurrent((plan) => {
            const next = { ...plan, deliverables: { ...plan.deliverables, [d.instanceId]: d } };
            return { ...next, budget: recomputeBudget(next) };
          }),

        patchDeliverable: (instanceId, patch) =>
          writeCurrent((plan) => {
            const existing = plan.deliverables[instanceId];
            if (!existing) return plan;
            const next = {
              ...plan,
              deliverables: { ...plan.deliverables, [instanceId]: { ...existing, ...patch } },
            };
            return { ...next, budget: recomputeBudget(next) };
          }),

        // A user-intent value change → patch + cascade staleness downstream (§5).
        overrideDeliverable: (instanceId, patch) =>
          writeCurrent((plan) => {
            const existing = plan.deliverables[instanceId];
            if (!existing) return plan;
            const withPatch = {
              ...plan,
              deliverables: { ...plan.deliverables, [instanceId]: { ...existing, ...patch } },
            };
            return cascadeFrom(withPatch, existing.moduleId, existing.momentId);
          }),

        removeDeliverable: (instanceId) =>
          writeCurrent((plan) => {
            const rest = { ...plan.deliverables };
            delete rest[instanceId];
            return { ...plan, deliverables: rest };
          }),

        clearStale: () =>
          writeCurrent((plan) => ({
            ...plan,
            deliverables: Object.fromEntries(
              Object.entries(plan.deliverables).map(([k, d]) => [k, d.stale ? { ...d, stale: false } : d]),
            ),
          })),

        // Dismiss a Moment: remove it and its cards, and remember not to re-spawn it.
        dismissMoment: (momentId) =>
          writeCurrent((plan) => {
            const deliverables = Object.fromEntries(
              Object.entries(plan.deliverables).filter(([, d]) => d.momentId !== momentId),
            );
            const next = {
              ...plan,
              moments: plan.moments.filter((m) => m.id !== momentId),
              deliverables,
              dismissedMoments: [...(plan.dismissedMoments ?? []), momentId],
            };
            return { ...next, budget: recomputeBudget(next) };
          }),

        setMoments: (moments) => writeCurrent((plan) => ({ ...plan, moments })),

        setBudget: (budget) => writeCurrent((plan) => ({ ...plan, budget })),

        archiveEvent: (event) =>
          set((s) => ({ archivedEvents: [event, ...s.archivedEvents] })),

        removeArchivedEvent: (id) =>
          set((s) => ({ archivedEvents: s.archivedEvents.filter((e) => e.id !== id) })),
      };
    },
    {
      name: 'celebrate-store',
      version: 1,
      storage: createJSONStorage(() => debouncedStorage()),
      partialize: (s) => ({
        plans: s.plans,
        currentPlanId: s.currentPlanId,
        archivedEvents: s.archivedEvents,
      }),
    },
  ),
);

/** The current plan, or null if none is selected. */
export function useCurrentPlan(): PlanState | null {
  return useStore((s) => (s.currentPlanId ? s.plans[s.currentPlanId]?.plan ?? null : null));
}

/** Non-hook read of the freshest current plan — for async orchestration (generate-all). */
export function getCurrentPlanState(): PlanState | null {
  const s = useStore.getState();
  return s.currentPlanId ? s.plans[s.currentPlanId]?.plan ?? null : null;
}
