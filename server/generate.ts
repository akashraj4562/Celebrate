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
import type { Deliverable, Feasibility, Honoree, ModuleId, PlanState, SubDeliverable } from '../src/types';
import { buildSearchLinks, procurementMode } from '../src/lib/shopping';

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
  perCohortRates: z.array(z.object({ cohort: z.string(), ratePerPlate: z.number() })),
  tags: z.array(z.string()),
  leadTimeDays: z.number(),
  confidence: z.enum(['high', 'low']),
});

// ── Clothing (§10): per-person outfit sub-cards. The model NEVER emits a URL —
// it gives a plain `searchQuery`; code builds the deterministic shoppable links. ──
const ClothingSchema = z.object({
  recommendation: z.string(), // the overall outfit approach (one headline)
  reasoning: z.array(z.string()), // why — palette inheritance, occasion, formality
  confidence: z.enum(['high', 'low']),
  leadTimeDays: z.number(),
  people: z.array(
    z.object({
      personName: z.string(), // must echo one of the target names given
      recommendation: z.string(), // this person's outfit
      reasoning: z.array(z.string()),
      estimatedCost: z.number(), // INR
      searchQuery: z.string(), // PLAIN words for a shopping search — NEVER a URL
      sizeNote: z.string(), // sizing / fit guidance ('' if none)
    }),
  ),
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
- tags: short machine-readable flags for downstream logic. Most modules return []. TIMING must tag the setting and time-of-day: one of "indoor"/"outdoor" AND one of "morning"/"afternoon"/"evening"/"night". VENUE must tag "at-home" if the pick is the host's home/backyard/terrace, otherwise "venue-hired".
- perCohortRates: FOOD only — for each guest cohort, the per-plate rate in INR (veg < non-veg; kids less than adults). All other modules return []. For food, leave costLines empty — the app computes the food cost from portions x rate.
Return only the structured object.`;

// ── Per-module job slots (timing is the showcase; others get a sensible default
// here and are fleshed out as generation scales in Step 7). ──
const MODULE_JOBS: Partial<Record<ModuleId, string>> = {
  timing: `MODULE: Timing & Setting.
Decide the time of day, indoor vs outdoor, and the meal type (breakfast / brunch / lunch / hi-tea / dinner). Reason over: the city + month climate normals and sunset, guest comfort and any limited-mobility honoree, the honoree's energy, and headcount. Produce a headline like "Outdoor lunch, 12:30-4 PM". Timing GATES the venue, so set leadTimeDays to when it should be locked (a local event ~2-3 weeks out). It has no direct cost - leave costLines empty. REQUIRED tags: "indoor" or "outdoor", plus one of "morning"/"afternoon"/"evening"/"night".`,
  venue: `MODULE: Venue. Pick the place, scored on weather-fit (against the timing call), capacity for the headcount, INR/head against budget, theme fit, and step-free accessibility. Give a shortlist-of-one with the why and 1-2 alternatives. REQUIRED tag: "at-home" if the pick is the host's home / backyard / terrace, otherwise "venue-hired".`,
  food: `MODULE: Food & Menu. Design the menu per cohort, HONOURING every exception (diabetic, Jain, vegan, nut-allergy, etc.). Then give per-plate rates: emit perCohortRates with one entry per guest cohort (match the cohort labels given), each an India-realistic INR per-plate rate for the city tier (veg < non-veg; kids ~half). Leave costLines EMPTY — the app computes the food cost from portions x rate. Your reasoning should name the actual dishes and call out how each exception is handled.`,
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

function rateForCohort(rates: { cohort: string; ratePerPlate: number }[], c: { label: string; isKids?: boolean }): number {
  const norm = (s: string) => s.toLowerCase();
  const hit = rates.find((r) => norm(c.label).includes(norm(r.cohort)) || norm(r.cohort).includes(norm(c.label)));
  if (hit) return Math.round(hit.ratePerPlate);
  if (c.isKids) {
    const kid = rates.find((r) => /kid|child/i.test(r.cohort));
    if (kid) return Math.round(kid.ratePerPlate);
  }
  return Math.round(rates.reduce((s, r) => s + r.ratePerPlate, 0) / Math.max(1, rates.length));
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

// The people clothing dresses: the innerCircle (§10), falling back to honorees.
function targetPeople(plan: PlanState): Honoree[] {
  return plan.input.innerCircle.length ? plan.input.innerCircle : plan.input.honorees;
}

// Clothing (§10): per-person outfit sub-cards with code-built shoppable links.
async function generateClothing(client: Anthropic, planState: PlanState): Promise<Deliverable> {
  const i = planState.input;
  const people = targetPeople(planState);
  const dleft = daysLeft(i.date);
  const proc = procurementMode(dleft);

  const peopleBlock = people.length
    ? people
        .map((h) => {
          const bits = [`${h.name} (${h.relation}${h.age != null ? `, ${h.age}` : ''})`];
          if (h.styleNotes) bits.push(`style: ${h.styleNotes}`);
          if (h.size) bits.push(`size: ${h.size}`);
          return '- ' + bits.join('; ');
        })
        .join('\n')
    : '- (no inner circle specified — dress the honoree)';

  const job = `MODULE: Outfits to Buy (clothing).
For EACH person below, recommend ONE outfit that INHERITS the dress code's palette and formality (see UPSTREAM DECISIONS) so the family harmonises, and suits the occasion, the person's relation/age, and any style/size note. Per person give: the outfit, 2-3 reasoning points in the voice above, an India-realistic INR estimatedCost for the city tier, a sizeNote, and a PLAIN-WORDS searchQuery for a shopping search (colour + garment + who it's for, e.g. "emerald green silk saree" or "navy bandhgala men").
HARD RULE: NEVER output a URL or a store/product link in ANY field — the app builds the shopping links from your searchQuery. A link you write would 404.
PROCUREMENT WINDOW — ${proc.note} Reflect this in the picks (with little time, lean ready-to-wear over custom-stitched, and say so).
Set leadTimeDays for the module to when outfits must be actioned. The card itself has no direct cost line — the per-person costs ARE the cost.

TARGET PEOPLE (echo each personName EXACTLY as written):
${peopleBlock}`;

  const userPrompt = `${job}\n\n${buildContext(planState, 'clothing')}`;
  const effort = (process.env.GENERATE_EFFORT ?? 'medium') as 'low' | 'medium' | 'high';
  const message = await client.messages.parse({
    model: process.env.MODEL_GENERATE ?? 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: [{ type: 'text', text: SYSTEM_SCAFFOLD, cache_control: { type: 'ephemeral' } }],
    output_config: { effort, format: zodOutputFormat(ClothingSchema) },
    messages: [{ role: 'user', content: userPrompt }],
  });
  const gen = message.parsed_output;
  if (!gen) throw new Error('generation for clothing returned no structured output');

  const byName = new Map(people.map((h) => [h.name.trim().toLowerCase(), h]));
  const subItems: SubDeliverable[] = gen.people.map((p) => {
    const match = byName.get(p.personName.trim().toLowerCase());
    return {
      id: randomUUID().slice(0, 8),
      personId: match?.id ?? randomUUID().slice(0, 8),
      personName: match?.name ?? p.personName,
      recommendation: p.recommendation,
      reasoning: p.reasoning,
      costLines:
        p.estimatedCost > 0
          ? [{ id: randomUUID().slice(0, 8), label: p.recommendation, amount: p.estimatedCost, basis: 'estimated' as const }]
          : [],
      links: buildSearchLinks(p.searchQuery), // code-built; the model never supplies URLs
      ...(p.sizeNote || match?.size ? { size: p.sizeNote || match?.size } : {}),
      ...(match?.styleNotes ? { styleNotes: match.styleNotes } : {}),
      status: 'suggested',
      locked: false,
      chat: [],
    };
  });

  return {
    instanceId: instanceIdOf('clothing', PRIMARY_MOMENT_ID),
    moduleId: 'clothing',
    momentId: PRIMARY_MOMENT_ID,
    title: MODULES.clothing.title,
    recommendation: gen.recommendation,
    reasoning: [proc.note, ...gen.reasoning], // card STATES the procurement mode (§10)
    alternatives: [],
    costLines: [], // cost lives on the per-person sub-items
    leadTimeDays: gen.leadTimeDays,
    status: 'suggested',
    feasibility: feasibilityFor(dleft, gen.leadTimeDays),
    confidence: gen.confidence,
    stale: false,
    active: true,
    locked: false,
    chat: [],
    tags: [],
    subItems,
  };
}

export async function generateDeliverable(
  client: Anthropic,
  moduleId: ModuleId,
  planState: PlanState,
): Promise<Deliverable> {
  if (moduleId === 'clothing') return generateClothing(client, planState);
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

  let costLines = gen.costLines.map((l) => ({
    id: randomUUID().slice(0, 8),
    label: l.label,
    amount: l.amount,
    basis: 'estimated' as const,
  }));
  // Food cost is computed first-principles: portions = count x portionFactor x 1.1 buffer (§8).
  if (moduleId === 'food' && gen.perCohortRates.length > 0) {
    costLines = planState.input.cohorts
      .filter((c) => (c.count || 0) > 0)
      .map((c) => {
        const rate = rateForCohort(gen.perCohortRates, c);
        const portions = Math.round((c.count || 0) * (c.portionFactor || 1) * 1.1);
        return {
          id: randomUUID().slice(0, 8),
          label: `${c.label} — ${portions} plates @ ₹${rate}`,
          amount: portions * rate,
          perHead: true,
          quantity: portions,
          basis: 'estimated' as const,
        };
      });
  }

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
    costLines,
    leadTimeDays: gen.leadTimeDays,
    status: 'suggested',
    feasibility: feasibilityFor(dleft, gen.leadTimeDays),
    confidence: gen.confidence,
    stale: false,
    active: true,
    locked: false,
    chat: [],
    tags: gen.tags,
  };
}
