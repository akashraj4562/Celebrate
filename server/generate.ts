// ── server/generate.ts ──────────────────────────────────────────────────────
// Single-module generation (spec §6, §7, §11). Prompt architecture per the
// Prompt Engineer's review: ONE shared cacheable SYSTEM_SCAFFOLD (the reasoning-
// voice contract + India/INR realism + cross-cutting rules) plus a short per-
// module job slot and a trimmed context block. Output is shaped by STRUCTURED
// OUTPUTS (Zod → output_config.format) so JSON is schema-valid — no fragile
// parse-and-retry. The server merges the generated content into a full
// Deliverable (ids, momentId, derived feasibility).

import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { MODULES, type MomentSlot } from '../src/modules';
import {
  MIDNIGHT_MOMENT_ID,
  MORNING_MOMENT_ID,
  PRIMARY_MOMENT_ID,
  instanceIdOf,
} from '../src/types';
import type { Deliverable, Feasibility, ModuleId, PlanState } from '../src/types';

// ── Structured-output schema: only the CONTENT the model generates. ──
const GeneratedSchema = z.object({
  recommendation: z.string(),
  reasoning: z.array(z.string()),
  alternatives: z.array(
    z.object({
      recommendation: z.string(),
      reasoning: z.string(),
      estimatedCost: z.number().nullable(),
    }),
  ),
  costLines: z.array(z.object({ label: z.string(), amount: z.number() })),
  leadTimeDays: z.number(),
  confidence: z.enum(['high', 'low']),
});

// ── The shared scaffold — identical on every call, so it caches. ──
const SYSTEM_SCAFFOLD = `You are the planning engine inside "Celebrate", an expert event planner working in INDIA. For a single planning module you produce ONE recommendation as structured data.

THE REASONING IS THE PRODUCT.
The recommendation itself is commodity. What matters is the WHY: several specific, defensible reasons that read like an intelligent planner who weighed real factors. Match this texture exactly:

- Timing: "Outdoor lunch: mid-Feb Bengaluru afternoons sit ~26-28C and dry, while evenings drop to ~16C; with elderly parents attending, a warmer daytime slot is lower-friction than a cold night event."
- Dress code: "11 days out => a coordinated code with one custom element is realistic; anchored to the honoree's preference for understated formal and the resort's semi-formal norm."
- Gift: "Dad mentioned getting into cycling last month and his love-language leans toward doing over owning => a guided weekend cycling experience beats an object."
- Photography: "Once-in-a-lifetime first birthday => the marginal Rs.15-20k for videography buys decades of replay value; this is the one thing you can't redo later."

ANTI-GENERIC GUARDRAIL: every reasoning point must name a SPECIFIC, quantified, or named factor - a city + temperature range, the sunset, a named honoree and a real trait of theirs, a concrete constraint, a budget number. If a point could be copy-pasted to any city, any date, any person, it has FAILED - rewrite it. Ban filler like "comfortable temperature", "suitable for guests", "a memorable experience".

INDIA / INR REALISM:
- All money in INR (use "Rs." or the rupee sign). All cost ranges India-realistic for the given city's tier.
- Climate, sunset, monsoon, food, vendors and venues are India-specific - reason from the ACTUAL city and ACTUAL month given (e.g. a Bengaluru July is wet monsoon, not the Feb example above).
- Lead-time anchors (days BEFORE the event an item must be actioned): destination/travel ~60-90; a sought-after venue or photographer ~21-30; a custom-stitched outfit ~14; decor/catering booking ~10-14; a cake ~3; a fresh bouquet ~1-2. A simple local event starts ~2-3 weeks out; travel pushes it to ~2-3 months.

CALENDAR (days-left) - the MODE shifts with the calendar, not just the content:
- dress code / clothing: 10+ days => tailored/custom on the table; 5-9 => online-only, flag size risk; <5 => in-store/mall only, and say online won't clear the window.
- activities: a destination trip needs lead time - with few days and a tight budget, downgrade to local/simple and say why.

LONG-TERM SIGNIFICANCE (memoryValue):
- When significance is "high" (once-in-a-lifetime), bias toward what pays off for YEARS and make the amortized case explicit: photography => videography + a photo-book; gifts => a keepsake/heirloom; notes => a recorded message or a future-letter.

THE MILESTONE MATTERS ENORMOUSLY - plan THIS person's THIS-numbered occasion, never a generic one:
- A 1st birthday is a BABY's event: the parents are the real audience; keep it daytime and short, baby-safe, nothing past nap/bed time. A 20th is a young adult's peer-driven event. A 60th (Shashtipoorthi) honours an elder - traditional, respectful, seated comfort.
- A 25th wedding anniversary is a Silver Jubilee: a grand, once-in-a-lifetime milestone (silver motifs, renewal energy, the wider circle); a 4th is intimate and low-key.
- Let the honoree's AGE and the occasion NUMBER drive the venue, food, activities, gifts, timing and tone.

CONFIDENCE & HONESTY:
- Set confidence="low" when you lack the personalization signal a great recommendation needs (e.g. a gift with no love-language and no expressed wish; a note with nothing about the person's life). When low, keep the pick safe-and-defensible and let the reasoning ADMIT it is generic until you learn more. Set "high" only when the recommendation is genuinely tailored to the specifics given.

OUTPUT RULES:
- recommendation: a crisp headline (e.g. "Outdoor lunch, 12:30-4 PM").
- reasoning: 3 to 4 points, each in the voice above.
- alternatives: 1 to 2, each a genuinely different direction with a one-line why; set estimatedCost (INR number) when it has a cost, else null.
- costLines: this module's cost as line items in INR. Leave empty when the module has no direct cost (e.g. timing is a decision, not a purchase).
- leadTimeDays: when THIS specific recommendation must be actioned, using the anchors above.
- confidence: "high" or "low" per the rule above.
Return only the structured object.`;

