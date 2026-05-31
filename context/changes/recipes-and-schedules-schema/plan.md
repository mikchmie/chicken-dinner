# Recipes + Schedules Schema (F-01) Implementation Plan

## Overview

Lay the database foundation for ChickenDinner: tables for `recipes`, `schedules`, and `schedule_days`, with per-user row-level security, a transactional `create_schedule` RPC, shared TypeScript domain types, and a SQL smoke test that proves cross-user isolation. Every downstream slice (S-01 reads recipes, S-02 writes recipes, S-03 writes schedules, S-05 exercises the cascade rule) depends on this foundation.

## Current State Analysis

- `supabase/migrations/` does not yet exist or is empty — no domain schema exists yet. `supabase migration new` will create the directory if it does not exist.
- `supabase/config.toml` is wired (`major_version = 17`, `db.migrations.enabled = true`, `db.seed.enabled = true`, default `seed.sql` path).
- `src/lib/supabase.ts` uses `@supabase/ssr` with cookie session handling and returns `null` when `SUPABASE_URL`/`SUPABASE_KEY` are missing — every domain query must null-check.
- `src/env.d.ts` declares `App.Locals.user` as `User | null`.
- `src/types.ts` does not yet exist — this plan creates it.
- `zod` is not in `package.json` — F-01 does not introduce it; S-02 will, per CLAUDE.md.
- `supabase` CLI is in `devDependencies` (`^2.23.4`) and authenticated locally.
- Auth schema is provided by Supabase — `auth.users` and `auth.uid()` are already available.

### Key Discoveries:

- **Category enum is closed and locked by PRD Business Logic**: chicken, pork, beef, leguminous, eggs, vegetables. No new values allowed in MVP.
- **FR-007 cascade is locked at the PRD level** (deleted recipes show as `[deleted]` in past schedules) but the **shape** is an Unknown the roadmap explicitly defers to this plan. Locked here: nullable FK + `ON DELETE SET NULL`, render `[deleted]` when join yields NULL.
- **Workerd runtime constraint** (`context/foundation/infrastructure.md`): no raw Postgres connections — only PostgREST HTTP. Multi-row atomicity requires a Postgres function, not an app-side transaction.
- **NFR data-isolation is a hard guardrail.** RLS bugs are silent and catastrophic — `context/foundation/roadmap.md` F-01 risk section calls this out explicitly.
- **`infrastructure.md` Operational Story** notes that Supabase migrations do not roll back automatically with `wrangler rollback` — every migration in this plan must be designed as forward-only with a reversible drop block in the migration header comment.

## Desired End State

A signed-in user can be persisted as the owner of recipes and schedules; a different signed-in user can never read or affect those rows. The shape of every downstream slice's data access is fixed:

- A `recipes` table exists with `(id, user_id, name, category, created_at, updated_at)` where `category` is a Postgres enum of the six locked values.
- A `schedules` table exists with `(id, user_id, created_at)`.
- A `schedule_days` table exists with `(schedule_id, day_index, recipe_id)` where `day_index` is `smallint` 0–6, `recipe_id` is **nullable** with `ON DELETE SET NULL` to `recipes(id)`, and `(schedule_id, day_index)` is the composite primary key.
- A `create_schedule(p_day_recipe_ids uuid[])` plpgsql function exists with `SECURITY INVOKER` that inserts the parent + 7 child rows atomically and returns the new schedule id.
- Every table has RLS enabled and exactly one `FOR ALL` policy scoped to the `authenticated` role with `auth.uid() = user_id` (for `recipes` and `schedules`) or an `EXISTS` lookup through the parent (for `schedule_days`).
- `src/types.ts` exports the `Category` literal union, `CATEGORIES` const-array, and `Recipe`, `Schedule`, `ScheduleDay`, `ScheduleWithDays` types.
- `supabase/tests/rls_isolation.sql` is a runnable SQL test that creates two synthetic users, inserts recipes as each, sets the JWT role, and asserts SELECT returns only the caller's rows.

### Verification:

- `npx supabase db reset` applies the migration cleanly.
- `npx supabase test db` runs the RLS isolation test green.
- `npm run lint` passes (type-checked mode).
- `npx astro sync` runs without errors.
- A manual sign-in as two different test users in Studio confirms cross-user reads return empty.

