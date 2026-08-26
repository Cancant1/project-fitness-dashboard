import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GithubSyncConfig, GithubSyncMeta, RepsSnapshot } from "../domain/types";
import { deepClone, nowIso, uid } from "../domain/utils";
import { checkpoint, clearOutbox, loadOrInitializeSnapshot, outboxCount, replaceSnapshot, saveSnapshot } from "../data/db";
import {
  defaultSyncMeta,
  fetchRemote,
  isSyncConfigured,
  loadSyncConfig,
  loadSyncMeta,
  mergeSnapshots,
  putRemote,
  saveSyncConfig,
  saveSyncMeta
} from "../data/github";
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
  importSnapshot: (value: unknown) => Promise<void>;
  exportSnapshot: () => void;
  refreshOutbox: () => Promise<number>;
}

const AppStoreContext = createContext<AppStoreValue | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<RepsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncConfig, setSyncConfigState] = useState<GithubSyncConfig>(() => loadSyncConfig());
  const [syncMeta, setSyncMetaState] = useState<GithubSyncMeta>(() => loadSyncMeta());
  const saveChain = useRef(Promise.resolve());
  const snapshotRef = useRef<RepsSnapshot | null>(null);
  const syncConfigRef = useRef(syncConfig);
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
      .then((loaded) => {
        if (!active) return;
        snapshotRef.current = loaded;
        setSnapshot(loaded);
        setError(null);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [syncConfig.clientId]);

  useEffect(() => {
    snapshotRef.current = snapshot;
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

  const mutate = useCallback(async (reason: string, mutator: Mutator) => {
    const current = snapshotRef.current;
    if (!current) return;
    const next = deepClone(current);
    mutator(next);
    next.updatedAt = nowIso();
    next.updatedBy = syncConfigRef.current.clientId;
    next.revision += 1;
    snapshotRef.current = next;
    setSnapshot(next);
    updateSyncMeta({ dirty: true, status: navigator.onLine ? "idle" : "offline", message: navigator.onLine ? "Saved locally · sync pending" : "Offline · saved locally" });
    saveChain.current = saveChain.current.then(() => saveSnapshot(next, reason)).catch((cause) => {
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    await saveChain.current;
  }, [updateSyncMeta]);

  const createCheckpoint = useCallback(async (reason: string) => {
    if (!snapshotRef.current) return null;
    return checkpoint(snapshotRef.current, reason);
  }, []);

  const setSyncConfig = useCallback((config: GithubSyncConfig) => {
    saveSyncConfig(config);
    syncConfigRef.current = config;
    setSyncConfigState(config);
    updateSyncMeta({ message: isSyncConfigured(config) ? "GitHub ready" : "GitHub not configured", status: "idle" });
  }, [updateSyncMeta]);

  const pullGithub = useCallback(async () => {
    const config = syncConfigRef.current;
    const current = snapshotRef.current;
    if (!current || !isSyncConfigured(config)) {
      updateSyncMeta({ status: "error", message: "Complete the GitHub connection first" });
      return;
    }
    updateSyncMeta({ status: "syncing", message: "Pulling GitHub…" });
    try {
      const remote = await fetchRemote(config);
      if (!remote) {
        updateSyncMeta({ status: "idle", message: "No remote v2 file yet", lastSyncAt: nowIso() });
        return;
      }
      await checkpoint(current, "Before GitHub pull");
      const merged = mergeSnapshots(current, remote.snapshot, config.clientId);
      await replaceSnapshot(merged, "GitHub pull merge");
      snapshotRef.current = merged;
      setSnapshot(merged);
      await clearOutbox();
      updateSyncMeta({
        status: "synced",
        message: "Pulled and reconciled",
        lastRemoteSha: remote.sha,
        lastSyncAt: nowIso(),
        dirty: false,
        conflict: false
      });
    } catch (cause) {
      updateSyncMeta({ status: navigator.onLine ? "error" : "offline", message: cause instanceof Error ? cause.message : String(cause) });
    }
  }, [updateSyncMeta]);

  const pushGithub = useCallback(async () => {
    const config = syncConfigRef.current;
    const current = snapshotRef.current;
    if (!current || !isSyncConfigured(config)) {
      updateSyncMeta({ status: "error", message: "Complete the GitHub connection first" });
      return;
    }
    updateSyncMeta({ status: "syncing", message: "Reconciling and pushing…" });
    try {
      await checkpoint(current, "Before GitHub push");
      const remote = await fetchRemote(config);
      const merged = remote ? mergeSnapshots(current, remote.snapshot, config.clientId) : current;
      const sha = await putRemote(config, merged, remote?.sha || null);
      if (merged !== current) {
        await replaceSnapshot(merged, "GitHub pre-push merge");
        snapshotRef.current = merged;
        setSnapshot(merged);
      }
      await clearOutbox();
      const timestamp = nowIso();
      updateSyncMeta({ status: "synced", message: "Synced with GitHub", lastRemoteSha: sha, lastSyncAt: timestamp, lastPushAt: timestamp, dirty: false, conflict: false });
    } catch (cause) {
      updateSyncMeta({ status: navigator.onLine ? "error" : "offline", message: cause instanceof Error ? cause.message : String(cause) });
    }
  }, [updateSyncMeta]);

  useEffect(() => {
    if (autoPushTimer.current) window.clearTimeout(autoPushTimer.current);
    if (!syncMeta.dirty || !syncConfig.autoSync || !isSyncConfigured(syncConfig) || !navigator.onLine) return;
    autoPushTimer.current = window.setTimeout(() => { void pushGithub(); }, 15000);
    return () => {
      if (autoPushTimer.current) window.clearTimeout(autoPushTimer.current);
    };
  }, [pushGithub, syncConfig, syncMeta.dirty]);

  const importSnapshot = useCallback(async (value: unknown) => {
    const imported = validateSnapshot(value);
    if ((imported.migrationReport?.unexplainedDrops ?? 0) > 0) {
      throw new Error("This backup contains unresolved migration drops and was not imported.");
    }
    if (snapshotRef.current) await checkpoint(snapshotRef.current, "Before snapshot import");
    const next = { ...deepClone(imported), snapshotId: uid("snapshot"), updatedAt: nowIso(), updatedBy: syncConfigRef.current.clientId, revision: imported.revision + 1 };
    await replaceSnapshot(next, "Imported schema 2 snapshot");
    snapshotRef.current = next;
    setSnapshot(next);
    updateSyncMeta({ dirty: true, status: "idle", message: "Import complete · sync pending" });
  }, [updateSyncMeta]);

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

  const refreshOutbox = useCallback(() => outboxCount(), []);

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
    refreshOutbox
  }), [snapshot, loading, error, syncConfig, syncMeta, mutate, createCheckpoint, setSyncConfig, pullGithub, pushGithub, importSnapshot, exportSnapshot, refreshOutbox]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export const useAppStore = () => {
  const context = useContext(AppStoreContext);
  if (!context) throw new Error("useAppStore must be used within AppStoreProvider");
  return context;
};
