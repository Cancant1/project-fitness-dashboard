import type {
  Annotation,
  BodyMeasurement,
  Exercise,
  ExercisePerformance,
  FoodDefinition,
  FoodLogEntry,
  LegacyFact,
  MigrationIssue,
  MigrationReport,
  NutritionOverride,
  NutritionTarget,
  PlannedExercise,
  PlannedWorkout,
  Profile,
  RepsSnapshot,
  RoutineDay,
  RoutineTemplate,
  SetResult,
  TrainingBlock,
  WorkoutSession
} from "../domain/types";
import { dateRange, hashText, movementFor, nowIso, safeNumber, slug, todayIso, uid, unitFor } from "../domain/utils";

const DEFAULT_MACROS = { kcal: 2700, protein: 180, carbs: 280, fat: 85 };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Loose = Record<string, any>;

const legacyId = (prefix: string, value: unknown, suffix = "") => `${prefix}-${slug(value) || "unknown"}${suffix ? `-${slug(suffix)}` : ""}`;

const stamped = <T extends Record<string, unknown>>(payload: T, source: "workbook" | "reps-v1" | "fitness-os-v3" | "seed", sourceRef?: string) => {
  const stamp = nowIso();
  return { ...payload, createdAt: stamp, updatedAt: stamp, source, sourceRef };
};

const performanceFromLegacy = (
  entry: Loose,
  exercise: Exercise,
  source: "workbook" | "reps-v1",
  sessionRef: string,
  order: number
): ExercisePerformance => {
  const sets = Array.isArray(entry.sets) ? entry.sets : [];
  const setResults: SetResult[] = sets.map((set: Loose, index: number) => {
    const reps = safeNumber(set.repsNumber ?? set.reps);
    const duration = safeNumber(set.durationMinutes ?? set.duration);
    const type = duration != null ? "timed" : (set.type || set.setType || "working");
    const id = legacyId("set", sessionRef, `${exercise.id}-${set.set ?? index + 1}`);
    return stamped({
      id,
      index: Number(set.set ?? index + 1),
      type: ["warmup", "working", "drop", "amrap", "failure", "timed"].includes(type) ? type : "working",
      load: safeNumber(set.weight),
      unit: unitFor(set.unit ?? entry.unit, exercise.name),
      reps,
      durationMinutes: duration,
      rpe: safeNumber(set.rpe),
      rir: safeNumber(set.rir),
      note: String(set.note ?? "").trim() || undefined,
      completed: reps != null || duration != null,
      completedAt: undefined,
      prescription: {
        targetReps: String(entry.targetReps ?? "").trim() || undefined,
        targetLoad: safeNumber(entry.workingWeight) ?? undefined,
        targetUnit: unitFor(entry.unit, exercise.name)
      },
      sourceRaw: source === "workbook" ? set : undefined
    }, source, `${sessionRef}:${exercise.name}:${index + 1}`) as SetResult;
  });
  const targetSets = safeNumber(entry.targetSets) ?? Math.max(setResults.length, 1);
  while (setResults.length < targetSets) {
    const index = setResults.length;
    setResults.push(stamped({
      id: legacyId("set", sessionRef, `${exercise.id}-${index + 1}`),
      index: index + 1,
      type: "working",
      load: safeNumber(entry.workingWeight),
      unit: unitFor(entry.unit, exercise.name),
      reps: null,
      durationMinutes: null,
      rpe: null,
      rir: null,
      completed: false,
      prescription: { targetReps: String(entry.targetReps ?? "").trim() || undefined }
    }, source, `${sessionRef}:${exercise.name}:${index + 1}`) as SetResult);
  }
  return stamped({
    id: legacyId("performance", sessionRef, `${exercise.id}-${order}`),
    exerciseId: exercise.id,
    exerciseNameSnapshot: exercise.name,
    order,
    movement: exercise.movement,
    prescription: {
      targetSets: targetSets || undefined,
      targetReps: String(entry.targetReps ?? "").trim() || undefined,
      note: String(entry.note ?? entry.notes ?? "").trim() || undefined
    },
    sets: setResults,
    note: String(entry.note ?? entry.notes ?? "").trim() || undefined,
    skipped: false
  }, source, `${sessionRef}:${exercise.name}`) as ExercisePerformance;
};

