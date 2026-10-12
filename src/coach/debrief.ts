// Post-session debrief (Today, after finishing): what the session changed and what the same day looks like next
// time. Pure: the page passes the finished session's sets and the next prescription of that day.

import type { SetRow, TrainingMax } from "../data/types";
import { planRef } from "../plan/workout";
import type { PrescribedDay, PrescribedExercise } from "../plan/types";

export interface DebriefChange {
  name: string;
  /** What was logged (heaviest completed working load) and what is prescribed next time. */
  from: number;
  to: number;
  unit: string;
  added?: boolean;
}

export interface Debrief {
  /** "Squat training max 132.5 kg (100 × 10)". */
  maxes: string[];
  /** "Next Lower A · Mon 19 Oct: squat 3 × 5 at 95 kg, then a max set (target 10)". */
  nextMain: string | null;
  up: DebriefChange[];
  same: { name: string; why: string }[];
  down: DebriefChange[];
}

const LIFT_NAME: Record<string, string> = { squat: "Squat", deadlift: "Deadlift", incline_db_press: "Incline DB", weighted_pullup: "Pull-up" };
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
const shortName = (n: string) => n.split(",")[0]!.trim();

/** The load a prescribed exercise starts at next time (rep-out or first working set). */
function nextLoad(ex: PrescribedExercise): number | null {
  const s = ex.sets.find((x) => x.kind !== "warmup");
  return s ? s.load : null;
}

/** How the next session's main lift reads: "3 × 5 at 95 kg, then a max set (target 10)". */
function mainText(ex: PrescribedExercise): string {
  const work = ex.sets.filter((s) => s.kind !== "warmup");
  const normal = work.filter((s) => s.kind === "working");
  const ro = work.find((s) => s.kind === "rep_out" || s.kind === "top");
  const plus = ex.loadBasis === "added" ? "+" : "";
  const parts: string[] = [];
  if (normal.length) parts.push(`${normal.length} × ${normal[0]!.reps ?? ""} at ${plus}${fmt(normal[0]!.load)} kg`);
  if (ro) parts.push(`${parts.length ? "then " : ""}a max set at ${plus}${fmt(ro.load)} kg${ro.target != null ? ` (target ${ro.target})` : ""}`);
  return `${shortName(ex.name)} ${parts.join(", ")}`;
}

export function sessionDebrief(args: {
  sets: SetRow[];
  /** Training-max rows written for this session (source_set in the session, or dated the session's day). */
  maxes: TrainingMax[];
  /** The plan exercise key of each training-max row's exercise. */
  keyOf: Map<string, string>;
  /** The next prescription of the same day (null after the plan). */
  next: PrescribedDay | null;
  nextDateLabel: string;
  /** A week-0 session: its sets stopped at the range top, so the loads carry into week 1. */
  calibration?: boolean;
}): Debrief {
  const { sets, maxes, keyOf, next, nextDateLabel, calibration } = args;
  const out: Debrief = { maxes: [], nextMain: null, up: [], same: [], down: [] };

  for (const m of maxes) {
    const key = keyOf.get(m.exercise_id) ?? "";
    const src = sets.find((s) => s.id === m.source_set_id);
    const how = src && src.reps != null ? ` (${fmt(Number(src.load))} × ${src.reps})` : "";
    const was = m.note?.startsWith("from ") ? `, was ${m.note.slice(5)}` : "";
    out.maxes.push(`${LIFT_NAME[key] ?? "Training max"} training max ${fmt(m.value_kg)} kg${how}${was}`);
  }

  if (!next) return out;
  const mains = next.exercises.filter((e) => e.role === "main" && e.mainLift);
  if (mains.length) out.nextMain = `Next ${next.title} · ${nextDateLabel}: ${mains.map(mainText).join("; ")}.`;

  // Accessories: logged load vs the next prescription, per plan exercise key.
  const byKey = new Map<string, SetRow[]>();
  for (const s of sets) {
    const ref = planRef(s);
    if (!ref || ref.mainLift || ref.role === "shoulder" || s.kind === "warmup" || !s.completed || s.load == null) continue;
    byKey.set(ref.exerciseKey, [...(byKey.get(ref.exerciseKey) ?? []), s]);
  }
  for (const ex of next.exercises) {
    const logged = byKey.get(ex.exerciseKey);
    if (!logged?.length || ex.mainLift) continue;
    const from = Math.max(...logged.map((s) => Number(s.load)));
    const to = nextLoad(ex);
    if (to == null) continue;
    const unit = logged[0]!.unit === "lb" ? "lb" : "kg";
    const row = { name: shortName(ex.name), from, to, unit, ...(ex.loadBasis === "added" ? { added: true } : {}) };
    if (to > from + 1e-9) out.up.push(row);
    else if (to < from - 1e-9) out.down.push(row);
    else {
      const range = ex.sets.find((s) => s.repRange)?.repRange;
      const reps = logged.map((s) => s.reps ?? 0);
      const why = ex.rehab ? "same dumbbell until the reps drop to the next rung"
        : calibration && range && reps.every((r) => r >= range[1])
          ? ex.sets.some((x) => x.kind === "rep_out") ? "week 0 stopped at the top; the max set next time sets the jump"
            : ex.effort === "failure" ? "week 0 stopped at the top; go to failure next time and the load follows"
              : "week 0 stopped at the top"
          : range && reps.some((r) => r < range[1]) ? `reach ${range[1]} reps on every set to go up` : "same load";
      out.same.push({ name: shortName(ex.name), why });
    }
  }
  return out;
}
