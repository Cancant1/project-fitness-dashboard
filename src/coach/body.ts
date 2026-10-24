// §4.4 Body: weigh-ins, the expected bodyweight path, the 2-weekly rate check (least squares with its
// standard error; science check A3) and the waist.

import { addDays, daysBetween, fmtNum, fmtShortDate } from "../lib/format";
import { slopeWithSe, slopeWithoutOutliers, type Weigh } from "../lib/energy";
import { bodyweight7d } from "../lib/nutrition";
import { PLAN } from "../plan/bridge";
import { isoWeekday, weekForDate } from "../plan/engine";
import type { ProgramDefinition, ProgramWeek } from "../plan/types";
import { bw7, fmtBw, nextMonday, sig, tmAt, weekBounds, type AreaResult, type WeekCtx } from "./common";
import type { CoachData } from "./data";
import type { DailyCue, Signal, WeekNumbers } from "./types";

/** The plan's expected 7-day average (Part 1, "Expected bodyweight path"), interpolated linearly. */
export const BODYWEIGHT_PATH: readonly { date: string; lo: number; hi: number }[] = [
  { date: "2026-10-12", lo: 74.0, hi: 74.0 },
  { date: "2026-11-01", lo: 74.5, hi: 75.0 },
  { date: "2026-11-29", lo: 74.9, hi: 75.8 },
  { date: "2027-01-24", lo: 75.7, hi: 77.4 },
  { date: "2027-02-28", lo: 76.2, hi: 78.4 }
];

/**
 * E16: creatine water on the scale — 0 at the plan start (week 0), rising linearly to `creatineBandKg` (+0.7 kg)
 * at the start of week 4, then constant.
 */
export function creatineOffset(date: string, plan: ProgramDefinition = PLAN): number {
  const kg = plan.creatineBandKg ?? 0;
  if (!kg || !plan.creatineStart) return 0;
  const f = daysBetween(plan.startDate, date) / 28;
  return kg * Math.max(0, Math.min(1, f));
}

/** R2-14: the anchor week's 7-day average on its Sunday, once that Sunday has passed (`asOf`); else null. */
export function pathAnchor(data: Pick<CoachData, "plan" | "allMeasurements">, asOf: string): { date: string; kg: number } | null {
  const w = data.plan.bodyweightRate.anchorWeek;
  const week = w == null ? undefined : data.plan.weeks.find((x) => x.weekNo === w);
  if (!week) return null;
  const date = addDays(week.startDate, 6);
  if (asOf < date) return null;
  const kg = bodyweight7d(data.allMeasurements, date);
  return kg == null ? null : { date, kg };
}

/**
 * The expected 7-day average on a date: the plan's path, interpolated, shifted up by the creatine water (E16).
 * With an anchor (R2-14), the whole path is shifted so the band's middle passes through it on the anchor date (no step
 * in the drawn band).
 */
export function expectedBand(date: string, plan: ProgramDefinition = PLAN, anchor: { date: string; kg: number } | null = null): [number, number] | null {
  const base = rawBand(date, plan);
  if (!base || !anchor) return base;
  const at = rawBand(anchor.date, plan);
  const shift = at ? anchor.kg - (at[0] + at[1]) / 2 : 0;
  return [base[0] + shift, base[1] + shift];
}

function rawBand(date: string, plan: ProgramDefinition): [number, number] | null {
  const p = BODYWEIGHT_PATH;
  if (date < p[0]!.date) return null;
  const c = creatineOffset(date, plan);
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    if (date <= b.date) {
      const f = daysBetween(a.date, date) / daysBetween(a.date, b.date);
      return [a.lo + (b.lo - a.lo) * f + c, a.hi + (b.hi - a.hi) * f + c];
    }
  }
  const last = p[p.length - 1]!;
  return [last.lo + c, last.hi + c];
}

/** Rate checks run every 2 weeks from `fromWeek` (week 5 with creatine: 5, 7 … 17), before the taper. */
export function isRateWeek(plan: ProgramDefinition, week: ProgramWeek): boolean {
  const from = plan.bodyweightRate.fromWeek;
  return week.weekNo >= from && (week.weekNo - from) % 2 === 0 && week.type !== "taper" && week.type !== "test";
}

