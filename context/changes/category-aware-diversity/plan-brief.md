# Category-Aware Diversity — Plan Brief

> Full plan: `context/changes/category-aware-diversity/plan.md`

## What & Why

The schedule generator already avoids consecutive duplicate meals (S-03). This change extends it to also avoid consecutive days sharing the same base-ingredient category — the "minimises clustering" clause in the PRD's Business Logic that was explicitly deferred from S-03. Without this, the app satisfies the Primary Success Criterion (no duplicate meals) but misses the Secondary one (schedule *feels* varied).

## Starting Point

`generateSchedule()` in `src/lib/services/schedule-generator.ts` uses greedy LRU with random tie-breaking. It already receives `recipe.category` per slot but ignores it — a forward-compatible stub placed in S-03 for exactly this extension. The `CATEGORIES` constant, `Category` type, and UI labels are all already in place.

## Desired End State

When the user presses "Generuj" with a collection spanning multiple categories, the resulting schedule shows no two adjacent days with the same category label. On category-constrained collections (e.g., all recipes are "Kurczak"), the algorithm falls back gracefully — it still fills all 7 days and still enforces meal uniqueness. The change is invisible to the user except as better variety.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Fallback when no diverse candidate exists | Two-tier: try category-diverse first, allow same-category if empty | Matches PRD "best-effort / never refuses"; mirrors existing meal-uniqueness fallback structure | Plan |
| Constraint scope | Consecutive only (day N vs N+1) | PRD says "consecutive days"; mirrors existing meal rule; N+2 has no PRD basis | Plan |
| Test fixture update | Keep `makeRecipes` (all-chicken) + add `makeRecipesMultiCategory` | Preserves original test intent; adds meaningful assertions for the new behavior | Plan |

## Scope

**In scope:**
- Two-tier candidate filtering inside `generateSchedule()` loop
- `categoryOf` lookup Map (pre-loop, mirrors existing `lastUsed` Map)
- New `makeRecipesMultiCategory` test helper + 3 new test cases

**Out of scope:**
- `RecipeSlot` interface or function signature changes
- DB migration, API route, or UI changes
- Week-level category balancing or N+2 anti-clustering
- Non-adjacent repetition behavior for small collections

## Architecture / Approach

Pure algorithm change inside a single pure function. The existing three-step loop (filter candidates → find LRU → random tie-break) gains one new step before LRU selection: a second candidate filter that relaxes category exclusion if the first filter returns empty. The function signature is unchanged; callers are unaffected.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Algorithm update | `generateSchedule()` avoids consecutive same-category with graceful fallback | TypeScript strictTypeChecked may flag `Category \| undefined` comparison — addressed in Contract |
| 2. Test suite extension | 3 new tests assert category invariant + fallback + variety; 8 existing tests stay green | `makeRecipesMultiCategory` category lookup in assertion requires ID→slot reverse map |

**Prerequisites:** S-03 complete (done). No external dependencies.  
**Estimated effort:** ~1 session, 2 phases

## Open Risks & Assumptions

- The `@typescript-eslint/strict-boolean-expressions` or related rules may flag `r.category !== previousCategory` when `previousCategory: Category | undefined` — the comparison is safe but ESLint in `strictTypeChecked` mode requires verification on first `npm run lint`.
- No UI changes needed: category labels are already rendered in `/schedules` and `/schedules/[id]`; manual verification uses the existing display.

## Success Criteria (Summary)

- `npm run test` passes with 11 tests (8 existing + 3 new)
- Generating from a ≥3-category collection shows no two adjacent days with the same category label in the UI
- Generating from a single-category collection completes without error and fills all 7 days
