// Coach adjustments Mario accepted ("Apply"), stored in programs.rules.adjustments and folded into the
// programme here. Pure: no I/O, no clock (pass `today` to get swap notes for the swaps still running).
// See docs/COACH.md §7.

import { shiftAfterMissedWeek } from './engine';
import { swapLabel } from './swaps';
import type { ExtraSetSlot, MainLiftKey, Muscle, PlanState, ProgramDefinition, ProgramSlot, ProgramWeek, Unit } from './types';

/** Something the coach suggests that Mario can apply with one tap. */
export type CoachAction =
  /** New nutrition_targets row effective `from` (the next Monday): kcal ± 100, the rest copied. */
  | { kind: 'kcal'; delta: 100 | -100; from: string }
  /** That week becomes a deload (rep-outs missed, or joint aches rising two weeks running). */
  | { kind: 'deload_now'; weekNo: number }
  /**
   * After checkpoint 1 is met, in the extra-set weeks (8–9). With `targets` (R1-08): +1 set on each listed
   * (day, exercise): the arm package or the optional Tuesday rear delt set. Without (older rows): +1 set for each
   * muscle's first isolation slot.
   */
  | { kind: 'extra_sets'; muscles: Muscle[]; fromWeek: number; targets?: ExtraSetSlot[] }
  /**
   * Behind at a checkpoint (sessions and bodyweight fine), R1-07: squat → a light Friday squat 2 × 3 at 75% TM;
   * deadlift → 1–2 back-off sets × 3–5 at 80% of the top set; incline and pull-up → one more normal set.
   */
  | { kind: 'main_lift_set'; lifts: MainLiftKey[]; fromWeek: number }
  /** Old rule, kept for stored rows only (never offered since R1-01): repeat a missed week (shiftAfterMissedWeek). */
  | { kind: 'repeat_week'; missedWeekNo: number }
  /** R1-01: week 5 or 6 missed → train through the week-7 deload (it becomes a normal C week). */
  | { kind: 'skip_deload'; weekNo: number }
  /** 14–27 days off: new training_maxes rows, both TMs −5% (reason missed_weeks). */
  | { kind: 'tm_reduce'; percent: 5 }
  /** ≥ 28 days off: the next session of each TM lift is a calibration rep-out at 75% of the last TM. */
  | { kind: 'recalibrate' }
  /** Pain rule: one step down the swap list until `until`. Phase 1: advisory note only. `startLoad` per J-SWAPS (R1-17). */
  | { kind: 'swap'; exerciseKey: string; to: string; until: string; startLoad?: number; unit?: Unit }
  /** J-PAINRULE trend: morning pain rising 2 weeks running → that exercise's sets × (1 − fraction) until `until`. */
  | { kind: 'cut_sets'; exerciseKey: string; fraction: number; until: string };

export type AdjustmentKind = CoachAction['kind'];

export interface Adjustment {
  id: string;
  kind: AdjustmentKind;
  /** ISO timestamp (or date) it was applied. */
  created: string;
  /** The signal that suggested it, e.g. "body.rate". */
  signalId: string;
  data: CoachAction;
  /**
   * Rows the action wrote outside the programme (kcal → nutrition_targets, tm_reduce → training_maxes), so Undo
   * can take them back: `restore` = the row's previous values when an existing row was updated, else it is removed.
   */
  writes?: { table: 'nutrition_targets' | 'training_maxes'; id: string; restore?: Record<string, unknown> }[];
}

const KINDS: readonly AdjustmentKind[] = [
  'kcal', 'deload_now', 'extra_sets', 'main_lift_set', 'repeat_week', 'skip_deload', 'tm_reduce', 'recalibrate', 'swap', 'cut_sets',
];

/** The adjustments stored on a programme row's `rules` (tolerant of missing or malformed data). */
export function adjustmentsOf(rules: unknown): Adjustment[] {
  const list = (rules as { adjustments?: unknown } | null | undefined)?.adjustments;
  if (!Array.isArray(list)) return [];
  return list.filter((a): a is Adjustment => {
    const x = a as Partial<Adjustment> | null;
    return !!x && typeof x.id === 'string' && typeof x.created === 'string' && KINDS.includes(x.kind as AdjustmentKind)
      && !!x.data && (x.data as CoachAction).kind === x.kind;
  });
}

/** Oldest first; ties keep their stored order. */
function chronological(adjustments: readonly Adjustment[]): Adjustment[] {
  return adjustments.map((a, i) => ({ a, i }))
    .sort((x, y) => x.a.created.localeCompare(y.a.created) || x.i - y.i)
    .map((x) => x.a);
}

