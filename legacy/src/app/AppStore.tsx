import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GithubSyncConfig, GithubSyncMeta, RepsSnapshot } from "../domain/types";
import { deepClone, nowIso, uid } from "../domain/utils";
import { acknowledgeSynced, checkpoint, hasPendingSync, loadOrInitializeSnapshot, replaceSnapshot, saveSnapshot } from "../data/db";
import {
  fetchRemote,
  isSyncConfigured,
  loadSyncConfig,
  loadSyncMeta,
  mergeSnapshots,
  putRemote,
  saveSyncConfig,
  saveSyncMeta
} from "../data/github";
import { addRecoveredRecords } from "../data/recover";
import { validateSnapshot } from "../data/schema";

type Mutator = (draft: RepsSnapshot) => void;

interface AppStoreValue {
  snapshot: RepsSnapshot | null;
  loading: boolean;
  error: string | null;
  syncConfig: GithubSyncConfig;
  syncMeta: GithubSyncMeta;
  mutate: (reason: string, mutator: Mutator) => Promise<void>;
  createCheckpoint: (reason: string) => Promise<string | null>;
  setSyncConfig: (config: GithubSyncConfig) => void;
  pullGithub: () => Promise<void>;
  pushGithub: () => Promise<void>;
  importSnapshot: (value: unknown, mode?: "replace" | "recover") => Promise<void>;
  exportSnapshot: () => void;
  saveError: string | null;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<RepsSnapshot | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncConfig, setSyncConfigState] = useState<GithubSyncConfig>(() => loadSyncConfig());
  const [syncMeta, setSyncMetaState] = useState<GithubSyncMeta>(() => loadSyncMeta());
  const saveChain = useRef(Promise.resolve());
  const snapshotRef = useRef<RepsSnapshot | null>(null);
  const syncConfigRef = useRef(syncConfig);
  const syncing = useRef(false);
  const autoPushTimer = useRef<number | null>(null);

  const updateSyncMeta = useCallback((patch: Partial<GithubSyncMeta>) => {
    setSyncMetaState((current) => {
      const next = { ...current, ...patch };
      saveSyncMeta(next);
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;
    loadOrInitializeSnapshot(syncConfig.clientId)
      .then(async (loaded) => {
        const dirty = await hasPendingSync();
        if (!active) return;
        snapshotRef.current = loaded;
        setSnapshot(loaded);
        setError(null);
        updateSyncMeta({ dirty, status: navigator.onLine ? "idle" : "offline", message: dirty ? "Saved locally · sync pending" : "Saved locally" });
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [syncConfig.clientId, updateSyncMeta]);

  useEffect(() => {
    const theme = snapshot?.settings.appearance.theme || "system";
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = snapshot?.settings.appearance.density || "comfortable";
  }, [snapshot]);

  useEffect(() => { syncConfigRef.current = syncConfig; }, [syncConfig]);

  useEffect(() => {
    const online = () => updateSyncMeta({ status: "idle", message: syncMeta.dirty ? "Online · changes need sync" : "Online" });
    const offline = () => updateSyncMeta({ status: "offline", message: "Offline · saved locally" });
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [syncMeta.dirty, updateSyncMeta]);

  // All local writes share an order. Network requests stay outside this queue.
  const enqueue = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const result = saveChain.current.then(operation);
    saveChain.current = result.then(() => undefined, () => undefined);
    return result;
  }, []);

  const publish = useCallback((next: RepsSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const mutate = useCallback((reason: string, mutator: Mutator) => enqueue(async () => {
    const current = snapshotRef.current;
    if (!current) throw new Error("The journal is still loading.");
    const next = deepClone(current);
    mutator(next);
    next.updatedAt = nowIso();
    next.updatedBy = syncConfigRef.current.clientId;
    next.revision += 1;
    try {
      await saveSnapshot(next, reason);
      publish(next);
      setSaveError(null);
      updateSyncMeta({ dirty: true, status: syncing.current ? "syncing" : navigator.onLine ? "idle" : "offline", message: "Saved locally · sync pending" });
    } catch (cause) {
      setSaveError(`Changes could not be saved. ${cause instanceof Error ? cause.message : String(cause)}`);
      throw cause;
    }
  }), [enqueue, publish, updateSyncMeta]);

  const createCheckpoint = useCallback((reason: string) => enqueue(async () => {
    return snapshotRef.current ? checkpoint(snapshotRef.current, reason) : null;
  }), [enqueue]);

  const setSyncConfig = useCallback((config: GithubSyncConfig) => {
    saveSyncConfig(config);
    syncConfigRef.current = config;
    setSyncConfigState(config);
    updateSyncMeta({ message: isSyncConfigured(config) ? "GitHub ready" : "GitHub not configured", status: "idle" });
  }, [updateSyncMeta]);

  const syncGithub = useCallback(async (direction: "pull" | "push") => {
    if (syncing.current) return;
    const config = syncConfigRef.current;
    if (!snapshotRef.current || !isSyncConfigured(config)) {
      updateSyncMeta({ status: "error", message: "Complete the GitHub connection first" });
      return;
    }
    syncing.current = true;
    updateSyncMeta({ status: "syncing", message: direction === "pull" ? "Pulling GitHub…" : "Reconciling and pushing…" });
    try {
      const remote = await fetchRemote(config);
      if (!remote && direction === "pull") {
        updateSyncMeta({ status: "idle", message: "No v2 file on this branch yet. Find original profiles in Settings → Profile.", lastSyncAt: nowIso() });
        return;
      }
      const outgoing = await enqueue(async () => {
        const current = snapshotRef.current!;
        if (!remote) {
          await checkpoint(current, "Before GitHub push");
          return current;
        }
        const merged = mergeSnapshots(current, remote.snapshot, config.clientId);
        await replaceSnapshot(merged, `GitHub ${direction} merge`);
        publish(merged);
        updateSyncMeta({ dirty: true });
        return merged;
      });
      if (direction === "pull") {
        // A merge can contain records GitHub has never seen. A push acknowledges it.
        updateSyncMeta({ status: "idle", message: "Pulled and merged · push pending", lastRemoteSha: remote!.sha, lastSyncAt: nowIso(), dirty: true });
        return;
      }
      const sha = await putRemote(config, outgoing, remote?.sha || null);
      await enqueue(async () => {
        const clean = await acknowledgeSynced(outgoing);
        const timestamp = nowIso();
        updateSyncMeta({ status: clean ? "synced" : "idle", message: clean ? "Synced with GitHub" : "Uploaded · newer local changes need sync", lastRemoteSha: sha, lastSyncAt: timestamp, lastPushAt: timestamp, dirty: !clean });
      });
    } catch (cause) {
      updateSyncMeta({ status: navigator.onLine ? "error" : "offline", message: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      syncing.current = false;
    }
  }, [enqueue, publish, updateSyncMeta]);

  const pullGithub = useCallback(() => syncGithub("pull"), [syncGithub]);
  const pushGithub = useCallback(() => syncGithub("push"), [syncGithub]);

  useEffect(() => {
    if (autoPushTimer.current) window.clearTimeout(autoPushTimer.current);
    if (!snapshot || syncMeta.status !== "idle" || !syncMeta.dirty || !syncConfig.autoSync || !isSyncConfigured(syncConfig) || !navigator.onLine) return;
    autoPushTimer.current = window.setTimeout(() => { void pushGithub(); }, 15000);
    return () => {
      if (autoPushTimer.current) window.clearTimeout(autoPushTimer.current);
    };
  }, [pushGithub, syncConfig, syncMeta.dirty, syncMeta.status, snapshot?.revision]);

  const importSnapshot = useCallback(async (value: unknown, mode: "replace" | "recover" = "replace") => {
    const imported = validateSnapshot(value);
    if ((imported.migrationReport?.unexplainedDrops ?? 0) > 0) {
      throw new Error("This backup contains unresolved migration drops and was not imported.");
    }
    await enqueue(async () => {
      const contents = mode === "recover" && snapshotRef.current ? addRecoveredRecords(snapshotRef.current, imported) : deepClone(imported);
      const next = { ...contents, snapshotId: uid("snapshot"), updatedAt: nowIso(), updatedBy: syncConfigRef.current.clientId, revision: Math.max(imported.revision, snapshotRef.current?.revision ?? 0) + 1 };
      await replaceSnapshot(next, mode === "recover" ? "Recovered original GitHub profiles" : "Imported schema 2 snapshot");
      publish(next);
      updateSyncMeta({ dirty: true, status: "idle", message: "Import complete · sync pending" });
    });
  }, [enqueue, publish, updateSyncMeta]);

  const exportSnapshot = useCallback(() => {
    const current = snapshotRef.current;
    if (!current) return;
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reps-v2-backup-${nowIso().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const value = useMemo<AppStoreValue>(() => ({
    snapshot,
    loading,
    error,
    syncConfig,
    syncMeta,
    mutate,
    createCheckpoint,
    setSyncConfig,
    pullGithub,
    pushGithub,
    importSnapshot,
    exportSnapshot,
    saveError
  }), [snapshot, loading, error, syncConfig, syncMeta, mutate, createCheckpoint, setSyncConfig, pullGithub, pushGithub, importSnapshot, exportSnapshot, saveError]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export const useAppStore = () => {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error("useAppStore must be used within AppStoreProvider");
  return context;
};
