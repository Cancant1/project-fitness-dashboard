// planState from the log: APRE jumps (§6.1), isolation overshoot (§6.3), deload carry-forward, adjustments (§7)
// and Sunday rounds.
import { dayIn, World } from "../coach/testkit";
import { planState, PLAN } from "./bridge";
import { DEFAULT_EQUIPMENT, prescribeWeek } from "./engine";

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

  it("failure isolation 5+ reps over the range top on every set → two pins up", () => {
    const w = new World();
    w.session(dayIn(1, "lower_a"), "lower_a", { reps: (ex, p) => (ex.exerciseKey === "cable_lateral_raise" && p.kind === "failure" ? 25 : undefined) });
    expect(stateOf(w).currentLoads.cable_lateral_raise).toBe(40); // 20 lb → 30 → 40 on the single pulley
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
    expect(total).toBe(72 + 2 + 2); // +1 triceps, +1 biceps, +1 squat set, +1 deadlift back-off
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
