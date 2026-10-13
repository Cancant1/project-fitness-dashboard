// @vitest-environment node
// Research round 1, Part E (docs/R1_BUILD.md): engine, plan data and engine state.
import "fake-indexeddb/auto";
import { dayIn, World } from "../coach/testkit";
import { LocalStore } from "../data/local";
import type { PainCheck, Program, Session, SetRow, TrainingMax } from "../data/types";
import { applyAdjustments, type Adjustment } from "./adjustments";
import { PLAN, ensurePlanExercises, planState } from "./bridge";
import { EFFORT_LABEL, effortLabel, loggedEffort, setEffort } from "./effort";
import {
  DEFAULT_EQUIPMENT, apreNextLoad, arrangePairs, incrementAfterRepOut, prescribeDay, prescribeMinimum, prescribeWeek, stuckNormalReps,
  systemMassE1rm, trainingMaxAfterRepOut, validatePairs, wristLadderDose
} from "./engine";
import { duringSetFrom, duringScore, elbowMonthlyOf, elbowMonthlyRow, isMorningFlare, morningBaseline, painAction, painCheckRow } from "./pain";
import { effortState, holdLoadState, recalibrateState, restartState, wristLadderState } from "./stateRules";
import { CREATINE_START, VARIETY_NOTE } from "./strengthReturn";
import { swapLabel, swapStartLoad, type SwapHistory } from "./swaps";
import type { PlanState, PrescribedExercise, PrescribedSet, ProgramDefinition } from "./types";
import { maxUpdates, planRef, startWorkout } from "./workout";

const STATE: PlanState = { trainingMaxes: { squat: 140, deadlift: 200 }, currentLoads: { incline_db_press: 22.5, weighted_pullup: 5 } };
const day = (week: number, key: Parameters<typeof prescribeDay>[2], state: PlanState = STATE) => prescribeDay(PLAN, week, key, state);
const ex = (week: number, key: Parameters<typeof prescribeDay>[2], exerciseKey: string, state: PlanState = STATE): PrescribedExercise => {
  const e = day(week, key, state).exercises.find((x) => x.exerciseKey === exerciseKey);
  if (!e) throw new Error(`${exerciseKey} not in week ${week} ${key}`);
  return e;
};
const shape = (sets: PrescribedSet[]) => sets.map((s) => [s.kind, s.load, s.reps]);
const notWarmup = (sets: PrescribedSet[]) => sets.filter((s) => s.kind !== "warmup");
const efforts = (e: PrescribedExercise) => e.sets.map((s) => setEffort(e, s));
const EQ = { ...DEFAULT_EQUIPMENT, dumbbellRackKg: DEFAULT_EQUIPMENT.dumbbellRackKg };

let seq = 0;
const pain = (date: string, site: string, patch: Partial<PainCheck> = {}): PainCheck => ({
  id: `p${seq++}`, user_id: "u", created_at: `${date}T20:00:00Z`, updated_at: `${date}T20:00:00Z`, date, site, exercise_id: null,
  session_id: null, during_set: null, next_morning: null, worse_than_last: null, note: null, pain_score: null, morning_score: null, ...patch
});

describe("E1 effort per exercise and set", () => {
  it("main lift: controlled normal sets, easy warm-ups, a max rep-out", () => {
    const squat = ex(1, "lower_a", "squat");
    expect(squat.effort).toBe("controlled");
    expect(efforts(squat)).toEqual(["easy", "easy", "easy", "easy", "controlled", "controlled", "controlled", "max"]);
    expect(squat.sets.at(-1)!.effort).toBe("max");
    expect(squat.sets.at(-2)!.effort).toBeUndefined(); // only where it differs
    expect(ex(1, "lower_b", "deadlift").effort).toBe("max"); // ramp + one top-set rep-out
    expect(ex(7, "lower_b", "deadlift").effort).toBe("controlled");
  });
  it("accessories: rep-out-last compounds controlled + max, isolation failure, shoulder block easy, wrist ladder care", () => {
    expect(efforts(ex(1, "lower_a", "romanian_deadlift"))).toEqual(["controlled", "controlled", "max"]);
    expect(ex(1, "lower_a", "cable_lateral_raise").effort).toBe("failure");
    expect(ex(1, "upper_a", "prone_y_raise").effort).toBe("easy");
    expect(ex(1, "lower_a", "wrist_extension").effort).toBe("care");
    expect(ex(0, "lower_a", "romanian_deadlift").effort).toBe("controlled"); // calibration: easy sets stop at the top of the range
    expect(ex(7, "lower_a", "cable_lateral_raise").effort).toBe("controlled"); // deload: not to failure
  });
  it("labels", () => {
    expect(effortLabel("controlled", 5)).toBe("Stop at 5 reps, even if more are there");
    expect(effortLabel("max")).toBe(EFFORT_LABEL.max);
    expect(effortLabel("max", null, 12)).toBe("Max set: go until a stop sign; count clean reps. Stop at 12 even if more are there");
    expect(effortLabel("care")).toBe("Slow, 3 s up / 3 s down, last 1–2 reps hard but clean");
    expect(effortLabel("stop_sign")).toBe("Hard, but stop at the first stop sign");
  });
  it("logged sets: the plan ref's effort, else inferred from the kind (rows from before R1)", () => {
    expect(loggedEffort("working", { effort: "stop_sign" })).toBe("stop_sign");
    expect(loggedEffort("warmup")).toBe("easy");
    expect(loggedEffort("timed")).toBe("easy");
    expect(loggedEffort("rep_out", { exerciseKey: "squat" })).toBe("max");
    expect(loggedEffort("failure", { exerciseKey: "cable_lateral_raise" })).toBe("failure");
    expect(loggedEffort("working", { exerciseKey: "face_pull", role: "shoulder" })).toBe("easy");
    expect(loggedEffort("working", { exerciseKey: "wrist_extension" })).toBe("care");
    expect(loggedEffort("backoff", { exerciseKey: "deadlift" })).toBe("controlled");
    expect(loggedEffort("working", null)).toBe("controlled");
  });
  it("startWorkout writes the resolved effort, pair and cap into each set's plan ref", async () => {
    const local = new LocalStore(`r1-${Date.now()}-a`);
    await local.open();
    const ids = await ensurePlanExercises(local);
    const [program] = await local.save("programs", { name: "SRP", start_date: "2026-10-12", weeks: 20, status: "active", rules: { key: "strength-return-2026" }, goals: [], notes: null });
    const d = prescribeDay(PLAN, 1, "upper_a", { ...STATE, restart: { capRepOutsFrom: "2026-10-19" } });
    const id = await startWorkout(local, program as Program, d, ids, "2026-10-20");
    const sets = local.all("sets").filter((s) => s.session_id === id);
    const flye = sets.filter((s) => planRef(s)?.exerciseKey === "chest_cable_flye");
    expect(planRef(flye[0]!)).toMatchObject({ effort: "failure" });
    expect(planRef(flye[0]!)?.pair).toBeUndefined(); // 12 Oct: no cable+cable pairs
    const monId = await startWorkout(local, program as Program, prescribeDay(PLAN, 1, "lower_a", STATE), ids, "2026-10-19");
    const ham = local.all("sets").find((s) => s.session_id === monId && planRef(s)?.exerciseKey === "lying_db_hamstring_curl")!;
    expect(planRef(ham)).toMatchObject({ effort: "failure", pair: "mon_1", pairLabel: "A", restSec: 50 });
    const repOut = sets.find((s) => planRef(s)?.exerciseKey === "incline_db_press" && s.kind === "rep_out")!;
    expect(planRef(repOut)).toMatchObject({ effort: "max", capReps: 10, target: 8 });
    expect(repOut.target_reps).toBe("8–10");
    expect(planRef(sets.find((s) => s.kind === "warmup")!)?.effort).toBe("easy");
  });
});

