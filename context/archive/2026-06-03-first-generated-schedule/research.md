---
date: 2026-06-04T10:31:12+0200
researcher: Mikołaj Chmielewski
git_commit: 3452f182142358fe4892f9e23df8078c413ef1de
branch: develop
repository: ChickenDinner
topic: "What should the algorithm for schedule generation be? (S-03 first-generated-schedule)"
tags: [research, codebase, schedule-generation, algorithm, diversity, north-star]
status: complete
last_updated: 2026-06-04
last_updated_by: Mikołaj Chmielewski
---

# Research: What should the algorithm for schedule generation be?

**Date**: 2026-06-04T10:31:12+0200
**Researcher**: Mikołaj Chmielewski
**Git Commit**: 3452f182142358fe4892f9e23df8078c413ef1de
**Branch**: develop
**Repository**: ChickenDinner

## Research Question

For change `first-generated-schedule` (S-03, the north star): what should the schedule-generation algorithm be? Scoped — per the research kickoff — to be **forward-compatible with S-04 (category-aware diversity)**, with the deliverable focused on **algorithm options + tradeoffs** and the **edge-case / fallback contract**.

## Summary

The codebase has already fixed everything the algorithm must conform to; the algorithm itself is the only open piece. Concretely:

- **The hard constraint for S-03 is narrow**: produce an ordered 7-day plan where *no two consecutive days share the same meal* and *every day has a meal* (US-01 AC, `prd.md:48-49`). Category diversity is **explicitly deferred to S-04** (`roadmap.md:115`).
- **The output contract is a fixed-length array of exactly 7 recipe UUIDs** (day 0..6), handed to the existing `create_schedule(p_day_recipe_ids uuid[])` RPC (`20260531180052_fix_create_schedule_guards.sql:13-52`). The algorithm does **not** touch the schema, the write path, or persistence — F-01 owns those.
- **Recommended algorithm: greedy least-recently-used selection with a randomized first pick and a local-repair backtrack on dead-ends.** It satisfies the S-03 constraint, runs trivially fast at the expected scale (~10–20 recipes, `prd.md:101`), produces a fresh schedule on each generation, and — critically — **the same greedy "score each candidate, pick the best, exclude the previous pick" skeleton is exactly what S-04 reuses by adding a category term to the score**. That makes S-04 a scoring-function change, not a rewrite.
- **The best-effort / never-refuses clause** (`prd.md:89`) plus US-01 AC#2 ("each of the 7 days has a meal assigned", `prd.md:49`) jointly resolve the open sub-7-recipe Unknown in a specific direction: **fill all 7 days by allowing non-adjacent repetition rather than emitting null/empty days.** The no-consecutive-meal rule only relaxes in the truly degenerate single-recipe case.
- **One genuinely unspecified decision** surfaced that is *not* yet recorded as an Unknown anywhere: **determinism vs. randomness across regenerations.** The implementer should lock it in the S-03 plan. Recommendation below: randomized (fresh schedule each press).

## Detailed Findings

### A. The constraint S-03 must satisfy (and what it must NOT do yet)

The bar is US-01's two acceptance criteria, nothing more:

- `context/foundation/prd.md:48` — "No two consecutive days in the schedule have the same meal assigned"
- `context/foundation/prd.md:49` — "Each of the 7 days has a meal assigned"
- `context/changes/first-generated-schedule/change.md:3` — title: "Generate first 7-day schedule with no consecutive duplicate meals (north star)" — *meals*, not categories.

Category-aware diversity is out of scope for S-03 and owned by S-04:

- `context/foundation/roadmap.md:115` — "Acceptance Criteria for US-01 is the bar; the category-aware refinement is deferred to S-04 so the north star ships before algorithm polish."
- `context/foundation/roadmap.md:122` — maps the PRD Business Logic clause "minimises clustering of the same base-ingredient category" specifically to S-04.

Note the PRD Business Logic block (`prd.md:85`) states the *full* rule (consecutive-meal **and** category-clustering). The roadmap deliberately splits it: S-03 ships the consecutive-meal half; S-04 adds the category half. **The algorithm written for S-03 must read `recipes.category` (it is present on every row) but must not act on it yet.**

### B. The output contract is already fixed by F-01 — the algorithm only produces an array

The algorithm's entire job is to return **an ordered array of 7 recipe IDs** and hand it to the RPC. It owns no persistence.

