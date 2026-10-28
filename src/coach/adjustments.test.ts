// @vitest-environment node
import "fake-indexeddb/auto";
import { LocalStore } from "../data/local";
import type { Program } from "../data/types";
import { adjustmentState, adjustmentsOf, applyAdjustments, type Adjustment, type CoachAction } from "../plan/adjustments";
import { PLAN, activeProgram, ensurePlanExercises, planFor } from "../plan/bridge";
import { prescribeWeek } from "../plan/engine";
import { answerPainCheck, applyCoachAction, ensurePlanProteinPerKg, removeAdjustment, saveSessionEnergy, saveWaist } from "./apply";
import { STATE } from "./testkit";

let n = 0;
const adj = (data: CoachAction, created = `2026-11-0${(n % 9) + 1}T10:00:00Z`): Adjustment => ({ id: `a${++n}`, kind: data.kind, created, signalId: "test", data });
const total = (plan = PLAN, week: number, state = STATE) => prescribeWeek(plan, week, state).reduce((k, d) => k + d.workingSetCount, 0);

describe("applyAdjustments", () => {
  it("deload_now: that week becomes a deload; later weeks unchanged; input untouched", () => {
    const out = applyAdjustments(PLAN, [adj({ kind: "deload_now", weekNo: 3 })]);
    expect(out.weeks[3]).toMatchObject({ weekNo: 3, type: "deload", label: "Deload", earlyDeload: true, startDate: "2026-11-02" });
    expect(out.weeks[3]!.notes[0]).toMatch(/^Deload taken early/);
    expect(out.weeks[4]).toBe(PLAN.weeks[4]);
    expect(out.weeks[7]!.type).toBe("deload");
    expect(PLAN.weeks[3]!.type).toBe("C");
    expect(total(out, 3)).toBe(36);
  });

  it("deload_now on a week that is not A–D changes nothing", () => {
    expect(applyAdjustments(PLAN, [adj({ kind: "deload_now", weekNo: 7 })])).toBe(PLAN);
    expect(applyAdjustments(PLAN, [adj({ kind: "deload_now", weekNo: 0 })])).toBe(PLAN);
  });

  it("repeat_week: shiftAfterMissedWeek once; later adjustments use the new numbering", () => {
    const out = applyAdjustments(PLAN, [
      adj({ kind: "repeat_week", missedWeekNo: 3 }, "2026-11-09T08:00:00Z"),
      adj({ kind: "repeat_week", missedWeekNo: 3 }, "2026-11-09T09:00:00Z"),
      adj({ kind: "deload_now", weekNo: 5 }, "2026-11-16T08:00:00Z")
    ]);
    expect(out.weeks).toHaveLength(21);
    expect(out.weeks[3]).toMatchObject({ type: "C", missed: true });
    expect(out.weeks[4]).toMatchObject({ type: "C", repeatOf: 3, startDate: "2026-11-09" });
    expect(out.weeks[5]).toMatchObject({ type: "deload", startDate: "2026-11-16", earlyDeload: true }); // was week 4 (A)
    expect(out.weeks[7]!.checkpoint).toMatchObject({ weekNo: 7, date: "2026-12-06" });
  });

  it("extra_sets → PlanState.extraSetsMuscles (+1 set in the A–D weeks 8–17)", () => {
    const state = { ...STATE, ...adjustmentState([adj({ kind: "extra_sets", muscles: ["triceps", "biceps"], fromWeek: 8 })]) };
    expect(state.extraSetsMuscles).toEqual(["triceps", "biceps"]);
    expect(total(PLAN, 8, state)).toBe(72);
    expect(total(PLAN, 9, state)).toBe(72);
    expect(total(PLAN, 11, state)).toBe(72);
    expect(total(PLAN, 10, state)).toBe(total(PLAN, 10));
  });

  it("main_lift_set → PlanState.addMainLiftSet; the latest extra_sets wins", () => {
    const s = adjustmentState([
      adj({ kind: "extra_sets", muscles: ["chest"], fromWeek: 8 }, "2026-11-30T08:00:00Z"),
      adj({ kind: "main_lift_set", lifts: ["squat", "incline_db_press"], fromWeek: 7 }, "2026-11-30T09:00:00Z"),
      adj({ kind: "extra_sets", muscles: ["triceps", "biceps"], fromWeek: 8 }, "2026-12-01T08:00:00Z")
    ]);
    expect(s).toEqual({ extraSetsMuscles: ["triceps", "biceps"], addMainLiftSet: { squat: true, incline_db_press: true } });
  });

  it("swap: a note on the slot while it runs (needs today); kcal and tm_reduce are not folded", () => {
    const list = [adj({ kind: "swap", exerciseKey: "incline_db_press", to: "db_bench_press", until: "2026-11-03" }), adj({ kind: "kcal", delta: 100, from: "2026-11-09" }), adj({ kind: "tm_reduce", percent: 5 })];
    const slot = (p = PLAN) => p.days.find((d) => d.key === "upper_a")!.slots.find((x) => x.exerciseKey === "incline_db_press")!;
    expect(slot(applyAdjustments(PLAN, list, "2026-10-25")).notes[0]).toBe("Swap: neutral-grip DB bench press until 3 Nov");
    expect(slot(applyAdjustments(PLAN, list, "2026-11-04")).notes[0]).not.toMatch(/^Swap/);
    expect(applyAdjustments(PLAN, list)).toBe(PLAN);
  });

  it("adjustmentsOf ignores malformed entries", () => {
    const good = adj({ kind: "deload_now", weekNo: 3 });
    expect(adjustmentsOf({ key: "x", adjustments: [good, { kind: "deload_now" }, null, { ...good, kind: "kcal" }] })).toEqual([good]);
    expect(adjustmentsOf(undefined)).toEqual([]);
  });
});

