// Glue between the pure plan engine and the user's data.

import { useMemo } from "react";
import type { LocalStore } from "../data/local";
import { useRows } from "../data/context";
import type { Conditioning, Exercise, Profile, Program, SetRow, Session, TrainingMax } from "../data/types";
import { isFlagged } from "../lib/analysis";
import { todayIso } from "../lib/format";
import { adjustmentState, adjustmentsOf, applyAdjustments } from "./adjustments";
import {
  apreNextLoad, doubleProgression, DEFAULT_EQUIPMENT, failureProgression, progressionStep, roundsNextWeek, weekForDate
} from "./engine";
import { STRENGTH_RETURN_PLAN } from "./strengthReturn";
import { GYM, weightsFor } from "./equipment";
import type { EquipmentProfile, PlanState, PrescribedDay, ProgramDefinition, ProgramSlot, RoundsRule } from "./types";

export const PLAN: ProgramDefinition = STRENGTH_RETURN_PLAN;
export const PLAN_KEY = "strength-return-2026";

/** Plan exercise key → exercise name in the imported history (so progress continues across years). */
export const HISTORY_NAME: Record<string, string> = {
  squat: "Squat",
  romanian_deadlift: "Romanian Deadlift",
  lying_db_hamstring_curl: "Lying DB Hamstring Curl",
  cable_leg_extension: "Cable Leg Extension",
  cable_calf_raise: "Calf Raise",
  kneeling_cable_crunch: "Ab Crunch (Cable/Machine)",
  cable_lateral_raise: "Lateral Raise (Cable)",
  cross_body_triceps_extension: "Cross-Body Triceps Extension",
  cable_external_rotation: "Cable External Rotation",
  prone_y_raise: "Prone Y-Raise",
  cable_serratus_punch: "Cable Serratus Punch",
  face_pull: "Face Pull",
  incline_db_press: "Incline DB Press",
  weighted_pullup: "Weighted Pull-up",
  seated_cable_row: "Cable Row (Seated)",
  chest_cable_flye: "Cable Flye (Chest-Height)",
  bayesian_curl: "Bayesian Curl",
  overhead_cable_triceps_extension: "Overhead Triceps Extension (Cable)",
  deadlift: "Deadlift",
  bulgarian_split_squat: "Bulgarian Split Squat",
  seated_cable_leg_curl: "Cable Leg Curl",
  hanging_knee_raise: "Hanging Knee Raise",
  preacher_curl: "Preacher Curl",
  wrist_extension: "Slow Wrist Extension",
  barbell_row: "Barbell Row",
  db_bench_press: "DB Bench Press",
  lat_pulldown: "Lat Pulldown",
  cable_rear_delt_fly: "Rear Delt Fly",
  underhand_cable_curl: "Cable Curl",
  reverse_grip_pushdown: "Reverse-Grip Pushdown"
};

const norm = (s: string) => s.trim().toLowerCase();

/** Exact name first, then an exercise this plan created, and only then aliases (old renames can collide:
 *  "Leg Press (Machine)" carries the alias "Squat"). */
export function findExercise(exercises: Exercise[], key: string): Exercise | undefined {
  const name = norm(HISTORY_NAME[key] ?? key);
  return exercises.find((e) => norm(e.name) === name)
    ?? exercises.find((e) => e.legacy_ref?.plan_key === key)
    ?? exercises.find((e) => e.aliases.some((a) => norm(a) === name));
}

/** Plan exercise key → exercise id, for the exercises that exist. */
export function planIds(exercises: Exercise[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const def of Object.values(PLAN.exercises)) {
    const e = findExercise(exercises, def.key);
    if (e) m.set(def.key, e.id);
  }
  return m;
}

/** planIds, memoised on the exercise rows. */
export function usePlanIds(exercises: Exercise[]): Map<string, string> {
  return useMemo(() => planIds(exercises), [exercises]);
}

/** PLAN with the programme row's accepted coach adjustments folded in (docs/COACH.md §7). */
export function planFor(program: Program | null | undefined, today?: string): ProgramDefinition {
  const adjustments = program ? adjustmentsOf(program.rules) : [];
  return adjustments.length ? applyAdjustments(PLAN, adjustments, today) : PLAN;
}

/**
 * The adjusted programme for the active programme row. Use it for prescriptions and the calendar
 * (weeks can move: a repeated week adds one); keep PLAN for static data such as exercise definitions.
 */
