// @vitest-environment node
// Research round 1, Part E (docs/R1_BUILD.md): coach rules and inputs.
import "fake-indexeddb/auto";
import { LocalStore } from "../data/local";
import type { HealthDaily, Program } from "../data/types";
import { addDays } from "../lib/format";
import { ensurePlanExercises } from "../plan/bridge";
import { applyCoachAction, saveElbowMonthly, saveGassed, savePainCheck, savePhotosDone } from "./apply";
import { habitCues } from "./consistency";
import { EVIDENCE } from "./evidence";
import { RED_FLAG_REMINDER } from "./joints";
import { weeklyReport } from "./report";
import { dayIn, monday, sunday, World } from "./testkit";
import type { WeeklyReport } from "./types";

const get = (r: WeeklyReport, id: string) => r.signals.find((s) => s.id === id);
const squatReps = (reps: number) => ({ reps: (e: { mainLift?: string }, p: { kind: string }) => (e.mainLift === "squat" && p.kind === "rep_out" ? reps : undefined) });

describe("evidence ids", () => {
  it("the R1 ids exist", () => {
    for (const id of ["P-MINIMUM", "P-TIMESAVE", "P-RESTART", "P-VARIETY", "P-HABITS", "M-MEASURE", "N-ALCOHOL", "C-READINESS"]) {
      expect(EVIDENCE[id as keyof typeof EVIDENCE], id).toBeTruthy();
    }
  });
  it("every signal cites known ids", () => {
    const w = new World();
    for (const n of [1, 2, 3, 4]) w.week(n);
    w.pain(dayIn(4, "upper_a"), "right_elbow", "bayesian_curl", { pain_score: 5, morning_score: 6 });
    const r = weeklyReport(w.data(), 4, sunday(4));
    for (const s of [...r.signals, ...r.staticInfo]) for (const id of s.why) expect(EVIDENCE[id], `${s.id}: ${id}`).toBeTruthy();
  });
});

describe("E2 minimum sessions count", () => {
  it("as the day's session (2 = the floor) and its sets as working sets", () => {
    const w = new World();
    const s = w.session(dayIn(1, "lower_a"), "lower_a", { only: ["squat", "romanian_deadlift"] });
    (s.legacy_ref as { plan: { minimum?: boolean } }).plan.minimum = true;
    w.session(dayIn(1, "upper_a"), "upper_a");
    const r = weeklyReport(w.data(), 1, sunday(1));
    expect(r.numbers.sessions).toEqual({ done: 2, planned: 4, minimum: 1 });
    expect(get(r, "consistency.sessions")).toMatchObject({ status: "watch", message: "2 of 4 sessions: the floor held. Aim for 4 next week." });
  });
});

describe("E3 missed week and long break", () => {
  it("week 5 or 6 missed → train through week 7 (skip_deload); applied → week 7 is a C week", () => {
    const w = new World();
    for (const n of [1, 2, 3, 4]) w.week(n);
    const s = get(weeklyReport(w.data(), 6, dayIn(6, "upper_a")), "consistency.missed_week");
    expect(s).toMatchObject({
      status: "act", title: "Train through week 7",
      message: "Week 5 was missed. No catch-up: carry on with week 6 as planned. Missed weeks count as an unplanned deload. Train through week 7 instead of deloading.",
      action: { kind: "skip_deload", weekNo: 7 }
    });
    w.adjust({ kind: "skip_deload", weekNo: 7 }, "consistency.missed_week", "2026-11-24T09:00:00Z");
    const data = w.data();
    expect(data.plan.weeks[7]).toMatchObject({ type: "C", deloadSkipped: true });
    expect(get(weeklyReport(data, 6, dayIn(6, "upper_a")), "consistency.missed_week")).toMatchObject({ status: "info", applied: { created: "2026-11-24T09:00:00Z" } });
  });
  it("14–27 days off → TM −5%; ≥ 28 days → recalibrate at 75% of the last TM", () => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    w.session(dayIn(1, "lower_a"), "lower_a");
    expect(get(weeklyReport(w.data(), 4, "2026-11-15"), "consistency.long_break")?.action).toEqual({ kind: "tm_reduce", percent: 5 });
    expect(get(weeklyReport(w.data(), 5, "2026-11-16"), "consistency.long_break")).toMatchObject({
      status: "act", message: "28 days off. Re-run calibration: rep-out at 75% of your last TM.", action: { kind: "recalibrate" }
    });
    w.adjust({ kind: "recalibrate" }, "consistency.long_break", "2026-11-16T08:00:00Z");
    const data = w.data();
    expect(data.state.recalibrate).toEqual({ squat: 105 });
    expect(get(weeklyReport(data, 5, "2026-11-16"), "consistency.long_break")?.status).toBe("info");
  });
});

