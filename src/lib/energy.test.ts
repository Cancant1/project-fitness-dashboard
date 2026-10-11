import { adaptiveTdee, slopeWithSe, slopeWithoutOutliers } from "./energy";
import { addDays } from "./format";

const days = (from: string, n: number, kcal: number) => Array.from({ length: n }, (_, i) => ({ date: addDays(from, i), kcal }));

describe("adaptiveTdee", () => {
  it("equals intake when weight is flat", () => {
    const intake = days("2026-09-01", 28, 2600);
    const weights = days("2026-09-01", 28, 0).map((d) => ({ date: d.date, kg: 74 }));
    const r = adaptiveTdee(intake, weights, "2026-09-28", 28)!;
    expect(Math.round(r.tdee)).toBe(2600);
  });

  it("subtracts the energy stored as weight gain", () => {
    const intake = days("2026-09-01", 28, 2800);
    // +1 kg linear over 4 weeks.
    const weights = days("2026-09-01", 28, 0).map((d, i) => ({ date: d.date, kg: 74 + i / 27 }));
    const r = adaptiveTdee(intake, weights, "2026-09-28", 28)!;
    // Slope 1/27 kg a day → 7700/27 ≈ 285 kcal/day stored.
    expect(Math.round(r.tdee)).toBe(2800 - Math.round(7700 / 27));
  });

  it("copes with sparse weigh-ins", () => {
    const intake = days("2026-07-01", 56, 2500);
    const weights = [{ date: "2026-07-02", kg: 75.6 }, { date: "2026-07-13", kg: 75.5 }, { date: "2026-07-16", kg: 74.7 }, { date: "2026-08-25", kg: 73.4 }];
    const r = adaptiveTdee(intake, weights, "2026-08-25", 56)!;
    expect(r.weighIns).toBe(4);
    expect(r.tdee).toBeGreaterThan(2500);
  });

  it("needs at least half the days logged", () => {
    const intake = days("2026-09-01", 10, 2600);
    const weights = days("2026-09-01", 28, 0).map((d) => ({ date: d.date, kg: 74 }));
    expect(adaptiveTdee(intake, weights, "2026-09-28", 28)).toBeNull();
  });
});

describe("slopeWithSe", () => {
  const line = (n: number, perDay: number, noise: (i: number) => number = () => 0) =>
    Array.from({ length: n }, (_, i) => ({ date: addDays("2026-10-19", i), kg: 74 + perDay * i + noise(i) }));

  it("recovers the slope of a clean line with a zero standard error", () => {
    const f = slopeWithSe(line(21, 0.02), "2026-10-19")!;
    expect(f.slope).toBeCloseTo(0.02, 10);
    expect(f.se).toBeCloseTo(0, 10);
    expect(f.intercept).toBeCloseTo(74, 10);
    expect(f.n).toBe(21);
    expect(f.spanDays).toBe(20);
  });

  it("SE = √(RSS / (n − 2) / Sxx)", () => {
    const pts = line(5, 0, (i) => [0.3, -0.2, 0.1, -0.4, 0.2][i]!);
    const f = slopeWithSe(pts, "2026-10-19")!;
    // Hand check: x = 0..4, mean 2, Sxx = 10; y residuals from the fitted line.
    const xs = [0, 1, 2, 3, 4];
    const ys = pts.map((p) => p.kg);
    const my = ys.reduce((a, b) => a + b, 0) / 5;
    const slope = xs.reduce((s, x, i) => s + (x - 2) * (ys[i]! - my), 0) / 10;
    const rss = xs.reduce((s, x, i) => s + (ys[i]! - (my + slope * (x - 2))) ** 2, 0);
    expect(f.slope).toBeCloseTo(slope, 12);
    expect(f.se).toBeCloseTo(Math.sqrt(rss / 3 / 10), 12);
  });

  it("R1-21: SE corrected for lag-1 autocorrelation of the residuals, r clipped to 0–0.6", () => {
    // Alternating noise: negative r → clipped to 0, so SE = the plain SE.
    const alt = slopeWithSe(line(21, 0.02, (i) => (i % 2 ? -0.3 : 0.3)), "2026-10-19")!;
    expect(alt.r).toBe(0);
    expect(alt.se).toBeCloseTo(alt.seRaw!, 12);
    // Runs of the same sign: r > 0, SE × √((1 + r) / (1 − r)).
    const runs = slopeWithSe(line(28, 0.02, (i) => (Math.floor(i / 7) % 2 ? -0.4 : 0.4)), "2026-10-19")!;
    expect(runs.r).toBeGreaterThan(0);
    expect(runs.r).toBeLessThanOrEqual(0.6);
    expect(runs.se).toBeCloseTo(runs.seRaw! * Math.sqrt((1 + runs.r) / (1 - runs.r)), 12);
  });

  it("slopeWithoutOutliers drops readings more than 1.5 kg off the first fit", () => {
    const pts = line(21, 0.02);
    pts[10] = { ...pts[10]!, kg: pts[10]!.kg + 3 };
    const r = slopeWithoutOutliers(pts, "2026-10-19", 1.5)!;
    expect(r.dropped).toBe(1);
    expect(r.points).toHaveLength(20);
    expect(r.fit.slope).toBeCloseTo(0.02, 10);
  });

  it("needs two points on different days; SE needs three", () => {
    expect(slopeWithSe(line(1, 0.1), "2026-10-19")).toBeNull();
    expect(slopeWithSe([{ date: "2026-10-19", kg: 74 }, { date: "2026-10-19", kg: 75 }], "2026-10-19")).toBeNull();
    expect(slopeWithSe(line(2, 0.1), "2026-10-19")!.se).toBeNull();
  });
});
