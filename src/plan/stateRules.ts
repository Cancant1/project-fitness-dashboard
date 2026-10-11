// Engine state from the log (R1 rules that need dates or pain checks). Pure: bridge.planState calls these.
// E3 recalibration · E6 APRE taper reference · E9 effort · E12 restart · E13 wrist-ladder flare-ups · E14 hold.

import type { PainCheck, SetRow, Session, TrainingMax } from '../data/types';
import { isFlagged } from '../lib/analysis';
import { daysBetween } from '../lib/format';
import type { Adjustment } from './adjustments';
import { addDays, isoWeekday, roundBarbell, weekForDate } from './engine';
import { duringScore, isElbowSite, isMorningFlare, morningBaseline, morningOf, MORNING_RISE, PAIN_HOLD } from './pain';
import type { PlanState, ProgramDefinition, TmLiftKey, Unit } from './types';

const byDate = <T extends { date: string; created_at: string }>(a: T, b: T) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at);

/**
 * E12 / P-RESTART from the completed plan-session dates (oldest first):
 * - the latest gap of ≥ 14 days between sessions marks its first plan week back (firstWeekNo);
 * - with `today`: a current gap ≥ 10 days caps the next rep-outs (capRepOutsFrom = today), and a current gap
 *   ≥ 14 days makes this plan week the first week back (on a Sunday: next week).
 * Undefined when nothing applies (and before the first plan session).
 */
