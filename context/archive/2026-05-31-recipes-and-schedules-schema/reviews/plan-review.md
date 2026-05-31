<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Recipes + Schedules Schema (F-01)

- **Plan**: `context/changes/recipes-and-schedules-schema/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-31
- **Verdict**: SOUND (after fixes)
- **Findings**: 1 critical  1 warning  2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

4/4 new files expected ✓, 3/3 symbols ✓, brief↔plan ✓. Two env issues surfaced: missing `supabase/seed.sql` (F1) and `supabase/migrations/` not yet created (F3).

## Findings

### F1 — Missing seed.sql blocks every `supabase db reset` in every phase

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, Automated Verification 1.1 (and 2.1)
- **Detail**: `config.toml` has `db.seed.enabled = true` and `sql_paths = ["./seed.sql"]` but `supabase/seed.sql` does not exist. The CLI errors when `db reset` tries to load the listed file, blocking the automated check in both Phase 1 and Phase 2.
- **Fix**: Added "create empty `supabase/seed.sql`" as step 1.0 in Phase 1 Changes Required and Progress.
- **Decision**: FIXED

### F2 — `updated_at` column on `recipes` has no auto-update mechanism

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — recipes table contract
- **Detail**: `updated_at timestamptz not null default now()` only fires at INSERT. Every edit (FR-006 / S-02 is must-have) would leave `updated_at` frozen at creation time. `moddatetime` extension ships bundled in Supabase's local Docker image but was not enabled.
- **Fix A ⭐ Applied**: Added `create extension if not exists moddatetime with schema extensions` + `set_recipes_updated_at` BEFORE UPDATE trigger to Phase 1 contract. Added manual verification step 1.9 and Progress entry.
- **Decision**: FIXED via Fix A

### F3 — Current State Analysis says migrations dir is "empty"; it doesn't exist at all

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis, first bullet
- **Detail**: `supabase/migrations/` was never created. `supabase migration new` will create it, so implementation isn't blocked, but the plan misstated the baseline.
- **Fix**: Changed to "does not yet exist or is empty — `supabase migration new` will create the directory if it does not exist."
- **Decision**: FIXED

### F4 — Verification step 1.2 (`db dump`) requires human interpretation but was listed as Automated

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, Automated Verification 1.2
- **Detail**: `npx supabase db dump --local --schema public` outputs DDL text requiring visual inspection — not machine-assertable. The real automated gate is step 1.1 (`db reset`).
- **Fix**: Moved step 1.2 from Automated Verification to Manual Verification in Phase 1 and Progress.
- **Decision**: FIXED
