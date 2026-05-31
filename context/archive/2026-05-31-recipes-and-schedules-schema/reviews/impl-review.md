<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Recipes + Schedules Schema (F-01)

- **Plan**: context/changes/recipes-and-schedules-schema/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-05-31
- **Verdict**: NEEDS ATTENTION (warnings fixed during triage → APPROVED post-triage)
- **Findings**: 0 critical  2 warnings  4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — FK checks bypass RLS in create_schedule

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260531173036_create_schedule_rpc.sql:26-28
- **Detail**: PostgreSQL FK checks bypass RLS. User B can pass user A's recipe UUID to create_schedule; the FK validates against the raw recipes table so the INSERT into schedule_days succeeds. User B's schedule references a recipe they don't own; the join returns NULL and renders as [deleted]. No data leak, but stored data is inconsistent.
- **Fix**: Added ownership check in new migration `20260531180052_fix_create_schedule_guards.sql` — unnests the array, cross-checks each non-NULL UUID against `recipes where user_id = auth.uid()`, raises exception if any mismatch.
- **Decision**: FIXED (via new migration)

### F2 — No auth.uid() null guard in create_schedule

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260531173036_create_schedule_rpc.sql:22-24
- **Detail**: No guard for auth.uid() IS NULL; anon execution (blocked by GRANT) would produce an opaque 23502 NOT NULL constraint error rather than a clear message.
- **Fix**: Added `if auth.uid() is null then raise exception` at top of function body in `20260531180052_fix_create_schedule_guards.sql`.
- **Decision**: FIXED (covered by same migration as F1)

### F3 — Redundant "role" field in JWT claims in test

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/rls_isolation.sql:64-65, 86
- **Detail**: `{"sub":"...","role":"authenticated"}` includes a "role" key auth.uid() ignores; the Postgres role is governed by `set local role`, not the JSON payload.
- **Fix**: Removed "role" field from both JWT claims strings.
- **Decision**: FIXED

### F4 — reset role vs set local role postgres mid-test

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/rls_isolation.sql:103, 127
- **Detail**: `reset role` is session-scoped; `set local role postgres` would be the strictly transaction-local equivalent inside a BEGIN/ROLLBACK block.
- **Fix**: N/A
- **Decision**: SKIPPED

### F5 — No anon-role zero-row assertion

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/rls_isolation.sql (missing)
- **Detail**: Test covered authenticated user-to-user isolation but not anon role. A future accidental anon policy grant would not be caught.
- **Fix**: Added T6-T8 block: `set local role anon`, asserts count=0 on recipes/schedules/schedule_days; bumped plan(5) to plan(8).
- **Decision**: FIXED

### F6 — schedule_days RLS transitivity non-obvious (doc gap)

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260531164345_create_recipes_schedules_schema.sql:96-112
- **Detail**: schedule_days policy queries schedules via EXISTS, which is itself RLS-filtered. Isolation holds transitively but the double-RLS interaction is non-obvious to future maintainers.
- **Fix**: Added explanatory comment above the policy.
- **Decision**: FIXED
