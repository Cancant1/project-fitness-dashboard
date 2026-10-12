-- Sunday rounds note says "count skips (or distance)": a distance like 0,8 must fit. Was int, which refused it and
-- (before the sync fix) blocked every later push.
alter table public.conditioning
  alter column rounds type numeric,
  alter column first_round_count type numeric,
  alter column last_round_count type numeric;
