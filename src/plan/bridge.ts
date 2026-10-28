// Glue between the pure plan engine and the user's data.

import { useMemo } from "react";
import type { LocalStore } from "../data/local";
import { useRows } from "../data/context";
import type { Conditioning, Exercise, PainCheck, Profile, Program, SetRow, Session, TrainingMax } from "../data/types";
import { isFlagged } from "../lib/analysis";
import { todayIso } from "../lib/format";
import { adjustmentState, adjustmentsOf, applyAdjustments } from "./adjustments";
import {
  apreNextLoad, capJump, catchUpLoad, doubleProgression, DEFAULT_EQUIPMENT, dumbbellFloor, failureProgression, isBigJump, OVERSHOOT_REPS,
  progressionStep, roundBarbell, stepLoad,
  roundsNextWeek, stuckNormalReps, weekForDate
} from "./engine";
import { STRENGTH_RETURN_PLAN } from "./strengthReturn";
import { GYM, snapDown, weightsFor } from "./equipment";
import { duringScore, isElbowSite, morningBaseline } from "./pain";
import { effortState, holdLoadState, lastLoggedWorkingLoad, recalibrateState, restartState, wristLadderState } from "./stateRules";
import type { SwapHistory } from "./swaps";
import type { EquipmentProfile, PlanState, PrescribedDay, ProgramDefinition, ProgramSlot, RoundsRule, Unit } from "./types";

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
  reverse_grip_pushdown: "Reverse-Grip Pushdown",
  single_arm_cable_curl: "Single-Arm Cable Curl",
  // His rope pushdowns (≈200 sets, to Jun 2025) are logged under "Triceps Pushdown".
  rope_pushdown: "Triceps Pushdown",
  // Bar and rope pushdowns share that history ("Cable Tricep Bar Pushdown" is one of its aliases).
  bar_pushdown: "Triceps Pushdown",
  // Alternatives and swap targets with history (start loads, R1-17). The incline hammer curl's last logged
  // set (12 kg × 12, Sep 2026) is under "Hammer Curl".
  incline_hammer_curl: "Hammer Curl",
  hammer_curl: "Hammer Curl",
  db_lateral_raise: "Lateral Raise (DB)",
  db_curl: "DB Curl",
  heel_elevated_goblet_squat: "Heel-Elevated Goblet Squat",
  single_arm_lat_pulldown: "Single-Arm Lat Pulldown",
  db_reverse_lunge: "Lunges"
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
 *   - a week-0 (calibration) session steps up only when every set went past the range top;
 * - APRE taper (R1-05): once the rep-out load ≥ the last logged working load (12 months before the plan),
 *   the jumps are +5% / +2.5%;
 * - the wrist ladder progresses at its rung's reps (the logged sets' rep range); isometric holds don't count;
 *   R2-15: a rung is earned by a clean session (every set at the reps, pain within the step rule);
 * - R2-04 catch-up: set 1 of a non-elbow failure isolation at ≥ 35 reps → two steps up, past the jump cap; a first
 *   failure set below the range steps one back (the overshoot safety net);
 * - E14 hold: an exercise whose latest pain check was ≥ 4/10 (and not trained since) keeps its load;
 * - E5 stuck incline: normalReps from the incline rep-out history;
 * - from the programme row's adjustments: extra sets, extra main-lift sets (§7), recalibration (E3);
 * - E9 effort, E12 restart and E13 wrist-ladder state from sessions and pain checks (stateRules.ts);
 * - Sunday rounds from the conditioning log (roundsNextWeek).
 * Flagged sets are ignored. Pass `today` for the restart rules that depend on the current gap, and `painChecks`
 * for the pain rules (both optional: without them those parts are left out).
 */