const TRAINING_TYPES = new Set(['A', 'B', 'C', 'D']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''}`;

/**
 * "Swap: neutral-grip DB bench press until 3 Nov" — the note a running swap adds to its slot. With a start load
 * (R1-17): "… until 3 Nov. Start at 25 kg; first session normal sets only, no rep-out."
 */
export function swapNote(to: string, until: string, startLoad?: number, unit?: Unit): string {
  const base = `Swap: ${swapLabel(to)} until ${shortDate(until)}`;
  if (startLoad == null) return base;
  const u = unit === 'bodyweight' ? '' : ` ${unit ?? 'kg'}`;
  return `${base}. Start at ${startLoad}${u}; first session normal sets only, no rep-out.`;
}

/**
 * Folds accepted adjustments into the programme, oldest first (week numbers in a later adjustment refer
 * to the programme as it was when it was applied):
 * - repeat_week (old rows only) → shiftAfterMissedWeek (a missed week is only repeated once);
 * - skip_deload → that deload becomes a normal C week (week 5 or 6 was missed);
 * - deload_now → that week's type becomes deload (A–D weeks only; later weeks unchanged);
 * - swap → with `today`, a note on the exercise's slots while the swap runs (until ≥ today);
 * - cut_sets → a set cut on the exercise's slots, from the day it was applied until `until`;
 * - extra_sets, main_lift_set → PlanState (see adjustmentState); recalibrate → PlanState (bridge.planState);
 *   kcal, tm_reduce → written at apply time.
 * Returns a new programme; the input is untouched.
 */
export function applyAdjustments(program: ProgramDefinition, adjustments: readonly Adjustment[], today?: string): ProgramDefinition {
  let out: ProgramDefinition = program;
  for (const adj of chronological(adjustments)) {
    const a = adj.data;
    if (a.kind === 'repeat_week') {
      const week = out.weeks.find((w) => w.weekNo === a.missedWeekNo);
      if (week && !week.missed) out = shiftAfterMissedWeek(out, a.missedWeekNo);
    } else if (a.kind === 'skip_deload') {
      const week = out.weeks.find((w) => w.weekNo === a.weekNo);
      if (week && week.type === 'deload') {
        const before = out.weeks.find((w) => w.weekNo === a.weekNo - 1);
        // "Same notes as week 6", without its checkpoint line (the checkpoint stays at the end of week 6).
        const carried = (before?.notes ?? []).filter((n) => !/checkpoint/i.test(n));
        const training: ProgramWeek = {
          ...week, type: 'C', label: out.weekTypeLabels.C, deloadSkipped: true,
          notes: [`Normal training week instead of the deload: week ${a.weekNo - 2} or ${a.weekNo - 1} was missed, which already counted as a deload.`, ...carried],
        };
        out = { ...out, weeks: out.weeks.map((w) => (w.weekNo === a.weekNo ? training : w)) };
      }
    } else if (a.kind === 'cut_sets') {
      const cut = { fraction: a.fraction, from: adj.created.slice(0, 10), until: a.until };
      const withCut = (s: ProgramSlot): ProgramSlot => (s.exerciseKey === a.exerciseKey ? { ...s, setCuts: [...(s.setCuts ?? []), cut] } : s);
      out = { ...out, days: out.days.map((d) => ({ ...d, slots: d.slots.map(withCut) })) };
    } else if (a.kind === 'deload_now') {
      const week = out.weeks.find((w) => w.weekNo === a.weekNo);
      if (week && TRAINING_TYPES.has(week.type)) {
        const why = adj.signalId.startsWith('joints') ? 'joint aches rising two weeks running' : 'rep-outs missed';
        const deload: ProgramWeek = {
          ...week, type: 'deload', label: out.weekTypeLabels.deload, earlyDeload: true,
          notes: [`Deload taken early: ${why}.`, ...week.notes],
        };
        out = { ...out, weeks: out.weeks.map((w) => (w.weekNo === a.weekNo ? deload : w)) };
      }
    } else if (a.kind === 'swap' && today !== undefined && a.until >= today) {
      const note = swapNote(a.to, a.until, a.startLoad, a.unit);
      const withNote = (s: ProgramSlot): ProgramSlot =>
        (s.exerciseKey === a.exerciseKey && !s.notes.includes(note) ? { ...s, notes: [note, ...s.notes] } : s);
      out = { ...out, days: out.days.map((d) => ({ ...d, slots: d.slots.map(withNote) })) };
    }
  }
  return out;
}

/**
 * The part of the engine state that comes from adjustments: extra sets and extra main-lift sets.
 * extra_sets with targets accumulate (the arm package plus the optional rear delt set); an older extra_sets
 * without targets sets the lagging muscles (the latest wins).
 */
export function adjustmentState(adjustments: readonly Adjustment[]): Pick<PlanState, 'extraSetsMuscles' | 'addMainLiftSet' | 'extraSetTargets'> {
  const out: Pick<PlanState, 'extraSetsMuscles' | 'addMainLiftSet' | 'extraSetTargets'> = {};
  for (const adj of chronological(adjustments)) {
    const a = adj.data;
    if (a.kind === 'extra_sets' && a.targets?.length) {
      const have = out.extraSetTargets ?? [];
      const add = a.targets.filter((t) => !have.some((h) => h.dayKey === t.dayKey && h.exerciseKey === t.exerciseKey));
      out.extraSetTargets = [...have, ...add];
    } else if (a.kind === 'extra_sets') out.extraSetsMuscles = [...a.muscles];
    if (a.kind === 'main_lift_set') {
      out.addMainLiftSet = { ...out.addMainLiftSet };
      for (const lift of a.lifts) out.addMainLiftSet[lift] = true;
    }
  }
  return out;
}
