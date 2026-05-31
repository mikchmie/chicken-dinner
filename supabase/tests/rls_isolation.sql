-- RLS isolation smoke test for F-01 schema.
--
-- Verifies that the per-user RLS policies on recipes, schedules, and
-- schedule_days prevent cross-user reads and writes. Wrapped in a
-- transaction that rolls back at the end so the test is idempotent.

begin;

select plan(5);

-- -------------------------------------------------------------------------
-- Setup (running as postgres superuser — bypasses RLS for insert)
-- -------------------------------------------------------------------------

insert into auth.users (
  id, email, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  aud, role, email_confirmed_at
) values
  (
    '00000000-0000-0000-0000-000000000001'::uuid,
    'a@test.local', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    'authenticated', 'authenticated', now()
  ),
  (
    '00000000-0000-0000-0000-000000000002'::uuid,
    'b@test.local', now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    'authenticated', 'authenticated', now()
  );

insert into public.recipes (id, user_id, name, category) values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Recipe A', 'chicken'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid,
    'Recipe B', 'pork'
  );

insert into public.schedules (id, user_id) values
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );

insert into public.schedule_days (schedule_id, day_index) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 0),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 1),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 2),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 3),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 4),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 5),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 6);

-- -------------------------------------------------------------------------
-- Simulate authenticated session for user A
-- -------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- T1: user A sees exactly their own recipe
select is(
  (select count(*)::int from public.recipes),
  1,
  'user A: count(recipes) = 1 (own row only)'
);

-- T2: user A cannot read user B's recipe directly
select is(
  (select count(*)::int from public.recipes
   where user_id = '00000000-0000-0000-0000-000000000002'),
  0,
  'user A: cross-user read = 0 rows'
);

-- -------------------------------------------------------------------------
-- Switch to user B (still authenticated role, change JWT sub)
-- -------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';

-- T3: user B sees exactly their own recipe
select is(
  (select count(*)::int from public.recipes),
  1,
  'user B: count(recipes) = 1 (own row only)'
);

-- T4: user B UPDATE on user A recipes affects 0 rows.
-- Data-modifying CTEs cannot be used as function arguments, so we run the
-- UPDATE as a plain statement, then verify from superuser that the name is
-- unchanged — which proves user B's write had no effect.
update public.recipes
set name = 'hacked'
where user_id = '00000000-0000-0000-0000-000000000001';

reset role;  -- back to superuser to read the authoritative name

select is(
  (select name from public.recipes
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Recipe A',
  'user B: cross-user UPDATE had no effect (name still Recipe A)'
);

-- T5: user B cannot see user A schedule_days (scoped through parent)
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.schedule_days
   where schedule_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  0,
  'user B: cross-user schedule_days read = 0 rows'
);

-- -------------------------------------------------------------------------
-- Cleanup: rollback removes all test data (idempotent re-runs)
-- -------------------------------------------------------------------------

reset role;

select * from finish();

rollback;