export function planState(args: {
  program: Program; ids: Map<string, string>; maxes: TrainingMax[]; sessions: Session[]; sets: SetRow[]; equipment: EquipmentProfile;
  /** Conditioning logs, for next Sunday's rounds. */
  conditioning?: Conditioning[];
  /** The adjusted programme (week types for the rounds rule). Defaults to planFor(program). */
  plan?: ProgramDefinition;
  /** Pain checks (E9 elbow rule, E13 flare-ups, E14 hold). */
  painChecks?: PainCheck[];
  /** Today (E12: the gap since the last plan session). */
  today?: string;
}): PlanState {
  const { program, ids, maxes, sessions, sets, equipment } = args;
  const plan = args.plan ?? planFor(program);
  const latest = latestMaxes(maxes, ids);
  const completedPlan = sessions.filter((s) => s.program_id === program.id && s.status === "completed" && !s.deleted_at)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  const planSessions = new Set(completedPlan.map((s) => s.id));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const currentLoads: Partial<Record<string, number>> = {};
  if (latest.incline_db_press != null) currentLoads.incline_db_press = latest.incline_db_press;
  if (latest.weighted_pullup != null) currentLoads.weighted_pullup = latest.weighted_pullup;
  const keyOf = new Map([...ids].map(([k, id]) => [id, k]));
  const pain = (args.painChecks ?? []).filter((p) => !p.deleted_at);
  const hold = holdLoadState(pain, keyOf, completedPlan, sets);
  const bigJump: NonNullable<PlanState["bigJump"]> = {};
  const wristKey = PLAN.wristLadder?.exerciseKey;
  let ladderLast: NonNullable<PlanState["wristLadder"]>["last"];

  const slots = new Map<string, ProgramSlot>();
  for (const d of PLAN.days) for (const s of d.slots) if (s.role !== "main" && !slots.has(s.exerciseKey)) slots.set(s.exerciseKey, s);

  for (const [key, slot] of slots) {
    const id = ids.get(key);
    const mine = sets.filter((s) => s.exercise_id === id && planSessions.has(s.session_id) && s.completed && s.kind !== "warmup"
      && s.kind !== "timed" && s.load != null && !isFlagged(s) && !s.deleted_at);
    if (!mine.length) continue;
    const lastDate = mine.reduce((d, s) => { const sd = sessionById.get(s.session_id)!.date; return sd > d ? sd : d; }, "");
    const last = mine.filter((s) => sessionById.get(s.session_id)!.date === lastDate);
    const lastLoad = Math.max(...last.map((s) => Number(s.load)));
    // The wrist ladder progresses at the rung's reps (the logged sets' range), not the slot's first rung.
    const range = key === wristKey ? refOf(last[0]!)?.repRange ?? slot.scheme?.repRange : slot.scheme?.repRange;
    const weekType = weekTypeOf(sessionById.get(last[0]!.session_id));
    if (!range || weekType === "deload" || weekType === "taper") {
      currentLoads[key] = lastLoad;
      continue;
    }
    const def = PLAN.exercises[key];
    // Cables: the next real pin on that machine's stack; dumbbells: the rack; barbell: 2.5 kg.
    const step = weightsFor(key) ?? (def ? progressionStep(def.equipment, slot.unit, equipment) : 2.5);
    if (key === wristKey) {
      // Heavy-slow ladder: same weight within a rung; the engine steps up when the rung's reps drop.
      const reps = range[1];
      const allHit = last.every((s) => s.reps != null && s.reps >= reps);
      const stepped = doubleProgression(last.map((s) => ({ load: Number(s.load), reps: s.reps })), [reps, reps], step)?.load ?? lastLoad;
      ladderLast = { load: lastLoad, reps, allHit, next: stepped };
      currentLoads[key] = lastLoad;
      continue;
    }
    const repOut = slot.scheme?.lastSetRepOut ? last.find((s) => s.kind === "rep_out" && s.reps != null) : undefined;
    let next: number;
    if (weekType === "calibration") {
      // Week 0: sets stop at the range top, so the load goes up only on more reps than the top (plan, "Weights to
      // return with"); otherwise week 1 starts at the same load.
      next = doubleProgression(last.map((s) => ({ load: Number(s.load), reps: s.reps })), [range[0], range[1] + 1], step)?.load ?? lastLoad;
    } else if (repOut) {
      const normal = last.filter((s) => s !== repOut).map((s) => s.reps);
      const before = lastLoggedWorkingLoad(sets, sessions, id, PLAN.startDate, slot.unit);
      const tapered = before != null && Number(repOut.load) >= before - 1e-9;
      next = apreNextLoad(Number(repOut.load), repOut.reps!, normal, range, step, { tapered }).load;
    } else if (slot.scheme?.toFailure && last.every((s) => s.kind === "failure")) {
      next = failureProgression(last.map((s) => ({ load: Number(s.load), reps: s.reps })), range, step)?.load ?? lastLoad;
    } else {
      next = doubleProgression(last.map((s) => ({ load: Number(s.load), reps: s.reps })), range, step)?.load ?? lastLoad;
    }
    // Jump cap (not the care block, whose loads are tiny and not reps-driven): at most +25% at once; a coarser step
    // waits for top + 5 reps on average (elbow-loading moves: on every set).
    if (slot.role !== "shoulder" && !slot.rehab) {
      const logged = last.map((s) => ({ load: Number(s.load), reps: s.reps }));
      const ownRange = slot.scheme?.repRange ?? range;
      const average = !slot.elbowLoading;
      next = capJump(lastLoad, next, logged, ownRange, step, { average });
      // R2-04: a first set at 35+ reps is far too light: two steps once, past the cap (not elbow work).
      const first = [...last].filter((s) => s.kind === "failure").sort((a, b) => a.set_no - b.set_no)[0];
      if (slot.scheme?.toFailure && !slot.elbowLoading && weekType !== "calibration") {
        next = catchUpLoad(lastLoad, next, first?.reps ?? null, step);
      }
      // Safety net (review of R2-04): a first failure set below the range means the load overshot (a catch-up on a
      // coarse stack, say 20 → 40 lb). Double progression never steps down, so one step back here.
      if (slot.scheme?.toFailure && weekType !== "calibration" && first?.reps != null && first.reps < ownRange[0]) {
        next = stepLoad(lastLoad, step, -1);
      }
      const oneUp = stepLoad(lastLoad, step, 1);
      if (Math.abs(next - lastLoad) < 1e-9 && isBigJump(lastLoad, oneUp)) bigJump[key] = { next: oneUp, reps: ownRange[1] + OVERSHOOT_REPS, average };
    }
    // E14: pain 4–5/10 last time → no increase.
    currentLoads[key] = hold[key] ? Math.min(next, lastLoad) : next;
  }

  // E5: incline stuck at 6–9 for 3 rep-outs at one load → the normal sets add reps.
  const normalReps: PlanState["normalReps"] = {};
  for (const lift of ["incline_db_press", "weighted_pullup"] as const) {
    const def = PLAN.mainLifts[lift];
    if (!def.stuck) continue;
    const history = completedPlan.flatMap((sess) => sets.filter((s) => s.session_id === sess.id && s.completed && s.kind === "rep_out"
      && refOf(s)?.mainLift === lift && s.reps != null && s.load != null && !isFlagged(s) && !s.deleted_at)
      .map((s) => ({ load: Number(s.load), reps: s.reps! })));
    // Only rep-outs at the load prescribed next count (a step up resets it).
    const cur = currentLoads[lift];
    const reps = cur != null && history.length && Math.abs(history.at(-1)!.load - cur) < 1e-9 ? stuckNormalReps(history, def) : undefined;
    if (reps != null) normalReps[lift] = reps;
  }

  const holdLoad = Object.fromEntries(Object.entries(hold).filter(([, v]) => v));
  const recalibrate = recalibrateState(adjustmentsOf(program.rules), maxes, ids);
  const restart = restartState(completedPlan.map((s) => s.date), plan, args.today);
  const effort = effortState(completedPlan, pain, plan);
  const wristLadderPain = wristLadderState(pain, plan);
  const earned = wristRungsEarned(plan, completedPlan, sets, ids, pain);
  const wristLadder = wristLadderPain || ladderLast || earned != null
    ? { ...(wristLadderPain ?? {}), ...(ladderLast ? { last: ladderLast } : {}), ...(earned != null ? { earned } : {}) } : undefined;
  const rounds = args.conditioning ? sundayRoundsFrom(args.conditioning, plan) : undefined;
  return {
    trainingMaxes: {
      ...(latest.squat != null ? { squat: latest.squat } : {}),
      ...(latest.deadlift != null ? { deadlift: latest.deadlift } : {}),
    },
    currentLoads,
    ...adjustmentState(adjustmentsOf(program.rules)),
    ...(rounds !== undefined ? { sundayRounds: rounds } : {}),
    ...(Object.keys(normalReps).length ? { normalReps } : {}),
    ...(Object.keys(holdLoad).length ? { holdLoad } : {}),
    ...(Object.keys(bigJump).length ? { bigJump } : {}),
    ...(Object.keys(recalibrate).length ? { recalibrate } : {}),
    ...(restart ? { restart } : {}),
    ...(effort ? { effort } : {}),
    ...(wristLadder ? { wristLadder } : {})
  };
}

