-- Protein target that follows bodyweight: grams per kg of the 7-day average weight.
-- When set, the app uses protein_per_kg × 7-day average and treats `protein` as the fallback.
alter table public.nutrition_targets add column if not exists protein_per_kg numeric;
