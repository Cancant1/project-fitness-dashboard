import { beforeEach, describe, expect, it } from "vitest";
import { listBackups, loadOrInitializeSnapshot } from "./db";

describe("database initialization", () => {
  beforeEach(async () => {
    localStorage.clear();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("reps-canonical-v2");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    window.FITNESS_DATA = {};
    window.REPS_FOOD_CATALOG = [];
    window.PLANNED_ROUTINE = [];
  });

  it("coalesces Strict Mode initialization into one migration and backup", async () => {
    const [first, second] = await Promise.all([
      loadOrInitializeSnapshot("strict-mode-test"),
      loadOrInitializeSnapshot("strict-mode-test")
    ]);
    expect(first.snapshotId).toBe(second.snapshotId);
    expect(await listBackups()).toHaveLength(1);
  });
});