export function usePlan(): ProgramDefinition {
  const programs = useRows("programs");
  const program = activeProgram(programs);
  const today = todayIso();
  return useMemo(() => planFor(program, today), [program, today]);
}

/** Returns exercise ids for every plan exercise, creating the few that are new to this plan. */
export async function ensurePlanExercises(local: LocalStore): Promise<Map<string, string>> {
  const exercises = local.all("exercises");
  const ids = new Map<string, string>();
  const missing: Partial<Exercise>[] = [];
  for (const def of Object.values(PLAN.exercises)) {
    const found = findExercise(exercises, def.key);
    if (found) {
      ids.set(def.key, found.id);
      continue;
    }
    const id = crypto.randomUUID();
    ids.set(def.key, id);
    const slot = PLAN.days.flatMap((d) => d.slots).find((s) => s.exerciseKey === def.key);
    missing.push({
      id, name: HISTORY_NAME[def.key] ?? def.name, aliases: [def.name], equipment: def.equipment,
      default_unit: slot?.unit ?? "kg",
      kind: slot?.role === "main" ? "main" : slot?.role === "compound" ? "compound" : slot?.role === "shoulder" ? "mobility" : "isolation",
      muscle_direct: def.muscles[0] ?? null, muscle_indirect: def.muscles.slice(1), available: true, cues: null, archived: false,
      legacy_ref: { plan_key: def.key }
    });
  }
  if (missing.length) await local.save("exercises", missing);
  return ids;
}

export function equipmentFrom(profile: Profile | undefined): EquipmentProfile {
  if (!profile) return DEFAULT_EQUIPMENT;
  return {
    ...DEFAULT_EQUIPMENT,
    barKg: Number(profile.bar_kg) || DEFAULT_EQUIPMENT.barKg,
    platesKg: profile.plates_kg?.length ? profile.plates_kg.map(Number) : DEFAULT_EQUIPMENT.platesKg,
    dumbbellRackKg: profile.dumbbells_kg?.length ? profile.dumbbells_kg.map(Number) : [...GYM.dumbbellsKg],
    cableStepLb: Number(profile.cable_step_lb) || DEFAULT_EQUIPMENT.cableStepLb
  };
}

export function activeProgram(programs: Program[]): Program | undefined {
  return programs.find((p) => p.rules?.key === PLAN_KEY && p.status === "active");
}

/** Latest value per lift: squat/deadlift training max; incline/pull-up working load. */
export function latestMaxes(maxes: TrainingMax[], ids: Map<string, string>): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {};
  for (const key of ["squat", "deadlift", "incline_db_press", "weighted_pullup"]) {
    const id = ids.get(key);
    const rows = maxes.filter((m) => m.exercise_id === id).sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.created_at.localeCompare(b.created_at));
    const last = rows[rows.length - 1];
    if (last) out[key] = Number(last.value_kg);
  }
  return out;
}

const weekTypeOf = (s: Session | undefined): string | undefined => (s?.legacy_ref as { plan?: { weekType?: string } } | undefined)?.plan?.weekType;

/**
 * Engine state from the log:
 * - training maxes (squat, deadlift) and the next incline/pull-up load;
 * - for every accessory, the next load from its last session in this plan:
 *   - last set a rep-out (`kind === "rep_out"`): APRE jump from the rep-out reps (§6.1);
 *   - failure isolation: double progression, +2 steps when every set overshoots the range top by ≥ 5 (§6.3);
 *   - otherwise double progression (top of the range on every set → one step up);
 *   - a deload or taper session carries its load forward (those sets are not a test);
 * - from the programme row's adjustments: extra-set muscles and extra main-lift sets (§7);
 * - Sunday rounds from the conditioning log (roundsNextWeek).
 * Flagged sets are ignored.
 */
