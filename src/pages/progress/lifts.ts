// Per-lift figures shared by the Progress tiles, the hero chart and the Exercise page.

import { useMemo } from "react";
import {
  monthIndex, monthlyBests, sessionBests, windowBest, type Metric, type SessionBest, type WorkSet
} from "../../lib/analysis";
import { addDays } from "../../lib/format";
import { LIFTS, type LiftDef, type TrainingIndex } from "./data";

export interface Trend {
  metric: Metric;
  /** Best metric value per session, oldest first (flagged sets excluded). */
  bests: SessionBest[];
  /** All-time best session. */
  best: SessionBest | null;
  /** Best of the 8 weeks ending at `asOf`; falls back to the last session when that window is empty. */
  now: SessionBest | null;
  /** `now` is from the 8-week window (false: it is just the last time it was done). */
  recent: boolean;
  /** 8-week best vs the 8-week best four weeks earlier. */
  delta: number | null;
  /** Monthly bests over the 12 months ending with `today` (for a sparkline). */
  spark: number[];
}

/** Trend figures for one exercise. `asOf` anchors "now" (the last logged date), `today` anchors the sparkline. */
export function trendOf(sets: readonly WorkSet[], metric: Metric, asOf: string | null, today: string): Trend {
  const bests = sessionBests(sets, metric);
  const best = bests.reduce<SessionBest | null>((a, b) => (!a || b.value > a.value ? b : a), null);
  const end = asOf ?? today;
  const win = windowBest(bests, end, 56);
  const before = windowBest(bests, addDays(end, -28), 56);
  const nowM = monthIndex(today);
  const spark = monthlyBests(bests).filter((m) => monthIndex(m.period) > nowM - 12).map((m) => m.value);
  return {
    metric, bests, best, now: win ?? bests.at(-1) ?? null, recent: !!win,
    delta: win && before ? win.value - before.value : null, spark
  };
}

export interface LiftTrend extends Trend { lift: LiftDef; id: string | undefined }

/** The four main lifts, anchored at the last logged day. */
export function useLiftTrends(idx: TrainingIndex, today: string): LiftTrend[] {
  return useMemo(() => LIFTS.map((lift) => {
    const id = idx.ids.get(lift.key);
    return { lift, id, ...trendOf(id ? idx.byExercise.get(id) ?? [] : [], lift.metric, idx.lastDate, today) };
  }), [idx, today]);
}
