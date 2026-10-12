import { describe, expect, it } from "vitest";
import { prescribeDay } from "../plan/engine";
import { PLAN } from "../plan/bridge";
import { sessionDebrief } from "./debrief";
import { dayIn, STATE, World } from "./testkit";

describe("post-session debrief", () => {
  it("accessories at the top of the range go up; a missed rep stays, with the reason", () => {
    const w = new World();
    const s = w.session(dayIn(1, "lower_a"), "lower_a", {
      reps: (e, _p, i) => (e.exerciseKey === "cable_leg_extension" && i === 1 ? 14 : undefined),
    });
    const sets = w.tables.sets.filter((x) => x.session_id === s.id);
    const next = prescribeDay(PLAN, 2, "lower_a", { ...STATE, ...w.data().state, trainingMaxes: STATE.trainingMaxes });
    const d = sessionDebrief({ sets, maxes: [], keyOf: new Map(), next, nextDateLabel: "Mon 19 Oct" });
    expect(d.nextMain).toMatch(/^Next Lower A · Mon 19 Oct: Back squat/);
    expect(d.up.map((r) => r.name)).toContain("Lying DB hamstring curl");
    expect(d.same).toContainEqual({ name: "Cable leg extension", why: "reach 20 reps on every set to go up" });
    expect(d.down).toEqual([]);
  });
});
