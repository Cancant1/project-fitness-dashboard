import { describe, expect, it } from "vitest";
import { migrateLegacySources } from "./migrate";

const fitnessFixture = {
  metadata: { sourceWorkbook: "anonymized-ci-fixture.xlsx" },
  workouts: {
    sessions: [
      {
        id: "fixture-performed",
        date: "2026-01-05",
        split: "Full body",
        block: "Fixture block",
        performedSetCount: 1,
        entries: [{ exercise: "Fixture squat", group: "Legs", unit: "kg", targetSets: 1, targetReps: "5", sets: [{ set: 1, weight: 100, repsNumber: 5, rpe: 8 }] }]
      },
      {
        id: "fixture-note-only",
        date: "2026-01-07",
        split: "Recovery",
        performedSetCount: 0,
        dayNote: "Preserved recovery note",
        entries: [{ exercise: "Fixture row", group: "Pull", unit: "kg", targetSets: 1, targetReps: "8", sets: [{ set: 1, note: "Preserved set note" }] }]
      }
    ],
    blockSummaries: [{ sheet: "Fixture block", weeks: [{ weekStart: "2026-01-05" }] }]
  },
  body: { daily: [{ date: "2026-01-05", weight: 80, kcal: 2400, protein: 170 }] },
  nutrition: { foodItems: [{ id: "fixture-food", product: "Fixture meal", unit: "serving", kcal: 500, protein: 35 }] },
  stats: { lifetimePrs: [{ exercise: "Fixture squat", weight: 100, reps: 5 }] }
};

describe("canonical migration", () => {
  it("reconciles the embedded workbook without unexplained drops", async () => {
    const snapshot = await migrateLegacySources({
      fitnessData: fitnessFixture,
      foodCatalog: [{ id: "public-fixture-food", name: "Public fixture food", unit: "serving", kcal: 120, protein: 8 }],
      fitnessOsV3: { unknownFutureField: { preserve: true } },
      legacyRoutine: [],
      clientId: "test-device"
    });
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.settings.workoutTimerEnabled).toBe(false);
    expect(snapshot.settings.restTimerEnabled).toBe(false);
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

it("does not invent nutrition targets for a new journal and retains imported targets", async () => {
  expect((await migrateLegacySources({ clientId: "new" })).nutritionTargets).toHaveLength(0);
  const imported = await migrateLegacySources({ clientId: "import", repsV1: { profiles: [{ id: "existing", name: "Existing", macros: { Mon: { kcal: 2300, protein: 150, carbs: 240, fat: 75 } } }] } });
  expect(imported.nutritionTargets[0].weekdays.Mon).toEqual({ kcal: 2300, protein: 150, carbs: 240, fat: 75 });
});