describe("applying through the LocalStore", () => {
  let k = 0;
  async function setup() {
    const local = new LocalStore(`coach-apply-${Date.now()}-${k++}`);
    await local.open();
    const ids = await ensurePlanExercises(local);
    const [program] = await local.save("programs", {
      name: "Strength Return Plan", start_date: "2026-10-12", weeks: 20, status: "active", rules: { key: "strength-return-2026" }, goals: [], notes: null
    });
    return { local, ids, program: program as Program };
  }

  it("kcal: a new target row from next Monday, the current one copied with ± 100 kcal; recorded; once only", async () => {
    const { local } = await setup();
    await local.save("nutrition_targets", {
      effective_from: "2026-10-12", phase: "lean bulk", kcal: 2800, protein: 150, protein_per_kg: 2, carbs: 310, fat: 80,
      per_weekday: { sat: { kcal: 3000, protein: 160 } }, target_weight: 77, note: null
    });
    const r = await applyCoachAction(local, { kind: "kcal", delta: 100, from: "2026-11-09" }, { signalId: "body.rate", today: "2026-11-08" });
    expect(r.ok).toBe(true);
    const rows = local.all("nutrition_targets").sort((a, b) => a.effective_from.localeCompare(b.effective_from));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      effective_from: "2026-11-09", kcal: 2900, protein: 150, protein_per_kg: 2, carbs: 335, fat: 80, phase: "lean bulk",
      per_weekday: { sat: { kcal: 3100, protein: 160 } }
    });
    expect(adjustmentsOf(activeProgram(local.all("programs"))!.rules)).toEqual([expect.objectContaining({ kind: "kcal", signalId: "body.rate" })]);
    expect((await applyCoachAction(local, { kind: "kcal", delta: 100, from: "2026-11-09" }, { signalId: "strength.misses", today: "2026-11-08" })).ok).toBe(false);
    expect(local.all("nutrition_targets")).toHaveLength(2);
  });

  it("undo takes back what kcal and tm_reduce wrote", async () => {
    const { local, ids, program } = await setup();
    await local.save("nutrition_targets", {
      effective_from: "2026-10-12", phase: "lean bulk", kcal: 2800, protein: 150, protein_per_kg: 2, carbs: 310, fat: 80,
      per_weekday: null, target_weight: 77, note: null
    });
    const r = await applyCoachAction(local, { kind: "kcal", delta: 100, from: "2026-11-09" }, { signalId: "body.rate", today: "2026-11-08" });
    expect(local.all("nutrition_targets")).toHaveLength(2);
    expect(await removeAdjustment(local, r.adjustment!.id)).toBe(true);
    expect(local.all("nutrition_targets").map((t) => t.kcal)).toEqual([2800]);
    // re-applying after an undo starts from the original row again
    await applyCoachAction(local, { kind: "kcal", delta: 100, from: "2026-11-09" }, { signalId: "body.rate", today: "2026-11-08" });
    expect(local.all("nutrition_targets").map((t) => t.kcal).sort()).toEqual([2800, 2900]);

    // an update of an existing row on the same date is restored, not removed
    const same = await applyCoachAction(local, { kind: "kcal", delta: -100, from: "2026-11-09" }, { signalId: "body.waist", today: "2026-11-08" });
    expect(local.all("nutrition_targets").find((t) => t.effective_from === "2026-11-09")!.kcal).toBe(2800);
    await removeAdjustment(local, same.adjustment!.id);
    expect(local.all("nutrition_targets").find((t) => t.effective_from === "2026-11-09")!.kcal).toBe(2900);

    await local.save("training_maxes", { exercise_id: ids.get("squat")!, program_id: program.id, effective_date: "2026-10-26", value_kg: 150, reason: "rep_out", source_set_id: null, note: null });
    const tm = await applyCoachAction(local, { kind: "tm_reduce", percent: 5 }, { signalId: "consistency.long_break", today: "2026-11-16" });
    expect(local.all("training_maxes")).toHaveLength(2);
    await removeAdjustment(local, tm.adjustment!.id);
    expect(local.all("training_maxes").map((m) => m.value_kg)).toEqual([150]);
  });

  it("ensurePlanProteinPerKg upgrades only the untouched plan row", async () => {
    const { local } = await setup();
    await local.save("nutrition_targets", { effective_from: "2026-10-12", phase: null, kcal: 2800, protein: 150, carbs: 310, fat: 80, per_weekday: null, target_weight: null, note: null });
    expect(await ensurePlanProteinPerKg(local, "2026-10-12")).toBe(true);
    expect(local.all("nutrition_targets")[0]!.protein_per_kg).toBe(2);
    expect(await ensurePlanProteinPerKg(local, "2026-10-12")).toBe(false);
  });

  it("kcal without a target row starts from the plan's row", async () => {
    const { local } = await setup();
    await applyCoachAction(local, { kind: "kcal", delta: -100, from: "2026-11-09" }, { signalId: "body.rate", today: "2026-11-08" });
    expect(local.all("nutrition_targets")).toEqual([expect.objectContaining({ effective_from: "2026-11-09", kcal: 2700, carbs: 285 })]);
  });

  it("tm_reduce: new training_maxes rows, −5%, reason missed_weeks", async () => {
    const { local, ids, program } = await setup();
    await local.save("training_maxes", [
      { exercise_id: ids.get("squat")!, program_id: program.id, effective_date: "2026-10-26", value_kg: 150, reason: "rep_out", source_set_id: null, note: null },
      { exercise_id: ids.get("deadlift")!, program_id: program.id, effective_date: "2026-10-30", value_kg: 210, reason: "rep_out", source_set_id: null, note: null }
    ]);
    await applyCoachAction(local, { kind: "tm_reduce", percent: 5 }, { signalId: "consistency.long_break", today: "2026-11-16" });
    const added = local.all("training_maxes").filter((m) => m.reason === "missed_weeks");
    expect(added.map((m) => [m.exercise_id === ids.get("squat") ? "squat" : "deadlift", m.value_kg, m.effective_date]))
      .toEqual(expect.arrayContaining([["squat", 142.5, "2026-11-16"], ["deadlift", 197.5, "2026-11-16"]]));
  });

  it("plan adjustments are stored on the programme row and fold into planFor; removable", async () => {
    const { local } = await setup();
    const r = await applyCoachAction(local, { kind: "deload_now", weekNo: 3 }, { signalId: "strength.misses", today: "2026-11-01" });
    expect(r.ok).toBe(true);
    const program = activeProgram(local.all("programs"))!;
    expect(program.rules).toMatchObject({ key: "strength-return-2026" });
    expect(planFor(program).weeks[3]!.type).toBe("deload");
    expect((await applyCoachAction(local, { kind: "deload_now", weekNo: 3 }, { signalId: "strength.misses", today: "2026-11-01" })).message).toBe("Already applied.");
    expect(await removeAdjustment(local, r.adjustment!.id)).toBe(true);
    expect(planFor(activeProgram(local.all("programs"))).weeks[3]!.type).toBe("C");
  });

  it("input helpers: pain answer, session energy, waist (one per day)", async () => {
    const { local, ids } = await setup();
    const [pain] = await local.save("pain_checks", { date: "2026-10-20", site: "right_elbow", exercise_id: ids.get("incline_db_press")!, session_id: null, during_set: "ache", next_morning: null, worse_than_last: null, note: null });
    expect(await answerPainCheck(local, pain!.id, 6)).toEqual({ morning_score: 6, next_morning: "sore", flare: true });
    expect(local.get("pain_checks", pain!.id)).toMatchObject({ next_morning: "sore", morning_score: 6 });
    // Within 1 point of the usual level (0): normal.
    const [calm] = await local.save("pain_checks", { date: "2026-10-21", site: "right_elbow", exercise_id: null, session_id: null, during_set: "ache", next_morning: null, worse_than_last: null, note: null });
    expect((await answerPainCheck(local, calm!.id, 1)).next_morning).toBe("normal");

    const [session] = await local.save("sessions", { date: "2026-10-20", title: "Upper A", status: "completed" });
    await saveSessionEnergy(local, session!.id, 4);
    expect(local.get("sessions", session!.id)!.energy).toBe(4);

    await saveWaist(local, "2026-10-20", 81);
    await saveWaist(local, "2026-10-20", 80.5);
    expect(local.all("body_measurements")).toEqual([expect.objectContaining({ kind: "waist", value: 80.5, unit: "cm" })]);

  });
});
