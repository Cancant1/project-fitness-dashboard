import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateLegacySources } from "./migrate";

const runLegacy = (file: string) => {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  Function("window", source)(window);
};

describe("canonical migration", () => {
  it("reconciles the embedded workbook without unexplained drops", async () => {
    runLegacy("data/fitness-data.js");
    runLegacy("data/food-catalog.js");
    runLegacy("data/routine.js");
    const snapshot = await migrateLegacySources({
      fitnessData: window.FITNESS_DATA,
      foodCatalog: window.REPS_FOOD_CATALOG as any[],
      fitnessOsV3: { unknownFutureField: { preserve: true } },
      legacyRoutine: (window.PLANNED_ROUTINE || []) as unknown[],
      clientId: "test-device"
    });
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.migrationReport?.unexplainedDrops).toBe(0);
    expect(snapshot.sessions.filter((item) => item.status === "completed")).toHaveLength(Number(snapshot.migrationReport?.sourceCounts.workbookPerformedSessions));
    expect(snapshot.sessions.some((item) => item.status === "skipped" && item.performances.some((performance) => performance.sets.some((set) => !!set.note)))).toBe(true);
    expect(snapshot.sessions.length).toBeGreaterThanOrEqual(Number(snapshot.migrationReport?.sourceCounts.workbookPerformedSessions || 0));
    expect(snapshot.measurements.length).toBeGreaterThanOrEqual(Number(snapshot.migrationReport?.sourceCounts.workbookWeightEntries || 0));
    expect(snapshot.nutritionOverrides.length).toBeGreaterThanOrEqual(Number(snapshot.migrationReport?.sourceCounts.workbookNutritionDays || 0));
    expect(snapshot.legacyFacts.length).toBeGreaterThan(0);
    expect(snapshot.legacyFacts.find((item) => item.id === "legacy-fitness-os-v3-raw")?.value).toEqual({ unknownFutureField: { preserve: true } });
    expect(snapshot.foods).toHaveLength(Number(snapshot.migrationReport?.sourceCounts.workbookFoodItems || 0) + Number(snapshot.migrationReport?.sourceCounts.publicCatalogFoods || 0));
    for (const collection of [snapshot.profiles, snapshot.exercises, snapshot.sessions, snapshot.plannedWorkouts, snapshot.routines, snapshot.blocks, snapshot.foods, snapshot.foodEntries, snapshot.measurements, snapshot.nutritionTargets, snapshot.nutritionOverrides, snapshot.annotations, snapshot.legacyFacts]) {
      expect(new Set(collection.map((item) => item.id)).size).toBe(collection.length);
    }
  });
});
