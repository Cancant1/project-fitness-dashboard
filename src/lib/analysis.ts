import type { Exercise, Session, SetRow } from "../data/types";
import { addDays, daysBetween, mondayOf } from "./format";

// Sets that must not feed PRs or progress figures (CLAUDE.md + the doubtful_* flags in data/, and outlier_*:
// e.g. 45 kg "dumbbells" × 12 on incline press, flagged as probably a machine).
const EXCLUDE = ["load_outlier_check", "load_missing", "interpreted", "multi_load", "session_marked_discarded"];

export function isFlagged(s: Pick<SetRow, "flags">): boolean {
  return s.flags.some((f) => EXCLUDE.includes(f) || f.startsWith("doubtful") || f.startsWith("outlier_"));
}

/** Epley estimated 1RM, only for 1–12 reps. */
export function e1rm(loadKg: number | null, reps: number | null): number | null {
  if (loadKg == null || reps == null || reps < 1 || reps > 12 || loadKg <= 0) return null;
  return reps === 1 ? loadKg : loadKg * (1 + reps / 30);
}

/** Sets that count for strength figures: completed, not warm-up, not flagged. */
export function countsForStrength(s: SetRow): boolean {
  return s.completed && s.kind !== "warmup" && !isFlagged(s) && s.load_kg != null && s.reps != null;
}

// ------------------------------------------------------------------ joined work sets

export type Confidence = Session["date_confidence"];

/** A completed, non-warm-up set of a live session, joined with its session's date and provenance. */
export interface WorkSet {
  id: string;
  sessionId: string;
  exerciseId: string;
  date: string;
  confidence: Confidence;
  source: string;
  kind: SetRow["kind"];
  unit: SetRow["unit"];
  loadKg: number | null;
  reps: number | null;
  flagged: boolean;
  /** Epley e1RM; null when flagged or not computable. */
  e1rm: number | null;
  order: number;
}

/** Sessions that hold real training: completed or still being logged (never skipped, discarded or planned). */
export function isLiveSession(s: Pick<Session, "status">): boolean {
  return s.status === "completed" || s.status === "in_progress";
}

