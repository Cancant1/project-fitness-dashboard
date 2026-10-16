import type { LocalStore } from "../data/local";
import type { Exercise, PainCheck, Program, SetRow, Session } from "../data/types";
import { toKg } from "../lib/format";
import { PROVISIONAL_NOTE, STEP_RULES, incrementAfterRepOut, trainingMaxAfterRepOut } from "./engine";
import { PLAN, latestMaxes } from "./bridge";
import { setEffort } from "./effort";
import { PAIN_HOLD, duringScore } from "./pain";
import type { Effort, EquipmentProfile, PrescribedDay, PrescribedExercise, PrescribedSet } from "./types";

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
  /** E1: how hard this set goes (always resolved: the set's own effort or the exercise's). Old rows: absent. */
  effort?: Effort;
  /** E12: stop the rep-out at this many reps. */
  capReps?: number;
  /** P-TIMESAVE pair id and position (A, B, C). */
  pair?: string;
  pairLabel?: string;
  /** Isometric hold: seconds. */
  durationSec?: number;
  /** A calibration rep-out (week 0 or a recalibration): sets the TM instead of moving it. */
  calibration?: boolean;
}

export function planRef(s: SetRow): PlanSetRef | undefined {
  return (s.legacy_ref as { plan?: PlanSetRef }).plan;
}

function targetText(p: PrescribedSet): string | null {
  if (p.durationSec != null) return `${p.durationSec} s`;
  if (p.repRange) return p.repRange[0] === p.repRange[1] ? String(p.repRange[0]) : `${p.repRange[0]}–${p.repRange[1]}`;
  if (p.reps != null) return String(p.reps);
  if (p.capReps != null && p.target != null) return `${p.target}–${p.capReps}`;
  if (p.target != null) return `${p.target}+`;
  return null;
}

/**
 * Creates the session with every prescribed set as a planned (not yet completed) row. A minimum session
 * (prescribeMinimum, or `opts.minimum`) stores legacy_ref.plan.minimum = true; it counts as the day's session.
 */
export async function startWorkout(local: LocalStore, program: Program, day: PrescribedDay, ids: Map<string, string>, date: string,
  opts: { minimum?: boolean } = {}): Promise<string> {
  const minimum = opts.minimum === true || day.minimum === true;
  const [session] = await local.save("sessions", {
    date, title: minimum ? `${day.title} (minimum)` : day.title, status: "in_progress", started_at: new Date().toISOString(), ended_at: null, duration_min: null,
    program_id: program.id, program_week_no: day.weekNo, program_day_id: null, energy: null, notes: null,
    date_confidence: "exact", date_basis: null, source: "app",
    legacy_ref: {
      plan: {
        programKey: PLAN.id, dayKey: day.dayKey, weekType: day.weekType, weekLabel: day.weekLabel, notes: day.notes,
        ...(minimum ? { minimum: true } : {})
      }
    }
  });
  const rows: Partial<SetRow>[] = [];
  for (const ex of day.exercises) {
    let n = 0;
    let w = 0;
    ex.sets.forEach((p, i) => {
      if (p.kind !== "warmup") n += 1;
      else w += 1;
      const isLast = i === ex.sets.length - 1;
      rows.push({
        // Warm-ups are numbered too (1, 2, 3 before set 1), so the ramp keeps its order.
        session_id: session!.id, exercise_id: ids.get(ex.exerciseKey)!, exercise_position: ex.order,
        set_no: p.kind === "warmup" ? w : n, kind: p.kind, load: p.load, unit: p.unit, load_kg: toKg(p.load, p.unit),
        reps: p.reps, duration_s: null, rpe: null, target_reps: targetText(p), target_load: p.load, completed: false,
        flags: [], note: null, exercise_as_logged: ex.name,
        legacy_ref: {
          plan: {
            exerciseKey: ex.exerciseKey, role: ex.role, mainLift: ex.mainLift, group: ex.group, target: p.target, pctTm: p.pctTm,
            repRange: p.repRange, restSec: restAfter(ex, i),
            note: p.note, effort: setEffort(ex, p),
            ...(p.capReps != null ? { capReps: p.capReps } : {}),
            ...(ex.pair ? { pair: ex.pair, pairLabel: ex.pairLabel } : {}),
            ...(p.durationSec != null ? { durationSec: p.durationSec } : {}),
            ...(p.calibration ? { calibration: true } : {})
          } satisfies PlanSetRef
        }
      });
    });
  }
  await local.save("sets", rows);
  return session!.id;
}

/** Rest after set i: the long rest before a rep-out or top set (also after the last warm-up), the deadlift ramp at
 *  the slot's rest (2–3 min apart), other warm-ups 60 s. */
function restAfter(ex: PrescribedExercise, i: number): number {
  const p = ex.sets[i]!;
  const next = ex.sets[i + 1];
  if (!next) return ex.restSec;
  if (next.kind === "rep_out" || next.kind === "top") return ex.restBeforeRepOutSec ?? ex.restSec;
  if (p.kind === "warmup") return ex.mainLift === "deadlift" ? ex.restSec : 60;
  return ex.restSec;
}

export interface MaxUpdate {
  lift: string; from: number | undefined; to: number; reason: "calibration" | "rep_out"; label: string;
  /** Calibration (or first) rep-out past 12 clean reps: TM from 12 reps, marked provisional (§6.2). */
  provisional?: boolean;
  /** R1-03: TM at or past the old best, so a hit held it and a beat added at most 2.5 kg. */
  capped?: boolean;
  /** E14: pain 4–5/10 (or more) on this lift today, so the increase was held back. */
  held?: boolean;
  /** Written to the training_maxes row, e.g. "provisional (>12 reps)". */
  note?: string;
}

