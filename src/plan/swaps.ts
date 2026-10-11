// The swap list from Part 1 of the plan ("Elbow and shoulder rules"). Pain rule step 3: sore the next
// morning, or worse at the next session → move that exercise one step down its list for 2 weeks.
// Keys are plan exercise keys where the exercise exists in the plan; the others are named variants.

export const SWAP_CHAINS: readonly (readonly string[])[] = [
  ['incline_db_press', 'db_bench_press', 'db_floor_press'],
  ['overhead_cable_triceps_extension', 'cross_body_triceps_extension', 'reverse_grip_pushdown'],
  ['bar_pushdown', 'reverse_grip_pushdown', 'rope_pushdown'],
  ['hammer_curl', 'underhand_cable_curl', 'preacher_curl'],
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
  preacher_curl: 'preacher curl',
  bayesian_curl: 'Bayesian curl',
  weighted_pullup: 'pull-up',
  lat_pulldown: 'neutral-handle pulldown',
  barbell_row: 'barbell row',
  barbell_row_underhand: 'underhand-grip barbell row',
  seated_cable_row: 'seated cable row',
};

export const swapLabel = (key: string): string => SWAP_LABEL[key] ?? key.replace(/_/g, ' ');

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
