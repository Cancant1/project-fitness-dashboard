// Formatting shared by Progress, Records and Exercise. Short on purpose: dates and numbers, nothing wordy.

import type { Confidence, Metric, WorkSet } from "../../lib/analysis";
import { fmtNum, fmtShortDate, fmtShortDateYear, fromIso } from "../../lib/format";

const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });
const monthOnly = new Intl.DateTimeFormat("en-GB", { month: "short" });

const asDate = (iso: string) => fromIso(iso.length === 7 ? `${iso}-01` : iso);
export const fmtMonthYear = (iso: string) => monthYear.format(asDate(iso));
export const fmtMonth = (iso: string) => monthOnly.format(asDate(iso));

/**
 * A date as far as we know it, compact: exact or week known (day from the sheet's day label) → "12 Sep 2026";
 * estimated → month only, "Sep 2023 · est.". Never shows an estimated day as if it were real.
 */
export function fmtWhen(date: string, confidence: Confidence, withYear = true): string {
  if (confidence === "estimated") return `${fmtMonthYear(date)} · est.`;
  return withYear ? fmtShortDateYear(date) : fmtShortDate(date);
}

/** "142.5 × 5", "+20 × 8", "BW × 12", "−10 × 8" (assisted). Loads in kg. */
export function fmtSet(s: Pick<WorkSet, "loadKg" | "reps" | "unit">): string {
  const reps = s.reps != null ? ` × ${fmtNum(s.reps)}` : "";
  if (s.loadKg == null) return `—${reps}`;
  if (s.unit === "bodyweight") {
    if (s.loadKg === 0) return `BW${reps}`;
    return `${s.loadKg > 0 ? "+" : "−"}${fmtNum(Math.abs(s.loadKg))}${reps}`;
  }
  return `${fmtNum(s.loadKg)}${reps}`;
}

/** A set as scored for its metric: added-load lifts always show "+20 × 8" / "BW × 12", whatever unit was logged. */
export function fmtLiftSet(s: Pick<WorkSet, "loadKg" | "reps" | "unit">, metric: Metric): string {
  return fmtSet(metric === "added5" ? { ...s, unit: "bodyweight" } : s);
}

export const fmtKg = (n: number | null | undefined, d = 1) => (n == null ? "—" : fmtNum(n, d));

/** A metric value: e1RM rounded to whole kg above 100, added kg with a "+" sign. */
export function fmtMetric(v: number | null | undefined, metric: Metric): string {
  if (v == null) return "—";
  if (metric === "added5") return v === 0 ? "BW" : `${v > 0 ? "+" : ""}${fmtNum(v, 1)}`;
  return fmtNum(v, v >= 100 ? 0 : 1);
}

export const metricName = (metric: Metric) => (metric === "e1rm" ? "e1RM" : "added, 5+ reps");

/**
 * How an exercise is scored: the pull-up (plan lift) and lifts logged mostly as bodyweight use the added load on
 * 5+ reps; everything else uses e1RM.
 */
export function metricFor(sets: readonly Pick<WorkSet, "unit">[], isPullup = false): Metric {
  if (isPullup) return "added5";
  const bw = sets.filter((s) => s.unit === "bodyweight").length;
  return sets.length && bw * 2 >= sets.length ? "added5" : "e1rm";
}
