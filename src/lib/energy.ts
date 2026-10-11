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
  /**
   * Standard error of the slope, kg per day, corrected for day-to-day carry-over (N-RATE, R1-21):
   * seRaw × √((1 + r) / (1 − r)). Null with fewer than 3 points.
   */
  se: number | null;
  /** The plain least-squares SE: √(Σ residual² / (n − 2) / Σ (x − x̄)²). */
  seRaw: number | null;
  /** Lag-1 autocorrelation of the residuals in date order, clipped to 0–0.6 (0 with fewer than 3 points). */
  r: number;
  /** Fitted value at `origin`. */
  intercept: number;
  n: number;
  /** Days from the first to the last point. */
  spanDays: number;
}

/** R1-21: the residual autocorrelation used in the SE correction is clipped to this range. */
export const AUTOCORR_CLIP: readonly [number, number] = [0, 0.6];

/**
 * Least-squares line through the weigh-ins with the slope's standard error, corrected for autocorrelation
 * (his weigh-ins carry over from day to day, so the plain SE is too small): SE = seRaw × √((1 + r) / (1 − r)),
 * r = lag-1 autocorrelation of the residuals (date order), clipped to 0–0.6. Null with fewer than 2 points or all
 * on one day.
 */
export function slopeWithSe(points: Weigh[], origin: string): SlopeFit | null {
  const n = points.length;
  if (n < 2) return null;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const xs = sorted.map((p) => daysBetween(origin, p.date));
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = sorted.reduce((s, p) => s + p.kg, 0) / n;
  let sxy = 0;
  let sxx = 0;
  sorted.forEach((p, i) => {
    sxy += (xs[i]! - mx) * (p.kg - my);
    sxx += (xs[i]! - mx) ** 2;
  });
  if (!sxx) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const resid = sorted.map((p, i) => p.kg - (intercept + slope * xs[i]!));
  const rss = resid.reduce((s, e) => s + e * e, 0);
  const seRaw = n >= 3 ? Math.sqrt(rss / (n - 2) / sxx) : null;
  let r = 0;
  if (n >= 3 && rss > 1e-12) {
    let lag = 0;
    for (let i = 1; i < n; i++) lag += resid[i]! * resid[i - 1]!;
    r = Math.min(AUTOCORR_CLIP[1], Math.max(AUTOCORR_CLIP[0], lag / rss));
  }
  const se = seRaw == null ? null : seRaw * Math.sqrt((1 + r) / (1 - r));
  return { slope, se, seRaw, r, intercept, n, spanDays: Math.max(...xs) - Math.min(...xs) };
}

/**
 * N-RATE (R1-21): fit, drop readings more than `outlierKg` off that first line, fit again. Returns the second fit
 * and the points it used (null when fewer than 2 remain).
 */
export function slopeWithoutOutliers(points: Weigh[], origin: string, outlierKg: number): { fit: SlopeFit; points: Weigh[]; dropped: number } | null {
  const first = slopeWithSe(points, origin);
  if (!first) return null;
  const kept = points.filter((p) => Math.abs(p.kg - (first.intercept + first.slope * daysBetween(origin, p.date))) <= outlierKg + 1e-9);
  const fit = slopeWithSe(kept, origin);
  return fit ? { fit, points: kept, dropped: points.length - kept.length } : null;
}

/**
 * null unless at least half the days (or `opts.minIntakeDays`) have intake logged and there are ≥4 weigh-ins
 * spanning at least half the window. Missing days are left out of the intake average. `opts.kcalPerKg` is the
 * energy in a kg of weight change (default 7,700; the coach uses 6,000 for a lean bulk, N-TDEE / R-HALL-2008).
 */
export function adaptiveTdee(intake: DayIntake[], weights: Weigh[], asOf: string, windowDays: number,
  opts: { kcalPerKg?: number; minIntakeDays?: number } = {}): TdeeResult | null {
  const from = addDays(asOf, -(windowDays - 1));
  const days = intake.filter((d) => d.date >= from && d.date <= asOf && d.kcal > 0);
  if (days.length < (opts.minIntakeDays ?? windowDays / 2)) return null;
  const w = weights.filter((x) => x.date >= from && x.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  if (w.length < 4 || daysBetween(w[0]!.date, w[w.length - 1]!.date) < windowDays / 2) return null;
  const slope = slopePerDay(w, from);
  if (slope == null) return null;
  const avgIntake = days.reduce((s, d) => s + d.kcal, 0) / days.length;
  return {
    windowDays, from, to: asOf, intakeDays: days.length, weighIns: w.length, avgIntake,
    weightChangeKg: slope * windowDays,
    tdee: avgIntake - slope * (opts.kcalPerKg ?? KCAL_PER_KG)
  };
}

/** N-TDEE (R1-22): a lean-bulk kg is ~5,600–6,400 kcal, not 7,700. */
export const KCAL_PER_KG_LEAN_BULK = 6000;
