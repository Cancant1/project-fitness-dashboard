import { PROVISIONAL_NOTE } from "../plan/engine";
import { PLAN } from "../plan/bridge";
import { weeklyReport } from "./report";
import { planLine, stepsTo } from "./strength";
import { dayIn, monday, sunday, World } from "./testkit";
import type { WeeklyReport } from "./types";

const get = (r: WeeklyReport, id: string) => r.signals.find((s) => s.id === id);
const rack = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40];

describe("plan line", () => {
  it("calibration TM → checkpoint 1 (wk 6) → checkpoint 2 (wk 14) → goal TM (wk 19)", () => {
    expect([0, 3, 6, 10, 14, 19].map((w) => planLine(PLAN, "squat", 140, w))).toEqual([140, 142.5, 145, 152.5, 160, 167.5]);
    expect(planLine(PLAN, "deadlift", 200, 6)).toBe(210);
    expect(planLine(PLAN, "deadlift", 200, 19)).toBe(237.5);
  });
});

describe("strength.tm", () => {
  const at = (tm: number) => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    w.tm(dayIn(3, "lower_a"), "squat", tm);
    return get(weeklyReport(w.data(), 3, sunday(3)), "strength.tm.squat");
  };
  it("within 2.5% below the line or above: good", () => {
    expect(at(142.5)).toMatchObject({ status: "good", message: "Squat TM 142.5, plan line 142.5." });
    expect(at(140)).toMatchObject({ status: "good" }); // 1.8% under
  });
  it("2.5–5% below: watch", () => {
    expect(at(137.5)).toMatchObject({ status: "watch", message: "Squat TM 137.5 is 5 kg under the plan line (142.5)." });
  });
  it("more than 5% below: act", () => {
    expect(at(132.5)).toMatchObject({ status: "act", message: "Squat TM 132.5 is 10 kg behind. Check sessions, sleep and bodyweight first." });
  });
  it("while the week runs and its rep-out is still to come, compares with last week's point", () => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    w.tm(dayIn(2, "lower_a"), "squat", 141.4);
    // Wednesday of week 3 before any squat this week: line(2) = 141.67, not line(3) = 142.5.
    expect(weeklyReport(w.data(), 3, dayIn(3, "upper_a")).numbers.trainingMax.squat?.line).toBeCloseTo(141.67, 2);
  });
});

describe("strength.repout", () => {
  const week1 = (reps: number) => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    w.session(dayIn(1, "lower_a"), "lower_a", { reps: (ex, p) => (ex.mainLift === "squat" && p.kind === "rep_out" ? reps : undefined) });
    return get(weeklyReport(w.data(), 1, sunday(1)), "strength.repout.squat");
  };
  it("hit or over: good, with the TM change", () => {
    expect(week1(10)).toMatchObject({ status: "good", message: "Squat 100 × 10 (target 10): TM +1% to 142.5." });
    expect(week1(13)?.message).toBe("Squat 100 × 13 (target 10): TM +4% to 145.");
  });
  it("one under: watch", () => {
    expect(week1(9)).toMatchObject({ status: "watch", message: "Squat 100 × 9 (target 10): TM −2% to 137.5." });
  });
  it("two or more under: act, with the note", () => {
    expect(week1(8)).toMatchObject({ status: "act", message: "Squat 100 × 8 (target 10): TM −5% to 132.5. Note anything off: sleep, food, pain." });
  });
  it("uses the TM row the rep-out wrote when there is one", () => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    const s = w.session(dayIn(1, "lower_a"), "lower_a");
    w.tm(dayIn(1, "lower_a"), "squat", 142.5, "rep_out", { source_set_id: w.repOutSet(s.id, "squat")!.id });
    expect(weeklyReport(w.data(), 1, sunday(1)).numbers.repOuts.find((r) => r.lift === "squat")).toMatchObject({ tmFrom: 140, tmTo: 142.5, reps: 10, target: 10 });
  });
});

