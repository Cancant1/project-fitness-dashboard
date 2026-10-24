import { weeklyReport } from "./report";
import { dayIn, sunday, World } from "./testkit";
import type { WeeklyReport } from "./types";

const get = (r: WeeklyReport, id: string) => r.signals.find((s) => s.id === id);

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

describe("conditioning.week (24 Oct 2026: boxing + free-day notes)", () => {
  it("boxing done, with the free-day notes and their minutes", () => {
    const w = new World();
    w.cond(dayIn(1, "easy_ride"), "other", { note: "Ride to work and back", minutes: 40 });
    w.cond(dayIn(1, "boxing"), "boxing", { minutes: 45 });
    w.cond(dayIn(1, "easy_ride"), "other", { note: "wrist_ladder" }); // a home-task tick is not a note
    const r = weeklyReport(w.data(), 1, sunday(1));
    expect(get(r, "conditioning.week")).toMatchObject({ status: "good", title: "Boxing done", message: "Boxing ✓ · 1 free-day note (40 min)." });
    expect(r.numbers.conditioning).toMatchObject({ boxing: true, freeNotes: 1, freeMin: 40 });
  });
  it("no boxing → info; pending while the week runs", () => {
    const w = new World();
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "conditioning.week")).toMatchObject({
      status: "info", title: "No boxing this week", message: "Boxing – · 0 free-day notes."
    });
    expect(get(weeklyReport(w.data(), 1, dayIn(1, "lower_b")), "conditioning.week")?.status).toBe("pending");
  });
});

