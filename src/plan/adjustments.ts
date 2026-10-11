// Coach adjustments Mario accepted ("Apply"), stored in programs.rules.adjustments and folded into the
// programme here. Pure: no I/O, no clock (pass `today` to get swap notes for the swaps still running).
// See docs/COACH.md §7.

import { shiftAfterMissedWeek } from './engine';
import { swapLabel } from './swaps';
import type { MainLiftKey, Muscle, PlanState, ProgramDefinition, ProgramSlot, ProgramWeek } from './types';

/** Something the coach suggests that Mario can apply with one tap. */
export type CoachAction =
  /** New nutrition_targets row effective `from` (the next Monday): kcal ± 100, the rest copied. */
  | { kind: 'kcal'; delta: 100 | -100; from: string }
  /** That week becomes a deload (rep-outs missed two weeks running). */
  | { kind: 'deload_now'; weekNo: number }
  /** After checkpoint 1 is met: +1 set for these muscles in the extra-set weeks (8–9). */
  | { kind: 'extra_sets'; muscles: Muscle[]; fromWeek: number }
  /** Behind at a checkpoint (sessions and bodyweight fine): one more normal set (deadlift: a back-off set). */
  | { kind: 'main_lift_set'; lifts: MainLiftKey[]; fromWeek: number }
  /** A whole week was missed: repeat it, everything after moves a week (shiftAfterMissedWeek). */
  | { kind: 'repeat_week'; missedWeekNo: number }
  /** ≥ 2 weeks off: new training_maxes rows, both TMs −5% (reason missed_weeks). */
  | { kind: 'tm_reduce'; percent: 5 }
  /** Pain rule: one step down the swap list until `until`. Phase 1: advisory note only. */
  | { kind: 'swap'; exerciseKey: string; to: string; until: string };

export type AdjustmentKind = CoachAction['kind'];

export interface Adjustment {
  id: string;
  kind: AdjustmentKind;
  /** ISO timestamp (or date) it was applied. */
  created: string;
  /** The signal that suggested it, e.g. "body.rate". */
  signalId: string;
  data: CoachAction;
}

const KINDS: readonly AdjustmentKind[] = ['kcal', 'deload_now', 'extra_sets', 'main_lift_set', 'repeat_week', 'tm_reduce', 'swap'];

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

/** "Swap: neutral-grip DB bench press until 3 Nov" — the note a running swap adds to its slot. */
export function swapNote(to: string, until: string): string {
  return `Swap: ${swapLabel(to)} until ${shortDate(until)}`;
}

/**
 * Folds accepted adjustments into the programme, oldest first (week numbers in a later adjustment refer
 * to the programme as it was when it was applied):
 * - repeat_week → shiftAfterMissedWeek (a missed week is only repeated once);
 * - deload_now → that week's type becomes deload (A–D weeks only; later weeks unchanged);
 * - swap → with `today`, a note on the exercise's slots while the swap runs (until ≥ today);
 * - extra_sets, main_lift_set → PlanState (see adjustmentState); kcal, tm_reduce → written at apply time.
 * Returns a new programme; the input is untouched.
 */
export function applyAdjustments(program: ProgramDefinition, adjustments: readonly Adjustment[], today?: string): ProgramDefinition {
  let out: ProgramDefinition = program;
  for (const adj of chronological(adjustments)) {
    const a = adj.data;
    if (a.kind === 'repeat_week') {
      const week = out.weeks.find((w) => w.weekNo === a.missedWeekNo);
      if (week && !week.missed) out = shiftAfterMissedWeek(out, a.missedWeekNo);
    } else if (a.kind === 'deload_now') {
      const week = out.weeks.find((w) => w.weekNo === a.weekNo);
      if (week && TRAINING_TYPES.has(week.type)) {
        const deload: ProgramWeek = {
          ...week, type: 'deload', label: out.weekTypeLabels.deload, earlyDeload: true,
          notes: ['Deload taken early: rep-outs missed two weeks running.', ...week.notes],
        };
        out = { ...out, weeks: out.weeks.map((w) => (w.weekNo === a.weekNo ? deload : w)) };
      }
    } else if (a.kind === 'swap' && today !== undefined && a.until >= today) {
      const note = swapNote(a.to, a.until);
      const withNote = (s: ProgramSlot): ProgramSlot =>
        (s.exerciseKey === a.exerciseKey && !s.notes.includes(note) ? { ...s, notes: [note, ...s.notes] } : s);
      out = { ...out, days: out.days.map((d) => ({ ...d, slots: d.slots.map(withNote) })) };
    }
  }
  return out;
}

/** The part of the engine state that comes from adjustments: lagging muscles and extra main-lift sets. */
export function adjustmentState(adjustments: readonly Adjustment[]): Pick<PlanState, 'extraSetsMuscles' | 'addMainLiftSet'> {
  const out: Pick<PlanState, 'extraSetsMuscles' | 'addMainLiftSet'> = {};
  for (const adj of chronological(adjustments)) {
    const a = adj.data;
    if (a.kind === 'extra_sets') out.extraSetsMuscles = [...a.muscles];
    if (a.kind === 'main_lift_set') {
      out.addMainLiftSet = { ...out.addMainLiftSet };
      for (const lift of a.lifts) out.addMainLiftSet[lift] = true;
    }
  }
  return out;
}
