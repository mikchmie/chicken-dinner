# Generator Correctness & Robustness — Implementation Plan

## Overview

Add unit tests to `src/lib/services/schedule-generator.test.ts` covering rollout Phase 1 of
`context/foundation/test-plan.md` (Risks #1 and #2). All tests are in Vitest, no mocks, no DB.
The generator is a pure function; unit is the cheapest useful layer.

## Current State Analysis

`generateSchedule(recipes: RecipeSlot[]): string[]` — `src/lib/services/schedule-generator.ts:8`

- Returns `[]` for empty input (`:9`); returns exactly 7 ids for `n ≥ 1`.
- 3-tier fallback: T1 (different meal + different category) → T2 (different meal, category relaxed)
  → T3 (single-recipe repeat). LRU + random tie-break (`:39`, no injectable seam).
- Existing suite (`schedule-generator.test.ts`, 10 cases): covers abundant fixtures (`n = 10`)
  and single-run invariants.

Confirmed gaps (research.md §Gaps):
- `n = 0` contract — untested.
- `n = 2` and `n = 7` boundary sizes — untested.
- Multi-run invariant assertions — all existing invariant checks run on one random output.
- Category scarcity fixture (skewed distribution: majority-category + minority) — untested;
  this is the FR-008 differentiator.

## Desired End State

After this plan, `npm test` passes with:
1. A `"best-effort contract — boundary sizes"` describe block covering `n = 0`, `n = 2`, and
   `n = 7` boundaries, each length and set-containment assertion looped across 100 runs.
2. A `"hard invariant — no adjacent same meal, multi-run"` describe block looping 100 runs on
   `n = 2` and `n = 7`.
3. The existing `"has no adjacent same-category days"` test (single-run) supplemented by a
   50-run version; a new `"category-aware diversity — scarcity"` describe block exercising a
   skewed 5-chicken + 2-pasta fixture across 100 runs.
4. `context/foundation/test-plan.md §6.1` filled in with the best-effort + diversity-invariant
   pattern this phase ships.

### Key Discoveries

- T1 is empty iff all recipes share the same category as the previous meal — so for any
  multi-category collection, T1 is _always_ non-empty, making zero adjacent same-category
  pairs a provable invariant (not merely probabilistic). Multi-run tests neutralise the random
  tie-break without needing a seeding seam.
- `Math.random()` at `:39` has no injectable seam — multi-run looping (≥ 50 iterations per
  fixture) is the only way to beat randomness in assertions.
- The scarcity fixture (5 chicken + 2 pasta) is the untested FR-008 scenario: T1 is non-empty
  but constrained to ≤ 2 minority-category candidates, exercising LRU cycling under pressure.

## What We're NOT Doing

- Touching `create_schedule` RPC or any DB/Supabase code — that is Phase 2.
- Seeding or patching `Math.random()` — the randomized tie-break is a ratified decision;
  multi-run coverage is the correct technique.
- Asserting a combinatorial minimum of same-category adjacencies — the algorithm is greedy +
  randomized, not optimal; that oracle would be flaky on correct output.
- Adding integration tests or e2e — unit is confirmed the cheapest useful layer (research.md
  §Architecture Insights).
- Updating CI configuration — required after Phase 1 lands (test-plan.md §5); not in scope here.

## Implementation Approach

Four sub-phases in cost × signal order, risk priority #1 before #2 (HARD before SOFT):

1. **Contract baseline & boundaries** — cheapest assertions (deterministic or near-so),
   closes the Risk #1 gaps.
2. **Hard invariant, multi-run** — loop 100 iterations; closes the single-run gap for the
   unconditional no-adjacent-same-meal guarantee.
3. **Relaxation-order & scarcity** — 100-run loop on the skewed fixture; closes the
   FR-008 scarcity gap and upgrades the existing single-run category test.
4. **§6.1 Cookbook update** — stamp the test-plan.md cookbook entry once phases 1–3 pass.

All test additions go in `src/lib/services/schedule-generator.test.ts`. Each new describe
block is appended after the existing ones; do not rewrite or reorder existing cases.

---

## Phase 1: Contract Baseline & Boundary Sizes

### Overview

Close the Risk #1 gaps: `n = 0`, `n = 2`, and `n = 7` are all untested. Prove the
best-effort contract (never throws, always draws from the collection, correct length) at
every boundary. Multi-run on `n = 2` and `n = 7` to cover random tie-breaks.

### Changes Required

#### 1. New describe block in the test file

**File**: `src/lib/services/schedule-generator.test.ts`

**Intent**: Append a `describe("best-effort contract — boundary sizes")` block that pins
the `n = 0` contract and asserts length-7 + set-containment for `n = 2` and `n = 7` across
100 runs each.

**Contract**:

- `n = 0`: `generateSchedule([])` returns `[]`. Oracle: research.md §Correction +
  `schedule-generator.ts:9`. Anti-pattern avoided: asserting 7 days for empty.
- `n = 2`, 100 runs: result length is 7 and every id is in the input set. Oracle: US-01
  best-effort ("never refuses for n ≥ 1"). Regression caught: crash / length violation at the
  smallest multi-recipe input.
- `n = 7`, 100 runs: result length is 7 and every id is in the input set. Oracle: same.
  Regression caught: distinct-vs-repeat boundary breaks the 7-day guarantee.

Use the existing `makeRecipes(n)` helper for fixtures. The 100-run loop is `for (let i = 0; i < 100; i++)` wrapping the call + assertions inside the same `it`.

### Success Criteria

#### Automated Verification

- `npm test` exits 0 with all new cases passing and no existing cases regressing.
- TypeScript compilation passes (`npx tsc --noEmit`).

#### Manual Verification

- Inspect test output: the new describe block and its 3 cases are visible in the reporter.

**Implementation Note**: After the automated check passes, pause for manual confirmation
before proceeding to Phase 2.

---

## Phase 2: Hard Invariant — No Adjacent Same Meal, Multi-Run

### Overview

Close the single-run gap for the no-adjacent-same-meal invariant (Risk #2 HARD). Current
tests check this property from a single call; a violation reachable on certain `Math.random()`
tie-breaks would intermittently pass. Loop 100 runs on `n = 2` (forced strict alternation —
the T1/T2 boundary) and `n = 7` (distinct-vs-repeat boundary).

### Changes Required

#### 1. New describe block in the test file

**File**: `src/lib/services/schedule-generator.test.ts`

**Intent**: Append a `describe("hard invariant — no adjacent same meal, multi-run")` block
with two `it` cases — one for `n = 2` and one for `n = 7` — each looping 100 runs.

**Contract**:

- `n = 2`, 100 runs: for every `i > 0`, `result[i] !== result[i - 1]`. Oracle: US-01 AC
  (hard no-consecutive-meal invariant); `n = 2` forces strict alternation under T1/T2.
  Regression caught: tie-break path that accidentally repeats a meal (T2/T3 mis-selection).
  Anti-pattern avoided: single-run assertion that misses violation reachable on rare tie-breaks.
- `n = 7`, 100 runs: same adjacency check. Oracle: same. Regression caught: LRU edge case at
  the 7-recipe distinct-vs-repeat boundary where all recipes are used exactly once (or close
  to it).

Use `makeRecipes(n)` for fixtures. Do not modify or remove existing single-run adjacency
tests — they document the original contract; add new multi-run cases alongside.

### Success Criteria

#### Automated Verification

- `npm test` exits 0 with all new and existing cases passing.
- `npx tsc --noEmit` passes.

#### Manual Verification

- Inspect output: 2 new cases appear in the `"hard invariant — no adjacent same meal, multi-run"` describe block.

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Relaxation-Order Guarantee & Category Scarcity

### Overview

Close the FR-008 scarcity gap (Risk #2 SOFT). Two actions:

1. Add a `"category-aware diversity — scarcity"` describe block with a skewed fixture
   (5 chicken + 2 pasta = 7 recipes), asserting both the hard no-adjacent-meal invariant and
   the soft no-adjacent-same-category invariant across 100 runs.
2. Upgrade the existing single-run `"has no adjacent same-category days"` test to also have a
   50-run companion `it` in the existing `"category-aware diversity"` describe block.

The scarcity fixture is the untested FR-008 scenario: T1 is constrained to ≤ 2
minority-category candidates at any moment, exercising LRU cycling under category pressure.
Since the fixture is multi-category, T1 is provably always non-empty → zero adjacent
same-category pairs is the correct, non-tautological oracle.

### Changes Required

#### 1. 50-run companion test in the existing category-aware describe block

**File**: `src/lib/services/schedule-generator.test.ts`

**Intent**: After the existing `"has no adjacent same-category days for a diverse collection"`
`it` (single-run, line 99), add a new `it` named
`"has no adjacent same-category days across 50 runs (diverse collection)"` that loops 50
iterations of `generateSchedule(makeRecipesMultiCategory(10))` and asserts the
no-adjacent-same-category invariant each time.

**Contract**: Oracle is FR-008 (category-clustering minimisation) + the relaxation-order
guarantee: for a multi-category collection T1 is always non-empty → the algorithm always
picks a category-differing recipe → zero same-category adjacencies. Anti-pattern avoided:
relying on one random draw to prove a property the tie-break can expose.

#### 2. New skewed fixture and describe block

**File**: `src/lib/services/schedule-generator.test.ts`

**Intent**: Add a `makeRecipesSkewed()` helper and a
`describe("category-aware diversity — scarcity")` block with three `it` cases covering the
5-chicken + 2-pasta fixture across 100 runs each.

**Contract**:

`makeRecipesSkewed()` returns:
```ts
[
  { id: "c0", category: "chicken" as Category },
  { id: "c1", category: "chicken" as Category },
  { id: "c2", category: "chicken" as Category },
  { id: "c3", category: "chicken" as Category },
  { id: "c4", category: "chicken" as Category },
  { id: "p0", category: "pork" as Category },
  { id: "p1", category: "pork" as Category },
]
```
(Any two distinct minority-category names from `CATEGORIES` work; "pork" avoids coupling to
a future "pasta" category label.)

Three `it` cases in the new block, each looping 100 runs:

- `"has no adjacent same meal across 100 runs (skewed collection)"` — HARD invariant on the
  skewed fixture. Oracle: US-01 AC. Regression caught: meal-repeat bug exposed only when the
  minority category is exhausted and LRU cycling is forced.
- `"has no adjacent same-category days across 100 runs (skewed collection)"` — SOFT invariant.
  Oracle: FR-008 relaxation-order guarantee (T1 always non-empty for multi-category). Regression
  caught: algorithm incorrectly falling to T2 when T1 candidates exist. Anti-pattern avoided:
  asserting a combinatorial minimum or asserting the implementation's own cluster count.
- `"draws only from the input collection across 100 runs (skewed collection)"` — set containment.
  Oracle: PRD §Business Logic "draws only from the user's collection". Regression caught:
  fabricated-id bug on skewed inputs.

### Success Criteria

#### Automated Verification

- `npm test` exits 0 with all three new scarcity cases and the 50-run companion passing.
- `npx tsc --noEmit` passes.

#### Manual Verification

- Inspect output: `"category-aware diversity — scarcity"` block with 3 cases visible;
  50-run companion visible inside `"category-aware diversity"`.

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: §6.1 Cookbook Update

### Overview

Stamp `context/foundation/test-plan.md §6.1` with the unit-test pattern this phase ships.
The cookbook entry is the canonical answer to "how do I add a unit test for the generator?"
for future contributors and for `/10x-tdd` in Lesson 2.

### Changes Required

#### 1. Fill in §6.1 in test-plan.md

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD — see §3 Phase 1` placeholder in `### 6.1 Adding a unit test
(generator and pure logic)` with the location, naming convention, reference test, and run
command established by this phase.

**Contract**: The replacement content must cover:

- **Location**: `src/lib/services/` (co-located with the source under test; no separate
  `__tests__` directory).
- **Naming**: `<source-file>.test.ts` (e.g., `schedule-generator.test.ts`).
- **Pattern — best-effort contract**: one `describe` block per contract boundary; use
  `makeRecipes(n)` with a 100-run loop for n-boundary tests; assert length and set-containment.
- **Pattern — hard invariant, multi-run**: loop ≥ 100 runs on adversarial sizes (`n = 2`,
  `n = 7`); assert no-adjacent-same-id inside the loop.
- **Pattern — category scarcity / relaxation-order**: use `makeRecipesSkewed()` (skewed
  distribution), loop ≥ 100 runs; assert both no-adjacent-same-meal and
  no-adjacent-same-category.
- **Run command**: `npm test`.
- **Reference test**: `src/lib/services/schedule-generator.test.ts` — specifically the
  `"hard invariant — no adjacent same meal, multi-run"` describe block for the canonical
  multi-run pattern.

Also update the §3 Phase 1 row status from `researched` to `planned` in the rollout table.

### Success Criteria

#### Automated Verification

- `npm test` still exits 0 (no regressions from the prose edit).

#### Manual Verification

- Read `context/foundation/test-plan.md §6.1`: placeholder is replaced; the three patterns
  (best-effort, hard invariant multi-run, scarcity) are named with location, naming,
  reference test, and run command.
- §3 rollout table shows Phase 1 status as `planned`.

---

## Testing Strategy

### Unit Tests

All tests in this plan ARE the tests. No additional test layer needed.

Key oracle discipline:
- Every assertion traces to a requirement (US-01, PRD §Business Logic, FR-008) — never to
  the implementation's own output.
- Hard invariants (`no adjacent same meal`) asserted unconditionally for `n ≥ 2`.
- Soft objective (`no adjacent same category`) asserted only as the relaxation-order
  guarantee on multi-category fixtures — not as a combinatorial minimum.
- Multi-run loops (50–100 iterations) substitute for a random seed to neutralize tie-break
  randomness without adding a seam.

### Manual Testing Steps

1. Run `npm test` — all cases green, no console errors.
2. Inspect reporter output for each new describe block and `it` title.
3. Confirm `test-plan.md §6.1` and §3 Phase 1 status read correctly.

## References

- Research: `context/changes/testing-generator-correctness/research.md`
- Generator source: `src/lib/services/schedule-generator.ts:8-45`
- Existing test suite: `src/lib/services/schedule-generator.test.ts:1-130`
- Test plan: `context/foundation/test-plan.md` §2 (Risks #1, #2), §3 Phase 1, §6.1
- PRD best-effort contract: `context/foundation/prd.md:89`
- Category-aware diversity archived plan (T1→T2→T3 ladder):
  `context/archive/2026-06-04-category-aware-diversity/plan.md:34-38`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Contract Baseline & Boundary Sizes

#### Automated

- [x] 1.1 `npm test` passes with new n=0, n=2 (100 runs), n=7 (100 runs) cases — 7ccbac2
- [x] 1.2 `npx tsc --noEmit` passes — 7ccbac2

#### Manual

- [x] 1.3 New describe block and 3 cases visible in reporter output — 7ccbac2

### Phase 2: Hard Invariant — No Adjacent Same Meal, Multi-Run

#### Automated

- [x] 2.1 `npm test` passes with n=2 (100 runs) and n=7 (100 runs) adjacency cases
- [x] 2.2 `npx tsc --noEmit` passes

#### Manual

- [x] 2.3 `"hard invariant — no adjacent same meal, multi-run"` block with 2 cases visible

### Phase 3: Relaxation-Order Guarantee & Category Scarcity

#### Automated

- [ ] 3.1 `npm test` passes with 50-run companion and 3 scarcity cases
- [ ] 3.2 `npx tsc --noEmit` passes

#### Manual

- [ ] 3.3 `"category-aware diversity — scarcity"` block with 3 cases visible in reporter
- [ ] 3.4 50-run companion visible inside `"category-aware diversity"` block

### Phase 4: §6.1 Cookbook Update

#### Automated

- [ ] 4.1 `npm test` still exits 0 (no regressions from prose edit)

#### Manual

- [ ] 4.2 `test-plan.md §6.1` placeholder replaced with location, naming, patterns, run command, and reference test
- [ ] 4.3 `test-plan.md §3` Phase 1 row shows status `planned`
