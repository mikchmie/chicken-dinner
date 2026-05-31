-- Migration: create_recipes_schedules_schema
-- Created: 2026-05-31
--
-- Rollback DDL (reverse-creation order, manual apply if needed):
--   drop trigger if exists set_recipes_updated_at on public.recipes;
--   drop policy if exists schedule_days_owner_all on public.schedule_days;
--   drop policy if exists schedules_owner_all on public.schedules;
--   drop policy if exists recipes_owner_all on public.recipes;
--   drop table if exists public.schedule_days;
--   drop table if exists public.schedules;
--   drop table if exists public.recipes;
--   drop type if exists public.category;
--   drop extension if exists moddatetime;

-- ---------------------------------------------------------------------------
-- 0. moddatetime extension (auto-maintains updated_at on UPDATE)
-- ---------------------------------------------------------------------------
create extension if not exists moddatetime with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. category enum — closed list of six values locked by PRD Business Logic
-- ---------------------------------------------------------------------------
create type public.category as enum (
  'chicken',
  'pork',
  'beef',
  'leguminous',
  'eggs',
  'vegetables'
);

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table public.recipes (
  id          uuid                primary key default gen_random_uuid(),
  user_id     uuid                not null references auth.users(id) on delete cascade,
  name        text                not null check (char_length(name) between 1 and 200),
  category    public.category     not null,
  created_at  timestamptz         not null default now(),
  updated_at  timestamptz         not null default now()
);

create table public.schedules (
  id          uuid                primary key default gen_random_uuid(),
  user_id     uuid                not null references auth.users(id) on delete cascade,
  created_at  timestamptz         not null default now()
);

create table public.schedule_days (
  schedule_id uuid                not null references public.schedules(id) on delete cascade,
  day_index   smallint            not null check (day_index between 0 and 6),
  recipe_id   uuid                         references public.recipes(id) on delete set null,
  primary key (schedule_id, day_index)
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
create index recipes_user_id_idx
  on public.recipes (user_id);

create index schedules_user_id_created_at_idx
  on public.schedules (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. moddatetime trigger — keeps recipes.updated_at current on every UPDATE
-- ---------------------------------------------------------------------------
create trigger set_recipes_updated_at
  before update on public.recipes
  for each row
  execute procedure extensions.moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 5. Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.recipes       enable row level security;
alter table public.schedules     enable row level security;
alter table public.schedule_days enable row level security;

-- recipes: owner sees and modifies only their own rows
create policy recipes_owner_all on public.recipes
  for all
  to authenticated
  using       (auth.uid() = user_id)
  with check  (auth.uid() = user_id);

-- schedules: owner sees and modifies only their own rows
create policy schedules_owner_all on public.schedules
  for all
  to authenticated
  using       (auth.uid() = user_id)
  with check  (auth.uid() = user_id);

-- schedule_days: scoped through parent schedules row (no user_id column here)
create policy schedule_days_owner_all on public.schedule_days
  for all
  to authenticated
  using (
    exists (
      select 1 from public.schedules s
      where  s.id = schedule_days.schedule_id
      and    s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.schedules s
      where  s.id = schedule_days.schedule_id
      and    s.user_id = auth.uid()
    )
  );