## What We're NOT Doing

- **No zod schemas.** Introduced in S-02 alongside the first POST endpoint. CLAUDE.md is explicit.
- **No domain endpoints.** No files under `src/pages/api/recipes/**` or `src/pages/api/schedules/**`. F-01 is data-layer-only.
- **No UI.** No `.astro` pages, no React components touching the schema.
- **No `src/lib/services/`** scaffolding. F-01 ships types, not service classes — services emerge when S-02 needs them.
- **No generated database types** (`supabase gen types typescript`). Hand-written domain types in `src/types.ts` are canonical. Revisit post-MVP if drift hurts.
- **No `seed.sql` with sample recipes.** Local dev starts empty; the smoke test creates its own users inline.
- **No soft delete** on recipes. Hard delete + nullable FK is the locked cascade shape.
- **No calendar date** on schedule days. `day_index` 0–6 only — PRD never asks for "what did I eat on date X."
- **No `recipe_name_snapshot`** denormalization on `schedule_days`. Past schedules render `[deleted]` from a NULL join, not from a preserved name.
- **No anon role access** to any domain table. anon gets zero policies and therefore zero rows.
- **No category-aware diversity logic, no generation algorithm, no edit/delete endpoints.** Those are S-03/S-04/S-05.
- **No GitHub Actions or CI changes.** Existing `.github/workflows/ci.yml` is fine for F-01.

## Implementation Approach

Two migrations, one types file, one test file. Order is mechanical:

1. Schema migration: enum → tables → indexes → FKs → RLS enable → policies.
2. RPC migration: `create_schedule` function.
3. `src/types.ts`: domain types mirroring the schema.
4. `supabase/tests/rls_isolation.sql`: cross-user isolation assertion.

Each phase has automated verification (`supabase db reset` + `supabase test db` + `npm run lint`) plus a manual verification step in Supabase Studio. The plan pauses for manual confirmation after every phase per the implementation-note convention.

## Critical Implementation Details

- **Migrations are forward-only against the cloud database.** Supabase migrations do not roll back automatically with `wrangler rollback` (`infrastructure.md` Operational Story). Each migration file begins with a header comment listing the rollback DDL (`drop policy`, `drop function`, `drop table`, `drop type`) in reverse-creation order, so a human can revert manually if needed.
- **RLS-enable comes before any policy.** Postgres allows policies on a table without RLS enabled, but they have no effect. The migration must `alter table ... enable row level security` for every table and then create policies.
- **`schedule_days` RLS scopes through the parent.** `schedule_days` has no `user_id` column — its RLS policy is `using (exists (select 1 from schedules s where s.id = schedule_days.schedule_id and s.user_id = auth.uid()))`. This is the standard Supabase pattern for child rows.
- **`create_schedule` is `SECURITY INVOKER`.** Running under the caller's privileges means RLS still applies inside the function body — the INSERTs use `auth.uid()` and are subject to the same policy checks as direct table writes. `SECURITY DEFINER` would bypass RLS and is not used.
- **`schedule_days.recipe_id` is nullable with `ON DELETE SET NULL`** — this is the entire FR-007 cascade. No trigger, no soft-delete machinery. Renderers read NULL as `[deleted]`.

## Phase 1: Schema migration — enum, tables, RLS

### Overview

Create the schema migration that establishes the `category` enum, `recipes`, `schedules`, `schedule_days` tables, their FKs and indexes, and one `FOR ALL` RLS policy per table for the `authenticated` role.

### Changes Required:

#### 0. Prerequisite: empty seed file

**File**: `supabase/seed.sql`

**Intent**: `config.toml` already references `sql_paths = ["./seed.sql"]` under `[db.seed]` with `enabled = true`. The file does not exist yet — `supabase db reset` will fail when it tries to load it. Create an empty placeholder so the CLI seed step is a no-op. The plan explicitly ships no sample data; this file stays empty throughout F-01.

**Contract**: The file exists and is empty (or contains only a SQL comment). No INSERT statements.

