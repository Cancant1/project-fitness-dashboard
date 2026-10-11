import { addDays } from "../lib/format";
import { weeklyReport } from "./report";
import { dayIn, monday, sunday, World } from "./testkit";
import type { WeeklyReport } from "./types";

const get = (r: WeeklyReport, id: string) => r.signals.find((s) => s.id === id);

describe("recovery.sleep (≥ 4 nights logged)", () => {
  const sleep = (hours: number, nights = 4) => {
    const w = new World();
    for (let i = 0; i < nights; i++) w.sleep(addDays(monday(1), i), hours);
    return get(weeklyReport(w.data(), 1, sunday(1)), "recovery.sleep");
  };
  it("≥ 7 h good · 6–7 h watch · < 6 h act", () => {
    expect(sleep(7.5)).toMatchObject({ status: "good", message: "Sleep 7.5 h a night." });
    expect(sleep(6.5)).toMatchObject({ status: "watch", message: "Sleep 6.5 h. Under 7 h costs recovery; aim 7–9." });
    expect(sleep(5.5)).toMatchObject({ status: "act", message: "Sleep 5.5 h. That will show in rep-outs before anything else." });
    expect(sleep(5.5, 3)).toBeUndefined();
  });
});

describe("recovery.energy", () => {
  it("a drop of ≥ 1 point against the 3 weeks before (≥ 3 rated sessions) → watch", () => {
    const w = new World();
    for (const n of [1, 2, 3]) w.week(n, { energy: 4 }, ["lower_a", "upper_a", "lower_b"]);
    w.week(4, { energy: 3 }, ["lower_a", "upper_a", "lower_b"]);
    expect(get(weeklyReport(w.data(), 4, sunday(4)), "recovery.energy")).toMatchObject({
      status: "watch", message: "Sessions feel harder (energy 3 vs 4). Check sleep and food."
    });
    const fine = new World();
    for (const n of [1, 2, 3, 4]) fine.week(n, { energy: 4 }, ["lower_a", "upper_a", "lower_b"]);
    expect(get(weeklyReport(fine.data(), 4, sunday(4)), "recovery.energy")).toBeUndefined();
  });
});

describe("conditioning.week", () => {
  it("all done good, with next week's rounds from roundsNextWeek", () => {
    const w = new World();
    w.cond(dayIn(1, "easy_ride"), "ride", { minutes: 30 });
    w.cond(dayIn(1, "boxing"), "boxing", { minutes: 45 });
    w.cond(dayIn(1, "rounds"), "rounds", { rounds: 6, first_round_count: 50, last_round_count: 46 });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "conditioning.week")).toMatchObject({
      status: "good", message: "Ride 30/30 min · boxing ✓ · rounds 6 (next week 7)."
    });
  });
  it("one missing → info; pending while the week runs", () => {
    const w = new World();
    w.cond(dayIn(1, "easy_ride"), "ride", { minutes: 30 });
    w.cond(dayIn(1, "rounds"), "rounds", { rounds: 6, first_round_count: 50, last_round_count: 40 });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "conditioning.week")).toMatchObject({
      status: "info", message: "Ride 30/30 min · boxing – · rounds 6 (next week 6)."
    });
    expect(get(weeklyReport(w.data(), 1, dayIn(1, "lower_b")), "conditioning.week")?.status).toBe("pending");
  });
});
