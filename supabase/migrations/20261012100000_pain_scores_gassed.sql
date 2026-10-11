-- Research round 1 (docs/R1_BUILD.md, E14 and E22). Additive only: old rows keep their values.
--
-- E14 pain 0–10 (J-PAINRULE): the worst pain during the exercise and the next-morning pain, per site.
-- during_set / next_morning stay for old rows; new writes set them too (sharp flag → sharp, score ≥ 1 → ache;
-- morning score ≥ the site's baseline + 2 → sore).
alter table public.pain_checks add column if not exists pain_score smallint
  check (pain_score is null or pain_score between 0 and 10);
alter table public.pain_checks add column if not exists morning_score smallint
  check (morning_score is null or morning_score between 0 and 10);

-- E22 boxing (C-SPARRING): "Gassed? 1–5" on the Thursday boxing row; the fade round goes in `rounds`.
alter table public.conditioning add column if not exists rating smallint
  check (rating is null or rating between 1 and 5);
