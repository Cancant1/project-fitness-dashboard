import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const readGlobalScript = (file, globalName) => {
  const source = readFileSync(resolve(root, file), "utf8");
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: file });
  return { value: context.window[globalName], checksum: createHash("sha256").update(source).digest("hex") };
};

const fitness = readGlobalScript("data/fitness-data.js", "FITNESS_DATA");
const catalog = readGlobalScript("data/food-catalog.js", "REPS_FOOD_CATALOG");
const routine = readGlobalScript("data/routine.js", "PLANNED_ROUTINE");
const data = fitness.value || {};
const report = {
  auditedAt: new Date().toISOString(),
  source: data.metadata?.sourceWorkbook || "embedded fitness-data.js",
  checksums: {
    fitnessData: fitness.checksum,
    foodCatalog: catalog.checksum,
    routine: routine.checksum
  },
  counts: {
    workoutSessions: data.workouts?.sessions?.length || 0,
    blockSummaries: data.workouts?.blockSummaries?.length || 0,
    workoutExercises: data.workouts?.exercises?.length || 0,
    bodyDailyRows: data.body?.daily?.length || 0,
    bodyWeeklyRows: data.body?.weekly?.length || 0,
    nutritionFoodItems: data.nutrition?.foodItems?.length || 0,
    catalogFoods: Array.isArray(catalog.value) ? catalog.value.length : 0,
    routineDays: Array.isArray(routine.value) ? routine.value.length : 0,
    rawStatsRows: data.stats?.rawRows?.length || 0
  },
  sourceSummary: data.summary || null
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
