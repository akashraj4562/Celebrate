# Celebrate — Backlog (parked 2026-06-24)

Steps 1–12 are **done, verified, and pushed**. Build order follows spec §14.
Resume from **Step 13**, which is partially built.

---

## Step 13 — Past-event archive (§12a) · IN PROGRESS

**Goal:** finish an event → snapshot its *actuals* (real vendors + real per-category
spend, not estimates) into a separate `archivedEvents` collection; surface past
events when starting a new plan; let per-card chat reference them.

**Done:**
- `src/engine/archive.ts` — pure engine (NOT yet wired into any UI/route):
  - `buildArchivedEvent(plan, whatWorked?)` → `ArchivedEvent` (snapshots locked /
    overridden / quoted-or-actual cards; `totalSpend` = each active card's most-final
    cost line summed, no double-count).
  - `archiveFacts(plan)`, `totalSpend(plan)`, `cardCost(d)`, `isFinalized(d)` helpers.
  - `pastEventsIndex(events)` → compact token-cheap string for the chat agent.
- Store already has the slots: `archivedEvents`, `archiveEvent(event)`, `removeArchivedEvent(id)`.
- Types already exist: `ArchivedEvent`, `ArchivedFact`.

**Remaining:**
1. **Archive action in PlanView** — when `daysLeft(input.date) < 0`, show a calm
   banner ("This event has passed — capture what worked and archive it"). Opens an
   **ArchiveDialog** (`src/features/plan/ArchiveDialog.tsx`, new): preview the derived
   facts (category · detail · cost) + `totalSpend`, a "What worked / what you'd change"
   textarea, Archive / Cancel. On Archive: `archiveEvent(buildArchivedEvent(plan, note))`
   then `selectPlan(null)` to land home.
2. **Home archive surface in Wizard** — a "Past celebrations" panel (only when
   `archivedEvents.length > 0`) listing type · honorees · date · `totalSpend` · facts ·
   whatWorked, each with **Plan one like this** (prefills wizard: eventType, honoree
   names, budget≈totalSpend; date+city stay blank — ArchivedEvent has no city) and a
   remove (`removeArchivedEvent`). Add a `prefillFrom(event)` to Wizard that calls its
   existing setters.
3. **Wire `pastEventsIndex` into chat** (spec §11 body `{…, pastEventsIndex}`):
   - `src/api.ts` `chatModule(…, pastEventsIndex?)` → include in POST body.
   - `src/features/plan/PlanView.tsx` `sendChat` → compute from `useStore.getState().archivedEvents` and pass.
   - `server/index.ts` `/api/module/chat` → accept `pastEventsIndex`.
   - `server/chat.ts` → thread it into `chatContext` + extend `CHAT_SYSTEM`: may
     reference past events and propose a past vendor as a `quoted`/`actual` cost line
     (flows through the normal proposal → Apply → cascade path).
4. **CSS** — archive dialog (modal overlay), past-celebrations panel, date-passed banner.
5. **Verify** — `scripts/e2e-archive.mjs` (seed a past-dated plan with locked/quoted
   cards → Archive → assert ArchivedEvent shape + lands home + panel shows + prefill
   works) and a tsx unit check for `buildArchivedEvent` / `pastEventsIndex`.
6. Commit + push; update `project-celebrate` memory (mark step 13 done, next = 14).

---

## Step 14 — Clothing/outfits module + hard URL rule + web search (§10, §11)

**Layer A — deterministic core · DONE (PR: feat/step-14-clothing):**
- `src/lib/shopping.ts` — `buildSearchLinks(query)` → Myntra/Ajio/Flipkart `ShoppableLink`
  kind `'search'` (query-built, strips any leaked URL); `procurementMode(daysLeft)`.
- `server/generate.ts` — `clothing` branch: per-person `SubDeliverable[]` from the
  `innerCircle` (falls back to honorees), dress-code palette inheritance via the
  upstream block, model emits a PLAIN `searchQuery` (never a URL) → code builds links;
  card reasoning leads with the procurement-mode line. Cost lives on the sub-items
  (budget engine already sums `subItems`).
- `DeliverableCard` — per-person sub-cards (outfit, cost, size/style, reasoning, link
  chips); `cardTotal`/`basisSummary` include sub-item lines. `card.css` for sub-cards + chips.
- Verified: `scripts/unit-shopping.ts` (links + SKU-strip + mode) + `scripts/e2e-clothing.mjs`
  (seeded sub-cards render, total sums, hrefs are real search URLs, no fabricated SKU).

**Layer B — live web search · REMAINING:**
- Server-side `web_search_20260209` (Sonnet 4.6 / Opus: dynamic filtering built-in — do
  NOT also declare `code_execution`). Two-step: search call → structured extraction of
  2-3 real results → `ShoppableLink` kind `'live'` with `imageUrl` only when search
  returns one. Label chips "live — verify availability". Best-effort / behind a flag so
  generation degrades gracefully without it. The `'live'` chip rendering already exists.

## Step 15 — Persistence: export/import + multiple plans (§12)
- Store already has `importPlan` / `exportCurrent` / multi-plan map. Build the UI:
  a plan switcher (list saved plans, select/rename/delete), **Export** (download the
  `SavedPlan` JSON) and **Import** (file-pick → `importPlan`). Autosave already works.

## Step 16 — Polish
- Animations for conditional cards/moments animating in with their `reason`;
  empty/loading states; low-confidence nudge styling pass; a11y sweep; final
  screenshot review against the calm-editorial / warm-paper doctrine.

---

### Conventions (so a resume is clean)
- Ports: web **5200**, API **5201**. Run `npm run dev`. Typecheck `npx tsc --noEmit -p tsconfig.json`.
- API key lives only in `server/.env` (gitignored) — never in the client bundle.
- Verify reactive UI with **seeded-localStorage Playwright e2e** (`scripts/e2e-*.mjs`,
  set `celebrate-store`) + tsx pure-function checks — fast, few/no model calls.
- Push over **SSH** to `git@github.com:akashraj4562/Celebrate.git` (`main`).
- Apply chat/engine changes **through** the reactive pipeline (override→cascade→activate), never silent edits.