export function restartState(dates: readonly string[], plan: ProgramDefinition, today?: string): PlanState['restart'] | undefined {
  const r = plan.restart ?? { capAfterDays: 10, firstWeekAfterDays: 14, capPlusReps: 2 };
  const ds = today ? dates.filter((d) => d <= today) : [...dates];
  if (!ds.length) return undefined;
  const out: NonNullable<PlanState['restart']> = {};
  for (let i = ds.length - 1; i >= 1; i--) {
    if (daysBetween(ds[i - 1]!, ds[i]!) >= r.firstWeekAfterDays) {
      const w = weekForDate(plan, ds[i]!);
      if (w) out.firstWeekNo = w.weekNo;
      break;
    }
  }
  if (today) {
    const gap = daysBetween(ds.at(-1)!, today);
    if (gap >= r.capAfterDays) out.capRepOutsFrom = today;
    if (gap >= r.firstWeekAfterDays) {
      const w = weekForDate(plan, isoWeekday(today) === 7 ? addDays(today, 1) : today);
      if (w) out.firstWeekNo = w.weekNo;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * E9 / P-EFFORT:
 * - any elbow pain check (during or next morning) ≥ 4/10 → elbow-loading isolation ends at the stop sign from
 *   that day for 14 days (the latest such check counts);
 * - the last 2 completed plan sessions both felt ≤ 2/5 → all isolation that plan week.
 */
export function effortState(completedPlan: readonly Session[], pain: readonly PainCheck[], plan: ProgramDefinition): PlanState['effort'] | undefined {
  const out: NonNullable<PlanState['effort']> = {};
  const elbow = pain.filter((p) => isElbowSite(p.site) && Math.max(duringScore(p) ?? 0, Number(p.morning_score ?? 0)) >= PAIN_HOLD)
    .sort(byDate).at(-1);
  if (elbow) {
    out.elbowIrritableFrom = elbow.date;
    out.elbowIrritableUntil = addDays(elbow.date, 14);
  }
  const [a, b] = [...completedPlan].sort(byDate).slice(-2);
  if (a && b && a.energy != null && b.energy != null && Number(a.energy) <= 2 && Number(b.energy) <= 2) {
    const w = weekForDate(plan, b.date);
    if (w) out.lowFeelWeekNo = w.weekNo;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * E13 flare-ups: a morning elbow score ≥ the site's baseline + 2 (the morning after the check). Each flare-up
 * episode (flares more than 7 days apart) moves the ladder one rung back. After the latest one the ladder is
 * replaced by isometric holds from that morning for at least 3 days and at most 7: it ends the day before the
 * first settled morning (score under baseline + 2) logged from day 3 on.
 */
export function wristLadderState(pain: readonly PainCheck[], plan: ProgramDefinition): PlanState['wristLadder'] | undefined {
  if (!plan.wristLadder) return undefined;
  const elbow = pain.filter((p) => isElbowSite(p.site));
  const flares = [...new Set(elbow.filter((p) => isMorningFlare(p, pain)).map(morningOf))].sort();
  if (!flares.length) return undefined;
  let episodes = 0;
  let lastCounted: string | null = null;
  for (const d of flares) {
    if (lastCounted == null || daysBetween(lastCounted, d) > 7) {
      episodes++;
      lastCounted = d;
    }
  }
  const f = flares.at(-1)!;
  const settled = elbow
    .filter((p) => p.morning_score != null && morningOf(p) >= addDays(f, 3) && morningOf(p) <= addDays(f, 7)
      && Number(p.morning_score) < morningBaseline(pain, p.site, p.date) + MORNING_RISE)
    .map(morningOf).sort()[0];
  const minEnd = addDays(f, 3);
  const until = settled ? [minEnd, addDays(settled, -1)].sort().at(-1)! : addDays(f, 7);
  return { rungOffset: Math.min(episodes, plan.wristLadder.rungs.length - 1), isometricFrom: f, isometricUntil: until };
}

/**
 * E14 hold: per plan exercise key, true when its latest pain check was ≥ 4/10 (or sharp) and it has not been
 * trained in a completed plan session since (a session without a higher check = "a session with ≤ 3").
 */
export function holdLoadState(pain: readonly PainCheck[], keyOf: ReadonlyMap<string, string>, completedPlan: readonly Session[],
  sets: readonly SetRow[]): Record<string, boolean> {
  const latest = new Map<string, PainCheck>();
  for (const p of [...pain].sort(byDate)) {
    const key = p.exercise_id ? keyOf.get(p.exercise_id) : undefined;
    if (key) latest.set(key, p);
  }
  const out: Record<string, boolean> = {};
  for (const [key, p] of latest) {
    if ((duringScore(p) ?? 0) < PAIN_HOLD) continue;
    const later = new Set(completedPlan.filter((s) => s.date > p.date).map((s) => s.id));
    const trained = sets.some((x) => later.has(x.session_id) && x.exercise_id === p.exercise_id && x.completed && x.kind !== 'warmup' && !x.deleted_at);
    if (!trained) out[key] = true;
  }
  return out;
}

/**
 * E3: after a recalibrate adjustment, each TM lift without a calibration or rep-out TM row dated on or after it
 * gets a calibration rep-out at 75% of its last TM (floored to 2.5 kg).
 */
export function recalibrateState(adjustments: readonly Adjustment[], maxes: readonly TrainingMax[], ids: ReadonlyMap<string, string>): Partial<Record<TmLiftKey, number>> {
  const recal = adjustments.filter((a) => a.data.kind === 'recalibrate').sort((a, b) => a.created.localeCompare(b.created)).at(-1);
  if (!recal) return {};
  const since = recal.created.slice(0, 10);
  const out: Partial<Record<TmLiftKey, number>> = {};
  for (const lift of ['squat', 'deadlift'] as const) {
    const id = ids.get(lift);
    const rows = maxes.filter((m) => m.exercise_id === id && !m.deleted_at)
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.created_at.localeCompare(b.created_at));
    if (rows.some((m) => m.effective_date >= since && (m.reason === 'calibration' || m.reason === 'rep_out'))) continue;
    const last = rows.at(-1);
    if (last) out[lift] = roundBarbell(0.75 * Number(last.value_kg));
  }
  return out;
}

/**
 * E6: the heaviest unflagged working load of an exercise in the 12 months before the plan start (history),
 * in `unit` (lb for cable stacks, else kg). Null without history.
 */
export function lastLoggedWorkingLoad(sets: readonly SetRow[], sessions: readonly Session[], exerciseId: string | undefined,
  planStart: string, unit: Unit): number | null {
  if (!exerciseId) return null;
  const from = addDays(planStart, -365);
  const dates = new Map(sessions.filter((s) => !s.deleted_at).map((s) => [s.id, s.date]));
  const loads = sets
    .filter((s) => s.exercise_id === exerciseId && s.completed && s.kind !== 'warmup' && s.kind !== 'timed' && !isFlagged(s) && !s.deleted_at)
    .filter((s) => { const d = dates.get(s.session_id); return d != null && d >= from && d < planStart; })
    .map((s) => (s.unit === unit ? Number(s.load) : unit === 'lb' ? Number(s.load_kg) * 2.20462 : Number(s.load_kg)))
    .filter((x) => Number.isFinite(x) && x > 0);
  return loads.length ? Math.max(...loads) : null;
}
