// ── server/chat.ts ──────────────────────────────────────────────────────────
// The per-card chat agent (spec §9). Scoped to one module but sees the whole
// plan as context. Does exactly three things: justify/discuss, ingest pasted
// vendor quotes (any format) -> scored QuoteOption[], or propose a revision.
// Strict JSON via structured outputs. Convenience score is computed in CODE from
// the facts the model extracts (P-24: branch on structured signals, not prose).

import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { MODULES } from '../src/modules';
import { PRIMARY_MOMENT_ID, instanceIdOf } from '../src/types';
import type { ChatMessage, CostBasis, ModuleId, PlanState, QuoteOption } from '../src/types';

const QuoteFactsSchema = z.object({
  cateringIncluded: z.boolean(),
  cleanupIncluded: z.boolean(),
  parking: z.boolean(),
  distanceKm: z.number(),
  setupEffort: z.enum(['low', 'medium', 'high']),
});

const ChatSchema = z.object({
  reply: z.string(),
  hasProposal: z.boolean(),
  proposal: z.object({
    recommendation: z.string().nullable(),
    reasoning: z.array(z.string()),
    costLines: z.array(
      z.object({ label: z.string(), amount: z.number(), basis: z.enum(['estimated', 'quoted', 'actual']) }),
    ),
    tags: z.array(z.string()),
    ingestedQuotes: z.array(
      z.object({
        source: z.string(),
        cost: z.number(),
        inclusions: z.array(z.string()),
        notes: z.string(),
        facts: QuoteFactsSchema,
      }),
    ),
  }),
});

// Code-computed 0–100 convenience score from the model's extracted facts.
function convenienceScore(f: z.infer<typeof QuoteFactsSchema>): number {
  let s = 0;
  if (f.cateringIncluded) s += 35;
  if (f.cleanupIncluded) s += 20;
  if (f.parking) s += 15;
  if (f.distanceKm <= 10) s += 15;
  else if (f.distanceKm > 25) s -= 20;
  else s += Math.round(15 * (1 - (f.distanceKm - 10) / 15));
  s += f.setupEffort === 'low' ? 15 : f.setupEffort === 'high' ? -15 : 0;
  return Math.max(0, Math.min(100, Math.round(s)));
}

const CHAT_SYSTEM = `You are the planning assistant inside "Celebrate", an expert event planner working in INDIA, discussing ONE card of a plan with the user. You see the whole plan as context, so honour its constraints (budget, headcount, date, city, honorees, exceptions). All money in INR. Reason in a specific, India-real voice — name real factors, never generic filler.

You can do exactly THREE things:

1. JUSTIFY / RETHINK — defend or reconsider the card's current recommendation in light of the user's point. Set hasProposal=false and just reply.

2. INGEST PASTED VENDOR QUOTES (any format) — when the user pastes options/prices, parse EACH into an ingestedQuotes entry: source, cost (INR number), inclusions[], notes, and facts {cateringIncluded, cleanupIncluded, parking, distanceKm (estimate if not stated), setupEffort:"low"|"medium"|"high"}. The APP computes a 0-100 convenience score from those facts — you do NOT score. In the reply, compare the options on cost AND convenience (setup effort, distance, catering-included, cleanup, parking — not cost alone) and recommend ONE with reasoning. Set hasProposal=true, recommendation = the pick, costLines = the pick's cost as a single line with basis "quoted".

3. PROPOSE A REVISION — when you propose a concrete change, set hasProposal=true with the new recommendation, reasoning[], and costLines (basis "estimated" unless taken from a quote). For the VENUE card specifically, if the conclusion is a home / backyard / terrace, set tags:["at-home"]; if the setting becomes outdoor, include "outdoor" plus the time-of-day tag — these drive downstream modules (caterer, weather backup, lighting).

PAST CELEBRATIONS: you may be given the user's prior events with their REAL vendors and REAL spend. Use them to ground recommendations ("last Diwali the cake was Rs.3,200 from …"). If the user wants to reuse a past vendor, propose it as a revision: recommendation = the vendor, and a costLine using the past amount — basis "quoted" (a real amount they actually paid), else "estimated". This flows through the normal proposal → Apply path.

When hasProposal is false, leave proposal fields empty (recommendation: null, [] arrays). Keep replies tight and useful.`;

function chatContext(plan: PlanState, moduleId: ModuleId, pastEventsIndex?: string): string {
  const i = plan.input;
  const d =
    plan.deliverables[instanceIdOf(moduleId, PRIMARY_MOMENT_ID)] ??
    Object.values(plan.deliverables).find((x) => x.moduleId === moduleId);
  const headcount = i.cohorts.reduce((n, c) => n + (c.count || 0), 0);
  const honorees = i.honorees.map((h) => `${h.name} (${h.relation}${h.age != null ? `, ${h.age}` : ''})`).join(', ');
  const past = pastEventsIndex?.trim();
  return [
    `CARD UNDER DISCUSSION: "${MODULES[moduleId].title}".`,
    d ? `Its current recommendation: ${d.recommendation}` : '',
    d && d.reasoning.length ? `Its current reasoning: ${d.reasoning.join(' | ')}` : '',
    '',
    `PLAN: ${i.eventType} for ${honorees}; date ${i.date}; ${i.location.city}; budget Rs.${i.budgetTotal.toLocaleString('en-IN')}; ${headcount} guests${i.exceptions.length ? `; exceptions to respect: ${i.exceptions.map((x) => x.note).join(', ')}` : ''}.`,
    past ? `\nPAST CELEBRATIONS (real vendors + real spend):\n${past}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ChatProposal {
  recommendation?: string;
  reasoning: string[];
  costLines: { id: string; label: string; amount: number; basis: CostBasis }[];
  tags: string[];
  ingestedQuotes: QuoteOption[];
}
export interface ChatResult {
  reply: string;
  proposal?: ChatProposal;
}

export async function chatModule(
  client: Anthropic,
  args: { moduleId: ModuleId; planState: PlanState; history: ChatMessage[]; userMessage: string; pastEventsIndex?: string },
): Promise<ChatResult> {
  const { moduleId, planState, history, userMessage, pastEventsIndex } = args;
  const effort = (process.env.CHAT_EFFORT ?? 'medium') as 'low' | 'medium' | 'high';

  const message = await client.messages.parse({
    model: process.env.MODEL_CHAT ?? 'claude-sonnet-4-6',
    max_tokens: 2000,
    output_config: { effort, format: zodOutputFormat(ChatSchema) },
    system: [{ type: 'text', text: CHAT_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [
      { role: 'user', content: chatContext(planState, moduleId, pastEventsIndex) },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ],
  });

  const out = message.parsed_output;
  if (!out) throw new Error('chat returned no structured output');
  if (!out.hasProposal) return { reply: out.reply };

  const p = out.proposal;
  const proposal: ChatProposal = {
    ...(p.recommendation ? { recommendation: p.recommendation } : {}),
    reasoning: p.reasoning,
    costLines: p.costLines.map((l) => ({ id: randomUUID().slice(0, 8), label: l.label, amount: l.amount, basis: l.basis })),
    tags: p.tags,
    ingestedQuotes: p.ingestedQuotes.map((q) => ({
      source: q.source,
      cost: q.cost,
      inclusions: q.inclusions,
      notes: q.notes,
      facts: q.facts,
      convenienceScore: convenienceScore(q.facts),
    })),
  };

  // A "proposal" with nothing actionable is just a reply.
  if (!proposal.recommendation && proposal.costLines.length === 0 && proposal.ingestedQuotes.length === 0) {
    return { reply: out.reply };
  }
  return { reply: out.reply, proposal };
}
