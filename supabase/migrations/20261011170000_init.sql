-- Reps — initial schema.
--
-- Conventions (every table):
--   id                uuid, generated on the device so rows can be created offline
--   user_id           owner; row-level security limits every query to auth.uid()
--   created_at        set on the device
--   updated_at        set on the device on every change; newer wins when two devices edit one row
--   server_updated_at set by the database on every write; the sync cursor ("give me what changed since X")
--   deleted_at        soft delete; rows are never removed by the app (no DELETE grant)
--
-- Units: load is stored as entered (load + unit) and as canonical kilograms (load_kg).
-- For bodyweight exercises load_kg is the added weight (0 = bodyweight only, negative = assistance).

create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ helpers

create or replace function public.touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

-- Applies the standard columns' trigger, RLS policies and grants to one table.
create or replace function public.reps_setup_table(t text)
returns void language plpgsql as $$
begin
  execute format('create index if not exists %1$s_sync_idx on public.%1$I (user_id, server_updated_at)', t);
  execute format('drop trigger if exists %1$s_touch on public.%1$I', t);
  execute format('create trigger %1$s_touch before insert or update on public.%1$I
                  for each row execute function public.touch_server_updated_at()', t);
  execute format('alter table public.%1$I enable row level security', t);
  execute format('drop policy if exists "own rows: select" on public.%1$I', t);
  execute format('drop policy if exists "own rows: insert" on public.%1$I', t);
  execute format('drop policy if exists "own rows: update" on public.%1$I', t);
  execute format('create policy "own rows: select" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
  execute format('create policy "own rows: insert" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
  execute format('create policy "own rows: update" on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  execute format('revoke all on public.%1$I from anon, authenticated', t);
  execute format('grant select, insert, update on public.%1$I to authenticated', t);
  execute format('grant all on public.%1$I to service_role', t);  -- one-off history import only
end $$;

-- ------------------------------------------------------------------ people

create table if not exists public.profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users(id) on delete cascade default auth.uid(),
  display_name      text not null default '',
  timezone          text not null default 'Europe/Amsterdam',
  plates_kg         numeric[] not null default '{20,10,5,2.5,1.25}',  -- per side, what the gym has
  bar_kg            numeric not null default 20,
  dumbbells_kg      numeric[] not null default '{2,4,6,8,10,12,14,16,18,20,22.5,25,27.5,30,32.5,35,37.5,40,42.5,45,47.5,50}',
  cable_step_lb     numeric not null default 5,
  settings          jsonb not null default '{}'::jsonb,               -- timers, theme, macro visibility, …
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

-- A profile row appears for every new login.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ exercises

create table if not exists public.exercises (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name              text not null,
  aliases           text[] not null default '{}',
  equipment         text,                                  -- barbell, dumbbell, cable, bodyweight, machine, …
  default_unit      text not null default 'kg' check (default_unit in ('kg','lb','bodyweight','min','reps')),
  kind              text not null default 'isolation' check (kind in ('main','compound','isolation','conditioning','mobility')),
  muscle_direct     text,
  muscle_indirect   text[] not null default '{}',
  available         boolean not null default true,         -- at the current gym
  cues              text,
  archived          boolean not null default false,
  legacy_ref        jsonb not null default '{}'::jsonb,    -- ids/names in the old app and data/
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index if not exists exercises_user_name_uq on public.exercises (user_id, lower(name)) where deleted_at is null;

-- ------------------------------------------------------------------ programmes

create table if not exists public.programs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name              text not null,
  start_date        date not null,
  weeks             int not null,
  status            text not null default 'active' check (status in ('draft','active','completed','archived')),
  rules             jsonb not null default '{}'::jsonb,     -- TM formula, week-type tables, TM change table, load steps
  goals             jsonb not null default '[]'::jsonb,     -- [{exercise_id, load_kg, reps}]
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table if not exists public.program_weeks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  program_id        uuid not null references public.programs(id) on delete cascade,
  week_no           int not null,
  start_date        date not null,
  week_type         text not null,                          -- calibration, A, B, C, D, deload, taper, test
  label             text,
  checkpoint        jsonb,                                  -- {squat_tm: 145, deadlift_tm: 210, bodyweight: 74.5}
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (program_id, week_no)
);

create table if not exists public.program_days (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  program_id        uuid not null references public.programs(id) on delete cascade,
  day_key           text not null,                          -- lower_a, upper_a, lower_b, upper_b, ride, boxing, rounds
  weekday           int not null check (weekday between 1 and 7),  -- 1 = Monday
  title             text not null,
  kind              text not null default 'lifting' check (kind in ('lifting','conditioning','rest')),
  est_minutes       int,
  position          int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (program_id, day_key)
);

create table if not exists public.program_slots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  program_day_id    uuid not null references public.program_days(id) on delete cascade,
  exercise_id       uuid not null references public.exercises(id),
  position          int not null,
  role              text not null check (role in ('main','compound','isolation','shoulder','conditioning')),
  scheme            jsonb not null default '{}'::jsonb,     -- per week type: sets, reps, % TM, rep-out target
  start_load        numeric,
  unit              text not null default 'kg',
  rest_seconds      int,
  last_set_rep_out  boolean not null default false,
  to_failure        boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table if not exists public.training_maxes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  exercise_id       uuid not null references public.exercises(id),
  program_id        uuid references public.programs(id),
  effective_date    date not null,
  value_kg          numeric not null,
  reason            text not null check (reason in ('start','calibration','rep_out','checkpoint','missed_weeks','manual')),
  source_set_id     uuid,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

-- ------------------------------------------------------------------ training log

create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date              date not null,
  title             text,
  status            text not null default 'completed' check (status in ('planned','in_progress','completed','skipped','discarded')),
  started_at        timestamptz,
  ended_at          timestamptz,
  duration_min      int,
  program_id        uuid references public.programs(id),
  program_week_no   int,
  program_day_id    uuid references public.program_days(id),
  energy            int check (energy between 1 and 10),
  notes             text,
  date_confidence   text not null default 'exact' check (date_confidence in ('exact','week known','estimated')),
  date_basis        text,
  source            text not null default 'app',             -- app, reps-v2, sheet:<block name>
  legacy_ref        jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists sessions_user_date_idx on public.sessions (user_id, date);

create table if not exists public.sets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  session_id        uuid not null references public.sessions(id) on delete cascade,
  exercise_id       uuid not null references public.exercises(id),
  exercise_position int not null default 0,                 -- order of the exercise in the session
  set_no            int not null default 1,
  kind              text not null default 'working' check (kind in ('warmup','working','rep_out','top','backoff','failure','drop','timed')),
  load              numeric,                                -- as entered
  unit              text not null default 'kg' check (unit in ('kg','lb','bodyweight','min','reps')),
  load_kg           numeric,                                -- canonical
  reps              numeric,
  duration_s        int,
  rpe               numeric,                                -- history only; the plan does not use RPE
  target_reps       text,
  target_load       numeric,
  completed         boolean not null default true,
  flags             text[] not null default '{}',           -- see data/docs: load_outlier_check, doubtful_*, …
  note              text,
  exercise_as_logged text,
  legacy_ref        jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists sets_session_idx on public.sets (session_id);
create index if not exists sets_user_exercise_idx on public.sets (user_id, exercise_id);

create table if not exists public.pain_checks (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date              date not null,
  site              text not null,                          -- right_elbow, right_shoulder, …
  exercise_id       uuid references public.exercises(id),
  session_id        uuid references public.sessions(id),
  during_set        text check (during_set in ('none','ache','sharp')),
  next_morning      text check (next_morning in ('normal','sore')),
  worse_than_last   boolean,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table if not exists public.swap_overrides (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  exercise_id       uuid not null references public.exercises(id),
  replacement_id    uuid not null references public.exercises(id),
  until_date        date,
  reason            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table if not exists public.conditioning (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date              date not null,
  kind              text not null check (kind in ('ride','boxing','rounds','walk','other')),
  minutes           numeric,
  loop_time_s       int,
  rounds            int,
  first_round_count int,
  last_round_count  int,
  done              boolean not null default true,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

-- ------------------------------------------------------------------ body and food

create table if not exists public.body_measurements (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date              date not null,
  kind              text not null default 'weight' check (kind in ('weight','waist','other')),
  value             numeric not null,
  unit              text not null default 'kg' check (unit in ('kg','lb','cm','in')),
  note              text,
  source            text not null default 'app',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index if not exists body_one_per_day_uq on public.body_measurements (user_id, date, kind) where deleted_at is null;

create table if not exists public.foods (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name              text not null,
  brand             text,
  category          text,
  servings          jsonb not null default '[]'::jsonb,     -- [{id, label, amount, unit, grams}]
  kcal              numeric not null,                       -- per first serving
  protein           numeric not null,
  carbs             numeric,
  fat               numeric,
  favorite          boolean not null default false,
  archived          boolean not null default false,
  source            text not null default 'manual',          -- catalog, manual, reps-v2
  legacy_ref        jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table if not exists public.food_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date              date not null,
  time              time,
  meal              text check (meal in ('breakfast','lunch','dinner','snacks','other')),
  food_id           uuid references public.foods(id),
  name              text not null,                          -- snapshot
  serving_label     text,
  quantity          numeric not null default 1,
  kcal              numeric not null,
  protein           numeric not null,
  carbs             numeric,
  fat               numeric,
  note              text,
  legacy_ref        jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists food_entries_user_date_idx on public.food_entries (user_id, date);

create table if not exists public.saved_meals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name              text not null,
  default_meal      text,
  items             jsonb not null default '[]'::jsonb,     -- food entry snapshots
  position          int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table if not exists public.nutrition_targets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  effective_from    date not null,
  phase             text,                                   -- lean bulk, cut, maintain
  kcal              numeric not null,
  protein           numeric not null,
  carbs             numeric,
  fat               numeric,
  per_weekday       jsonb,                                  -- optional {"mon": {kcal, protein}, …}
  target_weight     numeric,
  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

-- Day totals typed in without item detail (old workbook/app overrides).
create table if not exists public.nutrition_days (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date              date not null,
  kcal              numeric,
  protein           numeric,
  carbs             numeric,
  fat               numeric,
  note              text,
  source            text not null default 'app',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index if not exists nutrition_days_uq on public.nutrition_days (user_id, date) where deleted_at is null;

-- ------------------------------------------------------------------ notes and facts

create table if not exists public.annotations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind              text not null check (kind in ('pr','deload','injury','travel','sick','form_change','note','holiday')),
  date              date,
  end_date          date,
  exercise_id       uuid references public.exercises(id),
  session_id        uuid references public.sessions(id),
  text              text not null,
  status            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

create table if not exists public.facts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind              text not null check (kind in ('lifetime_pr','injury','programming_rule','roadmap','equipment','other')),
  title             text not null,
  value             jsonb not null default '{}'::jsonb,
  source            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);

-- Apple Watch daily summary (iOS Shortcut, later).
create table if not exists public.health_daily (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date              date not null,
  sleep_total_min   int,
  sleep_deep_min    int,
  sleep_rem_min     int,
  sleep_core_min    int,
  sleep_awake_min   int,
  resting_hr        int,
  hrv_sdnn_ms       numeric,
  source            text not null default 'ios-shortcut',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index if not exists health_daily_uq on public.health_daily (user_id, date) where deleted_at is null;

-- ------------------------------------------------------------------ apply conventions

select public.reps_setup_table(t) from unnest(array[
  'profiles','exercises','programs','program_weeks','program_days','program_slots','training_maxes',
  'sessions','sets','pain_checks','swap_overrides','conditioning',
  'body_measurements','foods','food_entries','saved_meals','nutrition_targets','nutrition_days',
  'annotations','facts','health_daily'
]) as t;

-- The helper is only for migrations.
revoke all on function public.reps_setup_table(text) from public, anon, authenticated;
