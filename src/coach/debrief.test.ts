import { describe, expect, it } from "vitest";
import { prescribeDay } from "../plan/engine";
import { PLAN } from "../plan/bridge";
import { sessionDebrief } from "./debrief";
import { dayIn, STATE, World } from "./testkit";

describe("post-session debrief", () => {
  it("numbers, not sentences: next main lift, one row per accessory, a short hint only for its own reason", () => {
    const w = new World();
    const s = w.session(dayIn(1, "lower_a"), "lower_a", {
      reps: (e, _p, i) => (e.exerciseKey === "cable_leg_extension" && i === 1 ? 14 : undefined),
    });
    const sets = w.tables.sets.filter((x) => x.session_id === s.id);
    const next = prescribeDay(PLAN, 2, "lower_a", { ...STATE, ...w.data().state, trainingMaxes: STATE.trainingMaxes });
    const d = sessionDebrief({ sets, maxes: [], keyOf: new Map(), next, nextDateLabel: "19 Oct" });
    expect(d.next).toMatchObject({ title: "Lower A", date: "19 Oct", lift: "Squat", added: false });
    expect(d.next!.scheme).toMatch(/^\d × \d+ · max set/);
    expect(d.rows.find((r) => r.name === "Lying DB hamstring curl")?.dir).toBe("up");
    expect(d.rows.find((r) => r.name === "Cable leg extension")).toMatchObject({ dir: "same", hint: "up at 20 reps" });
    expect(d.rows.find((r) => r.name === "Slow wrist extension")?.dir).toBe("up"); // rung 15 → 12, all hit: next dumbbell
    expect(d.held).toBe(false);
  });
  it("week 0 at the range top: rows hold with no hint, and the card's 'Why held' explains it once", () => {
    const w = new World();
    const s = w.session(dayIn(0, "lower_a"), "lower_a");
    const sets = w.tables.sets.filter((x) => x.session_id === s.id);
    const next = prescribeDay(PLAN, 1, "lower_a", { ...STATE, ...w.data().state, trainingMaxes: STATE.trainingMaxes });
    const d = sessionDebrief({ sets, maxes: [], keyOf: new Map(), next, nextDateLabel: "19 Oct", calibration: true });
    expect(d.held).toBe(true);
    expect(d.rows.find((r) => r.name === "Romanian deadlift")).toMatchObject({ dir: "same", hint: null, from: 80, to: 80 });
  });
});
