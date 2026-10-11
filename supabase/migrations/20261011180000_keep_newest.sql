-- Newer edit wins: an update carrying an older updated_at than the stored row is skipped.
-- Protects against a device that was offline pushing stale changes over newer ones.
-- Named a_* so it runs before the <table>_touch trigger (Postgres fires triggers alphabetically).

create or replace function public.keep_newest()
returns trigger language plpgsql as $$
begin
  if new.updated_at < old.updated_at then
    return null;  -- skip this row's update
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','exercises','programs','program_weeks','program_days','program_slots','training_maxes',
    'sessions','sets','pain_checks','swap_overrides','conditioning',
    'body_measurements','foods','food_entries','saved_meals','nutrition_targets','nutrition_days',
    'annotations','facts','health_daily'
  ] loop
    execute format('drop trigger if exists a_keep_newest on public.%I', t);
    execute format('create trigger a_keep_newest before update on public.%I
                    for each row execute function public.keep_newest()', t);
  end loop;
end $$;