const bestLegacySession = (current: Loose | undefined, candidate: Loose) => {
  if (!current) return candidate;
  const score = (session: Loose) => (session.entries || []).reduce((sum: number, entry: Loose) => (
    sum + (entry.sets || []).filter((set: Loose) => set.reps != null || set.repsNumber != null || set.duration || set.note).length * 100
  ), 0) + (session.notes ? 10 : 0);
  const currentScore = score(current);
  const nextScore = score(candidate);
  if (nextScore !== currentScore) return nextScore > currentScore ? candidate : current;
  return Date.parse(candidate.updatedAt || "") > Date.parse(current.updatedAt || "") ? candidate : current;
};

export async function migrateLegacySources(input: {
  repsV1?: Loose | null;
  fitnessOsV3?: Loose | null;
  fitnessData?: Loose | null;
  foodCatalog?: Loose[] | null;
  legacyRoutine?: unknown[] | null;
  clientId: string;
}): Promise<RepsSnapshot> {
  const stamp = nowIso();
  const issues: MigrationIssue[] = [];
  const fitness = input.fitnessData || {};
  const repsState = input.repsV1 || {};
  const legacyProfiles: Loose[] = Array.isArray(repsState.profiles) && repsState.profiles.length ? repsState.profiles : [{ id: "local", name: "Profile", unit: "kg" }];
  const profiles: Profile[] = legacyProfiles.map((legacy, index) => stamped({
    id: String(legacy.id || `profile-${index + 1}`),
    name: String(legacy.name || `Profile ${index + 1}`),
    birthday: String(legacy.birthday || "") || undefined,
    preferredUnit: legacy.unit === "lb" ? "lb" : "kg",
    locale: "en-GB",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Amsterdam",
    activeRoutineId: legacy.activeRoutineId || undefined,
    targetWeight: safeNumber(legacy.targetWeight),
    trackCarbs: legacy.trackCarbs !== false,
    trackFat: legacy.trackFat !== false
  }, "reps-v1", `profiles[${index}]`) as Profile);
  const activeProfileId = profiles.some((profile) => profile.id === repsState.activeProfileId)
    ? repsState.activeProfileId
    : profiles[0].id;

  const exerciseMap = new Map<string, Exercise>();
  const exerciseFor = (nameValue: unknown, patch: Loose = {}, source: "workbook" | "reps-v1" | "seed" = "workbook") => {
    const name = String(nameValue || "Unnamed exercise").trim();
    const renameMap = legacyProfiles.reduce((all, profile) => ({ ...all, ...(profile.exerciseRenames || {}) }), {} as Loose);
    const renamed = String(renameMap[name] || name).trim();
    const key = slug(renamed) || renamed.toLowerCase();
    const existing = exerciseMap.get(key);
    if (existing) {
      if (name !== existing.name && !existing.aliases.includes(name)) existing.aliases.push(name);
      if (renamed !== existing.name && !existing.aliases.includes(renamed)) existing.aliases.push(renamed);
      return existing;
    }
    const exercise = stamped({
      id: legacyId("exercise", renamed),
      name: renamed,
      aliases: name !== renamed ? [name] : [],
      movement: movementFor(renamed, patch.group ?? patch.movementGroup),
      muscles: Array.isArray(patch.muscles) ? patch.muscles : [],
      equipment: patch.equipment ? [String(patch.equipment)] : [],
      defaultUnit: unitFor(patch.unit, renamed),
      compound: patch.compound ?? /deadlift|squat|press|bench|pullup|chin|row/i.test(renamed),
      cues: String(patch.notes || "").trim() ? [String(patch.notes).trim()] : [],
      substitutions: [],
      archived: false
    }, source, renamed) as Exercise;
    exerciseMap.set(key, exercise);
    return exercise;
  };

  for (const profile of legacyProfiles) {
    for (const custom of profile.customExercises || []) exerciseFor(custom.name, custom, "reps-v1");
    for (const session of profile.loggedSessions || []) {
      for (const entry of session.entries || []) exerciseFor(entry.exercise || entry.name, entry, "reps-v1");
    }
  }
  for (const session of fitness.workouts?.sessions || []) {
    for (const entry of session.entries || []) exerciseFor(entry.exercise, entry, "workbook");
  }

  const sessions: WorkoutSession[] = [];
  const plannedWorkouts: PlannedWorkout[] = [];
  const workbookSessions: Loose[] = Array.isArray(fitness.workouts?.sessions) ? fitness.workouts.sessions : [];
  const defaultProfileId = profiles[0].id;

  for (const legacy of workbookSessions) {
    const sourceRef = String(legacy.id || `${legacy.block}:${legacy.weekNumber}:${legacy.nominalDay}`);
    const hasPerformedResult = Number(legacy.performedSetCount || 0) > 0 || (legacy.entries || []).some((entry: Loose) => (
      (entry.sets || []).some((set: Loose) => safeNumber(set.repsNumber ?? set.reps) != null || safeNumber(set.durationMinutes ?? set.duration) != null)
    ));
    const hasPreservedNotes = !!String(legacy.dayNote ?? legacy.notes ?? "").trim() || (legacy.entries || []).some((entry: Loose) => (
      !!String(entry.note ?? entry.notes ?? "").trim() || (entry.sets || []).some((set: Loose) => !!String(set.note ?? "").trim())
    ));
    const plannedExercises: PlannedExercise[] = (legacy.entries || []).map((entry: Loose, order: number) => {
      const exercise = exerciseFor(entry.exercise, entry, "workbook");
      return {
        id: legacyId("planned-exercise", sourceRef, `${exercise.id}-${order}`),
        exerciseId: exercise.id,
        nameSnapshot: exercise.name,
        order,
        targetSets: safeNumber(entry.targetSets) ?? Math.max((entry.sets || []).length, 1),
        targetReps: String(entry.targetReps ?? "").trim() || "—",
        unit: unitFor(entry.unit, exercise.name),
        targetLoad: safeNumber(entry.workingWeight) ?? undefined,
        note: String(entry.note ?? "").trim() || undefined
      };
    });
    plannedWorkouts.push(stamped({
      id: legacyId("planned", sourceRef),
      profileId: defaultProfileId,
      blockId: legacy.block ? legacyId("block", legacy.block) : undefined,
      date: String(legacy.date),
      title: String(legacy.split || legacy.nominalDay || "Workout"),
      split: String(legacy.split || "") || undefined,
      status: hasPerformedResult ? "completed" : hasPreservedNotes || legacy.status === "skipped" ? "skipped" : "planned",
      exercises: plannedExercises,
      note: String(legacy.dayNote ?? "").trim() || undefined
    }, "workbook", sourceRef) as PlannedWorkout);

    if (!hasPerformedResult && !hasPreservedNotes) continue;
    const sessionId = legacyId("session", sourceRef);
    sessions.push(stamped({
      id: sessionId,
      profileId: defaultProfileId,
      title: String(legacy.split || legacy.nominalDay || "Workout"),
      split: String(legacy.split || "") || undefined,
      plannedWorkoutId: legacyId("planned", sourceRef),
      plannedDate: String(legacy.date),
      actualDate: String(legacy.date),
      status: hasPerformedResult ? "completed" : "skipped",
      completedAt: hasPerformedResult ? `${legacy.date}T20:00:00.000Z` : undefined,
      sessionRpe: safeNumber(legacy.dailyMetrics?.rpe),
      energy: safeNumber(legacy.dailyMetrics?.energy),
      notes: String(legacy.dayNote ?? legacy.notes ?? "").trim() || undefined,
      blockId: legacy.block ? legacyId("block", legacy.block) : undefined,
      performances: (legacy.entries || []).map((entry: Loose, order: number) => (
        performanceFromLegacy(entry, exerciseFor(entry.exercise, entry, "workbook"), "workbook", sourceRef, order)
      ))
    }, "workbook", sourceRef) as WorkoutSession);
  }

  const localBySlot = new Map<string, { session: Loose; profileId: string }>();
  for (const legacyProfile of legacyProfiles) {
    const deleted = new Set((legacyProfile.deletedSessionIds || []).map(String));
    for (const raw of legacyProfile.loggedSessions || []) {
      if (deleted.has(String(raw.id))) continue;
      const edited = { ...raw, ...(legacyProfile.sessionEdits?.[raw.id] || {}) };
      const slot = `${legacyProfile.id}:${edited.plannedDate || edited.date}:${edited.routineDay || edited.nominalDay || edited.split || ""}`;
      const current = localBySlot.get(slot);
      localBySlot.set(slot, { session: bestLegacySession(current?.session, edited), profileId: legacyProfile.id });
    }
  }
  for (const { session: legacy, profileId } of localBySlot.values()) {
    const sourceRef = String(legacy.id || `${legacy.date}:${legacy.split || legacy.day || "workout"}`);
    const sessionId = legacyId("session-v1", `${profileId}-${sourceRef}`);
    const migrated = stamped({
      id: sessionId,
      profileId,
      title: String(legacy.title || legacy.split || legacy.day || "Workout"),
      split: String(legacy.split || legacy.day || "") || undefined,
      plannedDate: String(legacy.plannedDate || legacy.date),
      actualDate: String(legacy.date || legacy.plannedDate || todayIso()),
      status: legacy.status === "performed" || legacy.status === "completed" ? "completed" : legacy.status === "skipped" ? "skipped" : "draft",
      startedAt: legacy.startedAt,
      completedAt: legacy.completedAt || legacy.savedAt,
      durationMinutes: safeNumber(legacy.durationMinutes) ?? undefined,
      sessionRpe: safeNumber(legacy.rpe ?? legacy.sessionRpe),
      energy: safeNumber(legacy.energy),
      notes: String(legacy.notes || "").trim() || undefined,
      returnBlockKey: legacy.returnBlockKey,
      performances: (legacy.entries || []).map((entry: Loose, order: number) => (
        performanceFromLegacy(entry, exerciseFor(entry.exercise || entry.name, entry, "reps-v1"), "reps-v1", sourceRef, order)
      ))
    }, "reps-v1", sourceRef) as WorkoutSession;
    const workbookIndex = sessions.findIndex((candidate) => candidate.profileId === profileId && candidate.actualDate === migrated.actualDate && candidate.split === migrated.split);
    if (workbookIndex >= 0) {
      const oldSets = sessions[workbookIndex].performances.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0);
      const newSets = migrated.performances.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0);
      if (newSets >= oldSets) sessions[workbookIndex] = migrated;
    } else {
      sessions.push(migrated);
    }
  }

  const routines: RoutineTemplate[] = [];
  for (const legacyProfile of legacyProfiles) {
    const candidates = (legacyProfile.routines?.length ? legacyProfile.routines : input.legacyRoutine || []) as Loose[];
    for (const [routineIndex, routine] of candidates.entries()) {
      const routineId = String(routine.id || legacyId("routine", `${legacyProfile.id}-${routine.name || routineIndex}`));
      const rawDays = Array.isArray(routine.days) ? routine.days : Array.isArray(routine.sessions) ? routine.sessions : [];
      const days: RoutineDay[] = rawDays.map((day: Loose, dayIndex: number) => ({
        id: String(day.id || legacyId("routine-day", routineId, `${day.day || dayIndex}`)),
        day: String(day.day || day.name || `Day ${dayIndex + 1}`),
        title: String(day.title || day.type || day.day || `Day ${dayIndex + 1}`),
        focus: String(day.focus || "") || undefined,
        exercises: (day.exercises || []).map((item: Loose, order: number) => {
          const exercise = exerciseFor(item.name || item.exercise, item, "reps-v1");
          return {
            id: legacyId("routine-exercise", routineId, `${dayIndex}-${exercise.id}-${order}`),
            exerciseId: exercise.id,
            nameSnapshot: exercise.name,
            order,
            targetSets: safeNumber(item.targetSets ?? String(item.target || "").match(/^\d+/)?.[0]) ?? 3,
            targetReps: String(item.targetReps || item.target || "8–12"),
            unit: unitFor(item.unit, exercise.name),
            targetLoad: safeNumber(item.targetLoad) ?? undefined,
            note: String(item.note || "") || undefined
          };
        })
      }));
      routines.push(stamped({
        id: routineId,
        profileId: legacyProfile.id,
        name: String(routine.name || `Routine ${routineIndex + 1}`),
        description: String(routine.description || "") || undefined,
        days,
        active: routineId === legacyProfile.activeRoutineId,
        returnBlockKey: routine.returnBlockKey
      }, "reps-v1", routineId) as RoutineTemplate);
    }
  }

  const blocks: TrainingBlock[] = [];
  for (const [index, raw] of (fitness.workouts?.blockSummaries || []).entries()) {
    const weeks = raw.weeks || [];
    const startDate = String(weeks[0]?.weekStart || todayIso());
    blocks.push(stamped({
      id: legacyId("block", raw.sheet || index),
      profileId: defaultProfileId,
      name: String(raw.sheet || `Block ${index + 1}`),
      startDate,
      weeks: weeks.length || 1,
      goal: "Imported from workout workbook",
      status: startDate <= todayIso() ? "completed" : "planned"
    }, "workbook", String(raw.sheet || index)) as TrainingBlock);
  }
  for (const legacyProfile of legacyProfiles) {
    for (const [index, raw] of (legacyProfile.customBlocks || []).entries()) {
      const id = String(raw.id || legacyId("block-v1", `${legacyProfile.id}-${raw.name || index}`));
      if (blocks.some((block) => block.id === id)) continue;
      blocks.push(stamped({
        id,
        profileId: legacyProfile.id,
        name: String(raw.name || `Block ${index + 1}`),
        startDate: String(raw.startDate || todayIso()),
        weeks: safeNumber(raw.weeks) ?? 1,
        goal: String(raw.goal || "") || undefined,
        notes: String(raw.notes || "") || undefined,
        status: raw.status || "planned"
      }, "reps-v1", id) as TrainingBlock);
    }
  }

  const foods: FoodDefinition[] = [];
  const foodSources: Array<{ item: Loose; profileId?: string; source: "workbook" | "reps-v1" | "seed"; ref: string }> = [];
  (fitness.nutrition?.foodItems || []).forEach((item: Loose, index: number) => foodSources.push({ item, source: "workbook", ref: `foodItems[${index}]` }));
  (input.foodCatalog || []).forEach((item: Loose, index: number) => foodSources.push({ item, source: "seed", ref: `publicFoodCatalog[${index}]` }));
  legacyProfiles.forEach((profile) => (profile.customFoodItems || []).forEach((item: Loose, index: number) => foodSources.push({ item, profileId: profile.id, source: "reps-v1", ref: `${profile.id}.customFoodItems[${index}]` })));
  foodSources.forEach(({ item, profileId, source, ref }, index) => {
    const name = String(item.product || item.name || "Unnamed food").trim();
    foods.push(stamped({
      id: String(item.id || legacyId("food", `${name}-${source}-${index}`)),
      profileId,
      name,
      brand: String(item.brand || "") || undefined,
      category: String(item.category || "Other"),
      servings: [{ id: "serving-1", label: String(item.unit || "serving"), amount: 1, unit: String(item.unit || "serving") }],
      kcalPerServing: safeNumber(item.kcalPerUnit ?? item.kcal) ?? 0,
      proteinPerServing: safeNumber(item.proteinPerUnit ?? item.protein) ?? 0,
      carbsPerServing: item.carbs == null ? null : safeNumber(item.carbs),
      fatPerServing: item.fat == null ? null : safeNumber(item.fat),
      sourceLabel: String(item.sourceLabel || "") || undefined,
      sourceUrl: String(item.sourceUrl || "") || undefined,
      verified: !!item.verified,
      favorite: !!item.favorite,
      archived: false
    }, source, ref) as FoodDefinition);
  });

  const foodEntries: FoodLogEntry[] = [];
  const nutritionOverrides: NutritionOverride[] = [];
  for (const profile of legacyProfiles) {
    for (const [date, entries] of Object.entries(profile.foodByDate || {})) {
      for (const [index, raw] of (entries as Loose[]).entries()) {
        const quantity = safeNumber(raw.amount) ?? 1;
        foodEntries.push(stamped({
          id: String(raw.id || legacyId("food-entry", `${profile.id}-${date}`, `${index}-${raw.product || raw.name}`)),
          profileId: profile.id,
          date,
          time: raw.time,
          meal: raw.meal || "Other",
          foodId: raw.foodId,
          nameSnapshot: String(raw.product || raw.name || "Food"),
          servingLabelSnapshot: String(raw.serving || raw.unit || "serving"),
          quantity,
          kcal: safeNumber(raw.kcal) ?? 0,
          protein: safeNumber(raw.protein) ?? 0,
          carbs: raw.carbs == null ? null : safeNumber(raw.carbs),
          fat: raw.fat == null ? null : safeNumber(raw.fat),
          note: String(raw.note || "") || undefined
        }, "reps-v1", `${profile.id}.foodByDate.${date}[${index}]`) as FoodLogEntry);
      }
    }
    for (const [date, raw] of Object.entries(profile.dailyOverrides || {})) {
      const value = raw as Loose;
      if (value.kcal == null && value.protein == null && value.carbs == null && value.fat == null && !value.note) continue;
      nutritionOverrides.push(stamped({
        id: legacyId("nutrition-override", `${profile.id}-${date}`),
        profileId: profile.id,
        date,
        kcal: value.kcal,
        protein: value.protein,
        carbs: value.carbs,
        fat: value.fat,
        note: String(value.note || "") || undefined
      }, "reps-v1", `${profile.id}.dailyOverrides.${date}`) as NutritionOverride);
    }
  }
  for (const [index, raw] of (fitness.body?.daily || []).entries()) {
    if (raw.kcal == null && raw.protein == null) continue;
    const id = legacyId("nutrition-override-workbook", `${defaultProfileId}-${raw.date}`);
    if (!nutritionOverrides.some((item) => item.profileId === defaultProfileId && item.date === raw.date)) {
      nutritionOverrides.push(stamped({
        id,
        profileId: defaultProfileId,
        date: String(raw.date),
        kcal: safeNumber(raw.kcal),
        protein: safeNumber(raw.protein),
        note: undefined
      }, "workbook", `body.daily[${index}]`) as NutritionOverride);
    }
  }

  const measurements: BodyMeasurement[] = [];
  for (const [index, raw] of (fitness.body?.daily || []).entries()) {
    if (safeNumber(raw.weight) == null) continue;
    measurements.push(stamped({
      id: legacyId("weight-workbook", `${defaultProfileId}-${raw.date}`),
      profileId: defaultProfileId,
      date: String(raw.date),
      type: "weight",
      value: safeNumber(raw.weight)!,
      unit: "kg",
      note: undefined
    }, "workbook", `body.daily[${index}]`) as BodyMeasurement);
  }
  for (const profile of legacyProfiles) {
    const byDate = new Map<string, Loose>();
    for (const raw of profile.weightEntries || []) byDate.set(String(raw.date), raw);
    for (const [date, raw] of Object.entries(profile.dailyOverrides || {})) {
      if ((raw as Loose).weight != null) byDate.set(date, { date, weight: (raw as Loose).weight, note: (raw as Loose).note });
    }
    for (const [date, raw] of byDate) {
      const value = safeNumber(raw.weight ?? raw.value);
      if (value == null) continue;
      const id = legacyId("weight-v1", `${profile.id}-${date}`);
      const existingIndex = measurements.findIndex((item) => item.profileId === profile.id && item.date === date && item.type === "weight");
      const entity = stamped({ id, profileId: profile.id, date, type: "weight", value, unit: profile.unit === "lb" ? "lb" : "kg", note: String(raw.note || "") || undefined }, "reps-v1", `${profile.id}.weight.${date}`) as BodyMeasurement;
      if (existingIndex >= 0) measurements[existingIndex] = entity;
      else measurements.push(entity);
    }
  }

  const nutritionTargets: NutritionTarget[] = legacyProfiles.map((profile, index) => stamped({
    id: legacyId("nutrition-target", `${profile.id}-current`),
    profileId: profile.id,
    effectiveFrom: "2026-01-01",
    phase: String(profile.phase || profile.preset || "maintain"),
    targetWeight: safeNumber(profile.targetWeight),
    weekdays: Object.fromEntries(DAYS.map((day) => [day, {
      kcal: safeNumber(profile.macros?.[day]?.kcal) ?? DEFAULT_MACROS.kcal,
      protein: safeNumber(profile.macros?.[day]?.protein) ?? DEFAULT_MACROS.protein,
      carbs: safeNumber(profile.macros?.[day]?.carbs) ?? DEFAULT_MACROS.carbs,
      fat: safeNumber(profile.macros?.[day]?.fat) ?? DEFAULT_MACROS.fat
    }]))
  }, "reps-v1", `profiles[${index}].macros`) as NutritionTarget);

  const annotations: Annotation[] = [];
  for (const profile of legacyProfiles) {
    for (const [exerciseName, dates] of Object.entries(profile.exerciseAnnotations || {})) {
      const exercise = exerciseFor(exerciseName, {}, "reps-v1");
      for (const [date, raw] of Object.entries(dates as Loose)) {
        const value = raw as Loose;
        annotations.push(stamped({
          id: legacyId("annotation", `${profile.id}-${exercise.id}-${date}`),
          profileId: profile.id,
          type: value.type || "note",
          date,
          exerciseId: exercise.id,
          text: String(value.note || value.text || "Annotation")
        }, "reps-v1", `${profile.id}.exerciseAnnotations.${exerciseName}.${date}`) as Annotation);
      }
    }
  }

  const legacyFacts: LegacyFact[] = [];
  const stats = fitness.stats || {};
  if (input.fitnessOsV3) {
    legacyFacts.push(stamped({ id: "legacy-fitness-os-v3-raw", profileId: defaultProfileId, type: "raw", title: "Fitness OS v3 state (unaltered)", value: input.fitnessOsV3 }, "fitness-os-v3", "fitness-os-local-v3") as LegacyFact);
    issues.push({ level: "info", source: "fitness-os-local-v3", message: "The predecessor state was preserved verbatim so unsupported fields remain exportable." });
  }
  if (stats.profile) legacyFacts.push(stamped({ id: "legacy-profile-workbook", profileId: defaultProfileId, type: "profile", title: "Workbook profile", value: stats.profile }, "workbook", "stats.profile") as LegacyFact);
  (stats.programmingRules || []).forEach((rule: unknown, index: number) => legacyFacts.push(stamped({ id: `programming-rule-${index + 1}`, profileId: defaultProfileId, type: "programming_rule", title: `Programming rule ${index + 1}`, value: rule }, "workbook", `stats.programmingRules[${index}]`) as LegacyFact));
  (stats.lifetimePrs || []).forEach((pr: unknown, index: number) => legacyFacts.push(stamped({ id: `lifetime-pr-${index + 1}`, profileId: defaultProfileId, type: "lifetime_pr", title: String((pr as Loose).exercise || `Lifetime PR ${index + 1}`), value: pr }, "workbook", `stats.lifetimePrs[${index}]`) as LegacyFact));
  const rawRows: unknown[][] = Array.isArray(stats.rawRows) ? stats.rawRows : [];
  let section = "";
  rawRows.forEach((row, index) => {
    const first = String(row?.[0] ?? "").trim();
    if (!first) return;
    if (/^\*\*.*\*\*$/.test(first)) section = first.replace(/\*/g, "");
    if (/shoulder|elbow|forearm|thumb|\*\s+\*Rules:/i.test(first)) {
      annotations.push(stamped({
        id: `injury-rule-${index}`,
        profileId: defaultProfileId,
        type: "injury",
        text: first.replace(/\*/g, "").trim(),
        status: String(row?.[1] ?? "") || undefined
      }, "workbook", `stats.rawRows[${index}]`) as Annotation);
    } else if (/roadmap|strategy/i.test(section) && !/^Round$/.test(first)) {
      legacyFacts.push(stamped({ id: `roadmap-${index}`, profileId: defaultProfileId, type: "roadmap", title: first.replace(/\*/g, ""), value: row }, "workbook", `stats.rawRows[${index}]`) as LegacyFact);
    }
  });

  const sourceCounts = {
    workbookPlannedWorkouts: workbookSessions.length,
    workbookPerformedSessions: workbookSessions.filter((session) => Number(session.performedSetCount || 0) > 0).length,
    workbookSets: workbookSessions.reduce((total, session) => total + (session.entries || []).reduce((sum: number, entry: Loose) => sum + (entry.sets || []).filter((set: Loose) => set.reps != null || set.repsNumber != null || set.duration || set.note).length, 0), 0),
    repsV1Profiles: legacyProfiles.length,
    repsV1Sessions: legacyProfiles.reduce((sum, profile) => sum + (profile.loggedSessions || []).length, 0),
    repsV1FoodEntries: legacyProfiles.reduce((sum, profile) => sum + Object.values(profile.foodByDate || {}).reduce((inner: number, items) => inner + (items as unknown[]).length, 0), 0),
    workbookFoodItems: (fitness.nutrition?.foodItems || []).length,
    publicCatalogFoods: (input.foodCatalog || []).length,
    fitnessOsRawStates: input.fitnessOsV3 ? 1 : 0,
    workbookWeightEntries: (fitness.body?.daily || []).filter((row: Loose) => safeNumber(row.weight) != null).length,
    workbookNutritionDays: (fitness.body?.daily || []).filter((row: Loose) => safeNumber(row.kcal) != null || safeNumber(row.protein) != null).length
  };
  const destinationCounts = {
    profiles: profiles.length,
    exercises: exerciseMap.size,
    sessions: sessions.length,
    plannedWorkouts: plannedWorkouts.length,
    routines: routines.length,
    blocks: blocks.length,
    foods: foods.length,
    foodEntries: foodEntries.length,
    measurements: measurements.length,
    nutritionOverrides: nutritionOverrides.length,
    annotations: annotations.length,
    legacyFacts: legacyFacts.length
  };
  if (sourceCounts.workbookPlannedWorkouts !== destinationCounts.plannedWorkouts) {
    issues.push({ level: "error", source: "workbook", message: `Planned workout count changed from ${sourceCounts.workbookPlannedWorkouts} to ${destinationCounts.plannedWorkouts}.` });
  }
  if (sourceCounts.workbookPerformedSessions > destinationCounts.sessions) {
    issues.push({ level: "error", source: "workbook", message: `Performed workout count exceeds migrated session count.` });
  }
  if (foodSources.length !== destinationCounts.foods) {
    issues.push({ level: "error", source: "food catalog", message: `Food definition count changed from ${foodSources.length} to ${destinationCounts.foods}.` });
  }
  if (sourceCounts.fitnessOsRawStates && !legacyFacts.some((fact) => fact.id === "legacy-fitness-os-v3-raw")) {
    issues.push({ level: "error", source: "fitness-os-local-v3", message: "The predecessor raw state was not preserved." });
  }
  const duplicateFoodNames = Array.from(new Set(foods.map((food) => food.name.toLowerCase()).filter((name, index, all) => all.indexOf(name) !== index)));
  duplicateFoodNames.forEach((name) => issues.push({ level: "warning", source: "food catalog", message: `Duplicate food label preserved for review: ${name}` }));
  if (!legacyFacts.some((fact) => fact.type === "lifetime_pr")) issues.push({ level: "warning", source: "stats", message: "No lifetime PR facts were found." });

  const report: MigrationReport = {
    id: uid("migration"),
    createdAt: stamp,
    sources: [
      { name: "reps-app-state-v1", present: !!input.repsV1, checksum: input.repsV1 ? await hashText(JSON.stringify(input.repsV1)) : undefined },
      { name: "fitness-os-local-v3", present: !!input.fitnessOsV3, checksum: input.fitnessOsV3 ? await hashText(JSON.stringify(input.fitnessOsV3)) : undefined },
      { name: "PPL 2026 embedded export", present: !!input.fitnessData, checksum: input.fitnessData ? await hashText(JSON.stringify(input.fitnessData)) : undefined },
      { name: "public food catalog", present: !!input.foodCatalog?.length, checksum: input.foodCatalog?.length ? await hashText(JSON.stringify(input.foodCatalog)) : undefined }
    ],
    sourceCounts,
    destinationCounts,
    dateRanges: {
      sessions: dateRange(sessions.map((session) => session.actualDate)),
      plannedWorkouts: dateRange(plannedWorkouts.map((workout) => workout.date)),
      foodEntries: dateRange(foodEntries.map((entry) => entry.date)),
      measurements: dateRange(measurements.map((entry) => entry.date))
    },
    issues,
    unexplainedDrops: issues.filter((issue) => issue.level === "error").length
  };

  return {
    app: "reps",
    schemaVersion: 2,
    snapshotId: uid("snapshot"),
    createdAt: stamp,
    updatedAt: stamp,
    updatedBy: input.clientId,
    revision: 1,
    profiles,
    exercises: Array.from(exerciseMap.values()),
    sessions: sessions.sort((a, b) => a.actualDate.localeCompare(b.actualDate)),
    plannedWorkouts: plannedWorkouts.sort((a, b) => a.date.localeCompare(b.date)),
    routines,
    blocks,
    foods,
    foodEntries,
    savedMeals: [],
    measurements,
    nutritionTargets,
    nutritionOverrides,
    annotations,
    legacyFacts,
    equipmentProfiles: [stamped({ id: `equipment-${defaultProfileId}`, profileId: defaultProfileId, items: [], platesKg: [20, 15, 10, 5, 2.5, 1.25], platesLb: [45, 25, 10, 5, 2.5] }, "seed", "default") as any],
    tombstones: [],
    settings: {
      appearance: { theme: "system", density: "comfortable" },
      restSeconds: 120,
      workoutTimerEnabled: false,
      restTimerEnabled: false,
      preferredRpeMode: "rpe",
      mealView: "meal",
      activeProfileId
    },
    migrationReport: report
  };
}

export const emptySnapshot = async (clientId: string) => migrateLegacySources({ clientId, fitnessData: null, foodCatalog: null, repsV1: null, fitnessOsV3: null, legacyRoutine: null });
