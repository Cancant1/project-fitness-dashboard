import { describe, expect, it } from "vitest";
import { migrateLegacySources } from "../data/migrate";
import { installReturnProgram } from "./factories";

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