describe("strength.calibration", () => {
  it("rep-out over 12 reps in week 0: provisional TM (info)", () => {
    const w = new World();
    const s = w.session(dayIn(0, "lower_a"), "lower_a", { reps: (ex, p) => (ex.mainLift === "squat" && p.kind === "rep_out" ? 15 : undefined) });
    w.tm(dayIn(0, "lower_a"), "squat", 140, "calibration", { note: PROVISIONAL_NOTE, source_set_id: w.repOutSet(s.id, "squat")!.id });
    const r = weeklyReport(w.data(), 0, sunday(0));
    expect(get(r, "strength.calibration.squat")).toMatchObject({
      status: "info", message: "Squat 100 × 15: past 12 reps the formula is rough, so the TM is provisional (140). The next rep-outs correct it."
    });
    expect(r.numbers.trainingMax.squat?.provisional).toBe(true);
  });
  it("12 reps or fewer: just the TM it set", () => {
    const w = new World();
    w.session(dayIn(0, "lower_a"), "lower_a", { reps: (ex, p) => (ex.mainLift === "squat" && p.kind === "rep_out" ? 10 : undefined) });
    expect(get(weeklyReport(w.data(), 0, sunday(0)), "strength.repout.squat")).toMatchObject({ status: "info", message: "Squat 100 × 10: training max 132.5." });
  });
});

describe("strength.misses", () => {
  const missed = (setup?: (w: World) => void, today = sunday(2)) => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    w.session(dayIn(1, "lower_a"), "lower_a", { reps: (ex, p) => (ex.mainLift === "squat" && p.kind === "rep_out" ? 8 : undefined) });
    w.session(dayIn(2, "lower_a"), "lower_a", { reps: (ex, p) => (ex.mainLift === "squat" && p.kind === "rep_out" ? 6 : undefined) });
    w.weighDaily(monday(0), 21, 74.5, 0);
    setup?.(w);
    return get(weeklyReport(w.data(), 2, today), "strength.misses");
  };
  it("two rep-outs ≥ 2 under target, bodyweight and sleep fine → deload now (next week once this one is over)", () => {
    expect(missed()).toMatchObject({
      status: "act", message: "Rep-outs missed by 2+ reps two weeks running. Take the deload now; the plan allows it early.", action: { kind: "deload_now", weekNo: 3 }
    });
  });
  it("early in the week: this week becomes the deload", () => {
    expect(missed(undefined, dayIn(2, "upper_a"))?.action).toEqual({ kind: "deload_now", weekNo: 2 });
  });
  it("bodyweight falling → eat first, +100 kcal from Monday", () => {
    const s = missed((w) => { w.tables.body_measurements = []; w.weighDaily(monday(0), 21, 75, -0.4); });
    expect(s).toMatchObject({
      status: "act", message: "Rep-outs missed by 2+ reps two weeks running and bodyweight is dropping. Eat first: +100 kcal.",
      action: { kind: "kcal", delta: 100, from: "2026-11-02" }
    });
  });
  it("short sleep → fix sleep first (no deload)", () => {
    const s = missed((w) => { for (const d of [0, 1, 2, 3]) w.sleep(`2026-10-${27 + d}`, 5.5); });
    expect(s).toMatchObject({ status: "watch", message: "Rep-outs missed by 2+ reps two weeks running. Sleep 5.5 h: fix sleep first." });
  });
  it("one week only, or hit: nothing", () => {
    const w = new World();
    w.session(dayIn(1, "lower_a"), "lower_a", { reps: (ex, p) => (ex.mainLift === "squat" && p.kind === "rep_out" ? 8 : undefined) });
    w.session(dayIn(2, "lower_a"), "lower_a");
    expect(get(weeklyReport(w.data(), 2, sunday(2)), "strength.misses")).toBeUndefined();
  });
  it("deload next week anyway → info", () => {
    const w = new World();
    w.session(dayIn(5, "lower_b"), "lower_b", { reps: (ex, p) => (ex.mainLift === "deadlift" && p.kind === "rep_out" ? 3 : undefined) });
    w.session(dayIn(6, "lower_b"), "lower_b", { reps: (ex, p) => (ex.mainLift === "deadlift" && p.kind === "rep_out" ? 1 : undefined) });
    expect(get(weeklyReport(w.data(), 6, sunday(6)), "strength.misses")).toMatchObject({ status: "info", message: "Rep-outs missed by 2+ reps two weeks running. The deload is next week anyway." });
  });
});

