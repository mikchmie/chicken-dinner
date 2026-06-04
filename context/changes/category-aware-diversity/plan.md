# Category-Aware Diversity Implementation Plan

## Overview

Extend `generateSchedule()` to avoid assigning the same base-ingredient category on consecutive days. The algorithm gains a second filtering tier: prefer category-diverse candidates first; fall back to same-category only when no diverse candidates exist (after the existing meal-uniqueness exclusion). No schema, API, or UI changes are needed — categories are already stored, fetched, and displayed.

## Current State Analysis

- `src/lib/services/schedule-generator.ts` — `generateSchedule(recipes: RecipeSlot[])` uses greedy LRU with random tie-breaking. It receives `recipe.category` but ignores it (forward-compatible stub from S-03). The `RecipeSlot` interface already includes `category: Category`.
- `src/types.ts` — six `Category` values, `CATEGORIES` const array, `CATEGORY_LABELS_PL` map; all present and used in the UI.
- `src/lib/services/schedule-generator.test.ts` — 8 existing tests using `makeRecipes(n)` which assigns all recipes `"chicken"`. These continue to pass after the change: with a single-category collection the tier-1 filter yields zero candidates every day → tier-2 fires → no-adjacent-meal invariant holds as before.
- No DB, API, or UI changes needed.

## Desired End State

`generateSchedule()` returns a 7-day schedule where no two consecutive days share a base-ingredient category, whenever the recipe collection is diverse enough to allow it. On single-category collections (or any day where no category-diverse candidate exists), the algorithm degrades gracefully — every day is always filled, meal uniqueness is always enforced. The test suite asserts both the happy path (diverse collection → no adjacent same category) and the fallback path (single-category collection → valid output, no crash).

### Key Discoveries

- `RecipeSlot.category` is already in scope in the generator — no interface or import change (`src/lib/services/schedule-generator.ts:1-6`)
- The existing three-step structure (candidates → LRU → random) extends with a fourth step (tier-1 filter) without restructuring the loop (`src/lib/services/schedule-generator.ts:16-34`)
- The `lastUsed` Map pattern at function start can be mirrored for a `categoryOf` lookup Map — same approach, zero new dependencies
- `makeRecipes(n)` assigns `"chicken"` to all — existing 8 tests remain valid because tier-2 fallback fires every iteration and maintains no-adjacent-meal

## What We're NOT Doing

- No change to `RecipeSlot` interface or function signature
- No DB migration, API route change, or UI change
- No week-level category balancing or N+2 anti-clustering — consecutive days only
- No change to non-adjacent repetition behavior for small collections

## Implementation Approach

Add one pre-loop lookup Map (`categoryOf: Map<string, Category>`), then insert a tier-1 filter inside the existing loop. The three-tier candidate selection mirrors the existing structure:

1. **Tier 1** — exclude previous meal AND previous category (diverse candidates)
2. **Tier 2** — relax category constraint, keep meal exclusion (same-category allowed)
3. **Tier 3** — allow all (existing single-recipe fallback, unchanged)

LRU selection and random tie-breaking are untouched.

---

## Phase 1: Algorithm update

### Overview

Modify `generateSchedule()` to add two-tier candidate filtering. Function signature, `RecipeSlot` interface, and return type are unchanged.

### Changes Required

#### 1. Two-tier candidate selection

**File**: `src/lib/services/schedule-generator.ts`

**Intent**: Build a `categoryOf` lookup map before the loop (mirrors the existing `lastUsed` map), then filter candidates in two tiers: first excluding previous meal AND previous category; if empty, relax to excluding previous meal only; the existing single-recipe fallback remains as tier 3.

**Contract**: `categoryOf` is `Map<string, Category>` built from `recipes` before the loop. `previousCategory` inside the loop is `Category | undefined` — `undefined` on day 0 (no previous day), the looked-up category on days 1–6. The tier-1 filter `r.category !== previousCategory` degenerates to "include all" on day 0 (nothing equals `undefined`), so tier 1 behaves identically to tier 2 on the first iteration.

```typescript
// Add after: const lastUsed = new Map(...)
const categoryOf = new Map<string, Category>(recipes.map((r) => [r.id, r.category]));

// Inside the loop, replace the existing single-tier candidates block:
const previousCategory = previousId !== null ? categoryOf.get(previousId) : undefined;

let candidates = recipes.filter(
  (r) => r.id !== previousId && r.category !== previousCategory,
);
if (candidates.length === 0) {
  candidates = recipes.filter((r) => r.id !== previousId);
}
if (candidates.length === 0) {
  candidates = recipes; // single-recipe fallback (unchanged)
}
```

