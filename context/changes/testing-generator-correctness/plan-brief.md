# Generator Correctness & Robustness — Plan Brief

> Full plan: `context/changes/testing-generator-correctness/plan.md`
> Research: `context/changes/testing-generator-correctness/research.md`

## What & Why

Add unit tests to `schedule-generator.test.ts` covering rollout Phase 1 of the quality
contract (test-plan.md Risks #1 and #2). The generator is the highest-risk pure function in
the codebase (hot-spot: 4 commits/30d); existing coverage is abundant-fixture-only and
single-run, leaving boundary sizes and the skewed-collection scenario completely untested.

## Starting Point

The existing 10-case suite covers `n = 10` and `n = 3` with single-run invariant checks.
`n = 0`, `n = 2`, and `n = 7` are untested; invariant assertions run once per call, making
violations reachable on certain `Math.random()` tie-breaks invisible. No fixture exercises
a skewed category distribution (the untested FR-008 differentiator).

## Desired End State

`npm test` passes with 4 new describe blocks (contract baseline, hard-invariant multi-run,
scarcity, and an upgraded 50-run category companion). `test-plan.md §6.1` is filled in with
the best-effort + diversity-invariant pattern. Phase 1 row in §3 shows `planned`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Oracle for Risk #1 empty case | Assert `→ []`, not 7 days | Research corrected the test-plan; `[]` is the designed contract, guarded upstream | Research |
| Oracle for Risk #2 soft objective | Relaxation-order guarantee (zero same-category adjacencies on multi-category fixtures) | Greedy + random ≠ optimal; asserting a combinatorial minimum is flaky on correct output | Research + test-plan §2 |
| Randomness handling | Multi-run loop (100 iterations), no seed/seam | Random tie-break is a ratified decision; looping is the correct neutralisation technique | Research |
| Scarcity fixture | 5 chicken + 2 pork = 7 recipes | Tests LRU cycling under minority-category pressure; the FR-008 gap not covered by the abundant fixture | Research §Gaps |
| Test file location | Append to existing `schedule-generator.test.ts` | Consistent with the one existing test file; no new file needed | Plan |
| DB / RPC scope | Excluded from this phase | `create_schedule` RPC belongs to Phase 2 (Risks #3, #4) | Research §Persistence boundary |

## Scope

**In scope:** `schedule-generator.test.ts` additions (4 describe blocks / companion `it`);
`test-plan.md §6.1` cookbook entry; §3 Phase 1 status update.

**Out of scope:** `create_schedule` RPC, Supabase DB, CI wiring, test-runner configuration,
seed/mock of `Math.random()`.

## Architecture / Approach

Pure-function unit testing with no mocks, no DB, no Worker:

```
makeRecipes(n)             → single-category fixture (existing)
makeRecipesMultiCategory() → round-robin 6 categories (existing)
makeRecipesSkewed()        → 5 chicken + 2 pork (new)

each invariant test: for (let i = 0; i < N; i++) { call + assert }
```

Risk #1 oracle = requirement (US-01 best-effort; `schedule-generator.ts:9` for empty).  
Risk #2 hard oracle = US-01 AC adjacency rule; unconditional for n ≥ 2.  
Risk #2 soft oracle = FR-008 relaxation-order guarantee; zero same-category adjacencies
on multi-category fixtures (T1 always non-empty → provable invariant, not just statistical).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Contract baseline | n=0 pin + n=2/n=7 multi-run length + set-containment | Asserting 7 days for n=0 (test-plan §2 anti-pattern) |
| 2. Hard invariant multi-run | 100-run no-adjacent-same-meal for n=2, n=7 | Single-run assertion misses tie-break-exposed violation |
| 3. Scarcity + category upgrade | 100-run skewed fixture; 50-run companion for abundant | Optimum oracle on greedy output (flaky) |
| 4. §6.1 cookbook update | test-plan.md §6.1 filled; §3 status → planned | Stale placeholder misguides Lesson 2 |

**Prerequisites:** none — existing Vitest setup is ready; `npm test` already runs.  
**Estimated effort:** ~1 session; all changes are in one test file + one markdown file.

## Open Risks & Assumptions

- `makeRecipesSkewed()` uses "pork" as the minority category; any other category from
  `CATEGORIES` works. If "pork" is removed from the closed list in a future refactor, the
  fixture must be updated.
- The 100-run loop count is empirical; if a CI run is unusually slow, reduce to 50 without
  losing signal.

## Success Criteria (Summary)

- `npm test` green with no existing regressions and all new multi-run cases passing.
- `test-plan.md §6.1` is a filled cookbook entry (location, naming, 3 patterns, run command,
  reference test) — not a placeholder.
- Phase 1 row in §3 reads `planned`.
