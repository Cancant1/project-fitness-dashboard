import { addDays } from "../lib/format";
import { floorCue } from "./consistency";
import { weeklyReport } from "./report";
import { dayIn, monday, sunday, World } from "./testkit";
import type { LiftingDayKey } from "../plan/types";
import type { WeeklyReport } from "./types";

const ALL: LiftingDayKey[] = ["lower_a", "upper_a", "lower_b", "upper_b"];
const get = (r: WeeklyReport, id: string) => r.signals.find((s) => s.id === id);

describe("consistency.sessions", () => {
  it("complete week: 4 of 4 good, 3 watch, 2 = the floor (watch), ≤ 1 act", () => {
    const cases: [number, string, string][] = [
      [4, "good", "4 of 4 sessions."],
      [3, "watch", "3 of 4 sessions. One missed day is fine; two in a row is a trend."],
      [2, "watch", "2 of 4 sessions: the floor held. Aim for 4 next week."],
      [1, "act", "1 of 4 sessions. Bad week? The floor is Lower A + Upper A; minimum sessions count."],
      [0, "act", "0 of 4 sessions. Bad week? The floor is Lower A + Upper A; minimum sessions count."]
    ];
    for (const [n, status, message] of cases) {
      const w = new World();
      w.week(1, {}, ALL.slice(0, n));
      expect(get(weeklyReport(w.data(), 1, sunday(1)), "consistency.sessions")).toMatchObject({ status, message });
    }
  });

  it("pending while the week runs, unless already complete", () => {
    const w = new World();
    w.week(1, {}, ["lower_a", "upper_a"]);
    expect(get(weeklyReport(w.data(), 1, dayIn(1, "boxing")), "consistency.sessions")).toMatchObject({ status: "pending", message: "2 of 4 so far." });
  });

  it("a short deload week is only a watch (week 10 allows rest)", () => {
    const w = new World();
    w.week(7, {}, ["lower_a", "upper_a"]);
    expect(get(weeklyReport(w.data(), 7, sunday(7)), "consistency.sessions")?.status).toBe("watch");
  });

  it("the test week plans 3 lifting days", () => {
    const w = new World();
    w.week(19);
    expect(get(weeklyReport(w.data(), 19, sunday(19)), "consistency.sessions")).toMatchObject({ status: "good", message: "3 of 3 sessions." });
  });
});

describe("consistency.missed_week", () => {
  it("a finished week with no plan session → move on (R1-01): no repeat, no action", () => {
    const w = new World();
    w.week(1);
    const s = get(weeklyReport(w.data(), 3, dayIn(3, "upper_a")), "consistency.missed_week");
    expect(s).toMatchObject({
      status: "watch",
      message: "Week 2 was missed. No catch-up: carry on with week 3 as planned. Missed weeks count as an unplanned deload."
    });
    expect(s?.action).toBeUndefined();
  });

  it("is handled once the repeat is applied (the week is marked missed)", () => {
    const w = new World();
    w.week(1);
    w.adjust({ kind: "repeat_week", missedWeekNo: 2 }, "consistency.missed_week", "2026-11-03T08:00:00Z");
    const data = w.data();
    expect(data.plan.weeks).toHaveLength(21);
    expect(get(weeklyReport(data, 3, dayIn(3, "upper_a")), "consistency.missed_week")).toBeUndefined();
  });

  it("not for a deload week", () => {
    const w = new World();
    w.week(6);
    expect(get(weeklyReport(w.data(), 8, dayIn(8, "upper_a")), "consistency.missed_week")).toBeUndefined();
  });
});

describe("consistency.long_break", () => {
  it("≥ 14 days since the last plan session → lower both TMs 5%", () => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    w.session(dayIn(1, "lower_a"), "lower_a");
    const at15 = addDays(dayIn(1, "lower_a"), 15);
    expect(get(weeklyReport(w.data(), 3, at15), "consistency.long_break")).toMatchObject({
      status: "act", message: "15 days off. Lower both training maxes by 5% before the next session.", action: { kind: "tm_reduce", percent: 5 }
    });
    expect(get(weeklyReport(w.data(), 2, addDays(dayIn(1, "lower_a"), 13)), "consistency.long_break")).toBeUndefined();
  });

  it("applied: the signal turns to info until he trains again", () => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    w.session(dayIn(1, "lower_a"), "lower_a");
    w.adjust({ kind: "tm_reduce", percent: 5 }, "consistency.long_break", "2026-11-03T07:00:00Z");
    const s = get(weeklyReport(w.data(), 3, "2026-11-03"), "consistency.long_break");
    expect(s).toMatchObject({ status: "info", applied: { created: "2026-11-03T07:00:00Z" } });
    expect(s?.action).toBeUndefined();
    expect(s?.message).toMatch(/Applied 3 Nov\.$/);
  });
});

describe("consistency.streak", () => {
  it("complete weeks in a row with 3+ sessions", () => {
    const w = new World();
    for (const n of [1, 2, 3]) w.week(n, {}, ["lower_a", "upper_a", "lower_b"]);
    expect(get(weeklyReport(w.data(), 3, sunday(3)), "consistency.streak")).toMatchObject({
      status: "info", message: "3 weeks in a row with 3+ sessions. Your longest since 2023 was 14."
    });
    expect(get(weeklyReport(w.data(), 3, dayIn(3, "boxing")), "consistency.streak")?.message).toMatch(/^2 weeks in a row/);
  });
});

describe("consistency.floor (cue)", () => {
  it("from Friday with no lifting session this week (Thursday has the if-then cue)", () => {
    const w = new World();
    expect(floorCue(w.data(), dayIn(1, "lower_b"))).toMatchObject({
      tone: "warm", text: "No lifting yet this week. Do Lower A today or tomorrow, then Upper A. That's the floor."
    });
    expect(floorCue(w.data(), dayIn(1, "boxing"))).toBeNull();
    expect(floorCue(w.data(), dayIn(7, "lower_b"))).toBeNull(); // deload
    w.session(dayIn(1, "lower_a"), "lower_a");
    expect(floorCue(w.data(), dayIn(1, "lower_b"))).toBeNull();
  });
});
