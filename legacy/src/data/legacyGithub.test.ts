import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSyncConfig, fetchRemote, previewLegacyGithub } from "./github";
const config = { ...defaultSyncConfig(), enabled: true, owner: "test", repo: "private-data", token: "test-only" };
const file = (value: unknown) => new Response(JSON.stringify({ sha: "original-sha", content: btoa(JSON.stringify(value)) }), { status: 200 });
afterEach(() => vi.unstubAllGlobals());

describe("GitHub legacy preview", () => {
  it("only reads the original file, unwraps it, and preserves the raw source", async () => {
    const state = { activeProfileId: "local", profiles: [{ id: "local", name: "Mario" }, { id: "connie", name: "Connie" }], futureField: "preserve" };
    const request = vi.fn().mockResolvedValue(file({ app: "reps", schemaVersion: 1, state }));
    vi.stubGlobal("fetch", request);
    const preview = await previewLegacyGithub(config, "state/reps-app-state.json");
    expect(preview.profiles.map((item) => item.name)).toEqual(["Mario", "Connie"]);
    expect(preview.legacyFacts.at(-1)!.value).toMatchObject({ state });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toContain("/contents/state/reps-app-state.json");
    expect(request.mock.calls[0][1].method).toBeUndefined();
  });
  it("rejects ambiguous or non-profile files and unsafe source/destination overlap", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(file({ profiles: [] })));
    await expect(previewLegacyGithub(config, "state/reps-app-state.json")).rejects.toThrow("not an original");
    await expect(previewLegacyGithub(config, config.path)).rejects.toThrow("original file will not be overwritten");
  });
  it("distinguishes missing repository access from a missing state file", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    await expect(fetchRemote(config)).rejects.toThrow("Cannot access the repository");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("", { status: 404 })).mockResolvedValueOnce(new Response("{}", { status: 200 })));
    await expect(fetchRemote(config)).resolves.toBeNull();
  });
});
