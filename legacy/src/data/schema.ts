import { z } from "zod";
import type { RepsSnapshot } from "../domain/types";

const versionedEntity = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  deletedAt: z.string().optional()
}).passthrough();

export const snapshotSchema = z.object({
  app: z.literal("reps"),
  schemaVersion: z.literal(2),
  snapshotId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  updatedBy: z.string().min(1),
  revision: z.number().int().nonnegative(),
  profiles: z.array(versionedEntity),
  exercises: z.array(versionedEntity),
  sessions: z.array(versionedEntity),
  plannedWorkouts: z.array(versionedEntity),
  routines: z.array(versionedEntity),
  blocks: z.array(versionedEntity),
  foods: z.array(versionedEntity),
  foodEntries: z.array(versionedEntity),
  savedMeals: z.array(versionedEntity),
  measurements: z.array(versionedEntity),
  nutritionTargets: z.array(versionedEntity),
  nutritionOverrides: z.array(versionedEntity),
  annotations: z.array(versionedEntity),
  legacyFacts: z.array(versionedEntity),
  equipmentProfiles: z.array(versionedEntity),
  tombstones: z.array(z.object({
    entityType: z.string(),
    entityId: z.string(),
    deletedAt: z.string(),
    revision: z.string()
  })),
  settings: z.object({
    appearance: z.object({ theme: z.enum(["system", "light", "dark"]), density: z.enum(["comfortable", "compact"]) }),
    restSeconds: z.number(),
    workoutTimerEnabled: z.boolean().optional(),
    restTimerEnabled: z.boolean().optional(),
    preferredRpeMode: z.enum(["rpe", "rir", "both", "off"]),
    mealView: z.enum(["meal", "time"]),
    activeProfileId: z.string()
  }).passthrough(),
  migrationReport: z.unknown().optional()
}).passthrough();

export function validateSnapshot(value: unknown): RepsSnapshot {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) {
    const summary = parsed.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`This file is not a valid Reps schema 2 snapshot. ${summary}`);
  }
  return value as RepsSnapshot;
}
