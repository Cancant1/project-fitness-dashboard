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
});
