import { describe, expect, it } from "vitest";
import { migrateLegacySources } from "../data/migrate";
import { createSessionFromPlan, discardWorkoutDraft, installReturnProgram } from "./factories";

describe("return program installer", () => {
  it("is explicit, idempotent, and creates the protected schedule", async () => {
    const snapshot = await migrateLegacySources({ clientId: "test" });
    const before = snapshot.plannedWorkouts.length;
    installReturnProgram(snapshot, snapshot.profiles[0].id);
    installReturnProgram(snapshot, snapshot.profiles[0].id);
    const returnPlans = snapshot.plannedWorkouts.filter((item) => item.sourceRef?.startsWith("mario-return-2026-08-26"));
    expect(snapshot.plannedWorkouts.length - before).toBe(16);
    expect(returnPlans).toHaveLength(16);
    expect(returnPlans.some((item) => item.date >= "2026-10-04" && item.date <= "2026-10-13")).toBe(false);
    expect(snapshot.routines.filter((item) => item.returnBlockKey)).toHaveLength(1);
  });
});

describe("workout draft lifecycle", () => {
  it("uses an explicitly selected historical date without changing the plan", async () => {
    const snapshot = await migrateLegacySources({ clientId: "test" });
    const plan = snapshot.plannedWorkouts[0];
    const session = createSessionFromPlan(snapshot.profiles[0].id, plan, undefined, "2026-01-15");
    expect(session.actualDate).toBe("2026-01-15");
    expect(session.plannedDate).toBe(plan?.date);
    expect(session.status).toBe("draft");
  });

  it("discards a draft once and leaves completed history untouched", async () => {
    const snapshot = await migrateLegacySources({ clientId: "test" });
    const session = createSessionFromPlan(snapshot.profiles[0].id, undefined, "Yesterday");
    snapshot.sessions.push(session);
    expect(discardWorkoutDraft(snapshot, session.id, "2026-08-27T12:00:00.000Z")).toBe(true);
    expect(discardWorkoutDraft(snapshot, session.id, "2026-08-27T12:01:00.000Z")).toBe(false);
    expect(session.status).toBe("discarded");
    expect(session.deletedAt).toBe("2026-08-27T12:00:00.000Z");
    expect(snapshot.tombstones.filter((item) => item.entityType === "session" && item.entityId === session.id)).toHaveLength(1);
    const completed = snapshot.sessions.find((item) => item.status === "completed");
    if (completed) expect(discardWorkoutDraft(snapshot, completed.id)).toBe(false);
  });
});
