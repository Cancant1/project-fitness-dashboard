import { addDays } from "../lib/format";
import { bodyweightStatus, creatineOffset, expectedBand, photoStatus, photosCue, rateFit, waistDueCue } from "./body";
import { weeklyReport } from "./report";
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

describe("body.path (E16: shifted up by creatine water)", () => {
  it("creatine water: 0 at week 0, rising linearly to +0.7 kg at week 4, then constant", () => {
    expect(creatineOffset("2026-10-12")).toBe(0);
    expect(creatineOffset("2026-10-26")).toBeCloseTo(0.35, 10);
    expect(creatineOffset("2026-11-09")).toBeCloseTo(0.7, 10);
    expect(creatineOffset("2027-02-01")).toBeCloseTo(0.7, 10);
  });
  it("interpolates the plan's table plus the creatine offset", () => {
    expect(expectedBand("2026-10-12")).toEqual([74, 74]);
    const [lo, hi] = expectedBand("2026-11-08")!;
    expect(lo).toBeCloseTo(74.6 + 0.675, 6);
    expect(hi).toBeCloseTo(75.2 + 0.675, 6);
    const [lo2, hi2] = expectedBand("2027-03-15")!;
    expect(lo2).toBeCloseTo(76.9, 6);
    expect(hi2).toBeCloseTo(79.1, 6);
    expect(expectedBand("2026-10-01")).toBeNull();
  });
  it("inside good · below or above watch (naming the direction)", () => {
    // Sunday 22 Nov: plan 74.8–75.6, + 0.7 creatine = 75.5–76.3.
    const at = (kg: number) => {
      const w = new World();
      w.weighDaily(monday(5), 7, kg, 0);
      return get(weeklyReport(w.data(), 5, sunday(5)), "body.path");
    };
    expect(at(75.9)).toMatchObject({ status: "good", message: "7-day average 75.9 kg, plan range 75.5–76.3." });
    expect(at(75.2)).toMatchObject({ status: "watch", message: "7-day average 75.2 kg, below the plan range 75.5–76.3." });
    expect(at(76.6)).toMatchObject({ status: "watch", message: "7-day average 76.6 kg, above the plan range 75.5–76.3." });
  });
});

describe("bodyweightStatus (Weight page: on track, above, below)", () => {
  // 25 Oct (end of week 1): band 74.65–74.98 → 74.7–75.0; pace target 0.10–0.25 + 0.175 creatine water.
  const at = (start: number, perWeek: number, days = 14, date = addDays(monday(0), 13)) => {
    const w = new World();
    w.weighDaily(addDays(date, -(days - 1)), days, start, perWeek);
    return bodyweightStatus(w.data(), date)!;
  };
  it("path and pace both inside → on track, flagged early in weeks 0–2", () => {
    const s = at(74.3, 0.35);
    expect(s).toMatchObject({ avg: 74.8, path: "on", verdict: "on", early: true });
    expect(s.pace!.rate).toBeCloseTo(0.35, 6);
    expect(s.pace!.lo).toBeCloseTo(0.275, 6);
    expect(s.pace!.hi).toBeCloseTo(0.425, 6);
  });
  it("above the path and gaining fast → above; below and flat → below", () => {
    expect(at(74.3, 0.9)).toMatchObject({ path: "above", pace: { side: "above" }, verdict: "above" });
    expect(at(73.5, 0)).toMatchObject({ path: "below", pace: { side: "below" }, verdict: "below" });
  });
  it("one on, one off → the off side; pulling apart (above but flat) → on track", () => {
    expect(at(74.0, 0.6)).toMatchObject({ path: "on", pace: { side: "above" }, verdict: "above" });
    expect(at(75.5, 0)).toMatchObject({ path: "above", pace: { side: "below" }, verdict: "on" });
  });
  it("too few weigh-ins for a pace → the path alone", () => {
    expect(at(75.5, 0, 4)).toMatchObject({ path: "above", pace: null, verdict: "above" });
  });
  it("from week 3 not early; before the plan nothing", () => {
    expect(at(75.5, 0.2, 14, addDays(monday(3), 3)).early).toBe(false);
    expect(at(74, 0, 14, addDays(monday(0), -1))).toBeNull();
  });
});