describe("E4 strength.repout past the old best", () => {
  it("says (capped past your old best)", () => {
    const at = (reps: number) => {
      const w = new World();
      w.tm(monday(0), "squat", 165, "calibration");
      w.session(dayIn(1, "lower_a"), "lower_a", squatReps(reps));
      return get(weeklyReport(w.data(), 1, sunday(1)), "strength.repout.squat");
    };
    expect(at(10)).toMatchObject({ status: "good", message: "Squat 100 × 10 (target 10): TM stays 165 (capped past your old best)." });
    expect(at(12)?.message).toBe("Squat 100 × 12 (target 10): TM +2.5 kg to 167.5 (capped past your old best).");
  });
});

describe("E7 early-deload trigger and E18 short nights", () => {
  const run = (reps: number[], setup?: (w: World) => void) => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    reps.forEach((r, i) => w.session(dayIn(i + 1, "lower_a"), "lower_a", squatReps(r)));
    w.weighDaily(monday(1), 7 * reps.length, 75.5, 0);
    setup?.(w);
    return weeklyReport(w.data(), reps.length, sunday(reps.length));
  };
  it("three rep-outs in a row ≥ 1 under → deload now; two at −1 → nothing", () => {
    expect(get(run([9, 7, 5]), "strength.misses")).toMatchObject({
      status: "act", message: "Rep-outs under target three weeks running. Take the deload now; the plan allows it early.", action: { kind: "deload_now", weekNo: 4 }
    });
    expect(get(run([10, 7, 5]), "strength.misses")).toBeUndefined();
  });
  it("joint aches rising two weeks running → deload now", () => {
    const w = new World();
    for (const n of [1, 2, 3]) w.week(n);
    w.pain(dayIn(1, "lower_a"), "right_elbow", "cross_body_triceps_extension");
    for (const d of ["lower_a", "upper_a"] as const) w.pain(dayIn(2, d), "right_elbow", "cross_body_triceps_extension");
    for (const d of ["lower_a", "upper_a", "lower_b"] as const) w.pain(dayIn(3, d), "right_elbow", "cross_body_triceps_extension");
    expect(get(weeklyReport(w.data(), 3, sunday(3)), "joints.trend.right_elbow")).toMatchObject({
      status: "act", message: "Right elbow aches rose two weeks running (1 → 2 → 3 sessions). Take the deload now; the plan allows it early.",
      action: { kind: "deload_now", weekNo: 4 }
    });
  });
});

describe("E12 muscle.overreach", () => {
  it("logged working sets above planned × 1.1: missed sets are gone", () => {
    const w = new World();
    w.week(1);
    w.session(dayIn(1, "easy_ride"), "lower_a");
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "muscle.overreach")).toMatchObject({
      status: "watch", message: "87 working sets against 70 planned. Missed sets are gone; the next session is the plan."
    });
    const ok = new World();
    ok.week(1);
    expect(get(weeklyReport(ok.data(), 1, sunday(1)), "muscle.overreach")).toBeUndefined();
  });
});

