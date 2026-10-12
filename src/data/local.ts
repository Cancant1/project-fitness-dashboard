import { openDB, type IDBPDatabase } from "idb";
import { TABLES, type Base, type TableName, type Tables } from "./types";

// Local-first store: every table is held in memory (Map by id) and mirrored to IndexedDB.
// A write lands in memory + IndexedDB + the outbox in one go; sync.ts pushes the outbox later.

type Listener = () => void;

interface OutboxItem { key?: number; table: TableName; id: string }

/** Bump when TABLES gains a table (1 → 2: health_daily). */
const DB_VERSION = 2;

export class LocalStore {
  private db!: IDBPDatabase;
  private cache = new Map<TableName, Map<string, Base>>();
  private versions = new Map<TableName, number>();
  private listeners = new Set<Listener>();
  readonly userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  async open(): Promise<void> {
    // Version 2 added health_daily. The upgrade only creates stores that are missing, so a v1 database
    // keeps its rows, outbox and sync cursors (the new table pulls from the start on the next sync).
    this.db = await openDB(`reps-v3-${this.userId}`, DB_VERSION, {
      upgrade(db) {
        for (const t of TABLES) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: "id" });
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "key", autoIncrement: true });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      }
    });
    for (const t of TABLES) {
      const rows = (await this.db.getAll(t)) as Base[];
      this.cache.set(t, new Map(rows.map((r) => [r.id, r])));
      this.versions.set(t, 0);
    }
  }

  // ---- reading

  all<T extends TableName>(table: T): Tables[T][] {
    const rows: Tables[T][] = [];
    for (const row of this.cache.get(table)!.values()) if (!row.deleted_at) rows.push(row as Tables[T]);
    return rows;
  }

  get<T extends TableName>(table: T, id: string): Tables[T] | undefined {
    const row = this.cache.get(table)!.get(id);
    return row && !row.deleted_at ? (row as Tables[T]) : undefined;
  }

  version(table: TableName): number {
    return this.versions.get(table) ?? 0;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---- writing (from the UI)

  async save<T extends TableName>(table: T, rows: Partial<Tables[T]> | Partial<Tables[T]>[]): Promise<Tables[T][]> {
    const list = Array.isArray(rows) ? rows : [rows];
    const now = new Date().toISOString();
    const saved = list.map((patch) => {
      const existing = patch.id ? this.cache.get(table)!.get(patch.id) : undefined;
      return {
        ...existing,
        ...patch,
        id: patch.id ?? crypto.randomUUID(),
        user_id: this.userId,
        created_at: existing?.created_at ?? patch.created_at ?? now,
        updated_at: now
      } as Tables[T];
    });
    // Cache first: a second save to the same row in the same tick (blur, then the tick button) must merge onto this
    // one, not onto the row as it was before.
    for (const row of saved) this.cache.get(table)!.set(row.id, row);
    const tx = this.db.transaction([table, "outbox"], "readwrite");
    for (const row of saved) {
      void tx.objectStore(table).put(row);
      void tx.objectStore("outbox").add({ table, id: row.id } satisfies OutboxItem);
    }
    await tx.done;
    this.bump(table);
    return saved;
  }

  async remove(table: TableName, ids: string[]): Promise<void> {
    const now = new Date().toISOString();
    const rows = ids.map((id) => this.cache.get(table)!.get(id)).filter((r): r is Base => !!r);
    await this.save(table, rows.map((r) => ({ id: r.id, deleted_at: now })) as never);
  }

  // ---- used by sync

  async outbox(): Promise<OutboxItem[]> {
    return (await this.db.getAll("outbox")) as OutboxItem[];
  }

  async clearOutbox(keys: number[]): Promise<void> {
    const tx = this.db.transaction("outbox", "readwrite");
    for (const k of keys) void tx.store.delete(k);
    await tx.done;
  }

  rawGet(table: TableName, id: string): Base | undefined {
    return this.cache.get(table)!.get(id);
  }

  /** Merge rows pulled from the server. A local row with a newer updated_at is kept. */
  async merge(table: TableName, remote: Base[]): Promise<number> {
    const local = this.cache.get(table)!;
    const accepted = remote.filter((r) => {
      const mine = local.get(r.id);
      return !mine || mine.updated_at <= r.updated_at;
    });
    if (accepted.length) {
      const tx = this.db.transaction(table, "readwrite");
      for (const row of accepted) void tx.store.put(row);
      await tx.done;
      for (const row of accepted) local.set(row.id, row);
      this.bump(table);
    }
    return accepted.length;
  }

  /** Drop a row on this device only (never pushed): a local duplicate the server refused. */
  async forget(table: TableName, id: string): Promise<void> {
    await this.db.delete(table, id);
    this.cache.get(table)!.delete(id);
    this.bump(table);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    return (await this.db.get("meta", key)) as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.db.put("meta", value, key);
  }

  private bump(table: TableName) {
    this.versions.set(table, (this.versions.get(table) ?? 0) + 1);
    for (const fn of this.listeners) fn();
  }
}
