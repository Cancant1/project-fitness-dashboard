import { addDays } from "../lib/format";
import { proteinCue } from "./fuel";
import { weeklyReport } from "./report";
import { dayIn, monday, sunday, World } from "./testkit";
import type { WeeklyReport } from "./types";

const get = (r: WeeklyReport, id: string) => r.signals.find((s) => s.id === id);

/** Week 1 with food on the first `days` days, 75 kg all week. */
function week1(days: number, kcal = 2800, protein = 150, today = sunday(1)) {
  const w = new World();
  w.weighDaily(monday(1), 7, 75, 0);
  for (let i = 0; i < days; i++) w.food(addDays(monday(1), i), kcal, protein);
  return weeklyReport(w.data(), 1, today);
}

describe("fuel.logging", () => {
  it("≥ 6 good · 4–5 watch · ≤ 3 act · pending while the week runs", () => {
    expect(get(week1(6), "fuel.logging")).toMatchObject({ status: "good", message: "Food logged on 6 days." });
    expect(get(week1(4), "fuel.logging")).toMatchObject({ status: "watch", message: "Food logged on 4 days. The calorie checks need most days." });
    expect(get(week1(3), "fuel.logging")).toMatchObject({ status: "act", message: "Food logged on 3 days: can't judge the bulk." });
    expect(get(week1(2, 2800, 150, dayIn(1, "upper_a")), "fuel.logging")).toMatchObject({ status: "pending", message: "Food logged on 2 days so far." });
  });
});

describe("fuel.kcal (average of finished logged days vs target; plan default 2,800)", () => {
  it("within ±150 good · > 150 under act · > 150 over watch", () => {
    expect(get(week1(7, 2800), "fuel.kcal")).toMatchObject({ status: "good", message: "Average 2,800 kcal, target 2,800." });
    expect(get(week1(7, 2700), "fuel.kcal")?.status).toBe("good");
    expect(get(week1(7, 2500), "fuel.kcal")).toMatchObject({ status: "act", message: "Average 2,500 kcal: 300 under target. The surplus is the point of the block." });
    expect(get(week1(7, 3000), "fuel.kcal")).toMatchObject({ status: "watch", message: "Average 3,000 kcal: 200 over the target of 2,800." });
  });
  it("follows a nutrition_targets row", () => {
    const w = new World();
    w.target({ kcal: 2900 });
    for (let i = 0; i < 7; i++) w.food(addDays(monday(1), i), 2800, 160);
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "fuel.kcal")?.message).toBe("Average 2,800 kcal, target 2,900.");
  });
});

describe("fuel.protein (2.0 g/kg target, 1.6 g/kg floor)", () => {
  it("≥ target − 10 good · above the floor watch · under the floor act", () => {
    expect(get(week1(7, 2800, 145), "fuel.protein")).toMatchObject({ status: "good", message: "145 g/day = 1.9 g/kg." });
    expect(get(week1(7, 2800, 130), "fuel.protein")).toMatchObject({ status: "watch", message: "130 g/day = 1.7 g/kg, target 150 g." });
    expect(get(week1(7, 2800, 110), "fuel.protein")).toMatchObject({
      status: "act", message: "110 g/day is 1.5 g/kg, under the 1.6 g/kg that matters. Add the post-session shake or 500 g kwark."
    });
  });
});

describe("fuel.tdee: maintenance (as logged), ≥ 24 of 28 days, 6,000 kcal/kg, weeks 0–4 left out", () => {
  /** Weeks 5–8 (16 Nov – 13 Dec): the first window that lies after week 4. */
  const tdee = (perWeek: number, logged = 28, week = 8) => {
    const w = new World();
    for (let i = 0; i < logged; i++) w.food(addDays(monday(5), i), 2800, 150);
    w.weighDaily(monday(5), 28, 75.5, perWeek);
    // Today (Sunday) is still being logged: judge on Monday.
    return get(weeklyReport(w.data(), week, addDays(sunday(week), 1)), "fuel.tdee");
  };
  it("maintenance (as logged) and the surplus over it", () => {
    // 2,800 − 0.25 kg/wk × 6,000 / 7 ≈ 2,586 (the synthetic weigh-ins are rounded to grams).
    const s = tdee(0.25);
    expect(s).toMatchObject({ status: "info", title: "Maintenance (as logged)" });
    expect(s?.message).toMatch(/^Your maintenance \(as logged\): ≈2,5[89]0 kcal \(plan assumed 2,600\)\. Target 2,800 = \+8% over it\.$/);
  });
  it("target under maintenance + 3% → watch", () => {
    expect(tdee(0)).toMatchObject({ status: "watch", message: "Target is only 0% over your maintenance (as logged)." });
  });
  it("needs 24 of the 28 days logged, and a window after week 4 (creatine)", () => {
    expect(tdee(0.25, 24)).toBeDefined();
    expect(tdee(0.25, 23)).toBeUndefined();
    expect(tdee(0.25, 28, 7)).toBeUndefined(); // the 28 days to 6 Dec start in week 4
  });
});

describe("fuel.today (cue)", () => {
  it("after 18:00, protein more than 40 g short", () => {
    const w = new World();
    w.weighDaily(monday(1), 3, 75, 0);
    w.food(dayIn(1, "easy_ride"), 1800, 100);
    expect(proteinCue(w.data(), dayIn(1, "easy_ride"), 19)).toMatchObject({ text: "50 g protein to go. Shake or kwark." });
    expect(proteinCue(w.data(), dayIn(1, "easy_ride"), 17)).toBeNull();
    w.food(dayIn(1, "easy_ride"), 100, 15);
    expect(proteinCue(w.data(), dayIn(1, "easy_ride"), 19)).toBeNull();
  });
});