describe("E2 minimum session", () => {
  it("Lower A: squat ramp + rep-out, then one hard set of the first 2 accessories; counts as working sets", () => {
    const m = prescribeMinimum(PLAN, 1, "lower_a", STATE);
    expect(m).toMatchObject({ minimum: true, minutes: 30, kind: "lifting" });
    expect(m.exercises.map((e) => e.exerciseKey)).toEqual(["squat", "romanian_deadlift", "lying_db_hamstring_curl"]);
    expect(shape(notWarmup(m.exercises[0]!.sets))).toEqual([["rep_out", 100, null]]);
    expect(m.exercises[0]!.effort).toBe("max");
    expect(shape(m.exercises[1]!.sets)).toEqual([["rep_out", 80, null]]); // rep-out-last compound: one rep-out to a stop sign
    expect(m.exercises[2]).toMatchObject({ effort: "failure" });
    expect(shape(m.exercises[2]!.sets)).toEqual([["failure", 25, null]]);
    expect(m.workingSetCount).toBe(3);
    expect(m.exercises.some((e) => e.pair)).toBe(false);
  });
  it("Upper days: one pull and one push; the shoulder block and care work are left out", () => {
    expect(prescribeMinimum(PLAN, 1, "upper_a", STATE).exercises.map((e) => e.exerciseKey))
      .toEqual(["incline_db_press", "weighted_pullup", "seated_cable_row", "chest_cable_flye"]);
    expect(prescribeMinimum(PLAN, 1, "upper_b", STATE).exercises.map((e) => e.exerciseKey)).toEqual(["barbell_row", "db_bench_press"]);
    expect(prescribeMinimum(PLAN, 1, "lower_b", STATE).exercises.map((e) => e.exerciseKey))
      .toEqual(["deadlift", "bulgarian_split_squat", "seated_cable_leg_curl"]);
  });
  it("deload weeks keep the deload main-lift work; accessories stop at the top of the range", () => {
    const m = prescribeMinimum(PLAN, 7, "lower_a", STATE);
    expect(shape(notWarmup(m.exercises[0]!.sets))).toEqual([["working", 82.5, 5], ["working", 82.5, 5], ["working", 82.5, 5]]);
    expect(shape(m.exercises[1]!.sets)).toEqual([["working", 80, 10]]);
  });
  it("no extra sets or checkpoint fallbacks", () => {
    const s: PlanState = { ...STATE, addMainLiftSet: { squat: true, incline_db_press: true }, extraSetTargets: PLAN.extraSets!.arms.targets };
    expect(prescribeMinimum(PLAN, 8, "upper_a", s).exercises.find((e) => e.exerciseKey === "incline_db_press")!.sets.filter((x) => x.kind !== "warmup")).toHaveLength(1);
    expect(prescribeMinimum(PLAN, 1, "lower_b", s).exercises.map((e) => e.exerciseKey)).not.toContain("squat");
  });
  it("startWorkout(..., { minimum: true }) stores legacy_ref.plan.minimum", async () => {
    const local = new LocalStore(`r1-${Date.now()}-b`);
    await local.open();
    const ids = await ensurePlanExercises(local);
    const [program] = await local.save("programs", { name: "SRP", start_date: "2026-10-12", weeks: 20, status: "active", rules: { key: "strength-return-2026" }, goals: [], notes: null });
    const id = await startWorkout(local, program as Program, prescribeMinimum(PLAN, 1, "lower_a", STATE), ids, "2026-10-19", { minimum: true });
    expect((local.get("sessions", id)!.legacy_ref as { plan: { minimum?: boolean } }).plan.minimum).toBe(true);
  });
});

