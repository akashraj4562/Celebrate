// ── src/types.ts ────────────────────────────────────────────────────────────
// The data contract for the whole app (spec §2), with the Product Staff review's
// structural fixes applied:
//   • `deliverables` is keyed by a composite `instanceId` = `${moduleId}__${momentId}`
//     (NOT a single moduleId) so the same module can exist in more than one Moment
//     (e.g. a main-party dessert AND `midnightCake`).
//   • `clothing` carries per-person `subItems[]` rather than one top-level row per
//     person — each sub-item has its own cost line, chat, lock, and shoppable links.
//   • A locked conditional whose activation rule goes false is kept but flagged
//     `orphaned` (it is never silently dropped from the budget — see engine §6).
//   • `QuoteOption` carries the extracted facts the convenience score is COMPUTED
//     from (score is code-derived from a stated rubric, not an opaque LLM number).

// ── Primitive enums ─────────────────────────────────────────────────────────
export type LoveLanguage = 'gifts' | 'experiences' | 'words' | 'time' | 'acts';
export type CostBasis = 'estimated' | 'quoted' | 'actual';
export type Status = 'suggested' | 'locked' | 'overridden';
export type Feasibility = 'ok' | 'tight' | 'infeasible';
export type Confidence = 'high' | 'low';
export type Mobility = 'full' | 'limited';
export type MemoryValue = 'standard' | 'high';
export type MomentScope = 'family' | 'inner-circle' | 'full';

// ── Module identity ─────────────────────────────────────────────────────────
export type AlwaysActiveModuleId =
  | 'theme'
  | 'timing'
  | 'venue'
  | 'dressCode'
  | 'clothing'
  | 'gifts'
  | 'decoration'
  | 'photography'
  | 'food'
  | 'transportation'
  | 'activities'
  | 'notes'
  | 'itinerary'
  | 'content';

export type ConditionalModuleId =
  | 'caterer'
  | 'rentals'
  | 'weatherBackup'
  | 'lighting'
  | 'comfortMitigation'
  | 'bar'
  | 'kidsProgram'
  | 'seatingPlan';

export type MidnightModuleId =
  | 'midnightCake'
  | 'midnightBouquet'
  | 'midnightGifts'
  | 'midnightDecor';

// Auto-proposed for baby / young-child birthdays (§4a) — a balloon-filled wake-up,
// set up the night before so the room is ready at ~07:00.
export type MorningModuleId = 'wakeupBalloons';

export type ModuleId =
  | AlwaysActiveModuleId
  | ConditionalModuleId
  | MidnightModuleId
  | MorningModuleId;

// ── People & guests ─────────────────────────────────────────────────────────
export interface Honoree {
  id: string;
  name: string;
  relation: string; // "father", "spouse", "daughter (turning 1)"
  age?: number;
  personality?: string; // free text
  loveLanguage?: LoveLanguage; // drives gift type: object vs experience vs words vs time
  interests?: string[];
  recentInteractions?: string; // what's going on in their life right now
  expressedWishes?: string[]; // things they recently SAID they want
  styleNotes?: string; // for clothing module ("prefers indo-western")
  size?: string; // for clothing module
  mobility?: Mobility;
}

export interface AttendeeCohort {
  id: string;
  label: string; // "Adults — veg", "Adults — non-veg", "Kids"
  count: number;
  portionFactor: number; // adult = 1.0, kid = 0.5 — used in food quantity math
  isKids?: boolean;
  isVeg?: boolean;
}

export interface AttendeeException {
  id: string;
  note: string; // "grandmother — diabetic", "one vegan", "Jain", "nut allergy"
}

// ── Event input ─────────────────────────────────────────────────────────────
export interface EventInput {
  eventType: string; // "birthday", "anniversary", ...
  honorees: Honoree[]; // anniversary => 2+
  date: string; // ISO date
  budgetTotal: number; // INR
  location: { city: string; area?: string };
  cohorts: AttendeeCohort[];
  exceptions: AttendeeException[];
  alcohol: boolean;
  memoryValue: MemoryValue; // long-term significance (baby's 1st, 25th/50th anniv, 80th)
  milestone?: number; // the occasion number / years — birthday age (1st, 20th) or anniversary years (4th, 25th)
  innerCircle: Honoree[]; // family members to dress for the event (may reuse honorees by id)
  notes?: string;
}

// ── Cost lines, alternatives, chat, quotes ──────────────────────────────────
export interface CostLine {
  id: string;
  label: string;
  amount: number; // INR
  basis: CostBasis; // estimated (model guess) | quoted (pasted vendor) | actual (confirmed)
  perHead?: boolean;
  quantity?: number;
}

