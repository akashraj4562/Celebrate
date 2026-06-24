# Celebrate — Product Staff Review (pre-build gate)

> **Date:** 2026-06-24
> **Gate:** Org P0 implementation-gate — spec/PRD review must be resolved before any code is written.
> **Board:** Head of Product (PM), Tech Lead, AI Engineer (mandatory), Senior UX Designer, Prompt Engineer.
> **Artifact reviewed:** `docs/BUILD-PROMPT.md`.

---

## Verdict summary

| Reviewer | Verdict | One-line |
|---|---|---|
| Head of Product (PM) | **Needs-rework** | Thesis is right, but the build has no declared purpose and no success definition beyond a build-checklist; ships a full end-state as a v1. |
| Tech Lead | **Needs-rework** | The single-key `deliverables` map and the undefined `itinerary`/`content` edges are foundational defects that force an engine rewrite if not fixed first. |
| AI Engineer | **Needs-rework** | Two stale/fragile API choices (the `effort` field shape and prompt-for-JSON parsing) will cause 400s and intermittent parse failures across 14 modules. |
| Senior UX Designer | **Needs-rework** | The card IA is unresolved; built from §13 as-is it produces a wall of identical dense cards; the two heaviest layout questions are left open. |
| Prompt Engineer | **Ship-with-changes** | Structurally sound, but no shared system scaffold, no convenience rubric, and an underspecified JSON strategy will burn iterations on the hardest surfaces. |

**Bottom line:** Nobody says *don't build it*. Everybody says *fix these specific things first, and cut the first build to a spine that proves the thesis before adding breadth*. The single most important insight from the synthesis: **the recommended MVP spine also sidesteps the two hardest technical defects** (the multi-instance data model and moment-spanning state), because both are triggered by features the spine defers (clothing per-person sub-cards, Moments). Scope discipline and technical de-risking point the same way.

---

## The 8 convergent must-fixes (resolve before building)

### 1. Declare the build's PURPOSE and a real success definition — *owner decision* (PM)
The spec never says what Celebrate is *for*. Personal-use, portfolio/interview-showcase, and product-probe imply ~5× different scopes. §15's 19 checkboxes are "feature is built," not "this succeeded." **Fix:** Akash picks one purpose; we add the 3-line proof-of-value gate (behavior change → observable signal → key assumption) and name the single demoable "wow." PM's hypothesis for the wow: *"change one input → the board reasons about the consequences and the cost re-flows, with every 'why' visible."*

### 2. Cut the first build to an MVP SPINE — *owner decision* (PM; echoed by all via complexity)
The spec specifies 14 always-active + 8 conditional modules + Moments + chat + quote-ingestion + archive + clothing/web-search + prep-timeline + 3 engines + 7 activation rules across 16 build stages. The spec's own closing line names the spine ("reasoning quality, the reactive engine §5–6, and the cost basis §8") and then specifies 4× around it. **Recommended spine below.**

### 3. Fix the DATA MODEL before writing state (Tech Lead P0-1)
`deliverables: Record<string, Deliverable>` keyed by `moduleId` cannot represent: clothing's per-person sub-cards (§10), the same module in two Moments (§4a), or conditional+always-active coexistence. **Fix:** key by a stable composite (`${moduleId}__${momentId}`), add `instanceId`, and model clothing as `subItems: SubDeliverable[]` (each with own cost line + chat + lock) — *not* per-person top-level modules. Budget sums across all instances **and** sub-items, across all moments. **Spine note:** if the spine defers clothing + Moments (recommended), the simple single-key map is sufficient for v1 — but adopt `instanceId` now (cheap) so we're moment-ready later.

### 4. Define the dependency graph + bound the cascade blast-radius (Tech Lead P0-2/P0-3; PM P0-3; UX P1-1)
`itinerary dependsOn "(most modules)"` is a TODO, not a spec — it makes the DAG unprovable and means one `timing` edit stales most of the board. **Fix:** (a) enumerate `itinerary.dependsOn` explicitly (the pacing facts: `timing, venue, activities, gifts, notes, food` — *not* decoration/clothing/transport/photography); (b) `content` is a leaf; photography reads the itinerary directly, never `content`; (c) run a topological sort (Kahn) at registry load and **throw on any cycle** — generation order then falls out of the topo sort; (d) define the pipeline as a single run-to-fixpoint pass (activation rules must be pure functions of non-derived inputs) with an idempotency test; (e) locked-conditional-goes-false gets an explicit `orphaned` flag, never silent miscount; (f) **UX:** when ≥3 cards go stale from one change, show one calm board-level banner ("8 items affected by your venue change — Review / Refresh all") + a muted per-card amber dot — never N red sirens. Add a counter-metric: *a single upstream edit should need ≤ ~3 mandatory refreshes to settle*.