describe("E14 joints on a 0–10 scale", () => {
  it("morning ≥ the usual + 2 → swap with a start load; within 1 point → nothing", () => {
    const w = new World();
    w.pain(dayIn(1, "upper_a"), "right_elbow", "incline_db_press", { pain_score: 3, morning_score: 5 });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "joints.swap.incline_db_press")).toMatchObject({
      status: "act",
      message: "Right elbow at 5/10 the morning after incline DB press (usual 0). Swap to neutral-grip DB bench press for 2 weeks (until 3 Nov). Start with the same dumbbells (22.5 kg); first session normal sets only, no rep-out.",
      action: { kind: "swap", exerciseKey: "incline_db_press", to: "db_bench_press", until: "2026-11-03", startLoad: 22.5, unit: "kg" }
    });
    const calm = new World();
    calm.pain(dayIn(1, "upper_a"), "right_elbow", "incline_db_press", { pain_score: 3, morning_score: 1 });
    expect(get(weeklyReport(calm.data(), 1, sunday(1)), "joints.swap.incline_db_press")).toBeUndefined();
  });
  it("pain ≥ 6 counts as stopped (joints.sharp)", () => {
    const w = new World();
    w.pain(dayIn(1, "upper_a"), "right_elbow", "incline_db_press", { pain_score: 7, during_set: "ache" });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "joints.sharp.right_elbow")?.message)
      .toBe("Pain 7/10 in right elbow during incline DB press on Tuesday. That exercise stopped for the day — right call.");
  });
  it("morning scores rising two weeks running → cut that exercise's sets by a third, with the red flags", () => {
    const w = new World();
    [1, 2, 3].forEach((n) => w.pain(dayIn(n, "upper_a"), "right_elbow", "bayesian_curl", { pain_score: 2, morning_score: n }));
    const s = get(weeklyReport(w.data(), 3, sunday(3)), "joints.cut_sets.bayesian_curl");
    expect(s).toMatchObject({ status: "act", title: "Right elbow mornings rising", action: { kind: "cut_sets", exerciseKey: "bayesian_curl", until: "2026-11-22" } });
    expect(s?.action?.kind === "cut_sets" && s.action.fraction).toBeCloseTo(1 / 3, 10);
    expect(s?.message).toContain("(1 → 2 → 3/10). Cut bayesian curl sets by a third until 22 Nov.");
    expect(s?.message).toContain(RED_FLAG_REMINDER);
  });
  it("E23: 4 weeks of elbow pain at 0–3 → the incline hammer curl is offered (info), not after a 4/10", () => {
    const w = new World();
    const s = get(weeklyReport(w.data(), 5, sunday(5)), "joints.alternative.db_curl");
    expect(s).toMatchObject({
      status: "info", action: { kind: "swap", exerciseKey: "db_curl", to: "incline_hammer_curl", until: "2027-02-28", startLoad: 12, unit: "kg" }
    });
    expect(get(weeklyReport(w.data(), 3, sunday(3)), "joints.alternative.db_curl")).toBeUndefined(); // < 4 weeks in
    w.pain("2026-11-10", "right_elbow", "bayesian_curl", { pain_score: 4 });
    expect(get(weeklyReport(w.data(), 5, sunday(5)), "joints.alternative.db_curl")).toBeUndefined();
  });
});

