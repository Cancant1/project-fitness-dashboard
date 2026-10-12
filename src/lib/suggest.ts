// "Fits what's left" on the Food page: foods he already eats that close today's gaps (protein first, then energy and
// carbs) without running past the kcal target or piling on more fat. Pure; the page passes today's totals and target.

import type { Food, FoodEntry } from "../data/types";
import { daysBetween } from "./format";

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

/** How often each food was logged in the 60 days before `today` (familiar foods first). */
function usage(entries: FoodEntry[], today: string): Map<string, number> {
  const n = new Map<string, number>();
  for (const e of entries) {
    if (!e.food_id || e.deleted_at || e.date > today || daysBetween(e.date, today) > 60) continue;
    n.set(e.food_id, (n.get(e.food_id) ?? 0) + 1);
  }
  return n;
}

export function suggestFoods(args: { foods: Food[]; entries: FoodEntry[]; today: string; left: Gaps; count?: number }): Suggestion[] {
  const { foods, entries, today, left, count = 3 } = args;
  if (left.kcal < DONE_KCAL) return [];
  const used = usage(entries, today);
  const eatenToday = new Set(entries.filter((e) => e.date === today && !e.deleted_at && e.food_id).map((e) => e.food_id!));
  const out: (Suggestion & { score: number })[] = [];

  for (const food of foods) {
    if (food.archived || food.deleted_at || !(food.kcal > 0)) continue;
    const familiar = (used.get(food.id) ?? 0) + (food.favorite ? 3 : 0);
    if (!familiar) continue; // only foods he actually eats
    // One serving, or half of a weighed one (a 450 g pot, not half a burger) when a whole one runs past the kcal left.
    const halvable = food.servings?.[0]?.grams != null;
    const q = food.kcal <= left.kcal + KCAL_SLACK ? 1 : halvable && food.kcal / 2 <= left.kcal + KCAL_SLACK ? 0.5 : 0;
    if (!q) continue;
    const s = {
      kcal: food.kcal * q, protein: food.protein * q,
      carbs: food.carbs == null ? null : food.carbs * q, fat: food.fat == null ? null : food.fat * q
    };
    const fill = (have: number, gap: number) => (gap > 0 ? Math.min(have, gap) / gap : 0);
    let score = 0;
    // Protein still short: it counts double.
    score += left.protein > 5 ? 2 * fill(s.protein, left.protein) : 0;
    score += fill(s.kcal, left.kcal);
    score += left.carbs != null && left.carbs > 0 && s.carbs != null ? 0.75 * fill(s.carbs, left.carbs) : 0;
    // Fat already at or past its target: penalise fat-heavy picks.
    if (left.fat != null && s.fat != null && s.fat > Math.max(0, left.fat)) score -= (s.fat - Math.max(0, left.fat)) / 20;
    score += Math.min(familiar, 10) / 40; // tie-break: what he eats most
    if (eatenToday.has(food.id)) score -= 0.5; // variety: not the same thing again
    out.push({ food, quantity: q, ...s, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, count).map(({ score: _s, ...x }) => x);
}