### 5. Lock the Anthropic API specifics — structured outputs, not prompt-for-JSON (AI Engineer P0-1/2/3; Tech Lead P1-1)
See the checklist below. Headlines: the `effort` parameter is **nested under `output_config: { effort }`**, not top-level (`max` is Opus-only); replace "instruct-JSON + strip-fences + parse + retry" with **structured outputs** (`output_config: { format: { type: "json_schema", schema } }`) derived from `src/types.ts`; **do not use assistant prefill** (it 400s on these models); add **prompt caching** on the stable system scaffold + PlanState prefix; **trim context** to each module's `dependsOn` slice rather than sending the full PlanState. *(One reviewer conflict — Prompt Engineer suggested a `{` prefill for JSON reliability; the AI Engineer flags prefill as a 400 on `claude-sonnet-4-6`/`claude-opus-4-8`. **Resolution: structured outputs is the house pattern; no prefill.** To verify against current docs at build time via the `claude-api` reference before writing `server/index.ts`.)*

### 6. `generate-all` = dependency-ordered parallel waves, not a serial blob or a mega-call (Tech Lead P0-4; AI Engineer; Prompt Engineer Q3)
14 serial calls each with full PlanState risks 60–120s and a total failure on one bad parse. **Fix:** topo-ordered **waves** with the wide middle tier fanned out via `Promise.allSettled` (bounded concurrency ~4–6, per-call timeout); render each card's skeleton immediately and fill as it resolves (card-level streaming); one module's failure degrades to a single retryable card, never aborts the other 13. Structured outputs (fix #5) removes the format-failure class entirely.

### 7. Resolve the card IA and the page layout before step 4 (UX P0-1/2/3; P1-3)
- **Card:** define **at-rest (collapsed)** vs **expanded**. At rest: title + 1-line recommendation + single cost total + **one** highest-priority state badge (`INFEASIBLE > TIGHT > STALE > LOW-CONF > overridden > locked > suggested`) + Lock + Discuss. Expanded: full reasoning, all cost lines, all four controls, alternatives, low-conf nudge.
- **Layout:** one persistent **right rail (320px)** with tabs **Budget | Timeline | Chat**; Discuss opens the card's thread in the rail so the board never reflows.
- **Grouping:** **Moment is the primary axis**, category secondary within each moment.
- **Wizard:** integrate the optional richness **inline** on each honoree with a visible payoff (*"without this: 'premium perfume set' → with this: 'guided weekend cycling experience'"*), not as a skippable step-2.

### 8. Prompt architecture: one shared scaffold + per-module slot (Prompt Engineer; AI Engineer caching; Tech Lead P1-3)
One cacheable `SYSTEM_SCAFFOLD` (reasoning-voice contract with the §7a exemplars as **few-shot** + anti-generic guardrail, India/INR realism, the days-left/memoryValue/confidence/leadTime rules, the structured-output schema) + a short per-module `MODULE_SLOT` (job + the extracted `dependsOn` context). For quote-ingestion: the **convenience-score rubric must be explicit** — LLM extracts structured facts (`cateringIncluded`, `setupEffort`, `distanceKm`, `parking`, `cleanupIncluded`), **code computes** the 0–100 score from stated weights (same discipline as the food formula and the URL rule), and the breakdown is shown.

---

## Recommended MVP spine (v1) vs deferred (v2)

**v1 spine — prove the thesis end-to-end on ONE event type (`birthday`):**
- **Engines:** cascade (§5) + cost-basis/budget (§8) + a **trimmed activation set** — only `home-catering`, `outdoor-backup`, `kids` (3 rules prove the existence-edge mechanic visibly).
- **Modules (~8):** `timing`, `venue`, `theme`, `gifts`, `food`, `decoration`, `photography`, `itinerary`.
- **Full card contract (§3):** reasoning list, override, lock, refresh, alternatives, three-tier cost — this *is* the product; build it completely.
- **Per-card chat:** discuss + propose + Apply→cascade. **Defer quote-ingestion.**
- **Prep Timeline + feasibility (§7e):** keep — pure computation, cheap, and the "Start planning by [date]" headline is a genuine demoable wow.

**Deferred to v2 (with reason):** quote-ingestion (own parser/failure modes) · clothing + web-search (highest-effort, lowest-differentiation; also the source of the data-model defect) · Moments/midnight sub-plan (scope multiplier) · past-event archive (zero value on first use — cold-start) · the other 5 conditional modules · second event type (the *first* v2 step, proves the engine generalizes).

*Why this cut:* front-loads the biggest unknown (does reactive reasoning feel like magic or friction?) and the most differentiated assets (reasoning voice, cost basis), and defers what is cold-start-worthless, highest-effort-lowest-edge, or a scope multiplier — and it sidesteps the two hardest technical defects for v1.

---

## Anthropic API — facts to lock at build time (AI Engineer)

Each flagged **[verify]** against the `claude-api` reference before first commit (these are exactly the volatile strings §0 warned about).

- **Model IDs:** `claude-sonnet-4-6`, `claude-opus-4-8` — current and correct; bare strings, no date suffixes. [verify]
- **Reasoning effort:** `output_config: { effort: "low"|"medium"|"high"|"max" }` — **nested, not top-level.** `max` = Opus only; Sonnet uses `low|medium|high`; default `high`. Map `CHAT_EFFORT` → `output_config.effort`; reject `max` unless model is Opus. [verify]
- **Structured outputs (primary JSON mechanism):** `output_config: { format: { type: "json_schema", schema } }` on Sonnet 4.6 / Opus 4.8. Every object needs `additionalProperties:false`; schema **cannot** enforce `minItems`/min/max/length → enforce "≥2 reasoning points", "1–2 alternatives" in a **post-parse validator**. Incompatible with citations and prefill. [verify]
- **No assistant prefill** — last-assistant-turn prefill 400s on both models. [verify]
- **Thinking (if used):** `thinking: { type: "adaptive" }`; do *not* use `{type:"enabled", budget_tokens}`. Off unless set. [verify]
- **Web-search tool:** `{ type: "web_search_20260209", name: "web_search" }`, server-side; handle multi-block / `pause_turn`; concatenate text blocks. (v1 spine defers clothing → web-search not needed until v2.) [verify]
- **Prompt caching:** `cache_control:{type:"ephemeral"}` breakpoints (max 4/req) on the stable system scaffold and the stable PlanState prefix; keep them byte-identical (no `today`/`daysLeft` interpolation in the cached block); verify via `usage.cache_read_input_tokens`. Min cacheable prefix ~2048 tok Sonnet / ~4096 Opus. [verify]
- **max_tokens:** set explicitly per surface (~4096 chat; 4–8k per module) so JSON doesn't truncate.

---

## P1 / watch-items
- **Override-ability** is named a pillar but under-instrumented vs reasoning/cost — give it a felt mechanism or stop claiming three pillars (PM P1-1).
- **Creepiness line** on personalization — reasoning may cite *what the user said*, must not assert psychological claims the user didn't supply (PM P1-2).
- **Binary `confidence`** is coarse for a calibrated-reasoning product — keep binary for v1 but *name it a deliberate simplification*; watch nudge fan-out (PM P1-3, Tech Lead).
- **STALE vs low-confidence precedence** — never show both CTAs on one card; STALE supersedes until refreshed (PM P1-4).
- **`memoryValue` double-count** — it both shifts allocation % and upgrades line items; confirm intended (Tech Lead Q3).
- **Quote-ingestion intent dispatch** — add an `intent` hint so the chat call isn't a compound classify-then-do (Prompt Engineer F6). (v2, with quote-ingestion.)
- **Observability** — one JSONL log line per model call + a cheap reasoning-voice quality gate (AI Engineer P1-3).

---

## Open decisions for the owner
1. **Primary goal:** personal-use · portfolio/interview-showcase · product-probe? (Drives scope + success definition.)
2. **Scope:** adopt the v1 spine above, or build wider?
3. **The demoable wow:** confirm *"change one input → board re-reasons + cost re-flows, every why visible"* — or name a different one.
4. **Acceptable per-event API cost ceiling** (turns the cost surface into a designed constraint).
5. **Confidence:** binary (deliberate v1 simplification) or graded to match the cost tiers?
6. *(I will default these unless you object:)* structured-outputs as the house JSON pattern · context trimmed to `dependsOn` slices · chat in the right rail · Moment-primary grouping · generate-all as parallel waves · web-search deferred with clothing.

---

# Appendix — full specialist reviews (verbatim, for traceability)

## A. Head of Product (PM)

**Verdict:** Needs-rework — the thesis is good, but the spec ships a fully-realized end-state as a v1 with no declared purpose and no success definition beyond a build-checklist; the proof-of-value gate (the owner's own Step 11) is unmet.

Strengths: (1) the thesis "recommendation is commodity; reasoning + reactivity + override-ability are the product" is the right, differentiated identity (P-11). (2) The three-tier cost basis (estimated→quoted→actual) is the strongest single idea — honest-uncertainty, confidence rises toward actual (mental-model §11/§12, P-12). (3) The hard URL rule + JSON-parse discipline show the org anti-patterns were internalized (AP-14).

P0: (1) **No declared purpose** — personal/portfolio/product imply ~5× different scopes; §15 is build-completion, not success; add the 3-line proof-of-value gate; PM read is "portfolio-grade capability-showcase." (2) **Over-scoped; no MVP spine** — the AP-02 large-bet trap; the spec names its own spine then specifies 4× around it; cut to the spine, add a real "Out of scope (v1)". (3) **Reactivity is always-on with no friction guardrail** — one edit stales most of the board → "reactivity thrash" wearing magic's clothing, and an uncapped cost/latency surface; add soft/hard staleness, batched board-level review, a ≤3-refresh counter-metric. (4) **No cost/latency budget** — add prompt caching on the shared context, per-call max_tokens, bounded-concurrency refresh-all with visible running cost.

P1: override-ability under-instrumented vs the other two pillars; the personalization "creepiness line" is never drawn (cite what the user said, don't assert psychology); binary confidence is too coarse (name it deliberate); low-conf nudge + STALE can collide (define precedence).

MVP spine: engines (cascade + budget + 3 activation rules: home-catering/outdoor-backup/kids); ~8 modules (timing, venue, theme, gifts, food, decoration, photography, itinerary); full card contract; chat discuss+propose (defer quote-ingestion); prep-timeline+feasibility. Defer: quote-ingestion, clothing+web-search, Moments/midnight, archive, the other conditionals, second event type.

Open Qs: primary goal? the one demoable moment? is reactive re-planning a need you've felt or an elegant mechanic? acceptable per-event API cost? binary vs graded confidence?

Biggest risk: building the full 16-stage spec faithfully and only then discovering pervasive reactive staleness reads as nagging friction, not intelligence — having sunk the most effort into the least-differentiated breadth first (the AP-02 trap).

## B. Tech Lead

**Verdict:** Needs-rework — well-specified in prose, but the single-key `deliverables` model (§2) and the unspecified `itinerary`/`content` edges (§4/§5) are foundational defects that force an engine/card rewrite if not fixed before code.

Verified facts used: model IDs valid; effort is `output_config:{effort}` (nested), `max` Opus-only; web-search `web_search_20260209`; SDK refuses non-streaming requests it estimates >~10 min.

Strengths: foundation is correctly named (§1, closing line); the §10 URL rule pre-empts the most likely 404 failure; lead-time→prep-timeline→feasibility (§7e) is a clean derived-state design.

P0-1 **data model**: `Record<string,Deliverable>` keyed by moduleId can't represent clothing per-person sub-cards, same-module-in-two-moments, or conditional+always coexistence → key by `${moduleId}__${momentId}` + `instanceId`; clothing gets `subItems: SubDeliverable[]`; budget sums across instances + subItems + moments.

P0-2 **dependency graph**: `itinerary dependsOn "(most modules)"` is a TODO → enumerate (`timing,venue,activities,gifts,notes,food`), make `content` a leaf, photography reads itinerary not content, run Kahn topo-sort at load and throw on cycle (generation order falls out), collapse high-fan-out staleness into one board-level banner.

P0-3 **pipeline semantics**: define a single run-to-fixpoint pass (activation rules pure functions of non-derived inputs) + idempotency test (run twice, assert deep-equal); locked-conditional-goes-false → explicit `orphaned` flag, still budgeted, with a "kept because you locked it" chip; generate-all and per-change edits share one code path.

P0-4 **generate-all**: 14 serial full-PlanState calls + no streaming will hit SDK timeout and fail-all on one parse → dependency-ordered waves, wide middle tier via `Promise.allSettled` (bounded concurrency, per-call timeout), card-level skeleton streaming, per-card retry on failure (no silent catch).

P1: effort param mis-specified (map CHAT_EFFORT→output_config.effort, guard max=Opus; pin web_search_20260209); Express CORS allowlist + port env var (avoid 5173/5180/5190 collision) + error contract `{error,code}` + real key-not-in-bundle grep; convenienceScore must be code-computed from extracted facts with a shown breakdown; pastEventsIndex token-budget unverified (count_tokens + cap + cache).

Open Qs: refresh-all economics (auto-refresh cheap downstream vs strictly manual?); Moments ceiling (only midnight, or arbitrary user moments?); memoryValue double-count (shift % AND upgrade line?); binary confidence fan-out rollup.

Biggest risk: the reactive engine — undefined itinerary edges + unspecified idempotency/termination = a graph that isn't provably a DAG feeding a pipeline that can re-enter itself; lock the edge set, topo guard, and fixpoint contract before writing cascade.ts/activation.ts.

## C. AI Engineer

**Verdict:** Needs-rework — ships on two stale/fragile API choices (the effort field shape and prompt-for-JSON) that will 400 and intermittently fail across 14 modules; cheap to fix, flagged "verify" in the spec, so a pre-build correction not a redesign.

Strengths: server-side proxy + key-never-in-bundle correct; per-surface env model selection sound; the spec pre-flags every volatile API string (and the model IDs are current).

P0-1 **effort shape**: `effort` is nested in `output_config:{effort:"low"|"medium"|"high"|"max"}`, not top-level; `max` Opus-only; validate CHAT_EFFORT∈{low,medium,high} at boot. P0-2 **structured outputs**: replace prompt-for-JSON+strip+retry (compounds to near-certain failure somewhere across 14 modules) with `output_config:{format:{type:"json_schema",schema}}` derived from types.ts (Zod→zodOutputFormat); schema can't enforce minItems/min/max/length → post-parse validator; additionalProperties:false; incompatible with citations/prefill; for clothing+venue use a two-step (search call → structured call). P0-3 **no prefill**: last-assistant prefill 400s on both models — document "do not prefill."

P1-1 **context trim**: passing full PlanState every call is wasteful + quality-negative ("lost in the middle") → `contextFor(moduleId,planState)` = dependsOn slice + global facts (+ card chat for chat). P1-2 **prompt caching**: the single biggest cost/latency lever — breakpoints on stable system scaffold + stable PlanState prefix; keep byte-identical (no timestamp leak); send generate-all's 14 calls so calls 2–14 read the cache call 1 wrote; min prefix 4096 Opus / 2048 Sonnet. P1-3 **observability**: one JSONL line/call + a cheap reasoning-voice quality gate.

API checklist (verify): model IDs current; `output_config.effort` nested; `thinking:{type:"adaptive"}`; `output_config.format` json_schema; no prefill; `web_search_20260209`; `cache_control:{type:"ephemeral"}` (max 4); explicit max_tokens.

Open Qs: structured-outputs vs forced-tool-emit as house pattern? Opus only when memoryValue=high? comfortable with dependsOn-slice-only context? web-search on venue worth v1 latency/cost?

Biggest risk: shipping effort as top-level (immediate 400 on chat) + relying on prompt-for-JSON across 14 modules (happy-path demo, intermittent real-use failure) where the natural "fix" (prefill) is itself a 400. Land structured outputs + nested effort before any module work.

## D. Senior UX Designer

**Verdict:** Needs-rework — a powerful engine whose UX surface is underspecified to where §13 yields a wall of identical dense cards; the two heaviest structural questions (layout real-estate, primary grouping axis) are left open.

Strengths: low-confidence-as-opportunity framing (§7d) is right; three-tier cost basis mirrors real user behavior; lock-never-stale semantics respect user intent.

P0-1 **card IA**: §3 implies 9+ elements at rest × 14–22 cards = overload vs "calm" (§13) — define at-rest (title + 1-line rec + single cost total + ONE priority state badge + Lock + Discuss) vs expanded (full reasoning, all cost lines, four controls, alternatives, low-conf nudge); badge priority INFEASIBLE>TIGHT>STALE>LOW-CONF>overridden>locked>suggested, never >2 at once. P0-2 **grouping**: category AND Moment both claimed primary with no hierarchy → Moment primary, category secondary within each moment (collapsible), budget/timeline mirror it. P0-3 **two side panels**: budget + prep-timeline both "alongside" is a real-estate fight → one persistent 320px right rail with tabs Budget | Timeline (+ auto-switch to Timeline when a long-lead module spawns); bottom drawer < 1100px.

P1-1 **stale UX**: per-card sirens are alarming → muted amber dot + board-level "8 items out of date — Refresh all unlocked?" when ≥3 stale. P1-2 **wizard**: optional step-2 gets skipped, killing the signal→joy promise → integrate inline per honoree with a visible payoff micro-example. P1-3 **chat surface**: open the thread in the right rail (Chat tab), not inline, so the board never reflows; also solves clothing sub-card chats.

Open Qs: Moment as tab vs inline section? chat rail vs inline drawer? surface "protected from this cascade" for locked cards? archive entry point (wizard step vs passive)? innerCircle cap / clothing person-switcher?

Biggest risk: the dev builds `<DeliverableCard>` once from §3 with everything exposed; by generate-all (step 7) the visual debt is structural, and the owner (who reviews rendered screens) requests a rework touching every card. Fix the card hierarchy spec before step 4.

## E. Prompt Engineer

**Verdict:** Ship-with-changes — structurally sound and precise, but three prompt-architecture gaps (no shared scaffold, no convenience rubric, underspecified strict-JSON) will reliably blow iterations on the hardest surfaces.

Strengths: §14 build order (timing first as voice showcase) is correct risk-reduction; §10 hard URL rule explicit and well-placed; the typed data model doubles as the output contract.

P0: (1) **no shared scaffold** — 5 cross-cutting concerns × 14 prompts will drift; define one cacheable `SYSTEM_SCAFFOLD` (voice contract + §7a exemplars + INR realism + JSON contract + cross-cutting rules) + short `MODULE_SLOT` per module; assemble server-side; shared prefix is the cache boundary. (2) **strict-JSON fragile on multi-block** — fence-strip vs concatenate-text-blocks compete; recommends prefill `{` [**superseded by AI Engineer: structured outputs, no prefill**], extract text blocks for tool-use, and a specific retry that echoes the failed string. (3) **convenienceScore rubric absent** → embed a verbatim rubric (catering-included +35, no-cleanup +20, ≤10km +15, parking +15, low-setup +15; penalties) so scores are consistent.

P1: (4) **context bloat** — pass only dependsOn keys via `extractContext(moduleId,planState)`. (5) **voice exemplars** stated as prose not few-shot → put the four §7a exemplars in-prompt + anti-generic guardrail ("name a specific/quantified/named factor; if it could apply to any city on any date, it failed") — the de-risk test for step 6. (6) **chat intent dispatch** — add `intent?:'justify'|'ingest'|'propose'`; frontend heuristically sets `ingest` on currency/vendor/quote cues to avoid a compound call.

Recommended architecture: `SYSTEM_SCAFFOLD` (~600 tok, constant, cached) + `MODULE_SLOT` (~150 tok, dynamic) assembled as `systemPrompt = SYSTEM_SCAFFOLD + buildModuleSlot(moduleId, planState)`.

Open Qs: itinerary context — full upstream reasoning or one-line summaries? quote-ingestion streaming? generate-all parallel-per-module vs one mega-call? low-conf nudge surface (card header vs drawer vs summary)?

Biggest risk: `itinerary` is the riskiest prompt — synthesis over 14+ outputs with a voice requirement, failure mode = a schedule instead of a paced emotional arc; build its slot last, give it two exemplar entries, run it manually before wiring into generate-all.
