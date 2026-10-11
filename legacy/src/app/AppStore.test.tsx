import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useAppStore } from "./AppStore";
import * as db from "../data/db";
import * as github from "../data/github";
import type { RepsSnapshot } from "../domain/types";

vi.mock("../data/github", async (original) => ({
  ...await original<typeof import("../data/github")>(),
  fetchRemote: vi.fn(),
  putRemote: vi.fn()
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let base: RepsSnapshot;
beforeEach(async () => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.mocked(github.fetchRemote).mockReset();
  vi.mocked(github.putRemote).mockReset();
  base ??= structuredClone(await db.loadOrInitializeSnapshot("test-device"));
  const database = await db.openRepsDatabase();
  await database.clear("backups");
  await db.saveSnapshot(base, "Test reset");
  await db.acknowledgeSynced(base);
  github.saveSyncConfig({ ...github.defaultSyncConfig(), clientId: "test-device", enabled: true, owner: "test", repo: "test", token: "test-only", autoSync: false });
});
afterEach(cleanup);

async function openStore() {
  const hook = renderHook(useAppStore, { wrapper: AppStoreProvider });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}
const addNote = (state: RepsSnapshot, id: string) => state.annotations.push({ id, profileId: state.profiles[0].id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: "manual", type: "note", text: id });

describe("local saving during GitHub sync", () => {
  it("keeps edits saved during a delayed pull and leaves the merge pending", async () => {
    const remote = structuredClone(base);
    addNote(remote, "remote-note");
    const request = deferred<Awaited<ReturnType<typeof github.fetchRemote>>>();
    vi.mocked(github.fetchRemote).mockReturnValue(request.promise);
    const { result } = await openStore();
    let pull!: Promise<void>;
    act(() => { pull = result.current.pullGithub(); });
    await act(async () => { await result.current.mutate("Local note", (state) => addNote(state, "during-pull")); });
    await act(async () => { request.resolve({ snapshot: remote, sha: "remote-sha" }); await pull; });
    expect(result.current.snapshot!.annotations.map((note) => note.id)).toEqual(expect.arrayContaining(["remote-note", "during-pull"]));
    expect(result.current.syncMeta.dirty).toBe(true);
    expect(await db.hasPendingSync()).toBe(true);
    expect(await db.listBackups()).toHaveLength(1);
  });

  it("does not overwrite or acknowledge edits made while an upload is in flight", async () => {
    vi.mocked(github.fetchRemote).mockResolvedValue({ snapshot: base, sha: "old-sha" });
    const upload = deferred<string>();
    vi.mocked(github.putRemote).mockReturnValue(upload.promise);
    const { result } = await openStore();
    let push!: Promise<void>;
    act(() => { push = result.current.pushGithub(); });
    await waitFor(() => expect(github.putRemote).toHaveBeenCalledOnce());
    await act(async () => { await result.current.mutate("New note", (state) => addNote(state, "during-upload")); });
    await act(async () => { upload.resolve("new-sha"); await push; });
    expect(result.current.snapshot!.annotations.some((note) => note.id === "during-upload")).toBe(true);
    expect(result.current.syncMeta.dirty).toBe(true);
    expect(await db.hasPendingSync()).toBe(true);
    const stored = await (await db.openRepsDatabase()).get("snapshots", "current");
    expect(stored!.annotations.some((note) => note.id === "during-upload")).toBe(true);
    expect(await db.listBackups()).toHaveLength(1);
  });

  it("marks an uploaded unchanged revision clean and coalesces overlapping sync requests", async () => {
    const request = deferred<Awaited<ReturnType<typeof github.fetchRemote>>>();
    vi.mocked(github.fetchRemote).mockReturnValue(request.promise);
    vi.mocked(github.putRemote).mockResolvedValue("new-sha");
    const { result } = await openStore();
    await act(async () => {
      const first = result.current.pushGithub();
      await result.current.pullGithub();
      request.resolve(null);
      await first;
    });
    expect(github.fetchRemote).toHaveBeenCalledOnce();
    expect(result.current.syncMeta.dirty).toBe(false);
    expect(await db.hasPendingSync()).toBe(false);
  });

  it("propagates write failure without publishing unsaved state and accepts a retry", async () => {
    const { result } = await openStore();
    vi.spyOn(db, "saveSnapshot").mockRejectedValueOnce(new Error("Storage full"));
    await act(async () => {
      await expect(result.current.mutate("Fail", (state) => addNote(state, "unsaved"))).rejects.toThrow("Storage full");
    });
    expect(result.current.snapshot!.annotations.some((note) => note.id === "unsaved")).toBe(false);
    expect(result.current.saveError).toContain("could not be saved");
    expect(await db.hasPendingSync()).toBe(false);
    await act(async () => { await result.current.mutate("Retry", (state) => addNote(state, "retry")); });
    expect(result.current.saveError).toBeNull();
    expect(await db.hasPendingSync()).toBe(true);
  });

  it("uses durable pending state after reopening even with stale localStorage metadata", async () => {
    const hook = await openStore();
    await act(async () => { await hook.result.current.mutate("Pending", (state) => addNote(state, "pending")); });
    hook.unmount();
    localStorage.setItem(github.SYNC_META_KEY, JSON.stringify({ dirty: false, status: "synced" }));
    const reopened = await openStore();
    expect(reopened.result.current.syncMeta.dirty).toBe(true);
    expect(reopened.result.current.snapshot!.annotations.some((note) => note.id === "pending")).toBe(true);
  });

  it("creates exactly one checkpoint for import and preserves an import made during upload", async () => {
    vi.mocked(github.fetchRemote).mockResolvedValue(null);
    const upload = deferred<string>();
    vi.mocked(github.putRemote).mockReturnValue(upload.promise);
    const { result } = await openStore();
    let push!: Promise<void>;
    act(() => { push = result.current.pushGithub(); });
    await waitFor(() => expect(github.putRemote).toHaveBeenCalledOnce());
    const imported = structuredClone(base);
    addNote(imported, "imported");
    await act(async () => { await result.current.importSnapshot(imported); });
    await act(async () => { upload.resolve("new-sha"); await push; });
    expect(result.current.snapshot!.annotations.some((note) => note.id === "imported")).toBe(true);
    expect(await db.hasPendingSync()).toBe(true);
    expect(await db.listBackups()).toHaveLength(2); // One for push, one for import.
  });
});


describe("pending revision upgrade", () => {
  it("conservatively upgrades an old snapshot and removes obsolete counter rows", async () => {
    const database = await db.openRepsDatabase();
    await database.delete("meta", "pendingSync");
    await database.put("outbox", { id: "old", createdAt: new Date().toISOString(), revision: base.revision, reason: "Old edit" });
    const loaded = await db.loadOrInitializeSnapshot("test-device");
    expect(loaded.snapshotId).toBe(base.snapshotId);
    expect(await db.hasPendingSync()).toBe(true);
    expect(await database.count("outbox")).toBe(0);
    await db.acknowledgeSynced(loaded);
    await db.loadOrInitializeSnapshot("test-device");
    expect(await db.hasPendingSync()).toBe(false);
  });
});
