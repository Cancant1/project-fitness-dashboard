// "Fits what's left" on the Food page: foods from his list that close today's gaps without running past the kcal
// target. Two modes:
// - protein still short (> 10 g): protein-dense foods first;
// - protein met: a simple carb snack (candy, a bit of chocolate, fruit), not another protein tub.
// Pure; the page passes today's totals and target.

import type { Food, FoodEntry } from "../data/types";

export interface Gaps { kcal: number; protein: number; carbs: number | null; fat: number | null }

export interface Suggestion {
  food: Food;
  quantity: number;
  kcal: number; protein: number; carbs: number | null; fat: number | null;
}

/** Below this many kcal left the day counts as done: no suggestions. */
export const DONE_KCAL = 80;
/** A suggestion may run this far past the kcal left. */
const KCAL_SLACK = 60;
/** Protein short by more than this: protein mode. */
const PROTEIN_SHORT = 10;
/** A snack: at most this many kcal per pick. */
const SNACK_KCAL = 250;
/** Small pieces (a winegum, a zure auto): suggest a handful of about this many kcal. */
const HANDFUL_KCAL = 150;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** How often each food was ever logged (his own foods first). */
function usage(entries: FoodEntry[], today: string): Map<string, number> {
  const n = new Map<string, number>();
  for (const e of entries) if (e.food_id && !e.deleted_at && e.date <= today) n.set(e.food_id, (n.get(e.food_id) ?? 0) + 1);
  return n;
}

/** Duplicates in the list ("Jumbo Fruitstick Citroen" twice, one without carbs): keep the most complete one. */
function dedupe(foods: Food[]): Food[] {
  const best = new Map<string, Food>();
  const filled = (f: Food) => Number(f.carbs != null && f.carbs > 0) + Number(f.fat != null) + Number(f.favorite) * 2;
  for (const f of foods) {
    const k = norm(f.name);
    const cur = best.get(k);
    if (!cur || filled(f) > filled(cur)) best.set(k, f);
  }
  return [...best.values()];
}

/** Servings to suggest: 1; a handful of small pieces; half of a weighed food that would run over; 0 = doesn't fit. */
function quantityFor(food: Food, kcalLeft: number): number {
  const room = kcalLeft + KCAL_SLACK;
  if (food.kcal < 60) {
    const max = food.kcal < 20 ? 10 : 2;
    const q = Math.max(1, Math.min(max, Math.round(Math.min(kcalLeft, HANDFUL_KCAL) / food.kcal)));
    return q * food.kcal <= room ? q : 1;
  }
  if (food.kcal <= room) return 1;
  return food.servings?.[0]?.grams != null && food.kcal / 2 <= room ? 0.5 : 0;
}

export function suggestFoods(args: { foods: Food[]; entries: FoodEntry[]; today: string; left: Gaps; count?: number }): Suggestion[] {
  const { foods, entries, today, left, count = 3 } = args;
  if (left.kcal < DONE_KCAL) return [];
  const used = usage(entries, today);
  const eatenToday = new Set(entries.filter((e) => e.date === today && !e.deleted_at && e.food_id).map((e) => e.food_id!));
  const proteinMode = left.protein > PROTEIN_SHORT;
  const fill = (have: number, gap: number) => (gap > 0 ? Math.min(have, gap) / gap : 0);
  const out: (Suggestion & { score: number })[] = [];

  for (const food of dedupe(foods.filter((f) => !f.archived && !f.deleted_at && f.kcal > 0))) {
    const familiar = (used.get(food.id) ?? 0) + (food.favorite ? 3 : 0);
    const proteinShare = (food.protein * 4) / food.kcal;
    const carbShare = food.carbs != null ? (food.carbs * 4) / food.kcal : 0;
    // Fat-heavy foods (a burger, slavinken, crisps) never fill a gap well on a lean bulk.
    if (food.fat != null && (food.fat * 9) / food.kcal > 0.45) continue;
    // The pool: what he eats, plus list foods that suit the mode.
    const suits = proteinMode ? proteinShare >= 0.3 : carbShare >= 0.5 && food.kcal <= SNACK_KCAL;
    if (!familiar && !suits) continue;
    const q = quantityFor(food, left.kcal);
    if (!q) continue;
    const s = {
      kcal: food.kcal * q, protein: food.protein * q,
      carbs: food.carbs == null ? null : food.carbs * q, fat: food.fat == null ? null : food.fat * q
    };
    let score = 0;
    if (proteinMode) {
      // Lean protein beats a burger that happens to fill the numbers.
      score += 2 * fill(s.protein, left.protein) + fill(s.kcal, left.kcal) + proteinShare;
      score += left.carbs != null && left.carbs > 0 && s.carbs != null ? 0.75 * fill(s.carbs, left.carbs) : 0;
    } else {
      // Carbs are what's left: a carb snack of a normal size (about 200 kcal, less if less is left); protein-heavy
      // foods are the wrong pick.
      const size = Math.min(left.kcal, 200);
      score += carbShare + 0.6 * Math.max(0, 1 - Math.abs(s.kcal - size) / size);
      if (proteinShare > 0.2) score -= 2 * proteinShare;
    }
    // Fat already at or past its goal: penalise fat-heavy picks.
    if (left.fat != null && s.fat != null && s.fat > Math.max(0, left.fat)) score -= (s.fat - Math.max(0, left.fat)) / 20;
    score += (Math.min(familiar, 10) / 10) * 0.5; // what he eats (and favourites) first
    if (eatenToday.has(food.id) && food.kcal > SNACK_KCAL) score -= 0.5; // no second meal of the same; snacks may repeat
    out.push({ food, quantity: q, ...s, score });
  }
  // Variety: no two of the same kind (three skyrs) or the same numbers under two names (two identical ice lollies).
  const picked: (Suggestion & { score: number })[] = [];
  const kinds = new Set<string>(), sigs = new Set<string>();
  for (const x of out.sort((a, b) => b.score - a.score)) {
    const kind = kindOf(x.food.name), sig = `${x.food.kcal}|${x.food.carbs}|${x.food.protein}`;
    if (kinds.has(kind) || sigs.has(sig)) continue;
    kinds.add(kind); sigs.add(sig); picked.push(x);
    if (picked.length === count) break;
  }
  return picked.map(({ score: _s, ...x }) => x);
}

const BRANDS = new Set(["ah", "jumbo", "arla", "alra", "bulk", "mcd", "mcdonalds", "kfc", "de", "het", "1", "2"]);
/** "Skyr Arla Vanille" → "skyr"; "Jumbo Fruitstick Citroen" → "fruitstick"; "1 Zure auto" → "zure". */
function kindOf(name: string): string {
  return norm(name).split(" ").find((w) => w && !BRANDS.has(w) && !/^\d+$/.test(w)) ?? norm(name);
}
