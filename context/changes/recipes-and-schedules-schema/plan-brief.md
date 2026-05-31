# Recipes + Schedules Schema (F-01) — Plan Brief

> Full plan: `context/changes/recipes-and-schedules-schema/plan.md`

## What & Why

Lay the database foundation for ChickenDinner: tables for `recipes`, `schedules`, and `schedule_days` with strict per-user row-level security, the closed six-value category enum, a transactional `create_schedule` RPC, shared TypeScript domain types, and a SQL smoke test for cross-user isolation. Sequenced first because S-01 already queries `recipes` and every downstream slice depends on the cascade/RLS/types decisions made here — without F-01 every slice would mock data, which is the slow path under the roadmap's `main_goal: speed`.

## Starting Point

`supabase/migrations/` is empty, `supabase/config.toml` is wired, `src/lib/supabase.ts` returns a null-safe `@supabase/ssr` client. Auth flows are present from the starter; no domain schema, no `src/types.ts`, no zod yet.

## Desired End State

A signed-in user can own recipes and schedules; a different signed-in user can never read or affect those rows. The schema for every downstream slice (S-01 list, S-02 insert, S-03 generate, S-05 delete-with-cascade) is fixed, the cascade rule (`[deleted]` rendered from a NULL join) is enforced at the database level, and the canonical TypeScript shapes live in `src/types.ts`.

## Key Decisions Made

| Decision                          | Choice                                                                                    | Why (1 sentence)                                                                                                | Source |
| --------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------ |
| Schedule storage shape            | Parent `schedules` + 7 child `schedule_days`                                              | Each day is a first-class FK to recipes, so cascade and per-day rendering are trivial joins.                    | Plan   |
| FR-007 cascade shape              | Hard delete + nullable FK with `ON DELETE SET NULL`; render `[deleted]` from NULL join    | Storage stays clean and Postgres FK semantics enforce the rule without triggers or app-side filtering.          | Plan   |
| Category source of truth          | Postgres enum is canonical; `Category` TS union + `CATEGORIES` const mirror it            | DB is the strictest check; one source of values across SQL/TS/zod; matches CLAUDE.md.                           | Plan   |
| RLS policy granularity            | One `FOR ALL` policy per table, `authenticated` only, no anon access                      | Less SQL, harder to introduce SELECT/UPDATE rule mismatches; user accepted the tradeoff vs. per-operation split. | Plan   |
| Types pipeline                    | Hand-written domain types in `src/types.ts`; no Supabase typegen                          | Zero extra build step, matches CLAUDE.md, fits the small 3-table surface.                                       | Plan   |
| Schedule write atomicity          | Postgres RPC `create_schedule(uuid[])`, `SECURITY INVOKER`                                | workerd cannot open raw Postgres connections; RPC gives single-round-trip transactional semantics.              | Plan   |
| Day-of-schedule representation    | Integer `day_index` 0–6, no calendar date                                                 | Matches PRD wording; avoids timezone reasoning in workerd; no PRD requirement for date queries.                 | Plan   |
| F-01 verification surface         | SQL smoke test (`supabase/tests/rls_isolation.sql`); no `seed.sql` for app data           | Directly verifies the NFR; RLS bugs are silent and catastrophic per the roadmap's F-01 risk note.               | Plan   |

## Scope

**In scope:**
- One schema migration: `category` enum, `recipes`, `schedules`, `schedule_days`, indexes, FKs, RLS policies.
- One RPC migration: `create_schedule(p_day_recipe_ids uuid[])` plpgsql function.
- `src/types.ts` with `Category`, `CATEGORIES`, `Recipe`, `Schedule`, `ScheduleDay`, `ScheduleWithDays`.
- `supabase/tests/rls_isolation.sql` cross-user isolation smoke test.

**Out of scope:**
- Zod schemas (introduced in S-02).
- Domain API endpoints, UI, services scaffolding.
- Generated database types via `supabase gen types typescript`.
- `seed.sql` with sample recipes.
- Soft delete, calendar dates, `recipe_name_snapshot` denormalization.
- Anon role access to any domain table.
- Generation algorithm, edit/delete endpoints, category-aware diversity.

## Architecture / Approach

```
auth.users
   │  (FK on delete cascade)
   ├──< recipes (user_id, name, category enum, timestamps)
   │       ▲
   │       │  (FK on delete SET NULL — the FR-007 cascade)
   │       │
   ├──< schedules (user_id, created_at)
   │       ▲
   │       │  (FK on delete cascade)
   │       │
   └──── schedule_days (schedule_id, day_index 0..6, recipe_id NULLABLE)

RLS: one FOR ALL policy per table, `authenticated` only.
     schedule_days policy scopes through schedules via EXISTS.

RPC: create_schedule(uuid[]) — SECURITY INVOKER, one transaction, returns uuid.
```

## Phases at a Glance

| Phase                                          | What it delivers                                                          | Key risk                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1. Schema migration — enum, tables, RLS        | 3 tables, indexes, FKs, RLS policies, `category` enum                     | Silent RLS bug — caught by Phase 4 test.                                                  |
| 2. `create_schedule` RPC migration             | Atomic 7-day insert function                                              | Wrong security mode (`DEFINER` instead of `INVOKER`) would bypass RLS.                    |
| 3. TypeScript domain types                     | `src/types.ts` with canonical types for every downstream slice            | Field-name drift between snake_case DB and TS — caught by type checker once callers land. |
| 4. RLS isolation smoke test                    | Runnable SQL test asserting cross-user isolation                          | Test passes vacuously if assertions are wrong — mitigated by step 4.3 (corrupt-and-verify).|

**Prerequisites:** Local Supabase stack running (`npx supabase start`), Docker available, env vars set in `.env`/`.dev.vars`.

**Estimated effort:** ~1 evening session — small SQL surface, no UI, no API.

## Open Risks & Assumptions

- pgTAP is assumed available in the local Supabase image. If it isn't, Phase 4 falls back to plain SQL assertions with `raise exception` on mismatch — still hermetic, less ergonomic output.
- The single `FOR ALL` policy shape (user-accepted) will need to be split if any future slice requires different rules per operation (e.g. admin-only INSERT). Document the constraint, revisit at that future change.
- Supabase migrations don't roll back automatically with `wrangler rollback` (per `infrastructure.md`) — each migration's header comment carries the reverse DDL so a human can revert manually.

## Success Criteria (Summary)

- `npx supabase db reset` applies both migrations cleanly on a fresh local DB.
- `npx supabase test db` runs `rls_isolation.sql` green and fails when the RLS policy is temporarily corrupted.
- `npx astro sync && npm run lint` pass with the new `src/types.ts`.