describe("E3 missed week (skip_deload) and recalibration", () => {
  const adj = (data: Adjustment["data"], created = "2026-11-24T08:00:00Z", signalId = "consistency.missed_week"): Adjustment =>
    ({ id: `a${seq++}`, kind: data.kind, created, signalId, data });
  it("skip_deload: week 7 becomes a normal C week with week 6's notes minus the checkpoint", () => {
    const p = applyAdjustments(PLAN, [adj({ kind: "skip_deload", weekNo: 7 })]);
    expect(p.weeks[7]).toMatchObject({ type: "C", label: "Week C", deloadSkipped: true });
    expect(p.weeks[7]!.notes.some((n) => /checkpoint/i.test(n))).toBe(false);
    expect(p.weeks).toHaveLength(20);
    expect(prescribeWeek(p, 7, STATE).reduce((n, d) => n + d.workingSetCount, 0)).toBe(72);
    expect(applyAdjustments(PLAN, [adj({ kind: "skip_deload", weekNo: 8 })]).weeks[8]!.type).toBe("A"); // not a deload: unchanged
  });
  it("recalibrate: each TM lift without a new TM row gets a calibration rep-out at 75% of the last TM", () => {
    const ids = new Map([["squat", "sq"], ["deadlift", "dl"]]);
    const tm = (exercise_id: string, effective_date: string, value_kg: number, reason: TrainingMax["reason"] = "rep_out"): TrainingMax =>
      ({ id: `t${seq++}`, user_id: "u", created_at: effective_date, updated_at: effective_date, exercise_id, program_id: null, effective_date, value_kg, reason, source_set_id: null, note: null });
    const a = [adj({ kind: "recalibrate" }, "2026-12-01T08:00:00Z", "consistency.long_break")];
    expect(recalibrateState(a, [tm("sq", "2026-10-26", 145), tm("dl", "2026-10-30", 205)], ids)).toEqual({ squat: 107.5, deadlift: 152.5 });
    expect(recalibrateState(a, [tm("sq", "2026-10-26", 145), tm("sq", "2026-12-07", 140, "calibration")], ids)).toEqual({});
    const squat = ex(9, "lower_a", "squat", { ...STATE, recalibrate: { squat: 107.5 } });
    expect(shape(notWarmup(squat.sets))).toEqual([["rep_out", 107.5, null]]);
    expect(squat.sets.at(-1)).toMatchObject({ calibration: true });
    expect(squat.sets.at(-1)!.target).toBeUndefined();
  });
  it("maxUpdates treats a recalibration rep-out as a calibration (provisional past 12 reps)", () => {
    const set = { id: "s1", kind: "rep_out", completed: true, reps: 15, load: 107.5, legacy_ref: { plan: { exerciseKey: "squat", role: "main", mainLift: "squat", restSec: 240, calibration: true } } } as unknown as SetRow;
    const session = { id: "x", date: "2026-12-07", legacy_ref: { plan: { weekType: "A" } } } as unknown as Session;
    const ids = new Map([["squat", "sq"]]);
    const maxes = [{ id: "t", exercise_id: "sq", effective_date: "2026-10-26", created_at: "x", value_kg: 145, source_set_id: null }] as unknown as TrainingMax[];
    expect(maxUpdates(session, [set], ids, maxes, EQ)).toEqual([expect.objectContaining({ lift: "squat", to: 150, reason: "calibration", provisional: true })]);
  });
});

describe("E4 TM cap past the old best (squat 165, deadlift 235)", () => {
  it("at or past the old best: a hit holds, a beat adds at most 2.5 kg, misses as usual", () => {
    expect(PLAN.oldBestE1rm).toEqual({ squat: 165, deadlift: 235 });
    const r = (prev: number, reps: number, target = 6) => trainingMaxAfterRepOut(120, reps, { previous: prev, target, oldBest: 165 });
    expect(r(165, 6)).toMatchObject({ tm: 165, capped: true });
    expect(r(165, 9)).toMatchObject({ tm: 167.5, capped: true });
    expect(r(165, 4)).toMatchObject({ tm: 157.5 }); // −5%, not capped
    expect(r(160, 9)).toMatchObject({ tm: 167.5 }); // below the old best: +4% as usual
    expect(r(160, 9).capped).toBeUndefined();
  });
});

describe("E5 step jumps and the stuck rule", () => {
  it("incline ≥16 → +2 dumbbells, ≥10 +1, 6–9 same, ≤5 −1; pull-up ≥12 → +5, ≥10 +2.5, ≤5 −2.5", () => {
    expect(incrementAfterRepOut("incline_db_press", 22.5, 16)).toEqual({ load: 27.5, direction: 2 });
    expect(incrementAfterRepOut("incline_db_press", 22.5, 15)).toEqual({ load: 25, direction: 1 });
    expect(incrementAfterRepOut("weighted_pullup", 5, 12)).toEqual({ load: 10, direction: 2 });
    expect(incrementAfterRepOut("weighted_pullup", 5, 11)).toEqual({ load: 7.5, direction: 1 });
    expect(incrementAfterRepOut("weighted_pullup", 5, 5)).toEqual({ load: 2.5, direction: -1 });
  });
  it("stuck at 6–9 for 3 rep-outs at one load → normal sets of 6, then 7; a load change resets", () => {
    const def = PLAN.mainLifts.incline_db_press;
    const h = (xs: [number, number][]) => xs.map(([load, reps]) => ({ load, reps }));
    expect(stuckNormalReps(h([[22.5, 7], [22.5, 8]]), def)).toBeUndefined();
    expect(stuckNormalReps(h([[22.5, 7], [22.5, 8], [22.5, 9]]), def)).toBe(6);
    expect(stuckNormalReps(h([[22.5, 7], [22.5, 8], [22.5, 9], [22.5, 6]]), def)).toBe(7);
    expect(stuckNormalReps(h([[20, 7], [20, 8], [22.5, 9]]), def)).toBeUndefined();
    expect(stuckNormalReps(h([[22.5, 7], [22.5, 8], [22.5, 9]]), PLAN.mainLifts.weighted_pullup)).toBeUndefined(); // incline only
    const sets = notWarmup(ex(4, "upper_a", "incline_db_press", { ...STATE, normalReps: { incline_db_press: 6 } }).sets);
    expect(shape(sets)).toEqual([["working", 22.5, 6], ["working", 22.5, 6], ["working", 22.5, 6], ["rep_out", 22.5, null]]);
  });
  it("planState: three stuck incline rep-outs → normalReps 6", () => {
    const w = new World();
    for (const n of [1, 2, 3]) {
      w.session(dayIn(n, "upper_a"), "upper_a", { reps: (e, p) => (e.mainLift === "incline_db_press" && p.kind === "rep_out" ? 7 : undefined) });
      w.tm(dayIn(n, "upper_a"), "incline_db_press", 22.5);
    }
    expect(w.data().state.normalReps).toEqual({ incline_db_press: 6 });
  });
  it("pull-up e1RM uses system mass", () => {
    expect(systemMassE1rm(10, 6, 75)).toBeCloseTo(85 * 1.2, 10);
  });
});