describe("E21 habit metrics and if-then cues", () => {
  it("missed twice in a row → watch; a session within 48 h of a miss → comeback", () => {
    const w = new World();
    w.week(1);
    w.week(2, {}, ["lower_b", "upper_b"]);
    const r = weeklyReport(w.data(), 2, sunday(2));
    expect(get(r, "consistency.missed_twice")).toMatchObject({ status: "watch", message: "Missed twice in a row. Next session: just the minimum session if that's all you've got." });
    expect(get(r, "consistency.comeback")).toBeUndefined();
    expect(r.numbers.habit).toMatchObject({ missedTwice: 1, comebacks: 0 });
    const c = new World();
    c.week(1);
    c.week(2, {}, ["upper_a", "lower_b", "upper_b"]);
    const r2 = weeklyReport(c.data(), 2, sunday(2));
    expect(get(r2, "consistency.comeback")).toMatchObject({ status: "good", message: "Comeback within 48 h. That's the habit." });
    expect(get(r2, "consistency.missed_twice")).toBeUndefined();
  });
  it("habit meter: complete weeks in a row with 4+ sessions, n/6", () => {
    const w = new World();
    for (const n of [1, 2, 3, 4, 5, 6]) w.week(n);
    expect(get(weeklyReport(w.data(), 2, sunday(2)), "consistency.habit")).toMatchObject({ status: "info", message: "Habit meter: 2 of 6 weeks at 4+ sessions in a row." });
    expect(get(weeklyReport(w.data(), 6, sunday(6)), "consistency.habit")).toMatchObject({ status: "good", message: "6 weeks at 4+ sessions: the habit threshold." });
  });
  it("missed yesterday · minimum session (feel ≤ 2 twice) · first exercise after 17:00 · Sunday planning", () => {
    const w = new World();
    expect(habitCues(w.data(), dayIn(1, "upper_a"), 9).map((c) => c.id)).toEqual(["habit.missed_yesterday"]);
    w.session(dayIn(1, "lower_a"), "lower_a", { energy: 2 });
    w.session(dayIn(1, "upper_a"), "upper_a", { energy: 2 });
    const fri = habitCues(w.data(), dayIn(1, "lower_b"), 9);
    expect(fri.find((c) => c.id === "habit.minimum")).toMatchObject({ text: "Take the minimum session today. It counts.", startMinimum: true });
    expect(habitCues(w.data(), dayIn(1, "lower_b"), 18).map((c) => c.id)).toContain("habit.first_exercise");
    w.session(dayIn(1, "lower_b"), "lower_b");
    expect(habitCues(w.data(), dayIn(1, "lower_b"), 18)).toEqual([]);
    expect(habitCues(w.data(), dayIn(1, "rounds"), 9).map((c) => c.text)).toEqual(["Missed yesterday → do it on your next free day (Wed or Sun). No doubling up.", "Plan the week: which 4 days?"]);
    expect(habitCues(w.data(), dayIn(1, "boxing"), 9).map((c) => c.id)).toEqual([]); // Thursday with 2 sessions
  });
});

describe("C-READINESS", () => {
  it("resting HR and HRV: 7-day average against a 60-day baseline, information only", () => {
    const w = new World();
    const row = (date: string, hr: number, hrv: number): HealthDaily => ({
      id: `h-${date}`, user_id: "u1", created_at: "x", updated_at: "x", date, sleep_total_min: null, sleep_deep_min: null, sleep_rem_min: null,
      sleep_core_min: null, sleep_awake_min: null, resting_hr: hr, hrv_sdnn_ms: hrv, source: "ios-shortcut"
    });
    for (let d = "2026-10-01"; d <= "2026-11-08"; d = addDays(d, 1)) w.tables.health_daily.push(d >= "2026-11-02" ? row(d, 56, 50) : row(d, 52, 60));
    const r = weeklyReport(w.data(), 3, sunday(3));
    expect(get(r, "recovery.resting_hr")).toMatchObject({ status: "info", message: "Resting HR 56 bpm over the last 7 days (60-day baseline 53). Information only.", why: ["C-READINESS"] });
    expect(get(r, "recovery.hrv")).toMatchObject({ status: "info", why: ["C-READINESS"] });
    expect(get(r, "recovery.hrv")?.message).toMatch(/^HRV 50 ms over the last 7 days \(60-day baseline 58\)\. Information only/);
    expect(r.numbers.heart).toMatchObject({ restingHr7d: 56, hrv7d: 50 });
  });
});

