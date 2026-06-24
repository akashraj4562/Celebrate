# Celebrate — Build Spec (under Product Staff review)

> **Status:** UNDER REVIEW — no code to be written until the Product Staff review is resolved (per the org's P0 implementation-gate rule).
> **Date:** 2026-06-23
> **Artifact type:** Build prompt / functional spec (serves as the PRD for review purposes).
> **Owner:** Akash Raj

---

# Build Prompt — "Celebrate": A Fully-Reactive, Explainable Party Planning Engine

You are building a single-user, locally-run web application called **Celebrate**. It is **not** a checklist generator. It is an **explainable planning engine**: the user describes an event, and the app produces a living plan where *every recommendation carries its reasoning*, *every value and cost is override-able*, and *the plan re-flows reactively when inputs change*. The richer the signal the user gives, the more recommendations move from generic-defensible to specifically-delightful.

Read this entire spec before writing code. Build in the order given in §14. Verify each stage before moving on.

---

## 0. Tech stack & non-negotiables

- **Frontend:** Vite + React + TypeScript. Use your frontend-design skill for the visual layer.
- **Backend:** A thin **Express + TypeScript** server whose *only* jobs are (a) proxying Anthropic API calls and (b) running the web-search tool server-side. Use the official `@anthropic-ai/sdk`.
- **Anthropic key:** lives in `server/.env` as `ANTHROPIC_API_KEY`. **It must NEVER reach the frontend bundle.** All model calls go through the backend. Add `.env` to `.gitignore`. Provide a `.env.example`.
- **Models (per surface, all via env so they're swappable):** **chat** (`/api/module/chat`) → `claude-sonnet-4-6` at **effort `medium`** (chat is interactive and frequent — favour responsiveness over deliberation); **per-module (re)generation** (`/api/module/generate`) → `claude-sonnet-4-6`; **initial full-plan generation** (`/api/plan/generate-all`) → `claude-sonnet-4-6` default, `claude-opus-4-8` acceptable for extra depth (it's the one heavy, infrequent call). Expose as `MODEL_CHAT` / `MODEL_GENERATE` / `MODEL_PLAN` + `CHAT_EFFORT`. *(If any model ID or the reasoning-effort parameter syntax is stale at build time, confirm against current Anthropic docs — do not invent IDs or field names.)*
- **Persistence:** browser `localStorage` (autosave) + JSON **export/import**. No external DB.
- **Currency:** **INR (₹)** everywhere. All default cost ranges must be **India-realistic**.
- **No `<form>` tags** if you reuse any artifact patterns; use `onClick`/`onChange` handlers.
- This is a real app, not a sandbox — wire the backend properly, handle errors, show loading states.

---

## 1. Core concept (the thing that must not be diluted)

The recommendation is commodity. **The reasoning chain, the reactivity, and the override-ability are the product.** Three properties must hold for *every* deliverable:

1. **It carries its reasoning** — multiple defensible "why" points, not one line. (e.g. *"why an outdoor lunch"* must read like an intelligent planner thought about climate, sunset, guest mobility, and budget.)
2. **It is fully override-able** — both the recommendation *and* its cost. User edits are sacred.
3. **It is reactive** — when an upstream input changes, dependent deliverables update, via the cascade engine in §5–6. Locked items are never touched.

---

## 2. Data model

Define these TypeScript types in `src/types.ts`. Treat them as the contract for the whole app.

```typescript
type LoveLanguage = 'gifts' | 'experiences' | 'words' | 'time' | 'acts';
type CostBasis    = 'estimated' | 'quoted' | 'actual';
type Status       = 'suggested' | 'locked' | 'overridden';
type Feasibility  = 'ok' | 'tight' | 'infeasible';
type Confidence   = 'high' | 'low';

interface Honoree {
  id: string;
  name: string;
  relation: string;            // "father", "spouse", "daughter (turning 1)"
  age?: number;
  personality?: string;        // free text
  loveLanguage?: LoveLanguage; // drives gift type: object vs experience vs words vs time
  interests?: string[];
  recentInteractions?: string; // what's going on in their life right now
  expressedWishes?: string[];  // things they recently SAID they want
  styleNotes?: string;         // for clothing module ("prefers indo-western")
  size?: string;               // for clothing module
  mobility?: 'full' | 'limited';
}

interface AttendeeCohort {
  id: string;
  label: string;               // "Adults — veg", "Adults — non-veg", "Kids"
  count: number;
  portionFactor: number;       // adult = 1.0, kid = 0.5 — used in food quantity math
  isKids?: boolean;
  isVeg?: boolean;
}

interface AttendeeException {
  id: string;
  note: string;                // "grandmother — diabetic", "one vegan", "Jain", "nut allergy"
}

interface EventInput {
  eventType: string;                       // "birthday", "anniversary", ...
  honorees: Honoree[];                      // anniversary => 2+
  date: string;                             // ISO date
  budgetTotal: number;                      // INR
  location: { city: string; area?: string };
  cohorts: AttendeeCohort[];
  exceptions: AttendeeException[];
  alcohol: boolean;
  memoryValue: 'standard' | 'high';         // long-term significance (baby's 1st, 25th/50th anniv, 80th)
  innerCircle: Honoree[];                    // family members to dress for the event (may reuse honorees by id)
  notes?: string;
}

interface CostLine {
  id: string;
  label: string;
  amount: number;              // INR
  basis: CostBasis;            // estimated (model guess) | quoted (pasted vendor) | actual (user-confirmed)
  perHead?: boolean;
  quantity?: number;
}

interface Alternative {
  recommendation: string;
  reasoning: string;
  estimatedCost?: number;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

interface QuoteOption {        // produced when the user pastes vendor quotes into a card's chat
  source: string;              // "Resort A"
  cost: number;
  inclusions: string[];        // ["catering", "tenting", "50 pax"]
  convenienceScore: number;    // 0–100, derived (setup effort, distance, cleanup, parking, catering-included)
  notes: string;
}

interface Deliverable {
  moduleId: string;
  title: string;
  recommendation: string;      // the headline pick
  reasoning: string[];         // the WHY — multiple defensible points
  alternatives: Alternative[]; // 1–2
  costLines: CostLine[];
  leadTimeDays: number;        // how many days BEFORE the event this must be actioned/booked (LLM-set, recommendation-specific — §7e)
  momentId: string;            // which Moment this belongs to (§4a); defaults to the primary "main" moment
  status: Status;
  feasibility: Feasibility;
  confidence: Confidence;      // 'low' when key personalization signal is missing
  stale: boolean;              // upstream changed; needs refresh
  active: boolean;             // controlled by existence-edge activation (§6)
  locked: boolean;             // user locked → never auto-overwritten or marked stale
  chat: ChatMessage[];
  ingestedQuotes?: QuoteOption[];
}

interface BudgetSummary {
  totalEstimated: number;
  totalQuoted: number;
  totalActual: number;
  grandTotal: number;          // best-available per line (actual > quoted > estimated)
  budget: number;
  variance: number;            // budget - grandTotal (negative = over)
  allocation: { category: string; targetPct: number; actual: number; reason: string }[];
  pressure: { category: string; state: 'under' | 'ok' | 'over' }[];
}

interface Moment {
  id: string;
  label: string;               // "Midnight cake-cutting (family)", "Main celebration"
  time: string;                // "00:00", or a time-of-day set by the timing module
  date?: string;               // usually the event date; the midnight moment runs event-eve → 00:00
  scope: 'family' | 'inner-circle' | 'full';
  isPrimary?: boolean;         // the main party — exactly one moment is primary
  reason?: string;             // why this moment was proposed (for auto-spawned ones)
}

// ---- Past-event archive (a SEPARATE localStorage collection, NOT part of PlanState — §12a) ----
interface ArchivedFact {
  category: string;            // "photographer", "caterer", "venue", "cake", "decor", ...
  detail: string;              // "Lensanche Studios — Rohit (videography incl.)"
  actualCost?: number;         // INR actually paid
}

interface ArchivedEvent {
  id: string;
  eventType: string;
  honorees: string[];          // names
  date: string;
  totalSpend: number;          // INR
  facts: ArchivedFact[];       // finalized ACTUALS worth referencing in future plans
  whatWorked?: string;         // free-text note
}

interface PlanState {
  input: EventInput;
  moments: Moment[];                           // §4a — at least one primary moment; birthdays add a midnight moment
  deliverables: Record<string, Deliverable>;  // keyed by moduleId (each carries momentId)
  budget: BudgetSummary;
  version: number;
  updatedAt: string;
}
```

---

## 3. The universal Deliverable contract

Build ONE reusable `<DeliverableCard>` component that renders any `Deliverable`. Every module is just this card with different content. The card must show:

- **Recommendation** (headline) + **reasoning** (expandable list of "why" points).
- **Cost** — the card's `costLines`, each editable inline, each tagged `estimated | quoted | actual`.
- **State chips:** `suggested / locked / overridden`, a **STALE** badge when `stale`, a **low-confidence nudge** when `confidence === 'low'`, and a **feasibility** flag when `tight`/`infeasible`.
- **Controls:** **Override** (edit recommendation and/or cost → sets `status='overridden'`), **Lock** (toggle → `locked`, freezes the card from cascade), **Refresh** (only when `stale` → regenerate from current upstream), and **Discuss** (opens the per-card chat, §9).
- **Alternatives:** the 1–2 alternatives, one-click promotable to the recommendation.

A locked or overridden card is **never** silently overwritten by regeneration. Refresh on an unlocked stale card regenerates it given current upstream state, *preserving its chat history as context*.

---

## 4. Module registry

Define a registry in `src/modules.ts`. Each module declares its `dependsOn` (value edges, §5) and participates in activation (existence edges, §6). **Always-active** modules generate on first plan creation. **Conditional** modules only exist when activated.

### Always-active modules

| id | title | dependsOn | what makes it *intelligent* |
|----|-------|-----------|------------------------------|
| `theme` | Theme | honorees | tied to honoree personality + interests, not a generic palette |
| `timing` | Timing & Setting | location, date, honorees(mobility), headcount | reasons over month/city **climate normals**, sunset, guest comfort, honoree energy → time-of-day + indoor/outdoor + meal type, **with the why** |
| `venue` | Venue | timing, headcount, budgetTotal, theme | scored on weather-fit, capacity, ₹/head, theme fit, accessibility; shortlist + pick + why |
| `dressCode` | Dress Code | venue, honorees, date(**days-left**) | abstract spec ("smart Indian formal, accent: emerald"); **mode gated by days-left** (see §7) |
| `clothing` | Outfits to Buy | dressCode, innerCircle, date(**days-left**) | per-person shoppable outfits inheriting the dress-code palette; **hybrid links** + procurement-mode gating (§10) |
| `gifts` | Gifts | honorees, budgetTotal, memoryValue | per honoree; product vs experience driven by **loveLanguage** + **expressedWishes**; each gift carries a **joy hypothesis** |
| `decoration` | Decoration | theme, venue | fixed base + scalable component, tied to theme and indoor/outdoor |
| `photography` | Photo / Video | memoryValue, headcount, venue | **memoryValue=high ⇒ recommend videography + photo-book** (long-term joy); auto-generate a must-capture brief from the itinerary |
| `food` | Food & Menu | cohorts, exceptions, timing, venue | per-cohort menu honoring exceptions; **quantity by first-principles formula** (§8) |
| `transportation` | Transportation | venue, headcount, honorees(mobility) | self-drive / cabs / shared tempo by headcount + distance + mobility; per-head cost |
| `activities` | Activities | eventType, budgetTotal, date(**days-left**), honorees | simple vs activity-based vs travel/destination, **gated by days-left + budget** |
| `notes` | Notes & Messages | honorees(recentInteractions), memoryValue | suggests *content/angles* per honoree from recent interactions; memoryValue=high ⇒ recorded message / future-letter |
| `itinerary` | Itinerary | (most modules) | **emotional-pacing timeline**, not a schedule: gifts when energy peaks, heartfelt note when the group is settled, reveal at peak attention — each slot says *why it's there*. Generate this **last**. |
| `content` | Reels & Content | itinerary, theme | shot list tied to itinerary beats; feeds the photo brief |

### Conditional modules (spawned by activation rules, §6)

| id | title | spawned when |
|----|-------|--------------|
| `caterer` | Caterer | venue is "home" AND headcount > ~15 |
| `rentals` | Rentals (seating/tableware) | venue is "home" AND headcount > ~15 |
| `weatherBackup` | Weather Backup | timing is outdoor |
| `lighting` | Lighting | timing is outdoor AND evening |
| `comfortMitigation` | Heat / Insect Mitigation | timing is outdoor |
| `bar` | Bar | alcohol = true |
| `kidsProgram` | Kids Menu & Entertainment | a kids cohort count > 0 |
| `seatingPlan` | Seating Plan | an elderly/limited-mobility exception or honoree present |

---

## 4a. Moments (sub-events within one celebration)

A celebration is not one occasion. The plan holds a small list of **Moments** — discrete sub-events, each with its own time, scope (who attends), and subset of deliverables. Exactly one Moment is `isPrimary` (the main party — lunch/dinner with the wider circle). Every Deliverable carries a `momentId`; by default deliverables attach to the primary moment. Moments are a **lightweight grouping over the SAME `<DeliverableCard>`s and the SAME engines** — the budget sums across all moments, and the itinerary + prep timeline (§7e) organize across them. Do **not** build moments as independent sub-plans; honorees, budget, and personalization signal are shared.

**Midnight home celebration (auto-proposed for birthdays).** For birthday-like `eventType`, propose **by default** a non-primary moment — *"Midnight cake-cutting (family)"* at `00:00`, scope `family` — and let the user dismiss it. It is near-universal in Indian birthday culture. When active it owns its own intimate deliverable set, distinct from the main party:

| id | belongs to | note |
|----|-----------|------|
| `midnightCake` | midnight moment | a cake for the 12am cut, separate from any main-party dessert |
| `midnightBouquet` | midnight moment | flowers for the first wish |
| `midnightGifts` | midnight moment | a few *intimate, sentimental* gifts — bias personal over impressive, still using love-language reasoning |
| `midnightDecor` | midnight moment | light home setup — balloons, fairy lights, a small backdrop |

These items have short lead times, so they surface late in the prep timeline (§7e).

**Morning balloon surprise (auto-proposed for baby / young-child birthdays).** When the birthday honoree is a young child (default age ≤ 6 — tighten toward ≤ 2–3 if you want it strictly for babies), propose **by default** a second non-primary moment — *"Birthday-morning wake-up"* at ~`07:00` on the event day, scope `family` — so the child wakes to a balloon-filled room. For a baby this is often more fitting than the midnight cut (they're asleep at 12am). It owns one card, dismissible like any moment:

| id | belongs to | note |
|----|-----------|------|
| `wakeupBalloons` | morning moment | balloons (+ optional small banner) **set up the night before** so it's ready at wake-up; short procurement lead, with a "decorate the night before" setup note |

---

## 5. Cascade engine — VALUE edges (upstream value changes ⇒ downstream goes stale)

Implement in `src/engine/cascade.ts`.

- Each module declares `dependsOn: string[]` (data fields or module ids).
- When a module's value changes — via **generate**, **override**, **alternative-promote**, or **chat-apply** — do:
  1. Run the **activation engine** (§6) first.
  2. Compute the **transitive downstream set**: every module that depends (directly or indirectly) on the changed one.
  3. For each downstream module that is **unlocked**, set `stale = true`. **Never** mark locked modules stale.
  4. Recompute the **budget** (§8).
- A stale card shows a "Upstream changed — Refresh?" affordance. The user clicks Refresh per card (no silent auto-rewrite). Optionally offer "Refresh all stale".
- **Locks are absolute:** locked cards are never marked stale and never overwritten, even if upstream changes. The user can manually unlock to re-open them.

This gives cascade-awareness without brittle full auto-recompute.

---

## 6. Activation engine — EXISTENCE edges (upstream value changes which modules *exist*)

This is the engine behind "Home venue ⇒ also recommend a caterer." Implement in `src/engine/activation.ts` as a list of rules evaluated against `PlanState` after any change:

```typescript
interface ActivationRule {
  id: string;
  when: (s: PlanState) => boolean;
  activate: string[];     // module ids to spawn/require
  reason: string;         // shown to the user when the module appears
}
```

Implement at least these rules (tune thresholds sensibly):

| rule | when | activates | reason shown |
|------|------|-----------|--------------|
| home-catering | venue ≈ home AND headcount > 15 | `caterer`, `rentals` | "Self-cooking breaks past ~15 guests — you'll need catering + rented seating/tableware." |
| outdoor-backup | timing outdoor | `weatherBackup`, `comfortMitigation` | "Outdoor events have failure modes indoor ones don't — a weather fallback and heat/insect plan are non-optional for a dated event." |
| outdoor-evening-light | timing outdoor AND evening | `lighting` | "An outdoor evening needs a lighting plan once the sun sets." |
| alcohol | alcohol = true | `bar` + add a designated-transport note to `transportation` | "Alcohol adds a bar line and makes safe transport important." |
| kids | a kids cohort count > 0 | `kidsProgram` | "Kids present ⇒ a kids menu and supervised entertainment keep them happy and parents relaxed." |
| mobility | any honoree/exception with limited mobility | `seatingPlan` + bias `timing` daytime + bias `venue` step-free | "An elderly/limited-mobility guest ⇒ seating, daytime timing, and step-free access reduce friction." |
| midnight-celebration | `eventType` is birthday-like | `midnightCake`, `midnightBouquet`, `midnightGifts`, `midnightDecor` as a "Midnight cake-cutting (family)" moment (§4a) | "An intimate 12am family cake-cutting is near-universal for birthdays — cake, flowers, a personal gift, a little home setup. Dismiss if you don't want it." |
| morning-balloons | `eventType` birthday-like AND honoree age ≤ ~6 (tunable) | `wakeupBalloons` as a "Birthday-morning wake-up" moment (§4a) | "For a young child, waking to a room full of balloons is a small, high-joy ritual — set it up the night before. Dismiss if you don't want it." |

When a rule first fires, **spawn the module, generate it, and surface its `reason`.** When a rule stops being true and the spawned module is unlocked & unedited, deactivate it (`active=false`); if the user edited/locked it, keep it but flag it. Newly spawned modules also run through the value-cascade so their own downstream (and the budget) update.

**Critical:** chat-applied decisions (§9) and overrides must run through this same activation + cascade pipeline. If a venue chat concludes "backyard wins," that must fire `home-catering`/`outdoor-backup` etc. — not just edit one card in isolation. Chat-per-card and conditional-modules are one system.

---

## 7. The intelligence layer

This is what the user is paying for. Enforce it in the generation prompts (§11).

### 7a. Reasoning voice
Every `reasoning[]` must read like an intelligent planner who weighed real factors. Match this texture:

- *Timing:* "Outdoor **lunch**: mid-Feb Bangalore afternoons sit ~26–28°C and dry, while evenings drop to ~16°C; with elderly parents attending, a warmer daytime slot is lower-friction than a cold night event."
- *Dress code (days-left):* "11 days out ⇒ a coordinated code with one custom element is realistic; anchored to the honoree's preference for understated formal and the resort's semi-formal norm."
- *Gift (joy hypothesis):* "Dad mentioned getting into cycling last month and his love-language leans toward *doing* over *owning* ⇒ a guided weekend cycling experience beats an object."
- *Photography (long-term joy):* "Once-in-a-lifetime first birthday ⇒ the marginal ₹15–20k for videography buys decades of replay value; this is the one thing you can't redo later."

### 7b. Days-left gating (applies to `dressCode`, `clothing`, `activities`)
Compute `daysLeft = date - today`. The recommendation **mode** shifts with the calendar, not just the content:
- **Dress code / clothing:** 10+ days ⇒ tailored/custom on the table; 5–9 ⇒ online-only with size-risk flag; <5 ⇒ bias in-store/mall, flag that online delivery + size exchange won't clear the window.
- **Activities:** can't recommend a destination trip with 3 days and a tight budget — downgrade to local/simple and say why.

### 7c. memoryValue (long-term joy)
When `memoryValue === 'high'`: `photography` ⇒ videography + photo-book; `gifts` ⇒ surface a keepsake/heirloom option; `notes` ⇒ recorded message or future-letter ("to be opened on her 18th"). The reasoning must make the *amortized-over-years* case explicitly.

### 7d. Confidence & the signal→joy nudge
Set `confidence='low'` on any module generated without the personalization signal it needs (e.g. `gifts` with no `loveLanguage`/`expressedWishes`; `notes` with no `recentInteractions`). On low-confidence cards, show a **targeted ask** that makes the leverage visible — e.g. *"Tell me one thing your mom mentioned wanting recently and I'll redo her gift and her note."* Feeding that signal then regenerates just those cards at higher confidence.

### 7e. Time-phasing — lead times, the prep timeline, and feasibility
Every Deliverable carries `leadTimeDays` — how long *before* the event it must be actioned. The LLM sets it per recommendation (it's recommendation-specific), using India-realistic anchors: a destination/travel activity ~60–90 days; booking a sought-after venue or photographer ~21–30; a custom-stitched/tailored outfit ~14; decor or catering booking ~10–14; a cake order ~3; the midnight bouquet ~1–2. A simple local birthday should start ~2–3 weeks out; anything involving travel pushes that to ~2–3 months.

From these the app **derives** (pure computation, no LLM) two things:
1. **A Prep Timeline view** — each item's *action-by date* = `eventDate − leadTimeDays`, sorted ascending, grouped into buckets ("Do now", "This week", "By [date]", "Final days"). This is the backward-planned schedule; it updates live like the budget dashboard.
2. **A "Start planning by [date]" headline** = `eventDate − max(leadTimeDays across ACTIVE deliverables)`. Emergent: the longest pole sets the start. Add a destination activity and the headline jumps from ~3 weeks to ~3 months automatically.

**Feasibility derives from lead time** (replacing any hand-wavy version): `daysLeft ≥ leadTimeDays → ok`; `daysLeft ≥ 0.6 × leadTimeDays → tight`; else `infeasible`. An infeasible item must state the reason **and** trigger the relevant §7b downgrade (e.g. destination trip infeasible at 10 days → activities falls back to local/simple). The Prep Timeline shows infeasible items in red at the top.

---

## 8. Cost engine

Implement in `src/engine/budget.ts`. Bottoms-up, INR, defensible.

- **Each module emits `costLines`.** Totals are computed, never hand-typed.
- **Food quantity is first-principles and visible in the UI:**
  `portions(cohort) = cohort.count × cohort.portionFactor × buffer(1.1)`; `foodCost = Σ portions × perPlateRate(menu, cohort)`. Show the formula, not just a number. Kids ≠ adult portions.
- **Three-tier cost basis per line:** `estimated` (model guess) → `quoted` (user pasted a real vendor number, §9) → `actual` (user confirmed the deal). The budget shows **subtotals by basis** and confidence in the grand total rises as lines move toward `actual`. Every cost field is editable; editing to a real number flips the basis and lets the user mark it `actual`.
- **Allocation:** propose target percentages with reasoning (sensible default: gifts ~25 / venue+food ~45 / decor ~10 / photo ~10 / transport ~5 / buffer ~5; adjust for `memoryValue`). Show target vs actual per category.
- **Running total vs budget** with a **variance** signal and a **budget-pressure** indicator per category (under/ok/over) showing where to trim. Recompute live on every override, quote ingestion, and cascade.

---

## 9. Per-card chat agent

Every `<DeliverableCard>` has a **Discuss** thread. Backend endpoint `POST /api/module/chat`. The agent is scoped to that module but receives the **full PlanState** as context so it respects constraints (budget, headcount, date, honorees).

The agent can do exactly three things:

1. **Justify / discuss** — defend or rethink the recommendation in light of the user's points ("I'd prefer a resort over a hall — thoughts?").
2. **Ingest pasted quotes in ANY format** → a normalized comparison. Example input:
   > "Resort A: 1.2L incl. catering for 50, or 80k venue-only. Hall B: 60k, we bring caterer. Backyard: free + ~40k catering + 25k tenting."
   → parse into `QuoteOption[]`, score each on **cost × convenience** (setup effort, distance, catering-included, cleanup, parking — not cost alone), and return a comparison + a recommended pick **with reasoning**.
3. **Propose a revision** — return a structured proposal the user can **Apply** or **Lock**.

**Output contract (strict JSON from the backend):**
```json
{
  "reply": "conversational text shown in the thread",
  "proposal": {                       // optional — present only when a concrete change is proposed
    "recommendation": "…",
    "reasoning": ["…"],
    "costLines": [ { "label": "…", "amount": 0, "basis": "quoted" } ],
    "ingestedQuotes": [ /* QuoteOption[] when quotes were pasted */ ]
  }
}
```

When the user clicks **Apply**, merge the proposal into the Deliverable and **run it through the activation + cascade pipeline (§5–6)** and recompute the budget. Quotes the user pastes become `basis: 'quoted'` cost lines. **Apply** never bypasses the engine.

---

## 10. Clothing & shopping module (special rules)

`clothing` is gated by `dressCode` (palette + formality flow down automatically so per-person picks harmonise). It targets the **innerCircle** list (honoree + named family with optional size/style notes), not all guests. Each person's outfit is its own sub-card with its own cost line and its own Discuss chat ("show me more in green", "she prefers indo-western", "cheaper").

**The hard URL rule — enforce this strictly, it is the most likely thing to be built wrong:**

> The LLM must **NEVER** invent or recall product SKU URLs from memory — they will 404. Shoppable links must be produced in exactly two reliable ways:

1. **Always — deterministic deep-search links.** Construct *search-query URLs* into each platform from the outfit spec. These are 100% reliable because they're built from a query string, not recalled. Examples:
   - Myntra: `https://www.myntra.com/<url-encoded-query>` (e.g. `emerald-bandhgala-men`)
   - Ajio: `https://www.ajio.com/search/?text=<query>`
   - Flipkart: `https://www.flipkart.com/search?q=<query>`
   Build these in code from the recommendation; the user clicks and lands on real, current, in-stock results.
2. **Enhanced — live web-search examples.** Since the backend proxies Anthropic, enable the **web-search tool server-side** so the clothing endpoint can surface 2–3 *actual* product results with real URLs and whatever images the search returns. **Label them "live results — verify availability."**

**Images:** show them only where web-search provides them; otherwise render a clean outfit-spec tile that links out. Under-promise the image, over-deliver the link — never fabricate either.

**Procurement-mode gating (days-left, per §7b):** the card states the mode and the reason — "3 days out: a custom-stitched outfit can't be ready and an online size swap is risky ⇒ in-store pickup is the only safe path."

Clothing cost per person flows into the budget engine like any other line.

---

## 11. LLM integration (backend)

Create `server/index.ts` with:

- `POST /api/module/generate` → body `{ moduleId, planState }` → returns one `Deliverable` as JSON.
- `POST /api/module/chat` → body `{ moduleId, planState, history, userMessage, pastEventsIndex }` → returns the §9 JSON contract. `pastEventsIndex` is the compact past-event archive (§12a) so the agent can answer references to earlier celebrations.
- `POST /api/plan/generate-all` → generates all always-active modules (run `itinerary` and `content` last), then runs activation for conditional ones. Uses `MODEL_PLAN` (§0) — Opus 4.8 acceptable here for depth.

Implementation notes:
- Use `@anthropic-ai/sdk`; key from `process.env.ANTHROPIC_API_KEY`. **Model is per-surface (§0):** chat → `MODEL_CHAT` = `claude-sonnet-4-6` with `effort: medium`; per-module generate → `MODEL_GENERATE` = `claude-sonnet-4-6`; generate-all → `MODEL_PLAN` (Sonnet default, Opus 4.8 acceptable). Bind the effort level via the current Sonnet 4.6 reasoning-effort parameter — verify the exact field name against docs, don't invent it.
- **Per-module system prompts** encode that module's job, its `dependsOn` context, the **reasoning-voice** requirement (§7a), days-left/memoryValue/confidence rules, and India/INR realism.
- **Strict JSON out:** instruct the model to return *only* a JSON object matching the `Deliverable` (or chat) shape — no prose, no markdown fences. Strip any stray ```json fences defensively, then `JSON.parse` inside try/catch; on parse failure, retry once with a "return valid JSON only" reminder.
- **Web-search tool** enabled for `clothing` and `venue` research. Use the documented web-search tool block (confirm the current tool `type` string against Anthropic docs at build time — do not guess a version that may be wrong). Concatenate text blocks from multi-block responses before parsing.
- **Generation populates `leadTimeDays` and `momentId`** on every Deliverable (§7e, §4a), using the India-realistic lead-time anchors.
- **Past-event references:** the chat system prompt is told it may reference `pastEventsIndex` (§12a). When the user says e.g. "use the same photographer as Aryan's 1st birthday" or "what did the cake cost last Diwali?", the agent reads the index and either answers directly or returns a `proposal` with that vendor as a `quoted`/`actual` cost line. At this scale, inline the compact index in the request; if the archive grows large, promote it to a server-side `lookup_past_events` tool-call that filters the archive passed in the request body.
- CORS configured for the Vite dev origin. Sensible timeouts and a clear error surface to the frontend.

---

## 12. Persistence

- Autosave `PlanState` to `localStorage` on every change (debounced).
- **Export** the current plan to a downloadable `.json`; **Import** restores it.
- Support multiple named saved plans (a simple list keyed in localStorage).
- Bump `version` and `updatedAt` on each save.

### 12a. Past-event archive (referenceable in chat)
Store finalized events as a **separate** localStorage collection `archivedEvents: ArchivedEvent[]` — distinct from saved in-progress plans.

- **Store ACTUALS, not the plan.** What's useful later isn't "we estimated ₹40k for photography" — it's "we *used* Lensanche, ₹38k, videography included, and it worked." Persist the real vendors, the real per-category costs, the theme, and a free-text "what worked".
- **When:** an explicit **"Archive event"** action, offered once `date < today` (prompt the user to archive). It snapshots `actual`/`quoted` lines and vendor details from locked cards into an `ArchivedEvent`.
- **How it's used:** the app derives a compact **`pastEventsIndex`** (a few hundred tokens — type, honorees, date, total, key facts) and passes it into every `/api/module/chat` request (§11) so per-card chat can answer references and propose past vendors as `quoted`/`actual` lines — flowing through the normal proposal → Apply → cascade pipeline.
- **Optional convenience:** when starting a new plan, surface relevant past events and let the user pull a specific finalized vendor forward as a pre-filled cost line.

---

## 13. UI / UX guidance

Use your frontend-design skill. Keep it **calm, information-dense, and trustworthy** — this is a thinking tool, not a toy. Requirements:

- **Input wizard:** required fields first (event type, honoree(s), date, budget, location, cohorts), then an *optional richness* step (per-honoree personality / love-language / interests / recent interactions / wishes, exceptions, alcohol, memoryValue, inner-circle list). Make clear the optional layer sharpens the plan.
- **Plan view:** a grid/board of `<DeliverableCard>`s grouped sensibly (Setting · People · Gifts & Notes · Logistics · Capture). Conditional modules animate in with their activation `reason`.
- **Clear visual states:** distinct, legible treatments for `suggested` / `locked` / `overridden`, a prominent **STALE** badge with Refresh, a **low-confidence** nudge styled as an opportunity (not an error), and feasibility flags.
- **Sticky budget dashboard:** grand total vs budget, variance, subtotals by basis (estimated/quoted/actual), allocation target-vs-actual, per-category pressure. Updates live.
- **Card chat** opens in a drawer/expandable panel; pasted-quote comparisons render as a small table; proposals show **Apply / Lock**.
- **Prep Timeline panel (§7e):** the derived backward-planned schedule with a "Start planning by [date]" headline and action-by buckets; infeasible items flagged red at top. Sits alongside the budget dashboard.
- **Moments (§4a):** the plan view groups deliverables by Moment (e.g. "Midnight — family" vs "Main celebration"); the midnight moment appears with its activation reason and a dismiss control.
- **Archive (§12a):** an "Archive event" action once the date has passed, and a past-events reference surfaced when starting a new plan.
- Mobile-tolerable but desktop-first (this is a planning surface).

---

## 14. Build order (do this incrementally; verify each step)

1. **Scaffold:** Vite React-TS app + Express-TS server. Wire `.env`, prove a hello-world Anthropic round-trip through the proxy. Confirm the key is not in the client bundle.
2. **Types & store:** implement §2 types (incl. `Moment`, `ArchivedEvent`) and a `PlanState` store (Context/Zustand) with localStorage autosave.
3. **Input wizard:** required + optional + cohorts + exceptions + inner-circle.
4. **Universal `<DeliverableCard>`:** render/override/lock/alternatives UI against a hardcoded sample Deliverable.
5. **Module registry & moments:** §4 modules with `dependsOn` declared; §4a `Moment` model with a default primary moment and `momentId` on deliverables.
6. **Single-module generation end-to-end:** build `timing` first (best showcases the reasoning voice). Backend generate endpoint + strict-JSON parse + render. Ensure it returns `leadTimeDays` + `momentId`. Get the "why outdoor lunch" texture right before scaling.
7. **Generate-all:** all always-active modules for the primary moment; `itinerary` + `content` last.
8. **Cascade engine (§5):** value edges → stale + Refresh + lock-respect.
9. **Activation engine (§6):** existence edges incl. the birthday **midnight-celebration moment** plus outdoor/home/kids/mobility/alcohol rules; spawn/deactivate with reasons; route through cascade.
10. **Cost engine (§8):** emit cost lines, formulas (show food math), three-tier basis, allocation, variance, pressure, live recompute (sums across all moments).
11. **Prep Timeline + feasibility (§7e):** derive action-by dates, buckets, and the "Start planning by [date]" headline; wire feasibility = leadTime vs daysLeft with the §7b downgrades.
12. **Per-card chat (§9):** discuss + quote ingestion → comparison + proposal → Apply (through the engine).
13. **Past-event archive (§12a):** "Archive event" action storing actuals; derive `pastEventsIndex` and feed it into chat so references + past-vendor proposals work.
14. **Clothing module (§10):** dress-code inheritance, deterministic deep-search links, server-side web-search examples, procurement-mode gating, the hard URL rule.
15. **Persistence (§12):** export/import + multiple saved plans.
16. **Polish:** states, empty/loading/error, low-confidence nudges, Prep Timeline + budget dashboard refinement.

---

## 15. Definition of done (self-check)

- [ ] Anthropic key never appears in the frontend bundle; all model calls go through the backend.
- [ ] Every deliverable shows multiple, specific "why" reasons in the §7a voice.
- [ ] Changing venue→home with >15 guests **spawns** caterer + rentals with a visible reason.
- [ ] Switching timing to outdoor spawns weather-backup + comfort (and lighting if evening).
- [ ] Overriding or locking a card survives any subsequent regeneration untouched.
- [ ] Changing an upstream input marks unlocked downstream cards STALE (locked ones never).
- [ ] Days-left genuinely changes dress-code/clothing/activities **mode**, with stated reasons.
- [ ] memoryValue=high yields videography + keepsake gift + recorded/future-letter note, argued as long-term joy.
- [ ] Food quantity uses the visible per-cohort formula; menu honors exceptions.
- [ ] Pasting messy vendor quotes into a card returns a cost×convenience comparison + a reasoned pick; Apply flows through activation+cascade and updates the budget as `quoted` lines.
- [ ] Clothing links are real (deterministic search URLs + optional live web-search results); **no fabricated SKU URLs anywhere**.
- [ ] Budget dashboard shows subtotals by basis, variance, allocation, and pressure, and recomputes live.
- [ ] Low-confidence cards show a targeted "give me one detail" nudge that demonstrably sharpens them.
- [ ] Plan persists to localStorage and exports/imports as JSON.
- [ ] Prep Timeline shows a backward-planned schedule; "Start planning by [date]" reflects the longest active lead time and jumps when a travel activity is added.
- [ ] Feasibility derives from leadTime vs daysLeft; an infeasible item is flagged red and triggers its §7b downgrade.
- [ ] Birthday events propose a dismissible midnight family cake-cutting moment with its own cake / bouquet / intimate-gift / decor cards.
- [ ] Baby / young-child birthdays additionally propose a dismissible morning wake-up moment with a balloon setup (arranged the night before).
- [ ] Deliverables are grouped by Moment; budget and prep timeline span all moments.
- [ ] An event can be archived (actuals) once its date passes; chat can reference a past event and propose a past vendor as a quoted/actual line.

Build it. Prioritize the reasoning quality, the reactive engine (§5–6), and the cost basis (§8) — those three are the product.