describe("E6 APRE taper once back at the last logged working load", () => {
  it("+5% / +2.5% instead of +7.5% / +5% (at least one step)", () => {
    expect(apreNextLoad(100, 20, [10, 10], [6, 10], 2.5).load).toBe(107.5);
    expect(apreNextLoad(100, 20, [10, 10], [6, 10], 2.5, { tapered: true }).load).toBe(105);
    expect(apreNextLoad(100, 14, [10, 10], [6, 10], 2.5, { tapered: true }).load).toBe(102.5);
    expect(apreNextLoad(80, 13, [10, 10], [6, 10], 2.5, { tapered: true }).load).toBe(82.5);
  });
  it("planState uses the heaviest unflagged working load of the 12 months before the plan", () => {
    const run = (history: boolean) => {
      const w = new World();
      if (history) {
        w.tables.sessions.push({
          id: "old", user_id: "u1", created_at: "x", updated_at: "x", date: "2026-05-04", title: "Legs", status: "completed", started_at: null, ended_at: null,
          duration_min: null, program_id: null, program_week_no: null, program_day_id: null, energy: null, notes: null, date_confidence: "exact",
          date_basis: null, source: "import", legacy_ref: {}
        });
        w.tables.sets.push({ id: "old-set", user_id: "u1", created_at: "x", updated_at: "x", session_id: "old", exercise_id: w.ids.get("romanian_deadlift")!, exercise_position: 1, set_no: 1, kind: "working", load: 100, unit: "kg", load_kg: 100, reps: 8, duration_s: null, rpe: null, target_reps: null, target_load: null, completed: true, flags: [], note: null, exercise_as_logged: "RDL", legacy_ref: {} });
      }
      w.session(dayIn(1, "lower_a"), "lower_a", {
        load: (e) => (e.exerciseKey === "romanian_deadlift" ? 100 : undefined),
        reps: (e, p) => (e.exerciseKey === "romanian_deadlift" && p.kind === "rep_out" ? 20 : undefined)
      });
      return w.data().state.currentLoads.romanian_deadlift;
    };
    expect(run(false)).toBe(107.5);
    expect(run(true)).toBe(105);
  });
});

describe("E8 extra sets at checkpoint 1 (R1-08)", () => {
  it("+1 set on each arm exercise on Tue and Sat in the A–D weeks 8–17 (+2 biceps, +2 triceps); the Tuesday rear delt set only on request", () => {
    const arms: PlanState = { ...STATE, extraSetTargets: PLAN.extraSets!.arms.targets };
    expect(ex(8, "upper_a", "bayesian_curl", arms).sets).toHaveLength(3);
    expect(ex(8, "upper_a", "overhead_cable_triceps_extension", arms).sets).toHaveLength(3);
    expect(ex(9, "upper_b", "underhand_cable_curl", arms).sets).toHaveLength(3);
    expect(ex(9, "upper_b", "reverse_grip_pushdown", arms).sets).toHaveLength(3);
    const total = (s: PlanState, n: number) => prescribeWeek(PLAN, n, s).reduce((k, d) => k + d.workingSetCount, 0);
    expect(total(arms, 8)).toBe(76);
    expect(total(arms, 11)).toBe(76);
    expect(total(arms, 17) - total(STATE, 17)).toBe(4);
    for (const w of [6, 7, 10, 18, 19]) expect(total(arms, w)).toBe(total(STATE, w));
    expect(day(8, "upper_a", arms).exercises.map((e) => e.exerciseKey)).not.toContain("cable_rear_delt_fly");
    const both: PlanState = { ...arms, extraSetTargets: [...PLAN.extraSets!.arms.targets, ...PLAN.extraSets!.rearDelt.targets] };
    const tue = day(8, "upper_a", both).exercises;
    const rear = tue.find((e) => e.exerciseKey === "cable_rear_delt_fly")!;
    expect(rear.sets).toHaveLength(1);
    expect(tue.some((e) => e.pair)).toBe(false); // straight sets: Upper A is all cables
    expect(total(both, 8)).toBe(77);
  });
});

describe("E9 effort rule for the elbow and bad days", () => {
  it("elbow pain ≥ 4/10 → elbow-loading isolation ends at the stop sign for 14 days", () => {
    const e = effortState([], [pain("2026-10-20", "right_elbow", { pain_score: 4 })], PLAN)!;
    expect(e).toEqual({ elbowIrritableFrom: "2026-10-20", elbowIrritableUntil: "2026-11-03" });
    const s: PlanState = { ...STATE, effort: e };
    const bay = ex(1, "upper_a", "bayesian_curl", s);
    expect(bay.effort).toBe("stop_sign");
    expect(bay.notes.join(" ")).toContain("Elbow irritable");
    expect(ex(1, "upper_a", "cable_lateral_raise", s).effort).toBe("failure"); // not elbow-loading
    expect(ex(1, "lower_a", "cross_body_triceps_extension", s).effort).toBe("failure"); // before the check
    expect(ex(2, "upper_b", "underhand_cable_curl", s).effort).toBe("stop_sign");
    expect(ex(3, "upper_b", "underhand_cable_curl", s).effort).toBe("failure"); // 7 Nov: past the 14 days
    expect(effortState([], [pain("2026-10-20", "right_elbow", { pain_score: 3 }), pain("2026-10-20", "right_shoulder", { pain_score: 6 })], PLAN)).toBeUndefined();
    expect(effortState([], [pain("2026-10-20", "right_elbow", { during_set: "sharp" })], PLAN)?.elbowIrritableUntil).toBe("2026-11-03");
  });
  it("the last 2 sessions felt ≤ 2/5 → all isolation that week, compounds keep failure", () => {
    const w = new World();
    w.session(dayIn(1, "lower_a"), "lower_a", { energy: 2 });
    w.session(dayIn(1, "upper_a"), "upper_a", { energy: 1 });
    const e = w.data().state.effort;
    expect(e).toEqual({ lowFeelWeekNo: 1 });
    const s: PlanState = { ...STATE, effort: e };
    expect(ex(1, "upper_b", "cable_lateral_raise", s).effort).toBe("stop_sign");
    expect(ex(1, "upper_b", "lat_pulldown", s).effort).toBe("failure");
    expect(ex(2, "upper_b", "cable_lateral_raise", s).effort).toBe("failure");
  });
});