export interface Alternative {
  recommendation: string;
  reasoning: string;
  estimatedCost?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Facts the convenience score is computed from (LLM extracts these; code scores).
export interface QuoteFacts {
  cateringIncluded?: boolean;
  cleanupIncluded?: boolean;
  parking?: boolean;
  distanceKm?: number;
  setupEffort?: 'low' | 'medium' | 'high';
}

export interface QuoteOption {
  source: string; // "Resort A"
  cost: number;
  inclusions: string[]; // ["catering", "tenting", "50 pax"]
  convenienceScore: number; // 0–100, code-derived from `facts` via a stated rubric
  notes: string;
  facts?: QuoteFacts; // the extracted inputs the score was computed from
}

// Shoppable link for the clothing module — built deterministically in code from a
// query string, or surfaced from server-side web search (labelled "live").
export interface ShoppableLink {
  label: string; // platform + query, e.g. "Myntra — emerald bandhgala men"
  url: string;
  kind: 'search' | 'live'; // 'search' = deterministic query URL; 'live' = web-search result
  imageUrl?: string; // only when web search actually returned one
}

// ── Deliverables ────────────────────────────────────────────────────────────
// Per-person sub-card for the clothing module (spec §10). Targets the innerCircle.
export interface SubDeliverable {
  id: string;
  personId: string; // Honoree.id
  personName: string;
  recommendation: string;
  reasoning: string[];
  costLines: CostLine[];
  links?: ShoppableLink[];
  size?: string;
  styleNotes?: string;
  status: Status;
  locked: boolean;
  chat: ChatMessage[];
  ingestedQuotes?: QuoteOption[];
}

export interface Deliverable {
  instanceId: string; // `${moduleId}__${momentId}` — the map key in PlanState.deliverables
  moduleId: ModuleId;
  momentId: string; // which Moment this belongs to (§4a); defaults to the primary moment
  title: string;
  recommendation: string; // the headline pick
  reasoning: string[]; // the WHY — multiple defensible points
  alternatives: Alternative[]; // 1–2
  costLines: CostLine[];
  leadTimeDays: number; // days BEFORE the event this must be actioned (LLM-set — §7e)
  status: Status;
  feasibility: Feasibility;
  confidence: Confidence; // 'low' when key personalization signal is missing
  stale: boolean; // upstream changed; needs refresh
  active: boolean; // controlled by existence-edge activation (§6)
  locked: boolean; // user locked → never auto-overwritten or marked stale
  chat: ChatMessage[];
  ingestedQuotes?: QuoteOption[];
  subItems?: SubDeliverable[]; // clothing per-person cards (§10)
  reason?: string; // why this (conditional) module was spawned — shown to the user (§6)
  orphaned?: boolean; // locked but its activation rule no longer holds (§6 / engine)
  tags?: string[]; // machine-readable activation signals (timing: 'outdoor'/'evening'; venue: 'at-home')
}

// ── Budget ──────────────────────────────────────────────────────────────────
export interface AllocationTarget {
  category: string;
  targetPct: number;
  actual: number;
  reason: string;
}

export interface CategoryPressure {
  category: string;
  state: 'under' | 'ok' | 'over';
}

export interface BudgetSummary {
  totalEstimated: number;
  totalQuoted: number;
  totalActual: number;
  grandTotal: number; // best-available per line (actual > quoted > estimated)
  budget: number;
  variance: number; // budget - grandTotal (negative = over)
  allocation: AllocationTarget[];
  pressure: CategoryPressure[];
}

// ── Moments (sub-events within one celebration, §4a) ────────────────────────
export interface Moment {
  id: string;
  label: string; // "Midnight cake-cutting (family)", "Main celebration"
  time: string; // "00:00", or a time-of-day set by the timing module
  date?: string; // usually the event date; the midnight moment runs event-eve → 00:00
  scope: MomentScope;
  isPrimary?: boolean; // the main party — exactly one moment is primary
  reason?: string; // why this moment was proposed (for auto-spawned ones)
}

// ── Past-event archive (a SEPARATE localStorage collection, NOT in PlanState — §12a) ──
export interface ArchivedFact {
  category: string; // "photographer", "caterer", "venue", "cake", "decor", ...
  detail: string; // "Lensanche Studios — Rohit (videography incl.)"
  actualCost?: number; // INR actually paid
}

export interface ArchivedEvent {
  id: string;
  eventType: string;
  honorees: string[]; // names
  date: string;
  totalSpend: number; // INR
  facts: ArchivedFact[]; // finalized ACTUALS worth referencing in future plans
  whatWorked?: string; // free-text note
}

// ── Plan state ──────────────────────────────────────────────────────────────
export interface PlanState {
  input: EventInput;
  moments: Moment[]; // at least one primary moment; birthdays add a midnight moment
  deliverables: Record<string, Deliverable>; // keyed by instanceId (`${moduleId}__${momentId}`)
  dismissedMoments?: string[]; // moment ids the user dismissed — don't re-spawn (§4a)
  budget: BudgetSummary;
  version: number;
  updatedAt: string;
}

// ── Helpers / constants ─────────────────────────────────────────────────────
export const PRIMARY_MOMENT_ID = 'main';
export const MIDNIGHT_MOMENT_ID = 'midnight';
export const MORNING_MOMENT_ID = 'morning';

/** Stable composite key for a deliverable instance. */
export function instanceIdOf(moduleId: ModuleId, momentId: string): string {
  return `${moduleId}__${momentId}`;
}
