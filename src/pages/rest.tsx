import { useEffect, useState } from "react";

// The rest timer outlives the workout screen: it is stored per device (one running at a time), so leaving the
// workout to log a weight and coming back finds it still counting. Today's "In progress" card shows it too.

export interface Rest { until: number; total: number }
const KEY = "reps-rest";

export function readRest(sessionId: string, now = Date.now()): Rest | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as (Rest & { sessionId: string }) | null;
    return v && v.sessionId === sessionId && v.until > now ? { until: v.until, total: v.total } : null;
  } catch {
    return null;
  }
}

function writeRest(sessionId: string, rest: Rest | null) {
  try {
    if (rest) localStorage.setItem(KEY, JSON.stringify({ sessionId, ...rest }));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: the timer still runs while the screen is open */ }
}

/** The workout's rest timer, kept in storage so it survives leaving the screen. */
export function useRest(sessionId: string): [Rest | null, (r: Rest | null) => void] {
  const [rest, set] = useState<Rest | null>(() => readRest(sessionId));
  return [rest, (r) => { writeRest(sessionId, r); set(r); }];
}

export function clock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** "Rest 1:23" while this workout's rest timer runs; nothing otherwise. */
export function RestLeft({ sessionId, className }: { sessionId: string; className?: string }) {
  const [now, setNow] = useState(Date.now());
  const rest = readRest(sessionId, now);
  const running = rest != null;
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  if (!rest) return null;
  return <span className={className} role="timer" aria-label="Rest left">Rest {clock(Math.ceil((rest.until - now) / 1000))}</span>;
}
