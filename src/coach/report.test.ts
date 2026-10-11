import { addDays } from "../lib/format";
import { dailyCues, headlineOf, priorityOf, verdictOf, weeklyReport } from "./report";
import { dayIn, monday, sunday, World } from "./testkit";
import type { LiftingDayKey } from "../plan/types";
import type { Signal } from "./types";

const s = (id: string, status: Signal["status"], title = id): Signal => ({ id, area: "body", status, title, message: "", why: [] });

describe("verdict", () => {
  it("week 0 or fewer than 3 days of data → too_early, checked first", () => {
    expect(verdictOf(0, 7, [s("a", "act")])).toBe("too_early");
    expect(verdictOf(3, 2, [s("a", "act")])).toBe("too_early");
  });
  it("any act → adjust; two or more watch → watch; otherwise on_track", () => {
    expect(verdictOf(3, 5, [s("a", "act"), s("b", "good")])).toBe("adjust");
    expect(verdictOf(3, 5, [s("a", "watch"), s("b", "watch")])).toBe("watch");
    expect(verdictOf(3, 5, [s("a", "watch"), s("b", "info"), s("c", "pending")])).toBe("on_track");
  });
  it("headline templates", () => {
    expect(headlineOf("on_track", 3, [], [])).toBe("Week 3 is on plan. Keep going.");
    expect(headlineOf("too_early", 0, [], [])).toBe("Week 0: too early to judge. Log everything.");
    const watch = [s("body.path", "watch", "Bodyweight below the path"), s("x", "watch")];
    expect(headlineOf("watch", 3, watch, watch)).toBe("Mostly on plan. Keep an eye on bodyweight below the path.");
    const acts = [s("fuel.kcal", "act", "Calories too low")];
    expect(headlineOf("adjust", 3, acts, acts)).toBe("1 change to make this week: calories too low.");
    const two = [s("strength.tm.squat", "act", "Squat behind the line"), s("y", "act")];
    expect(headlineOf("adjust", 3, two, two)).toBe("2 changes to make this week: squat behind the line.");
    expect(headlineOf("adjust", 3, [s("z", "act", "TM down after break")], [s("z", "act")])).toBe("1 change to make this week: TM down after break.");
  });
  it("priority: rule ids and their subjects", () => {
    expect(priorityOf("joints.swap.incline_db_press")).toBeLessThan(priorityOf("body.rate"));
    expect(priorityOf("strength.checkpoint")).toBeLessThan(priorityOf("strength.checkpoint_ahead.squat"));
    expect(priorityOf("unknown.rule")).toBeGreaterThan(priorityOf("conditioning.week"));
  });
});

