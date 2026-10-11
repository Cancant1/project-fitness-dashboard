// Glue between the pure plan engine and the user's data.

import { useMemo } from "react";
import type { LocalStore } from "../data/local";
import type { Exercise, Profile, Program, SetRow, Session, TrainingMax } from "../data/types";
import { buildDumbbellRack, doubleProgression, DEFAULT_EQUIPMENT, progressionStep } from "./engine";
import { STRENGTH_RETURN_PLAN } from "./strengthReturn";
import type { EquipmentProfile, PlanState, PrescribedDay, ProgramDefinition, ProgramSlot } from "./types";

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

export function findExercise(exercises: Exercise[], key: string): Exercise | undefined {
  const name = norm(HISTORY_NAME[key] ?? key);
  return exercises.find((e) => norm(e.name) === name || e.aliases.some((a) => norm(a) === name) || e.legacy_ref?.plan_key === key);
}

/** Plan exercise key → exercise id, for the exercises that exist. */
export function usePlanIds(exercises: Exercise[]): Map<string, string> {
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const def of Object.values(PLAN.exercises)) {
      const e = findExercise(exercises, def.key);
      if (e) m.set(def.key, e.id);
    }
    return m;
  }, [exercises]);
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
    dumbbellRackKg: profile.dumbbells_kg?.length ? profile.dumbbells_kg.map(Number) : buildDumbbellRack(),
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

/**
 * Engine state from the log: training maxes, and for every accessory the next load by double progression
 * from its last session in this plan (top of the range on every set → one step up).
 */
export function planState(args: {
  program: Program; ids: Map<string, string>; maxes: TrainingMax[]; sessions: Session[]; sets: SetRow[]; equipment: EquipmentProfile;
}): PlanState {
  const { program, ids, maxes, sessions, sets, equipment } = args;
  const latest = latestMaxes(maxes, ids);
  const planSessions = new Set(sessions.filter((s) => s.program_id === program.id && s.status === "completed").map((s) => s.id));
  const sessionDate = new Map(sessions.map((s) => [s.id, s.date]));
  const currentLoads: Partial<Record<string, number>> = {};
  if (latest.incline_db_press != null) currentLoads.incline_db_press = latest.incline_db_press;
  if (latest.weighted_pullup != null) currentLoads.weighted_pullup = latest.weighted_pullup;

  const slots = new Map<string, ProgramSlot>();
  for (const d of PLAN.days) for (const s of d.slots) if (s.role !== "main" && !slots.has(s.exerciseKey)) slots.set(s.exerciseKey, s);

  for (const [key, slot] of slots) {
    const id = ids.get(key);
    const mine = sets.filter((s) => s.exercise_id === id && planSessions.has(s.session_id) && s.completed && s.kind !== "warmup" && s.load != null);
    if (!mine.length) continue;
    const lastDate = mine.reduce((d, s) => (sessionDate.get(s.session_id)! > d ? sessionDate.get(s.session_id)! : d), "");
    const last = mine.filter((s) => sessionDate.get(s.session_id) === lastDate);
    const range = slot.scheme?.repRange;
    const def = PLAN.exercises[key];
    const step = def ? progressionStep(def.equipment, slot.unit, equipment) : 2.5;
    const next = range ? doubleProgression(last.map((s) => ({ load: Number(s.load), reps: s.reps })), range, step) : null;
    currentLoads[key] = next?.load ?? Math.max(...last.map((s) => Number(s.load)));
  }

  return {
    trainingMaxes: {
      ...(latest.squat != null ? { squat: latest.squat } : {}),
      ...(latest.deadlift != null ? { deadlift: latest.deadlift } : {}),
    },
    currentLoads
  };
}

export type { PrescribedDay };