describe("E10 triceps ranges 12–20", () => {
  it("reverse-grip pushdown, overhead and cross-body extension", () => {
    for (const [d, k] of [["lower_a", "cross_body_triceps_extension"], ["upper_a", "overhead_cable_triceps_extension"], ["upper_b", "reverse_grip_pushdown"]] as const) {
      expect(ex(1, d, k).sets[0]!.repRange).toEqual([12, 20]);
    }
  });
});

describe("E11 pairs (P-TIMESAVE)", () => {
  it("default pairs; never two elbow-loading moves or two cable stations in one pair", () => {
    expect(validatePairs(PLAN)).toEqual([]);
    const pairs = Object.fromEntries(PLAN.days.map((d) => [d.key, d.slots.filter((s) => s.pair).map((s) => `${s.pair}:${s.exerciseKey}`)]));
    expect(pairs.upper_a).toEqual([]);
    expect(pairs.upper_b).toEqual([]);
    expect(pairs.lower_a).toEqual(["mon_1:lying_db_hamstring_curl", "mon_1:cross_body_triceps_extension"]);
    expect(pairs.lower_b).toEqual(["fri_1:hanging_knee_raise", "fri_1:cable_lateral_raise"]);
    const withPair = (dayKey: string, keys: string[]): ProgramDefinition => ({ ...PLAN, days: PLAN.days.map((d) => (d.key === dayKey
      ? { ...d, slots: d.slots.map((s) => (keys.includes(s.exerciseKey) ? { ...s, pair: "x" } : s)) } : d)) });
    expect(validatePairs(withPair("upper_a", ["bayesian_curl", "overhead_cable_triceps_extension"])))
      .toContain("upper_a x: bayesian_curl + overhead_cable_triceps_extension both load the elbow");
    expect(validatePairs(withPair("upper_a", ["chest_cable_flye", "bayesian_curl"])))
      .toEqual(["upper_a x: chest_cable_flye + bayesian_curl need more than one cable station"]);
    expect(validatePairs(withPair("lower_a", ["cable_calf_raise", "lying_db_hamstring_curl"])).join(" ")).toContain("cable station");
  });
  it("members are adjacent, A rests 45–60 s (50), the last member 75 s", () => {
    const fri = day(1, "lower_b").exercises;
    const k = fri.findIndex((e) => e.exerciseKey === "hanging_knee_raise");
    expect(fri.slice(k, k + 2).map((e) => [e.exerciseKey, e.pairLabel, e.restSec])).toEqual([
      ["hanging_knee_raise", "A", 50], ["cable_lateral_raise", "B", 75]
    ]);
    expect(fri.map((e) => e.order)).toEqual(fri.map((_, i) => i + 1));
    const mon = day(1, "lower_a").exercises.map((e) => e.exerciseKey);
    expect(mon.indexOf("cross_body_triceps_extension")).toBe(mon.indexOf("lying_db_hamstring_curl") + 1);
    // A pair with one member left that day is a straight set.
    const solo = arrangePairs([{ ...fri[0]!, pair: "x" }]);
    expect(solo[0]!.pair).toBeUndefined();
  });
});

describe("E12 restart after a break", () => {
  it("restartState: gap ≥ 10 days caps the next rep-outs; ≥ 14 days marks the first week back", () => {
    expect(restartState(["2026-10-19"], PLAN, "2026-10-28")).toBeUndefined();
    expect(restartState(["2026-10-19"], PLAN, "2026-10-31")).toEqual({ capRepOutsFrom: "2026-10-31" });
    expect(restartState(["2026-10-19"], PLAN, "2026-11-03")).toEqual({ capRepOutsFrom: "2026-11-03", firstWeekNo: 3 });
    expect(restartState(["2026-10-12", "2026-10-30"], PLAN, "2026-10-31")).toEqual({ firstWeekNo: 2 });
    expect(restartState([], PLAN, "2026-10-31")).toBeUndefined();
  });
  it("capped rep-outs: target + 2 on sessions dated within 6 days of the cap date", () => {
    const s: PlanState = { ...STATE, restart: { capRepOutsFrom: "2026-10-19" } };
    expect(ex(1, "lower_a", "squat", s).sets.at(-1)).toMatchObject({ kind: "rep_out", target: 10, capReps: 12, effort: "max" });
    expect(ex(1, "lower_a", "squat", s).sets.at(-1)!.note).toContain("Stop at 12 even if more are there.");
    expect(ex(1, "lower_b", "deadlift", s).sets.at(-1)).toMatchObject({ capReps: 9 });
    expect(ex(2, "lower_a", "squat", s).sets.at(-1)!.capReps).toBeUndefined();
    expect(ex(1, "lower_a", "romanian_deadlift", s).sets.at(-1)!.capReps).toBeUndefined(); // accessories have no target
  });
  it("first week back: failure → stop sign, no extra sets, no main-lift additions", () => {
    const s: PlanState = { ...STATE, restart: { firstWeekNo: 8 }, extraSetTargets: PLAN.extraSets!.arms.targets, addMainLiftSet: { squat: true, deadlift: true, incline_db_press: true } };
    expect(ex(8, "upper_a", "bayesian_curl", s).sets).toHaveLength(2);
    expect(ex(8, "upper_a", "bayesian_curl", s).effort).toBe("stop_sign");
    expect(ex(8, "upper_b", "lat_pulldown", s).effort).toBe("stop_sign");
    expect(notWarmup(ex(8, "upper_a", "incline_db_press", s).sets)).toHaveLength(4);
    expect(day(8, "lower_b", s).exercises.map((e) => e.exerciseKey)).not.toContain("squat");
    expect(ex(9, "upper_a", "bayesian_curl", s).sets).toHaveLength(3);
  });
});