### Success Criteria

#### Automated Verification

- All 8 existing tests still pass: `npm run test`
- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`

#### Manual Verification

- (None at this phase — proceed directly to Phase 2 once automated checks are green)

---

## Phase 2: Test suite extension

### Overview

Add a `makeRecipesMultiCategory` helper that cycles through all 6 categories, and add new tests asserting: no adjacent same-category on a diverse collection; fallback produces valid output on a single-category collection; category arrangements vary across runs.

### Changes Required

#### 1. Multi-category test fixture

**File**: `src/lib/services/schedule-generator.test.ts`

**Intent**: Add a `makeRecipesMultiCategory(n)` helper that assigns `CATEGORIES[i % 6]` to each recipe slot. Existing `makeRecipes(n)` and all 8 existing tests are unchanged.

**Contract**: `makeRecipesMultiCategory(n)` returns `RecipeSlot[]` of length `n` where `recipes[i].category === CATEGORIES[i % 6]`. Import `CATEGORIES` from `@/types`.

#### 2. Category diversity test group

**File**: `src/lib/services/schedule-generator.test.ts`

**Intent**: Assert the three invariants of the updated algorithm in a new `describe("category-aware diversity")` block: (a) with ≥7 multi-category recipes, no two consecutive days share the same category; (b) with a single-category collection, the schedule still has 7 days and no adjacent meal duplicates; (c) varied category arrangements are produced across multiple runs on a diverse collection.

**Contract**: Three `it()` blocks in the new describe group.
- Invariant (a): `makeRecipesMultiCategory(10)`, resolve each result ID back to its `RecipeSlot` via a lookup map, assert `recipe[i].category !== recipe[i-1].category` for all consecutive pairs.
- Invariant (b): `makeRecipes(5)` (all chicken), assert `result.length === 7` and no adjacent ID duplicates.
- Invariant (c): 20 runs on `makeRecipesMultiCategory(10)`, assert `Set(runs).size > 1`.

### Success Criteria

#### Automated Verification

- All tests pass (8 existing + 3 new = 11 total): `npm run test`
- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`

#### Manual Verification

- Generate a schedule from a collection with recipes in ≥3 different categories; inspect `/schedules` — no two adjacent days show the same category label
- Generate a schedule from a single-category collection (e.g., all "Kurczak") — schedule generates successfully with all 7 days filled, no error

---

## Testing Strategy

### Unit Tests

- Existing 8 tests cover: large collection (no adjacent meal dupes), 3-recipe, 1-recipe, output variety
- New 3 tests add: category diversity invariant (diverse collection), fallback validity (single-category), category variety across runs

### Manual Testing Steps

1. Add ≥7 recipes spanning ≥3 different categories to the collection
2. Press "Generuj" — inspect the resulting schedule in the UI at `/schedules`
3. Verify no two adjacent days show the same category label (e.g., "Kurczak" not followed immediately by "Kurczak")
4. Add a second batch of all-"Kurczak" recipes (or use a fresh account), generate — confirm 7 days, no error, no adjacent meal repeat

## References

- Algorithm: `src/lib/services/schedule-generator.ts`
- Tests: `src/lib/services/schedule-generator.test.ts`
- Types: `src/types.ts` (CATEGORIES constant)
- S-03 plan (algorithm design decisions): `context/archive/2026-06-03-first-generated-schedule/plan.md`
- PRD Business Logic: `context/foundation/prd.md:85`
- Roadmap S-04: `context/foundation/roadmap.md:118-129`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Algorithm update

#### Automated

- [ ] 1.1 All 8 existing tests still pass: `npm run test`
- [ ] 1.2 Linting passes: `npm run lint`
- [ ] 1.3 Type checking passes: `npx astro check`

### Phase 2: Test suite extension

#### Automated

- [ ] 2.1 All tests pass (8 existing + 3 new = 11 total): `npm run test`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Type checking passes: `npx astro check`

#### Manual

- [ ] 2.4 Generate with ≥3-category collection; inspect `/schedules` — no two adjacent days share same category label
- [ ] 2.5 Generate with single-category collection — 7 days filled, no error
