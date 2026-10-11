// Adaptive TDEE: maintenance = average logged intake − (weight change × 7,700 kcal/kg) / days.
// Only days with logged intake count. The weight change is the slope of a straight line through every
// weigh-in in the window (robust to gaps), times the window length.

import { addDays, daysBetween } from "./format";

export interface DayIntake { date: string; kcal: number }
export interface Weigh { date: string; kg: number }

export interface TdeeResult {
  windowDays: number;
  from: string;
  to: string;
  intakeDays: number;
  weighIns: number;
  avgIntake: number;
  weightChangeKg: number;
  tdee: number;
}

const KCAL_PER_KG = 7700;

/** Least-squares slope in kg per day. */
export function slopePerDay(points: Weigh[], origin: string): number | null {
  if (points.length < 2) return null;
  const xs = points.map((p) => daysBetween(origin, p.date));
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = points.reduce((s, p) => s + p.kg, 0) / points.length;
  let num = 0;
  let den = 0;
  points.forEach((p, i) => {
    num += (xs[i]! - mx) * (p.kg - my);
    den += (xs[i]! - mx) ** 2;
  });
  return den ? num / den : null;
}

export interface SlopeFit {
  /** kg per day. */
  slope: number;
  /** Standard error of the slope, kg per day; null with fewer than 3 points. */
  se: number | null;
  /** Fitted value at `origin`. */
  intercept: number;
  n: number;
  /** Days from the first to the last point. */
  spanDays: number;
}

/**
 * Least-squares line through the weigh-ins with the slope's standard error:
 * SE = √(Σ residual² / (n − 2) / Σ (x − x̄)²). Null with fewer than 2 points or all on one day.
 */
export function slopeWithSe(points: Weigh[], origin: string): SlopeFit | null {
  const n = points.length;
  if (n < 2) return null;
  const xs = points.map((p) => daysBetween(origin, p.date));
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = points.reduce((s, p) => s + p.kg, 0) / n;
  let sxy = 0;
  let sxx = 0;
  points.forEach((p, i) => {
    sxy += (xs[i]! - mx) * (p.kg - my);
    sxx += (xs[i]! - mx) ** 2;
  });
  if (!sxx) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let rss = 0;
  points.forEach((p, i) => { rss += (p.kg - (intercept + slope * xs[i]!)) ** 2; });
  const se = n >= 3 ? Math.sqrt(rss / (n - 2) / sxx) : null;
  return { slope, se, intercept, n, spanDays: Math.max(...xs) - Math.min(...xs) };
}

/**
 * null unless at least half the days have intake logged and there are ≥4 weigh-ins spanning at least
 * half the window.
 */
export function adaptiveTdee(intake: DayIntake[], weights: Weigh[], asOf: string, windowDays: number): TdeeResult | null {
  const from = addDays(asOf, -(windowDays - 1));
  const days = intake.filter((d) => d.date >= from && d.date <= asOf && d.kcal > 0);
  if (days.length < windowDays / 2) return null;
  const w = weights.filter((x) => x.date >= from && x.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  if (w.length < 4 || daysBetween(w[0]!.date, w[w.length - 1]!.date) < windowDays / 2) return null;
  const slope = slopePerDay(w, from);
  if (slope == null) return null;
  const avgIntake = days.reduce((s, d) => s + d.kcal, 0) / days.length;
  return {
    windowDays, from, to: asOf, intakeDays: days.length, weighIns: w.length, avgIntake,
    weightChangeKg: slope * windowDays,
    tdee: avgIntake - slope * KCAL_PER_KG
  };
}
