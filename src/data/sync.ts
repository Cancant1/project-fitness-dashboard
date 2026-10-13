import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocalStore } from "./local";
import { PUSH_ORDER, TABLES, type Base, type TableName } from "./types";

// Push: send the outbox (upsert; the database skips anything older than what it has).
// Pull: fetch rows changed on the server since our cursor, per table, and merge (newer wins).
// Egress is capped (free plan: 5 GB/month): a pull must not re-download rows it already has, and rows merged
// from a pull must not trigger another sync. Both happened before 13 Oct 2026 and used 10 GB in two days.

export type SyncState =
  | { kind: "idle"; lastSynced: string | null; pending: number; rejected?: Rejected[] }
  | { kind: "syncing"; pending: number }
  | { kind: "offline"; pending: number }
  | { kind: "error"; message: string; pending: number };

/** A row the database refused (a constraint or type error). It is taken out of the outbox so it can't block the
 *  rest; the badge shows it. */
export interface Rejected { table: TableName; id: string; message: string; at: string }

/** Tables with one row per day (unique index): a refused duplicate is merged into the server's row. */
const NATURAL_KEY: Partial<Record<TableName, string[]>> = {
  health_daily: ["date"], body_measurements: ["date", "kind"], nutrition_days: ["date"]
};
const SYSTEM_COLS = new Set(["id", "user_id", "created_at", "updated_at", "server_updated_at", "deleted_at", "source"]);

const PAGE = 1000;

/** A database answer about the data itself (Postgres SQLSTATE like 23505, or PostgREST PGRST…), not the network. */
/** Only data errors (22xxx bad value, 23xxx constraint) — never auth/permission (42501, PGRST3xx): those must keep
 *  the outbox, or a push with an expired session would throw away every unsynced edit. */
const isDataError = (e: { code?: string } | null) => !!e?.code && /^2[23][0-9A-Z]{3}$/.test(e.code);
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
      // A failed push must not stop the pull: the server may hold the row that fixes it (e.g. the Watch's sleep row).
      let pushError: unknown = null;
      try { await this.push(); } catch (e) { pushError = e; }
      await this.pull();
      await this.reconcile();
      if (pushError) throw pushError;
      const now = new Date().toISOString();
      await this.local.setMeta("lastSynced", now);
      const rejected = (await this.local.getMeta<Rejected[]>("rejected")) ?? [];
      this.set({ kind: "idle", lastSynced: now, pending: (await this.local.outbox()).length, ...(rejected.length ? { rejected } : {}) });
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
      const rejected: Rejected[] = [];
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map(({ server_updated_at: _s, ...row }) => row);
        const { error } = await this.supabase.from(table).upsert(chunk, { onConflict: "id" });
        if (!error) continue;
        if (!isDataError(error)) throw new Error(`${table}: ${error.message}`);
        // One bad row: send them one by one and set the bad ones aside.
        for (const row of chunk) {
          const one = await this.supabase.from(table).upsert([row], { onConflict: "id" });
          if (one.error && !isDataError(one.error)) throw new Error(`${table}: ${one.error.message}`);
          if (one.error) rejected.push({ table, id: row.id, message: one.error.message, at: new Date().toISOString() });
        }
      }
      if (rejected.length) {
        const before = (await this.local.getMeta<Rejected[]>("rejected")) ?? [];
        await this.local.setMeta("rejected", [...before.filter((r) => !rejected.some((x) => x.id === r.id)), ...rejected].slice(-50));
        console.warn("Sync: rows rejected by the database", rejected);
      }
      await this.local.clearOutbox(entry.keys);
    }
  }

  private async pull() {
    for (const table of TABLES) {
      const saved = await this.local.getMeta<string>(`cursor:${table}`);
      const savedId = await this.local.getMeta<string>(`cursorId:${table}`);
      const overlapDone = await this.local.getMeta<string>(`overlapDone:${table}`);
      // A write that committed late can carry a timestamp a little before our cursor, so look back once each time
      // the cursor moves, then continue strictly after (cursor, id). Looking back on every sync re-downloaded a
      // whole bulk import (14k sets in one minute) each time. No device clock involved: it may be wrong.
      let ts = "1970-01-01T00:00:00Z";
      let id = "";
      if (saved && overlapDone !== saved) ts = new Date(Date.parse(saved) - OVERLAP_MS).toISOString();
      else if (saved) [ts, id] = [saved, savedId ?? ""];
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
        if (!saved || Date.parse(ts) >= Date.parse(saved)) {
          await this.local.setMeta(`cursor:${table}`, ts);
          await this.local.setMeta(`cursorId:${table}`, id);
        }
        if (rows.length < PAGE) break;
      }
      if (saved) await this.local.setMeta(`overlapDone:${table}`, saved);
    }
  }

  /**
   * A row refused as a duplicate of a day the server already has (e.g. sleep typed in by hand after the Watch sent
   * that morning): once the server's row is here, copy what was typed onto it and drop the local duplicate.
   */
  private async reconcile() {
    const rejected = (await this.local.getMeta<Rejected[]>("rejected")) ?? [];
    if (!rejected.length) return;
    const keep: Rejected[] = [];
    for (const r of rejected) {
      const key = NATURAL_KEY[r.table as keyof typeof NATURAL_KEY];
      const mine = this.local.rawGet(r.table, r.id) as (Base & Record<string, unknown>) | undefined;
      if (!mine) continue; // already gone
      const twin = key && /duplicate key/i.test(r.message)
        ? (this.local.all(r.table) as unknown as (Base & Record<string, unknown>)[]).find((x) => x.id !== mine.id && x.server_updated_at && key.every((k) => x[k] === mine[k]))
        : undefined;
      if (!twin) { keep.push(r); continue; }
      const typed = Object.fromEntries(Object.entries(mine).filter(([k, v]) => v != null && !SYSTEM_COLS.has(k) && !key!.includes(k)));
      await this.local.save(r.table, { ...typed, id: twin.id } as never);
      await this.local.forget(r.table, mine.id);
    }
    await this.local.setMeta("rejected", keep);
    if (keep.length !== rejected.length) await this.push();
  }

  private set(state: SyncState) {
    this.state = state;
    for (const fn of this.listeners) fn(state);
  }
}