- Write path RPC — `supabase/migrations/20260531180052_fix_create_schedule_guards.sql:13` — `create_schedule(p_day_recipe_ids uuid[]) returns uuid`, `security invoker` (RLS applies).
- **Exactly 7** enforced — `…guards.sql:26-29` — raises `create_schedule requires exactly 7 recipe ids` if `array_length <> 7`.
- **Ownership guard** — `…guards.sql:31-40` — any non-null id not owned by `auth.uid()` raises; closes the FK-bypasses-RLS gap.
- Atomic insert of parent + 7 days — `…guards.sql:42-48` — `day_index = idx - 1` (0..6).
- Storage shape — `supabase/migrations/20260531164345_create_recipes_schedules_schema.sql:50-55` — `schedule_days(schedule_id, day_index smallint check 0..6, recipe_id uuid references recipes on delete set null, pk(schedule_id, day_index))`.
- Read-back shape for the view — `src/types.ts:34-39` — `ScheduleWithDays { …, days: { day_index, recipe: Recipe | null }[] }`.

**Crucial nuance for the fallback contract:** the RPC *permits null entries* in the array (the ownership check is guarded by `rid is not null` at `…guards.sql:33`, and the insert at line 47 copies nulls straight through; the column is nullable). So the RPC would happily store a day with no meal. **But US-01 AC#2 forbids that** (`prd.md:49`). Therefore the algorithm must never emit a null day for S-03 — it must fill all 7 slots, repeating recipes when the collection is small. Nulls exist in the schema only to serve FR-007's `[deleted]`-recipe cascade later, not as a generation outcome.

### C. Where the code goes and the patterns to mirror

- **Generator location**: `src/lib/services/` does **not exist yet** — create it. Per CLAUDE.md ("the generation algorithm will live there"), put the pure function in `src/lib/services/schedule-generator.ts`. Current `src/lib/` holds only `config-status.ts`, `supabase.ts`, `utils.ts`, `schemas.ts`. No generation code exists anywhere.
- **API route template** (from S-02): `src/pages/api/recipes/index.ts` — `export const prerender = false` (line 5); `export const POST: APIRoute` (line 7); `context.locals.user` guard → redirect (lines 8-11); `createClient(context.request.headers, context.cookies)` with null-check (line 13); `zod safeParse` (lines 24-27); DB call then redirect with `?error=` on failure (lines 33-38). The generate endpoint (`src/pages/api/schedules/…` or similar) should follow this shape and call `supabase.rpc("create_schedule", { p_day_recipe_ids })`.
- **Collection read** (input to the algorithm): `src/pages/recipes.astro:8-17` — `supabase.from("recipes").select(...)`; RLS auto-scopes to the user, so **no `user_id` filter is needed**. For the generator, select `id, category` (category for forward-compat; the algorithm reads it but does not yet use it in S-03).
- **Category source of truth**: Postgres enum `public.category` (`…schema.sql:23-30`), mirrored in `src/types.ts:1-2` (`CATEGORIES`) and consumed by `src/lib/schemas.ts:4-8`. The TS order must match the enum order.

### D. Algorithm options + tradeoffs

The problem is tiny (N ≈ 5–20 recipes, sequence length 7, one adjacency constraint). Any of these runs in microseconds; the differentiator is **fallback behavior** and **how cleanly it extends to S-04's category term**.

| Option | How it works | Satisfies S-03? | Small-collection fallback | Forward-compat to S-04 | Verdict |
| --- | --- | --- | --- | --- | --- |
| **1. Shuffle + retry** | Shuffle the recipes, lay out 7, reshuffle if any adjacent pair collides; cap retries. | Yes when N ≥ ~7 and balanced | Poor — retry can loop forever or fail with few distinct recipes; needs a separate fallback path anyway | Poor — adding a category constraint makes collisions far more likely, retry-rate explodes | Reject |
| **2. Greedy LRU (recommended core)** | Maintain a "cooldown" of recently used recipes. Each day, pick from candidates excluding the immediately previous recipe (cooldown = 1 for S-03); among eligible, prefer the least-recently-used; break ties randomly. | Yes | Good — when only the previous recipe is excluded and ≥ 2 distinct recipes exist, a pick always exists; degrades gracefully | **Excellent** — S-04 just adds "and exclude/penalize previous category" to the same candidate filter + a category term to the tie-break score | **Recommended** |
| **3. Greedy + local-repair backtrack** | Option 2, but if a day has no eligible candidate (degenerate input), backtrack one step and swap, or in the worst case accept the least-bad repeat. | Yes; robust on adversarial inputs | Best — provably always returns 7 filled days | Excellent — same skeleton | Recommended as the hardening layer on Option 2 |
| **4. Full constraint solver / backtracking search** | Treat it as CSP, search for any valid 7-sequence. | Yes, optimally | Good but needs an explicit "best-effort" relaxation ladder | Overkill — but the relaxation ladder concept is useful | Reject for MVP — disproportionate; revisit only if S-04's multi-objective proves greedy-insufficient |
| **5. Weighted scoring, no hard exclusion** | Score every candidate each day by a weighted sum (recency penalty, [later] category penalty), pick the max. | Only if the consecutive-meal term is a hard veto, not a soft weight | Good | **Excellent** — S-04 = add one weighted term | Strong alternative — equivalent to Option 2 if same-as-previous is a hard veto |

