// §4.5 Fuel: food logging, calories and protein against the target, measured maintenance, and the
// evening protein cue.

import { adaptiveTdee, type DayIntake, type Weigh } from "../lib/energy";
import { addDays, daysBetween } from "../lib/format";
import { bodyweight7d, dayTotals, targetFor } from "../lib/nutrition";
import { fmtG, fmtKcal, sig, type AreaResult, type WeekCtx } from "./common";
import type { CoachData } from "./data";
import type { DailyCue, Signal } from "./types";

/** The plan's estimate of maintenance (Part 1: ≈2,600 kcal). */
export const PLAN_MAINTENANCE = 2600;
/** Morton 2018 breakpoint. */
export const PROTEIN_FLOOR_G_PER_KG = 1.6;

/** Bodyweight for g/kg: the 7-day average from any weigh-ins (a normaliser, not a judgement). */
const bwFor = (data: CoachData, date: string) => bodyweight7d(data.allMeasurements, date);

/** The target in force on a date; the plan's numbers (2,800 kcal, 2.0 g/kg or 180 g) when no row exists. */
export function targetOn(data: CoachData, date: string, bw: number | null): { kcal: number; protein: number } {
  const t = targetFor(date, data.targets, bw);
  if (t) return { kcal: t.kcal, protein: t.protein };
  return { kcal: data.plan.nutrition.kcal, protein: bw ? Math.round(2.0 * bw) : data.plan.nutrition.proteinG };
}

const datesBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};

export function fuelRules(ctx: WeekCtx): AreaResult {
  const { data } = ctx;
  const out: Signal[] = [];
  const days = datesBetween(ctx.from, ctx.asOf).map((date) => ({ date, t: dayTotals(date, data.foodEntries, data.nutritionDays) }));
  const logged = days.filter((d) => d.t.source !== "none" && d.t.kcal > 0);
  const k = logged.length;

  // fuel.logging
  const lMetric = { label: "Days logged", value: String(k), target: "7" };
  const lWhy: Signal["why"] = ["N-SURPLUS", "N-TDEE"];
  if (k >= 6) out.push(sig("fuel.logging", "fuel", "good", "Food logged", `Food logged on ${k} days.`, lWhy, { metric: lMetric }));
  else if (!ctx.complete) out.push(sig("fuel.logging", "fuel", "pending", "Food log so far", `Food logged on ${k} days so far.`, lWhy, { metric: lMetric }));
  else if (k >= 4) out.push(sig("fuel.logging", "fuel", "watch", "Food log gaps", `Food logged on ${k} days. The calorie checks need most days.`, lWhy, { metric: lMetric }));
  else out.push(sig("fuel.logging", "fuel", "act", "Food barely logged", `Food logged on ${k} days: can't judge the bulk.`, lWhy, { metric: lMetric }));

  // Averages use finished days only (today is still being logged), and need 3 of them.
  const full = logged.filter((d) => d.date < ctx.today);
  const bw = bwFor(data, ctx.asOf);
  let avgKcal: number | null = null;
  let avgProtein: number | null = null;
  let targetKcal: number | null = null;
  let targetProtein: number | null = null;
  if (full.length >= 3) {
    const targets = full.map((d) => targetOn(data, d.date, bw));
    avgKcal = full.reduce((s, d) => s + d.t.kcal, 0) / full.length;
    avgProtein = full.reduce((s, d) => s + d.t.protein, 0) / full.length;
    targetKcal = targets.reduce((s, t) => s + t.kcal, 0) / targets.length;
    targetProtein = targets.reduce((s, t) => s + t.protein, 0) / targets.length;

    // fuel.kcal
    const gap = avgKcal - targetKcal;
    const kMetric = { label: "Average kcal", value: fmtKcal(avgKcal), target: fmtKcal(targetKcal) };
    if (Math.abs(gap) <= 150) {
      out.push(sig("fuel.kcal", "fuel", "good", "Calories on target", `Average ${fmtKcal(avgKcal)} kcal, target ${fmtKcal(targetKcal)}.`, ["N-SURPLUS"], { metric: kMetric }));
    } else if (gap < 0) {
      out.push(sig("fuel.kcal", "fuel", "act", "Calories too low",
        `Average ${fmtKcal(avgKcal)} kcal: ${fmtKcal(-gap)} under target. The surplus is the point of the block.`, ["N-SURPLUS"], { metric: kMetric }));
    } else {
      out.push(sig("fuel.kcal", "fuel", "watch", "Calories above target",
        `Average ${fmtKcal(avgKcal)} kcal: ${fmtKcal(gap)} over the target of ${fmtKcal(targetKcal)}.`, ["N-SURPLUS", "N-RATE"], { metric: kMetric }));
    }

    // fuel.protein
    const gkg = bw ? avgProtein / bw : null;
    const pMetric = { label: "Protein g/day", value: fmtG(avgProtein), target: fmtG(targetProtein) };
    const perKg = gkg != null ? (Math.round(gkg * 10) / 10).toFixed(1) : null;
    const head = perKg != null ? `${fmtG(avgProtein)} g/day = ${perKg} g/kg.` : `${fmtG(avgProtein)} g/day.`;
    if (avgProtein >= targetProtein - 10) {
      out.push(sig("fuel.protein", "fuel", "good", "Protein on target", head, ["N-PROTEIN"], { metric: pMetric }));
    } else if (bw == null || avgProtein >= PROTEIN_FLOOR_G_PER_KG * bw) {
      out.push(sig("fuel.protein", "fuel", "watch", "Protein a bit low", `${head.slice(0, -1)}, target ${fmtG(targetProtein)} g.`, ["N-PROTEIN"], { metric: pMetric }));
    } else {
      out.push(sig("fuel.protein", "fuel", "act", "Protein too low",
        `${fmtG(avgProtein)} g/day is ${perKg} g/kg, under the 1.6 g/kg that matters. Add the post-session shake or 500 g kwark.`, ["N-PROTEIN"], { metric: pMetric }));
    }
  }

  // fuel.tdee
  const tdee = measuredTdee(data, ctx.asOf, ctx.today);
  if (tdee != null) {
    const t = targetOn(data, ctx.asOf, bw).kcal;
    const x = Math.round((t / tdee - 1) * 100);
    const metric = { label: "Measured maintenance", value: fmtKcal(tdee), target: fmtKcal(PLAN_MAINTENANCE) };
    if (t < tdee * 1.03) {
      out.push(sig("fuel.tdee", "fuel", "watch", "Surplus too small",
        x >= 0 ? `Target is only ${x}% over your measured maintenance.` : `Target is ${-x}% under your measured maintenance.`, ["N-TDEE", "N-SURPLUS"], { metric }));
    } else {
      out.push(sig("fuel.tdee", "fuel", "info", "Measured maintenance",
        `Your measured maintenance: ≈${fmtKcal(tdee)} kcal (plan assumed ${fmtKcal(PLAN_MAINTENANCE)}). Target ${fmtKcal(t)} = +${x}% over it.`, ["N-TDEE", "N-SURPLUS"], { metric }));
    }
  }

  return {
    signals: out,
    numbers: {
      food: {
        daysLogged: k, avgKcal, targetKcal, avgProtein, targetProtein,
        proteinPerKg: avgProtein != null && bw ? avgProtein / bw : null, tdee
      }
    }
  };
}

