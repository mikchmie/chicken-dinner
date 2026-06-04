# First Generated Schedule (S-03) Implementation Plan

## Overview

Ship the north star slice: a signed-in user with at least one recipe presses "generate" and receives an ordered 7-day dinner schedule drawn from their collection, where no two consecutive days share the same meal and every day is filled. The schedule is persisted and viewable on return, including a history of previously generated schedules (FR-009).

The only genuinely new logic is the generation algorithm — a pure function. The schema, the write path (`create_schedule` RPC), RLS, and the read-back type already exist from F-01. This plan adds the algorithm (+ a test runner), one endpoint, two view pages, and a nav link.

## Current State Analysis

- **Schema + write path exist (F-01).** `schedules`, `schedule_days(schedule_id, day_index 0..6, recipe_id)`, and the `create_schedule(p_day_recipe_ids uuid[])` RPC are in place. The RPC enforces exactly-7, validates recipe ownership, and inserts parent + 7 days atomically under RLS (`supabase/migrations/20260531180052_fix_create_schedule_guards.sql:13-52`).
- **Read-back type exists.** `ScheduleWithDays { id, user_id, created_at, days: { day_index, recipe: Recipe | null }[] }` (`src/types.ts:34-39`). `Recipe`, `Category`, `CATEGORIES`, `CATEGORY_LABELS_PL` also live there.
- **App idiom is server-side form-POST → redirect.** The add-recipe endpoint is the template: `prerender = false`, `POST: APIRoute`, `context.locals.user` guard, null-checked `createClient`, then DB call and `context.redirect` (success or `?error=`) (`src/pages/api/recipes/index.ts:5-39`).
- **Pages are Astro with a cosmic theme + Polish copy.** `src/pages/recipes.astro` shows the list pattern (RLS auto-scopes queries; no `user_id` filter needed — `recipes.astro:8-17`). Nav lives in `src/components/Topbar.astro` (currently a single "Przepisy" link).
- **No `/schedules` route, no `src/lib/services/`, no schedule-generation code exist yet.**
- **`zod ^4.4.3` is installed; there is no test runner** (`package.json` scripts: dev/build/preview/astro/lint/lint:fix/format only).

## Desired End State

A signed-in user can navigate to **Harmonogramy** (new Topbar link), press **Generuj harmonogram**, and immediately see a freshly generated 7-day schedule rendered inline at the top of `/schedules`, with each day (Dzień 1–7) showing its assigned meal. No two adjacent days repeat a meal (whenever the collection has ≥2 distinct recipes), and all 7 days are filled. Previously generated schedules appear below as a list, each linking to a `/schedules/[id]` detail page. The schedule persists across sessions.

Verify by: generating with a varied collection (7 distinct meals, no adjacent repeats), generating with a 3-recipe collection (all 7 days filled, repeats only non-adjacent), pressing generate twice (different orderings), revisiting `/schedules` after re-login (schedule still there), and opening an older schedule's detail page.

### Key Discoveries:

- The generator's sole output contract is **an ordered array of exactly 7 recipe UUIDs**, handed to `supabase.rpc("create_schedule", { p_day_recipe_ids })` (`...guards.sql:13-29`). It owns no persistence.
- The RPC *permits* nulls in the array, but **US-01 AC#2 forbids empty days** (`prd.md:49`) — so the generator must always emit 7 non-null ids, repeating recipes when the collection is small (`research.md` §B, §E).
- The generator reads `recipes.category` even though S-03 does not act on it — selecting `id, category` keeps the function signature forward-compatible with S-04 (category diversity) without an endpoint change (`research.md` §C, `roadmap.md:122`).
- RLS auto-scopes every query to `auth.uid()`; no manual `user_id` filter is needed on reads (`recipes.astro:13`).

## What We're NOT Doing

- **No category-aware diversity** — consecutive-category avoidance is S-04. The generator reads category for forward-compat but does not use it.
- **No recipe edit/delete or the `[deleted]` cascade label** — that is S-05. (The view renders a defensive placeholder for a null recipe, but the formal `[deleted]` behavior is out of scope.)
- **No schedule deletion** — that is S-06. `/schedules` is read-only here.
- **No configurable period** — always 7 days (PRD non-goal). The endpoint takes no parameters; no request-body zod schema is added.
- **No manual schedule editing**, no calendar dates (days are positional: Dzień 1–7).
- **No new migration** — F-01's schema and RPC are used as-is.

