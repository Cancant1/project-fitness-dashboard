// Mario's gym: the weights that physically exist (from his old app's equipment export, 11 Oct 2026).
// Every prescribed load and every "add a step" must land on one of these.

export const GYM = {
  dumbbellsKg: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50],
  platesKg: [20, 10, 5, 2.5, 1.25],
  /** Single height-adjustable pulley, pin stack (lb). */
  singlePulleyLb: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200],
  /** Each of the two height-adjustable pulleys, pin stack (lb); the steps are uneven. */
  dualPulleyLb: [10, 15, 20, 30, 40, 50, 65, 80, 95, 110, 125, 140, 155, 170, 185, 200],
  /** Seated row and lat pulldown stacks: not in the export; his logs show 10 lb steps. */
  rowLb: range(10, 300, 10),
  pulldownLb: range(10, 300, 10)
} as const;

export type Stack = "single" | "dual" | "dual_pair" | "row" | "pulldown";

/** Which stack each plan cable exercise is loaded on. */
export const STACK_OF: Record<string, Stack> = {
  cable_lateral_raise: "single",
  cross_body_triceps_extension: "single",
  overhead_cable_triceps_extension: "single",
  reverse_grip_pushdown: "single",
  underhand_cable_curl: "single",
  single_arm_cable_curl: "single",
  rope_pushdown: "single",
  preacher_curl: "single",
  kneeling_cable_crunch: "single",
  cable_leg_extension: "single",
  seated_cable_leg_curl: "single",
  cable_external_rotation: "single",
  cable_serratus_punch: "single",
  face_pull: "single",
  chest_cable_flye: "dual",
  bayesian_curl: "dual",
  cable_rear_delt_fly: "dual",
  cable_calf_raise: "dual_pair",
  seated_cable_row: "row",
  lat_pulldown: "pulldown"
};

export const STACK_LABEL: Record<Stack, string> = {
  single: "the single pulley",
  dual: "the dual pulleys, per side",
  dual_pair: "both dual pulleys, same pin each side",
  row: "the seated row",
  pulldown: "the lat pulldown"
};

/** All loads available on a stack, ascending. The calf bar uses both dual stacks at the same pin. */
export function stackWeights(stack: Stack): number[] {
  switch (stack) {
    case "single": return [...GYM.singlePulleyLb];
    case "dual": return [...GYM.dualPulleyLb];
    case "dual_pair": return GYM.dualPulleyLb.map((w) => w * 2);
    case "row": return [...GYM.rowLb];
    case "pulldown": return [...GYM.pulldownLb];
  }
}

export function weightsFor(exerciseKey: string): number[] | null {
  const s = STACK_OF[exerciseKey];
  return s ? stackWeights(s) : null;
}

/** Highest available load ≤ target (or the lightest if all are heavier). */
export function snapDown(target: number, weights: readonly number[]): number {
  const below = weights.filter((w) => w <= target + 1e-9);
  return below.length ? below[below.length - 1]! : weights[0]!;
}

/** Next available load above (dir 1) or below (dir −1) the current one. */
export function stepOnStack(current: number, weights: readonly number[], dir: 1 | -1): number {
  if (dir === 1) return weights.find((w) => w > current + 1e-9) ?? current;
  const lower = weights.filter((w) => w < current - 1e-9);
  return lower.length ? lower[lower.length - 1]! : current;
}

/** "125 + 125 lb" for the calf bar, "50 lb" otherwise. */
export function pinLabel(exerciseKey: string, load: number): string {
  return STACK_OF[exerciseKey] === "dual_pair" ? `${load / 2} + ${load / 2} lb` : `${load} lb`;
}

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}