describe("strength.checkpoint (week 6)", () => {
  const cp = (opts: { squat?: number; bw?: number; weeks?: number[] } = {}) => {
    const w = new World();
    for (const n of opts.weeks ?? [1, 2, 3, 4, 5, 6]) w.week(n);
    w.tm(monday(0), "squat", 140, "calibration");
    w.tm(monday(0), "deadlift", 200, "calibration");
    w.tm(dayIn(6, "lower_a"), "squat", opts.squat ?? 145);
    w.tm(dayIn(6, "lower_b"), "deadlift", 210);
    w.weighDaily(monday(6), 7, opts.bw ?? 74.6, 0);
    return get(weeklyReport(w.data(), 6, sunday(6)), "strength.checkpoint");
  };
  it("met → good, with the fixed arm package (R1-08) from week 8, and the optional rear delt set as a second action", () => {
    const s = cp();
    expect(s).toMatchObject({
      status: "good",
      action: {
        kind: "extra_sets", muscles: ["triceps", "biceps"], fromWeek: 8,
        targets: [
          { dayKey: "upper_a", exerciseKey: "bayesian_curl" }, { dayKey: "upper_a", exerciseKey: "overhead_cable_triceps_extension" },
          { dayKey: "upper_b", exerciseKey: "underhand_cable_curl" }, { dayKey: "upper_b", exerciseKey: "reverse_grip_pushdown" }
        ]
      }
    });
    expect(s?.message.startsWith("Checkpoint 1 met: squat 145/145, deadlift 210/210, bodyweight 74.6/74.5. Extra arm work from week 8 through week 17: +1 set on each curl and triceps exercise on Tue and Sat (+2 biceps and +2 triceps sets a week)")).toBe(true);
    expect(s?.why).toEqual(expect.arrayContaining(["P-EXTRASETS", "P-TIMESAVE"]));
    const w = new World();
    for (const n of [1, 2, 3, 4, 5, 6]) w.week(n);
    w.tm(monday(0), "squat", 140, "calibration");
    w.tm(monday(0), "deadlift", 200, "calibration");
    w.tm(dayIn(6, "lower_a"), "squat", 145);
    w.tm(dayIn(6, "lower_b"), "deadlift", 210);
    w.weighDaily(monday(6), 7, 74.6, 0);
    const rear = get(weeklyReport(w.data(), 6, sunday(6)), "strength.checkpoint.rear_delt");
    expect(rear).toMatchObject({ status: "info", action: { kind: "extra_sets", muscles: ["rear_delts"], fromWeek: 8, targets: [{ dayKey: "upper_a", exerciseKey: "cable_rear_delt_fly" }] } });
  });
  it("behind with bodyweight short → fix food first, +100 kcal", () => {
    expect(cp({ bw: 74.2 })).toMatchObject({
      status: "act", message: "Checkpoint 1 missed. Bodyweight 74.2 vs 74.5: fix food first, +100 kcal.", action: { kind: "kcal", delta: 100, from: "2026-11-30" }
    });
  });
  it("behind on a lift with sessions and bodyweight fine → R1-07 fallbacks for the lifts behind, +1 set on incline and pull-up", () => {
    expect(cp({ squat: 140 })).toMatchObject({
      status: "act",
      message: "Checkpoint 1 missed on squat. Add work: squat: a light Friday squat, 2 × 3 at 75% TM before the split squats; incline and pull-up: one more normal set.",
      action: { kind: "main_lift_set", lifts: ["squat", "incline_db_press", "weighted_pullup"], fromWeek: 7 }
    });
  });
  it("behind with sessions short → sessions first, no action", () => {
    const s = cp({ squat: 140, weeks: [1, 2, 3] });
    expect(s).toMatchObject({ status: "act", message: "Checkpoint 1 missed on squat. 12 of 24 sessions since week 1: get the sessions in first." });
    expect(s?.action).toBeUndefined();
  });
  it("only once the checkpoint week is complete", () => {
    const w = new World();
    w.tm(dayIn(6, "lower_a"), "squat", 145);
    expect(get(weeklyReport(w.data(), 6, dayIn(6, "upper_b")), "strength.checkpoint")).toBeUndefined();
  });
});

