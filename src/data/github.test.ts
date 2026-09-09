import { describe, expect, it } from "vitest";
import { migrateLegacySources } from "./migrate";
import { mergeSnapshots } from "./github";

describe("GitHub entity merge", () => {
  it("keeps independent additions and the newest edit", async () => {
    const local = await migrateLegacySources({ clientId: "local" });
    const remote = structuredClone(local);
    const stamp = new Date(Date.now() + 1000).toISOString();
    local.profiles[0].name = "Local name";
    local.profiles[0].updatedAt = new Date(0).toISOString();
    remote.profiles[0].name = "Remote name";
    remote.profiles[0].updatedAt = stamp;
    local.annotations.push({ id: "local-note", createdAt: stamp, updatedAt: stamp, profileId: local.profiles[0].id, source: "manual", type: "note", text: "Local" });
    remote.annotations.push({ id: "remote-note", createdAt: stamp, updatedAt: stamp, profileId: local.profiles[0].id, source: "manual", type: "note", text: "Remote" });
    const merged = mergeSnapshots(local, remote, "merge-device");
    expect(merged.profiles[0].name).toBe("Remote name");
    expect(merged.annotations.map((item) => item.id)).toEqual(expect.arrayContaining(["local-note", "remote-note"]));
    expect(merged.revision).toBeGreaterThan(local.revision);
  });

  it("merges independently changed sets inside the same workout", async () => {
    const base = await migrateLegacySources({ clientId: "base" });
    const stamp = new Date().toISOString();
    base.sessions.push({
      id: "shared-session", createdAt: stamp, updatedAt: stamp, source: "manual", profileId: base.profiles[0].id, title: "Shared", actualDate: "2026-08-26", status: "inProgress",
      performances: [{ id: "shared-performance", createdAt: stamp, updatedAt: stamp, source: "manual", exerciseId: "squat", exerciseNameSnapshot: "Squat", order: 0, movement: "Legs", sets: [{ id: "base-set", createdAt: stamp, updatedAt: stamp, source: "manual", index: 1, type: "working", unit: "kg", load: 100, reps: 5, completed: true }] }]
    });
    const local = structuredClone(base);
    const remote = structuredClone(base);
    const localStamp = new Date(Date.now() + 1000).toISOString();
    const remoteStamp = new Date(Date.now() + 2000).toISOString();
    local.sessions[0].updatedAt = localStamp;
    local.sessions[0].performances[0].sets.push({ id: "local-set", createdAt: localStamp, updatedAt: localStamp, source: "manual", index: 2, type: "working", unit: "kg", load: 100, reps: 5, completed: true });
    remote.sessions[0].updatedAt = remoteStamp;
    remote.sessions[0].performances[0].sets[0].reps = 6;
    remote.sessions[0].performances[0].sets[0].updatedAt = remoteStamp;
    const merged = mergeSnapshots(local, remote, "merge-device");
    const sets = merged.sessions.find((item) => item.id === "shared-session")!.performances[0].sets;
    expect(sets.map((item) => item.id)).toEqual(expect.arrayContaining(["base-set", "local-set"]));
    expect(sets.find((item) => item.id === "base-set")?.reps).toBe(6);
    local.tombstones.push({ entityType: "set", entityId: "base-set", deletedAt: remoteStamp, revision: "2" });
    local.sessions[0].performances[0].sets = local.sessions[0].performances[0].sets.filter((item) => item.id !== "base-set");
    const afterRemoval = mergeSnapshots(local, remote, "merge-device");
    expect(afterRemoval.sessions[0].performances[0].sets.map((item) => item.id)).toEqual(["local-set"]);
  });
});
