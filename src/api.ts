import type { ChatMessage, CostLine, Deliverable, ModuleId, PlanState, QuoteOption } from './types';

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

export interface ChatProposal {
  recommendation?: string;
  reasoning: string[];
  costLines: CostLine[];
  tags: string[];
  ingestedQuotes: QuoteOption[];
}
export interface ChatReply {
  reply: string;
  proposal?: ChatProposal;
}

/** Per-card chat (spec §9): justify / ingest quotes / propose a revision. */
export async function chatModule(
  moduleId: ModuleId,
  planState: PlanState,
  history: ChatMessage[],
  userMessage: string,
): Promise<ChatReply> {
  const res = await fetch('/api/module/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ moduleId, planState, history, userMessage }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Chat failed (${res.status})`);
  }
  return (await res.json()) as ChatReply;
}
