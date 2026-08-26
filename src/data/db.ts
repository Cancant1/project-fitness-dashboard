import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { MigrationReport, RepsSnapshot } from "../domain/types";
import { migrateLegacySources } from "./migrate";
import { hashText, nowIso, uid } from "../domain/utils";

const DATABASE_NAME = "reps-canonical-v2";
const DATABASE_VERSION = 1;
const CURRENT_KEY = "current";

interface RepsDatabase extends DBSchema {
  snapshots: { key: string; value: RepsSnapshot };
  backups: {
    key: string;
    value: {
      id: string;
      createdAt: string;
      reason: string;
      checksum: string;
      snapshot?: RepsSnapshot;
      legacy?: Record<string, string | null>;
      report?: MigrationReport;
    };
    indexes: { "by-createdAt": string };
  };
  outbox: {
    key: string;
    value: { id: string; createdAt: string; revision: number; reason: string };
    indexes: { "by-createdAt": string };
  };
  meta: { key: string; value: unknown };
}

let dbPromise: Promise<IDBPDatabase<RepsDatabase>> | null = null;
let initializationPromise: Promise<RepsSnapshot> | null = null;

export function openRepsDatabase() {
  if (!dbPromise) {
    dbPromise = openDB<RepsDatabase>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(db) {
        db.createObjectStore("snapshots");
        const backups = db.createObjectStore("backups", { keyPath: "id" });
        backups.createIndex("by-createdAt", "createdAt");
        const outbox = db.createObjectStore("outbox", { keyPath: "id" });
        outbox.createIndex("by-createdAt", "createdAt");
        db.createObjectStore("meta");
      }
    });
  }
  return dbPromise;
}

const readLegacyJson = (key: string) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

async function initializeSnapshot(clientId: string) {
  const db = await openRepsDatabase();
  const existing = await db.get("snapshots", CURRENT_KEY);
  if (existing?.schemaVersion === 2) return existing;

  const legacyRaw = {
    "reps-app-state-v1": typeof localStorage !== "undefined" ? localStorage.getItem("reps-app-state-v1") : null,
    "fitness-os-local-v3": typeof localStorage !== "undefined" ? localStorage.getItem("fitness-os-local-v3") : null,
    "reps-github-sync-config-v1": typeof localStorage !== "undefined" ? localStorage.getItem("reps-github-sync-config-v1") : null,
    "reps-github-sync-meta-v1": typeof localStorage !== "undefined" ? localStorage.getItem("reps-github-sync-meta-v1") : null
  };
  const backupId = uid("legacy-backup");
  await db.put("backups", {
    id: backupId,
    createdAt: nowIso(),
    reason: "Automatic pre-migration backup; legacy keys were not modified",
    checksum: await hashText(JSON.stringify(legacyRaw)),
    legacy: legacyRaw
  });

  const snapshot = await migrateLegacySources({
    repsV1: readLegacyJson("reps-app-state-v1"),
    fitnessOsV3: readLegacyJson("fitness-os-local-v3"),
    fitnessData: window.FITNESS_DATA as any,
    foodCatalog: (window.REPS_FOOD_CATALOG || []) as any[],
    legacyRoutine: (window.__DEFAULT_PLANNED_ROUTINE || window.PLANNED_ROUTINE || []) as unknown[],
    clientId
  });
  if ((snapshot.migrationReport?.unexplainedDrops ?? 0) > 0) {
    throw new Error("Migration reconciliation found unexplained record drops. The v2 database was not activated.");
  }
  await db.put("snapshots", snapshot, CURRENT_KEY);
  await db.put("meta", backupId, "legacyBackupId");
  await db.put("meta", true, "legacyImported");
  return snapshot;
}

export function loadOrInitializeSnapshot(clientId: string) {
  if (!initializationPromise) {
    initializationPromise = initializeSnapshot(clientId).catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

export async function saveSnapshot(snapshot: RepsSnapshot, reason: string) {
  const db = await openRepsDatabase();
  const tx = db.transaction(["snapshots", "outbox"], "readwrite");
  await tx.objectStore("snapshots").put(snapshot, CURRENT_KEY);
  await tx.objectStore("outbox").put({ id: uid("outbox"), createdAt: nowIso(), revision: snapshot.revision, reason });
  await tx.done;
}

export async function checkpoint(snapshot: RepsSnapshot, reason: string) {
  const db = await openRepsDatabase();
  const id = uid("backup");
  await db.put("backups", {
    id,
    createdAt: nowIso(),
    reason,
    checksum: await hashText(JSON.stringify(snapshot)),
    snapshot: structuredClone(snapshot),
    report: snapshot.migrationReport
  });
  return id;
}

export async function listBackups() {
  const db = await openRepsDatabase();
  return (await db.getAllFromIndex("backups", "by-createdAt")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadBackupSnapshot(id: string) {
  const backup = await (await openRepsDatabase()).get("backups", id);
  if (!backup?.snapshot) throw new Error("This automatic backup contains the untouched legacy browser keys, not a restorable schema 2 snapshot.");
  return structuredClone(backup.snapshot);
}

export async function clearOutbox() {
  const db = await openRepsDatabase();
  const tx = db.transaction("outbox", "readwrite");
  await tx.store.clear();
  await tx.done;
}

export async function outboxCount() {
  const db = await openRepsDatabase();
  return db.count("outbox");
}

export async function replaceSnapshot(snapshot: RepsSnapshot, reason: string) {
  const current = await (await openRepsDatabase()).get("snapshots", CURRENT_KEY);
  if (current) await checkpoint(current, `Before ${reason}`);
  await saveSnapshot(snapshot, reason);
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0, persistent: false };
  const estimate = await navigator.storage.estimate();
  const persistent = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persistent };
}

export async function requestPersistentStorage() {
  return navigator.storage?.persist ? navigator.storage.persist() : false;
}
