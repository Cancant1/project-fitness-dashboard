import { adaptiveTdee } from "./energy";
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
