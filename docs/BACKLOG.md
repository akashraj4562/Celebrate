# Celebrate — Backlog (parked 2026-06-24)

Steps 1–13 are **done and verified**. Build order follows spec §14.
Resume from **Step 14** (clothing module + hard URL rule + web search).

---

## Step 13 — Past-event archive (§12a) · DONE

**Goal:** finish an event → snapshot its *actuals* (real vendors + real per-category
spend, not estimates) into a separate `archivedEvents` collection; surface past
events when starting a new plan; let per-card chat reference them.

**Shipped:**
- `src/engine/archive.ts` — pure engine: `buildArchivedEvent`, `archiveFacts`,
  `totalSpend`, `cardCost`, `isFinalized`, `pastEventsIndex`.
- `src/features/plan/ArchiveDialog.tsx` — preview of derived facts (category · detail ·
  cost) + `totalSpend`, "what worked" textarea, Archive / Cancel.
- `PlanView` — calm date-passed banner (`daysLeft < 0 && anyCards`) opens the dialog;
  on Archive: `archiveEvent(buildArchivedEvent(plan, note))` then `selectPlan(null)`.
- `Wizard` — "Past celebrations" panel (when `archivedEvents.length > 0`) with
  type · honorees · date · spend · facts · whatWorked, **Plan one like this**
  (`prefillFrom` seeds eventType / honoree names / budget≈spend; date+city blank) and Remove.
- `pastEventsIndex` threaded into chat: `api.ts` → `server/index.ts` →
  `server/chat.ts` (`chatContext` + extended `CHAT_SYSTEM`; can propose a past vendor
  as a quoted/estimated cost line through the normal proposal → Apply path).
- CSS: archive dialog modal, past-celebrations panel, date-passed banner.
- Verified: `scripts/unit-archive.ts` (pure-fn, 16 assertions) + `scripts/e2e-archive.mjs`
  (seeded past-dated plan → Archive → lands home → panel → prefill; no console errors).

---

## Step 14 — Clothing/outfits module + hard URL rule + web search (§10, §11)
- `clothing` module renders **per-person sub-cards** (`SubDeliverable`) for the
  `innerCircle`, each with outfit recommendation, size/style notes, cost.
- **Hard rule (spec §10):** the LLM must NEVER invent product SKU URLs (they 404).
  Shoppable links only two ways: (a) **always** deterministic search-query URLs built
  in code from the outfit spec (Myntra/Ajio/Amazon search deep-links — `ShoppableLink`
  kind `'search'`); (b) **optionally** real results from server-side `web_search_20260209`
  (kind `'live'`, two-step: search call → structured call), labelled "live".
- Card UI: per-person sub-cards with the link chips; `subItems` already in the type.

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