const refOf = (s: SetRow) => (s.legacy_ref as { plan?: { mainLift?: string; repRange?: [number, number] } } | null)?.plan;

/**
 * E15: what swapStartLoad needs, from the rows: the latest clean working set of an exercise (by plan key or
 * history name), the current plan loads, the 7-day bodyweight and how loads snap to the target's equipment.
 */
export function swapHistory(args: {
  today: string; exercises: Exercise[]; sessions: Session[]; sets: SetRow[]; state: PlanState; bodyweightKg: number | null;
  equipment?: EquipmentProfile;
}): SwapHistory {
  const sessionDate = new Map(args.sessions.filter((s) => !s.deleted_at).map((s) => [s.id, s.date]));
  const equipment = args.equipment ?? DEFAULT_EQUIPMENT;
  const slotOf = (key: string): ProgramSlot | undefined =>
    PLAN.days.flatMap((d) => d.slots).find((s) => s.exerciseKey === key) ?? PLAN.alternativeSlots?.[key];
  return {
    today: args.today,
    bodyweightKg: args.bodyweightKg,
    latest: (key) => {
      const ex = findExercise(args.exercises, key);
      if (!ex) return null;
      const rows = args.sets.filter((s) => s.exercise_id === ex.id && s.completed && s.kind !== "warmup" && s.kind !== "timed"
        && s.load != null && !isFlagged(s) && !s.deleted_at && sessionDate.has(s.session_id) && sessionDate.get(s.session_id)! <= args.today);
      if (!rows.length) return null;
      const date = rows.reduce((d, s) => (sessionDate.get(s.session_id)! > d ? sessionDate.get(s.session_id)! : d), "");
      const day = rows.filter((s) => sessionDate.get(s.session_id) === date);
      const top = day.reduce((a, b) => (Number(b.load_kg ?? 0) > Number(a.load_kg ?? 0) ? b : a));
      const unit = (slotOf(key)?.unit ?? (top.unit as Unit)) as Unit;
      const load = top.unit === unit ? Number(top.load) : unit === "lb" ? Number(top.load_kg) * 2.20462 : Number(top.load_kg);
      return { load, unit, date };
    },
    current: (key) => {
      const slot = slotOf(key);
      const load = args.state.currentLoads[key] ?? slot?.startLoad;
      return load != null ? { load, unit: slot?.unit ?? "kg" } : null;
    },
    snap: (key, load, unit) => {
      const pins = weightsFor(key);
      if (pins) return snapDown(load, pins);
      const def = PLAN.exercises[key];
      if (unit === "lb") return Math.floor(load / 5) * 5;
      if (def?.equipment === "dumbbell" || /db_|dumbbell/.test(key)) return dumbbellFloor(load, equipment.dumbbellRackKg) ?? load;
      return roundBarbell(load);
    }
  };
}



