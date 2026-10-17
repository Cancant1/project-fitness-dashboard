// The swap list from Part 1 of the plan ("Elbow and shoulder rules"). Pain rule step 3: sore the next
// morning, or worse at the next session → move that exercise one step down its list for 2 weeks.
// Keys are plan exercise keys where the exercise exists in the plan; the others are named variants.

import type { Unit } from './types';

export const SWAP_CHAINS: readonly (readonly string[])[] = [
  ['incline_db_press', 'db_bench_press', 'db_floor_press'],
  ['overhead_cable_triceps_extension', 'cross_body_triceps_extension', 'reverse_grip_pushdown'],
  ['bar_pushdown', 'reverse_grip_pushdown', 'rope_pushdown'],
  ['hammer_curl', 'underhand_cable_curl', 'preacher_curl'],
  ['single_arm_cable_curl', 'preacher_curl'], // Saturday's curl from 17 Oct 2026
  ['bayesian_curl', 'preacher_curl'], // "if the front of the shoulder hurts"
  ['weighted_pullup', 'lat_pulldown'],
  ['barbell_row', 'barbell_row_underhand', 'seated_cable_row'],
];

/** How a swap target reads in a sentence ("Swap to {label} for 2 weeks"). */
export const SWAP_LABEL: Record<string, string> = {
  incline_db_press: 'incline DB press',
  db_bench_press: 'neutral-grip DB bench press',
  db_floor_press: 'DB floor press',
  overhead_cable_triceps_extension: 'overhead extension',
  cross_body_triceps_extension: 'cross-body extension',
  reverse_grip_pushdown: 'reverse-grip pushdown',
  bar_pushdown: 'bar pushdown',
  rope_pushdown: 'rope pushdown',
  hammer_curl: 'hammer curl',
  underhand_cable_curl: 'underhand cable curl',
  single_arm_cable_curl: 'single-arm cable curl',
  preacher_curl: 'preacher curl',
  bayesian_curl: 'Bayesian curl',
  weighted_pullup: 'pull-up',
  lat_pulldown: 'neutral-handle pulldown',
  barbell_row: 'barbell row',
  barbell_row_underhand: 'underhand-grip barbell row',
  seated_cable_row: 'seated cable row',
};

/** Labels for swap targets and deload-variety alternatives that are not in SWAP_LABEL. */
const MORE_LABELS: Record<string, string> = {
  preacher_curl: 'kneeling cable curl (preacher-style)',
  incline_hammer_curl: 'seated high-incline hammer curl',
  db_lateral_raise: 'dumbbell lateral raise',
  heel_elevated_goblet_squat: 'heel-elevated goblet squat',
  single_leg_db_calf_raise: 'single-leg dumbbell calf raise',
  low_to_high_cable_flye: 'low-to-high cable flye',
  db_romanian_deadlift: 'dumbbell Romanian deadlift',
  seated_cable_leg_curl: 'seated cable leg curl',
  lying_db_hamstring_curl: 'lying DB hamstring curl',
  hanging_knee_raise: 'hanging knee raise',
  kneeling_cable_crunch: 'kneeling cable crunch',
  chest_supported_db_row: 'chest-supported DB row',
  single_arm_lat_pulldown: 'single-arm lat pulldown',
  prone_db_rear_delt_raise: 'prone DB rear delt raise',
  db_reverse_lunge: 'DB reverse lunge',
};

export const swapLabel = (key: string): string => MORE_LABELS[key] ?? SWAP_LABEL[key] ?? key.replace(/_/g, ' ');

// ---------- start loads for a swap (J-SWAPS, R1-17) ----------

export type SwapLoadBasis = 'history' | 'history_old' | 'same_dumbbells' | 'system_mass' | 'none';

export interface SwapStartLoad {
  /** null when nothing gives a number (basis 'none'): start light and calibrate. */
  load: number | null;
  unit: Unit;
  basis: SwapLoadBasis;
  /** One line for the swap message, e.g. "Start at 25 kg (your last 27.5 kg − 10%)". */
  text: string;
}