#### 1. Migration file

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_recipes_schedules_schema.sql` (timestamp generated at write time via `npx supabase migration new create_recipes_schedules_schema`)

**Intent**: Establish all three domain tables with strict per-user RLS, the closed-six `category` enum, the cascade contract (`ON DELETE SET NULL` from `schedule_days.recipe_id` to `recipes.id`), and a parent-child cascade (`ON DELETE CASCADE` from `schedule_days.schedule_id` to `schedules.id`). Header comment lists the reverse-order rollback DDL.

**Contract**:

- Postgres enum `category` with exactly six values in this order: `chicken`, `pork`, `beef`, `leguminous`, `eggs`, `vegetables`.
- Table `recipes(id uuid pk default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null check (char_length(name) between 1 and 200), category category not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`.
- Table `schedules(id uuid pk default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now())`.
- Table `schedule_days(schedule_id uuid not null references schedules(id) on delete cascade, day_index smallint not null check (day_index between 0 and 6), recipe_id uuid null references recipes(id) on delete set null, primary key (schedule_id, day_index))`.
- Index `recipes_user_id_idx` on `recipes(user_id)` for the recipe list query (S-01).
- Index `schedules_user_id_created_at_idx` on `schedules(user_id, created_at desc)` for the "view past schedules" query (FR-009).
- Extension `moddatetime` installed in the `extensions` schema: `create extension if not exists moddatetime with schema extensions;`. This is the only auto-update mechanism for `updated_at` — without it the column freezes at INSERT time. The extension ships bundled in Supabase's local Docker image.
- Trigger `set_recipes_updated_at` on `recipes` that fires `BEFORE UPDATE FOR EACH ROW` calling `extensions.moddatetime(updated_at)`. No equivalent trigger is needed for `schedules` (that table has no `updated_at` column).
- RLS enabled on all three tables.
- Policy `recipes_owner_all on recipes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)`.
- Policy `schedules_owner_all on schedules for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)`.
- Policy `schedule_days_owner_all on schedule_days for all to authenticated using (exists (select 1 from schedules s where s.id = schedule_days.schedule_id and s.user_id = auth.uid())) with check (exists (select 1 from schedules s where s.id = schedule_days.schedule_id and s.user_id = auth.uid()))`.
- No anon policies — anon role gets zero access.
- Header comment in the migration file lists rollback DDL in reverse-creation order.

### Success Criteria:

#### Automated Verification:

- Migration applies on a fresh local DB: `npx supabase db reset`
- Lint passes: `npm run lint`
- Astro sync runs: `npx astro sync`

#### Manual Verification:

- Open Studio at `http://localhost:54323` and confirm `recipes`, `schedules`, `schedule_days` tables exist under `public`.
- DDL spot-check: `npx supabase db dump --local --schema public` — skim output and confirm tables, enum, indexes, and policies are present.
- Confirm RLS is enabled on each (the lock icon in Studio's Table Editor).
- Confirm the `category` enum exists under Database → Enumerated Types with the six values in declared order.
- Sign in as a test user in Studio's SQL editor (set `request.jwt.claims`), insert a recipe, switch to a second user, run `select * from recipes` — confirm zero rows.
- Confirm the `moddatetime` trigger works: update a recipe's name, then `select updated_at from recipes where id = '<id>'` — the timestamp should be newer than `created_at`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: `create_schedule` RPC migration

### Overview

Add a second migration containing the `create_schedule(p_day_recipe_ids uuid[])` plpgsql function. The function wraps the parent + 7 child inserts in one transaction and returns the new schedule id. S-03 will call it via `supabase.rpc('create_schedule', ...)`.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_schedule_rpc.sql` (timestamp generated via `npx supabase migration new create_schedule_rpc`, must sort after Phase 1's migration)

**Intent**: Provide atomic, RLS-respecting schedule creation. The function inserts the parent `schedules` row and 7 `schedule_days` rows inside one implicit plpgsql transaction. Header comment lists rollback DDL (`drop function`).

**Contract**:

```sql
create function public.create_schedule(p_day_recipe_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_schedule_id uuid;
begin
  if array_length(p_day_recipe_ids, 1) is distinct from 7 then
    raise exception 'create_schedule requires exactly 7 recipe ids, got %', coalesce(array_length(p_day_recipe_ids, 1), 0);
  end if;

  insert into schedules (user_id)
    values (auth.uid())
    returning id into v_schedule_id;

  insert into schedule_days (schedule_id, day_index, recipe_id)
  select v_schedule_id, idx - 1, p_day_recipe_ids[idx]
  from generate_series(1, 7) as idx;

  return v_schedule_id;
end;
$$;

revoke all on function public.create_schedule(uuid[]) from public;
grant execute on function public.create_schedule(uuid[]) to authenticated;
```

The `SECURITY INVOKER` declaration is load-bearing: the function runs under the caller's role, so the `insert into schedules` is subject to the `schedules_owner_all` policy from Phase 1, and the `insert into schedule_days` is subject to `schedule_days_owner_all`. A caller without a valid JWT (i.e. `auth.uid() is null`) cannot insert.

### Success Criteria:

#### Automated Verification:

- Migration applies on a fresh DB: `npx supabase db reset`
- Function exists: `select proname from pg_proc where proname = 'create_schedule';` returns one row
- Lint passes: `npm run lint`

#### Manual Verification:

- In Studio SQL editor, with a test user's JWT claims set, run `select create_schedule(array['<recipe-uuid-1>', ..., '<recipe-uuid-7>']::uuid[])` and confirm it returns a UUID.
- Confirm `select count(*) from schedule_days where schedule_id = '<returned-uuid>'` is exactly 7.
- Confirm passing fewer than 7 ids raises an exception (the `array_length` guard).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: TypeScript domain types

### Overview

Create `src/types.ts` exporting the `Category` literal union, the `CATEGORIES` const-array, and the `Recipe`, `Schedule`, `ScheduleDay`, `ScheduleWithDays` interfaces. These are the canonical domain types every downstream slice imports.

### Changes Required:

#### 1. New file: `src/types.ts`

**File**: `src/types.ts`

**Intent**: One file holds every cross-module domain type for ChickenDinner. Mirrors the schema 1:1 in snake_case (matching what supabase-js returns by default) so downstream code does not have to remap field names. Two distinct types for schedules: `Schedule` is the bare parent row; `ScheduleWithDays` is the parent + its 7 child rows joined to recipes. Splitting them keeps list-of-schedules queries from forcing every caller to defensively check `if (schedule.days)`.

**Contract**:

```ts
export const CATEGORIES = ["chicken", "pork", "beef", "leguminous", "eggs", "vegetables"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  category: Category;
  created_at: string;
  updated_at: string;
}

export interface Schedule {
  id: string;
  user_id: string;
  created_at: string;
}

export interface ScheduleDay {
  schedule_id: string;
  day_index: number;
  recipe_id: string | null;
}

export interface ScheduleWithDays extends Schedule {
  days: Array<{
    day_index: number;
    recipe: Recipe | null;
  }>;
}
```

The `recipe: Recipe | null` shape in `ScheduleWithDays` is the type-system manifestation of FR-007 — when the recipe was deleted, the join yields NULL and the renderer must handle `[deleted]`. The `CATEGORIES` const-array is what S-02's zod schema will consume via `z.enum(CATEGORIES)`.

### Success Criteria:

#### Automated Verification:

- File exists and is importable: `node -e "import('./src/types.ts').then(m => console.log(Object.keys(m)))"` (or a transient `src/_check.ts` that imports every export)
- Type check passes: `npx astro sync && npm run lint`
- Prettier-clean: `npm run format` produces no diff

#### Manual Verification:

- Open `src/types.ts` and confirm every field uses snake_case (matches PostgREST return shape).
- Confirm `CATEGORIES` ordering matches the enum's order in the Phase 1 migration character-for-character — drift here would cause silent UI ordering bugs.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: RLS isolation smoke test

### Overview

Add `supabase/tests/rls_isolation.sql` — a SQL test that creates two synthetic users in `auth.users`, inserts recipes as each, sets `request.jwt.claims` to one user's id, and asserts SELECT returns only that user's rows. Runnable via `npx supabase test db`. Directly verifies the PRD NFR ("readable only by that user").

### Changes Required:

#### 1. New file: `supabase/tests/rls_isolation.sql`

**File**: `supabase/tests/rls_isolation.sql`

**Intent**: Cheap automated assertion that the RLS policies introduced in Phase 1 actually isolate users. Runs as part of `supabase test db` so any future migration that breaks isolation fails CI loudly rather than silently. Uses `plan()`/`results_eq()` pgTAP idioms (Supabase ships pgTAP locally).

**Contract**:

- The test creates two synthetic users with known UUIDs in `auth.users`.
- It inserts one recipe per user via direct SQL (bypassing RLS as the postgres role for setup).
- It then sets `request.jwt.claims` to each user in turn (`set local request.jwt.claims = '{"sub": "<uuid>", "role": "authenticated"}'`) and `set local role authenticated`.
- It asserts each authenticated session can read exactly one recipe (their own), zero of the other user's.
- It asserts the second user's session attempting `update recipes set name = 'hacked' where user_id = '<user-1-uuid>'` affects zero rows.
- It asserts the second user attempting `select * from schedule_days where exists (select 1 from schedules where schedules.user_id = '<user-1-uuid>')` returns zero rows.
- The test cleans up the synthetic users at the end (rolls back via transaction or `truncate auth.users cascade` in the test setup).

**Contract — the assertion vocabulary**: pgTAP functions are available locally — `plan(N)`, `is(actual, expected, description)`, `results_eq(query, expected_rows, description)`, `lives_ok(sql, description)`, `throws_ok(sql, sqlstate, description)`. Use these rather than ad-hoc `raise exception` blocks so failures report cleanly through `supabase test db`.

### Success Criteria:

#### Automated Verification:

- `npx supabase test db` runs and reports green for the new file
- `npm run lint` still passes (test SQL does not affect TS lint)
- A deliberate corruption (e.g. temporarily replacing `auth.uid() = user_id` with `true` in the policy) makes the test fail — confirms the test would catch a real RLS regression. Revert the corruption after the check.

#### Manual Verification:

- Read the test file end-to-end and confirm the assertions cover: own-row read, cross-user read denial, cross-user update denial, cross-user `schedule_days` denial through the parent.
- Confirm the test cleans up synthetic users so re-running `supabase test db` is idempotent.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the manual testing was successful before the change is considered ready for `/10x-implement` handoff to S-01.

---

## Testing Strategy

### Unit Tests:

- No TS unit tests in F-01 — the only code shipped is type definitions and SQL. Type correctness is verified by the type checker via `npx astro sync && npm run lint`.

### Integration Tests:

- The SQL smoke test in Phase 4 is the integration test for RLS isolation. It runs against the local Supabase stack with the migrations applied — equivalent to a hermetic, real-database integration test.

### Manual Testing Steps:

1. With local Supabase running, sign up two test accounts (`a@test.local` / `b@test.local`).
2. As user A, insert a recipe via Studio's authenticated SQL session — confirm the row appears in `recipes` with `user_id = <A's uuid>`.
3. Switch to user B's authenticated session, run `select * from recipes` — confirm zero rows.
4. Call `select create_schedule(...)` as user A with 7 of their own recipe ids — confirm it returns a uuid and 7 `schedule_days` rows exist with that `schedule_id`.
5. Call `select create_schedule(...)` as user B with user A's recipe ids — confirm it raises (FK violation under RLS, since user B cannot see user A's recipes).
6. Delete one of user A's recipes — confirm the corresponding `schedule_days.recipe_id` becomes NULL (the FR-007 cascade).

## Performance Considerations

- Indexes on `recipes(user_id)` and `schedules(user_id, created_at desc)` cover every read path F-01 enables. MVP traffic is "small" per PRD; no additional tuning needed.
- The `create_schedule` RPC is a single round-trip; expected cost is well under the Cloudflare Workers free-tier 10 ms CPU budget per `infrastructure.md`.
- No N+1 risk in `ScheduleWithDays` queries — Supabase's relational select returns the joined shape in one request.

## Migration Notes

- Apply Phase 1's migration first, Phase 2's second. The timestamp prefix on each filename guarantees order.
- Local: `npx supabase db reset` re-applies all migrations from scratch — use this any time the schema is in flux.
- Cloud: `npx supabase db push` after both phases land. **Supabase migrations do not roll back automatically** (`infrastructure.md`); each migration's header comment includes the reverse DDL so a human can revert manually if needed.
- There is no existing data to migrate — F-01 is greenfield.

## References

- Foundation roadmap: `context/foundation/roadmap.md` (F-01 section)
- Product requirements: `context/foundation/prd.md` (FR-005, FR-007, FR-008, FR-009, NFR data-isolation, Business Logic, Guardrail)
- Tech stack: `context/foundation/tech-stack.md`
- Infrastructure constraints: `context/foundation/infrastructure.md` (workerd runtime, migration rollback note)
- Lessons: `context/foundation/lessons.md`
- Existing Supabase client: `src/lib/supabase.ts`
- Auth locals typing: `src/env.d.ts`
- Project conventions: `CLAUDE.md` (RLS tripwire, migration naming, types location)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema migration — enum, tables, RLS

#### Automated

- [x] 1.0 Empty `supabase/seed.sql` created (CLI prerequisite) — 2cb25ca
- [x] 1.1 Migration applies on a fresh local DB: `npx supabase db reset` — 2cb25ca
- [x] 1.3 Lint passes: `npm run lint` — 2cb25ca
- [x] 1.4 Astro sync runs: `npx astro sync` — 2cb25ca

#### Manual

- [x] 1.2 DDL spot-check: `npx supabase db dump --local --schema public` shows tables, enum, indexes, and policies — 2cb25ca
- [x] 1.5 Confirm `recipes`, `schedules`, `schedule_days` tables exist under `public` in Studio — 2cb25ca
- [x] 1.6 Confirm RLS is enabled on each table in Studio — 2cb25ca
- [x] 1.7 Confirm the `category` enum exists with the six values in declared order — 2cb25ca
- [x] 1.8 Cross-user SELECT returns zero rows when a second user queries the first user's recipes — 2cb25ca
- [x] 1.9 `moddatetime` trigger works: updating a recipe name changes `updated_at` to a timestamp newer than `created_at` — 2cb25ca

### Phase 2: `create_schedule` RPC migration

#### Automated

- [x] 2.1 Migration applies on a fresh DB: `npx supabase db reset` — 04ac255
- [x] 2.2 Function exists: `select proname from pg_proc where proname = 'create_schedule';` returns one row — 04ac255
- [x] 2.3 Lint passes: `npm run lint` — 04ac255

#### Manual

- [x] 2.4 `select create_schedule(array[...]::uuid[])` returns a UUID with a test user's JWT claims set — 04ac255
- [x] 2.5 `select count(*) from schedule_days where schedule_id = '<returned-uuid>'` is exactly 7 — 04ac255
- [x] 2.6 Passing fewer than 7 ids raises the `array_length` guard exception — 04ac255

### Phase 3: TypeScript domain types

#### Automated

- [x] 3.1 File `src/types.ts` exists and every export imports cleanly — 02a2407
- [x] 3.2 Type check passes: `npx astro sync && npm run lint` — 02a2407
- [x] 3.3 Prettier-clean: `npm run format` produces no diff — 02a2407

#### Manual

- [x] 3.4 Every field in `src/types.ts` uses snake_case matching PostgREST shape — 02a2407
- [x] 3.5 `CATEGORIES` ordering matches the enum's declared order in the Phase 1 migration — 02a2407

### Phase 4: RLS isolation smoke test

#### Automated

- [x] 4.1 `npx supabase test db` runs and reports green for `supabase/tests/rls_isolation.sql`
- [x] 4.2 `npm run lint` still passes
- [x] 4.3 Deliberately corrupting the RLS policy (e.g. replacing `auth.uid() = user_id` with `true`) makes the test fail; revert after the check

#### Manual

- [x] 4.4 Assertions cover own-row read, cross-user read denial, cross-user update denial, cross-user `schedule_days` denial through the parent
- [x] 4.5 Test cleans up synthetic users; re-running `supabase test db` is idempotent