export interface RateFit {
  /** kg/week and its standard error (autocorrelation-corrected). */
  rate: number;
  se: number | null;
  /** Plain least-squares SE (kg/week) and the residual lag-1 autocorrelation used in the correction. */
  seRaw: number | null;
  r: number;
  n: number;
  spanDays: number;
  points: Weigh[];
  /** Readings dropped as more than 1.5 kg off the first-pass fit. */
  dropped: number;
}

/** Not enough data to fit; `skipped` names an exclusion window (the holiday) that took the data away. */
export interface NoRateFit { n: number; spanDays: number; points: Weigh[]; skipped?: string }

const MIN_SPAN_DAYS = 21;

/**
 * N-RATE (R1-21, E16): least-squares slope of the weigh-ins in the 28 days up to `asOf`, in kg/week, with an
 * autocorrelation-corrected SE.
 * - The window starts no earlier than week `fitFromWeek` (week 3: glycogen, water and the creatine load);
 * - readings in an exclusion window (England, 20 Dec – 3 Jan) are left out;
 * - readings more than 1.5 kg off a first-pass fit are dropped;
 * - needs ≥ 20 weigh-ins spanning ≥ 21 days (first to last, inclusive). When an exclusion window overlaps and the
 *   rest is too little, the result says skipped (holiday).
 */
