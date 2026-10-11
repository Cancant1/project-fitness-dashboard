import { painPromptCue } from "./joints";
import { weeklyReport } from "./report";
import { dayIn, sunday, World } from "./testkit";
import type { WeeklyReport } from "./types";

const get = (r: WeeklyReport, id: string) => r.signals.find((s) => s.id === id);

describe("joints.swap", () => {
  it("sore next morning → one step down the swap list for 2 weeks", () => {
    const w = new World();
    w.pain(dayIn(1, "upper_a"), "right_elbow", "incline_db_press", { next_morning: "sore" });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "joints.swap.incline_db_press")).toMatchObject({
      status: "act", message: "Right elbow sore after incline DB press. Swap to neutral-grip DB bench press for 2 weeks (until 3 Nov).",
      action: { kind: "swap", exerciseKey: "incline_db_press", to: "db_bench_press", until: "2026-11-03" }
    });
  });
  it("worse at the next session counts too; shoulder pain on cross-body extension → rope pushdown", () => {
    const w = new World();
    w.pain(dayIn(1, "lower_a"), "right_shoulder", "cross_body_triceps_extension", { worse_than_last: true });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "joints.swap.cross_body_triceps_extension")?.message)
      .toBe("Right shoulder worse after cross-body cable triceps extension. Swap to rope pushdown for 2 weeks (until 2 Nov).");
  });
  it("no swap on the list → watch", () => {
    const w = new World();
    w.pain(dayIn(1, "lower_a"), "right_shoulder", "cable_lateral_raise", { next_morning: "sore" });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "joints.swap.cable_lateral_raise")).toMatchObject({ status: "watch" });
  });
  it("not with a swap running, and not after 14 days", () => {
    const w = new World();
    w.pain(dayIn(1, "upper_a"), "right_elbow", "incline_db_press", { next_morning: "sore" });
    w.adjust({ kind: "swap", exerciseKey: "incline_db_press", to: "db_bench_press", until: "2026-11-03" }, "joints.swap.incline_db_press");
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "joints.swap.incline_db_press")).toBeUndefined();
    const old = new World();
    old.pain(dayIn(1, "upper_a"), "right_elbow", "incline_db_press", { next_morning: "sore" });
    expect(get(weeklyReport(old.data(), 3, sunday(3)), "joints.swap.incline_db_press")).toBeUndefined();
  });
});

describe("joints.sharp and joints.trend", () => {
  it("sharp pain this week → watch", () => {
    const w = new World();
    w.pain(dayIn(1, "upper_a"), "right_elbow", "incline_db_press", { during_set: "sharp" });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "joints.sharp.right_elbow")).toMatchObject({
      status: "watch", message: "Sharp pain in right elbow during incline DB press on Tuesday. That exercise stopped for the day — right call."
    });
  });
  it("aches in more sessions than the 3 weeks before → watch; none → good", () => {
    const w = new World();
    w.pain(dayIn(2, "lower_a"), "right_elbow", "cross_body_triceps_extension");
    w.pain(dayIn(2, "upper_a"), "right_elbow", "overhead_cable_triceps_extension");
    expect(get(weeklyReport(w.data(), 2, sunday(2)), "joints.trend.right_elbow")).toMatchObject({
      status: "watch", message: "Right elbow aches are more frequent (2 sessions this week)."
    });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "joints.trend")).toMatchObject({ status: "good", message: "No joint complaints." });
  });
});

describe("joints.prompt (cue)", () => {
  it("morning after an ache: asks Normal / Sore", () => {
    const w = new World();
    w.session(dayIn(1, "upper_a"), "upper_a");
    const p = w.pain(dayIn(1, "upper_a"), "right_elbow", "incline_db_press");
    expect(painPromptCue(w.data(), dayIn(1, "easy_ride"), 8)).toMatchObject({
      id: "joints.prompt", tone: "warm", text: "Right elbow after incline DB press yesterday: how is it this morning?",
      prompt: { kind: "pain_next_morning", painCheckId: p.id, options: ["normal", "sore"] }
    });
    expect(painPromptCue(w.data(), dayIn(1, "easy_ride"), 12)).toBeNull();
    expect(painPromptCue(w.data(), dayIn(1, "boxing"), 8)?.text).toBe("Right elbow after incline DB press on Tuesday: how is it this morning?");
    p.next_morning = "normal";
    expect(painPromptCue(w.data(), dayIn(1, "easy_ride"), 8)).toBeNull();
  });
});
