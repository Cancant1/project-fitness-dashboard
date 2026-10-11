import type { RepsSnapshot, VersionedEntity } from "../domain/types";
import { deepClone, isPlaceholderProfile } from "../domain/utils";

// Recovery only adds missing records. Existing edits and deletions take precedence.
export function addRecoveredRecords(current: RepsSnapshot, recovered: RepsSnapshot): RepsSnapshot {
  const next = deepClone(current);
  const deletedIds = new Set(current.tombstones.map((item) => item.entityId));
  const addMissing = <T extends VersionedEntity>(existing: T[], incoming: T[]): T[] => {
    const ids = new Set(existing.map((item) => item.id));
    return [...existing, ...incoming.filter((item) => !ids.has(item.id) && !deletedIds.has(item.id)).map((item) => deepClone(item))];
  };
  next.profiles = addMissing(next.profiles, recovered.profiles).map((profile) => {
    const original = recovered.profiles.find((item) => item.id === profile.id && !item.deletedAt && !isPlaceholderProfile(item));
    return !profile.deletedAt && isPlaceholderProfile(profile) && original ? deepClone(original) : profile;
  });
  next.exercises = addMissing(next.exercises, recovered.exercises);
  next.sessions = addMissing(next.sessions, recovered.sessions);
  next.plannedWorkouts = addMissing(next.plannedWorkouts, recovered.plannedWorkouts);
  next.routines = addMissing(next.routines, recovered.routines);
  next.blocks = addMissing(next.blocks, recovered.blocks);
  next.foods = addMissing(next.foods, recovered.foods);
  next.foodEntries = addMissing(next.foodEntries, recovered.foodEntries);
  next.savedMeals = addMissing(next.savedMeals, recovered.savedMeals);
  next.measurements = addMissing(next.measurements, recovered.measurements);
  next.nutritionTargets = addMissing(next.nutritionTargets, recovered.nutritionTargets);
  next.nutritionOverrides = addMissing(next.nutritionOverrides, recovered.nutritionOverrides);
  next.annotations = addMissing(next.annotations, recovered.annotations);
  next.legacyFacts = addMissing(next.legacyFacts, recovered.legacyFacts);
  next.equipmentProfiles = addMissing(next.equipmentProfiles, recovered.equipmentProfiles);
  const recoveredProfile = next.profiles.find((item) => item.id === recovered.settings.activeProfileId && !item.deletedAt);
  if (recoveredProfile) next.settings.activeProfileId = recoveredProfile.id;
  return next;
}