export function planState(args: {
  program: Program; ids: Map<string, string>; maxes: TrainingMax[]; sessions: Session[]; sets: SetRow[]; equipment: EquipmentProfile;
  /** Conditioning logs, for next Sunday's rounds. */
  conditioning?: Conditioning[];
  /** The adjusted programme (week types for the rounds rule). Defaults to planFor(program). */
  plan?: ProgramDefinition;
}): PlanState {
  const { program, ids, maxes, sessions, sets, equipment } = args;
  const plan = args.plan ?? planFor(program);
  const latest = latestMaxes(maxes, ids);
  const planSessions = new Set(sessions.filter((s) => s.program_id === program.id && s.status === "completed").map((s) => s.id));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const currentLoads: Partial<Record<string, number>> = {};
  if (latest.incline_db_press != null) currentLoads.incline_db_press = latest.incline_db_press;
  if (latest.weighted_pullup != null) currentLoads.weighted_pullup = latest.weighted_pullup;

  const slots = new Map<string, ProgramSlot>();
  for (const d of PLAN.days) for (const s of d.slots) if (s.role !== "main" && !slots.has(s.exerciseKey)) slots.set(s.exerciseKey, s);

  for (const [key, slot] of slots) {
    const id = ids.get(key);
    const mine = sets.filter((s) => s.exercise_id === id && planSessions.has(s.session_id) && s.completed && s.kind !== "warmup" && s.load != null && !isFlagged(s));
    if (!mine.length) continue;
    const lastDate = mine.reduce((d, s) => { const sd = sessionById.get(s.session_id)!.date; return sd > d ? sd : d; }, "");
    const last = mine.filter((s) => sessionById.get(s.session_id)!.date === lastDate);
    const lastLoad = Math.max(...last.map((s) => Number(s.load)));
    const range = slot.scheme?.repRange;
    const weekType = weekTypeOf(sessionById.get(last[0]!.session_id));
    if (!range || weekType === "deload" || weekType === "taper") {
      currentLoads[key] = lastLoad;
      continue;
    }
    const def = PLAN.exercises[key];
    // Cables: the next real pin on that machine's stack; dumbbells: the rack; barbell: 2.5 kg.
    const step = weightsFor(key) ?? (def ? progressionStep(def.equipment, slot.unit, equipment) : 2.5);
    const repOut = slot.scheme?.lastSetRepOut ? last.find((s) => s.kind === "rep_out" && s.reps != null) : undefined;
    if (repOut) {
      const normal = last.filter((s) => s !== repOut).map((s) => s.reps);
      currentLoads[key] = apreNextLoad(Number(repOut.load), repOut.reps!, normal, range, step).load;
    } else if (slot.scheme?.toFailure && last.every((s) => s.kind === "failure")) {
      currentLoads[key] = failureProgression(last.map((s) => ({ load: Number(s.load), reps: s.reps })), range, step)?.load ?? lastLoad;
    } else {
      currentLoads[key] = doubleProgression(last.map((s) => ({ load: Number(s.load), reps: s.reps })), range, step)?.load ?? lastLoad;
    }
  }

  const rounds = args.conditioning ? sundayRoundsFrom(args.conditioning, plan) : undefined;
  return {
    trainingMaxes: {
      ...(latest.squat != null ? { squat: latest.squat } : {}),
      ...(latest.deadlift != null ? { deadlift: latest.deadlift } : {}),
    },
    currentLoads,
    ...adjustmentState(adjustmentsOf(program.rules)),
    ...(rounds !== undefined ? { sundayRounds: rounds } : {})
  };
}

/**
 * This week's planned Sunday rounds from the rounds log, oldest first: after a normal week,
 * roundsNextWeek(rounds done, first-round count, last-round count) — or the rounds done when the counts
 * are missing; deload (half rounds) and test weeks hold the number. Undefined before the first log
 * (the engine then uses the plan's start of 6).
 */
export function sundayRoundsFrom(conditioning: Conditioning[], plan: ProgramDefinition): number | undefined {
  const rule = plan.days.find((d) => d.conditioning?.kind === "rounds")?.conditioning as RoundsRule | undefined;
  if (!rule) return undefined;
  const logs = conditioning
    .filter((c) => c.kind === "rounds" && c.done && c.rounds != null && c.rounds > 0 && c.date >= plan.startDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  let planned: number | undefined;
  for (const c of logs) {
    const type = weekForDate(plan, c.date)?.type;
    if (type === "deload" || type === "test") continue;
    const done = Number(c.rounds);
    planned = c.first_round_count != null && c.last_round_count != null
      ? roundsNextWeek(done, Number(c.first_round_count), Number(c.last_round_count), rule.maxRounds, rule.dropOffFraction)
      : Math.min(rule.maxRounds, done);
  }
  return planned;
}

export type { PrescribedDay };
