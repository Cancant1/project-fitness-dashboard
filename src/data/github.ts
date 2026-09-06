import type { ExercisePerformance, GithubSyncConfig, GithubSyncMeta, RepsSnapshot, VersionedEntity, WorkoutSession } from "../domain/types";
import { nowIso, uid } from "../domain/utils";
import { validateSnapshot } from "./schema";

export const SYNC_CONFIG_KEY = "reps-github-sync-config-v2";
export const SYNC_META_KEY = "reps-github-sync-meta-v2";

const clientId = () => uid("device");

export const defaultSyncConfig = (): GithubSyncConfig => ({
  enabled: false,
  owner: "",
  repo: "",
  branch: "main",
  path: "state/reps-app-state-v2.json",
  token: "",
  autoSync: true,
  clientId: clientId()
});

export const defaultSyncMeta = (): GithubSyncMeta => ({
  lastRemoteSha: null,
  lastSyncAt: null,
  lastPushAt: null,
  dirty: false,
  status: navigator.onLine ? "idle" : "offline",
  message: navigator.onLine ? "Saved locally" : "Offline · saved locally"
});

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
};

export const loadSyncConfig = () => {
  const current = readJson<GithubSyncConfig>(SYNC_CONFIG_KEY, defaultSyncConfig());
  if (current.owner || current.repo || current.token) return { ...defaultSyncConfig(), ...current, clientId: current.clientId || clientId() };
  const legacy = readJson<Record<string, any>>("reps-github-sync-config-v1", {});
  return {
    ...defaultSyncConfig(),
    enabled: !!legacy.enabled,
    owner: String(legacy.owner || ""),
    repo: String(legacy.repo || ""),
    branch: String(legacy.branch || "main"),
    path: legacy.path ? String(legacy.path).replace(/reps-app-state\.json$/, "reps-app-state-v2.json") : "state/reps-app-state-v2.json",
    token: String(legacy.token || ""),
    autoSync: legacy.autoSync !== false,
    clientId: String(legacy.clientId || clientId())
  };
};

export const loadSyncMeta = () => ({ ...readJson<GithubSyncMeta>(SYNC_META_KEY, defaultSyncMeta()), dirty: false });
export const saveSyncConfig = (config: GithubSyncConfig) => localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
export const saveSyncMeta = ({ dirty: _dirty, ...meta }: GithubSyncMeta) => {
  // Sync history is advisory; IndexedDB owns the durable pending revision.
  try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta)); } catch { /* Keep local writes usable if preferences storage is unavailable. */ }
};

