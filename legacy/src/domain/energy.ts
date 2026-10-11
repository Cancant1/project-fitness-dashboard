import type { RepsSnapshot } from "./types";
import { addDays, todayIso } from "./utils";

const DAY_MS = 86400000;
const daysBetween = (start: string, end: string) => (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / DAY_MS;

// Explicit imported daily totals take precedence over itemised food, as in legacy Reps.
// Missing or cleared totals are not treated as zero-calorie days.
export function dailyCalories(snapshot: RepsSnapshot, profileId: string): Map<string, number> {
  const days = new Map<string, number>();
  for (const entry of snapshot.foodEntries) {
    if (entry.profileId !== profileId || entry.deletedAt || !Number.isFinite(entry.kcal)) continue;
    days.set(entry.date, (days.get(entry.date) ?? 0) + entry.kcal);
  }
  const overrides = snapshot.nutritionOverrides.filter((item) => item.profileId === profileId && !item.deletedAt)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const override of overrides) {
    if (override.kcal === undefined) continue;
    if (override.kcal === null || !Number.isFinite(override.kcal)) days.delete(override.date);
    else days.set(override.date, override.kcal);
  }
  return new Map([...days].filter(([, kcal]) => kcal > 0));
}

export function adaptiveTdee(snapshot: RepsSnapshot, profileId: string, windowDays = 28, endDate = todayIso()) {
  const startDate = addDays(endDate, 1 - windowDays);
  const weightMap = new Map<string, number>();
  for (const measurement of snapshot.measurements.filter((item) => item.profileId === profileId && !item.deletedAt)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
    if (measurement.type !== "weight" || (measurement.unit !== "kg" && measurement.unit !== "lb") ||
      !Number.isFinite(measurement.value) || measurement.value <= 0 || measurement.date < startDate || measurement.date > endDate) continue;
    weightMap.set(measurement.date, measurement.value * (measurement.unit === "lb" ? 0.45359237 : 1));
  }
  const weights = [...weightMap].sort(([a], [b]) => a.localeCompare(b));
  // Today's intake may still be incomplete. Retain the legacy completed-day window.
  const kcalRows = [...dailyCalories(snapshot, profileId)].filter(([date]) => date >= addDays(endDate, -windowDays) && date < endDate);
  const spanDays = weights.length > 1 ? daysBetween(weights[0][0], weights.at(-1)![0]) : 0;
  const avgKcal = kcalRows.length ? kcalRows.reduce((sum, [, kcal]) => sum + kcal, 0) / kcalRows.length : null;
  let slope: number | null = null;
  if (spanDays > 0) {
    const xs = weights.map(([date]) => daysBetween(weights[0][0], date));
    const xMean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const yMean = weights.reduce((sum, [, value]) => sum + value, 0) / weights.length;
    const denominator = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
    slope = xs.reduce((sum, x, i) => sum + (x - xMean) * (weights[i][1] - yMean), 0) / denominator;
  }
  const missing: string[] = [];
  if (weights.length < 5) missing.push(`${5 - weights.length} more weigh-ins`);
  if (spanDays < 7) missing.push("a weight history spanning at least 7 days");
  if (kcalRows.length < 3) missing.push(`${3 - kcalRows.length} more food days`);
  const estimate = !missing.length && avgKcal != null && slope != null ? avgKcal - slope * 7700 : null;
  if (estimate != null && (!Number.isFinite(estimate) || estimate <= 0)) missing.push("consistent intake and weight records");
  const ready = !missing.length && estimate != null;
  return {
    ready, windowDays, startDate, endDate, weightDays: weights.length, kcalDays: kcalRows.length, spanDays,
    avgKcal, weeklyRateKg: slope == null ? null : slope * 7,
    maintenanceKcal: ready ? Math.round(estimate! / 25) * 25 : null,
    coverage: ready ? kcalRows.length >= Math.ceil(windowDays * .75) && weights.length >= Math.ceil(windowDays / 2) ? "Good coverage" : "Limited coverage" : "Not enough data",
    reason: missing.join(" · ")
  };
}
