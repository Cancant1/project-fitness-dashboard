import { describe, expect, it } from "vitest";
import { migrateLegacySources } from "./migrate";
import { addRecoveredRecords } from "./recover";
import { mergeSnapshots } from "./github";

export const legacyFixture = {
  activeProfileId: "local",
  profiles: [
    { id: "local", name: "Mario", loggedSessions: [{ id: "mario-session", date: "2026-06-03", status: "performed", split: "Pull", entries: [{ exercise: "Row", sets: [{ set: 1, weight: 30, reps: 8 }] }] }] },
    { id: "connie", name: "Connie", loggedSessions: [], foodByDate: { "2026-06-03": [{ id: "food", name: "Lunch", kcal: 400, protein: 20 }] } }
  ]
};

describe("original profile recovery", () => {
  it("restores real profile names over the pristine default and retains both users", async () => {
    const current = await migrateLegacySources({ clientId: "phone" });
    const old = await migrateLegacySources({ repsV1: legacyFixture, clientId: "phone" });
    const recovered = addRecoveredRecords(current, old);
    expect(recovered.profiles.map((item) => item.name)).toEqual(["Mario", "Connie"]);
    expect(recovered.sessions).toHaveLength(1);
    expect(recovered.sessions[0].profileId).toBe("local");
    expect(recovered.foodEntries[0].profileId).toBe("connie");
    expect(current.profiles[0].name).toBe("Profile");
    expect(addRecoveredRecords(recovered, old)).toEqual(recovered);
  });

  it("preserves current edits and tombstones on repeated recovery", async () => {
    const old = await migrateLegacySources({ repsV1: legacyFixture, clientId: "phone" });
    const current = structuredClone(old);
    current.sessions[0].notes = "Newer note";
    current.profiles[0].name = "My chosen name";
    current.tombstones.push({ entityType: "foodEntry", entityId: old.foodEntries[0].id, deletedAt: new Date().toISOString(), revision: "2" });
    current.foodEntries = [];
    const recovered = addRecoveredRecords(current, old);
    expect(recovered.sessions[0].notes).toBe("Newer note");
    expect(recovered.profiles[0].name).toBe("My chosen name");
    expect(recovered.foodEntries).toHaveLength(0);
    expect(recovered.tombstones).toEqual(current.tombstones);
  });

  it("does not let a newer empty phone profile rename Mario during sync", async () => {
    const real = await migrateLegacySources({ repsV1: legacyFixture, clientId: "desktop" });
    const phone = await migrateLegacySources({ clientId: "phone" });
    phone.profiles[0].createdAt = phone.profiles[0].updatedAt = "2099-01-01T00:00:00Z";
    expect(mergeSnapshots(real, phone, "sync").profiles.find((item) => item.id === "local")!.name).toBe("Mario");
    expect(mergeSnapshots(phone, real, "sync").profiles.find((item) => item.id === "local")!.name).toBe("Mario");
  });
});
