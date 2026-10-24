// Round-2 proposals accepted on 24 Oct 2026 (DECISIONS): the coach side.
import { describe, expect, it } from "vitest";
import { addDays } from "../lib/format";
import { expectedBand, pathAnchor } from "./body";
import { weeklyReport } from "./report";
import { fitRegainK } from "./strength";
import { dayIn, monday, sunday, World } from "./testkit";
import type { WeeklyReport } from "./types";

const get = (r: WeeklyReport, id: string) => r.signals.find((s) => s.id === id);

describe("R2-09 rear delts: horizontal rows count ½", () => {
  it("a full week 1: 2 rear delt fly sets + (3 barbell row + 2 seated row) × ½ = 4.5", () => {
    const w = new World();
    w.week(1);
    const rear = weeklyReport(w.data(), 1, sunday(1)).numbers.muscles.find((m) => m.key === "rear_delts")!;
    expect(rear.sets).toBeCloseTo(4.5, 6);
    expect(rear.plan).toBe(4.5);
  });
});

describe("R2-16 shoulder block trigger", () => {
  it("a rising monthly elbow score → bring the block back; a flat one → nothing", () => {
    const w = new World();
    w.pain(dayIn(0, "upper_b"), "elbow_monthly", null, { during_set: null, note: JSON.stringify({ worst: 0, grip: 0, daily: 0, total: 0 }) });
    w.pain(dayIn(4, "upper_b"), "elbow_monthly", null, { during_set: null, note: JSON.stringify({ worst: 2, grip: 1, daily: 0, total: 3 }) });
    expect(get(weeklyReport(w.data(), 4, sunday(4)), "joints.shoulder_block")).toMatchObject({
      status: "watch", title: "Bring back the shoulder block"
    });
    expect(get(weeklyReport(w.data(), 4, sunday(4)), "joints.shoulder_block")?.message).toContain("Monthly elbow score up (0 → 3)");
    const flat = new World();
    flat.pain(dayIn(0, "upper_b"), "elbow_monthly", null, { during_set: null, note: JSON.stringify({ total: 2 }) });
    flat.pain(dayIn(4, "upper_b"), "elbow_monthly", null, { during_set: null, note: JSON.stringify({ total: 2 }) });
    expect(get(weeklyReport(flat.data(), 4, sunday(4)), "joints.shoulder_block")).toBeUndefined();
  });
  it("elbow pain 4/10 during a set this week → bring it back", () => {
    const w = new World();
    w.week(2);
    w.pain(dayIn(2, "upper_a"), "right_elbow", "bayesian_curl", { pain_score: 4 });
    expect(get(weeklyReport(w.data(), 2, sunday(2)), "joints.shoulder_block")?.message).toContain("Elbow pain at 4/10");
  });
});

describe("R2-06 lateral raise decision on 14 Nov", () => {
  const laterals = (reps: number[]) => {
    const w = new World();
    for (const n of [1, 2, 3, 4]) {
      w.week(n, { reps: (e, p, i) => (e.exerciseKey === "cable_lateral_raise" && p.kind === "failure" ? reps[i] ?? reps.at(-1) : undefined) });
    }
    return weeklyReport(w.data(), 4, sunday(4));
  };
  it("still held by the jump cap → switch to DB laterals", () => {
    expect(get(laterals([20, 15, 13]), "muscle.lateral_decision")).toMatchObject({ status: "act", title: "Switch to DB laterals" });
  });
  it("the pin was earned → keep the cables; other weeks say nothing", () => {
    expect(get(laterals([30, 25, 22]), "muscle.lateral_decision")).toMatchObject({ status: "good", title: "Keep the cable laterals" });
    const w = new World();
    w.week(3);
    expect(get(weeklyReport(w.data(), 3, sunday(3)), "muscle.lateral_decision")).toBeUndefined();
  });
});

describe("R2-12 session lengths from the log after week 4", () => {
  it("median logged minutes per lifting day, weeks 2–4", () => {
    const w = new World();
    for (const n of [2, 3, 4]) w.week(n);
    const s = get(weeklyReport(w.data(), 4, sunday(4)), "consistency.session_length");
    expect(s).toMatchObject({ status: "info", title: "Session lengths from your log" });
    expect(s?.message).toContain("Lower B 75 (plan 70)");
    expect(get(weeklyReport(w.data(), 3, sunday(3)), "consistency.session_length")).toBeUndefined();
  });
});