describe("E13 wrist ladder", () => {
  const L = PLAN.wristLadder!;
  it("3 sets on Mon and Fri; reps 15 → 12 → 10 → 8 → 6 by week; then 2 × 8 on Friday only", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 8, 9, 12].map((w) => wristLadderDose(L, w, "lower_a")?.reps)).toEqual([15, 15, 12, 12, 10, 10, 8, 8, 6, 6]);
    expect(wristLadderDose(L, 13, "lower_a")).toBeNull();
    expect(wristLadderDose(L, 13, "lower_b")).toEqual({ sets: 2, reps: 8 });
    expect(wristLadderDose(L, 3, "upper_a")).toBeNull();
    expect(wristLadderDose(L, 4, "lower_a", 1)?.reps).toBe(12); // one rung back after a flare-up
    const mon = ex(2, "lower_a", "wrist_extension");
    expect(mon).toMatchObject({ effort: "care", rehab: true });
    expect(shape(mon.sets)).toEqual([["working", 4, 12], ["working", 4, 12], ["working", 4, 12]]);
    expect(day(2, "lower_a").workingSetCount).toBe(19); // care work: not counted
    expect(shape(ex(14, "lower_b", "wrist_extension").sets)).toEqual([["working", 4, 8], ["working", 4, 8]]);
    expect(day(14, "lower_a").exercises.map((e) => e.exerciseKey)).not.toContain("wrist_extension");
  });
  it("load: same dumbbell while the rung holds; next dumbbell when the reps drop and the last rung was all hit", () => {
    const w = new World();
    w.session(dayIn(1, "lower_a"), "lower_a", { only: ["wrist_extension"], load: () => 5 });
    const withLadder = (st: PlanState): PlanState => ({ ...STATE, wristLadder: st.wristLadder, currentLoads: { ...STATE.currentLoads, ...st.currentLoads } });
    const s1 = withLadder(w.data().state);
    expect(s1.wristLadder?.last).toMatchObject({ load: 5, reps: 15, allHit: true });
    expect(ex(1, "lower_b", "wrist_extension", s1).sets[0]!.load).toBe(5); // same rung (15): same weight
    const up = ex(2, "lower_a", "wrist_extension", s1).sets[0]!.load; // rung 12: next dumbbell
    expect(up).toBeGreaterThan(5);
    const w2 = new World();
    w2.session(dayIn(1, "lower_a"), "lower_a", { only: ["wrist_extension"], load: () => 5, reps: (_e, _s, i) => (i === 2 ? 13 : undefined) });
    expect(ex(2, "lower_a", "wrist_extension", withLadder(w2.data().state)).sets[0]!.load).toBe(5); // missed reps: stay
  });
  it("Wednesday: the home task on the ride card (none in maintenance)", () => {
    expect(day(1, "easy_ride").conditioning?.homeTasks).toEqual([
      { id: "wrist_ladder", text: "Wrist ladder at home: 3 × 15, dumbbell or water bottle", sets: 3, reps: 15 }
    ]);
    expect(day(13, "easy_ride").conditioning?.homeTasks).toBeUndefined();
  });
  it("flare-up: morning elbow ≥ usual + 2 → isometric holds for 3–7 days, then one rung lower", () => {
    const flare = pain("2026-10-26", "right_elbow", { pain_score: 3, morning_score: 5 });
    const st = wristLadderState([flare], PLAN)!;
    expect(st).toEqual({ rungOffset: 1, isometricFrom: "2026-10-27", isometricUntil: "2026-11-03" }); // the morning after the check, up to 7 days
    const s: PlanState = { ...STATE, wristLadder: st };
    const fri = ex(2, "lower_b", "wrist_extension", s);
    expect(fri).toMatchObject({ effort: "easy" });
    expect(fri.sets).toHaveLength(5);
    expect(fri.sets[0]).toMatchObject({ kind: "timed", durationSec: 45, reps: null });
    expect(day(2, "easy_ride", s).conditioning?.homeTasks?.[0]?.text).toBe("Wrist isometric holds at home: 5 × 30–45 s, palm down, mid-range");
    expect(ex(3, "lower_a", "wrist_extension", s).sets[0]!.kind).toBe("timed"); // Mon 2 Nov: still in the window
    expect(shape(ex(3, "lower_b", "wrist_extension", s).sets)[0]).toEqual(["working", 4, 15]); // week 3 rung 12, one back → 15
    // A settled morning from day 3 ends the holds early (the day before it).
    const settled = pain("2026-10-29", "right_elbow", { morning_score: 1 });
    expect(wristLadderState([flare, settled], PLAN)?.isometricUntil).toBe("2026-10-30");
    expect(wristLadderState([pain("2026-10-26", "right_elbow", { morning_score: 1 })], PLAN)).toBeUndefined();
  });
});