/** What swapStartLoad needs to know; build it with bridge.swapHistory() from the rows. */
export interface SwapHistory {
  today: string;
  /** Latest clean (unflagged, completed, non-warm-up) working set of an exercise key, its load in `unit`. */
  latest: (key: string) => { load: number; unit: Unit; date: string } | null;
  /** The current working load of a plan exercise (next prescription), in its slot unit. */
  current: (key: string) => { load: number; unit: Unit } | null;
  /** 7-day average bodyweight, kg. */
  bodyweightKg: number | null;
  /** Rounds a raw target load to a load that exists for the target exercise (rack, pins, 2.5 kg). */
  snap?: (key: string, load: number, unit: Unit) => number;
}

/** Dumbbell pressing chains: the same dumbbells carry over (flat vs incline 1RM differ ~3%; R-MARQUES-2025). */
const PRESSING = new Set(['incline_db_press', 'db_bench_press', 'db_floor_press']);
const LB_PER_KG = 2.20462;

/**
 * R1-17 start load for a swap from `fromKey` to `toKey`:
 * 1. the target's own history: 90% of its latest clean working load (80% if older than 6 months);
 * 2. otherwise, dumbbell pressing swaps keep the same dumbbells;
 * 3. pull-up → pulldown: 70% of system mass (bodyweight + belt), in the pulldown's unit;
 * 4. otherwise no number (basis 'none').
 * The first session of a swap is normal sets only, no rep-out (swapNote says so).
 */
export function swapStartLoad(fromKey: string, toKey: string, history: SwapHistory): SwapStartLoad {
  const snap = (load: number, unit: Unit) => (history.snap ? history.snap(toKey, load, unit) : Math.floor(load / 2.5) * 2.5);
  const fmt = (x: number, unit: Unit) => (unit === 'bodyweight' ? 'bodyweight' : `${x} ${unit}`);
  const last = history.latest(toKey);
  if (last && last.unit !== 'bodyweight') {
    const sixMonths = new Date(Date.parse(`${history.today}T00:00:00Z`) - 182 * 86_400_000).toISOString().slice(0, 10);
    const old = last.date < sixMonths;
    const load = snap(last.load * (old ? 0.8 : 0.9), last.unit);
    return {
      load, unit: last.unit, basis: old ? 'history_old' : 'history',
      text: `Start at ${fmt(load, last.unit)} (your last ${fmt(last.load, last.unit)} − ${old ? 20 : 10}%)`,
    };
  }
  if (PRESSING.has(fromKey) && PRESSING.has(toKey)) {
    const cur = history.current(fromKey);
    if (cur) return { load: cur.load, unit: cur.unit, basis: 'same_dumbbells', text: `Start with the same dumbbells (${fmt(cur.load, cur.unit)})` };
  }
  if (fromKey === 'weighted_pullup' && toKey === 'lat_pulldown' && history.bodyweightKg != null) {
    const added = history.current('weighted_pullup')?.load ?? 0;
    const kg = 0.7 * (history.bodyweightKg + added);
    const load = snap(kg * LB_PER_KG, 'lb');
    return { load, unit: 'lb', basis: 'system_mass', text: `Start at ${load} lb (70% of bodyweight + belt)` };
  }
  return { load: null, unit: 'kg', basis: 'none', text: 'Start light' };
}

/**
 * The next step down the swap list for an exercise, or null when it has none (end of a list, or not on it).
 * Shoulder adjustment from Part 1: cross-body extension → rope pushdown when the collarbone area hurts.
 */
export function nextSwap(exerciseKey: string, site?: string | null): string | null {
  if (exerciseKey === 'cross_body_triceps_extension' && site && site.includes('shoulder')) return 'rope_pushdown';
  for (const chain of SWAP_CHAINS) {
    const i = chain.indexOf(exerciseKey);
    if (i >= 0 && i < chain.length - 1) return chain[i + 1]!;
  }
  return null;
}
