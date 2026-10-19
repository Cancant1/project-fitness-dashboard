import { describe, expect, it } from "vitest";
import type { Program, SetRow, Session } from "../../data/types";
import { doneSession, loggedExercises } from "./planView";

const base = { user_id: "u", created_at: "2026-10-19T14:00:00Z", updated_at: "2026-10-19T14:00:00Z", deleted_at: null } as const;
let n = 0;
const set = (pos: number, no: number, kind: SetRow["kind"], load: number, reps: number, plan: Record<string, unknown>, extra: Partial<SetRow> = {}): SetRow => ({
  ...base, id: `s${n++}`, session_id: "sess", exercise_id: `e${pos}`, exercise_position: pos, set_no: no, kind, load,
  unit: "kg", load_kg: load, reps, duration_s: null, rpe: null, target_reps: null, target_load: null, completed: true,
  flags: [], note: null, exercise_as_logged: null, legacy_ref: { plan }, ...extra
} as SetRow);

describe("a done day shows what was logged", () => {
  const squat = { exerciseKey: "squat", role: "main", mainLift: "squat" };
  const rdl = { exerciseKey: "romanian_deadlift", role: "compound" };
  const tri = { exerciseKey: "cross_body_triceps_extension", role: "isolation" };
  const sets = [
    set(1, 1, "warmup", 20, 8, squat), set(1, 1, "working", 95, 5, squat), set(1, 2, "working", 95, 5, squat),
    set(1, 3, "working", 95, 5, squat), set(1, 4, "rep_out", 95, 12, squat),
    set(2, 1, "working", 80, 10, rdl), set(2, 2, "working", 80, 10, rdl), set(2, 3, "rep_out", 80, 15, rdl),
    set(3, 1, "failure", 20, 30, tri, { unit: "lb" }), set(3, 2, "failure", 20, 20, tri, { unit: "lb" }),
    set(3, 3, "failure", 20, 9, tri, { unit: "lb", completed: false }),
  ];

  it("loads and reps as logged, warm-ups and unticked sets left out", () => {
    expect(loggedExercises(sets, "sess")).toMatchObject([
      { name: "Squat", main: true, scheme: "5 · 5 · 5", repOut: 12, load: "95 kg" },
      { name: "RDL", main: false, scheme: "10 · 10", repOut: 15, load: "80 kg" },
      { name: "Cross-body cable triceps extension", main: false, scheme: "30 · 20", repOut: null, load: "20 lb" },
    ]);
  });

  it("mixed loads show load × reps per set", () => {
    const mixed = [set(2, 1, "working", 80, 10, rdl), set(2, 2, "working", 85, 8, rdl)];
    expect(loggedExercises(mixed, "sess")[0]).toMatchObject({ scheme: "80×10 · 85×8", load: "85 kg" });
  });

  it("finds the completed session for a plan week and day", () => {
    const program = { id: "p1" } as Program;
    const s = (id: string, status: string, week: number, dayKey: string, ended: string) =>
      ({ ...base, id, status, program_id: "p1", program_week_no: week, ended_at: ended, legacy_ref: { plan: { dayKey } } }) as unknown as Session;
    const all = [s("a", "completed", 1, "lower_a", "2026-10-19T16:00:00Z"), s("b", "in_progress", 1, "upper_a", "x"), s("c", "completed", 0, "lower_a", "2026-10-12T16:00:00Z")];
    expect(doneSession(all, program, 1, "lower_a")?.id).toBe("a");
    expect(doneSession(all, program, 1, "upper_a")).toBeUndefined();
    expect(doneSession(all, undefined, 1, "lower_a")).toBeUndefined();
  });
});
