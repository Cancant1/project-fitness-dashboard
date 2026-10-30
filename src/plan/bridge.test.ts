// planState from the log: APRE jumps (§6.1), isolation overshoot (§6.3), deload carry-forward, adjustments (§7)
// and Sunday rounds.
import { dayIn, World } from "../coach/testkit";
import { planState, PLAN, sundayRoundsFrom } from "./bridge";
import type { ProgramDefinition } from "./types";
import { DEFAULT_EQUIPMENT, prescribeDay, prescribeWeek, shiftAfterMissedWeek } from "./engine";

function stateOf(w: World) {
  const t = w.tables;
  return planState({
    program: w.program, ids: w.ids, maxes: t.training_maxes, sessions: t.sessions, sets: t.sets,
    equipment: { barKg: 20, platesKg: [20, 10, 5, 2.5, 1.25], dumbbellRackKg: DEFAULT_EQUIPMENT.dumbbellRackKg, cableStepLb: 5, cableStepKg: 2.5, beltStepKg: 2.5, barbellStepKg: 2.5 },
    conditioning: t.conditioning
  });
}

describe("planState: accessories", () => {
  it("RDL rep-out 80 × 20 → 87.5 next (APRE), from the set with kind rep_out", () => {
    const w = new World();
    w.session(dayIn(1, "lower_a"), "lower_a", { reps: (ex, p) => (ex.exerciseKey === "romanian_deadlift" && p.kind === "rep_out" ? 20 : undefined) });
    expect(stateOf(w).currentLoads.romanian_deadlift).toBe(87.5);
  });

  it("rep-out at the range top with every normal set at the top: one step (double progression)", () => {
    const w = new World();
    w.session(dayIn(1, "lower_a"), "lower_a");
    expect(stateOf(w).currentLoads.romanian_deadlift).toBe(82.5);
  });

  it("Bulgarian split squat rep-out 14 × 20 → 16 kg on the rack", () => {
    const w = new World();
    w.session(dayIn(1, "lower_b"), "lower_b", { reps: (ex, p) => (ex.exerciseKey === "bulgarian_split_squat" && p.kind === "rep_out" ? 20 : undefined) });
    expect(stateOf(w).currentLoads.bulgarian_split_squat).toBe(16);
  });

  it("failure isolation 5+ reps over the range top on every set: two steps, capped to one pin when the pin is big", () => {
    const w = new World();
    w.session(dayIn(1, "upper_b"), "upper_b", { reps: (ex, p) => (ex.exerciseKey === "chest_cable_flye" && p.kind === "failure" ? 20 : undefined) });
    expect(stateOf(w).currentLoads.chest_cable_flye).toBe(65); // 50 → 65 lb is already +30% on the dual stack: one pin
  });

  it("set-1 lifts (28 Oct 2026): set 1 alone decides; sets 2–3 don't hold it back", () => {
    const at = (key: string, reps: number[], day: "lower_a" | "upper_b" = "lower_a") => {
      const w = new World();
      w.session(dayIn(1, day), day, { reps: (ex, p, i) => (ex.exerciseKey === key && p.kind === "failure" ? reps[i] : undefined) });
      return stateOf(w);
    };
    // Hamstring curl 10–15, 25 kg: set 1 at 15 → +1 step even though set 2 dropped to 10.
    expect(at("lying_db_hamstring_curl", [15, 10]).currentLoads.lying_db_hamstring_curl).toBe(27.5);
    // His 27 Oct session, 25 + 15: top + 10 → two steps (+20%, each step small).
    expect(at("lying_db_hamstring_curl", [25, 15]).currentLoads.lying_db_hamstring_curl).toBe(30);
    expect(at("lying_db_hamstring_curl", [14, 14]).currentLoads.lying_db_hamstring_curl).toBe(25);
    // Floor 2 under the bottom: 8 stays, 7 steps down.
    expect(at("lying_db_hamstring_curl", [8, 6]).currentLoads.lying_db_hamstring_curl).toBe(25);
    expect(at("lying_db_hamstring_curl", [7, 5]).currentLoads.lying_db_hamstring_curl).toBe(22.5);
    // Cable laterals 12–20 at 20 lb (30 Oct 2026): 30 lb is +50%, so set 1 at 22 holds and waits for 25; his 28 Oct
    // 25 + 18 + 15 → 30 lb; 35+ still takes two.
    const lat = at("cable_lateral_raise", [22, 15, 13], "upper_b");
    expect(lat.currentLoads.cable_lateral_raise).toBe(20);
    expect(lat.bigJump?.cable_lateral_raise).toEqual({ next: 30, reps: 25, firstSet: true });
    expect(at("cable_lateral_raise", [25, 18, 15], "upper_b").currentLoads.cable_lateral_raise).toBe(30);
    expect(at("cable_lateral_raise", [35, 20, 16], "upper_b").currentLoads.cable_lateral_raise).toBe(40);
    // Leg extension at 30 lb: the next pin is +33%, so +1 waits for set 1 at 25; 35+ still takes two (R2-04).
    const s = at("cable_leg_extension", [22, 20]);
    expect(s.currentLoads.cable_leg_extension).toBe(30);
    expect(s.bigJump?.cable_leg_extension).toEqual({ next: 40, reps: 25, firstSet: true });
    const ext = prescribeDay(PLAN, 2, "lower_a", { ...s, trainingMaxes: { squat: 140, deadlift: 200 } }).exercises.find((e) => e.exerciseKey === "cable_leg_extension")!;
    expect(ext.notes.join(" ")).toContain("stay here until set 1 reaches 25 reps");
    expect(ext.sets.every((x) => x.kind === "warmup" || (x.aimReps === 25 && x.aimFirstSet === true))).toBe(true);
    expect(at("cable_leg_extension", [25, 12]).currentLoads.cable_leg_extension).toBe(40);
    expect(at("cable_leg_extension", [35, 20]).currentLoads.cable_leg_extension).toBe(50);
  });

  it("set-1 lifts: `working` sets count, set 1's own load is the base, an unticked set 1 holds (review 28 Oct)", () => {
    const crunch = (edit: (s: ReturnType<World["tables"]["sets"]["at"]> & object, i: number) => void, reps: number[]) => {
      const w = new World();
      w.session(dayIn(1, "lower_a"), "lower_a", { reps: (ex, p, i) => (ex.exerciseKey === "kneeling_cable_crunch" && p.kind === "failure" ? reps[i] : undefined) });
      const id = w.ids.get("kneeling_cable_crunch");
      w.tables.sets.filter((s) => s.exercise_id === id).sort((a, b) => a.set_no - b.set_no).forEach(edit);
      return stateOf(w).currentLoads.kneeling_cable_crunch;
    };
    // His 28 Oct crunch: added by hand on Upper A, so logged as `working`, 100 lb × 20, 12 → 110 lb.
    expect(crunch((s) => { s.kind = "working"; s.load = 100; }, [20, 12])).toBe(110);
    // Set 1 lighter than set 2: the step starts from set 1's load (90 → 100), not the heavier 100 (→ 110).
    expect(crunch((s, i) => { s.load = i === 0 ? 90 : 100; }, [15, 10])).toBe(100);
    // Set 1 not ticked: set 2 is no stand-in (7 reps would step down); the load holds.
    expect(crunch((s, i) => { if (i === 0) { s.completed = false; s.reps = null; } }, [20, 7])).toBe(90);
  });

  it("jump cap: never more than +25% at once; a coarser pin waits for top + 5 on average", () => {
    const at = (key: string, reps: number[], day: "lower_a" | "upper_b" = "upper_b") => {
      const w = new World();
      w.session(dayIn(1, day), day, { reps: (ex, p, i) => (ex.exerciseKey === key && p.kind === "failure" ? reps[i] : undefined) });
      return stateOf(w);
    };
    // 28 Oct 2026: the cable laterals left the plan; the rear delt fly (12–20, dual pulley) has the same kind of pin gap.
    // 30 lb → 40 is +33%: top + 5 (25) earns one pin, not two.
    expect(at("cable_rear_delt_fly", [25, 25]).currentLoads.cable_rear_delt_fly).toBe(40);
    expect(at("cable_rear_delt_fly", [25, 25]).bigJump?.cable_rear_delt_fly).toBeUndefined();
    // 19 Oct 2026: the average counts, because set 2 after a failure set always loses reps. 34 + 20 → up one pin.
    expect(at("cable_rear_delt_fly", [34, 20]).currentLoads.cable_rear_delt_fly).toBe(40);
    // R2-04 catch-up: a first set of 35+ reps → two pins at once, past the cap.
    expect(at("cable_rear_delt_fly", [35, 20]).currentLoads.cable_rear_delt_fly).toBe(50);
    expect(at("cable_leg_extension", [50, 30], "lower_a").currentLoads.cable_leg_extension).toBe(50);
    // Like his 19 Oct lateral session, 25 + 18 (average 21.5): stays, with a note for the next session.
    const s = at("cable_rear_delt_fly", [25, 18]);
    expect(s.currentLoads.cable_rear_delt_fly).toBe(30);
    expect(s.bigJump?.cable_rear_delt_fly).toEqual({ next: 40, reps: 25, average: true });
    const rear = prescribeDay(PLAN, 2, "upper_b", { ...s, trainingMaxes: { squat: 140, deadlift: 200 } }).exercises.find((e) => e.exerciseKey === "cable_rear_delt_fly")!;
    expect(rear.notes.join(" ")).toContain("stay here until your sets average 25 reps");
    expect(rear.sets.every((x) => x.kind === "warmup" || (x.aimReps === 25 && x.aimAverage === true))).toBe(true);
  });

  it("jump cap on elbow-loading moves still waits for every set (cross-body 30 + 20 stays at 20 lb)", () => {
    const w = new World();
    const reps = [30, 20];
    w.session(dayIn(1, "lower_a"), "lower_a", { reps: (ex, p, i) => (ex.exerciseKey === "cross_body_triceps_extension" && p.kind === "failure" ? reps[i] : undefined) });
    const s = stateOf(w);
    expect(s.currentLoads.cross_body_triceps_extension).toBe(20);
    expect(s.bigJump?.cross_body_triceps_extension).toEqual({ next: 30, reps: 25, average: false });
    const tri = prescribeDay(PLAN, 2, "lower_a", { ...s, trainingMaxes: { squat: 140, deadlift: 200 } }).exercises.find((e) => e.exerciseKey === "cross_body_triceps_extension")!;
    expect(tri.notes.join(" ")).toContain("stay here until every set reaches 25 reps");
    expect(tri.sets.every((x) => x.kind === "warmup" || (x.aimReps === 25 && x.aimAverage === undefined))).toBe(true);
  });

  it("a deload session carries its load forward instead of stepping up", () => {
    const w = new World();
    w.session(dayIn(7, "lower_a"), "lower_a");
    const s = stateOf(w);
    expect(s.currentLoads.romanian_deadlift).toBe(80);
    expect(s.currentLoads.cable_leg_extension).toBe(30);
  });

  it("ignores flagged sets", () => {
    const w = new World();
    w.session(dayIn(1, "lower_a"), "lower_a", { reps: (ex, p) => (ex.exerciseKey === "romanian_deadlift" && p.kind === "rep_out" ? 20 : undefined) });
    for (const s of w.tables.sets) if (s.kind === "rep_out") s.flags = ["load_outlier_check"];
    expect(stateOf(w).currentLoads.romanian_deadlift).toBe(82.5);
  });
});

