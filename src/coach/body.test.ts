import { addDays } from "../lib/format";
import { expectedBand, rateFit } from "./body";
import { dailyCues, weeklyReport } from "./report";
import { dayIn, monday, sunday, World } from "./testkit";
import type { WeeklyReport } from "./types";

const get = (r: WeeklyReport, id: string) => r.signals.find((s) => s.id === id);
/** Deterministic scale noise: ±0.6 kg on alternate days. */
const zigzag = (i: number) => (i % 2 ? -0.6 : 0.6);

describe("body.weighins", () => {
  const at = (n: number, today = sunday(1)) => {
    const w = new World();
    for (let i = 0; i < n; i++) w.weigh(dayIn(1, (["lower_a", "upper_a", "easy_ride", "boxing", "lower_b", "upper_b", "rounds"] as const)[i]!), 74.5);
    return get(weeklyReport(w.data(), 1, today), "body.weighins");
  };
  it("≥ 5 good · 3–4 watch · ≤ 2 act · pending while the week runs", () => {
    expect(at(5)).toMatchObject({ status: "good" });
    expect(at(4)).toMatchObject({ status: "watch", message: "Only 4 weigh-ins. The average needs most mornings." });
    expect(at(3)?.status).toBe("watch");
    expect(at(2)).toMatchObject({ status: "act", message: "2 weigh-ins: not enough to judge the bulk." });
    expect(at(2, dayIn(1, "easy_ride"))).toMatchObject({ status: "pending", message: "2 weigh-ins so far." });
  });
});

describe("body.path", () => {
  it("interpolates the plan's table", () => {
    expect(expectedBand("2026-10-12")).toEqual([74, 74]);
    const [lo, hi] = expectedBand("2026-11-08")!;
    expect(lo).toBeCloseTo(74.6, 6);
    expect(hi).toBeCloseTo(75.2, 6);
    expect(expectedBand("2027-03-15")).toEqual([76.2, 78.4]);
    expect(expectedBand("2026-10-01")).toBeNull();
  });
  it("inside good · below or above watch (naming the direction)", () => {
    const at = (kg: number) => {
      const w = new World();
      w.weighDaily(monday(3), 7, kg, 0);
      return get(weeklyReport(w.data(), 3, sunday(3)), "body.path");
    };
    expect(at(74.8)).toMatchObject({ status: "good", message: "7-day average 74.8 kg, plan range 74.6–75.2." });
    expect(at(74.3)).toMatchObject({ status: "watch", message: "7-day average 74.3 kg, below the plan range 74.6–75.2." });
    expect(at(75.6)).toMatchObject({ status: "watch", message: "7-day average 75.6 kg, above the plan range 74.6–75.2." });
  });
});