export function rateFit(data: CoachData, asOf: string): RateFit | NoRateFit {
  const rule = data.plan.bodyweightRate;
  const minN = rule.minWeighIns ?? 10;
  const fitFrom = data.plan.weeks.find((w) => w.weekNo === (rule.fitFromWeek ?? 1))?.startDate ?? data.start;
  const windowStart = [addDays(asOf, -27), fitFrom].sort().at(-1)!;
  const exclusions = data.plan.rateExclusions ?? [];
  const excluded = (d: string) => exclusions.some((e) => d >= e.from && d <= e.to);
  const overlap = exclusions.find((e) => e.from <= asOf && e.to >= windowStart);
  const raw: Weigh[] = data.measurements
    .filter((m) => m.kind === "weight" && m.date >= windowStart && m.date <= asOf && !excluded(m.date))
    .map((m) => ({ date: m.date, kg: m.unit === "lb" ? Number(m.value) * 0.45359237 : Number(m.value) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const robust = raw.length >= 2 ? slopeWithoutOutliers(raw, windowStart, rule.outlierKg ?? Infinity) : null;
  const points = robust?.points ?? raw;
  const spanDays = points.length ? daysBetween(points[0]!.date, points[points.length - 1]!.date) + 1 : 0;
  if (!robust || points.length < minN || spanDays < MIN_SPAN_DAYS) {
    return { n: points.length, spanDays, points, ...(overlap ? { skipped: overlap.label } : {}) };
  }
  const fit = robust.fit;
  return {
    rate: fit.slope * 7, se: fit.se == null ? null : fit.se * 7, seRaw: fit.seRaw == null ? null : fit.seRaw * 7, r: fit.r,
    n: fit.n, spanDays, points, dropped: robust.dropped
  };
}

const isFit = (f: ReturnType<typeof rateFit>): f is RateFit => "rate" in f;

export type BodyweightSide = "below" | "on" | "above";

export interface BodyweightStatus {
  /** 7-day average (all weigh-ins) and the plan path's band on `date` (in the early weeks with the +2.5 kg allowance). */
  avg: number;
  band: [number, number];
  path: BodyweightSide;
  /**
   * Pace: least-squares kg/week over the 14 days up to `date` (≥ 5 weigh-ins over ≥ 7 days, readings 1.5 kg off a
   * first fit dropped), against the plan's 0.10–0.25 plus the creatine water expected in those days (E16).
   */
  pace: { rate: number; lo: number; hi: number; side: BodyweightSide; n: number } | null;
  /** Path and pace together: one off and the other on (or missing) → that side; the two pulling apart → on track. */
  verdict: BodyweightSide;
  /** Until the path is anchored (weeks 0–3): glycogen, water and creatine still move the scale, so an early read. */
  early: boolean;
}

export const PACE_DAYS = 14;
const PACE_MIN_WEIGH_INS = 5;
const PACE_MIN_SPAN_DAYS = 7;

/**
 * Am I on track? The 7-day average against the plan's expected path, and the 2-week pace against the plan's rate.
 * Shown every day from the plan start, also in weeks 0–2 (flagged `early`); the 2-weekly calorie rule stays in
 * body.rate.
 */
export function bodyweightStatus(data: CoachData, date: string): BodyweightStatus | null {
  const plan = data.plan;
  const anchor = pathAnchor(data, date);
  const band = expectedBand(date, plan, anchor);
  const avg = bodyweight7d(data.allMeasurements, date);
  if (!band || avg == null) return null;
  const side = (v: number, lo: number, hi: number): BodyweightSide => (v < lo - 1e-9 ? "below" : v > hi + 1e-9 ? "above" : "on");
  const week = weekForDate(plan, date);
  // R2-14: before the anchor, the early jump is expected: "above" only past the path + earlyAboveKg, and no pace verdict.
  const early = !!week && week.weekNo <= (plan.bodyweightRate.anchorWeek ?? 2) && !anchor;
  const slack = early ? plan.bodyweightRate.earlyAboveKg ?? 0 : 0;
  const shown: [number, number] = [band[0], band[1] + slack];
  const path = side(avg, Math.round(shown[0] * 10) / 10, Math.round(shown[1] * 10) / 10);

  const from = addDays(date, -(PACE_DAYS - 1));
  const points: Weigh[] = data.allMeasurements
    .filter((m) => m.kind === "weight" && m.date >= from && m.date <= date)
    .map((m) => ({ date: m.date, kg: m.unit === "lb" ? Number(m.value) * 0.45359237 : Number(m.value) }));
  const fit = points.length >= 2 ? slopeWithoutOutliers(points, from, plan.bodyweightRate.outlierKg ?? Infinity) : null;
  const span = fit ? daysBetween(fit.points[0]!.date, fit.points[fit.points.length - 1]!.date) : 0;
  let pace: BodyweightStatus["pace"] = null;
  if (fit && fit.points.length >= PACE_MIN_WEIGH_INS && span >= PACE_MIN_SPAN_DAYS) {
    const water = ((creatineOffset(date, plan) - creatineOffset(from, plan)) / (PACE_DAYS - 1)) * 7;
    const lo = plan.bodyweightRate.minKgPerWeek + water;
    const hi = plan.bodyweightRate.maxKgPerWeek + water;
    const rate = fit.fit.slope * 7;
    pace = { rate, lo, hi, side: side(rate, lo, hi), n: fit.points.length };
  }

  const p = early ? "on" : pace?.side ?? "on";
  const verdict: BodyweightSide = path === p ? path : path === "on" ? p : p === "on" ? path : "on";
  return { avg, band: shown, path, pace, verdict, early };
}

/** "Gaining 0.18 kg/week" / "Losing 0.05 kg/week". */
const gaining = (r: number) => (r < 0 ? `Losing ${Math.abs(r).toFixed(2)} kg/week` : `Gaining ${r.toFixed(2)} kg/week`);

export function bodyRules(ctx: WeekCtx): AreaResult {
  const { data, week } = ctx;
  const plan = data.plan;
  const out: Signal[] = [];
  const weights = data.measurements.filter((m) => m.kind === "weight");

  // body.weighins
  const k = new Set(weights.filter((m) => m.date >= ctx.from && m.date <= ctx.asOf).map((m) => m.date)).size;
  const wMetric = { label: "Weigh-ins", value: String(k), target: "7" };
  if (k >= 5) out.push(sig("body.weighins", "body", "good", "Weigh-ins complete", `${k} weigh-ins this week.`, ["N-RATE"], { metric: wMetric }));
  else if (!ctx.complete) out.push(sig("body.weighins", "body", "pending", "Weigh-ins so far", `${k} weigh-ins so far.`, ["N-RATE"], { metric: wMetric }));
  else if (k >= 3) out.push(sig("body.weighins", "body", "watch", "Few weigh-ins", `Only ${k} weigh-ins. The average needs most mornings.`, ["N-RATE"], { metric: wMetric }));
  else out.push(sig("body.weighins", "body", "act", "Too few weigh-ins", `${k} weigh-ins: not enough to judge the bulk.`, ["N-RATE"], { metric: wMetric }));

  // body.path
  const avg = bw7(data, ctx.asOf);
  const band = expectedBand(ctx.asOf, plan, pathAnchor(data, ctx.asOf));
  if (avg != null && band) {
    const [lo, hi] = band;
    const range = `${fmtBw(lo)}–${fmtBw(hi)}`;
    const metric = { label: "7-day average", value: fmtBw(avg), target: range };
    const why: Signal["why"] = ["N-RATE", "M-STRENGTH-BW"];
    // Until the week-3 anchor: glycogen and creatine water move the scale; the path is shown, never judged (N-RATE, R2-14).
    const early = ctx.weekNo <= (plan.bodyweightRate.anchorWeek ?? 2) && !pathAnchor(data, ctx.asOf);
    if (early) {
      const where = avg < lo ? "below" : avg > hi ? "above" : "inside";
      out.push(sig("body.path", "body", "info", "Bodyweight settling", `7-day average ${fmtBw(avg)} kg (${where} the plan range ${range}). Not judged until the week-3 average sets the path: water and creatine still settling.`, why, { metric }));
    } else if (avg < Math.round(lo * 10) / 10 - 1e-9) {
      out.push(sig("body.path", "body", "watch", "Bodyweight below the path", `7-day average ${fmtBw(avg)} kg, below the plan range ${range}.`, why, { metric }));
    } else if (avg > Math.round(hi * 10) / 10 + 1e-9) {
      out.push(sig("body.path", "body", "watch", "Bodyweight above the path", `7-day average ${fmtBw(avg)} kg, above the plan range ${range}.`, why, { metric }));
    } else {
      out.push(sig("body.path", "body", "good", "Bodyweight on the path", `7-day average ${fmtBw(avg)} kg, plan range ${range}.`, why, { metric }));
    }
  }

  // body.rate
  const rateNumbers: Pick<WeekNumbers["bodyweight"], "rate" | "rateSe" | "rateN" | "rateSkipped"> = { rate: null, rateSe: null, rateN: 0, rateSkipped: null };
  const why: Signal["why"] = ["N-RATE", "N-SURPLUS", "N-CARBS"];
  if (isRateWeek(plan, week)) {
    if (!ctx.complete) {
      out.push(sig("body.rate", "body", "pending", "Rate check on Sunday", `Rate check on Sunday ${fmtShortDate(ctx.to)}.`, why));
    } else {
      const f = rateFit(data, ctx.to);
      rateNumbers.rateN = f.n;
      if (!isFit(f) && f.skipped) {
        rateNumbers.rateSkipped = f.skipped;
        out.push(sig("body.rate", "body", "info", `Rate check skipped (${f.skipped})`,
          `Rate check skipped (${f.skipped}): the weigh-ins around it are left out. Same calories; the next check uses the weeks after.`, why));
      } else if (!isFit(f)) {
        out.push(sig("body.rate", "body", "watch", "Rate check: too few weigh-ins",
          `Only ${f.n} weigh-ins over ${f.spanDays} days: the rate check needs ${plan.bodyweightRate.minWeighIns ?? 10} over 3 weeks.`, why));
      } else {
        rateNumbers.rate = f.rate;
        rateNumbers.rateSe = f.se;
        const { minKgPerWeek: lo, maxKgPerWeek: hi } = plan.bodyweightRate;
        const se = f.se ?? Infinity;
        const target = `${lo.toFixed(2)}–${hi.toFixed(2)}`;
        const metric = { label: "kg/week", value: f.rate.toFixed(2), target, series: f.points.map((p) => p.kg) };
        const from = nextMonday(ctx.to);
        if (f.rate < lo || f.rate > hi) {
          const up = f.rate < lo;
          const clear = (up ? lo - f.rate : f.rate - hi) > se;
          if (clear) {
            out.push(sig("body.rate", "body", "act", up ? "Gaining too slowly" : "Gaining too fast",
              `${gaining(f.rate)} (target ${target}). ${up ? "Add 100 kcal of carbs from Monday." : "Remove 100 kcal."}`, why,
              { metric, action: { kind: "kcal", delta: up ? 100 : -100, from } }));
          } else {
            out.push(sig("body.rate", "body", "watch", "Rate near the edge",
              `${gaining(f.rate)}, close to the edge. Same calories; re-check in 2 weeks.`, why, { metric }));
          }
        } else {
          out.push(sig("body.rate", "body", "good", "Rate in range", `${gaining(f.rate)}: right in the lean-bulk range.`, why, { metric }));
        }
      }
    }
  } else {
    const next = plan.weeks.find((w) => w.weekNo > week.weekNo && isRateWeek(plan, w));
    if (next) out.push(sig("body.rate", "body", "info", "Next rate check", `Next rate check: Sunday ${fmtShortDate(weekBounds(next).to)}.`, why));
  }

  // body.waist
  const waist = waistTrend(data, ctx.asOf);
  if (waist.perMonth != null) {
    const x = waist.perMonth;
    const metric = { label: "Waist cm/month", value: fmtNum(x, 1), target: "≤ 1" };
    const wWhy: Signal["why"] = ["N-WAIST"];
    if (x > 1) {
      const sq = [tmAt(data, "squat", waist.since), tmAt(data, "squat", ctx.asOf)];
      const dl = [tmAt(data, "deadlift", waist.since), tmAt(data, "deadlift", ctx.asOf)];
      const rising = (p: (number | null)[]) => p[1] != null && (p[0] == null || p[1] > p[0]);
      const stalled = !rising(sq) && !rising(dl);
      const recentCut = data.adjustments.find((a) => a.data.kind === "kcal" && a.data.delta < 0 && a.created.slice(0, 10) > addDays(ctx.asOf, -14));
      if (stalled && recentCut) {
        out.push(sig("body.waist", "body", "info", "Waist rising, calories cut",
          `Waist +${fmtNum(x, 1)} cm/month while lifts stall. Calories already went down on ${fmtShortDate(recentCut.created.slice(0, 10))}.`, wWhy, { metric }));
      } else if (stalled) {
        out.push(sig("body.waist", "body", "act", "Waist up, lifts stalling",
          `Waist +${fmtNum(x, 1)} cm/month while lifts stall. Remove 100 kcal.`, wWhy,
          { metric, action: { kind: "kcal", delta: -100, from: nextMonday(ctx.asOf) } }));
      } else {
        out.push(sig("body.waist", "body", "info", "Waist up, lifts climbing",
          `Waist +${fmtNum(x, 1)} cm/month while the lifts still climb. Keep going.`, wWhy, { metric }));
      }
    } else {
      out.push(sig("body.waist", "body", "good", "Waist steady", `Waist ${x >= 0 ? "+" : "−"}${fmtNum(Math.abs(x), 1)} cm/month.`, wWhy, { metric }));
    }
  }

  // body.photos (M-MEASURE, E20)
  const photos = photoStatus(data, ctx.to < ctx.today ? ctx.to : ctx.today, week);
  const pWhy: Signal["why"] = ["M-MEASURE"];
  if (photos.photoWeek) {
    if (photos.done) out.push(sig("body.photos", "body", "good", "Progress photos taken", "Progress photos taken this week.", pWhy));
    else out.push(sig("body.photos", "body", ctx.complete ? "watch" : "pending", "Progress photos due",
      `Progress photos due${photos.next ? ` (Thursday ${fmtShortDate(photos.next)})` : ""}: front, side, back, same spot and light.`, pWhy));
  } else if (photos.next) {
    out.push(sig("body.photos", "body", "info", "Next progress photos", `Next progress photos: Thursday ${fmtShortDate(photos.next)}.`, pWhy));
  }

  return {
    signals: out,
    numbers: {
      bodyweight: { avg7d: avg, band, weighIns: k, ...rateNumbers },
      waist: { latestCm: waist.latest, cmPerMonth: waist.perMonth },
      photos
    }
  };
}

/** N-WAIST (R1-28): readings needed for a waist slope. */
export const WAIST_MIN_READINGS = 3;

/**
 * Waist entries in cm up to `asOf`; the change per 30 days from the slope of the last 6 weeks' readings when there
 * are ≥ 3 of them spanning ≥ 28 days (R1-28: act on the slope of ≥ 3, never on one reading).
 */
export function waistTrend(data: CoachData, asOf: string): { latest: number | null; lastDate: string | null; perMonth: number | null; since: string } {
  const all = data.measurements.filter((m) => m.kind === "waist" && m.date <= asOf)
    .map((m) => ({ date: m.date, kg: m.unit === "in" ? Number(m.value) * 2.54 : Number(m.value) }));
  const last = all.at(-1);
  const recent = all.filter((p) => p.date >= addDays(asOf, -42));
  const since = recent[0]?.date ?? asOf;
  if (recent.length < WAIST_MIN_READINGS || daysBetween(recent[0]!.date, recent[recent.length - 1]!.date) < 28) {
    return { latest: last?.kg ?? null, lastDate: last?.date ?? null, perMonth: null, since };
  }
  const fit = slopeWithSe(recent, recent[0]!.date);
  return { latest: last?.kg ?? null, lastDate: last?.date ?? null, perMonth: fit ? fit.slope * 30 : null, since };
}

/**
 * Waist check due (E20: the waist is optional, so no nagging): only while he is logging it — a waist entry in the
 * last 30 days but none in the last 14.
 */
export function waistDueCue(data: CoachData, today: string): DailyCue | null {
  if (!data.program || today < data.start || today > data.end) return null;
  const waists = data.measurements.filter((m) => m.kind === "waist" && m.date <= today);
  const active = waists.some((m) => m.date > addDays(today, -30));
  const recent = waists.some((m) => m.date > addDays(today, -14));
  return active && !recent ? { id: "body.waist", tone: "plain", text: "Waist check due: tape at the navel, morning.", to: "/weight" } : null;
}

/** A body_measurements row that marks progress photos as taken (kind other, value 1, note "photos"). */
export const isPhotosRow = (m: { kind: string; note: string | null }) => m.kind === "other" && (m.note ?? "").trim().toLowerCase() === "photos";

/** Thursday of a plan week. */
const thursdayOf = (w: ProgramWeek) => addDays(w.startDate, 3);

/**
 * E20 / M-MEASURE: progress photos every 4 weeks (plan weeks 0, 4, 8, 12, 16, 19), Thursday morning.
 * `photoWeek`: the plan week of `date` is one; `done`: a photos row that week; `next`: the Thursday of this photo
 * week while not done, else of the next photo week (null after the last).
 */
export function photoStatus(data: CoachData, date: string, week?: ProgramWeek | null): { photoWeek: boolean; done: boolean; next: string | null } {
  const weeks = data.plan.photoWeeks ?? [];
  const w = week ?? weekForDate(data.plan, date);
  const photoWeek = !!w && weeks.includes(w.weekNo);
  const { from, to } = w ? weekBounds(w) : { from: date, to: date };
  const done = photoWeek && data.measurements.some((m) => isPhotosRow(m) && m.date >= from && m.date <= to);
  const later = data.plan.weeks.filter((x) => weeks.includes(x.weekNo) && (w ? x.weekNo > w.weekNo : x.startDate > date));
  const next = photoWeek && !done && w ? thursdayOf(w) : later[0] ? thursdayOf(later[0]) : null;
  return { photoWeek, done, next };
}

/** E20 cue: in a photo week, from Thursday morning until they are taken (Thursday–Sunday). */
export function photosCue(data: CoachData, today: string): DailyCue | null {
  if (!data.program || today < data.start || today > data.end || isoWeekday(today) < 4) return null;
  const s = photoStatus(data, today);
  if (!s.photoWeek || s.done) return null;
  return { id: "body.photos", tone: "plain", input: "photos", text: "Progress photos: front, side, back, same spot and light." };
}
