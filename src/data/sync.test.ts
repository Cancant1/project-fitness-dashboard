import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { LocalStore } from "./local";
import { Sync } from "./sync";
import type { Base } from "./types";

type Row = Base & Record<string, unknown>;

/** A tiny stand-in for the Supabase client: serves the pull query and counts the rows it sends (egress). */
function fakeServer(tables: Record<string, Row[]>) {
  const served = { rows: 0, requests: 0 };
  const client = {
    from(table: string) {
      let filter = (_r: Row) => true;
      let limit = Infinity;
      const q = {
        select: () => q,
        upsert: async () => ({ error: null }),
        order: () => q,
        or(after: string) {
          const keyset = after.match(/^server_updated_at\.gt\."(.+?)",and\(server_updated_at\.eq\."(.+?)",id\.gt\.(.+)\)$/);
          const gte = after.match(/^server_updated_at\.gte\."(.+)"$/);
          if (keyset) {
            const [, ts, , id] = keyset;
            filter = (r) => r.server_updated_at! > ts! || (r.server_updated_at === ts && r.id > id!);
          } else if (gte) filter = (r) => r.server_updated_at! >= gte[1]!;
          return q;
        },
        limit(n: number) { limit = n; return q; },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          const data = (tables[table] ?? [])
            .filter(filter)
            .sort((a, b) => a.server_updated_at!.localeCompare(b.server_updated_at!) || a.id.localeCompare(b.id))
            .slice(0, limit);
          served.rows += data.length;
          served.requests += 1;
          resolve({ data, error: null });
        }
      };
      return q;
    }
  };
  return { client: client as unknown as SupabaseClient, served };
}

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const row = (i: number, ts: string): Row => ({
  id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, user_id: "u", created_at: ts, updated_at: ts, server_updated_at: ts
});

describe("sync pull", () => {
  it("re-reads a bulk import at most once, then downloads nothing", async () => {
    const importedAt = iso(2 * 24 * 3600_000);
    const sets = Array.from({ length: 2500 }, (_, i) => row(i, importedAt));
    const { client, served } = fakeServer({ sets });
    const local = new LocalStore(`t-${Math.random()}`);
    await local.open();
    let writes = 0;
    local.onWrite(() => writes++);
    const sync = new Sync(local, client);

    await sync.run();
    expect(local.all("sets")).toHaveLength(2500);
    expect(served.rows).toBe(2500);

    await sync.run(); // one look-back after the cursor moved (late commits)
    expect(served.rows).toBe(5000);
    await sync.run();
    await sync.run();
    expect(served.rows).toBe(5000); // then nothing, whatever the device clock says
    expect(writes).toBe(0); // pulled rows never ask for another sync
  });

  it("re-reading a row it already has is not a change", async () => {
    const local = new LocalStore(`t-${Math.random()}`);
    await local.open();
    let changes = 0;
    local.subscribe(() => changes++);
    const r = row(1, iso(0));
    expect(await local.merge("sets", [r])).toBe(1);
    expect(await local.merge("sets", [{ ...r }])).toBe(0);
    expect(changes).toBe(1);
  });

  it("still picks up a row that committed late with a slightly older timestamp", async () => {
    const sets = [row(1, iso(10_000))];
    const { client } = fakeServer({ sets });
    const local = new LocalStore(`t-${Math.random()}`);
    await local.open();
    const sync = new Sync(local, client);
    await sync.run();
    sets.push(row(0, iso(30_000))); // older timestamp, smaller id, arrives after our pull
    await sync.run();
    expect(local.all("sets")).toHaveLength(2);
  });
});