describe("planState: adjustments and rounds", () => {
  it("extra_sets and main_lift_set adjustments reach the engine state", () => {
    const w = new World();
    w.adjust({ kind: "extra_sets", muscles: ["triceps", "biceps"], fromWeek: 8 });
    w.adjust({ kind: "main_lift_set", lifts: ["squat", "deadlift"], fromWeek: 7 }, "strength.checkpoint", "2026-11-30T09:00:00Z");
    const s = stateOf(w);
    expect(s.extraSetsMuscles).toEqual(["triceps", "biceps"]);
    expect(s.addMainLiftSet).toEqual({ squat: true, deadlift: true });
    const total = prescribeWeek(PLAN, 8, { ...s, trainingMaxes: { squat: 140, deadlift: 200 } }).reduce((n, d) => n + d.workingSetCount, 0);
    // +1 triceps, +1 biceps; R1-07: squat → light Friday squat 2 × 3, deadlift → 2 back-off sets
    expect(total).toBe(70 + 2 + 2 + 2);
  });

  it("Sunday rounds follow the log in a plan that still has them: +1 within 10%; deloads hold", () => {
    // The rounds left this plan on 24 Oct 2026: no state from the log any more.
    const w = new World();
    w.cond(dayIn(1, "rounds"), "rounds", { rounds: 6, first_round_count: 50, last_round_count: 46 });
    expect(stateOf(w).sundayRounds).toBeUndefined();
    const withRounds: ProgramDefinition = {
      ...PLAN, days: PLAN.days.map((d) => (d.key === "rounds" ? { ...d, conditioning: { kind: "rounds", workSec: 120, easySec: 60, warmupMin: 5, startRounds: 6, maxRounds: 10, dropOffFraction: 0.1 } } : d))
    };
    const rounds = () => sundayRoundsFrom(w.tables.conditioning, withRounds);
    expect(rounds()).toBe(7);
    w.cond(dayIn(2, "rounds"), "rounds", { rounds: 7, first_round_count: 50, last_round_count: 40 });
    expect(rounds()).toBe(7);
    w.cond(dayIn(7, "rounds"), "rounds", { rounds: 4, first_round_count: 50, last_round_count: 50 }); // deload: half rounds
    expect(rounds()).toBe(7);
    w.cond(dayIn(8, "rounds"), "rounds", { rounds: 7 }); // no counts: hold what was done
    expect(rounds()).toBe(7);
  });

  it("R2-15 wrist ladder: a clean session earns the next rung; pain above 3 holds it", () => {
    const w = new World();
    w.session(dayIn(0, "lower_a"), "lower_a");
    w.session(dayIn(1, "lower_a"), "lower_a");
    expect(stateOf(w).wristLadder?.earned).toBe(1);
    // Week 2 (rung 12 from the schedule) is allowed: earned 1.
    const ex = (st: ReturnType<typeof stateOf>, week: number) => prescribeDay(PLAN, week, "lower_a", { ...st, trainingMaxes: { squat: 140, deadlift: 200 } })
      .exercises.find((e) => e.exerciseKey === "wrist_extension")!;
    expect(ex(stateOf(w), 2).sets[0]!.reps).toBe(12);
    // A 12-rep session with pain 5/10 holds the ladder at 12 in week 4 (schedule says 10).
    const s = w.session(dayIn(2, "lower_a"), "lower_a");
    w.pain(s.date, "right_elbow", "wrist_extension", { pain_score: 5 });
    const held = planState({ program: w.program, ids: w.ids, maxes: w.tables.training_maxes, sessions: w.tables.sessions, sets: w.tables.sets,
      equipment: DEFAULT_EQUIPMENT, painChecks: w.tables.pain_checks });
    expect(held.wristLadder?.earned).toBe(1);
    expect(ex(held, 4).sets[0]!.reps).toBe(12);
  });
});

describe("review fixes (24 Oct 2026)", () => {
  it("a first failure set below the range steps one pin back (catch-up overshoot safety net)", () => {
    const w = new World();
    w.session(dayIn(1, "upper_b"), "upper_b", {
      load: (ex, p) => (ex.exerciseKey === "cable_rear_delt_fly" && p.kind === "failure" ? 40 : undefined),
      reps: (ex, p, i) => (ex.exerciseKey === "cable_rear_delt_fly" && p.kind === "failure" ? [8, 6][i] : undefined)
    });
    expect(stateOf(w).currentLoads.cable_rear_delt_fly).toBe(30);
  });
  it("a repeated week leaves the England rest week on its dates", () => {
    const shifted = shiftAfterMissedWeek(PLAN, 3);
    const england = shifted.weeks.find((w) => w.startDate === "2026-12-21")!;
    expect(england.rest).toBe(true);
    expect(england.notes[0]).toContain("England");
    expect(shifted.weeks.filter((w) => w.rest).map((w) => w.startDate)).toEqual(["2026-12-21"]);
    expect(shifted.weeks.find((w) => w.startDate === "2026-12-28")!.notes.some((n) => n.includes("England"))).toBe(false);
  });
});
