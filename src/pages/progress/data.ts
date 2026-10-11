// Data hooks for the insight pages: one memoised join of sessions × sets, shared lift definitions.

import { useMemo } from "react";
import { useRows } from "../../data/store";
import type { Exercise, Session } from "../../data/types";
import { groupBy, goalValue, isLiveSession, workSets, type Metric, type WorkSet } from "../../lib/analysis";
import { HISTORY_NAME, PLAN } from "../../plan/bridge";
import type { MainLiftKey } from "../../plan/types";

export interface LiftDef {
  key: MainLiftKey;
  label: string;
  metric: Metric;
  goalLoad: number;
  goalReps: number;
  /** Goal in the metric: e1RM for squat/deadlift/incline, added kg for the pull-up. */
  goal: number;
  goalText: string;
  /** What the metric is called in captions. */
  metricLabel: string;
  /** Checkpoint TMs (squat/deadlift): [plan week, date, TM]. */
  checkpoints: { weekNo: number; date: string; tm: number }[];
}

const LABEL: Record<MainLiftKey, string> = { squat: "Squat", deadlift: "Deadlift", incline_db_press: "Incline DB", weighted_pullup: "Pull-up" };

export const LIFTS: LiftDef[] = (["squat", "deadlift", "incline_db_press", "weighted_pullup"] as const).map((key) => {
  const g = PLAN.goals[key];
  const metric: Metric = key === "weighted_pullup" ? "added5" : "e1rm";
  const cps = PLAN.weeks.flatMap((w) => (w.checkpoint ? [w.checkpoint] : []));
  return {
    key, label: LABEL[key], metric, goalLoad: g.load, goalReps: g.reps, goal: goalValue(g.load, g.reps, metric),
    goalText: key === "weighted_pullup" ? `+${g.load} × ${g.reps}` : `${g.load} × ${g.reps}${key === "incline_db_press" ? " per hand" : ""}`,
    metricLabel: metric === "e1rm" ? "e1RM" : "added kg, 5+ reps",
    checkpoints: key === "squat" ? cps.map((c) => ({ weekNo: c.weekNo, date: c.date, tm: c.squatTm }))
      : key === "deadlift" ? cps.map((c) => ({ weekNo: c.weekNo, date: c.date, tm: c.deadliftTm })) : []
  };
});

export interface TrainingIndex {
  sessions: Session[];
  sessionById: Map<string, Session>;
  work: WorkSet[];
  byExercise: Map<string, WorkSet[]>;
  exercises: Exercise[];
  exerciseById: Map<string, Exercise>;
  /** Plan key → exercise id (squat, deadlift, incline_db_press, weighted_pullup, barbell_row, …). */
  ids: Map<string, string>;
  /** Latest date of a live session with sets. */
  lastDate: string | null;
}

export function useTraining(): TrainingIndex {
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const exercises = useRows("exercises");
  return useMemo(() => {
    const work = workSets(sets, sessions);
    const ids = new Map<string, string>();
    for (const key of Object.keys(HISTORY_NAME)) {
      const e = resolveExercise(exercises, key);
      if (e) ids.set(key, e.id);
    }
    return {
      sessions: sessions.filter(isLiveSession),
      sessionById: new Map(sessions.map((s) => [s.id, s])),
      work,
      byExercise: groupBy(work, (s) => s.exerciseId),
      exercises,
      exerciseById: new Map(exercises.map((e) => [e.id, e])),
      ids,
      lastDate: work.length ? work[work.length - 1]!.date : null
    };
  }, [sessions, sets, exercises]);
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Plan key → exercise. An exact name wins over an alias (the Leg Press row carries the alias "Squat"),
 * then the plan_key stamp, then aliases.
 */
export function resolveExercise(exercises: readonly Exercise[], key: string): Exercise | undefined {
  const name = norm(HISTORY_NAME[key] ?? key);
  const live = exercises.filter((e) => !e.archived);
  return live.find((e) => norm(e.name) === name)
    ?? exercises.find((e) => e.legacy_ref?.plan_key === key)
    ?? live.find((e) => e.aliases.some((a) => norm(a) === name));
}

/** Morning weigh-ins in kg, oldest first. */
export function useBodyweight(): { date: string; value: number }[] {
  const rows = useRows("body_measurements");
  return useMemo(
    () => rows.filter((r) => r.kind === "weight").map((r) => ({ date: r.date, value: r.unit === "lb" ? r.value * 0.45359237 : Number(r.value) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [rows]
  );
}