const utf8ToBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToUtf8 = (value: string) => {
  const binary = atob(value.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
};

const headers = (config: GithubSyncConfig) => ({
  Authorization: `Bearer ${config.token.trim()}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
});

const encodedPath = (path: string) => path.split("/").filter(Boolean).map(encodeURIComponent).join("/");

const contentUrl = (config: GithubSyncConfig) => (
  `https://api.github.com/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(config.repo.trim())}/contents/${encodedPath(config.path)}?ref=${encodeURIComponent(config.branch || "main")}`
);

export const isSyncConfigured = (config: GithubSyncConfig) => !!(
  config.enabled && config.owner.trim() && config.repo.trim() && config.path.trim() && config.token.trim()
);

export async function fetchRemote(config: GithubSyncConfig): Promise<{ sha: string; snapshot: RepsSnapshot } | null> {
  const response = await fetch(contentUrl(config), { headers: headers(config) });
  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub pull failed (${response.status}): ${body.slice(0, 180)}`);
  }
  const file = await response.json();
  let content = String(file.content || "");
  if ((!content.trim() || file.encoding === "none") && file.git_url) {
    const blobResponse = await fetch(file.git_url, { headers: headers(config) });
    if (!blobResponse.ok) throw new Error(`GitHub large-file read failed (${blobResponse.status}).`);
    const blob = await blobResponse.json();
    content = String(blob.content || "");
  }
  try {
    const parsed = JSON.parse(base64ToUtf8(content));
    const snapshot = validateSnapshot(parsed.state ?? parsed);
    return { sha: file.sha, snapshot };
  } catch (error) {
    throw new Error(`GitHub state is invalid and was not merged: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function putRemote(config: GithubSyncConfig, snapshot: RepsSnapshot, sha?: string | null) {
  const url = `https://api.github.com/repos/${encodeURIComponent(config.owner.trim())}/${encodeURIComponent(config.repo.trim())}/contents/${encodedPath(config.path)}`;
  const envelope = {
    app: "reps",
    schemaVersion: 2,
    snapshotId: snapshot.snapshotId,
    updatedAt: snapshot.updatedAt,
    updatedBy: snapshot.updatedBy,
    state: snapshot
  };
  const body: Record<string, unknown> = {
    message: `Sync Reps state ${nowIso()}`,
    branch: config.branch || "main",
    content: utf8ToBase64(JSON.stringify(envelope))
  };
  if (sha) body.sha = sha;
  const response = await fetch(url, {
    method: "PUT",
    headers: { ...headers(config), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub push failed (${response.status}): ${message.slice(0, 180)}`);
  }
  const result = await response.json();
  return String(result.content?.sha || "");
}

const newer = <T extends VersionedEntity>(local: T, remote: T) => {
  const localTime = Date.parse(local.updatedAt || local.createdAt || "") || 0;
  const remoteTime = Date.parse(remote.updatedAt || remote.createdAt || "") || 0;
  if (localTime !== remoteTime) return remoteTime > localTime ? remote : local;
  const localText = JSON.stringify(local);
  const remoteText = JSON.stringify(remote);
  return remoteText.length > localText.length ? remote : local;
};

const mergeEntities = <T extends VersionedEntity>(local: T[], remote: T[]) => {
  const result = new Map<string, T>();
  for (const entity of [...local, ...remote]) {
    const current = result.get(entity.id);
    result.set(entity.id, current ? newer(current, entity) : entity);
  }
  return Array.from(result.values());
};

const mergePerformances = (local: ExercisePerformance[], remote: ExercisePerformance[]) => {
  const result = new Map<string, ExercisePerformance>();
  for (const performance of [...local, ...remote]) {
    const current = result.get(performance.id);
    if (!current) { result.set(performance.id, performance); continue; }
    const base = newer(current, performance);
    result.set(performance.id, { ...base, sets: mergeEntities(current.sets, performance.sets) });
  }
  return Array.from(result.values()).sort((a, b) => a.order - b.order);
};

const mergeWorkoutSessions = (local: WorkoutSession[], remote: WorkoutSession[]) => {
  const result = new Map<string, WorkoutSession>();
  for (const session of [...local, ...remote]) {
    const current = result.get(session.id);
    if (!current) { result.set(session.id, session); continue; }
    const base = newer(current, session);
    result.set(session.id, { ...base, performances: mergePerformances(current.performances, session.performances) });
  }
  return Array.from(result.values());
};

export function mergeSnapshots(local: RepsSnapshot, remote: RepsSnapshot, client: string) {
  const tombstones = new Map<string, RepsSnapshot["tombstones"][number]>();
  for (const tombstone of [...local.tombstones, ...remote.tombstones]) {
    const key = `${tombstone.entityType}:${tombstone.entityId}`;
    const current = tombstones.get(key);
    if (!current || Date.parse(tombstone.deletedAt) > Date.parse(current.deletedAt)) tombstones.set(key, tombstone);
  }
  const stamp = nowIso();
  const remoteIsNewer = Date.parse(remote.updatedAt) > Date.parse(local.updatedAt);
  const merged: RepsSnapshot = {
    ...local,
    snapshotId: uid("snapshot"),
    updatedAt: stamp,
    updatedBy: client,
    revision: Math.max(local.revision, remote.revision) + 1,
    profiles: mergeEntities(local.profiles, remote.profiles),
    exercises: mergeEntities(local.exercises, remote.exercises),
    sessions: mergeWorkoutSessions(local.sessions, remote.sessions),
    plannedWorkouts: mergeEntities(local.plannedWorkouts, remote.plannedWorkouts),
    routines: mergeEntities(local.routines, remote.routines),
    blocks: mergeEntities(local.blocks, remote.blocks),
    foods: mergeEntities(local.foods, remote.foods),
    foodEntries: mergeEntities(local.foodEntries, remote.foodEntries),
    savedMeals: mergeEntities(local.savedMeals, remote.savedMeals),
    measurements: mergeEntities(local.measurements, remote.measurements),
    nutritionTargets: mergeEntities(local.nutritionTargets, remote.nutritionTargets),
    nutritionOverrides: mergeEntities(local.nutritionOverrides, remote.nutritionOverrides),
    annotations: mergeEntities(local.annotations, remote.annotations),
    legacyFacts: mergeEntities(local.legacyFacts, remote.legacyFacts),
    equipmentProfiles: mergeEntities(local.equipmentProfiles, remote.equipmentProfiles),
    tombstones: Array.from(tombstones.values()),
    settings: remoteIsNewer ? remote.settings : local.settings,
    migrationReport: local.migrationReport || remote.migrationReport
  };
  return merged;
}
