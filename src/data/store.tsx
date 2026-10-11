import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { LocalStore } from "./local";
import { Sync, type SyncState } from "./sync";
import { supabase } from "./supabase";
import type { TableName, Tables } from "./types";

interface StoreValue {
  local: LocalStore;
  sync: Sync;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Opens this user's local database and keeps it in sync while the app is open. */
export function StoreProvider({ userId, offline = false, children }: { userId: string; offline?: boolean; children: ReactNode }) {
  const [value, setValue] = useState<StoreValue | null>(null);

  useEffect(() => {
    let cancelled = false;
    const local = new LocalStore(userId);
    const sync = new Sync(local, supabase, offline);
    void local.open().then(() => {
      if (cancelled) return;
      setValue({ local, sync });
      void sync.run();
    });
    return () => {
      cancelled = true;
    };
  }, [userId, offline]);

  useEffect(() => {
    if (!value) return;
    const { local, sync } = value;
    let timer: number | undefined;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void sync.run(), 1500);
    };
    const unsubscribe = local.subscribe(soon);
    const onVisible = () => document.visibilityState === "visible" && void sync.run();
    const onOnline = () => void sync.run();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    const interval = window.setInterval(() => void sync.run(), 60_000);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
      window.clearTimeout(timer);
    };
  }, [value]);

  if (!value) return null;
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

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
