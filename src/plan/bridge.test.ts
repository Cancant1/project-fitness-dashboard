// planState from the log: APRE jumps (§6.1), isolation overshoot (§6.3), deload carry-forward, adjustments (§7)
// and Sunday rounds.
import { dayIn, World } from "../coach/testkit";
import { planState, PLAN } from "./bridge";
import { DEFAULT_EQUIPMENT, prescribeDay, prescribeWeek } from "./engine";

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

  it("failure isolation 5+ reps over the range top on every set → two steps up", () => {
    const w = new World();
    w.session(dayIn(1, "lower_a"), "lower_a", { reps: (ex, p) => (ex.exerciseKey === "lying_db_hamstring_curl" && p.kind === "failure" ? 20 : undefined) });
    expect(stateOf(w).currentLoads.lying_db_hamstring_curl).toBe(30); // 25 → 27.5 → 30 kg: +20%, under the cap
  });

  it("jump cap: never more than +25% at once; a coarser pin waits for top + 5 on average", () => {
    const at = (key: string, reps: number[]) => {
      const w = new World();
      w.session(dayIn(1, "lower_a"), "lower_a", { reps: (ex, p, i) => (ex.exerciseKey === key && p.kind === "failure" ? reps[i] : undefined) });
      return stateOf(w);
    };
    // 20 lb → 30 is +50%: top + 5 (25) earns one pin, not two.
    expect(at("cable_lateral_raise", [25, 25]).currentLoads.cable_lateral_raise).toBe(30);
    expect(at("cable_lateral_raise", [25, 25]).bigJump?.cable_lateral_raise).toBeUndefined();
    // 19 Oct 2026: the average counts, because set 2 after a failure set always loses reps. 35 + 20 → up.
    expect(at("cable_lateral_raise", [35, 20]).currentLoads.cable_lateral_raise).toBe(30);
    // His 19 Oct session, 25 + 18 (average 21.5): stays, with a note for the next session.
    const s = at("cable_lateral_raise", [25, 18]);
    expect(s.currentLoads.cable_lateral_raise).toBe(20);
    expect(s.bigJump?.cable_lateral_raise).toEqual({ next: 30, reps: 25, average: true });
    const lateral = prescribeDay(PLAN, 2, "lower_a", { ...s, trainingMaxes: { squat: 140, deadlift: 200 } }).exercises.find((e) => e.exerciseKey === "cable_lateral_raise")!;
    expect(lateral.notes.join(" ")).toContain("stay here until your sets average 25 reps");
    expect(lateral.sets.every((x) => x.kind === "warmup" || (x.aimReps === 25 && x.aimAverage === true))).toBe(true);
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
    expect(s.currentLoads.cable_lateral_raise).toBe(20);
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
    expect(total).toBe(72 + 2 + 2 + 2);
  });

  it("Sunday rounds follow the log: +1 when the last round is within 10% of the first; deloads hold", () => {
    const w = new World();
    expect(stateOf(w).sundayRounds).toBeUndefined();
    w.cond(dayIn(1, "rounds"), "rounds", { rounds: 6, first_round_count: 50, last_round_count: 46 });
    expect(stateOf(w).sundayRounds).toBe(7);
    w.cond(dayIn(2, "rounds"), "rounds", { rounds: 7, first_round_count: 50, last_round_count: 40 });
    expect(stateOf(w).sundayRounds).toBe(7);
    w.cond(dayIn(7, "rounds"), "rounds", { rounds: 4, first_round_count: 50, last_round_count: 50 }); // deload: half rounds
    expect(stateOf(w).sundayRounds).toBe(7);
    w.cond(dayIn(8, "rounds"), "rounds", { rounds: 7 }); // no counts: hold what was done
    expect(stateOf(w).sundayRounds).toBe(7);
  });
});
