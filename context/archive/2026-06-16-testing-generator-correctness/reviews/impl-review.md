<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Generator Correctness & Robustness

- **Plan**: context/changes/testing-generator-correctness/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-06-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 2 warnings · 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — makeRecipesSkewed defined mid-file, breaking the helpers-at-top convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/schedule-generator.test.ts:184 (pre-fix)
- **Detail**: makeRecipesSkewed was defined at line 184 between two describe blocks, while all other helpers (makeRecipes, makeRecipesMultiCategory) are grouped at the top of the file before any describe block. Safe at runtime (JavaScript hoists function declarations), but breaks the two-zone file structure and surprises readers scanning top-to-bottom.
- **Fix**: Move makeRecipesSkewed to line 19, after makeRecipesMultiCategory, alongside the other fixture helpers.
- **Decision**: FIXED — commit 4b70687

### F2 — "SOFT invariant" comment label is inaccurate for the skewed fixture

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/schedule-generator.test.ts — "SOFT invariant" comment in the scarcity block
- **Detail**: The comment says "SOFT invariant: no adjacent same category" but for the skewed fixture (5 chicken + 2 pork), T1 is always non-empty, making zero adjacent same-category pairs a provable guarantee. The word SOFT could lead a future maintainer to weaken the assertion if the fixture is accidentally changed to one where T1 can become empty.
- **Fix**: Replace comment with one that explains the fixture precondition: "SOFT objective, provably achievable for this fixture: T1 is always non-empty (≥2 minority-category recipes), so zero adjacent same-category pairs is guaranteed."
- **Decision**: SKIPPED

### F3 — Single-category fallback test has no category assertion; placement is misleading

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/schedule-generator.test.ts:127
- **Detail**: "produces valid output on a single-category collection via fallback" lives inside describe("category-aware diversity") but only asserts meal-uniqueness, not any category behaviour. Pre-existing test — not introduced by this change. A rename would make the assertion scope explicit.
- **Fix**: Rename the it() description to "fallback on single-category collection still satisfies meal-uniqueness hard invariant".
- **Decision**: SKIPPED
