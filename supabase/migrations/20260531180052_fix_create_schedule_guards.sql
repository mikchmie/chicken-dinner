-- Migration: fix_create_schedule_guards
-- Created: 2026-05-31
--
-- Adds two defence-in-depth guards to create_schedule:
--   1. auth.uid() IS NULL check — produces a clear error if called without JWT
--   2. Recipe ownership check — prevents cross-user recipe UUID injection
--      (PostgreSQL FK checks bypass RLS; this closes that integrity gap)
--
-- Rollback DDL (manual apply if needed):
--   drop function if exists public.create_schedule(uuid[]);
--   (then restore the previous version from the p2 migration)

create or replace function public.create_schedule(p_day_recipe_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_schedule_id uuid;
begin
  if auth.uid() is null then
    raise exception 'create_schedule: caller must be authenticated';
  end if;

  if array_length(p_day_recipe_ids, 1) is distinct from 7 then
    raise exception 'create_schedule requires exactly 7 recipe ids, got %',
      coalesce(array_length(p_day_recipe_ids, 1), 0);
  end if;

  if exists (
    select 1 from unnest(p_day_recipe_ids) as rid
    where rid is not null
      and not exists (
        select 1 from public.recipes r
        where r.id = rid and r.user_id = auth.uid()
      )
  ) then
    raise exception 'create_schedule: one or more recipe ids do not belong to the current user';
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
