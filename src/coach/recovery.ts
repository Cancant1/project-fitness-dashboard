// §4.7 Recovery: sleep (health_daily) and session energy.

import { fmtNum } from "../lib/format";
import { sessionsIn, sig, weekBounds, type AreaResult, type WeekCtx } from "./common";
import type { Signal } from "./types";

export function recoveryRules(ctx: WeekCtx): AreaResult {
  const { data } = ctx;
  const out: Signal[] = [];

  // recovery.sleep: ≥ 4 nights logged this week.
  const nights = data.health.filter((h) => h.date >= ctx.from && h.date <= ctx.asOf && (h.sleep_total_min ?? 0) > 0);
  const avgHours = nights.length ? nights.reduce((s, h) => s + h.sleep_total_min!, 0) / nights.length / 60 : null;
  if (avgHours != null && nights.length >= 4) {
    const h = fmtNum(avgHours, 1);
    const metric = { label: "Sleep h/night", value: h, target: "7–9" };
    if (avgHours >= 7) out.push(sig("recovery.sleep", "recovery", "good", "Sleep on target", `Sleep ${h} h a night.`, ["C-SLEEP"], { metric }));
    else if (avgHours >= 6) out.push(sig("recovery.sleep", "recovery", "watch", "Sleep a bit short", `Sleep ${h} h. Under 7 h costs recovery; aim 7–9.`, ["C-SLEEP"], { metric }));
    else out.push(sig("recovery.sleep", "recovery", "act", "Sleep too short", `Sleep ${h} h. That will show in rep-outs before anything else.`, ["C-SLEEP"], { metric }));
  }

  // recovery.energy: this week vs the 3 weeks before, ≥ 3 rated sessions each.
  const rated = ctx.sessions.filter((s) => s.energy != null);
  const avg = rated.length ? rated.reduce((s, x) => s + Number(x.energy), 0) / rated.length : null;
  const prevWeeks = data.plan.weeks.filter((w) => w.weekNo < ctx.weekNo && w.weekNo >= ctx.weekNo - 3);
  const prevRated = prevWeeks.flatMap((w) => { const { from, to } = weekBounds(w); return sessionsIn(data, from, to); }).filter((s) => s.energy != null);
  const prevAvg = prevRated.length ? prevRated.reduce((s, x) => s + Number(x.energy), 0) / prevRated.length : null;
  if (avg != null && prevAvg != null && rated.length >= 3 && prevRated.length >= 3 && prevAvg - avg >= 1) {
    out.push(sig("recovery.energy", "recovery", "watch", "Sessions feel harder",
      `Sessions feel harder (energy ${fmtNum(avg, 1)} vs ${fmtNum(prevAvg, 1)}). Check sleep and food.`, ["C-SLEEP", "N-SURPLUS"],
      { metric: { label: "Session energy", value: fmtNum(avg, 1), target: fmtNum(prevAvg, 1) } }));
  }

  return {
    signals: out,
    numbers: { sleep: { nights: nights.length, avgHours }, energy: { rated: rated.length, avg, prevAvg } }
  };
}

/** Static (science check A1); detail views only. */
export const CAFFEINE_NOTE: Signal = sig("recovery.caffeine", "recovery", "info", "Caffeine and evening sessions",
  "Evening sessions: ~150 mg caffeine or none; the 3–6 mg/kg dose needs ≥12 h before bed.", ["N-CAFFEINE", "C-SLEEP"]);
