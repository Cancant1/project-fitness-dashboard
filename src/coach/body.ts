// §4.4 Body: weigh-ins, the expected bodyweight path, the 2-weekly rate check (least squares with its
// standard error; science check A3) and the waist.

import { addDays, daysBetween, fmtNum, fmtShortDate } from "../lib/format";
import { slopeWithSe, type SlopeFit, type Weigh } from "../lib/energy";
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

export function expectedBand(date: string): [number, number] | null {
  const p = BODYWEIGHT_PATH;
  if (date < p[0]!.date) return null;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    if (date <= b.date) {
      const f = daysBetween(a.date, date) / daysBetween(a.date, b.date);
      return [a.lo + (b.lo - a.lo) * f, a.hi + (b.hi - a.hi) * f];
    }
  }
  const last = p[p.length - 1]!;
  return [last.lo, last.hi];
}

/** Rate checks run on weeks 3, 5, 7 … 17 (every 2 weeks from week 3, before the taper). */
export function isRateWeek(plan: ProgramDefinition, week: ProgramWeek): boolean {
  const from = plan.bodyweightRate.fromWeek;
  return week.weekNo >= from && (week.weekNo - from) % 2 === 0 && week.type !== "taper" && week.type !== "test";
}

export interface RateFit {
  /** kg/week and its standard error. */
  rate: number;
  se: number | null;
  n: number;
  spanDays: number;
  points: Weigh[];
}

const MIN_WEIGHINS = 10;
const MIN_SPAN_DAYS = 21;

/**
 * Least-squares slope of the weigh-ins in the 28 days up to `asOf`, in kg/week with its SE.
 * Week-0 weigh-ins are left out (glycogen and water; Part 1's own rule never uses week 0 either: at week 3
 * it compares week 3 with week 1). Null below 10 weigh-ins or a span under 21 days (first to last, inclusive).
 */
export function rateFit(data: CoachData, asOf: string): RateFit | { n: number; spanDays: number; points: Weigh[] } {
  const week1 = data.plan.weeks.find((w) => w.weekNo === 1)?.startDate ?? data.start;
  const windowStart = [addDays(asOf, -27), week1].sort().at(-1)!;
  const points: Weigh[] = data.measurements
    .filter((m) => m.kind === "weight" && m.date >= windowStart && m.date <= asOf)
    .map((m) => ({ date: m.date, kg: m.unit === "lb" ? Number(m.value) * 0.45359237 : Number(m.value) }));
  const spanDays = points.length ? daysBetween(points[0]!.date, points[points.length - 1]!.date) + 1 : 0;
  if (points.length < MIN_WEIGHINS || spanDays < MIN_SPAN_DAYS) return { n: points.length, spanDays, points };
  const fit = slopeWithSe(points, windowStart) as SlopeFit;
  return { rate: fit.slope * 7, se: fit.se == null ? null : fit.se * 7, n: fit.n, spanDays, points };
}

const isFit = (f: ReturnType<typeof rateFit>): f is RateFit => "rate" in f;

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
  const band = expectedBand(ctx.asOf);
  if (avg != null && band) {
    const [lo, hi] = band;
    const range = `${fmtBw(lo)}–${fmtBw(hi)}`;
    const metric = { label: "7-day average", value: fmtBw(avg), target: range };
    const why: Signal["why"] = ["N-RATE", "M-STRENGTH-BW"];
    if (avg < Math.round(lo * 10) / 10 - 1e-9) {
      out.push(sig("body.path", "body", "watch", "Bodyweight below the path", `7-day average ${fmtBw(avg)} kg, below the plan range ${range}.`, why, { metric }));
    } else if (avg > Math.round(hi * 10) / 10 + 1e-9) {
      out.push(sig("body.path", "body", "watch", "Bodyweight above the path", `7-day average ${fmtBw(avg)} kg, above the plan range ${range}.`, why, { metric }));
    } else {
      out.push(sig("body.path", "body", "good", "Bodyweight on the path", `7-day average ${fmtBw(avg)} kg, plan range ${range}.`, why, { metric }));
    }
  }

  // body.rate
  const rateNumbers: Pick<WeekNumbers["bodyweight"], "rate" | "rateSe" | "rateN"> = { rate: null, rateSe: null, rateN: 0 };
  const why: Signal["why"] = ["N-RATE", "N-SURPLUS", "N-CARBS"];
  if (isRateWeek(plan, week)) {
    if (!ctx.complete) {
      out.push(sig("body.rate", "body", "pending", "Rate check on Sunday", `Rate check on Sunday ${fmtShortDate(ctx.to)}.`, why));
    } else {
      const f = rateFit(data, ctx.to);
      rateNumbers.rateN = f.n;
      if (!isFit(f)) {
        out.push(sig("body.rate", "body", "watch", "Rate check: too few weigh-ins",
          `Only ${f.n} weigh-ins over ${f.spanDays} days: the rate check needs ${MIN_WEIGHINS} over 3 weeks.`, why));
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

  return {
    signals: out,
    numbers: {
      bodyweight: { avg7d: avg, band, weighIns: k, ...rateNumbers },
      waist: { latestCm: waist.latest, cmPerMonth: waist.perMonth }
    }
  };
}

/** Waist entries in cm up to `asOf`; the change per 30 days over the last 6 weeks when they span ≥ 28 days. */
export function waistTrend(data: CoachData, asOf: string): { latest: number | null; lastDate: string | null; perMonth: number | null; since: string } {
  const all = data.measurements.filter((m) => m.kind === "waist" && m.date <= asOf)
    .map((m) => ({ date: m.date, kg: m.unit === "in" ? Number(m.value) * 2.54 : Number(m.value) }));
  const last = all.at(-1);
  const recent = all.filter((p) => p.date >= addDays(asOf, -42));
  const since = recent[0]?.date ?? asOf;
  if (recent.length < 2 || daysBetween(recent[0]!.date, recent[recent.length - 1]!.date) < 28) {
    return { latest: last?.kg ?? null, lastDate: last?.date ?? null, perMonth: null, since };
  }
  const fit = slopeWithSe(recent, recent[0]!.date);
  return { latest: last?.kg ?? null, lastDate: last?.date ?? null, perMonth: fit ? fit.slope * 30 : null, since };
}

/** Waist check due: plan running and no waist entry in the last 14 days. */
export function waistDueCue(data: CoachData, today: string): DailyCue | null {
  if (!data.program || today < data.start || today > data.end) return null;
  const recent = data.measurements.some((m) => m.kind === "waist" && m.date > addDays(today, -14) && m.date <= today);
  return recent ? null : { id: "body.waist", tone: "plain", text: "Waist check due: tape at the navel, morning.", to: "/weight" };
}