/** Joins sets to live sessions; drops warm-ups and unfinished sets. Sorted by date, session, position. */
export function workSets(sets: readonly SetRow[], sessions: readonly Session[]): WorkSet[] {
  const live = new Map<string, Session>();
  for (const s of sessions) if (isLiveSession(s)) live.set(s.id, s);
  const out: WorkSet[] = [];
  for (const s of sets) {
    if (!s.completed || s.kind === "warmup") continue;
    const session = live.get(s.session_id);
    if (!session) continue;
    const flagged = isFlagged(s);
    const loadKg = s.load_kg == null ? null : Number(s.load_kg);
    out.push({
      id: s.id, sessionId: s.session_id, exerciseId: s.exercise_id, date: session.date, confidence: session.date_confidence,
      source: session.source, kind: s.kind, unit: s.unit, loadKg, reps: s.reps, flagged,
      e1rm: flagged ? null : e1rm(loadKg, s.reps), order: s.exercise_position * 1000 + s.set_no
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId) || a.order - b.order);
  return out;
}

export function groupBy<T, K>(items: readonly T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

// ------------------------------------------------------------------ metrics

/**
 * How a lift is scored. "e1rm": Epley estimated 1RM of the load.
 * "added5": heaviest added load (bodyweight lifts) on a set of 5+ reps — e1RM on added weight alone means little.
 */
export type Metric = "e1rm" | "added5";

export function metricValue(s: WorkSet, metric: Metric): number | null {
  if (s.flagged) return null;
  if (metric === "e1rm") return s.e1rm;
  return s.loadKg != null && s.reps != null && s.reps >= 5 ? s.loadKg : null;
}

/** Goal expressed in the metric: 145 × 5 → 169.2 e1RM; pull-up +20 × 8 → 20. */
export function goalValue(load: number, reps: number, metric: Metric): number {
  return metric === "e1rm" ? Math.round((e1rm(load, reps) ?? load) * 10) / 10 : load;
}

export interface SessionBest {
  sessionId: string;
  date: string;
  confidence: Confidence;
  source: string;
  value: number;
  set: WorkSet;
}

/** Best metric value per session (flagged sets excluded), oldest first. */
export function sessionBests(sets: readonly WorkSet[], metric: Metric = "e1rm"): SessionBest[] {
  const best = new Map<string, SessionBest>();
  for (const s of sets) {
    const v = metricValue(s, metric);
    if (v == null) continue;
    const cur = best.get(s.sessionId);
    if (!cur || v > cur.value) best.set(s.sessionId, { sessionId: s.sessionId, date: s.date, confidence: s.confidence, source: s.source, value: v, set: s });
  }
  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
}

/** Highest value per period key (e.g. month "2023-09" or year "2023"); keeps the point that set it. */
export function periodBests<T extends { date: string; value: number }>(points: readonly T[], key: (date: string) => string): (T & { period: string })[] {
  const m = new Map<string, T & { period: string }>();
  for (const p of points) {
    const k = key(p.date);
    const cur = m.get(k);
    if (!cur || p.value > cur.value) m.set(k, { ...p, period: k });
  }
  return [...m.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export const monthKey = (date: string) => date.slice(0, 7);
export const yearKey = (date: string) => date.slice(0, 4);

export function monthlyBests<T extends { date: string; value: number }>(points: readonly T[]) {
  return periodBests(points, monthKey);
}

/** "2023-09" → 2023 * 12 + 8: a continuous month axis. */
export function monthIndex(dateOrMonth: string): number {
  return Number(dateOrMonth.slice(0, 4)) * 12 + Number(dateOrMonth.slice(5, 7)) - 1;
}
export function monthFromIndex(i: number): string {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ rep bests and PRs

export interface RepBest { reps: number; set: WorkSet }

/**
 * Heaviest non-flagged set per rep count. mode "atLeast": heaviest load done for N or more reps;
 * "exact": exactly N reps. Ties go to the earlier set (the first time you did it).
 */
export function repBests(sets: readonly WorkSet[], reps: readonly number[], mode: "atLeast" | "exact"): Map<number, WorkSet> {
  const out = new Map<number, WorkSet>();
  for (const s of sets) {
    if (s.flagged || s.loadKg == null || s.reps == null || s.reps < 1) continue;
    for (const r of reps) {
      if (mode === "exact" ? s.reps !== r : s.reps < r) continue;
      const cur = out.get(r);
      if (!cur || s.loadKg > cur.loadKg! || (s.loadKg === cur.loadKg && s.reps > cur.reps!)) out.set(r, s);
    }
  }
  return out;
}

export interface PrEvent {
  exerciseId: string;
  sessionId: string;
  date: string;
  confidence: Confidence;
  kind: "e1rm" | "reps";
  set: WorkSet;
  /** New value: e1RM for kind e1rm, load for kind reps. */
  value: number;
  previous: number;
  /** For rep PRs: the rep count it is a best for (heaviest load for this many reps or more). */
  reps?: number;
}

const PR_REPS = 12;

/**
 * Walks each exercise's history in date order and reports sessions that beat everything before them:
 * a new best e1RM, or else a heavier load than ever for at least that many reps. The first session of an
 * exercise is never a PR (nothing to beat). One event per exercise per session. Flagged sets are ignored.
 */
export function detectPRs(sets: readonly WorkSet[]): PrEvent[] {
  const events: PrEvent[] = [];
  for (const [exerciseId, list] of groupBy(sets.filter((s) => !s.flagged && s.loadKg != null && s.reps != null && s.reps >= 1), (s) => s.exerciseId)) {
    let bestE1rm: number | null = null;
    // bestAtLeast[r] = heaviest load done for r or more reps so far (index 1..PR_REPS).
    const bestAtLeast: (number | null)[] = Array(PR_REPS + 1).fill(null);
    for (const sessionSets of groupBy(list, (s) => s.sessionId).values()) {
      let e1rmEvent: PrEvent | null = null;
      let repEvent: PrEvent | null = null;
      for (const s of sessionSets) {
        if (s.e1rm != null && bestE1rm != null && s.e1rm > bestE1rm + 1e-9 && (!e1rmEvent || s.e1rm > e1rmEvent.value)) {
          e1rmEvent = { exerciseId, sessionId: s.sessionId, date: s.date, confidence: s.confidence, kind: "e1rm", set: s, value: s.e1rm, previous: bestE1rm };
        }
        const r = Math.min(s.reps!, PR_REPS);
        const prev = bestAtLeast[r];
        if (prev != null && s.loadKg! > prev + 1e-9 && s.loadKg! > 0) {
          const score = s.e1rm ?? s.loadKg!;
          if (!repEvent || score > (repEvent.set.e1rm ?? repEvent.set.loadKg!)) {
            repEvent = { exerciseId, sessionId: s.sessionId, date: s.date, confidence: s.confidence, kind: "reps", set: s, value: s.loadKg!, previous: prev, reps: r };
          }
        }
      }
      const ev = e1rmEvent ?? repEvent;
      if (ev) events.push(ev);
      for (const s of sessionSets) {
        if (s.e1rm != null && (bestE1rm == null || s.e1rm > bestE1rm)) bestE1rm = s.e1rm;
        const r = Math.min(s.reps!, PR_REPS);
        for (let k = 1; k <= r; k++) if (bestAtLeast[k] == null || s.loadKg! > bestAtLeast[k]!) bestAtLeast[k] = s.loadKg!;
      }
    }
  }
  return events.sort((a, b) => b.date.localeCompare(a.date));
}

// ------------------------------------------------------------------ volume

export const normMuscle = (m: string) => m.trim().toLowerCase();

/**
 * Fractional sets per muscle: each set counts 1 for the exercise's direct muscle and 0.5 for each indirect one.
 * Pass the non-warm-up sets of the window. Keys are lower-case muscle names; labels keep the first spelling seen.
 */
export function fractionalVolume(
  sets: readonly { exerciseId: string }[],
  exercises: ReadonlyMap<string, Pick<Exercise, "muscle_direct" | "muscle_indirect">>
): Map<string, { label: string; sets: number }> {
  const out = new Map<string, { label: string; sets: number }>();
  const add = (muscle: string, n: number) => {
    const k = normMuscle(muscle);
    if (!k) return;
    const cur = out.get(k);
    if (cur) cur.sets += n;
    else out.set(k, { label: muscle.trim(), sets: n });
  };
  for (const s of sets) {
    const e = exercises.get(s.exerciseId);
    if (!e) continue;
    if (e.muscle_direct) add(e.muscle_direct, 1);
    for (const m of e.muscle_indirect ?? []) add(m, 0.5);
  }
  return out;
}

// ------------------------------------------------------------------ frequency

/** Sessions per calendar week (Monday start) for `weeks` weeks ending with the week of `endDate`. Oldest first. */
export function weeklyCounts(dates: readonly string[], endDate: string, weeks: number): { monday: string; count: number }[] {
  const last = mondayOf(endDate);
  const first = addDays(last, -7 * (weeks - 1));
  const out = Array.from({ length: weeks }, (_, i) => ({ monday: addDays(first, 7 * i), count: 0 }));
  for (const d of dates) {
    if (d < first || d > addDays(last, 6)) continue;
    const i = Math.floor(daysBetween(first, d) / 7);
    if (out[i]) out[i]!.count += 1;
  }
  return out;
}

// ------------------------------------------------------------------ statistics

/** Pearson correlation; null with fewer than 3 pairs or no variance. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]!; my += ys[i]!; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Least-squares line y = slope·x + intercept; null with fewer than 2 points or no x variance. */
export function linearFit(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

/**
 * Expected regain towards an old best: S(t) = P − (P − S₀)·e^(−k·t), t in plan weeks.
 * Defaults from the plan: squat S₀ = 117, P = 166, k = 0.17 (autumn 2023: 128 → 152 in 6 weeks).
 */
export function regainCurve(week: number, p = 166, s0 = 117, k = 0.17): number {
  return p - (p - s0) * Math.exp(-k * week);
}

// ------------------------------------------------------------------ bodyweight

/** Trailing 7-day average for each date that has a reading (oldest first). */
export function rolling7(points: readonly { date: string; value: number }[]): { date: string; value: number }[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const out: { date: string; value: number }[] = [];
  let lo = 0, sum = 0;
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i]!.value;
    while (daysBetween(sorted[lo]!.date, sorted[i]!.date) >= 7) { sum -= sorted[lo]!.value; lo++; }
    out.push({ date: sorted[i]!.date, value: sum / (i - lo + 1) });
  }
  return out;
}

/** Mean per month: "2024-03" → 80.1. */
export function monthlyAverages(points: readonly { date: string; value: number }[]): Map<string, number> {
  const acc = new Map<string, { s: number; n: number }>();
  for (const p of points) {
    const k = monthKey(p.date);
    const a = acc.get(k) ?? { s: 0, n: 0 };
    a.s += p.value; a.n += 1;
    acc.set(k, a);
  }
  return new Map([...acc].map(([k, a]) => [k, a.s / a.n]));
}

// ------------------------------------------------------------------ dates and blocks

const CONF_RANK: Record<Confidence, number> = { exact: 0, "week known": 1, estimated: 2 };

/** The least certain confidence in a list. */
export function worstConfidence(list: readonly Confidence[]): Confidence {
  let worst: Confidence = "exact";
  for (const c of list) if (CONF_RANK[c] > CONF_RANK[worst]) worst = c;
  return worst;
}

/** "" for exact dates, otherwise the label to show next to the date. */
export function confidenceLabel(c: Confidence): string {
  return c === "estimated" ? "date estimated" : c === "week known" ? "week known" : "";
}

/** "sheet:2023 Reddit PPL #2 (11 Sept)" → "2023 Reddit PPL #2 (11 Sept)"; "reps-v2" → "2026 app log". */
export function blockLabel(source: string): string {
  if (source.startsWith("sheet:")) return source.slice(6);
  if (source === "reps-v2" || source === "reps-v1") return "2026 app log";
  if (source === "app") return "Reps";
  return source;
}

export interface BlockRow {
  source: string;
  label: string;
  first: string;
  last: string;
  confidence: Confidence;
  sessions: number;
  setsPerSession: number;
  /** Per lift id: best value over the first two and the last two sessions that include it. */
  lifts: Map<string, { start: number; end: number } | null>;
}

/**
 * Per programme block (session.source): date range, sessions, sets per session, and for each lift the best e1RM
 * of its first two vs last two sessions in the block (null when the lift appears in fewer than 2 sessions).
 */
export function blockComparison(sets: readonly WorkSet[], sessions: readonly Session[], liftIds: readonly string[]): BlockRow[] {
  const live = sessions.filter(isLiveSession);
  const setCount = new Map<string, number>();
  for (const s of sets) setCount.set(s.sessionId, (setCount.get(s.sessionId) ?? 0) + 1);
  const rows: BlockRow[] = [];
  const bySource = groupBy(live, (s) => s.source);
  const setsBySource = groupBy(sets, (s) => s.source);
  for (const [source, list] of bySource) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const withSets = sorted.filter((s) => setCount.has(s.id));
    if (!withSets.length) continue;
    const lifts = new Map<string, { start: number; end: number } | null>();
    const blockSets = setsBySource.get(source) ?? [];
    for (const id of liftIds) {
      const bests = sessionBests(blockSets.filter((s) => s.exerciseId === id));
      if (bests.length < 2) { lifts.set(id, null); continue; }
      const start = Math.max(...bests.slice(0, 2).map((b) => b.value));
      const end = Math.max(...bests.slice(-2).map((b) => b.value));
      lifts.set(id, { start, end });
    }
    const totalSets = withSets.reduce((n, s) => n + (setCount.get(s.id) ?? 0), 0);
    rows.push({
      source, label: blockLabel(source), first: withSets[0]!.date, last: withSets[withSets.length - 1]!.date,
      confidence: worstConfidence(withSets.map((s) => s.date_confidence)), sessions: withSets.length,
      setsPerSession: totalSets / withSets.length, lifts
    });
  }
  return rows.sort((a, b) => a.first.localeCompare(b.first));
}

/** Plan week (0-based, fractional) of a date: days since the plan's first Monday ÷ 7. */
export function planWeekOf(planStart: string, date: string): number {
  return daysBetween(planStart, date) / 7;
}