describe("R2-05 breath tag", () => {
  it("sets tagged 'breath' → an info signal naming the exercise", () => {
    const w = new World();
    w.week(1);
    const bss = w.ids.get("bulgarian_split_squat");
    const set = w.tables.sets.find((s) => s.exercise_id === bss && s.kind === "rep_out")!;
    set.flags = ["breath"];
    const s = get(weeklyReport(w.data(), 1, sunday(1)), "muscle.breath");
    expect(s).toMatchObject({ status: "info", title: "Breath ended sets" });
    expect(s?.message).toContain("1 set ended on breathing");
  });
});

describe("R2-02 / R2-03 checkpoint-1 reads", () => {
  it("rep-out spread over weeks 1–6 at checkpoint 1", () => {
    const w = new World();
    for (const n of [1, 2, 3, 4, 5, 6]) {
      w.week(n, { reps: (e, p) => (e.mainLift && p.kind === "rep_out" && p.target != null ? p.target + (n % 2 ? 1 : -1) : undefined) });
    }
    const s = get(weeklyReport(w.data(), 6, sunday(6)), "strength.repout_noise");
    expect(s).toMatchObject({ status: "info", title: "Rep-out spread" });
    expect(s?.message).toContain("within ±1.0 reps");
    expect(s?.message).toContain("the rep-out table stands");
  });
  it("fitRegainK: fitted from week 2 on; a curve at k = 0.17 comes back as 0.17", () => {
    const s0 = 132.5, p = 165;
    const pts = [0, 1, 2, 3, 4, 5, 6].map((t) => ({ week: t, tm: p - (p - s0) * Math.exp(-0.17 * t) }));
    expect(fitRegainK(pts, s0, p)).toBeCloseTo(0.17, 6);
    expect(fitRegainK(pts.slice(0, 3), s0, p)).toBeNull();
  });
});

describe("R2-07 pull-up on system mass", () => {
  it("the step signal quotes bodyweight + belt and its e1RM", () => {
    const w = new World();
    w.weighDaily(addDays(monday(1), -6), 14, 75, 0);
    w.session(dayIn(1, "upper_a"), "upper_a", { reps: (e, p) => (e.mainLift === "weighted_pullup" && p.kind === "rep_out" ? 8 : undefined) });
    const s = get(weeklyReport(w.data(), 1, sunday(1)), "strength.step.weighted_pullup");
    expect(s?.message).toMatch(/\+5 kg × 8 \(80 kg system, e1RM 101\)/);
  });
});

describe("review fixes (24 Oct 2026)", () => {
  it("rest week: conditioning reads 'Rest week', not 'Boxing done'", () => {
    const s = get(weeklyReport(new World().data(), 10, sunday(10)), "conditioning.week");
    expect(s).toMatchObject({ status: "info", title: "Rest week", message: "Nothing planned · 0 free-day notes." });
  });
  it("lateral decision: judged on that week's sets; nothing logged → decide at the check-in", () => {
    const none = new World();
    none.week(4, { only: ["squat"] }, ["lower_a"]);
    expect(get(weeklyReport(none.data(), 4, sunday(4)), "muscle.lateral_decision")).toMatchObject({ status: "info", title: "Lateral raise decision" });
  });
  it("session lengths leave minimum sessions out", () => {
    const w = new World();
    for (const n of [2, 3, 4]) w.week(n);
    for (const s of w.tables.sessions.filter((x) => (x.legacy_ref as { plan?: { dayKey?: string } }).plan?.dayKey === "lower_b").slice(0, 2)) {
      s.duration_min = 30;
      (s.legacy_ref as { plan: { minimum?: boolean } }).plan.minimum = true;
    }
    expect(get(weeklyReport(w.data(), 4, sunday(4)), "consistency.session_length")?.message).toContain("Lower B 75 (plan 70)");
  });
  it("the anchored weight band has no step at the anchor date (the whole path shifts)", () => {
    const w = new World();
    w.weighDaily(addDays(monday(3), -3), 21, 76.5, 0);
    const data = w.data();
    const anchor = pathAnchor(data, sunday(4))!;
    const shift = (d: string) => expectedBand(d, data.plan, anchor)![0] - expectedBand(d, data.plan)![0];
    expect(shift(addDays(anchor.date, -1))).toBeCloseTo(shift(anchor.date), 9);
    expect(shift(anchor.date)).toBeGreaterThan(0.5);
  });
});
