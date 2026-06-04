-- Migration: create_schedule_rpc
-- Created: 2026-05-31
--
-- Rollback DDL (manual apply if needed):
--   revoke execute on function public.create_schedule(uuid[]) from authenticated;
--   drop function if exists public.create_schedule(uuid[]);

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
    raise exception 'create_schedule requires exactly 7 recipe ids, got %',
      coalesce(array_length(p_day_recipe_ids, 1), 0);
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