describe("body.rate (28-day fit from week 3, ≥ 20 weigh-ins, corrected SE; first check week 5)", () => {
  /** Daily weigh-ins over weeks 3–5 (the fit window of the week-5 check). */
  const rate = (perWeek: number, noise?: (i: number) => number, setup?: (w: World) => void) => {
    const w = new World();
    setup?.(w);
    w.weighDaily(monday(3), 21, 75.2, perWeek, noise);
    return get(weeklyReport(w.data(), 5, sunday(5)), "body.rate");
  };

  it("in band (0.10–0.25 kg/week): good", () => {
    expect(rate(0.18)).toMatchObject({ status: "good", message: "Gaining 0.18 kg/week: right in the lean-bulk range." });
  });
  it("clearly too slow (past the edge by more than 1 SE): +100 kcal of carbs from Monday", () => {
    expect(rate(0)).toMatchObject({
      status: "act", message: "Gaining 0.00 kg/week (target 0.10–0.25). Add 100 kcal of carbs from Monday.",
      action: { kind: "kcal", delta: 100, from: "2026-11-23" }
    });
    expect(rate(-0.2)?.message).toBe("Losing 0.20 kg/week (target 0.10–0.25). Add 100 kcal of carbs from Monday.");
  });
  it("clearly too fast: −100 kcal", () => {
    expect(rate(0.4)).toMatchObject({ status: "act", message: "Gaining 0.40 kg/week (target 0.10–0.25). Remove 100 kcal.", action: { kind: "kcal", delta: -100 } });
  });
  it("past the edge but within 1 SE (noisy scale): watch and re-check", () => {
    const fit = (perWeek: number) => {
      const w = new World();
      w.weighDaily(monday(3), 21, 75.2, perWeek, zigzag);
      return rateFit(w.data(), sunday(5));
    };
    const slow = fit(0.05);
    expect("rate" in slow && slow.se! > 0.1 - slow.rate).toBe(true);
    expect(rate(0.05, zigzag)).toMatchObject({ status: "watch", message: "Gaining 0.05 kg/week, close to the edge. Same calories; re-check in 2 weeks." });
    expect(rate(0.33, zigzag)?.status).toBe("watch");
    // The same slopes without noise are clear.
    expect(rate(0.05)?.status).toBe("act");
    expect(rate(0.33)?.status).toBe("act");
  });
  it("carry-over between days widens the SE: the corrected SE ≥ the plain one, r clipped to 0–0.6", () => {
    const w = new World();
    // Slow waves (4 days up, 4 down): neighbouring residuals share a sign.
    w.weighDaily(monday(3), 21, 75.2, 0.18, (i) => (Math.floor(i / 4) % 2 ? -0.3 : 0.3));
    const f = rateFit(w.data(), sunday(5));
    expect("rate" in f).toBe(true);
    if (!("rate" in f)) return;
    expect(f.r).toBeGreaterThan(0);
    expect(f.r).toBeLessThanOrEqual(0.6);
    expect(f.se!).toBeCloseTo(f.seRaw! * Math.sqrt((1 + f.r) / (1 - f.r)), 10);
    expect(f.se!).toBeGreaterThan(f.seRaw!);
  });
  it("weeks 0–2 (glycogen, water, creatine loading) are left out of the fit", () => {
    const s = rate(0.18, undefined, (w) => w.weighDaily(monday(0), 21, 73.5, 0));
    expect(s).toMatchObject({ status: "good" });
  });
  it("drops a reading more than 1.5 kg off the first-pass fit", () => {
    const s = rate(0.18, undefined, (w) => w.weigh(dayIn(4, "boxing"), 79));
    expect(s).toMatchObject({ status: "good", message: "Gaining 0.18 kg/week: right in the lean-bulk range." });
    const w = new World();
    w.weighDaily(monday(3), 21, 75.2, 0.18);
    w.weigh(dayIn(4, "boxing"), 79);
    const f = rateFit(w.data(), sunday(5));
    expect("rate" in f && f.dropped).toBe(1);
  });
  it("needs ≥ 20 weigh-ins over ≥ 21 days", () => {
    const w = new World();
    for (let i = 0; i < 21; i += 3) w.weigh(addDays(monday(3), i), 74.5);
    const s = get(weeklyReport(w.data(), 5, sunday(5)), "body.rate");
    expect(s).toMatchObject({ status: "watch", message: "Only 7 weigh-ins over 19 days: the rate check needs 20 over 3 weeks." });
  });
  it("England (20 Dec – 3 Jan) is left out; a check that needs that window says skipped (holiday)", () => {
    const w = new World();
    w.weighDaily(monday(5), 77, 75.6, 0.15);
    for (const n of [11, 13]) {
      expect(get(weeklyReport(w.data(), n, sunday(n)), "body.rate")).toMatchObject({ status: "info", title: "Rate check skipped (holiday)" });
      expect(weeklyReport(w.data(), n, sunday(n)).numbers.bodyweight.rateSkipped).toBe("holiday");
    }
    for (const n of [9, 15]) expect(get(weeklyReport(w.data(), n, sunday(n)), "body.rate")?.status).toBe("good");
  });
  it("off weeks: info with the next check · rate week still running: pending", () => {
    const w = new World();
    expect(get(weeklyReport(w.data(), 4, sunday(4)), "body.rate")).toMatchObject({ status: "info", message: "Next rate check: Sunday 22 Nov." });
    expect(get(weeklyReport(w.data(), 1, sunday(1)), "body.rate")?.message).toBe("Next rate check: Sunday 22 Nov.");
    expect(get(weeklyReport(w.data(), 3, sunday(3)), "body.rate")?.status).toBe("info"); // week 3 is no longer a rate week
    expect(get(weeklyReport(w.data(), 5, dayIn(5, "boxing")), "body.rate")).toMatchObject({ status: "pending", message: "Rate check on Sunday 22 Nov." });
  });
  it("applied: the act turns into info", () => {
    const s = rate(0, undefined, (w) => w.adjust({ kind: "kcal", delta: 100, from: "2026-11-23" }, "body.rate", "2026-11-22T20:00:00Z"));
    expect(s).toMatchObject({ status: "info", message: "Gaining 0.00 kg/week (target 0.10–0.25). Add 100 kcal of carbs from Monday. Applied 22 Nov." });
  });
});