**Recommendation: Option 2 (greedy LRU with hard exclusion of the previous meal) as the core, hardened with Option 3's local-repair for degenerate inputs.** Rationale:

1. It meets the S-03 bar directly and is trivial to reason about and test.
2. Its structure is *the* forward-compatible choice: S-04 (category diversity) becomes "extend the candidate filter and the tie-break score with a category term" — the selection loop, the cooldown machinery, and the output contract are unchanged. This is exactly what the roadmap anticipates: "S-04 changes only the selection logic, not the schema" (`roadmap.md:122-128`).
3. Randomized tie-breaking gives generation-to-generation variety for free (see §F).

Sketch (pure function, no I/O — lives in `src/lib/services/schedule-generator.ts`):

```
generate(recipes: {id, category}[]): (string)[]  // length 7, never null for S-03
  if recipes is empty -> caller rejects upstream (US-01 Given: ≥5; but guard anyway)
  result = []
  prev = null
  for day in 0..6:
    eligible = recipes where r.id != prev            // hard: no consecutive meal
    if eligible is empty:                            // only when N == 1
        eligible = recipes                           // best-effort: relax, repeat
    pick = argmin over eligible of (lastUsedDayIndex) // LRU; default -∞ if unused
           with random tie-break
    result.push(pick.id); markUsed(pick, day); prev = pick.id
  return result
```

For S-04 the only change is: `eligible = recipes where r.id != prev AND r.category != prevCategory` (with a best-effort relaxation ladder if that empties), and/or fold a category-recency penalty into the LRU score.

### E. Edge-case / fallback contract

The governing clause: **"the algorithm produces the most varied schedule possible on a best-effort basis and never refuses to generate"** (`prd.md:89`, `shape-notes.md:93`). Combined with US-01 AC#2 (every day filled, `prd.md:49`), the precise behavior the algorithm should adopt:

| Collection state | Behavior | Why |
| --- | --- | --- |
| **N ≥ 7, varied** | Strict: 7 distinct meals, no consecutive repeat. (Distinctness across all 7 is *not required* by AC — only no-consecutive — but it falls out naturally with N ≥ 7.) | US-01 happy path. |
| **2 ≤ N < 7** | Fill all 7 days; **allow non-adjacent repetition**; keep the no-consecutive-meal rule (always satisfiable with ≥ 2 distinct recipes). | Resolves the open Unknown (`roadmap.md:113-114`): fill-with-repeats beats null days because AC#2 demands every day have a meal. Non-adjacent repeats are the "most varied possible." |
| **N = 1** | All 7 days = that recipe (consecutive repeats unavoidable). Never refuse. | Best-effort/never-refuses (`prd.md:89`). The no-consecutive rule is the one that relaxes here, not "every day filled." |
| **N = 0** | Should not reach the generator — US-01 Given is ≥ 5 recipes, and the UI should gate "generate" behind a non-empty collection. Guard defensively (return error upstream) rather than emit a null array (the RPC requires exactly 7 ids). | The RPC would reject a short/empty array anyway (`…guards.sql:26`). |

**Resolution of the documented open Unknown** (`roadmap.md:113-114`, "is repetition allowed on non-adjacent days, or does the algorithm relax the no-consecutive-meal rule too?"): the answer that best honors *both* stated constraints is **allow non-adjacent repetition, and only relax no-consecutive when N = 1.** This is a recommendation for the `/10x-plan` author to ratify, not a settled decision — but the evidence points one way because AC#2 (every day filled) is a hard acceptance criterion while whole-week distinctness is not.