/**
 * Main lifts with pain ≥ 4/10 logged in this session (E14 hold): their TM / next load does not go up.
 * Matches the session's pain checks (session_id, else the same date) to the main-lift exercise ids.
 */
export function heldLifts(session: Pick<Session, "id" | "date">, painChecks: readonly PainCheck[], ids: Map<string, string>): Set<string> {
  const out = new Set<string>();
  for (const lift of ["squat", "deadlift", "incline_db_press", "weighted_pullup"]) {
    const id = ids.get(lift);
    if (!id) continue;
    const hit = painChecks.some((p) => !p.deleted_at && p.exercise_id === id && (p.session_id === session.id || (p.session_id == null && p.date === session.date))
      && (duringScore(p) ?? 0) >= PAIN_HOLD);
    if (hit) out.add(lift);
  }
  return out;
}

/**
 * What finishing this workout changes: new squat/deadlift training max, next incline/pull-up load.
 * - Calibration rep-outs (week 0, or a recalibration after ≥ 4 weeks off) set the TM (provisional past 12 reps).
 * - R1-03: past the old-best e1RM (squat 165, deadlift 235) a hit holds the TM, a beat adds ≤ 2.5 kg.
 * - R1-04: incline ≥ 16 → +2 dumbbells; pull-up ≥ 12 → +5 kg.
 * - E14 (`opts.painChecks`): a lift with pain ≥ 4/10 this session gets no increase (decreases still apply).
 */
export function maxUpdates(session: Session, sets: SetRow[], ids: Map<string, string>, maxes: import("../data/types").TrainingMax[],
  equipment: EquipmentProfile, opts: { painChecks?: readonly PainCheck[] } = {}): MaxUpdate[] {
  const latest = latestMaxes(maxes.filter((m) => m.source_set_id == null || !sets.some((s) => s.id === m.source_set_id)), ids);
  const calibrationWeek = (session.legacy_ref as { plan?: { weekType?: string } }).plan?.weekType === "calibration";
  const held = opts.painChecks ? heldLifts(session, opts.painChecks, ids) : new Set<string>();
  const out: MaxUpdate[] = [];
  for (const s of sets) {
    const ref = planRef(s);
    if (!ref?.mainLift || !s.completed || s.reps == null || s.load == null) continue;
    if (s.kind !== "rep_out" && !(s.kind === "top" && ref.target != null)) continue;
    const lift = ref.mainLift;
    const hold = held.has(lift);
    if (lift === "squat" || lift === "deadlift") {
      const from = latest[lift];
      const calibration = calibrationWeek || ref.calibration === true;
      const r = trainingMaxAfterRepOut(Number(s.load), s.reps, { previous: from, target: ref.target, calibration, oldBest: PLAN.oldBestE1rm?.[lift] });
      const isHeld = hold && from != null && r.reason === "rep_out" && r.tm > from;
      const to = isHeld ? from! : r.tm;
      out.push({
        lift, from, to, reason: r.reason, label: lift === "squat" ? "Squat training max" : "Deadlift training max",
        ...(r.provisional ? { provisional: true, note: PROVISIONAL_NOTE } : {}),
        ...(r.capped ? { capped: true } : {}),
        ...(isHeld ? { held: true, note: `held at ${from} (pain 4/10 or more)` } : {})
      });
    } else {
      const from = Number(s.load);
      const next = incrementAfterRepOut(lift, from, s.reps, equipment, PLAN.mainLifts[lift] ?? STEP_RULES[lift]).load;
      const isHeld = hold && next > from;
      out.push({
        lift, from, to: isHeld ? from : next, reason: "rep_out", label: lift === "incline_db_press" ? "Incline DB, next load" : "Pull-up, next added load",
        ...(isHeld ? { held: true } : {})
      });
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
  await saveMaxes(local, session, sets, updates, ids, program);
}

/**
 * Edits to a finished workout: the session keeps its status, end time and duration. The training maxes (and next
 * loads) it set are redone from the edited sets when they change; an edit that doesn't move them leaves them alone.
 */
export async function saveEditedWorkout(local: LocalStore, session: Session, sets: SetRow[], updates: MaxUpdate[], ids: Map<string, string>, program: Program | undefined) {
  const setIds = new Set(sets.map((s) => s.id));
  const mine = local.all("training_maxes").filter((m) => m.source_set_id != null && setIds.has(m.source_set_id));
  const same = mine.length === updates.length
    && updates.every((u) => mine.some((m) => m.exercise_id === ids.get(u.lift) && m.value_kg === u.to && m.reason === u.reason));
  if (same) return;
  if (mine.length) await local.remove("training_maxes", mine.map((m) => m.id));
  await saveMaxes(local, session, sets, updates, ids, program);
}

async function saveMaxes(local: LocalStore, session: Session, sets: SetRow[], updates: MaxUpdate[], ids: Map<string, string>, program: Program | undefined) {
  if (!updates.length) return;
  const sourceSet = (lift: string) => sets.find((s) => planRef(s)?.mainLift === lift && (s.kind === "rep_out" || s.kind === "top"))?.id ?? null;
  await local.save("training_maxes", updates.map((u) => ({
    exercise_id: ids.get(u.lift)!, program_id: program?.id ?? null, effective_date: session.date, value_kg: u.to,
    reason: u.reason, source_set_id: sourceSet(u.lift), note: u.note ?? (u.from != null ? `from ${u.from}` : null)
  })));
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
