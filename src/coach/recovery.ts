// §4.7 Recovery: session energy, and resting HR / HRV as information only (C-READINESS: no HRV-based training rule).
// Sleep isn't tracked (2026-10-21); the lights-out cue before lifting days stays.

import { addDays, fmtNum } from "../lib/format";
import { isoWeekday, weekForDate } from "../plan/engine";
import {
  LIGHTS_OUT_BEFORE_LIFTING, SLEEP_TARGET_BEFORE_LIFTING_H, sessionsIn, sig, weekBounds, type AreaResult, type WeekCtx
} from "./common";
import { liftingDayKeys } from "./consistency";
import type { CoachData } from "./data";
import type { DailyCue, Signal, WeekNumbers } from "./types";

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** C-READINESS: readings needed for a 7-day average and a 60-day baseline. */
const MIN_7D = 3;
const MIN_60D = 14;

export function recoveryRules(ctx: WeekCtx): AreaResult {
  const { data } = ctx;
  const out: Signal[] = [];

  // recovery.energy: this week vs the 3 weeks before, ≥ 3 rated sessions each.
  const rated = ctx.sessions.filter((s) => s.energy != null);
  const eAvg = rated.length ? rated.reduce((s, x) => s + Number(x.energy), 0) / rated.length : null;
  const prevWeeks = data.plan.weeks.filter((w) => w.weekNo < ctx.weekNo && w.weekNo >= ctx.weekNo - 3);
  const prevRated = prevWeeks.flatMap((w) => { const { from, to } = weekBounds(w); return sessionsIn(data, from, to); }).filter((s) => s.energy != null);
  const prevAvg = prevRated.length ? prevRated.reduce((s, x) => s + Number(x.energy), 0) / prevRated.length : null;
  if (eAvg != null && prevAvg != null && rated.length >= 3 && prevRated.length >= 3 && prevAvg - eAvg >= 1) {
    out.push(sig("recovery.energy", "recovery", "watch", "Sessions feel harder",
      `Sessions feel harder (energy ${fmtNum(eAvg, 1)} vs ${fmtNum(prevAvg, 1)}). Check sleep and food.`, ["C-SLEEP", "N-SURPLUS"],
      { metric: { label: "Session energy", value: fmtNum(eAvg, 1), target: fmtNum(prevAvg, 1) } }));
  }

  // recovery.resting_hr and recovery.hrv (C-READINESS): information only.
  const heart = heartNumbers(data, ctx.asOf);
  if (heart.restingHr7d != null) {
    const base = heart.restingHr60d != null ? ` (60-day baseline ${fmtNum(heart.restingHr60d, 0)})` : " (no 60-day baseline yet)";
    out.push(sig("recovery.resting_hr", "recovery", "info", "Resting heart rate",
      `Resting HR ${fmtNum(heart.restingHr7d, 0)} bpm over the last 7 days${base}. Information only.`, ["C-READINESS"],
      { metric: { label: "Resting HR", value: fmtNum(heart.restingHr7d, 0), ...(heart.restingHr60d != null ? { target: fmtNum(heart.restingHr60d, 0) } : {}) } }));
  }
  if (heart.hrv7d != null) {
    const base = heart.hrv60d != null ? ` (60-day baseline ${fmtNum(heart.hrv60d, 0)})` : " (no 60-day baseline yet)";
    out.push(sig("recovery.hrv", "recovery", "info", "Heart rate variability",
      `HRV ${fmtNum(heart.hrv7d, 0)} ms over the last 7 days${base}. Information only: the watch's HRV is imprecise and doesn't change the plan.`,
      ["C-READINESS"],
      { metric: { label: "HRV (SDNN)", value: fmtNum(heart.hrv7d, 0), ...(heart.hrv60d != null ? { target: fmtNum(heart.hrv60d, 0) } : {}) } }));
  }

  return {
    signals: out,
    numbers: {
      energy: { rated: rated.length, avg: eAvg, prevAvg },
      heart
    }
  };
}

/** 7-day averages (≥ 3 readings) of resting HR and HRV against a 60-day baseline (≥ 14 readings), up to `asOf`. */
export function heartNumbers(data: CoachData, asOf: string): NonNullable<WeekNumbers["heart"]> {
  const rows = data.allHealth.filter((h) => h.date <= asOf);
  const in7 = rows.filter((h) => h.date > addDays(asOf, -7));
  const in60 = rows.filter((h) => h.date > addDays(asOf, -60));
  const pick = (xs: typeof rows, f: (h: (typeof rows)[number]) => number | null, min: number) => {
    const v = xs.map(f).filter((x): x is number => x != null && Number.isFinite(x) && x > 0);
    return v.length >= min ? avg(v) : null;
  };
  const hr = (h: (typeof rows)[number]) => (h.resting_hr == null ? null : Number(h.resting_hr));
  const hrv = (h: (typeof rows)[number]) => (h.hrv_sdnn_ms == null ? null : Number(h.hrv_sdnn_ms));
  return {
    restingHr7d: pick(in7, hr, MIN_7D), restingHr60d: pick(in60, hr, MIN_60D),
    hrv7d: pick(in7, hrv, MIN_7D), hrv60d: pick(in60, hrv, MIN_60D)
  };
}

/** C-SLEEP cue (R1-23): from 21:00 on a night before a lifting day, lights out at 23:15. */
export function lightsOutCue(data: CoachData, today: string, nowHour: number): DailyCue | null {
  if (!data.program || nowHour < 21) return null;
  const tomorrow = addDays(today, 1);
  const week = weekForDate(data.plan, tomorrow);
  const day = data.plan.days.find((d) => d.weekday === isoWeekday(tomorrow));
  if (!week || !day || !liftingDayKeys(data.plan, week).includes(day.key)) return null;
  return {
    id: "recovery.lights_out", tone: "plain",
    text: `Lifting tomorrow: lights out ${LIGHTS_OUT_BEFORE_LIFTING} for ${SLEEP_TARGET_BEFORE_LIFTING_H} h asleep.`
  };
}

/** Static (science check A1, R1-20); detail views only. */
export const CAFFEINE_NOTE: Signal = sig("recovery.caffeine", "recovery", "info", "Caffeine and evening sessions",
  "Normal sessions: no caffeine (or ≤ 75 mg). Key sessions (calibration, D weeks, the test): ~150 mg at 17:15. No other caffeine after 14:00.",
  ["N-CAFFEINE", "C-SLEEP"]);

/** Static (N-ALCOHOL, R1-24); detail views only. */
export const ALCOHOL_NOTE: Signal = sig("recovery.alcohol", "recovery", "info", "Alcohol",
  "No alcohol on the evening after lifting or boxing; otherwise 2 drinks at most. Bigger nights only before a rest day, and count the calories.",
  ["N-ALCOHOL"]);
