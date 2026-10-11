// @vitest-environment node
import "fake-indexeddb/auto";
import { LocalStore } from "../data/local";
import type { Exercise, Program } from "../data/types";
import { prescribeDay } from "./engine";
import { PLAN, ensurePlanExercises } from "./bridge";
import { addExerciseToSession, finishWorkout, maxUpdates, nextExercisePosition, planRef, startFreeWorkout, startWorkout } from "./workout";

let n = 0;
async function store(): Promise<LocalStore> {
  const local = new LocalStore(`workout-test-${Date.now()}-${n++}`);
  await local.open();
  return local;
}

async function exercise(local: LocalStore, patch: Partial<Exercise>): Promise<Exercise> {
  const [e] = await local.save("exercises", {
    name: "Test", aliases: [], equipment: null, default_unit: "kg", kind: "isolation", muscle_direct: null,
    muscle_indirect: [], available: true, cues: null, archived: false, legacy_ref: {}, ...patch
  });
  return e!;
}

describe("startFreeWorkout", () => {
  it("creates an in-progress session titled Workout with no plan and no sets", async () => {
    const local = await store();
    const id = await startFreeWorkout(local, "2026-10-11");
    const s = local.get("sessions", id)!;
    expect(s).toMatchObject({ date: "2026-10-11", title: "Workout", status: "in_progress", program_id: null, program_week_no: null, date_confidence: "exact", source: "app" });
    expect(s.started_at).toBeTruthy();
    expect(local.all("sets").filter((x) => x.session_id === id)).toHaveLength(0);
  });
});

describe("addExerciseToSession", () => {
  it("adds 3 empty working sets in the exercise's unit, without a plan ref", async () => {
    const local = await store();
    const id = await startFreeWorkout(local, "2026-10-11");
    const ex = await exercise(local, { name: "Lat Pulldown", default_unit: "lb" });
    const rows = await addExerciseToSession(local, id, ex, 1);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.set_no)).toEqual([1, 2, 3]);
    for (const r of rows) {
      expect(r).toMatchObject({ session_id: id, exercise_id: ex.id, exercise_position: 1, kind: "working", unit: "lb", load: null, load_kg: null, reps: null, completed: false, exercise_as_logged: "Lat Pulldown" });
      expect(planRef(r)).toBeUndefined();
    }
  });

  it("uses one timed set for exercises logged in minutes", async () => {
    const local = await store();
    const id = await startFreeWorkout(local, "2026-10-11");
    const ex = await exercise(local, { name: "Boxing PT", default_unit: "min", kind: "conditioning" });
    const rows = await addExerciseToSession(local, id, ex, 2, 3);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "timed", unit: "min", load: null, load_kg: null, exercise_position: 2 });
  });

  it("starts bodyweight sets at 0 added load and honours the set count", async () => {
    const local = await store();
    const id = await startFreeWorkout(local, "2026-10-11");
    const ex = await exercise(local, { name: "Hanging Knee Raise", default_unit: "bodyweight" });
    const rows = await addExerciseToSession(local, id, ex, 1, 2);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.load === 0 && r.load_kg === 0 && r.unit === "bodyweight")).toBe(true);
  });

  it("appends after the last block of that session only", async () => {
    const local = await store();
    const a = await startFreeWorkout(local, "2026-10-11");
    const b = await startFreeWorkout(local, "2026-10-12");
    const ex = await exercise(local, { name: "Cable Curl", default_unit: "lb" });
    expect(nextExercisePosition(local.all("sets"), a)).toBe(1);
    await addExerciseToSession(local, a, ex, nextExercisePosition(local.all("sets"), a));
    await addExerciseToSession(local, b, ex, 5);
    expect(nextExercisePosition(local.all("sets"), a)).toBe(2);
    expect(nextExercisePosition(local.all("sets"), b)).toBe(6);
  });

  it("free sets never produce training-max updates", async () => {
    const local = await store();
    const id = await startFreeWorkout(local, "2026-10-11");
    const ex = await exercise(local, { name: "Squat", default_unit: "kg", kind: "main" });
    const rows = await addExerciseToSession(local, id, ex, 1);
    const done = rows.map((r) => ({ ...r, load: 100, reps: 5, completed: true }));
    const updates = maxUpdates(local.get("sessions", id)!, done, new Map([["squat", ex.id]]), [], { barKg: 20, platesKg: [20], dumbbellRackKg: [10], cableStepLb: 5, cableStepKg: 2.5, beltStepKg: 2.5, barbellStepKg: 2.5 });
    expect(updates).toEqual([]);
  });
});

describe("startWorkout (still works)", () => {
  it("writes every prescribed set with a plan ref", async () => {
    const local = await store();
    const ids = await ensurePlanExercises(local);
    const [program] = await local.save("programs", {
      name: "Strength Return Plan", start_date: "2026-10-12", weeks: 20, status: "active", rules: { key: "strength-return-2026" }, goals: [], notes: null
    });
    const day = prescribeDay(PLAN, 1, "lower_a", { trainingMaxes: { squat: 140, deadlift: 200 }, currentLoads: {} });
    const id = await startWorkout(local, program as Program, day, ids, "2026-10-19");
    const sets = local.all("sets").filter((s) => s.session_id === id);
    expect(sets).toHaveLength(day.exercises.reduce((k, e) => k + e.sets.length, 0));
    expect(sets.every((s) => planRef(s) !== undefined)).toBe(true);
    expect(local.get("sessions", id)).toMatchObject({ program_id: program!.id, program_week_no: 1, title: "Lower A" });
  });
});

describe("provisional training max (§6.2)", () => {
  async function calibrationSquat(reps: number) {
    const local = await store();
    const ids = await ensurePlanExercises(local);
    const [program] = await local.save("programs", {
      name: "Strength Return Plan", start_date: "2026-10-12", weeks: 20, status: "active", rules: { key: "strength-return-2026" }, goals: [], notes: null
    });
    const day = prescribeDay(PLAN, 0, "lower_a", { trainingMaxes: {}, currentLoads: {} });
    const id = await startWorkout(local, program as Program, day, ids, "2026-10-12");
    const sets = local.all("sets").filter((s) => s.session_id === id).map((s) => ({ ...s, completed: true, reps: s.kind === "rep_out" ? reps : s.reps }));
    return { local, ids, program: program as Program, session: local.get("sessions", id)!, sets };
  }
  const EQ = { barKg: 20, platesKg: [20, 10, 5, 2.5, 1.25], dumbbellRackKg: [20, 22.5, 25], cableStepLb: 5, cableStepKg: 2.5, beltStepKg: 2.5, barbellStepKg: 2.5 };

  it("100 × 15 in week 0 → TM 140 from 12 reps, provisional, and the note reaches the training_maxes row", async () => {
    const { local, ids, program, session, sets } = await calibrationSquat(15);
    const updates = maxUpdates(session, sets, ids, [], EQ);
    expect(updates).toEqual([expect.objectContaining({ lift: "squat", to: 140, reason: "calibration", provisional: true, note: "provisional (>12 reps)" })]);
    await finishWorkout(local, session, sets, updates, ids, program);
    expect(local.all("training_maxes")).toEqual([expect.objectContaining({ value_kg: 140, reason: "calibration", note: "provisional (>12 reps)" })]);
  });

  it("12 clean reps or fewer is a normal calibration", async () => {
    const { ids, session, sets } = await calibrationSquat(12);
    const [u] = maxUpdates(session, sets, ids, [], EQ);
    expect(u).toMatchObject({ to: 140, reason: "calibration" });
    expect(u!.provisional).toBeUndefined();
  });
});