### F. Unspecified decision the plan must make: determinism vs. randomness

The corpus contains **no statement** about whether regenerating should yield a different schedule — confirmed across PRD, shape-notes, roadmap, MVP, and the F-01 plan. This is a real gap and is *not* yet recorded as an Unknown anywhere.

- The product framing is about variety *within one schedule across days*, not across generations (`ChickenDinner-MVP.md:10`).
- FR-009/FR-010 imply schedules *accumulate* as history (`prd.md:74,76`) — consistent with, but not requiring, generation-to-generation variation.

**Recommendation: randomized (fresh schedule on each "generate" press).** It matches user expectation for a "generate" button, requires no seeding infrastructure, and falls out of Option 2's random tie-break at zero cost. The S-03 plan should record this explicitly so it isn't re-litigated in S-04.

## Code References

- `supabase/migrations/20260531164345_create_recipes_schedules_schema.sql:23-30` — `category` enum (6 values, canonical).
- `supabase/migrations/20260531164345_create_recipes_schedules_schema.sql:50-55` — `schedule_days` table (the output shape: 7 rows, day_index 0..6, nullable recipe_id).
- `supabase/migrations/20260531180052_fix_create_schedule_guards.sql:13-52` — `create_schedule(uuid[])` RPC: exactly-7 guard, ownership guard, atomic insert. **The algorithm's sole write path.**
- `src/types.ts:1-2,13-20,34-39` — `CATEGORIES`, `Recipe`, `ScheduleWithDays` (the read-back view shape).
- `src/lib/schemas.ts:4-8` — zod enum pattern (template for a generate-request schema, if any input is needed).
- `src/pages/api/recipes/index.ts:5-38` — API route template (POST, user guard, null-checked client, zod, redirect).
- `src/pages/recipes.astro:8-17` — RLS-scoped collection read pattern (algorithm input).
- `src/lib/` (no `services/` subdir) — where `schedule-generator.ts` should be created.

## Architecture Insights

- **Separation already enforced by F-01**: persistence, ordering, and ownership validation live in the RPC. The S-03 algorithm is a *pure function* `recipes[] -> uuid[7]` with no Supabase dependency — which makes it trivially unit-testable and keeps the Cloudflare/Web-API runtime constraint (CLAUDE.md) irrelevant to the core logic.
- **The schema is category-agnostic by design** (`schedule_days` stores only `recipe_id`), so S-04 is a pure selection-logic change. The algorithm choice for S-03 is therefore the single biggest lever on S-04's cost — favor a structure (greedy scoring) that S-04 *extends* rather than *replaces*.
- **Nullable `recipe_id` is for cascade, not generation**: the schema/RPC allow null days, but US-01 AC#2 means generation must never use that path. Keeping these two facts straight prevents a "best-effort = leave days empty" misread.

## Historical Context (from prior changes)

- `context/archive/2026-05-31-recipes-and-schedules-schema/plan.md` — F-01: locked the schedule storage shape, the `create_schedule` RPC (exactly-7), and the category enum. The S-03 algorithm conforms to this; it does not redesign it.
- `context/archive/2026-06-02-add-recipe-to-collection/` (S-02) — established the API-route + zod + redirect pattern the generate endpoint should mirror (`src/pages/api/recipes/index.ts`).
- `context/changes/category-aware-diversity/` (S-04) — folder exists but is **empty (no change.md)**; its boundary lives only in `roadmap.md:118-129`. The hard-vs-soft-vs-multi-objective shape of category diversity is itself an open S-04 Unknown (`roadmap.md:127`), which is another reason to keep S-03's algorithm a clean, extensible scoring loop.

## Related Research

- None prior. This is the first `research.md` under `context/changes/first-generated-schedule/`.

## Open Questions

1. **Determinism vs. randomness across regenerations** — unspecified in the corpus (§F). Recommend randomized; the `/10x-plan` author should ratify and record.
2. **Sub-7 fallback shape** — documented Unknown (`roadmap.md:113-114`); §E recommends "fill all 7, allow non-adjacent repeats, relax no-consecutive only at N=1." Needs ratification in the plan.
3. **Does the generate flow take any user input?** US-01 is a single "generate" press with a fixed 7-day period (`prd.md:72-73`, `shape-notes.md:33-34`), so likely no request body — but the plan should confirm whether a zod request schema is needed at all or the endpoint is parameterless.