describe("weeklyReport", () => {
  /** Week 2: four sessions, daily weigh-ins in the band (creatine-shifted: 75.0–75.5 on 1 Nov), food on target, TMs on the line. */
  function goodWeek2(opts: { kcal?: number; bw?: number; days?: LiftingDayKey[] } = {}) {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    w.tm(monday(0), "deadlift", 200, "calibration");
    w.week(2, {}, opts.days);
    w.weighDaily(monday(1), 14, opts.bw ?? 75.2, 0);
    for (let i = 0; i < 7; i++) w.food(addDays(monday(2), i), opts.kcal ?? 2800, 150);
    return w;
  }

  it("on track", () => {
    const r = weeklyReport(goodWeek2().data(), 2, sunday(2));
    expect(r).toMatchObject({ weekNo: 2, weekType: "B", label: "Week 2", from: "2026-10-26", to: "2026-11-01", complete: true, verdict: "on_track" });
    // E21: the headline leads with sessions.
    expect(r.headline).toBe("4 of 4 sessions. Week 2 is on plan. Keep going.");
    expect(r.signals.filter((x) => x.status === "act")).toEqual([]);
    expect(r.numbers.sessions).toEqual({ done: 4, planned: 4 });
    expect(r.numbers.habit).toEqual({ weeks: 1, target: 6, missedTwice: 0, comebacks: 0 });
    expect(r.numbers.workingSets).toEqual({ done: 72, planned: 72 });
    expect(r.staticInfo.map((x) => x.id)).toEqual(["joints.redflags", "recovery.caffeine", "recovery.alcohol"]);
  });

  it("adjust: one act signal leads the actions and the headline", () => {
    const r = weeklyReport(goodWeek2({ kcal: 2400 }).data(), 2, sunday(2));
    expect(r.verdict).toBe("adjust");
    expect(r.headline).toBe("4 of 4 sessions. 1 change to make this week: calories too low.");
    expect(r.actions[0]).toMatchObject({ id: "fuel.kcal", status: "act" });
  });

  it("watch: two watch signals; actions list acts first, then watches, by priority", () => {
    const r = weeklyReport(goodWeek2({ bw: 74.2, days: ["lower_a", "upper_a", "lower_b"] }).data(), 2, sunday(2));
    expect(r.verdict).toBe("watch");
    expect(r.actions.map((x) => x.id)).toEqual(["consistency.sessions", "muscle.volume", "body.path"]);
    expect(r.headline).toBe("3 of 4 sessions. Mostly on plan. Keep an eye on one session missed.");
  });

  it("labels a running week 'so far' and stays too_early with under 3 days of data", () => {
    const w = new World();
    w.session(dayIn(2, "lower_a"), "lower_a");
    const r = weeklyReport(w.data(), 2, dayIn(2, "upper_a"));
    expect(r).toMatchObject({ label: "Week 2 so far", complete: false, verdict: "too_early", headline: "1 of 4 sessions so far. Week 2: too early to judge. Log everything." });
  });

  it("titles stay within 6 words, even with long exercise names", () => {
    const w = new World();
    for (const n of [1, 2, 3, 4]) w.week(n, { reps: (_ex, p) => (p.kind === "failure" ? (p.repRange?.[1] ?? 10) + 5 : undefined) });
    w.pain(dayIn(4, "lower_a"), "right_shoulder", "cable_lateral_raise", { next_morning: "sore", during_set: "sharp" });
    w.pain(dayIn(4, "upper_a"), "right_elbow", "overhead_cable_triceps_extension", { next_morning: "sore" });
    const r = weeklyReport(w.data(), 4, sunday(4));
    expect(r.signals.length).toBeGreaterThan(30);
    expect(r.signals.filter((x) => x.title.split(/\s+/).length > 6).map((x) => x.title)).toEqual([]);
  });

  it("signals are grouped by area", () => {
    const r = weeklyReport(goodWeek2().data(), 2, sunday(2));
    const areas = r.signals.map((x) => x.area);
    const order = ["consistency", "strength", "muscle", "body", "fuel", "joints", "recovery", "conditioning"];
    expect([...areas].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(areas);
  });

  it("the same action from two signals is offered once", () => {
    // Checkpoint 1 missed on bodyweight (+100 kcal from 30 Nov) and rep-outs missed with bodyweight falling (+100 kcal from 30 Nov).
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    w.tm(dayIn(6, "lower_a"), "squat", 145);
    w.tm(dayIn(6, "lower_b"), "deadlift", 210);
    w.session(dayIn(5, "lower_a"), "lower_a", { reps: (ex, p) => (ex.mainLift === "squat" && p.kind === "rep_out" ? 6 : undefined) });
    w.session(dayIn(6, "lower_a"), "lower_a", { reps: (ex, p) => (ex.mainLift === "squat" && p.kind === "rep_out" ? 3 : undefined) });
    w.weighDaily(monday(4), 21, 74.6, -0.3);
    const r = weeklyReport(w.data(), 6, sunday(6));
    const withKcal = r.signals.filter((x) => x.action?.kind === "kcal");
    expect(withKcal).toHaveLength(1);
    expect(r.signals.find((x) => x.id === "strength.misses")?.status).toBe("act");
    expect(r.signals.find((x) => x.id === "strength.checkpoint")?.status).toBe("act");
  });
});

describe("dailyCues (at most 3, in priority order)", () => {
  it("Thursday morning: pain prompt, then the if-then floor cue, then a pending action (weigh-in reminder cut)", () => {
    const w = new World();
    w.week(0);
    w.pain(dayIn(1, "lower_a"), "right_elbow", "incline_db_press", { next_morning: "sore" }); // → joints.swap act with an action
    w.pain(dayIn(1, "easy_ride"), "right_elbow", "cross_body_triceps_extension");             // yesterday's ache, unanswered
    const cues = dailyCues(w.data(), dayIn(1, "boxing"), 8);
    expect(cues.map((c) => c.id)).toEqual(["joints.prompt", "habit.floor", "action.joints.swap.incline_db_press"]);
    expect(cues[1]).toMatchObject({ tone: "warm", text: "Fri = Lower A, Sat = Upper A. That's the floor." });
    expect(cues[2]).toMatchObject({ tone: "warm", to: "/checkin", signalId: "joints.swap.incline_db_press", action: { kind: "swap" } });
  });

  it("Sunday evening: plan the week, protein, check-in ready (no waist cue unless he logs it)", () => {
    const w = new World();
    w.week(0);
    w.week(1);
    w.weighDaily(monday(1), 7, 75, 0);
    w.food(sunday(1), 900, 50);
    const cues = dailyCues(w.data(), sunday(1), 19);
    expect(cues.map((c) => c.id)).toEqual(["habit.plan_week", "fuel.today", "checkin.ready"]);
    expect(cues[0]).toMatchObject({ text: "Plan the week: which 4 days?", to: "/plan" });
    expect(cues[2]).toMatchObject({ tone: "good", text: "Week 1 check-in is ready.", to: "/checkin" });
  });

  it("weigh-in reminder before 11:00 when none today; the monthly elbow check until it is logged", () => {
    const w = new World();
    w.week(0);
    w.waist(dayIn(1, "lower_a"), 80);
    w.session(dayIn(1, "lower_a"), "lower_a");
    expect(dailyCues(w.data(), dayIn(1, "upper_a"), 7).map((c) => c.id)).toEqual(["body.weigh_in", "joints.elbow_monthly"]);
    expect(dailyCues(w.data(), dayIn(1, "upper_a"), 7)[1]).toMatchObject({ input: "elbow_monthly" });
    w.pain(dayIn(1, "lower_a"), "elbow_monthly", null, { during_set: null, note: JSON.stringify({ kind: "elbow_monthly", worst: 3, grip: 2, daily: 1 }) });
    expect(dailyCues(w.data(), dayIn(1, "upper_a"), 7).map((c) => c.id)).toEqual(["body.weigh_in"]);
    w.weigh(dayIn(1, "upper_a"), 74.6);
    expect(dailyCues(w.data(), dayIn(1, "upper_a"), 7)).toEqual([]);
    // Wednesday: Tuesday was planned and skipped.
    expect(dailyCues(w.data(), dayIn(1, "easy_ride"), 12).map((c) => c.id)).toEqual(["habit.missed_yesterday"]);
  });

  it("lifting day: caffeine/candy from 15:00 (key sessions: caffeine ok) and lights out at 23:15 the night before", () => {
    const w = new World();
    w.weighDaily(monday(1), 14, 75, 0);
    w.pain(monday(1), "elbow_monthly", null, { during_set: null });
    w.session(dayIn(1, "lower_a"), "lower_a");
    expect(dailyCues(w.data(), dayIn(1, "upper_a"), 15).map((c) => c.text)).toContain("No caffeine today; candy ~30–40 g 30–60 min before.");
    expect(dailyCues(w.data(), dayIn(1, "upper_a"), 14).map((c) => c.id)).not.toContain("fuel.caffeine");
    expect(dailyCues(w.data(), dayIn(0, "upper_a"), 15).map((c) => c.text)).toContain("Key session: caffeine ok, ~150 mg at 17:15.");
    expect(dailyCues(w.data(), dayIn(17, "lower_a"), 15).map((c) => c.text)).toContain("Key session: caffeine ok, ~150 mg at 17:15."); // D week
    expect(dailyCues(w.data(), dayIn(1, "easy_ride"), 15).map((c) => c.id)).not.toContain("fuel.caffeine");
    expect(dailyCues(w.data(), dayIn(1, "boxing"), 22).map((c) => c.id)).toContain("recovery.lights_out");
    expect(dailyCues(w.data(), dayIn(1, "easy_ride"), 22).map((c) => c.id)).not.toContain("recovery.lights_out");
  });
});
