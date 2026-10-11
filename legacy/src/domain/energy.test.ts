import { beforeEach, describe, expect, it } from "vitest";
import { migrateLegacySources } from "../data/migrate";
import type { RepsSnapshot } from "./types";
import { adaptiveTdee, dailyCalories } from "./energy";
import { addDays } from "./utils";

let snapshot: RepsSnapshot;
const stamp = "2026-06-01T12:00:00Z";
const entity = { createdAt: stamp, updatedAt: stamp, source: "manual" as const };
beforeEach(async () => { snapshot = await migrateLegacySources({ clientId: "test" }); snapshot.measurements = []; snapshot.foodEntries = []; snapshot.nutritionOverrides = []; });
function seed(slope = 0) {
  for (let index = 0; index < 14; index++) {
    const date = addDays("2026-06-01", index);
    snapshot.measurements.push({ ...entity, id: `w-${index}`, profileId: "test", date, type: "weight", value: 80 + slope * index, unit: "kg" });
    snapshot.nutritionOverrides.push({ ...entity, id: `f-${index}`, profileId: "test", date, kcal: 2200 });
  }
}
describe("adaptive TDEE", () => {
  it.each([[0, 2200], [-.05, 2575], [.05, 1825]])("accounts for daily weight change %s", (slope, expected) => {
    seed(slope); const result = adaptiveTdee(snapshot, "test", 14, "2026-06-15");
    expect(result.ready).toBe(true); expect(result.maintenanceKcal).toBe(expected);
  });
  it("normalizes pounds, isolates profiles and ignores deleted measurements", () => {
    seed(); snapshot.measurements.forEach((item, i) => { if (i % 2) { item.value /= .45359237; item.unit = "lb"; } });
    snapshot.measurements.push({ ...snapshot.measurements[0], id: "foreign", profileId: "other", value: 200 });
    snapshot.measurements.push({ ...snapshot.measurements[0], id: "deleted", value: 200, deletedAt: stamp });
    expect(adaptiveTdee(snapshot, "test", 14, "2026-06-15").maintenanceKcal).toBe(2200);
  });
  it("uses explicit totals over food items, omits cleared totals and never adds targets", () => {
    seed(); snapshot.foodEntries.push({ ...entity, id: "food", profileId: "test", date: "2026-06-02", nameSnapshot: "Meal", servingLabelSnapshot: "meal", quantity: 1, kcal: 900, protein: 20, carbs: null, fat: null });
    expect(dailyCalories(snapshot, "test").get("2026-06-02")).toBe(2200);
    snapshot.nutritionOverrides[1].kcal = null;
    expect(dailyCalories(snapshot, "test").has("2026-06-02")).toBe(false);
    snapshot.nutritionOverrides[1].kcal = undefined;
    expect(dailyCalories(snapshot, "test").get("2026-06-02")).toBe(900);
  });
  it("excludes incomplete end-date food and deduplicates same-day weights", () => {
    seed(); snapshot.nutritionOverrides.push({ ...entity, id: "today", profileId: "test", date: "2026-06-15", kcal: 400 });
    snapshot.measurements.push({ ...snapshot.measurements[1], id: "duplicate", updatedAt: "2026-06-02T18:00:00Z" });
    const result = adaptiveTdee(snapshot, "test", 14, "2026-06-15");
    expect(result.avgKcal).toBe(2200); expect(result.kcalDays).toBe(14); expect(result.weightDays).toBe(13);
  });
  it("reports missing or stale records instead of inventing a maintenance value", () => {
    seed(); const result = adaptiveTdee(snapshot, "test", 14, "2026-09-08");
    expect(result.ready).toBe(false); expect(result.maintenanceKcal).toBeNull(); expect(result.reason).toContain("5 more weigh-ins");
    snapshot.measurements = snapshot.measurements.slice(0, 3);
    expect(adaptiveTdee(snapshot, "test", 14, "2026-06-15").ready).toBe(false);
  });
});
