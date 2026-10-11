import type { LocalStore } from "../data/local";
import type { Exercise, Program, SetRow, Session } from "../data/types";
import { toKg } from "../lib/format";
import { PROVISIONAL_NOTE, incrementAfterRepOut, trainingMaxAfterRepOut } from "./engine";
import { PLAN, latestMaxes } from "./bridge";
import type { EquipmentProfile, PrescribedDay, PrescribedExercise, PrescribedSet } from "./types";

export interface PlanSetRef {
  exerciseKey: string;
  role: PrescribedExercise["role"];
  mainLift?: PrescribedExercise["mainLift"];
  group?: string;
  target?: number;
  pctTm?: number;
  repRange?: [number, number];
  restSec: number;
  note?: string;
}

export function planRef(s: SetRow): PlanSetRef | undefined {
  return (s.legacy_ref as { plan?: PlanSetRef }).plan;
}

function targetText(p: PrescribedSet): string | null {
  if (p.repRange) return `${p.repRange[0]}–${p.repRange[1]}`;
  if (p.reps != null) return String(p.reps);
  if (p.target != null) return `${p.target}+`;
  return null;
}

/** Creates the session with every prescribed set as a planned (not yet completed) row. */
export async function startWorkout(local: LocalStore, program: Program, day: PrescribedDay, ids: Map<string, string>, date: string): Promise<string> {
  const [session] = await local.save("sessions", {
    date, title: day.title, status: "in_progress", started_at: new Date().toISOString(), ended_at: null, duration_min: null,
    program_id: program.id, program_week_no: day.weekNo, program_day_id: null, energy: null, notes: null,
    date_confidence: "exact", date_basis: null, source: "app",
    legacy_ref: { plan: { programKey: PLAN.id, dayKey: day.dayKey, weekType: day.weekType, weekLabel: day.weekLabel, notes: day.notes } }
  });
  const rows: Partial<SetRow>[] = [];
  for (const ex of day.exercises) {
    let n = 0;
    ex.sets.forEach((p, i) => {
      if (p.kind !== "warmup") n += 1;
      const isLast = i === ex.sets.length - 1;
      rows.push({
        session_id: session!.id, exercise_id: ids.get(ex.exerciseKey)!, exercise_position: ex.order,
        set_no: p.kind === "warmup" ? 0 : n, kind: p.kind, load: p.load, unit: p.unit, load_kg: toKg(p.load, p.unit),
        reps: p.reps, duration_s: null, rpe: null, target_reps: targetText(p), target_load: p.load, completed: false,
        flags: [], note: null, exercise_as_logged: ex.name,
        legacy_ref: {
          plan: {
            exerciseKey: ex.exerciseKey, role: ex.role, mainLift: ex.mainLift, group: ex.group, target: p.target, pctTm: p.pctTm,
            repRange: p.repRange, restSec: p.kind === "warmup" ? 60 : isLast ? ex.restSec : (ex.sets[i + 1]?.kind === "rep_out" ? ex.restBeforeRepOutSec ?? ex.restSec : ex.restSec),
            note: p.note
          } satisfies PlanSetRef
        }
      });
    });
  }
  await local.save("sets", rows);
  return session!.id;
}

export interface MaxUpdate {
  lift: string; from: number | undefined; to: number; reason: "calibration" | "rep_out"; label: string;
  /** Calibration (or first) rep-out past 12 clean reps: TM from 12 reps, marked provisional (§6.2). */
  provisional?: boolean;
  /** Written to the training_maxes row, e.g. "provisional (>12 reps)". */
  note?: string;
}