describe("body.rate (least squares ± SE, every 2 weeks from week 3)", () => {
  const rate = (perWeek: number, noise?: (i: number) => number, setup?: (w: World) => void) => {
    const w = new World();
    setup?.(w);
    w.weighDaily(monday(1), 21, 74.5, perWeek, noise);
    return get(weeklyReport(w.data(), 3, sunday(3)), "body.rate");
  };

  it("in band (0.10–0.25 kg/week): good", () => {
    expect(rate(0.18)).toMatchObject({ status: "good", message: "Gaining 0.18 kg/week: right in the lean-bulk range." });
  });
  it("clearly too slow (past the edge by more than 1 SE): +100 kcal of carbs from Monday", () => {
    expect(rate(0)).toMatchObject({
      status: "act", message: "Gaining 0.00 kg/week (target 0.10–0.25). Add 100 kcal of carbs from Monday.",
      action: { kind: "kcal", delta: 100, from: "2026-11-09" }
    });
    expect(rate(-0.2)?.message).toBe("Losing 0.20 kg/week (target 0.10–0.25). Add 100 kcal of carbs from Monday.");
  });
  it("clearly too fast: −100 kcal", () => {
    expect(rate(0.4)).toMatchObject({ status: "act", message: "Gaining 0.40 kg/week (target 0.10–0.25). Remove 100 kcal.", action: { kind: "kcal", delta: -100 } });
  });
  it("past the edge but within 1 SE (noisy scale): watch and re-check", () => {
    const fit = (perWeek: number) => {
      const w = new World();
      w.weighDaily(monday(1), 21, 74.5, perWeek, zigzag);
      return rateFit(w.data(), sunday(3));
    };
    const slow = fit(0.05);
    expect("rate" in slow && slow.se! > 0.1 - slow.rate).toBe(true);
    expect(rate(0.05, zigzag)).toMatchObject({ status: "watch", message: "Gaining 0.05 kg/week, close to the edge. Same calories; re-check in 2 weeks." });
    expect(rate(0.33, zigzag)?.status).toBe("watch");
    // The same slopes without noise are clear.
    expect(rate(0.05)?.status).toBe("act");
    expect(rate(0.33)?.status).toBe("act");
  });
  it("week-0 weigh-ins (glycogen and water) are left out of the fit", () => {
    const s = rate(0.18, undefined, (w) => w.weighDaily(monday(0), 7, 73.5, 0));
    expect(s).toMatchObject({ status: "good" });
  });
  it("needs ≥ 10 weigh-ins over ≥ 21 days", () => {
    const w = new World();
    for (let i = 0; i < 21; i += 3) w.weigh(addDays(monday(1), i), 74.5);
    const s = get(weeklyReport(w.data(), 3, sunday(3)), "body.rate");
    expect(s).toMatchObject({ status: "watch", message: "Only 7 weigh-ins over 19 days: the rate check needs 10 over 3 weeks." });
  });
  it("off weeks: info with the next check · rate week still running: pending", () => {
    const w = new World();
    expect(get(weeklyReport(w.data(), 4, sunday(4)), "body.rate")).toMatchObject({ status: "info", message: "Next rate check: Sunday 22 Nov." });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "body.rate")?.message).toBe("Next rate check: Sunday 8 Nov.");
    expect(get(weeklyReport(w.data(), 3, dayIn(3, "boxing")), "body.rate")).toMatchObject({ status: "pending", message: "Rate check on Sunday 8 Nov." });
  });
  it("applied: the act turns into info", () => {
    const s = rate(0, undefined, (w) => w.adjust({ kind: "kcal", delta: 100, from: "2026-11-09" }, "body.rate", "2026-11-08T20:00:00Z"));
    expect(s).toMatchObject({ status: "info", message: "Gaining 0.00 kg/week (target 0.10–0.25). Add 100 kcal of carbs from Monday. Applied 8 Nov." });
  });
});

describe("body.waist", () => {
  const waist = (cms: number[], setup?: (w: World) => void) => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    setup?.(w);
    ["2026-10-12", "2026-10-26", "2026-11-09"].forEach((d, i) => w.waist(d, cms[i]!));
    return { w, s: get(weeklyReport(w.data(), 4, sunday(4)), "body.waist") };
  };
  it("rising > 1 cm/month while the TMs stall → remove 100 kcal", () => {
    expect(waist([80, 81, 82]).s).toMatchObject({
      status: "act", message: "Waist +2.1 cm/month while lifts stall. Remove 100 kcal.", action: { kind: "kcal", delta: -100, from: "2026-11-16" }
    });
  });
  it("rising while a TM climbs → info", () => {
    expect(waist([80, 81, 82], (w) => w.tm("2026-11-02", "squat", 145)).s).toMatchObject({ status: "info" });
  });
  it("steady → good", () => {
    expect(waist([80, 80.2, 80.4]).s).toMatchObject({ status: "good", message: "Waist +0.4 cm/month." });
  });
  it("due cue when none in 14 days", () => {
    const { w } = waist([80, 81, 82]);
    expect(dailyCues(w.data(), "2026-11-20", 20).map((c) => c.id)).not.toContain("body.waist");
    expect(dailyCues(w.data(), "2026-11-24", 20).find((c) => c.id === "body.waist")).toMatchObject({ text: "Waist check due: tape at the navel, morning." });
  });
});