describe("E14 pain 0–10 helpers and the hold rule", () => {
  it("during: 0–3 go, 4–5 hold, ≥ 6 or sharp stop; the legacy column follows the score", () => {
    expect([0, 3, 4, 5, 6, 9].map((x) => painAction(x))).toEqual(["go", "go", "hold", "hold", "stop", "stop"]);
    expect(painAction(2, true)).toBe("stop");
    expect([duringSetFrom(0), duringSetFrom(1), duringSetFrom(3, true)]).toEqual(["none", "ache", "sharp"]);
    expect(painCheckRow({ date: "2026-10-20", site: "right_elbow", score: 5, worseThanLast: true })).toMatchObject({ pain_score: 5, during_set: "ache", worse_than_last: true, morning_score: null });
    expect(painCheckRow({ date: "2026-10-20", site: "right_elbow", score: 0, worseThanLast: true })).toMatchObject({ during_set: "none", worse_than_last: null });
    expect(duringScore(pain("2026-10-20", "x", { during_set: "sharp" }))).toBe(6);
    expect(duringScore(pain("2026-10-20", "x", { during_set: "ache" }))).toBe(2);
  });
  it("morning: baseline = median of the last 14 days' morning scores (or 0); a flare is ≥ baseline + 2", () => {
    const all = [pain("2026-10-12", "right_elbow", { morning_score: 2 }), pain("2026-10-14", "right_elbow", { morning_score: 3 }), pain("2026-10-16", "right_elbow", { morning_score: 2 })];
    expect(morningBaseline(all, "right_elbow", "2026-10-20")).toBe(2);
    expect(morningBaseline(all, "right_elbow", "2026-11-20")).toBe(0);
    expect(isMorningFlare(pain("2026-10-20", "right_elbow", { morning_score: 4 }), all)).toBe(true);
    expect(isMorningFlare(pain("2026-10-20", "right_elbow", { morning_score: 3 }), all)).toBe(false);
  });
  it("hold: the latest check ≥ 4 for an exercise holds its load until it is trained again", () => {
    const w = new World();
    w.session(dayIn(1, "lower_a"), "lower_a", { reps: (e, p) => (e.exerciseKey === "cable_lateral_raise" && p.kind === "failure" ? 25 : undefined) });
    const p = w.pain(dayIn(1, "lower_a"), "right_shoulder", "cable_lateral_raise", { pain_score: 4, during_set: "ache" });
    expect(w.data().state.holdLoad).toEqual({ cable_lateral_raise: true });
    expect(w.data().state.currentLoads.cable_lateral_raise).toBe(20); // would be 40 (two pins)
    expect(ex(2, "lower_a", "cable_lateral_raise", { ...w.data().state, trainingMaxes: STATE.trainingMaxes }).notes.join(" ")).toContain("Hold the load");
    p.pain_score = 3;
    expect(w.data().state.currentLoads.cable_lateral_raise).toBe(40);
    p.pain_score = 5;
    w.session(dayIn(1, "upper_a"), "upper_a");
    expect(w.data().state.holdLoad).toBeUndefined();
    const keyOf = new Map([[w.ids.get("cable_lateral_raise")!, "cable_lateral_raise"]]);
    expect(holdLoadState([p], keyOf, [], [])).toEqual({ cable_lateral_raise: true });
  });
  it("maxUpdates: a main lift with pain ≥ 4 this session gets no increase (decreases still apply)", () => {
    const set = { id: "s1", session_id: "x", kind: "rep_out", completed: true, reps: 13, load: 100, legacy_ref: { plan: { exerciseKey: "squat", role: "main", mainLift: "squat", target: 10, restSec: 240 } } } as unknown as SetRow;
    const session = { id: "x", date: "2026-10-19", legacy_ref: { plan: { weekType: "A" } } } as unknown as Session;
    const ids = new Map([["squat", "sq"]]);
    const maxes = [{ id: "t", exercise_id: "sq", effective_date: "2026-10-12", created_at: "x", value_kg: 140, source_set_id: null }] as unknown as TrainingMax[];
    expect(maxUpdates(session, [set], ids, maxes, EQ)[0]).toMatchObject({ to: 145 });
    const checks = [pain("2026-10-19", "right_knee", { exercise_id: "sq", session_id: "x", pain_score: 5 })];
    expect(maxUpdates(session, [set], ids, maxes, EQ, { painChecks: checks })[0]).toMatchObject({ to: 140, held: true });
    const miss = { ...set, reps: 7 } as SetRow;
    expect(maxUpdates(session, [miss], ids, maxes, EQ, { painChecks: checks })[0]).toMatchObject({ to: 132.5 });
  });
  it("the monthly elbow check row", () => {
    const row = elbowMonthlyRow("2026-11-02", { worst: 4, grip: 3.4, daily: 12 });
    expect(row).toMatchObject({ site: "elbow_monthly", pain_score: null, during_set: null });
    expect(elbowMonthlyOf(row)).toEqual({ worst: 4, grip: 3, daily: 10, total: 17 });
  });
  it("cut_sets: sets × 2/3 (rounded, ≥ 1) while it runs", () => {
    const p = applyAdjustments(PLAN, [{ id: "c", kind: "cut_sets", created: "2026-11-08T09:00:00Z", signalId: "joints.cut_sets.bayesian_curl", data: { kind: "cut_sets", exerciseKey: "bayesian_curl", fraction: 1 / 3, until: "2026-11-20" } }]);
    const bay = (n: number) => prescribeDay(p, n, "upper_a", STATE).exercises.find((e) => e.exerciseKey === "bayesian_curl")!;
    expect(bay(4).sets).toHaveLength(1);
    expect(bay(4).notes.join(" ")).toContain("Sets cut by a third");
    expect(bay(6).sets).toHaveLength(2);
    expect(prescribeDay(p, 4, "upper_a", STATE).exercises.find((e) => e.exerciseKey === "cable_lateral_raise")!.sets).toHaveLength(3);
  });
});

