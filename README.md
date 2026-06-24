# Celebrate

An **explainable, reactive party-planning engine** — not a checklist app. You describe an event and it produces a *living plan* where **every recommendation carries its reasoning**, **every cost is yours to override**, and **the plan re-flows when inputs change**.

Single-user and local. Vite + React + TypeScript front end; a thin Express + TypeScript server that proxies the Anthropic API so the key stays server-side. INR throughout, India-realistic.

> The recommendation is commodity. The reasoning chain, the reactivity, and the override-ability are the product.

## Run

```sh
npm install
# copy server/.env.example → server/.env and add your ANTHROPIC_API_KEY
npm run dev        # web → http://localhost:5200 · api → http://localhost:5201
```

## Layout

| Path | What |
|---|---|
| `src/types.ts` | the data contract (composite-key deliverable model) |
| `src/store.ts` | Zustand store + debounced localStorage autosave + multi-plan + archive |
| `src/modules.ts` | module registry + dependency graph (Kahn topo-sort cycle guard) |
| `src/features/wizard` | the input wizard |
| `src/features/card` | the universal `<DeliverableCard>` |
| `src/features/plan` | the plan / reasoning board |
| `server/` | Anthropic proxy + module generation (structured outputs) |
| `docs/BUILD-PROMPT.md` | the full spec |
| `docs/REVIEW-PRODUCT-STAFF.md` | a pre-build design review |
| `scripts/shot.mjs` | headless screenshot-verify harness |

## Status

Built incrementally per `docs/BUILD-PROMPT.md` §14. **Steps 1–6 complete:** scaffold + Anthropic round-trip, types/store, input wizard, universal card, module registry + dependency graph, and single-module generation with the reasoning-voice prompt architecture (shared `SYSTEM_SCAFFOLD` + per-module slot, structured outputs).

---
🤖 Built with [Claude Code](https://claude.com/claude-code)
