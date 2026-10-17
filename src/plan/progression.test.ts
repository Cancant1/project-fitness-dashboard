import { describe, expect, it } from "vitest";
import { dayIn, STATE, World } from "../coach/testkit";
import { PLAN } from "./bridge";
import { prescribeDay } from "./engine";

// Bug hunt 12 Oct 2026: a plain tick of a pre-filled set counted as "top of the range" and stepped the load up.
describe("progression from ticked sets", () => {
  it("week 0: ticked at the range top → week 1 starts at the same load", () => {
    const w = new World();
    w.session(dayIn(0, "lower_a"), "lower_a");
    const loads = w.data().state.currentLoads;
    expect(loads.cable_lateral_raise).toBe(20);
    expect(loads.lying_db_hamstring_curl).toBe(25);
    expect(loads.romanian_deadlift).toBe(80);
  });
  it("week 0: past the range top on every set → one step up", () => {
    const w = new World();
    w.session(dayIn(0, "lower_a"), "lower_a", { reps: (e, p) => (e.exerciseKey === "lying_db_hamstring_curl" && p.repRange ? p.repRange[1] + 2 : undefined) });
    expect(w.data().state.currentLoads.lying_db_hamstring_curl).toBeGreaterThan(25);
  });
  it("shoulder block: filled in at the range bottom, so a plain tick keeps the load", () => {
    const tue = prescribeDay(PLAN, 1, "upper_a", STATE);
    const er = tue.exercises.find((e) => e.exerciseKey === "cable_external_rotation")!;
    expect(er.sets.map((s) => s.reps)).toEqual([12, 12]);
    const w = new World();
    w.session(dayIn(1, "upper_a"), "upper_a");
    w.session(dayIn(1, "upper_b"), "upper_b");
    expect(w.data().state.currentLoads.cable_external_rotation).toBe(10);
    const w2 = new World();
    w2.session(dayIn(1, "upper_a"), "upper_a", { reps: (e, p) => (e.role === "shoulder" ? p.repRange?.[1] : undefined) });
    expect(w2.data().state.currentLoads.cable_external_rotation).toBeGreaterThan(10);
  });
});