describe("strength.checkpoint_ahead", () => {
  const ahead = (rows: number[]) => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    rows.forEach((v, i) => w.tm(dayIn(i + 1, "lower_a"), "squat", v, "rep_out"));
    return get(weeklyReport(w.data(), 4, dayIn(4, "easy_ride")), "strength.checkpoint_ahead.squat");
  };
  it("projection = TM + average change of the last 3 rep-outs × rep-out weeks left", () => {
    // 147.5 + 2.5 × 3 (weeks 4, 5, 6) = 155.
    expect(ahead([142.5, 145, 147.5])).toMatchObject({ status: "good", message: "On course for checkpoint 1: squat ≈155 by 29 Nov (needs 145)." });
    expect(ahead([140, 140, 140])).toMatchObject({ status: "watch", message: "Checkpoint 1 in 2 weeks: squat ≈140, needs 145." });
  });
});

describe("step lifts", () => {
  const incline = (reps: number) => {
    const w = new World();
    w.session(dayIn(1, "upper_a"), "upper_a", { reps: (ex, p) => (ex.mainLift === "incline_db_press" && p.kind === "rep_out" ? reps : undefined) });
    return get(weeklyReport(w.data(), 1, sunday(1)), "strength.step.incline_db_press");
  };
  it("≥ 10 good (next step) · 6–9 info (same) · ≤ 5 watch (step down)", () => {
    expect(incline(10)).toMatchObject({ status: "good", message: "Incline DB 22.5 kg × 10: next 25 kg." });
    expect(incline(7)).toMatchObject({ status: "info", message: "Incline DB 22.5 kg × 7: same load next week." });
    expect(incline(5)).toMatchObject({ status: "watch", message: "Incline DB 22.5 kg × 5: one step down to 20 kg." });
  });
  it("pull-up loads read as added kg", () => {
    const w = new World();
    w.session(dayIn(1, "upper_a"), "upper_a", { reps: (ex, p) => (ex.mainLift === "weighted_pullup" && p.kind === "rep_out" ? 11 : undefined) });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "strength.step.weighted_pullup")?.message).toBe("Pull-up +5 kg × 11: next +7.5 kg.");
  });

  it("steps to the goal: rack steps for incline, 2.5 kg for the pull-up", () => {
    expect(stepsTo("incline_db_press", 25, 37.5, rack)).toBe(5);
    expect(stepsTo("incline_db_press", 37.5, 37.5, rack)).toBe(0);
    expect(stepsTo("weighted_pullup", 5, 20, rack)).toBe(6);
  });

  it("step_pace: steps left vs rep-out weeks left; stuck for 4 weeks", () => {
    const w = new World();
    w.session(dayIn(1, "upper_a"), "upper_a", { reps: (ex, p) => (ex.mainLift === "incline_db_press" && p.kind === "rep_out" ? 10 : undefined) });
    w.tm(dayIn(1, "upper_a"), "incline_db_press", 25);
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "strength.step_pace.incline_db_press"))
      .toMatchObject({ status: "good", message: "5 steps to 37.5 kg, 14 rep-out weeks left." });

    w.session(dayIn(15, "upper_a"), "upper_a", { state: { trainingMaxes: { squat: 140, deadlift: 200 }, currentLoads: { incline_db_press: 25, weighted_pullup: 5 } } });
    w.tm(dayIn(15, "upper_a"), "incline_db_press", 25);
    expect(get(weeklyReport(w.data(), 15, sunday(15)), "strength.step_pace.incline_db_press"))
      .toMatchObject({ status: "watch", message: "5 steps to 37.5 kg with 2 rep-out weeks left: behind pace." });

    const stuck = new World();
    for (const n of [1, 2, 3, 4]) stuck.session(dayIn(n, "upper_a"), "upper_a");
    expect(get(weeklyReport(stuck.data(), 4, sunday(4)), "strength.step_pace.incline_db_press"))
      .toMatchObject({ status: "watch", message: "Incline DB stuck at 22.5 kg for 4 weeks." });
  });
});