describe("body.waist (optional; slope of ≥ 3 readings)", () => {
  const waist = (cms: number[], setup?: (w: World) => void) => {
    const w = new World();
    w.tm(monday(0), "squat", 140, "calibration");
    setup?.(w);
    ["2026-10-12", "2026-10-26", "2026-11-09"].slice(0, cms.length).forEach((d, i) => w.waist(d, cms[i]!));
    return { w, s: get(weeklyReport(w.data(), 4, sunday(4)), "body.waist") };
  };
  it("rising > 1 cm/month while the TMs stall → remove 100 kcal", () => {
    expect(waist([80, 81, 82]).s).toMatchObject({
      status: "act", message: "Waist +2.1 cm/month while lifts stall. Remove 100 kcal.", action: { kind: "kcal", delta: -100, from: "2026-11-16" }
    });
  });
  it("two readings are not a trend", () => {
    expect(waist([80, 82]).s).toBeUndefined();
  });
  it("rising while a TM climbs → info", () => {
    expect(waist([80, 81, 82], (w) => w.tm("2026-11-02", "squat", 145)).s).toMatchObject({ status: "info" });
  });
  it("steady → good", () => {
    expect(waist([80, 80.2, 80.4]).s).toMatchObject({ status: "good", message: "Waist +0.4 cm/month." });
  });
  it("due cue only while he logs it: a waist in the last 30 days, none in the last 14", () => {
    const { w } = waist([80, 81, 82]);
    expect(waistDueCue(w.data(), "2026-11-20")).toBeNull();
    expect(waistDueCue(w.data(), "2026-11-24")).toMatchObject({ id: "body.waist", text: "Waist check due: tape at the navel, morning." });
    expect(waistDueCue(w.data(), "2026-12-10")).toBeNull(); // nothing in 30 days: no nagging
    expect(waistDueCue(new World().data(), "2026-11-24")).toBeNull();
  });
});

describe("body.photos (E20, M-MEASURE)", () => {
  it("photo weeks 0, 4, 8, 12, 16, 19: a Thursday cue until a photos row exists that week", () => {
    const w = new World();
    expect(photosCue(w.data(), dayIn(4, "easy_ride"))).toBeNull(); // before Thursday
    expect(photosCue(w.data(), dayIn(4, "boxing"))).toMatchObject({ id: "body.photos", input: "photos", text: "Progress photos: front, side, back, same spot and light." });
    expect(photosCue(w.data(), dayIn(5, "boxing"))).toBeNull(); // not a photo week
    expect(photoStatus(w.data(), dayIn(5, "lower_a"))).toEqual({ photoWeek: false, done: false, next: dayIn(8, "boxing") });
    w.tables.body_measurements.push({ id: "ph", user_id: "u1", created_at: "x", updated_at: "x", date: dayIn(4, "boxing"), kind: "other", value: 1, unit: "cm", note: "photos", source: "app" });
    expect(photosCue(w.data(), dayIn(4, "lower_b"))).toBeNull();
    expect(get(weeklyReport(w.data(), 4, sunday(4)), "body.photos")).toMatchObject({ status: "good" });
    expect(get(weeklyReport(new World().data(), 4, sunday(4)), "body.photos")).toMatchObject({ status: "watch" });
    expect(get(weeklyReport(new World().data(), 5, sunday(5)), "body.photos")).toMatchObject({ status: "info", message: "Next progress photos: Thursday 10 Dec." });
  });
});