## Implementation Approach

Three phases, each independently verifiable. Phase 1 builds and tests the pure algorithm in isolation (no Supabase dependency, so it is trivially unit-testable and Workers-safe — it uses only `Math.random()`). Phase 2 wires the endpoint that reads the collection, runs the algorithm, and persists via the existing RPC. Phase 3 builds the read UI and the entry point. The algorithm is structured as a greedy least-recently-used selection with hard exclusion of the previous meal and a random tie-break — the same skeleton S-04 will extend with a category term.

## Critical Implementation Details

- **ESLint type-checked mode + new test files.** ESLint runs with `projectService: true` / `strictTypeChecked` (CLAUDE.md tripwire). Vitest test files and `vitest.config.ts` must be reachable by the TS project service or the lint step fails. Ensure `*.test.ts` files are covered by `tsconfig.json` `include` (or add Vitest globals types via `vitest/globals` in `tsconfig` `types`), and confirm `npx astro sync && npm run lint` stays green after adding the test setup.
- **Randomized, not seeded.** Each generation must differ (decision: randomized). Tests therefore assert *invariants* (every day filled; no adjacent duplicates when ≥2 distinct recipes), not exact output — plus a variety check that runs generation many times over a large collection and asserts the outputs are not all identical.
- **Nested PostgREST read ordering.** The schedule read joins `schedule_days` and `recipes`; `day_index` order is not guaranteed by the join, so sort `days` by `day_index` ascending in the page before rendering Dzień 1–7.

## Phase 1: Generation algorithm + Vitest

### Overview

Introduce a test runner and implement the pure generation function with full invariant coverage. This is the slice's core risk and the piece S-04 will extend, so it is built and proven before any wiring.

### Changes Required:

#### 1. Test runner setup

**File**: `package.json`, `vitest.config.ts` (new), `tsconfig.json`

**Intent**: Add Vitest as the project's first test runner so the pure algorithm can be unit-tested; establish the test pattern reused by S-04/S-05.

**Contract**: Add `vitest` (and, if needed, `@vitest/coverage` is *not* required) to `devDependencies`; add a `"test": "vitest run"` script (and optionally `"test:watch": "vitest"`). Add a minimal `vitest.config.ts`. Ensure `*.test.ts` is type-checked by the project (tsconfig `include`/`types`) so `npm run lint` stays green. No Astro-runtime imports in the test path — the function under test is pure TS.

#### 2. The generator

**File**: `src/lib/services/schedule-generator.ts` (new; creates `src/lib/services/`)

**Intent**: Produce an ordered array of exactly 7 recipe ids from the user's collection, satisfying the S-03 rules and the best-effort fallback. Pure function, no I/O.

**Contract**: `export function generateSchedule(recipes: Pick<Recipe, "id" | "category">[]): string[]` returning length-7 array of recipe ids (never null/empty for any non-empty input). Rules:
- Each day picks from candidates **excluding the immediately previous day's recipe id** (hard no-consecutive-meal).
- Among eligible candidates, prefer the **least-recently-used** (lowest last-used day index; unused = never picked); break ties **randomly**; the first day's pick is random.
- **Fallback:** when eligibility empties (only possible when the collection has exactly 1 recipe), relax and repeat — fill all 7 days. With ≥2 distinct recipes the no-consecutive rule always holds and repeats land only on non-adjacent days.
- Empty input (`[]`) is a programming error guarded upstream by the endpoint; the function may return `[]` or throw — caller never passes empty.

The `category` field is accepted in the signature but unused in S-03 (forward-compat for S-04). No snippet — the rules above are the contract.

#### 3. Generator unit tests

**File**: `src/lib/services/schedule-generator.test.ts` (new)

**Intent**: Lock the invariants so S-04's changes can't silently regress S-03 behavior.

**Contract**: Cover — (a) ≥7 distinct recipes: result length 7, all days filled, no adjacent duplicates; (b) 3-recipe collection: length 7, all filled, no adjacent duplicates, some non-adjacent repeats present; (c) 1-recipe collection: length 7, all equal to that id (the only case adjacent repeats are allowed); (d) variety: many runs over a large collection are not all identical.