describe("E15 swap start loads", () => {
  const H = (o: Partial<SwapHistory> = {}): SwapHistory => ({
    today: "2026-11-10", latest: () => null, current: () => ({ load: 25, unit: "kg" }), bodyweightKg: 75, ...o
  });
  it("history: 90% of the target's latest clean working load (80% if older than 6 months)", () => {
    expect(swapStartLoad("incline_db_press", "db_bench_press", H({ latest: () => ({ load: 30, unit: "kg", date: "2026-09-01" }), snap: (_k, x) => Math.floor(x / 2.5) * 2.5 })))
      .toEqual({ load: 25, unit: "kg", basis: "history", text: "Start at 25 kg (your last 30 kg − 10%)" });
    const r = swapStartLoad("bayesian_curl", "preacher_curl", H({ latest: () => ({ load: 60, unit: "lb", date: "2026-09-01" }), snap: (_k, x) => Math.floor(x / 10) * 10 }));
    expect(r).toEqual({ load: 50, unit: "lb", basis: "history", text: "Start at 50 lb (your last 60 lb − 10%)" });
    const old = swapStartLoad("bayesian_curl", "preacher_curl", H({ latest: () => ({ load: 60, unit: "lb", date: "2026-03-01" }), snap: (_k, x) => Math.floor(x / 10) * 10 }));
    expect(old).toMatchObject({ load: 40, basis: "history_old" });
  });
  it("pressing swaps keep the dumbbells; pull-up → pulldown at 70% of bodyweight + belt; otherwise start light", () => {
    expect(swapStartLoad("incline_db_press", "db_bench_press", H())).toMatchObject({ load: 25, unit: "kg", basis: "same_dumbbells" });
    const pd = swapStartLoad("weighted_pullup", "lat_pulldown", H({ current: () => ({ load: 10, unit: "kg" }), snap: (_k, x) => Math.floor(x / 10) * 10 }));
    expect(pd).toMatchObject({ load: 130, unit: "lb", basis: "system_mass" }); // 0.7 × 85 kg = 59.5 kg = 131 lb → 130
    expect(swapStartLoad("cross_body_triceps_extension", "rope_pushdown", H())).toMatchObject({ load: null, basis: "none", text: "Start light" });
  });
  it("labels", () => {
    expect(swapLabel("preacher_curl")).toBe("kneeling cable curl (preacher-style)");
    expect(swapLabel("incline_hammer_curl")).toBe("seated high-incline hammer curl");
  });
});

describe("E22 conditioning prescription", () => {
  it("Sunday from week 4: 2 burst rounds; deload half with none; finish by 14:00", () => {
    expect(day(3, "rounds").conditioning).toMatchObject({ rounds: 6, finishBy: "14:00", text: "6 rounds, 2 min hard / 1 min easy" });
    expect(day(3, "rounds").conditioning?.burstRounds).toBeUndefined();
    expect(day(4, "rounds", { ...STATE, sundayRounds: 8 }).conditioning).toMatchObject({
      rounds: 8, burstRounds: 2, burstWorkSec: 5, burstEasySec: 10, notes: ["Finish by 14:00."],
      text: "8 rounds, of which 2 are burst rounds: 5 s all-out / 10 s easy for 2 min (rope or shadow-boxing, no bag)"
    });
    const deload = day(7, "rounds", { ...STATE, sundayRounds: 8 }).conditioning!;
    expect(deload).toMatchObject({ rounds: 4, text: "4 rounds, 2 min hard / 1 min easy (deload: half, no burst rounds)" });
    expect(deload.burstRounds).toBeUndefined();
  });
});

describe("E23 / E24 plan data", () => {
  it("preacher rename and cue; the incline hammer curl is an alternative, not a slot", () => {
    expect(PLAN.exercises.preacher_curl!.name).toBe("Kneeling cable curl, elbow on knee (preacher-style)");
    expect(ex(1, "lower_b", "preacher_curl").notes[0]).toBe("Upper arm braced on the raised knee, arm in front of the body; full stretch at the bottom with a soft lockout.");
    expect(PLAN.exercises.incline_hammer_curl!.name).toBe("Seated high-incline hammer curl");
    expect(PLAN.alternativeSlots!.incline_hammer_curl).toMatchObject({ startLoad: 12, unit: "kg", scheme: { repRange: [8, 12] } });
    expect(PLAN.days.flatMap((d) => d.slots).some((s) => s.exerciseKey === "incline_hammer_curl")).toBe(false);
    expect(ex(1, "upper_b", "underhand_cable_curl").alternatives).toContain("incline_hammer_curl");
  });
  it("deload weeks 7 and 10 carry the variety note; accessories list equivalents", () => {
    expect(PLAN.weeks.filter((w) => w.notes.includes(VARIETY_NOTE)).map((w) => w.weekNo)).toEqual([7, 10]);
    expect(VARIETY_NOTE).toBe("You may swap up to 2 accessories for a listed equivalent this week (same muscle).");
    const missing = PLAN.days.flatMap((d) => d.slots).filter((s) => (s.role === "compound" || s.role === "isolation") && !s.rehab && !s.extraOnly && !s.alternatives?.length);
    expect(missing.map((s) => s.exerciseKey)).toEqual([]);
  });
  it("creatine and bodyweight-rate data", () => {
    expect(CREATINE_START).toBe("2026-10-11");
    expect(PLAN.bodyweightRate).toMatchObject({ fromWeek: 5, fitFromWeek: 3, minWeighIns: 20, outlierKg: 1.5 });
    expect(PLAN.rateExclusions).toEqual([{ from: "2026-12-20", to: "2027-01-03", label: "holiday" }]);
  });
});

describe("planState passes the pain checks and today", () => {
  it("effort, restart and wrist ladder state from the rows", () => {
    const w = new World();
    w.session(dayIn(1, "lower_a"), "lower_a");
    const p = w.pain(dayIn(1, "lower_a"), "right_elbow", "cross_body_triceps_extension", { pain_score: 4, morning_score: 4 });
    const t = w.tables;
    const s = planState({ program: w.program, ids: w.ids, maxes: t.training_maxes, sessions: t.sessions, sets: t.sets, equipment: EQ, painChecks: [p], today: "2026-11-02" });
    expect(s.effort).toEqual({ elbowIrritableFrom: "2026-10-19", elbowIrritableUntil: "2026-11-02" });
    expect(s.restart).toEqual({ capRepOutsFrom: "2026-11-02", firstWeekNo: 3 });
    expect(s.wristLadder).toMatchObject({ rungOffset: 1, isometricFrom: "2026-10-20" });
    expect(s.holdLoad).toEqual({ cross_body_triceps_extension: true }); // not trained since the check
  });
});
