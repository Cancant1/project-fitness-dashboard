import { describe, expect, it } from "vitest";
import { isCompletedSession, sessionSetCount, sessionVolume } from "./utils";
import type { SetResult, WorkoutSession } from "./types";

const stamp = "2026-09-06T12:00:00Z";
const set = (patch: Partial<SetResult>): SetResult => ({ id: "set", createdAt: stamp, updatedAt: stamp, source: "manual", index: 1, type: "working", unit: "kg", load: 10, reps: 5, completed: true, ...patch });
function session(): WorkoutSession {
  return { id: "session", profileId: "profile", createdAt: stamp, updatedAt: stamp, source: "manual", title: "Training", actualDate: "2026-09-06", status: "completed", performances: [{ id: "performance", createdAt: stamp, updatedAt: stamp, source: "manual", exerciseId: "exercise", exerciseNameSnapshot: "Exercise", order: 0, movement: "Push", sets: [set({}), set({ unit: "lb", load: 100, reps: 1 }), set({ completed: false }), set({ deletedAt: stamp }), set({ unit: "min" }), set({ unit: "bodyweight" })] }] };
}
describe("training totals", () => {
  it("counts completed non-deleted sets and normalizes external load to kg", () => {
    const workout = session();
    expect(sessionSetCount(workout)).toBe(4);
    expect(sessionVolume(workout)).toBeCloseTo(95.359237);
  });
  it("excludes deleted sessions, deleted performances and skipped performances", () => {
    const workout = session();
    workout.performances[0].skipped = true;
    expect(sessionVolume(workout)).toBe(0);
    expect(sessionSetCount(workout)).toBe(0);
    workout.performances[0].skipped = false;
    workout.performances[0].deletedAt = stamp;
    expect(sessionVolume(workout)).toBe(0);
    workout.deletedAt = stamp;
    expect(isCompletedSession(workout)).toBe(false);
    expect(sessionSetCount(workout)).toBe(0);
  });
  it("excludes nonfinite and negative external loads", () => {
    const workout = session();
    workout.performances[0].sets = [set({ load: NaN }), set({ load: -2 }), set({ reps: Infinity })];
    expect(sessionVolume(workout)).toBe(0);
  });
});