// ── Per-module job slots (timing is the showcase; others get a sensible default
// here and are fleshed out as generation scales in Step 7). ──
const MODULE_JOBS: Partial<Record<ModuleId, string>> = {
  timing: `MODULE: Timing & Setting.
Decide the time of day, indoor vs outdoor, and the meal type (breakfast / brunch / lunch / hi-tea / dinner). Reason over: the city + month climate normals and sunset, guest comfort and any limited-mobility honoree, the honoree's energy, and headcount. Produce a headline like "Outdoor lunch, 12:30-4 PM". Timing GATES the venue, so set leadTimeDays to when it should be locked (a local event ~2-3 weeks out). It has no direct cost - leave costLines empty.`,
};

const MOMENT_ID: Record<MomentSlot, string> = {
  primary: PRIMARY_MOMENT_ID,
  midnight: MIDNIGHT_MOMENT_ID,
  morning: MORNING_MOMENT_ID,
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function daysLeft(iso: string): number {
  const e = new Date(iso);
  const now = new Date();
  const a = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}

function feasibilityFor(dleft: number, leadTimeDays: number): Feasibility {
  if (leadTimeDays <= 0 || dleft >= leadTimeDays) return 'ok';
  if (dleft >= 0.6 * leadTimeDays) return 'tight';
  return 'infeasible';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

// The milestone line — the single highest-leverage context variable (§ user req).
function milestoneFor(i: PlanState['input']): string {
  const isAnniv = /anniversar/i.test(i.eventType);
  const isBday = /birthday|bday/i.test(i.eventType);
  if (i.milestone) {
    const tail = isAnniv ? ' anniversary (years together)' : isBday ? ' birthday' : ' occasion';
    return `- Milestone: the ${ordinal(i.milestone)}${tail}`;
  }
  if (isBday && i.honorees[0]?.age != null) {
    const a = i.honorees[0].age;
    return `- Milestone: the ${ordinal(a)} birthday (turning ${a})`;
  }
  return '';
}

// Trim context to global facts + the honoree richness + already-generated upstream
// picks for this module's dependencies (AI Engineer P1-1).
function buildContext(planState: PlanState, moduleId: ModuleId): string {
  const i = planState.input;
  const e = new Date(i.date);
  const dleft = daysLeft(i.date);
  const headcount = i.cohorts.reduce((n, c) => n + (c.count || 0), 0);
  const cohortSummary = i.cohorts.map((c) => `${c.label} x${c.count}${c.isKids ? ' (kids)' : ''}`).join(', ') || 'unspecified';

  const honorees = i.honorees
    .map((h) => {
      const bits = [`${h.name} (${h.relation}${h.age != null ? `, age ${h.age}` : ''})`];
      if (h.mobility === 'limited') bits.push('LIMITED mobility');
      if (h.loveLanguage) bits.push(`love-language: ${h.loveLanguage}`);
      if (h.personality) bits.push(`personality: ${h.personality}`);
      if (h.interests?.length) bits.push(`interests: ${h.interests.join(', ')}`);
      if (h.recentInteractions) bits.push(`right now: ${h.recentInteractions}`);
      if (h.expressedWishes?.length) bits.push(`has said they want: ${h.expressedWishes.join(', ')}`);
      return '- ' + bits.join('; ');
    })
    .join('\n');

  const upstream = MODULES[moduleId].dependsOn
    .map((dep) => {
      const inst = planState.deliverables[instanceIdOf(dep, PRIMARY_MOMENT_ID)];
      return inst ? `- ${MODULES[dep].title}: ${inst.recommendation}` : null;
    })
    .filter(Boolean)
    .join('\n');

  return [
    'EVENT CONTEXT',
    `- Type: ${i.eventType}; significance: ${i.memoryValue}`,
    milestoneFor(i),
    `- Date: ${i.date} (${MONTHS[e.getMonth()]} ${e.getFullYear()}), ${dleft} days from today`,
    `- City: ${i.location.city}${i.location.area ? `, ${i.location.area}` : ''}`,
    `- Total budget: Rs.${i.budgetTotal.toLocaleString('en-IN')}`,
    `- Headcount: ${headcount} (${cohortSummary})`,
    `- Alcohol: ${i.alcohol ? 'yes' : 'no'}`,
    '',
    'HONOREE(S):',
    honorees || '- (none given)',
    i.exceptions.length ? `\nEXCEPTIONS (must respect): ${i.exceptions.map((x) => x.note).join('; ')}` : '',
    i.notes ? `\nNOTES (important context to honour): ${i.notes}` : '',
    upstream ? `\nUPSTREAM DECISIONS ALREADY MADE:\n${upstream}` : '',
  ]
    .filter((s) => s !== '')
    .join('\n');
}

export async function generateDeliverable(
  client: Anthropic,
  moduleId: ModuleId,
  planState: PlanState,
): Promise<Deliverable> {
  const meta = MODULES[moduleId];
  const job = MODULE_JOBS[moduleId] ?? `MODULE: ${meta.title}. Recommend the single best option for this module given the context, in the reasoning voice above.`;
  const userPrompt = `${job}\n\n${buildContext(planState, moduleId)}`;

  const effort = (process.env.GENERATE_EFFORT ?? 'medium') as 'low' | 'medium' | 'high';
  const message = await client.messages.parse({
    model: process.env.MODEL_GENERATE ?? 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: [{ type: 'text', text: SYSTEM_SCAFFOLD, cache_control: { type: 'ephemeral' } }],
    output_config: { effort, format: zodOutputFormat(GeneratedSchema) },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const gen = message.parsed_output;
  if (!gen) throw new Error(`generation for ${moduleId} returned no structured output`);

  const momentId = MOMENT_ID[meta.moment];
  const dleft = daysLeft(planState.input.date);

  return {
    instanceId: instanceIdOf(moduleId, momentId),
    moduleId,
    momentId,
    title: meta.title,
    recommendation: gen.recommendation,
    reasoning: gen.reasoning,
    alternatives: gen.alternatives.map((a) => ({
      recommendation: a.recommendation,
      reasoning: a.reasoning,
      ...(a.estimatedCost != null ? { estimatedCost: a.estimatedCost } : {}),
    })),
    costLines: gen.costLines.map((l) => ({
      id: randomUUID().slice(0, 8),
      label: l.label,
      amount: l.amount,
      basis: 'estimated' as const,
    })),
    leadTimeDays: gen.leadTimeDays,
    status: 'suggested',
    feasibility: feasibilityFor(dleft, gen.leadTimeDays),
    confidence: gen.confidence,
    stale: false,
    active: true,
    locked: false,
    chat: [],
  };
}
