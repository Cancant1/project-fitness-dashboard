import type {
  Exercise,
  ExercisePerformance,
  PlannedExercise,
  PlannedWorkout,
  RepsSnapshot,
  RoutineDay,
  SetResult,
  Unit,
  WorkoutSession
} from "./types";
import { movementFor, nowIso, slug, todayIso, uid, unitFor } from "./utils";

const stampedSet = (index: number, unit: Unit, load?: number, targetReps?: string, targetRir?: number): SetResult => {
  const stamp = nowIso();
  return {
    id: uid("set"),
    createdAt: stamp,
    updatedAt: stamp,
    source: "manual",
    index,
    type: "working",
    load: load ?? null,
    unit,
    reps: null,
    rpe: null,
    rir: targetRir ?? null,
    completed: false,
    prescription: { targetReps, targetLoad: load, targetUnit: unit, targetRir }
  };
};

export function performanceFromPlanned(item: PlannedExercise, order: number, targetRir?: number): ExercisePerformance {
  const stamp = nowIso();
  return {
    id: uid("performance"),
    createdAt: stamp,
    updatedAt: stamp,
    source: "manual",
    exerciseId: item.exerciseId,
    exerciseNameSnapshot: item.nameSnapshot,
    order,
    movement: movementFor(item.nameSnapshot),
    prescription: { targetSets: item.targetSets, targetReps: item.targetReps, note: item.note },
    sets: Array.from({ length: item.targetSets || 1 }, (_, index) => stampedSet(index + 1, item.unit, item.targetLoad, item.targetReps, targetRir)),
    note: item.note
  };
}

export function createSessionFromPlan(profileId: string, plan?: PlannedWorkout, title = "Empty workout", actualDate?: string): WorkoutSession {
  const stamp = nowIso();
  return {
    id: uid("session"),
    createdAt: stamp,
    updatedAt: stamp,
    source: "manual",
    profileId,
    title: plan?.title || title,
    split: plan?.split,
    plannedWorkoutId: plan?.id,
    plannedDate: plan?.date,
    actualDate: actualDate || plan?.date || todayIso(),
    status: "draft",
    startedAt: stamp,
    notes: "",
    blockId: plan?.blockId,
    programInstanceId: plan?.programInstanceId,
    performances: (plan?.exercises || []).sort((a, b) => a.order - b.order).map((item, index) => performanceFromPlanned(item, index))
  };
}

export function discardWorkoutDraft(snapshot: RepsSnapshot, sessionId: string, deletedAt = nowIso()) {
  const session = snapshot.sessions.find((item) => item.id === sessionId && !item.deletedAt);
  if (!session || (session.status !== "draft" && session.status !== "inProgress")) return false;
  session.status = "discarded";
  session.deletedAt = deletedAt;
  session.updatedAt = deletedAt;
  const tombstone = snapshot.tombstones.find((item) => item.entityType === "session" && item.entityId === sessionId);
  if (tombstone) {
    tombstone.deletedAt = deletedAt;
    tombstone.revision = `${snapshot.revision + 1}`;
  } else {
    snapshot.tombstones.push({ entityType: "session", entityId: sessionId, deletedAt, revision: `${snapshot.revision + 1}` });
  }
  return true;
}

export function plannedFromRoutineDay(profileId: string, routineId: string, day: RoutineDay, date = todayIso()): PlannedWorkout {
  const stamp = nowIso();
  return {
    id: uid("planned"),
    createdAt: stamp,
    updatedAt: stamp,
    source: "manual",
    profileId,
    routineId,
    date,
    title: day.title,
    split: day.title,
    status: "planned",
    exercises: day.exercises.map((item, order) => ({ ...item, id: uid("planned-exercise"), order }))
  };
}

const RETURN_BLOCK_KEY = "mario-return-2026-08-26";
const returnWorkouts = {
  A: {
    title: "Return A",
    exercises: [
      ["Squat", 2, "6–8", "kg", 85, "Back squat · start 80–90 kg"],
      ["Neutral DB bench press", 2, "8–10", "kg", 22.5, "Per dumbbell"],
      ["Seated cable row", 2, "8–12", "kg", 45, "Torso fixed"],
      ["Romanian deadlift", 2, "8–10", "kg", 75, "Straps are fine"],
      ["Cable lateral raise", 1, "12–15", "lb", 15, "Per side · smooth reps"],
      ["Hammer curl", 1, "10–12", "kg", 12, "Per dumbbell"],
      ["Cable pushdown bar", 1, "10–12", "lb", 75, "Soft lockout"]
    ]
  },
  B: {
    title: "Return B",
    exercises: [
      ["Heel elevated squat", 2, "8–10", "kg", 50, "Controlled quad work"],
      ["Incline dumbell press", 2, "8–10", "kg", 22.5, "Per dumbbell"],
      ["Lat pulldown", 2, "8–12", "lb", 90, "Controlled stretch"],
      ["Lying DB leg curl", 2, "10–15", "kg", 20, "Smooth tempo"],
      ["Cable rear delt fly", 1, "12–20", "lb", 20, "Rear delt focus"],
      ["Bayesian Curl", 1, "10–15", "lb", 35, "Keep shoulder still"],
      ["Overhead cable ext", 1, "10–15", "lb", 45, "No hard lockout"]
    ]
  }
} as const;

