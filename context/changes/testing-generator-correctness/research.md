---
date: 2026-06-16T10:06:15+0200
researcher: Mikołaj Chmielewski
git_commit: cefb11f27e32dec081b308016f161c6f9f4a42f0
branch: develop
repository: ChickenDinner
topic: "Grounding rollout Phase 1 — generator correctness & robustness (test-plan Risks #1, #2)"
tags: [research, codebase, schedule-generator, test-plan, phase-1]
status: complete
last_updated: 2026-06-16
last_updated_by: Mikołaj Chmielewski
---

# Research: Generator correctness & robustness (test-plan Phase 1)

**Date**: 2026-06-16T10:06:15+0200
**Researcher**: Mikołaj Chmielewski
**Git Commit**: cefb11f27e32dec081b308016f161c6f9f4a42f0
**Branch**: develop
**Repository**: ChickenDinner

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` (Risks #1 and #2). Locate the generator entry point and signature, the input/output shape, the degradation order when the diversity rule cannot be fully satisfied, and the exact tie-break/relaxation order between the no-consecutive-meal rule and the category-clustering rule. Verify or correct the test-plan response guidance, inventory what the existing test covers vs. leaves open, and confirm unit is the cheapest useful layer.

## Summary

The generator is a **pure, side-effect-free, never-throwing TypeScript function** — the ideal unit-test target. Both risks are real and unit-testable, but the test-plan response guidance needs **two corrections** before planning:

1. **Risk #1 "returns 7 assigned days" is false for the empty collection.** `generateSchedule([])` returns `[]` by design (`schedule-generator.ts:9`); the 7-day guarantee holds only for `n ≥ 1`. The empty case is guarded *upstream* at the API endpoint, so `[]` never reaches the RPC. A unit test should *pin* `[] → []`, not assert 7 days for it.

2. **Risk #2's soft category objective cannot be asserted as a global optimum.** The algorithm is **greedy + randomized**, not optimal. Asserting "clustering is minimised" against a combinatorial optimum would produce flaky failures on correct-but-greedy output (and asserting a specific count the impl happens to emit would be the oracle problem). The correct, non-tautological oracle is the **relaxation-order guarantee**: meal-uniqueness is hard; category-avoidance is taken whenever a both-different candidate exists for that day.

The single existing test file is solid on the *abundant* cases but has a **load-bearing gap**: it never exercises category diversity under **scarcity** (skewed distributions) — which is exactly where the FR-008 "minimises clustering" differentiator earns its keep — and it asserts invariants from **single random runs**, which can miss violations that only surface on certain `Math.random()` tie-breaks.

Unit is confirmed the cheapest useful layer: the function is pure, takes a plain array, returns a plain array, needs no mocks, no DB, no Worker.

## Detailed Findings

### Generator entry point, signature, and shape

`src/lib/services/schedule-generator.ts:8`

```ts
export function generateSchedule(recipes: RecipeSlot[]): string[]
```

- **Input**: `RecipeSlot[]` where `RecipeSlot = { id: string; category: Category }` (`schedule-generator.ts:3-6`). `Category` is the closed list of six (`src/types.ts:1-2`).
- **Output**: `string[]` of recipe ids. Length is **7** for `n ≥ 1`, **0** for `n = 0` (`schedule-generator.ts:9`, `:11`).
- **Purity**: no I/O, no module state, no `throw`. The only non-determinism is `Math.random()` at `schedule-generator.ts:39`.

### Degradation ladder and tie-break (verified against design)

The three-tier fallback (`schedule-generator.ts:21-32`):

- **Tier 1** (`:22`) — candidates exclude the previous meal **and** the previous category.
- **Tier 2** (`:25-27`) — if Tier 1 is empty, relax category, **keep meal-uniqueness** (exclude previous meal only).
- **Tier 3** (`:30-32`) — if still empty (only when the collection has a single recipe), allow all recipes (the repeat).

Within the chosen tier: **least-recently-used** selection (`:35-36`, lowest `lastUsed` index) with a **random tie-break** (`:39`).

This implementation matches the documented design exactly:
- HARD invariant — no two consecutive days share a meal: `context/archive/2026-06-03-first-generated-schedule/plan.md:72-75`, `.../research.md:42-43`.
- SOFT/best-effort — category-clustering avoidance, layered on top in S-04: `context/archive/2026-06-04-category-aware-diversity/plan.md:34-38`.
- Relaxation order (T1 → T2 → T3): `context/archive/2026-06-04-category-aware-diversity/plan.md:34-38`.
- LRU + random tie-break, **randomized not seeded** (ratified decision): `context/archive/2026-06-03-first-generated-schedule/plan.md:47`, `.../research.md:102,125-130`.
- "Best-effort, never refuses": PRD `prd.md:89`, cited in `.../research.md:112`.

### Best-effort / never-refuses contract (Risk #1) — verified, with one correction

- The function **cannot throw for `n ≥ 1`**: Tier 3 guarantees a non-empty candidate set, so `Math.min(...)` (`:35`) operates on a non-empty array and `chosen` (`:39`) is always defined. **Risk #1's "crashes" mode is not currently reproducible** — Tier 3 already defends it. The unit test's value here is **regression insurance**: lock the contract so a future refactor (the dir churns — `src/lib/services`, 4 commits/30d) cannot reintroduce a crash/refusal.
- "Draws only from the user's collection" — **true**: every pushed id comes from `recipes` (`:40`). (It is *also* re-validated server-side in the RPC, see boundary note — but that belongs to Phase 2, not this unit phase.)
- **Correction**: `generateSchedule([])` returns `[]` (`:9`), not 7 days. Per design this is intentional and guarded upstream — the endpoint redirects with a Polish error when the collection is empty (`src/pages/api/schedules/index.ts:20-24`), so `[]` never reaches persistence. The archive states the contract directly: *"Empty input (`[]`) is a programming error guarded upstream by the endpoint; the function may return `[]` or throw — caller never passes empty"* (`.../first-generated-schedule/plan.md:76`). **Test action**: assert `generateSchedule([]) === []` to pin current behavior; do not assert a 7-day output for the empty case.

### Diversity invariants (Risk #2) — verified, with an oracle caveat

- HARD invariant (no adjacent same meal) is **always satisfiable for `n ≥ 2`** and enforced by Tiers 1–2 — a unit test can assert it unconditionally over every adjacent pair, for every `n ≥ 2`.
- SOFT objective (minimise category clustering): the algorithm is **greedy + random, not optimal**. Two anti-patterns to avoid in the future tests:
  - **Optimum oracle (flaky)**: asserting the output achieves the combinatorial minimum number of same-category adjacencies. Greedy + LRU + random will not always reach the global optimum; this assertion can fail on correct output.
  - **Implementation-mirror oracle (tautological)**: asserting a specific cluster count that the current code happens to emit — the classic oracle problem (`§1` test-plan principle).
  - **Correct oracle**: the **relaxation-order guarantee**. When a candidate exists that differs from the previous day in **both** meal and category (Tier 1 non-empty), the algorithm must pick a category-differing recipe. Behaviorally testable as: *on a collection where category diversity is always achievable (≥ enough distinct categories), zero adjacent same-category pairs must appear* — asserted over **many runs**, not one.

### Existing test coverage inventory

`src/lib/services/schedule-generator.test.ts` (10 cases, post-S-04):

Covered:
- `n = 10`: length 7, all days truthy, no adjacent meal duplicates (`:22-39`).
- `n = 3`: length 7, all filled, no adjacent duplicates, some non-adjacent repeats, all ids ∈ input (`:42-74`).
- `n = 1`: 7 days all equal to the one id (`:77-84`).
- Variety across 30 runs on `n = 10` (`:87-94`).
- Category: `n = 10` across 6 categories → no adjacent same-category (`:99-108`); single-category `n = 5` fallback still valid (`:111-117`); varied category arrangements across 20 runs (`:120-129`).

**Gaps (the actionable ones for this phase):**
1. **Category minimisation under scarcity — untested.** The only multi-category fixture is abundant (10 recipes / 6 categories), where zero adjacency is trivially achievable. There is **no skewed-distribution fixture** (e.g., 5 of one category + 2 others over 7 days) asserting that meal-uniqueness still holds and category clustering stays at the greedy-achievable minimum. This is the FR-008 differentiator and is effectively unverified where it matters.
2. **Single-run invariant assertions vs. `Math.random()`.** Invariant checks (no adjacent dup, no adjacent same-category) run on **one** random output. A violation reachable only on certain tie-breaks would pass intermittently. New invariant tests should loop (e.g., many iterations per fixture) so the assertion holds across the random space.
3. **`n = 0` contract — untested** (see correction above).
4. **Boundary sizes — untested**: `n = 2` (forced strict alternation, the T1/T2 boundary) and `n = 7` exactly (the distinct-vs-repeat boundary).

### Persistence boundary (context only — not this phase's target)

`generateSchedule`'s output is persisted by the `create_schedule` RPC (`supabase/migrations/20260531180052_fix_create_schedule_guards.sql:13-52`). The RPC **does not re-derive or re-order** — it maps the array to `schedule_days` rows via `generate_series(1,7)`. Its guards (auth present; array length exactly 7; every id owned by `auth.uid()`) are **server-side integrity checks that belong to Phase 2 (Risks #3/#4)**, not to this unit phase. Noted here only so the plan does not blur the layer: Phase 1 tests the pure function in isolation; it does not touch the RPC or DB.

Call site: `src/pages/api/schedules/index.ts:18` loads recipes (RLS-scoped), `:20-24` guards empty, `:26` calls `generateSchedule`, `:28` calls the RPC. There is **no ≥5 minimum** at the endpoint despite US-01's "≥5 recipes" Given — a single recipe is accepted (best-effort). This is consistent with the never-refuses contract; not a defect for this phase.

## Code References

- `src/lib/services/schedule-generator.ts:8-45` — `generateSchedule`; entry point, 3-tier ladder, LRU + random tie-break.
- `src/lib/services/schedule-generator.ts:9` — empty-input `→ []` (the Risk #1 correction).
- `src/lib/services/schedule-generator.ts:39` — `Math.random()`, the only non-determinism (no injectable seam).
- `src/lib/services/schedule-generator.test.ts:1-130` — existing 10-case suite; coverage inventory above.
- `src/types.ts:1-2` — `CATEGORIES` closed list of six; `Category` type.
- `src/pages/api/schedules/index.ts:18-28` — call site + upstream empty guard.
- `supabase/migrations/20260531180052_fix_create_schedule_guards.sql:13-52` — `create_schedule` RPC (Phase 2 scope, noted for boundary clarity).

## Architecture Insights

- The generator is a textbook pure function: deterministic except for one `Math.random()` call. This makes unit the unambiguously cheapest layer and makes **multi-run invariant testing** the right technique to neutralize the randomness without adding a seeding seam.
- Constraint priority is encoded structurally by tier order: **meal-uniqueness (hard) > category-diversity (soft) > existence (always fill 7)**. Tests should assert each tier's guarantee at its own strength — hard invariants unconditionally, the soft objective only as the relaxation-order guarantee.
- Greedy ≠ optimal is the single most important caveat for the plan: it rules out both the optimum oracle and the implementation-mirror oracle.

## Historical Context (from prior changes)

- `context/archive/2026-06-03-first-generated-schedule/` — established the hard no-consecutive-meal invariant, LRU + random tie-break, randomized-not-seeded decision, and the "empty is guarded upstream" contract. Deliberately deferred category awareness to S-04 and declared **no automated integration tests** for MVP (`plan.md:224-226`).
- `context/archive/2026-06-04-category-aware-diversity/` — added the category tier (T1/T2), the `makeRecipesMultiCategory` fixture, and the three category assertions now in the suite. Impl-review noted the no-adjacent-same-category assertion holds *because the fixture is abundant* (`reviews/impl-review.md:49`) — corroborating the scarcity gap.

## Related Research

- `context/foundation/test-plan.md` §2 (Risks #1, #2) and §2 Risk Response Guidance — the source this research verifies/corrects.

## Open Questions

- **Backport to test-plan §2**: Risk #1's response cell ("returns 7 assigned days") should read "returns 7 days for n ≥ 1; returns `[]` for n = 0 (guarded upstream)". Risk #2's response should name the relaxation-order guarantee oracle and flag greedy ≠ optimal. These are Source/response-guidance edits only (no file anchors) — to be confirmed at the `/10x-test-plan` backport checkpoint.
- **Minimum-collection policy**: the endpoint accepts a single recipe though US-01 says "≥5". Out of scope for this unit phase; flag for Phase 3 (API contract) if it warrants a product decision.
