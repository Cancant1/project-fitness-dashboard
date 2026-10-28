import { weeklyReport } from "./report";
import { laggingMuscles } from "./muscle";
import { dayIn, sunday, World } from "./testkit";
import type { LiftingDayKey } from "../plan/types";
import type { WeeklyReport } from "./types";

const get = (r: WeeklyReport, id: string) => r.signals.find((s) => s.id === id);

describe("muscle.volume", () => {
  const vol = (days: LiftingDayKey[], today = sunday(1)) => {
    const w = new World();
    w.week(1, {}, days);
    return get(weeklyReport(w.data(), 1, today), "muscle.volume");
  };
  it("≥ 90% of the planned 70 good · 70–90% watch · < 70% act (care work never counts)", () => {
    expect(vol(["lower_a", "upper_a", "lower_b", "upper_b"])).toMatchObject({ status: "good", message: "70 of 70 working sets." });
    expect(vol(["lower_a", "upper_a", "lower_b"])).toMatchObject({ status: "watch", message: "51 of 70 working sets." });
    expect(vol(["lower_a", "upper_a"])).toMatchObject({ status: "act", message: "36 of 70 sets: below the dose that keeps you growing." });
  });
  it("pending while the week runs", () => {
    expect(vol(["lower_a", "upper_a"], dayIn(1, "boxing"))).toMatchObject({ status: "pending", message: "36 of 70 working sets so far." });
  });
  it("the planned count follows the adjusted week (deload 36)", () => {
    const w = new World();
    w.week(7);
    expect(get(weeklyReport(w.data(), 7, sunday(7)), "muscle.volume")?.message).toBe("36 of 36 working sets.");
  });
});

describe("muscle.by_muscle", () => {
  it("the two muscles lowest against the good-week reference (info, complete week)", () => {
    const w = new World();
    w.week(1);
    const r = weeklyReport(w.data(), 1, sunday(1));
    expect(get(r, "muscle.by_muscle")).toMatchObject({
      status: "info", message: "Lowest against your good weeks: triceps 9.5 sets (54%), biceps 11.5 sets (58%)."
    });
    expect(r.numbers.muscles.find((m) => m.muscle === "Chest")?.sets).toBe(11);
    expect(laggingMuscles(w.data(), 1, 1)).toEqual(["triceps", "biceps"]);
  });
  it("history names and plan keys count as the same muscle", () => {
    const w = new World();
    for (const e of w.tables.exercises) if (e.muscle_direct === "side_delts") e.muscle_direct = "Side delts";
    w.week(1);
    expect(weeklyReport(w.data(), 1, sunday(1)).numbers.muscles.find((m) => m.key === "side_delts")?.sets).toBe(8); // 3 + 2 + 3 since Monday's laterals went (28 Oct 2026)
  });
});

describe("muscle.progress", () => {
  it("3+ sessions without a load or rep increase → watch; summary info", () => {
    const w = new World();
    for (const n of [1, 2, 3, 4]) w.week(n);
    const r = weeklyReport(w.data(), 4, sunday(4));
    expect(get(r, "muscle.progress.romanian_deadlift")).toMatchObject({
      status: "watch", message: "Romanian deadlift hasn't moved in 3 sessions. Last sets: 80 kg × 10, 10, 10. Make sure the last set reaches a stop sign."
    });
    expect(get(r, "muscle.progress")).toMatchObject({ status: "info", message: "0 of 21 accessories progressed in the last 2 weeks." });
  });
  it("a load increase resets the count", () => {
    const w = new World();
    for (const n of [1, 2, 3, 4]) {
      w.week(n, { load: (ex, p) => (ex.exerciseKey === "romanian_deadlift" && p.kind !== "warmup" ? 80 + 2.5 * n : undefined) });
    }
    const r = weeklyReport(w.data(), 4, sunday(4));
    expect(get(r, "muscle.progress.romanian_deadlift")).toBeUndefined();
    expect(get(r, "muscle.progress")?.message).toBe("1 of 21 accessories progressed in the last 2 weeks.");
  });
  it("deload sessions are not judged", () => {
    const w = new World();
    for (const n of [5, 6, 7, 8]) w.week(n);
    expect(get(weeklyReport(w.data(), 8, sunday(8)), "muscle.progress.romanian_deadlift")).toBeUndefined(); // 5, 6, 8: only 2 after the first
  });
});

describe("muscle.effort (§6.3)", () => {
  it("every failure set ≥ hi + 5 → info with the engine's next load (jump cap: one pin, not two)", () => {
    const at = (reps: number) => {
      const w = new World();
      w.session(dayIn(1, "upper_b"), "upper_b", { reps: (ex, p) => (ex.exerciseKey === "cable_rear_delt_fly" && p.kind === "failure" ? reps : undefined) });
      return get(weeklyReport(w.data(), 1, sunday(1)), "muscle.effort.cable_rear_delt_fly");
    };
    expect(at(25)).toMatchObject({ status: "info", message: "Cable rear delt fly: 25 reps is above the 12–20 range. Next time 40 lb (from 30)." });
    expect(at(24)).toBeUndefined();
  });
});
