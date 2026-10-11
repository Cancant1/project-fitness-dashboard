import type { FoodEntry, NutritionDay, NutritionTarget } from "../data/types";

export interface DayTotals { kcal: number; protein: number; carbs: number | null; fat: number | null; source: "items" | "day" | "none" }

/** Item-level entries win; a typed-in day total (old workbook/app overrides) is the fallback. */
export function dayTotals(date: string, entries: FoodEntry[], days: NutritionDay[]): DayTotals {
  const items = entries.filter((e) => e.date === date);
  if (items.length) {
    const sum = (k: "carbs" | "fat") => items.some((i) => i[k] != null) ? items.reduce((s, i) => s + (i[k] ?? 0), 0) : null;
    return { kcal: items.reduce((s, i) => s + i.kcal, 0), protein: items.reduce((s, i) => s + i.protein, 0), carbs: sum("carbs"), fat: sum("fat"), source: "items" };
  }
  const day = days.find((d) => d.date === date);
  if (day && (day.kcal != null || day.protein != null)) return { kcal: day.kcal ?? 0, protein: day.protein ?? 0, carbs: day.carbs, fat: day.fat, source: "day" };
  return { kcal: 0, protein: 0, carbs: null, fat: null, source: "none" };
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Target in force on a date (latest effective_from ≤ date), with a per-weekday override if set. */
export function targetFor(date: string, targets: NutritionTarget[]): { kcal: number; protein: number } | null {
  const t = targets.filter((x) => x.effective_from <= date).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  if (!t) return null;
  const wd = WEEKDAYS[new Date(date + "T12:00:00").getDay()]!;
  return t.per_weekday?.[wd] ?? { kcal: t.kcal, protein: t.protein };
}
