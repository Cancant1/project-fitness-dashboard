// The store's React context and read hooks, without the Supabase client, so modules that only read rows
// (plan/bridge.ts → usePlan) stay importable outside the browser (tests, the check-in script).
// store.tsx provides the context and re-exports these.

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { LocalStore } from "./local";
import type { Sync, SyncState } from "./sync";
import type { TableName, Tables } from "./types";

export interface StoreValue {
  local: LocalStore;
  sync: Sync;
}

export const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore outside StoreProvider");
  return value;
}

/** Live rows of a table (soft-deleted rows excluded). Re-renders when the table changes. */
export function useRows<T extends TableName>(table: T): Tables[T][] {
  const { local } = useStore();
  const version = useSyncExternalStore(
    (fn) => local.subscribe(fn),
    () => local.version(table)
  );
  return useMemo(() => local.all(table), [local, table, version]);
}

export function useSyncState(): SyncState {
  const { sync } = useStore();
  return useSyncExternalStore(
    (fn) => sync.onChange(fn),
    () => sync.state
  );
}
