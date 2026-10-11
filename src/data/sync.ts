import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalStore } from "./local";
import { PUSH_ORDER, TABLES, type Base, type TableName } from "./types";

// Push: send the outbox (upsert; the database skips anything older than what it has).
// Pull: fetch rows changed on the server since our cursor, per table, and merge (newer wins).

export type SyncState =
  | { kind: "idle"; lastSynced: string | null; pending: number }
  | { kind: "syncing"; pending: number }
  | { kind: "offline"; pending: number }
  | { kind: "error"; message: string; pending: number };

const PAGE = 1000;
const OVERLAP_MS = 2 * 60 * 1000;

export class Sync {
  private running: Promise<void> | null = null;
  private again = false;
  private listeners = new Set<(s: SyncState) => void>();
  state: SyncState = { kind: "idle", lastSynced: null, pending: 0 };

  constructor(private local: LocalStore, private supabase: SupabaseClient, private disabled = false) {}

  onChange(fn: (s: SyncState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Run a sync now; overlapping calls are coalesced into one follow-up run. */
  run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.cycle().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.run();
      }
    });
    return this.running;
  }

  private async cycle() {
    const pending = (await this.local.outbox()).length;
    if (!navigator.onLine || this.disabled) return this.set({ kind: "offline", pending });
    this.set({ kind: "syncing", pending });
    try {
      await this.push();
      await this.pull();
      const now = new Date().toISOString();
      await this.local.setMeta("lastSynced", now);
      this.set({ kind: "idle", lastSynced: now, pending: (await this.local.outbox()).length });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.set({ kind: navigator.onLine ? "error" : "offline", message, pending: (await this.local.outbox()).length } as SyncState);
    }
  }

  private async push() {
    const items = await this.local.outbox();
    if (!items.length) return;
    const byTable = new Map<TableName, { keys: number[]; ids: Set<string> }>();
    for (const item of items) {
      const entry = byTable.get(item.table) ?? { keys: [], ids: new Set() };
      entry.keys.push(item.key!);
      entry.ids.add(item.id);
      byTable.set(item.table, entry);
    }
    for (const table of PUSH_ORDER) {
      const entry = byTable.get(table);
      if (!entry) continue;
      const rows = [...entry.ids].map((id) => this.local.rawGet(table, id)).filter((r): r is Base => !!r);
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map(({ server_updated_at: _s, ...row }) => row);
        const { error } = await this.supabase.from(table).upsert(chunk, { onConflict: "id" });
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      await this.local.clearOutbox(entry.keys);
    }
  }

  private async pull() {
    for (const table of TABLES) {
      const saved = await this.local.getMeta<string>(`cursor:${table}`);
      // Start a little before the saved cursor: a write that committed late can carry an older
      // timestamp. Re-reading a few rows is harmless because merge() is idempotent.
      let ts = saved ? new Date(Date.parse(saved) - OVERLAP_MS).toISOString() : "1970-01-01T00:00:00Z";
      let id = "";
      for (;;) {
        // Keyset paging on (server_updated_at, id): rows from one batch share a timestamp.
        const after = id
          ? `server_updated_at.gt."${ts}",and(server_updated_at.eq."${ts}",id.gt.${id})`
          : `server_updated_at.gte."${ts}"`;
        const { data, error } = await this.supabase
          .from(table)
          .select("*")
          .or(after)
          .order("server_updated_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(PAGE);
        if (error) throw new Error(`${table}: ${error.message}`);
        const rows = (data ?? []) as Base[];
        if (!rows.length) break;
        await this.local.merge(table, rows);
        const last = rows[rows.length - 1]!;
        ts = last.server_updated_at!;
        id = last.id;
        await this.local.setMeta(`cursor:${table}`, ts);
        if (rows.length < PAGE) break;
      }
    }
  }

  private set(state: SyncState) {
    this.state = state;
    for (const fn of this.listeners) fn(state);
  }
}