/** What finishing this workout changes: new squat/deadlift training max, next incline/pull-up load. */
export function maxUpdates(session: Session, sets: SetRow[], ids: Map<string, string>, maxes: import("../data/types").TrainingMax[], equipment: EquipmentProfile): MaxUpdate[] {
  const latest = latestMaxes(maxes.filter((m) => m.source_set_id == null || !sets.some((s) => s.id === m.source_set_id)), ids);
  const calibration = (session.legacy_ref as { plan?: { weekType?: string } }).plan?.weekType === "calibration";
  const out: MaxUpdate[] = [];
  for (const s of sets) {
    const ref = planRef(s);
    if (!ref?.mainLift || !s.completed || s.reps == null || s.load == null) continue;
    if (s.kind !== "rep_out" && !(s.kind === "top" && ref.target != null)) continue;
    const lift = ref.mainLift;
    if (lift === "squat" || lift === "deadlift") {
      const from = latest[lift];
      const r = trainingMaxAfterRepOut(Number(s.load), s.reps, { previous: from, target: ref.target, calibration });
      out.push({
        lift, from, to: r.tm, reason: r.reason, label: lift === "squat" ? "Squat training max" : "Deadlift training max",
        ...(r.provisional ? { provisional: true, note: PROVISIONAL_NOTE } : {})
      });
    } else {
      const from = Number(s.load);
      const to = incrementAfterRepOut(lift, from, s.reps, equipment).load;
      out.push({ lift, from, to, reason: "rep_out", label: lift === "incline_db_press" ? "Incline DB, next load" : "Pull-up, next added load" });
    }
  }
  return out;
}

export async function finishWorkout(local: LocalStore, session: Session, sets: SetRow[], updates: MaxUpdate[], ids: Map<string, string>, program: Program | undefined) {
  const ended = new Date();
  const started = session.started_at ? new Date(session.started_at) : ended;
  await local.save("sessions", {
    id: session.id, status: "completed", ended_at: ended.toISOString(),
    duration_min: Math.max(1, Math.round((ended.getTime() - started.getTime()) / 60000))
  });
  if (updates.length) {
    const sourceSet = (lift: string) => sets.find((s) => planRef(s)?.mainLift === lift && (s.kind === "rep_out" || s.kind === "top"))?.id ?? null;
    await local.save("training_maxes", updates.map((u) => ({
      exercise_id: ids.get(u.lift)!, program_id: program?.id ?? null, effective_date: session.date, value_kg: u.to,
      reason: u.reason, source_set_id: sourceSet(u.lift), note: u.note ?? (u.from != null ? `from ${u.from}` : null)
    })));
  }
}

// ---------- free workouts (no plan) ----------

/** A workout outside the plan: an in-progress session titled "Workout" with no sets yet. */
export async function startFreeWorkout(local: LocalStore, date: string): Promise<string> {
  const [session] = await local.save("sessions", {
    date, title: "Workout", status: "in_progress", started_at: new Date().toISOString(), ended_at: null, duration_min: null,
    program_id: null, program_week_no: null, program_day_id: null, energy: null, notes: null,
    date_confidence: "exact", date_basis: null, source: "app", legacy_ref: {}
  });
  return session!.id;
}

/** Position for an exercise added after everything already in the session. */
export function nextExercisePosition(sets: Pick<SetRow, "session_id" | "exercise_position">[], sessionId: string): number {
  return sets.filter((s) => s.session_id === sessionId).reduce((max, s) => Math.max(max, s.exercise_position), 0) + 1;
}

/**
 * Adds an exercise as a new block: `sets` empty working sets in its default unit,
 * or one timed set when the exercise is logged in minutes. Bodyweight sets start at 0 (= no added weight).
 */
export async function addExerciseToSession(local: LocalStore, sessionId: string,
  exercise: Pick<Exercise, "id" | "name" | "default_unit">, position: number, sets = 3): Promise<SetRow[]> {
  const unit = exercise.default_unit;
  const timed = unit === "min";
  const n = timed ? 1 : Math.max(1, Math.round(sets));
  const load = unit === "bodyweight" ? 0 : null;
  const rows: Partial<SetRow>[] = Array.from({ length: n }, (_, i) => ({
    session_id: sessionId, exercise_id: exercise.id, exercise_position: position, set_no: i + 1,
    kind: timed ? "timed" : "working", load, unit, load_kg: timed || unit === "reps" ? null : toKg(load, unit),
    reps: null, duration_s: null, rpe: null, target_reps: null, target_load: null, completed: false,
    flags: [], note: null, exercise_as_logged: exercise.name, legacy_ref: {}
  }));
  return local.save("sets", rows);
}