/** adaptiveTdee over the 28 days to `asOf` (finished days), when ≥ 18 intake days and ≥ 10 weigh-ins. */
export function measuredTdee(data: CoachData, asOf: string, today: string): number | null {
  const end = asOf < today ? asOf : addDays(today, -1);
  if (daysBetween(data.start, end) < 0) return null;
  const dates = new Set([...data.foodEntries.map((e) => e.date), ...data.nutritionDays.map((d) => d.date)]);
  const intake: DayIntake[] = [...dates].filter((d) => d <= end)
    .map((date) => ({ date, kcal: dayTotals(date, data.foodEntries, data.nutritionDays).kcal }))
    .filter((d) => d.kcal > 0);
  const weights: Weigh[] = data.measurements.filter((m) => m.kind === "weight" && m.date <= end)
    .map((m) => ({ date: m.date, kg: m.unit === "lb" ? Number(m.value) * 0.45359237 : Number(m.value) }));
  const r = adaptiveTdee(intake, weights, end, 28);
  if (!r || r.intakeDays < 18 || r.weighIns < 10) return null;
  return r.tdee;
}

/** fuel.today: after 18:00, protein so far more than 40 g under the day's target. */
export function proteinCue(data: CoachData, today: string, nowHour: number): DailyCue | null {
  if (nowHour < 18 || today < data.start) return null;
  const target = targetOn(data, today, bwFor(data, today)).protein;
  const left = target - dayTotals(today, data.foodEntries, data.nutritionDays).protein;
  if (left <= 40) return null;
  return { id: "fuel.today", tone: "plain", text: `${fmtG(left)} g protein to go. Shake or kwark.`, to: "/food" };
}
