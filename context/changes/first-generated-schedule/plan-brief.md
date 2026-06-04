# First Generated Schedule (S-03) — Plan Brief

> Full plan: `context/changes/first-generated-schedule/plan.md`
> Research: `context/changes/first-generated-schedule/research.md`

## What & Why

S-03 is the north star: the smallest end-to-end slice that proves the core product hypothesis. A signed-in user with recipes presses "generate" and gets a varied 7-day dinner schedule (no two consecutive days the same meal, every day filled), drawn only from their own collection and persisted for later viewing. Until this lands, the app is generic CRUD.

## Starting Point

F-01 already shipped the `schedules` / `schedule_days` schema, per-user RLS, and the `create_schedule(uuid[])` RPC (exactly-7, ownership-guarded, atomic), plus the `ScheduleWithDays` read type. The app has a recipes list + add-recipe flow using a server-form-POST → redirect idiom (Polish copy, cosmic theme). There is no `/schedules` route, no `src/lib/services/`, and no test runner; zod is installed.

## Desired End State

A "Harmonogramy" nav link leads to `/schedules`, where pressing "Generuj harmonogram" generates and persists a 7-day plan and renders it inline (Dzień 1–7 → meal). Older schedules list below, each opening a `/schedules/[id]` detail page. Re-pressing generate yields a different ordering; schedules survive across sessions.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Algorithm | Greedy LRU, hard-exclude previous meal, random tie-break | Satisfies the no-consecutive rule and is the exact skeleton S-04 extends with a category term | Research |
| Determinism | Randomized (fresh each press) | Matches user expectation for a "generate" button; variety is the product trait | Plan |
| Small-collection fallback | Fill all 7 days, allow non-adjacent repeats | Honors both US-01 ACs (every day filled + no consecutive dupes) and never-refuses | Plan |
| Generate floor | ≥1 recipe (best-effort below 5) | "Never refuses"; US-01's ≥5 is the happy path, not a hard gate | Plan |
| View scope | List page (latest inline) + separate `/schedules/[id]` detail | Satisfies "persisted & visible" + FR-009 without over-building | Plan |
| Entry point | Generate button on `/schedules`; recipes page untouched | Keeps schedule actions on one page; reachable via new Topbar link | Plan |
| Testing | Add Vitest, unit-test the pure function | The algorithm is the slice's core risk and is purely testable on invariants | Plan |
| Output contract | Array of 7 recipe ids → existing RPC | F-01 owns persistence; generator owns selection only | Research |

## Scope

**In scope:** pure `generateSchedule` function + Vitest tests; parameterless `POST /api/schedules` endpoint; `/schedules` list page (latest inline, older as links, generate button, empty/error states); `/schedules/[id]` detail page; "Harmonogramy" Topbar link.

**Out of scope:** category-aware diversity (S-04); recipe edit/delete + `[deleted]` cascade (S-05); schedule deletion (S-06); configurable period; manual editing; calendar dates; any new migration.

## Architecture / Approach

Pure function (`src/lib/services/schedule-generator.ts`, `Math.random()` only — Workers-safe, no Supabase dep) → endpoint reads `recipes(id, category)`, runs the function, calls `create_schedule` RPC, redirects → Astro pages read schedules with a nested PostgREST join (`schedule_days` → `recipes`) and render Dzień 1–7. The function takes `category` (unused in S-03) so S-04 extends it without touching the endpoint.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Algorithm + Vitest | Tested pure generator | Test setup must keep ESLint type-checked mode green |
| 2. Endpoint + persistence | `POST /api/schedules` generates + saves | RPC contract (exactly-7, ownership) must be matched |
| 3. View + entry + nav | `/schedules` list + detail + Topbar link | Nested-join day ordering; Polish copy + theme consistency |

**Prerequisites:** F-01 (schema + RPC) and S-02 (recipes to draw from) — both done.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Adding the first test runner under ESLint `strictTypeChecked` may need a tsconfig/types tweak so `*.test.ts` stays lint-clean (called out in the plan's Critical Implementation Details).
- Randomized output means tests assert invariants, not exact sequences; the variety check runs many iterations and asserts non-identical outputs.
- A null `recipe` in a rendered schedule shows a neutral placeholder; the formal `[deleted]` label is deferred to S-05.

## Success Criteria (Summary)

- User generates a 7-day schedule with no two adjacent days sharing a meal, every day filled, drawn from their own recipes (US-01).
- Small collections (≥1 recipe) still produce a full best-effort schedule; the endpoint never refuses except on an empty collection (Polish error).
- Generated schedules persist and are viewable later, with a history list and per-schedule detail page (FR-009).