describe("E22 gassed rating and E24 variety", () => {
  it("gassed falling → working; unchanged by week 8 → the pacing tip (no rounds since 24 Oct 2026)", () => {
    const w = new World();
    w.cond(dayIn(1, "boxing"), "boxing", { rating: 4, rounds: 3 });
    w.cond(dayIn(2, "boxing"), "boxing", { rating: 3 });
    const r = weeklyReport(w.data(), 2, sunday(2));
    expect(get(r, "conditioning.gassed")).toMatchObject({ status: "good", message: "Gassed 4 → 3: working." });
    expect(r.numbers.conditioning).toMatchObject({ gassed: 3, fadeRound: null });
    const p = new World();
    p.cond(dayIn(3, "boxing"), "boxing", { rating: 3, rounds: 2 });
    p.cond(dayIn(8, "boxing"), "boxing", { rating: 3, rounds: 2 });
    expect(get(weeklyReport(p.data(), 8, sunday(8)), "conditioning.gassed")?.message)
      .toBe("Gassed 3 → 3 (faded in round 2). Fading may be pacing: round 1 at ~80%, breathe out on punches.");
  });
  it("deload weeks 7 and 10: the variety note", () => {
    expect(get(weeklyReport(new World().data(), 7, sunday(7)), "muscle.variety")).toMatchObject({ status: "info", why: ["P-VARIETY"] });
    expect(get(weeklyReport(new World().data(), 8, sunday(8)), "muscle.variety")).toBeUndefined();
  });
});

describe("inputs through the LocalStore", () => {
  let k = 0;
  async function setup() {
    const local = new LocalStore(`coach-r1-${Date.now()}-${k++}`);
    await local.open();
    const ids = await ensurePlanExercises(local);
    const [program] = await local.save("programs", {
      name: "Strength Return Plan", start_date: "2026-10-12", weeks: 20, status: "active", rules: { key: "strength-return-2026" }, goals: [], notes: null
    });
    return { local, ids, program: program as Program };
  }
  it("savePainCheck, saveElbowMonthly, saveGassed (one boxing row a day), savePhotosDone", async () => {
    const { local, ids } = await setup();
    const p = await savePainCheck(local, { date: "2026-10-20", site: "right_elbow", exerciseId: ids.get("bayesian_curl"), score: 6, sharp: false });
    expect(p).toMatchObject({ pain_score: 6, during_set: "ache" });
    const m = await saveElbowMonthly(local, "2026-10-20", { worst: 3, grip: 2, daily: 1 });
    expect(JSON.parse(m.note!)).toEqual({ kind: "elbow_monthly", worst: 3, grip: 2, daily: 1, total: 6 });
    await saveGassed(local, "2026-10-22", 4, 3);
    await saveGassed(local, "2026-10-22", 3, null);
    expect(local.all("conditioning")).toEqual([expect.objectContaining({ kind: "boxing", rating: 3, rounds: null, done: true })]);
    await savePhotosDone(local, "2026-11-12");
    expect(local.all("body_measurements")).toEqual([expect.objectContaining({ kind: "other", value: 1, note: "photos" })]);
  });
  it("new actions are stored and fold into the plan (skip_deload, cut_sets, recalibrate)", async () => {
    const { local } = await setup();
    expect((await applyCoachAction(local, { kind: "skip_deload", weekNo: 7 }, { signalId: "consistency.missed_week", today: "2026-11-24" })).ok).toBe(true);
    expect((await applyCoachAction(local, { kind: "recalibrate" }, { signalId: "consistency.long_break", today: "2026-12-01" })).ok).toBe(true);
    expect((await applyCoachAction(local, { kind: "cut_sets", exerciseKey: "bayesian_curl", fraction: 1 / 3, until: "2026-12-10" }, { signalId: "joints.cut_sets", today: "2026-11-26" })).ok).toBe(true);
    const rules = local.all("programs")[0]!.rules as { adjustments: { kind: string }[] };
    expect(rules.adjustments.map((a) => a.kind)).toEqual(["skip_deload", "recalibrate", "cut_sets"]);
  });
});
