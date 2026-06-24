import type { Deliverable, ModuleId, PlanState } from './types';

/** Generate one module's Deliverable via the backend (spec §6, §11). */
export async function generateModule(moduleId: ModuleId, planState: PlanState): Promise<Deliverable> {
  const res = await fetch('/api/module/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId, planState }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Generation failed (${res.status})`);
  }
  return (await res.json()) as Deliverable;
}