/**
 * R2-15: wrist-ladder rungs earned, oldest session first. A session at rung i that is clean (every set at the rung's
 * reps, no wrist-extension pain above stepRule.maxPain that day, and no elbow morning score above the baseline +
 * stepRule.morningRise the morning after) earns rung i + 1; otherwise the ladder holds at rung i. Isometric
 * sessions don't count. Undefined without a step rule or before the first ladder session.
 */
export function wristRungsEarned(plan: ProgramDefinition, completedPlan: readonly Session[], sets: readonly SetRow[],
  ids: Map<string, string>, pain: readonly PainCheck[]): number | undefined {
  const ladder = plan.wristLadder;
  const id = ladder ? ids.get(ladder.exerciseKey) : undefined;
  if (!ladder?.stepRule || !id) return undefined;
  const rule = ladder.stepRule;
  let earned: number | undefined;
  for (const sess of completedPlan) {
    const mine = sets.filter((x) => x.session_id === sess.id && x.exercise_id === id && x.completed && x.kind === "working"
      && x.reps != null && !x.deleted_at);
    if (!mine.length) continue;
    const reps = refOf(mine[0]!)?.repRange?.[1] ?? Math.max(...mine.map((x) => x.reps!));
    const rung = ladder.rungs.findIndex((r) => r.reps === reps);
    if (rung < 0) continue;
    const allHit = mine.every((x) => x.reps! >= reps);
    const hurt = pain.some((p) => p.date === sess.date && p.exercise_id === id && (duringScore(p) ?? 0) > rule.maxPain);
    const morning = pain.some((p) => p.date === sess.date && isElbowSite(p.site) && p.morning_score != null
      && Number(p.morning_score) > morningBaseline(pain, p.site, p.date) + rule.morningRise);
    const clean = allHit && !hurt && !morning;
    earned = Math.max(earned ?? 0, clean ? rung + 1 : rung);
  }
  return earned == null ? undefined : Math.min(earned, ladder.rungs.length - 1);
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