const returnWeeks = [
  [1, "2026-08-26", "2026-08-29", "Reacclimate", 4],
  [2, "2026-09-02", "2026-09-05", "Reacclimate", 4],
  [3, "2026-09-09", "2026-09-12", "Build rhythm", 3],
  [4, "2026-09-16", "2026-09-19", "Build rhythm", 3],
  [5, "2026-09-23", "2026-09-26", "Build capacity", 2],
  [6, "2026-09-30", "2026-10-03", "Build capacity", 2],
  [7, "2026-10-14", "2026-10-17", "Reload after holiday", 3],
  [8, "2026-10-21", "2026-10-24", "Set the baseline", 2]
] as const;

export function installReturnProgram(snapshot: RepsSnapshot, profileId: string) {
  if (snapshot.routines.some((routine) => routine.returnBlockKey === RETURN_BLOCK_KEY && !routine.deletedAt)) return;
  const stamp = nowIso();
  const exerciseFor = (name: string, unit: string) => {
    let exercise = snapshot.exercises.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!exercise) {
      exercise = {
        id: `exercise-${slug(name)}`,
        createdAt: stamp,
        updatedAt: stamp,
        source: "seed",
        sourceRef: `return:${name}`,
        name,
        aliases: [],
        movement: movementFor(name),
        muscles: [],
        equipment: [],
        defaultUnit: unitFor(unit, name),
        compound: /squat|press|row|deadlift|pulldown/i.test(name),
        cues: [],
        substitutions: [],
        archived: false
      } satisfies Exercise;
      snapshot.exercises.push(exercise);
    }
    return exercise;
  };
  const routineId = "routine-return-8w-2026";
  const routineDays = (["A", "B"] as const).map((key) => ({
    id: `return-day-${key.toLowerCase()}`,
    day: key === "A" ? "Wed" : "Sat",
    title: returnWorkouts[key].title,
    focus: key === "A" ? "Squat · horizontal push/pull · hinge · shoulders · arms" : "Quad variation · incline push · vertical pull · hamstrings · rear delts · arms",
    exercises: returnWorkouts[key].exercises.map((raw, order) => {
      const [name, sets, reps, unit, load, note] = raw;
      const exercise = exerciseFor(name, unit);
      return { id: `return-${key}-${slug(name)}`, exerciseId: exercise.id, nameSnapshot: exercise.name, order, targetSets: sets, targetReps: reps, unit: unitFor(unit, name), targetLoad: load, note };
    })
  }));
  snapshot.routines.push({
    id: routineId,
    createdAt: stamp,
    updatedAt: stamp,
    source: "seed",
    sourceRef: RETURN_BLOCK_KEY,
    profileId,
    name: "8-Week Return · Wed + Sat",
    description: "Two symptom-aware sessions per week with a protected holiday gap.",
    days: routineDays,
    active: false,
    returnBlockKey: RETURN_BLOCK_KEY
  });
  snapshot.blocks.push({
    id: "block-return-8w-2026",
    createdAt: stamp,
    updatedAt: stamp,
    source: "seed",
    sourceRef: RETURN_BLOCK_KEY,
    profileId,
    name: "8-Week Return",
    phase: "Rebuild",
    startDate: "2026-08-26",
    endDate: "2026-10-24",
    weeks: 8,
    goal: "Rebuild training tolerance without symptom escalation",
    notes: "Holiday protected: 4–13 October. Use symptom-free technique and retain prescribed RIR.",
    status: "active"
  });
  for (const [week, wed, sat, phase, rir] of returnWeeks) {
    for (const [key, date] of [["A", wed], ["B", sat]] as const) {
      const workout = returnWorkouts[key];
      const day = routineDays[key === "A" ? 0 : 1];
      snapshot.plannedWorkouts.push({
        id: `return-${date}`,
        createdAt: stamp,
        updatedAt: stamp,
        source: "seed",
        sourceRef: `${RETURN_BLOCK_KEY}:${date}`,
        profileId,
        routineId,
        blockId: "block-return-8w-2026",
        date,
        title: workout.title,
        split: workout.title,
        status: "planned",
        note: `Week ${week} · ${phase} · ${rir} RIR${week === 7 ? " · return after holiday" : ""}`,
        exercises: day.exercises.map((item) => ({ ...item, id: `return-${date}-${slug(item.nameSnapshot)}`, targetSets: week >= 5 && week !== 7 && snapshot.exercises.find((exercise) => exercise.id === item.exerciseId)?.compound ? 3 : item.targetSets, note: `${item.note || ""} · ${rir} RIR` }))
      });
    }
  }
}