### Success Criteria:

#### Automated Verification:

- Test runner installed and wired: `npm run test` runs and passes
- Generator invariant tests pass: `npm run test`
- Type checking passes: `npx astro sync && npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Skim the test cases — the four invariant groups are present and assert behavior (not implementation)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: Generate endpoint + persistence

### Overview

Add the parameterless POST endpoint that reads the collection, runs the generator, and persists the result through the existing RPC — following the add-recipe endpoint pattern exactly.

### Changes Required:

#### 1. Generate-schedule endpoint

**File**: `src/pages/api/schedules/index.ts` (new)

**Intent**: On POST, generate and persist a schedule for the current user, then redirect to the schedules view (or back with an error message).

**Contract**: `export const prerender = false;` + `export const POST: APIRoute`. Mirror `src/pages/api/recipes/index.ts`:
- `context.locals.user` guard → redirect `/auth/signin`.
- `createClient(...)` null-check → redirect `/schedules?error=...` (Polish: Supabase not configured).
- Read recipes: `supabase.from("recipes").select("id, category")` (RLS-scoped).
- **Empty-collection guard:** if zero recipes, redirect `/schedules?error=...` (Polish: "Dodaj przynajmniej jeden przepis, aby wygenerować harmonogram").
- Call `generateSchedule(recipes)` → 7 ids; call `supabase.rpc("create_schedule", { p_day_recipe_ids: ids })`.
- On RPC error: `console.error(...)` + redirect `/schedules?error=...` (Polish: generation failed). On success: redirect `/schedules`.

No request body, no zod schema (period is fixed at 7).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro sync && npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- POSTing to `/api/schedules` (via the Phase 3 button, or curl with a session) creates a schedule row + 7 `schedule_days` rows (verify in Supabase Studio)
- With an empty collection, the endpoint redirects with the Polish error and creates nothing
- A generated schedule belongs to the current user only (RLS holds)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 3: Schedule view + entry point + nav

### Overview

Build the read UI: a `/schedules` list page (latest schedule inline, older as links, generate button, empty/error states) and a `/schedules/[id]` detail page, plus a Topbar nav link.

### Changes Required:

#### 1. Schedules list page

**File**: `src/pages/schedules/index.astro` (new)

**Intent**: Show the generate button, the latest schedule's 7 days inline, and a list of older schedules linking to their detail pages; handle empty and error states in Polish.

**Contract**: Mirror `recipes.astro` layout (Layout + Topbar + cosmic theme).
- Read: `supabase.from("schedules").select("id, created_at, days:schedule_days(day_index, recipe:recipes(id, name, category))").order("created_at", { ascending: false })` — shape matches `ScheduleWithDays[]` (alias `days`). Sort each schedule's `days` by `day_index` ascending in the page.
- **Generate button:** `<form method="POST" action="/api/schedules">` with a Polish submit button ("Generuj harmonogram"), styled like the "Dodaj przepis" button.
- Render `Astro.url.searchParams.get("error")` as a Polish error banner when present.
- **Latest schedule inline:** render the first (newest) schedule's 7 days as Dzień 1–7 → meal name (use `CATEGORY_LABELS_PL[recipe.category]` for the category tag, mirroring the recipe list). Null `recipe` → a neutral placeholder ("—"); the formal `[deleted]` label is S-05.
- **Older schedules:** list remaining schedules as rows linking to `/schedules/{id}`, labeled by `created_at` (formatted, Polish locale).
- **Empty state:** if no schedules, show a Polish prompt to generate the first one. If the user also has zero recipes, the generate button still submits and the endpoint returns the empty-collection error (no duplicate guard needed on the page).

#### 2. Schedule detail page

**File**: `src/pages/schedules/[id].astro` (new)

**Intent**: Show a single schedule's 7 days.

**Contract**: Read one schedule by `id` with the same nested select + `.eq("id", Astro.params.id).single()`; RLS scopes to the owner so a foreign/unknown id yields no row → redirect to `/schedules` (or render a Polish "not found"). Render Dzień 1–7 like the inline block. Same layout/theme.

#### 3. Topbar navigation link

**File**: `src/components/Topbar.astro`

**Intent**: Make `/schedules` reachable from anywhere when signed in.

**Contract**: Add a "Harmonogramy" link to `/schedules` in the authenticated nav group, styled like the existing "Przepisy" link.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro sync && npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- "Harmonogramy" appears in the Topbar when signed in and routes to `/schedules`
- With ≥7 varied recipes, "Generuj harmonogram" produces a 7-day plan with no two adjacent days sharing a meal; all 7 days filled
- With 3 recipes, all 7 days are filled and repeats are non-adjacent
- Pressing generate twice yields different orderings (randomized)
- The latest schedule renders inline; older schedules appear as links and open the correct detail page
- After re-login, a previously generated schedule is still visible (persisted)
- All copy is Polish; theme matches the recipes page
- The empty-collection case shows the Polish error and creates nothing

**Implementation Note**: After completing this phase and all automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit Tests:

- `generateSchedule` invariants: length 7; every day filled; no adjacent duplicates when ≥2 distinct recipes; N=1 all-same; randomized variety across runs (Phase 1).

### Integration Tests:

- None automated for MVP (no endpoint/integration harness exists). The endpoint + RPC path is covered by manual verification against local Supabase.

### Manual Testing Steps:

1. Sign in; add ≥7 recipes across a few categories.
2. Go to Harmonogramy → Generuj harmonogram. Confirm 7 distinct-enough days, no adjacent repeats, all filled.
3. Press generate again — confirm a different ordering.
4. Delete recipes down to 3; generate — confirm all 7 days filled, repeats non-adjacent.
5. Open an older schedule from the list — confirm the detail page shows its 7 days.
6. Sign out / sign in — confirm schedules persist.
7. (Edge) New account with zero recipes → generate → confirm Polish error, nothing created.

## Performance Considerations

Negligible. The collection is ~10–20 recipes; the algorithm is O(7 × N) and runs in microseconds. The list query is bounded by the per-user schedule count and uses the existing `schedules(user_id, created_at desc)` index.

## Migration Notes

No migration. F-01's schema and `create_schedule` RPC are used unchanged.

## References

- Related research: `context/changes/first-generated-schedule/research.md`
- Write path: `supabase/migrations/20260531180052_fix_create_schedule_guards.sql:13-52`
- Schema: `supabase/migrations/20260531164345_create_recipes_schedules_schema.sql:50-55`
- Types: `src/types.ts:34-39`
- API template: `src/pages/api/recipes/index.ts:5-39`
- List/page pattern: `src/pages/recipes.astro:8-17`
- Nav: `src/components/Topbar.astro:13-15`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Generation algorithm + Vitest

#### Automated

- [ ] 1.1 Test runner installed and wired: `npm run test` runs and passes
- [ ] 1.2 Generator invariant tests pass: `npm run test`
- [ ] 1.3 Type checking passes: `npx astro sync && npx astro check`
- [ ] 1.4 Linting passes: `npm run lint`
- [ ] 1.5 Production build succeeds: `npm run build`

#### Manual

- [ ] 1.6 Skim the test cases — the four invariant groups are present and assert behavior

### Phase 2: Generate endpoint + persistence

#### Automated

- [ ] 2.1 Type checking passes: `npx astro sync && npx astro check`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.4 POST creates a schedule row + 7 schedule_days rows (verify in Studio)
- [ ] 2.5 Empty collection redirects with the Polish error and creates nothing
- [ ] 2.6 Generated schedule is visible only to its owner (RLS holds)

### Phase 3: Schedule view + entry point + nav

#### Automated

- [ ] 3.1 Type checking passes: `npx astro sync && npx astro check`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 3.4 "Harmonogramy" link appears when signed in and routes to /schedules
- [ ] 3.5 ≥7 varied recipes → 7-day plan, no adjacent duplicate meals, all filled
- [ ] 3.6 3 recipes → all 7 days filled, repeats non-adjacent
- [ ] 3.7 Pressing generate twice yields different orderings
- [ ] 3.8 Latest schedule renders inline; older schedules link to correct detail page
- [ ] 3.9 Schedules persist across re-login
- [ ] 3.10 All copy is Polish; theme matches the recipes page
- [ ] 3.11 Empty-collection case shows the Polish error and creates nothing
