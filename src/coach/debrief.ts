// Post-session debrief (Today, after finishing): what the session changed and what the same day looks like next
// time. Pure and structured (numbers, not sentences): the card lays it out (docs/DESIGN.md: words are a cost).

import type { SetRow, TrainingMax } from "../data/types";
import { planRef } from "../plan/workout";
import type { PrescribedDay, PrescribedExercise } from "../plan/types";

export interface DebriefMax {
  /** "Squat". */
  lift: string;
  value: number;
  /** The set it came from: "100 × 10". */
  from: string | null;
}

export interface DebriefNext {
  /** "Lower A". */
  title: string;
  /** "Mon 19 Oct". */
  date: string;
  /** "Squat". */
  lift: string;
  load: number;
  added: boolean;
  /** "3 × 5 · max set 10". */
  scheme: string;
}

export interface DebriefRow {
  name: string;
  /** Heaviest completed working load this session, and next time's prescription. */
  from: number;
  to: number;
  unit: string;
  added?: boolean;
  dir: "up" | "same" | "down";
  /** ≤ 4 words, only when this row holds for its own reason: "up at 20 reps", "up when reps drop". */
  hint: string | null;
}

export interface Debrief {
  maxes: DebriefMax[];
  next: DebriefNext | null;
  rows: DebriefRow[];
  /** Week 0: sets stopped at the range top, so the loads carry into week 1 (the card explains it behind "Why"). */
  held: boolean;
}

const LIFT_NAME: Record<string, string> = { squat: "Squat", deadlift: "Deadlift", incline_db_press: "Incline DB", weighted_pullup: "Pull-up" };
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));
const shortName = (n: string) => n.split(",")[0]!.trim();

/** The load a prescribed exercise starts at next time (rep-out or first working set). */
function nextLoad(ex: PrescribedExercise): number | null {
  const s = ex.sets.find((x) => x.kind !== "warmup");
  return s ? s.load : null;
}

function nextMain(ex: PrescribedExercise, title: string, date: string): DebriefNext | null {
  const work = ex.sets.filter((s) => s.kind !== "warmup");
  const normal = work.filter((s) => s.kind === "working");
  const ro = work.find((s) => s.kind === "rep_out" || s.kind === "top");
  const first = normal[0] ?? ro;
  if (!first) return null;
  const parts: string[] = [];
  if (normal.length) parts.push(`${normal.length} × ${normal[0]!.reps ?? ""}`);
  if (ro) parts.push(ro.target != null ? `max set ${ro.target}` : "max set");
  return {
    title, date, lift: LIFT_NAME[ex.mainLift ?? ""] ?? shortName(ex.name), load: first.load,
    added: ex.loadBasis === "added", scheme: parts.join(" · ")
  };
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
  const out: Debrief = { maxes: [], next: null, rows: [], held: false };

  for (const m of maxes) {
    const key = keyOf.get(m.exercise_id) ?? "";
    const src = sets.find((s) => s.id === m.source_set_id);
    out.maxes.push({ lift: LIFT_NAME[key] ?? "Training max", value: m.value_kg, from: src && src.reps != null ? `${fmt(Number(src.load))} × ${src.reps}` : null });
  }

  if (!next) return out;
  const main = next.exercises.find((e) => e.role === "main" && e.mainLift);
  if (main) out.next = nextMain(main, next.title, nextDateLabel);

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
    const dir = to > from + 1e-9 ? "up" : to < from - 1e-9 ? "down" : "same";
    let hint: string | null = null;
    if (dir === "same") {
      const range = ex.sets.find((s) => s.repRange)?.repRange;
      const allTop = !!range && logged.every((s) => (s.reps ?? 0) >= range[1]);
      if (ex.rehab) hint = "up when reps drop";
      else if (calibration && allTop) out.held = true;
      else if (range && !allTop) hint = `up at ${range[1]} reps`;
    }
    out.rows.push({ name: shortName(ex.name), from, to, unit, ...(ex.loadBasis === "added" ? { added: true } : {}), dir, hint });
  }
  return out;
}
