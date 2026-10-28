// Plan engine: pure functions over a ProgramDefinition. No I/O, no clock.
// Rules cite docs/plan/Strength_Return_Plan.md; defaults for its ambiguities are in docs/REBUILD_PLAN.md §2.

import type {
  Checkpoint,
  ConditioningRule,
  DayKey,
  Effort,
  Equipment,
  EquipmentProfile,
  MainLiftKey,
  Muscle,
  PlanState,
  PrescribedConditioning,
  PrescribedDay,
  PrescribedExercise,
  PrescribedSet,
  ProgramDay,
  ProgramDefinition,
  ProgramSlot,
  ProgramWeek,
  RideRule,
  StepLiftDefinition,
  StepLiftKey,
  TmLiftKey,
  Unit,
  WeekType,
  WeekTypeRule,
  WristLadder,
} from './types';

const EPS = 1e-9;
const round2 = (x: number): number => Math.round(x * 100) / 100;

/** Floor to a multiple of `step`, tolerant of float noise (200 × 0.85 = 169.999…). */
export function floorTo(x: number, step: number): number {
  return round2(Math.floor(x / step + EPS) * step);
}
function nearestTo(x: number, step: number): number {
  return round2(Math.round(x / step) * step);
}

// ---------- equipment ----------

export function buildDumbbellRack(): number[] {
  const rack: number[] = [];
  for (let w = 2; w <= 20; w += 2) rack.push(w);
  for (let w = 22.5; w <= 50; w += 2.5) rack.push(w);
  return rack;
}

export const DEFAULT_EQUIPMENT: EquipmentProfile = {
  barKg: 20,
  platesKg: [20, 10, 5, 2.5, 1.25],
  dumbbellRackKg: buildDumbbellRack(),
  cableStepLb: 5,
  cableStepKg: 2.5,
  beltStepKg: 2.5,
  barbellStepKg: 2.5,
};

/** Barbell loads round down to 2.5 kg. */
export function roundBarbell(kg: number, step = DEFAULT_EQUIPMENT.barbellStepKg): number {
  return floorTo(kg, step);
}

/** Heaviest dumbbell on the rack that is ≤ kg, or null if the rack has nothing that light. */
export function dumbbellFloor(kg: number, rack: readonly number[] = DEFAULT_EQUIPMENT.dumbbellRackKg): number | null {
  const lower = rack.filter((w) => w <= kg + EPS);
  return lower.length ? Math.max(...lower) : null;
}

/** Next dumbbell up/down on the rack; stays put at either end. */
export function dumbbellStep(kg: number, dir: -1 | 0 | 1, rack: readonly number[] = DEFAULT_EQUIPMENT.dumbbellRackKg): number {
  const sorted = [...rack].sort((a, b) => a - b);
  if (dir > 0) return sorted.find((w) => w > kg + 0.01) ?? kg;
  if (dir < 0) return sorted.filter((w) => w < kg - 0.01).at(-1) ?? kg;
  return kg;
}

/** Added belt load ± one step, never below bodyweight (0). */
export function pullupStep(addedKg: number, dir: -1 | 0 | 1, step = DEFAULT_EQUIPMENT.beltStepKg): number {
  return Math.max(0, round2(addedKg + step * dir));
}

/** Smallest load step for double progression: a number to add, or a list of available loads. */
export function progressionStep(equipment: Equipment, unit: Unit, profile: EquipmentProfile = DEFAULT_EQUIPMENT): number | readonly number[] {
  const cable = unit === 'lb' ? profile.cableStepLb : profile.cableStepKg;
  switch (equipment) {
    case 'barbell': return profile.barbellStepKg;
    case 'dumbbell': return profile.dumbbellRackKg;
    case 'belt': return profile.beltStepKg;
    case 'cable': return cable;
    case 'cable_pair': return 2 * cable; // load is the total of two stacks
    case 'bodyweight': return 0;
  }
}

export interface PlateLoadout {
  /** Plates on ONE side, heaviest first. */
  perSide: number[];
  loadedKg: number;
  /** Requested minus achievable total (0 when exact). */
  shortfallKg: number;
  belowBar: boolean;
}

export function platesPerSide(totalKg: number, barKg = DEFAULT_EQUIPMENT.barKg,
  plates: readonly number[] = DEFAULT_EQUIPMENT.platesKg): PlateLoadout {
  if (totalKg < barKg - EPS) return { perSide: [], loadedKg: barKg, shortfallKg: 0, belowBar: true };
  let remaining = (totalKg - barKg) / 2;
  const perSide: number[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (remaining >= p - EPS) {
      perSide.push(p);
      remaining -= p;
    }
  }
  const loadedKg = round2(barKg + 2 * perSide.reduce((s, p) => s + p, 0));
  return { perSide, loadedKg, shortfallKg: round2(totalKg - loadedKg), belowBar: false };
}

// ---------- training max ----------

/** Epley estimated 1RM; only for sets of 1–12 reps (plan's Methods). */
export function e1rm(load: number, reps: number): number | null {
  if (!Number.isFinite(load) || !Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  return load * (1 + reps / 30);
}

/** TM = load × (1 + clean reps ÷ 30), rounded down to 2.5 kg. 100 × 12 → 140. */
export function trainingMaxFromSet(loadKg: number, reps: number): number {
  return roundBarbell(loadKg * (1 + reps / 30));
}

/** Rep-out table: ≤−2 → −5%, −1 → −2%, 0 → +1%, +1 → +2%, +2 → +3%, ≥+3 → +4%. */
export function tmChangePercent(repsVsTarget: number): number {
  if (repsVsTarget <= -2) return -5;
  if (repsVsTarget === -1) return -2;
  if (repsVsTarget === 0) return 1;
  if (repsVsTarget === 1) return 2;
  if (repsVsTarget === 2) return 3;
  return 4;
}

/**
 * New TM after a squat/deadlift rep-out. Default 2: floor to 2.5 kg like the TM formula
 * (the plan page's script rounds to nearest; pass 'nearest' to reproduce it).
 */
export function nextTrainingMax(tm: number, cleanReps: number, target: number, rounding: 'floor' | 'nearest' = 'floor'): number {
  const raw = tm * (1 + tmChangePercent(cleanReps - target) / 100);
  return rounding === 'floor' ? roundBarbell(raw) : nearestTo(raw, 2.5);
}

/** "Missed 2 weeks or more: lower every TM by 5%." */
export function reduceTrainingMax(tm: number, percent = 5): number {
  return roundBarbell(tm * (1 - percent / 100));
}

/** Past this many clean reps the Epley formula is rough (science check A2). */
export const PROVISIONAL_REPS = 12;
/** Note written on a training_maxes row set from a >12-rep calibration rep-out. */
export const PROVISIONAL_NOTE = 'provisional (>12 reps)';

export interface RepOutTrainingMax {
  tm: number;
  reason: 'calibration' | 'rep_out';
  /** Set from a calibration (or first) rep-out of more than 12 clean reps: TM = load × (1 + 12/30). */
  provisional: boolean;
  /** R1-03: the TM was at or past the old-best e1RM, so the change was capped (hit → hold, beat → ≤ +2.5 kg). */
  capped?: boolean;
}

/** R1-03: once the TM reaches the old best, a beat adds at most this much. */
export const TM_CAP_STEP_KG = 2.5;

/**
 * The training max a squat/deadlift rep-out leads to.
 * - Calibration week, or no TM yet: TM = load × (1 + reps/30), floored to 2.5. Past 12 clean reps the
 *   TM is provisional and uses 12 reps (§6.2: conservative on purpose, so week-1 loads stay safe).
 * - Otherwise the rep-out table moves the previous TM (rounded to the nearest 2.5, as the plan page does).
 * - R1-03 (`oldBest`): once the previous TM ≥ the old-best e1RM, a plain hit holds the TM and any beat adds at
 *   most +2.5 kg; misses move it as usual.
 */
export function trainingMaxAfterRepOut(load: number, reps: number,
  opts: { previous?: number | null; target?: number | null; calibration?: boolean; oldBest?: number | null } = {}): RepOutTrainingMax {
  if (opts.calibration || opts.previous == null) {
    const provisional = reps > PROVISIONAL_REPS;
    return { tm: trainingMaxFromSet(load, provisional ? PROVISIONAL_REPS : reps), reason: 'calibration', provisional };
  }
  const prev = opts.previous;
  const diff = reps - (opts.target ?? 0);
  const tm = nextTrainingMax(prev, reps, opts.target ?? 0, 'nearest');
  if (opts.oldBest != null && prev >= opts.oldBest - EPS && diff >= 0) {
    const capped = diff === 0 ? prev : Math.min(tm, round2(prev + TM_CAP_STEP_KG));
    return { tm: capped, reason: 'rep_out', provisional: false, capped: true };
  }
  return { tm, reason: 'rep_out', provisional: false };
}

// ---------- step lifts and accessories ----------

export interface StepResult {
  load: number;
  /** Steps: 2 = two steps up (R1-04), 1 up, 0 same, −1 down. */
  direction: -1 | 0 | 1 | 2;
}

export type StepRule = Pick<StepLiftDefinition, 'stepUpAtReps' | 'stepDownAtReps' | 'doubleStepAtReps'>;

/** R1-04 defaults: incline ≥16 → +2 dumbbells; pull-up ≥12 → +5 kg; ≥10 up, 6–9 same, ≤5 down. */
export const STEP_RULES: Record<StepLiftKey, StepRule> = {
  incline_db_press: { stepUpAtReps: 10, stepDownAtReps: 5, doubleStepAtReps: 16 },
  weighted_pullup: { stepUpAtReps: 10, stepDownAtReps: 5, doubleStepAtReps: 12 },
};

/**
 * Incline DB / pull-up after a rep-out (P-PROG-STEP, R1-04):
 * incline ≥16 → two dumbbells up, ≥10 → one, 6–9 same, ≤5 one lighter;
 * pull-up ≥12 → +5 kg, ≥10 → +2.5, 6–9 same, ≤5 → −2.5.
 */
export function incrementAfterRepOut(lift: StepLiftKey, load: number, cleanReps: number,
  profile: EquipmentProfile = DEFAULT_EQUIPMENT, rule: StepRule = STEP_RULES[lift]): StepResult {
  const direction: StepResult['direction'] = rule.doubleStepAtReps != null && cleanReps >= rule.doubleStepAtReps ? 2
    : cleanReps >= rule.stepUpAtReps ? 1 : cleanReps <= rule.stepDownAtReps ? -1 : 0;
  let next = load;
  if (direction === 2) next = stepLiftLoad(lift, stepLiftLoad(lift, load, 1, profile), 1, profile);
  else next = stepLiftLoad(lift, load, direction, profile);
  return { load: next, direction };
}

function stepLiftLoad(lift: StepLiftKey, load: number, dir: -1 | 0 | 1, profile: EquipmentProfile): number {
  return lift === 'incline_db_press'
    ? dumbbellStep(load, dir, profile.dumbbellRackKg)
    : pullupStep(load, dir, profile.beltStepKg);
}

/**
 * E5 stuck rule (incline): `stuck.after` rep-outs in a row at the same load with 6–9 clean reps (between the
 * step-down and step-up thresholds) → the next normal sets use stuck.reps[0] reps, one more stuck rep-out →
 * reps[1], and so on (the last value holds). Any load change resets it. `history` is oldest first.
 * Returns undefined when not stuck.
 */
export function stuckNormalReps(history: readonly { load: number; reps: number }[],
  def: Pick<StepLiftDefinition, 'stepUpAtReps' | 'stepDownAtReps' | 'stuck'>): number | undefined {
  const rule = def.stuck;
  const last = history.at(-1);
  if (!rule || !last || !rule.reps.length) return undefined;
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]!;
    if (Math.abs(h.load - last.load) > EPS || h.reps >= def.stepUpAtReps || h.reps <= def.stepDownAtReps) break;
    n++;
  }
  if (n < rule.after) return undefined;
  return rule.reps[Math.min(n - rule.after, rule.reps.length - 1)];
}

/** M-E1RM / D-SYSTEM-MASS: the pull-up's e1RM uses system mass (7-day average bodyweight + belt). */
export function systemMassE1rm(addedKg: number, reps: number, bodyweightKg: number): number | null {
  return e1rm(bodyweightKg + addedKg, reps);
}

export interface LoggedSet {
  load: number;
  reps: number | null;
}

/** A load step: a fixed increment (barbell 2.5 kg, 0 = cannot load), or the list of loads that exist (rack, pin stack). */
export type LoadSteps = number | readonly number[];

/** `times` steps up (dir 1) or down (dir −1) from `load`; stays put at the ends of a list and never goes below 0. */
export function stepLoad(load: number, step: LoadSteps, dir: -1 | 1, times = 1): number {
  let x = load;
  for (let i = 0; i < times; i++) {
    if (typeof step === 'number') {
      x = step > 0 ? Math.max(0, round2(x + dir * step)) : x;
    } else {
      const sorted = [...step].sort((a, b) => a - b);
      x = dir > 0 ? (sorted.find((w) => w > x + 0.01) ?? x) : (sorted.filter((w) => w < x - 0.01).at(-1) ?? x);
    }
  }
  return x;
}

/** The lightest available load at or above `x` (the heaviest one if nothing is that heavy). */
export function ceilLoad(x: number, step: LoadSteps): number {
  if (typeof step === 'number') return step > 0 ? round2(Math.ceil(x / step - EPS) * step) : x;
  const sorted = [...step].sort((a, b) => a - b);
  return sorted.find((w) => w >= x - EPS) ?? sorted.at(-1) ?? x;
}

/**
 * Double progression: when every set reached the top of the range, add the smallest step next session.
 * `step` is an increment, or a list of available loads (dumbbell rack).
 */
export function doubleProgression(lastSets: readonly LoggedSet[], repRange: readonly [number, number],
  step: LoadSteps): { load: number; increased: boolean } | null {
  if (lastSets.length === 0) return null;
  const load = Math.max(...lastSets.map((s) => s.load));
  const allTop = lastSets.every((s) => s.reps !== null && s.reps >= repRange[1]);
  if (!allTop) return { load, increased: false };
  const next = stepLoad(load, step, 1);
  return { load: next, increased: next > load };
}

/** §6.3: every failure set at least this many reps above the range top → +2 steps instead of +1. */
export const OVERSHOOT_REPS = 5;

/**
 * Failure-scheme isolation: double progression, except that when every set overshoots the range top by
 * ≥ 5 reps the load jumps two steps (§6.3).
 */
export function failureProgression(lastSets: readonly LoggedSet[], repRange: readonly [number, number],
  step: LoadSteps): { load: number; steps: 0 | 1 | 2 } | null {
  if (lastSets.length === 0) return null;
  const load = Math.max(...lastSets.map((s) => s.load));
  const hi = repRange[1];
  const overshoot = lastSets.every((s) => s.reps !== null && s.reps >= hi + OVERSHOOT_REPS);
  const allTop = lastSets.every((s) => s.reps !== null && s.reps >= hi);
  const steps: 0 | 1 | 2 = overshoot ? 2 : allTop ? 1 : 0;
  return { load: steps ? stepLoad(load, step, 1, steps) : load, steps };
}

/** A load increase above this share of the current load is a big jump (single pulley 20 → 30 lb is +50%). */
export const BIG_JUMP = 0.25;

export const isBigJump = (from: number, to: number): boolean => from > 0 && to > from * (1 + BIG_JUMP) + 1e-9;

/**
 * Jump cap for accessories (DECISIONS 2026-10-17). An increase is never more than +25% at once. When one step is
 * already more than that (coarse pins at a light load), the step waits until the last session reached the range
 * top + 5; until then the load stays and the reps keep climbing. Decreases and holds are left alone.
 *
 * "Reached" (DECISIONS 2026-10-19): the AVERAGE of the sets, because set 2 after a failure set always loses reps,
 * so "every set" kept a lift stuck while set 1 kept climbing. Elbow-loading moves keep the strict every-set rule
 * (`average: false`): a +50% pin on a sore elbow waits for every set.
 */
export function capJump(lastLoad: number, next: number, lastSets: readonly LoggedSet[], repRange: readonly [number, number],
  step: LoadSteps, opts: { average?: boolean } = {}): number {
  if (!isBigJump(lastLoad, next)) return next;
  const one = stepLoad(lastLoad, step, 1);
  if (!isBigJump(lastLoad, one)) return one;
  return bigJumpEarned(lastSets, repRange, opts.average ?? true) ? one : lastLoad;
}

/** The jump-cap test: every set, or the average of the sets, at the range top + 5. Unlogged reps count as 0. */
export function bigJumpEarned(lastSets: readonly LoggedSet[], repRange: readonly [number, number], average: boolean): boolean {
  if (lastSets.length === 0) return false;
  const aim = repRange[1] + OVERSHOOT_REPS;
  if (!average) return lastSets.every((s) => s.reps !== null && s.reps >= aim);
  return lastSets.reduce((t, s) => t + (s.reps ?? 0), 0) / lastSets.length >= aim - 1e-9;
}

/** R2-04 (DECISIONS 2026-10-24): set 1 of a non-elbow failure isolation at this many reps or more is far too light. */
export const CATCH_UP_REPS = 35;

/**
 * R2-04 catch-up rule: when set 1 reached CATCH_UP_REPS, the next session goes up two steps from the last load, past
 * the jump cap (growth data in trained lifters stop at ~35 reps; K-REP-CEILING). Never lowers `next`. Elbow-loading
 * moves don't use it (the caller skips them).
 */
export function catchUpLoad(lastLoad: number, next: number, firstSetReps: number | null, step: LoadSteps): number {
  if (firstSetReps == null || firstSetReps < CATCH_UP_REPS) return next;
  return Math.max(next, stepLoad(lastLoad, step, 1, 2));
}

export type ApreJump = 'plus7_5' | 'plus5' | 'plus1' | 'minus1' | 'same';

/**
 * §6.1 (NEW 11 Oct 2026), APRE-style jumps for "last set rep-out" accessories (RDL, seated row, Bulgarian
 * split squat, barbell row, DB bench). The rep-out reps against the range top `hi` set the next load:
 * - ≥ hi + 7 → +7.5%, at least one step
 * - hi + 2 … hi + 6 → +5%, at least one step
 * - hi … hi + 1 with every normal set at hi → +1 step (double progression, unchanged)
 * - below the range bottom → −1 step
 * - otherwise the same load.
 * Percent jumps round UP to the next available load: the spec's own example (RDL 80 × 20 → 87.5) needs it,
 * since 80 × 1.075 = 86 lies nearer 85.
 * `tapered` (R1-05): once the load is back at the last logged working load, the jumps are +5% (≥ hi + 7) and
 * +2.5% (hi + 2 … hi + 6); the jump names stay 'plus7_5' / 'plus5' (the table rows).
 */
export function apreNextLoad(load: number, repOutReps: number, normalReps: readonly (number | null)[],
  repRange: readonly [number, number], step: LoadSteps, opts: { tapered?: boolean } = {}): { load: number; jump: ApreJump } {
  const [lo, hi] = repRange;
  const percent = (p: number) => Math.max(ceilLoad(load * (1 + p / 100), step), stepLoad(load, step, 1));
  // R1-05 (E6): back at the last logged working load → +5% / +2.5% instead of +7.5% / +5% (still ≥ 1 step).
  const [big, small] = opts.tapered ? [5, 2.5] : [7.5, 5];
  if (repOutReps >= hi + 7) return { load: percent(big), jump: 'plus7_5' };
  if (repOutReps >= hi + 2) return { load: percent(small), jump: 'plus5' };
  if (repOutReps >= hi && normalReps.every((r) => r !== null && r >= hi)) return { load: stepLoad(load, step, 1), jump: 'plus1' };
  if (repOutReps < lo) return { load: stepLoad(load, step, -1), jump: 'minus1' };
  return { load, jump: 'same' };
}

// ---------- warm-ups ----------

export interface WarmupOptions {
  /** Test week: squat/deadlift warm up in singles at 60/75/85% of the goal. */
  test?: boolean;
  rack?: readonly number[];
  beltStepKg?: number;
}

/**
 * Squat and upper mains: empty bar × 8, then ~50% × 5, 70% × 3, 85% × 1 of the working load.
 * Deadlift: 60% × 3, 75% × 2, 90% × 1 of the top set.
 * Barbell warm-ups round to 20 kg (last step 10 kg): 100 → bar, 60, 80, 90. Dumbbells have no "empty bar" step and round down to the rack; the pull-up warms up with one
 * bodyweight set × 5, plus a single at half the added load from +15 kg. Steps that round onto the bar, onto an earlier
 * step or up to the working load are dropped.
 */
export function warmupRamp(lift: MainLiftKey, workingLoadKg: number, barKg = DEFAULT_EQUIPMENT.barKg,
  opts: WarmupOptions = {}): PrescribedSet[] {
  const rack = opts.rack ?? DEFAULT_EQUIPMENT.dumbbellRackKg;
  const beltStep = opts.beltStepKg ?? DEFAULT_EQUIPMENT.beltStepKg;
  const isBarbell = lift === 'squat' || lift === 'deadlift';
  const singles = opts.test === true && isBarbell;

  const steps: Array<[number, number]> = singles
    ? [[0.6, 1], [0.75, 1], [0.85, 1]]
    : lift === 'deadlift'
      ? [[0.6, 3], [0.75, 2], [0.9, 1]]
      : [[0.5, 5], [0.7, 3], [0.85, 1]];

  // Barbell warm-ups load the way Mario does: pairs of 20s/10s (20 kg jumps), last step to the nearest 10.
  const round = (x: number, last: boolean): number | null =>
    lift === 'incline_db_press' ? dumbbellFloor(x, rack)
      : last ? Math.round(x / 10) * 10 : Math.round(x / 20) * 20;

  const out: PrescribedSet[] = [];
  const add = (load: number, reps: number, note?: string): void => {
    out.push({ kind: 'warmup', load, unit: 'kg', reps, ...(note ? { note } : {}) });
  };
  if (lift === 'squat' && !singles) add(barKg, 8, 'Empty bar');
  // 28 Oct 2026 (P-WARMUP): the pull-up warms up at bodyweight; +2.5/+5 kg steps add nothing next to his bodyweight.
  // From +15 kg the jump gets big, so one single at half the added load follows.
  if (lift === 'weighted_pullup') {
    if (workingLoadKg > 0) add(0, 5, 'Bodyweight');
    if (workingLoadKg >= 15 - EPS) add(floorTo(workingLoadKg / 2, beltStep), 1);
    return out;
  }

  for (const [k, [pct, reps]] of steps.entries()) {
    const load = round(workingLoadKg * pct, k === steps.length - 1);
    if (load === null || load >= workingLoadKg - EPS) continue;
    if (isBarbell && load <= barKg + EPS) continue;
    if (out.some((s) => Math.abs(s.load - load) < EPS)) continue;
    add(load, reps, singles ? `${Math.round(pct * 100)}% of the goal` : undefined);
  }
  return out;
}

// ---------- calendar ----------

const DAY_MS = 86_400_000;

function isoToDays(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
}

export function addDays(iso: string, days: number): string {
  return new Date((isoToDays(iso) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  // 1970-01-01 was a Thursday (4).
  return ((((isoToDays(iso) + 3) % 7) + 7) % 7) + 1;
}

export function weekForDate(program: ProgramDefinition, isoDate: string): ProgramWeek | null {
  const d = isoToDays(isoDate);
  return program.weeks.find((w) => {
    const start = isoToDays(w.startDate);
    return d >= start && d < start + 7;
  }) ?? null;
}

export function dayForDate(program: ProgramDefinition, isoDate: string): { week: ProgramWeek; day: ProgramDay } | null {
  const week = weekForDate(program, isoDate);
  if (!week) return null;
  const weekday = isoWeekday(isoDate);
  const day = program.days.find((d) => d.weekday === weekday);
  return day ? { week, day } : null;
}

export function getWeek(program: ProgramDefinition, weekNo: number): ProgramWeek {
  const week = program.weeks.find((w) => w.weekNo === weekNo);
  if (!week) throw new Error(`No week ${weekNo} in ${program.id}`);
  return week;
}

export function getDay(program: ProgramDefinition, dayKey: DayKey): ProgramDay {
  const day = program.days.find((d) => d.key === dayKey);
  if (!day) throw new Error(`No day ${dayKey} in ${program.id}`);
  return day;
}

/**
 * Missed a whole week: "Repeat that week's type. Don't skip ahead." Default 6: the missed week stays
 * (marked missed), a repeat follows it and every later week, checkpoint included, moves one week later.
 * Returns a new programme; never applied automatically.
 */
export function shiftAfterMissedWeek(program: ProgramDefinition, missedWeekNo: number): ProgramDefinition {
  const missed = getWeek(program, missedWeekNo);
  const later = (w: ProgramWeek): ProgramWeek => ({
    ...w,
    weekNo: w.weekNo + 1,
    startDate: addDays(w.startDate, 7),
    ...(w.checkpoint ? { checkpoint: moveCheckpoint(w.checkpoint, 1) } : {}),
  });
  const { checkpoint, ...missedWithoutCheckpoint } = missed;
  const repeat: ProgramWeek = {
    ...missedWithoutCheckpoint,
    weekNo: missed.weekNo + 1,
    startDate: addDays(missed.startDate, 7),
    notes: [`Repeat of week ${missed.weekNo} (missed).`, ...missed.notes],
    repeatOf: missed.weekNo,
    ...(checkpoint ? { checkpoint: moveCheckpoint(checkpoint, 1) } : {}),
  };
  delete repeat.missed;
  const shifted = [
    ...program.weeks.filter((w) => w.weekNo < missedWeekNo),
    { ...missedWithoutCheckpoint, missed: true },
    repeat,
    ...program.weeks.filter((w) => w.weekNo > missedWeekNo).map(later),
  ];
  // A rest week is tied to its dates (the England trip stays fixed, R1-01): it stays on its Monday with its notes,
  // and the week that moved off it loses the flag and those notes.
  const rests = new Map(program.weeks.filter((w) => w.rest).map((w) => [w.startDate, w.notes] as const));
  const restNotes = new Set([...rests.values()].flat());
  const weeks = shifted.map((w): ProgramWeek => {
    const notes = rests.get(w.startDate);
    if (notes) return { ...w, rest: true, notes: [...notes] };
    if (!w.rest) return w;
    const { rest: _rest, ...rest } = w;
    return { ...rest, notes: w.notes.filter((n) => !restNotes.has(n)) };
  });
  return { ...program, weeks };
}

function moveCheckpoint(cp: Checkpoint, weeks: number): Checkpoint {
  return { ...cp, weekNo: cp.weekNo + weeks, date: addDays(cp.date, 7 * weeks) };
}

// ---------- checkpoints, bodyweight, conditioning ----------

export interface MetricStatus {
  value: number | null;
  threshold: number;
  met: boolean | null;
}
export interface CheckpointStatus {
  checkpoint: Checkpoint;
  squat: MetricStatus;
  deadlift: MetricStatus;
  bodyweight: MetricStatus;
  met: boolean;
  behind: TmLiftKey[];
  /**
   * "Behind? Check sessions done and bodyweight first. If both are on target and you are still behind,
   * add one normal set to each main lift."
   */
  advice: 'on_track' | 'fix_bodyweight_first' | 'add_main_lift_set_if_sessions_on_target';
}

export function checkpointStatus(program: ProgramDefinition, weekNo: number,
  values: { squatTm: number | null; deadliftTm: number | null; bodyweight7d: number | null }): CheckpointStatus | null {
  const checkpoint = program.weeks.find((w) => w.weekNo === weekNo)?.checkpoint;
  if (!checkpoint) return null;
  const metric = (value: number | null, threshold: number): MetricStatus =>
    ({ value, threshold, met: value === null ? null : value >= threshold - EPS });
  const squat = metric(values.squatTm, checkpoint.squatTm);
  const deadlift = metric(values.deadliftTm, checkpoint.deadliftTm);
  const bodyweight = metric(values.bodyweight7d, checkpoint.bodyweight7d);
  const behind: TmLiftKey[] = [];
  if (squat.met !== true) behind.push('squat');
  if (deadlift.met !== true) behind.push('deadlift');
  const met = behind.length === 0 && bodyweight.met === true;
  const advice = met ? 'on_track'
    : bodyweight.met !== true ? 'fix_bodyweight_first'
      : 'add_main_lift_set_if_sessions_on_target';
  return { checkpoint, squat, deadlift, bodyweight, met, behind, advice };
}

/**
 * Every 2 weeks from week 3: rate = (this week's 7-day avg − the one 2 weeks earlier) ÷ 2.
 * Under +0.1 kg/week → +100 kcal; +0.1 to +0.25 → keep; over +0.25 → −100 kcal.
 */
export function bodyweightRateCheck(avgThisWeek: number, avgTwoWeeksAgo: number,
  rule = { minKgPerWeek: 0.1, maxKgPerWeek: 0.25 }): '+100 kcal' | 'keep' | '-100 kcal' {
  const rate = Math.round(((avgThisWeek - avgTwoWeeksAgo) / 2) * 1000) / 1000;
  if (rate < rule.minKgPerWeek) return '+100 kcal';
  if (rate > rule.maxKgPerWeek) return '-100 kcal';
  return 'keep';
}

/** Sunday rounds: last round within 10% of the first → +1 round next week, up to 10. */
export function roundsNextWeek(rounds: number, firstCount: number, lastCount: number, maxRounds = 10, dropOff = 0.1): number {
  const within = lastCount >= firstCount * (1 - dropOff) - EPS;
  return within ? Math.min(maxRounds, rounds + 1) : Math.min(maxRounds, rounds);
}

/** Wednesday ride: 30 min in weeks 1–2 (and week 0), then +5 min a week up to 45. */
export function rideMinutes(rule: RideRule, weekNo: number): number {
  const extra = Math.max(0, weekNo - rule.holdThroughWeek) * rule.addPerWeek;
  return Math.min(rule.maxMinutes, rule.startMinutes + extra);
}

const dur = (sec: number) => (sec % 60 === 0 ? `${sec / 60} min` : `${sec} s`);

function prescribeConditioning(program: ProgramDefinition, day: ProgramDay, rule: ConditioningRule, week: ProgramWeek,
  state: PlanState, date: string): PrescribedConditioning {
  switch (rule.kind) {
    case 'ride': {
      const out: PrescribedConditioning = { kind: 'ride', minutes: rideMinutes(rule, week.weekNo) };
      // E13: the Wednesday wrist ladder at home, in the ride card.
      const ladder = program.wristLadder;
      const dose = ladder && day.key === ladder.homeDayKey && week.type !== 'test'
        ? wristLadderDose(ladder, week.weekNo, day.key, state.wristLadder?.rungOffset, state.wristLadder?.earned) : null;
      if (ladder && dose) {
        const [a, b] = ladder.isometric.holdSec;
        out.homeTasks = [isometricOn(state, date)
          ? { id: 'wrist_ladder', text: `Wrist isometric holds at home: ${ladder.isometric.sets} × ${a}–${b} s, palm down, mid-range`, sets: ladder.isometric.sets, reps: null, holdSec: [a, b] }
          : { id: 'wrist_ladder', text: `Wrist ladder at home: ${dose.sets} × ${dose.reps}, dumbbell or water bottle`, sets: dose.sets, reps: dose.reps }];
      }
      return out;
    }
    case 'boxing':
      return { kind: 'boxing', minutes: rule.minutes };
    case 'open':
      return { kind: 'open' };
    case 'rounds': {
      const base = { kind: 'rounds' as const, workSec: rule.workSec, easySec: rule.easySec, warmupMin: rule.warmupMin };
      // "Skip Sunday rounds in the week of the PR test." / "In deload weeks … do half the rounds."
      if (week.type === 'test') return { ...base, rounds: 0, skipped: true };
      const finish = rule.finishBy ? { finishBy: rule.finishBy, notes: [`Finish by ${rule.finishBy}.`] } : {};
      const planned = state.sundayRounds ?? rule.startRounds;
      const shape = `${dur(rule.workSec)} hard / ${dur(rule.easySec)} easy`;
      if (week.type === 'deload') {
        const n = Math.ceil(planned / 2);
        return { ...base, rounds: n, ...finish, text: `${n} rounds, ${shape} (deload: half, no burst rounds)` };
      }
      // R1-30: from week 4, 2 of the rounds are burst rounds (5 s all-out / 10 s easy for the round).
      const bursts = rule.burstFromWeek != null && week.weekNo >= rule.burstFromWeek ? Math.min(rule.burstRounds ?? 0, planned) : 0;
      if (bursts > 0) {
        const bw = rule.burstWorkSec ?? 5;
        const be = rule.burstEasySec ?? 10;
        return {
          ...base, rounds: planned, ...finish, burstRounds: bursts, burstWorkSec: bw, burstEasySec: be,
          text: `${planned} rounds, of which ${bursts} are burst rounds: ${bw} s all-out / ${be} s easy for ${dur(rule.workSec)} (rope or shadow-boxing, no bag)`,
        };
      }
      return { ...base, rounds: planned, ...finish, text: `${planned} rounds, ${shape}` };
    }
  }
}

// ---------- extra sets for lagging muscles ----------

export interface ExtraSetTarget {
  muscle: Muscle;
  dayKey: DayKey;
  slotIndex: number;
  exerciseKey: string;
}

/**
 * Where the +1 set for each lagging muscle goes: the first isolation slot in the week whose primary
 * muscle matches (falling back to a compound slot), skipping mains, rehab and the shoulder block.
 */
export function extraSetTargets(program: ProgramDefinition, muscles: readonly Muscle[]): ExtraSetTarget[] {
  const days = program.days.filter((d) => d.kind === 'lifting').sort((a, b) => a.weekday - b.weekday);
  const find = (muscle: Muscle, role: 'isolation' | 'compound'): ExtraSetTarget | null => {
    for (const day of days) {
      const slotIndex = day.slots.findIndex((s) => s.role === role && !s.rehab && !s.extraOnly
        && program.exercises[s.exerciseKey]?.muscles[0] === muscle);
      const slot = day.slots[slotIndex];
      if (slot) return { muscle, dayKey: day.key, slotIndex, exerciseKey: slot.exerciseKey };
    }
    return null;
  };
  return [...new Set(muscles)].flatMap((m) => {
    const t = find(m, 'isolation') ?? find(m, 'compound');
    return t ? [t] : [];
  });
}

// ---------- prescribing a day ----------

const TRAINING_TYPES = new Set<WeekType>(['A', 'B', 'C', 'D']);

interface SlotContext {
  program: ProgramDefinition;
  week: ProgramWeek;
  rule: WeekTypeRule;
  state: PlanState;
  profile: EquipmentProfile;
  extraSets: number;
  dayHasMain: boolean;
  dayKey: DayKey;
  /** The day's date. */
  date: string;
  /** E12: the first plan week back after ≥ 14 days off (no extra sets or main-lift sets, no failure). */
  firstWeekBack: boolean;
  /** E12: the first session after ≥ 10 days off (rep-outs capped at target + 2). */
  capRepOuts: boolean;
}

/** A set while prescribing: its effort is always known; finalize() keeps it only where it differs. */
type DraftSet = PrescribedSet & { effort: Effort };
type DraftExercise = Omit<PrescribedExercise, 'sets' | 'effort'> & { sets: DraftSet[] };

const easy = (s: PrescribedSet): DraftSet => ({ ...s, effort: 'easy' });

/** The exercise's effort is its first non-warm-up set's; sets keep `effort` only where it differs (E1). */
function finalize(ex: DraftExercise): PrescribedExercise {
  const first = ex.sets.find((s) => s.kind !== 'warmup') ?? ex.sets[0];
  const effort: Effort = first?.effort ?? 'controlled';
  const sets: PrescribedSet[] = ex.sets.map((s) => {
    const { effort: e, ...rest } = s;
    return e === effort ? rest : { ...rest, effort: e };
  });
  return { ...ex, effort, sets };
}

/**
 * P-TIMESAVE: pair members become adjacent (in the order of the first member), labelled A, B, C; every member
 * but the last rests `between` (45–60 s) before the partner's set, the last rests `after` (75 s). A pair with
 * one member left that day is done as a straight set.
 */
export function arrangePairs(exercises: readonly PrescribedExercise[], rest = { between: 50, after: 75 }): PrescribedExercise[] {
  const out: PrescribedExercise[] = [];
  const done = new Set<number>();
  exercises.forEach((e, i) => {
    if (done.has(i)) return;
    done.add(i);
    if (!e.pair) {
      out.push(e);
      return;
    }
    const members = exercises.flatMap((x, j) => (j > i && x.pair === e.pair ? [j] : []));
    if (!members.length) {
      const { pair: _p, pairLabel: _l, ...solo } = e;
      out.push(solo);
      return;
    }
    const all = [i, ...members];
    all.forEach((j, k) => {
      done.add(j);
      out.push({ ...exercises[j]!, pairLabel: String.fromCharCode(65 + k), restSec: k < all.length - 1 ? rest.between : rest.after });
    });
  });
  return out;
}

/** Pair problems in the plan data (P-TIMESAVE): two elbow-loading moves in one pair, or a pair that needs more than
 *  one cable station (his gym: a dual pulley and a single pulley; the cable-bar calf raise uses all of them). */
export function validatePairs(program: ProgramDefinition): string[] {
  const errors: string[] = [];
  for (const day of program.days) {
    const pairs = new Map<string, ProgramSlot[]>();
    for (const s of day.slots) if (s.pair) pairs.set(s.pair, [...(pairs.get(s.pair) ?? []), s]);
    for (const [id, slots] of pairs) {
      const elbow = slots.filter((s) => s.elbowLoading);
      if (elbow.length > 1) errors.push(`${day.key} ${id}: ${elbow.map((s) => s.exerciseKey).join(' + ')} both load the elbow`);
      const eq = (s: ProgramSlot) => program.exercises[s.exerciseKey]?.equipment;
      const cable = slots.filter((s) => eq(s) === 'cable' || eq(s) === 'cable_pair');
      if (cable.length > 1 || slots.some((s) => eq(s) === 'cable_pair'))
        errors.push(`${day.key} ${id}: ${cable.map((s) => s.exerciseKey).join(' + ')} need more than one cable station`);
      if (slots.length < 2) errors.push(`${day.key} ${id}: only one member`);
    }
  }
  return errors;
}

export function prescribeDay(program: ProgramDefinition, weekNo: number, dayKey: DayKey, state: PlanState,
  profile: EquipmentProfile = DEFAULT_EQUIPMENT): PrescribedDay {
  const week = getWeek(program, weekNo);
  const day = getDay(program, dayKey);
  const date = addDays(week.startDate, day.weekday - 1);
  const base = {
    programId: program.id,
    weekNo,
    weekType: week.type,
    weekLabel: week.label,
    date,
    dayKey,
    weekday: day.weekday,
    title: day.title,
    notes: [...day.notes],
  };

  // A full rest week (week 10, England): nothing on any day.
  if (week.rest) return { ...base, notes: [], kind: 'rest', exercises: [], workingSetCount: 0 };

  if (day.kind === 'conditioning' && day.conditioning) {
    const conditioning = prescribeConditioning(program, day, day.conditioning, week, state, date);
    return { ...base, kind: conditioning.skipped ? 'rest' : 'conditioning', exercises: [], conditioning, workingSetCount: 0 };
  }

  const rule = program.weekTypeRules[week.type];
  const isTrainingWeek = rule.accessorySetCap === null;
  const firstWeekBack = state.restart?.firstWeekNo === weekNo;
  const capFrom = state.restart?.capRepOutsFrom;
  const capRepOuts = capFrom != null && date >= capFrom && date <= addDays(capFrom, 6);
  // P-RESTART: no extra sets in the first week back.
  const extraOk = !!week.extraSetsEligible && isTrainingWeek && !firstWeekBack;
  const muscleTargets = extraOk ? extraSetTargets(program, state.extraSetsMuscles ?? []) : [];
  const slotTargets = extraOk ? state.extraSetTargets ?? [] : [];
  const dayHasMain = day.slots.some((s) => s.role === 'main');
  const ctxBase = { program, week, rule, state, profile, dayHasMain, dayKey, date, firstWeekBack, capRepOuts };

  const drafts: DraftExercise[] = day.slots.flatMap((slot, i) => {
    const extraSets = muscleTargets.filter((t) => t.dayKey === dayKey && t.slotIndex === i).length
      + slotTargets.filter((t) => t.dayKey === dayKey && t.exerciseKey === slot.exerciseKey).length;
    if (slot.extraOnly && extraSets === 0) return [];
    const ex = prescribeSlot(slot, { ...ctxBase, extraSets });
    return ex ? [ex] : [];
  });

  // R1-07: behind on the squat at a checkpoint → a light Friday squat (2 × 3 at 75% TM) before the BSS.
  const light = lightSquat({ ...ctxBase, extraSets: 0 });
  if (light) {
    const at = drafts.findIndex((e) => e.exerciseKey === program.mainLiftFallbacks!.squat.beforeExerciseKey);
    drafts.splice(at < 0 ? drafts.length : at, 0, light);
  }

  const exercises = arrangePairs(drafts.map(finalize), program.pairRestSec).map((ex, i) => ({ ...ex, order: i + 1 }));

  if (exercises.length === 0) {
    return { ...base, kind: 'rest', exercises, workingSetCount: 0, notes: [...base.notes, 'No accessories this week.'] };
  }
  return {
    ...base,
    kind: 'lifting',
    exercises,
    workingSetCount: countWorkingSets(exercises),
    ...(day.minutes !== undefined ? { minutes: day.minutes } : {}),
    ...(day.minutesAlternating !== undefined ? { minutesAlternating: day.minutesAlternating } : {}),
  };
}

export function prescribeWeek(program: ProgramDefinition, weekNo: number, state: PlanState,
  profile: EquipmentProfile = DEFAULT_EQUIPMENT): PrescribedDay[] {
  return [...program.days].sort((a, b) => a.weekday - b.weekday)
    .map((d) => prescribeDay(program, weekNo, d.key, state, profile));
}

/** Working sets excluding warm-ups and care work (shoulder block, wrist extensions): 72 in a normal week. */
export function countWorkingSets(exercises: readonly PrescribedExercise[]): number {
  return exercises
    .filter((e) => e.role !== 'shoulder' && !e.rehab)
    .reduce((n, e) => n + e.sets.filter((s) => s.kind !== 'warmup').length, 0);
}

// ---------- the minimum session (E2, P-MINIMUM) ----------

export const MINIMUM_SESSION_NOTE = 'Minimum session (~30 min): the main lift, then one hard set of two accessories. It counts as the day\'s session.';
const PULL = new Set<Muscle>(['back', 'biceps', 'rear_delts']);
const PUSH = new Set<Muscle>(['chest', 'triceps', 'front_delts']);

/**
 * The minimum session for a lifting day, flagged `minimum: true`:
 * - each main lift: its warm-up ramp and the rep-out only (deadlift: ramp + top set); calibration, test, deload
 *   and taper weeks keep the main-lift work as prescribed (deload: the light sets instead of a rep-out);
 * - then one hard set of the first 2 accessories of the day (not the shoulder block, not care work); on Upper
 *   days one pull and one push. Isolation: one set to failure (stop sign while E9/E12 apply); a rep-out-last
 *   compound: one rep-out to a stop sign; a failure compound: one set to failure. In weeks without failure work
 *   (calibration, deload, taper) the set stops at the top of the range.
 * - No extra sets, no checkpoint fallbacks, no pairs. TM and step rules apply as usual.
 */
export function prescribeMinimum(program: ProgramDefinition, weekNo: number, dayKey: DayKey, state: PlanState,
  profile: EquipmentProfile = DEFAULT_EQUIPMENT): PrescribedDay {
  const plain: PlanState = { ...state, extraSetsMuscles: [], extraSetTargets: [], addMainLiftSet: {} };
  const full = prescribeDay(program, weekNo, dayKey, plain, profile);
  if (full.kind !== 'lifting') return { ...full, minimum: true };
  const day = getDay(program, dayKey);

  const mains = full.exercises.filter((e) => e.role === 'main').map((e): PrescribedExercise => {
    if (!e.sets.some((s) => s.kind === 'rep_out')) return e;
    return finalize({ ...e, sets: e.sets.filter((s) => s.kind === 'warmup' || s.kind === 'rep_out').map((s) => ({ ...s, effort: s.effort ?? e.effort })) });
  });

  const present = new Map(full.exercises.map((e) => [e.exerciseKey, e]));
  const candidates = day.slots.filter((s) => (s.role === 'compound' || s.role === 'isolation') && !s.rehab && !s.extraOnly
    && present.has(s.exerciseKey));
  const muscle = (s: ProgramSlot) => program.exercises[s.exerciseKey]?.muscles[0];
  let picks = candidates.slice(0, 2);
  if (dayKey.startsWith('upper')) {
    const pull = candidates.find((s) => PULL.has(muscle(s)!));
    const push = candidates.find((s) => PUSH.has(muscle(s)!));
    if (pull && push) picks = candidates.filter((s) => s === pull || s === push);
  }
  const rule = program.weekTypeRules[full.weekType];
  const accessories = picks.map((slot): PrescribedExercise => {
    const e = present.get(slot.exerciseKey)!;
    const scheme = slot.scheme!;
    const first = e.sets.find((s) => s.kind !== 'warmup') ?? e.sets[0]!;
    const repRange: [number, number] = [scheme.repRange[0], scheme.repRange[1]];
    const failSet = e.sets.find((s) => s.kind === 'failure');
    const set: DraftSet = !rule.accessoryToFailure
      ? { kind: 'working', load: first.load, unit: first.unit, reps: scheme.repRange[1], repRange, effort: 'controlled' }
      : scheme.lastSetRepOut
        ? { kind: 'rep_out', load: first.load, unit: first.unit, reps: null, repRange, note: 'Rep-out: stop at a stop sign.', effort: 'max' }
        : { kind: 'failure', load: first.load, unit: first.unit, reps: null, repRange, effort: failSet ? setEffortOf(e, failSet) : 'failure' };
    const { pair: _p, pairLabel: _l, restBeforeRepOutSec: _r, ...rest } = e;
    return finalize({ ...rest, sets: [set], restSec: slot.restSec ?? program.restSecByRole[slot.role] });
  });

  const exercises = [...mains, ...accessories].map((ex, i) => ({ ...ex, order: i + 1 }));
  const { minutesAlternating: _m, ...withoutAlt } = full;
  return {
    ...withoutAlt,
    exercises,
    workingSetCount: countWorkingSets(exercises),
    minutes: 30,
    notes: [MINIMUM_SESSION_NOTE],
    minimum: true,
  };
}

const setEffortOf = (e: PrescribedExercise, s: PrescribedSet): Effort => s.effort ?? e.effort;

// ---------- slots ----------

function prescribeSlot(slot: ProgramSlot, ctx: SlotContext): DraftExercise | null {
  if (slot.role === 'main') return prescribeMain(slot, ctx);
  // Test week: "No accessories." The shoulder block stays only as preparation before a main lift.
  if (!ctx.rule.includeAccessories && !(slot.role === 'shoulder' && ctx.dayHasMain)) return null;
  return prescribeAccessory(slot, ctx);
}

function exerciseShell(slot: ProgramSlot, ctx: Pick<SlotContext, 'program'>): Omit<DraftExercise, 'sets'> {
  const def = ctx.program.exercises[slot.exerciseKey];
  if (!def) throw new Error(`Unknown exercise ${slot.exerciseKey}`);
  return {
    order: 0,
    exerciseKey: slot.exerciseKey,
    name: def.name,
    role: slot.role,
    ...(slot.mainLift ? { mainLift: slot.mainLift } : {}),
    equipment: def.equipment,
    unit: slot.unit,
    loadBasis: slot.loadBasis,
    ...(slot.group ? { group: slot.group } : {}),
    ...(slot.rehab ? { rehab: true } : {}),
    ...(slot.elbowLoading ? { elbowLoading: true } : {}),
    ...(slot.pair ? { pair: slot.pair } : {}),
    ...(slot.alternatives?.length ? { alternatives: [...slot.alternatives] } : {}),
    restSec: slot.restSec ?? ctx.program.restSecByRole[slot.role],
    notes: [...slot.notes],
  };
}

/** J-PAINRULE trend cut running on `date`: the fraction to take off, or null. */
function activeCut(slot: ProgramSlot, date: string): number | null {
  const cut = slot.setCuts?.find((c) => date >= c.from && date <= c.until);
  return cut ? cut.fraction : null;
}

function cutSets(slot: ProgramSlot, ctx: SlotContext, n: number): number {
  const f = activeCut(slot, ctx.date);
  return f == null || n <= 0 ? n : Math.max(1, Math.round(n * (1 - f)));
}

const HOLD_NOTE = 'Hold the load: pain was 4–5/10 last time. No increase until a session at 3/10 or less.';

function painNotes(slot: ProgramSlot, ctx: SlotContext): string[] {
  const out: string[] = [];
  if (ctx.state.holdLoad?.[slot.exerciseKey]) out.push(HOLD_NOTE);
  const big = ctx.state.bigJump?.[slot.exerciseKey];
  if (big) out.push(`The next weight (${big.next} ${slot.unit}) is a big jump: stay here until ${big.average ? `your sets average ${big.reps} reps` : `every set reaches ${big.reps} reps`}.`);
  const f = activeCut(slot, ctx.date);
  if (f != null) out.push(`Sets cut by ${Math.round(f * 100) === 33 ? 'a third' : `${Math.round(f * 100)}%`}: morning pain rising two weeks running.`);
  return out;
}

function accessorySetCount(slot: ProgramSlot, ctx: SlotContext): number {
  if (slot.extraOnly) return ctx.extraSets;
  const written = slot.scheme?.sets ?? 0;
  if (slot.role === 'shoulder' || slot.rehab) return written;
  let n = written;
  // Default 4: weeks 15–17 take one set off isolation slots only, never below 1.
  if (slot.role === 'isolation' && ctx.week.isolationSetDelta) n = Math.max(1, n + ctx.week.isolationSetDelta);
  if (ctx.rule.accessorySetCap !== null) n = Math.min(n, ctx.rule.accessorySetCap);
  return cutSets(slot, ctx, n + ctx.extraSets);
}

/**
 * E9 / E12: why a failure set ends at the first stop sign instead, or null.
 * First week back after ≥ 14 days: every failure set. The last 2 sessions felt ≤ 2/5: isolation that week.
 * Elbow pain ≥ 4/10 in the last 14 days: elbow-loading isolation.
 */
function stopSignReason(slot: ProgramSlot, ctx: SlotContext): string | null {
  const e = ctx.state.effort;
  if (ctx.firstWeekBack) return 'First week back after a break: stop at the first stop sign, not failure.';
  if (slot.role === 'isolation' && e?.lowFeelWeekNo === ctx.week.weekNo) {
    return 'The last 2 sessions felt hard (2/5 or less): isolation stops at the first stop sign this week.';
  }
  if (slot.elbowLoading && e?.elbowIrritableUntil && ctx.date <= e.elbowIrritableUntil
    && (e.elbowIrritableFrom == null || ctx.date >= e.elbowIrritableFrom)) {
    return 'Elbow irritable (pain 4/10 or more in the last 2 weeks): stop at the first stop sign, not failure.';
  }
  return null;
}

function prescribeAccessory(slot: ProgramSlot, ctx: SlotContext): DraftExercise | null {
  const ladder = ctx.program.wristLadder;
  if (ladder && slot.exerciseKey === ladder.exerciseKey) return prescribeWristLadder(slot, ctx, ladder);
  const scheme = slot.scheme;
  if (!scheme) throw new Error(`Slot ${slot.exerciseKey} has no scheme`);
  const isShoulder = slot.role === 'shoulder';
  const n = accessorySetCount(slot, ctx);
  const toFailure = scheme.toFailure && ctx.rule.accessoryToFailure;
  const lastRepOut = scheme.lastSetRepOut && ctx.rule.compoundRepOut;
  const load = ctx.state.currentLoads[slot.exerciseKey] ?? slot.startLoad;
  const unit = slot.unit;
  const stopSign = toFailure ? stopSignReason(slot, ctx) : null;
  const failEffort: Effort = stopSign ? 'stop_sign' : 'failure';
  const plainEffort: Effort = isShoulder ? 'easy' : slot.rehab ? 'care' : 'controlled';

  const sets: DraftSet[] = Array.from({ length: n }, (_, i): DraftSet => {
    const repRange: [number, number] = [scheme.repRange[0], scheme.repRange[1]];
    if (lastRepOut && i === n - 1) return { kind: 'rep_out', load, unit, reps: null, repRange, note: 'Rep-out: stop at a stop sign.', effort: 'max' };
    if (toFailure) return { kind: 'failure', load, unit, reps: null, repRange, effort: failEffort };
    // Shoulder block: filled in at the range bottom, so a plain tick never claims the top (it steps up only when he
    // types the top on every set; plan: "same load until every set reaches the top").
    return { kind: 'working', load, unit, reps: isShoulder ? scheme.repRange[0] : scheme.repRange[1], repRange, effort: plainEffort };
  });

  const aim = ctx.state.bigJump?.[slot.exerciseKey]?.reps;
  const aimAverage = !!ctx.state.bigJump?.[slot.exerciseKey]?.average;
  if (aim != null) for (const s of sets) Object.assign(s, { aimReps: aim }, aimAverage ? { aimAverage } : {});
  const ramp = slot.warmup && n > 0 ? compoundRamp(slot, load, ctx) : [];
  const shell = exerciseShell(slot, ctx);
  const ruleNote = !isShoulder && !slot.rehab ? ctx.rule.accessoryNote : undefined;
  const extraNote = ctx.extraSets > 0 && !slot.extraOnly ? `+${ctx.extraSets} ${ctx.extraSets === 1 ? 'set' : 'sets'} (checkpoint 1 met).` : undefined;
  return {
    ...shell,
    sets: [...ramp, ...sets],
    ...(lastRepOut ? { restBeforeRepOutSec: shell.restSec } : {}),
    notes: [...shell.notes, ...(ruleNote ? [ruleNote] : []), ...(extraNote ? [extraNote] : []), ...(stopSign ? [stopSign] : []), ...painNotes(slot, ctx)],
  };
}

/**
 * Warm-up for a compound that opens its pattern (17 Oct 2026, DECISIONS): ≈55% × 5 and ≈85% × 3 of the work load,
 * the way Mario ramps his row (70 kg → 40, 60). Barbell to the nearest 10 kg (never the empty bar), dumbbells down
 * to the rack. Steps that land on the work load or repeat are dropped. Warm-ups are not working sets.
 */
function compoundRamp(slot: ProgramSlot, load: number, ctx: SlotContext): DraftSet[] {
  if (slot.unit !== 'kg' || load <= 0) return [];
  const { profile } = ctx;
  const barbell = ctx.program.exercises[slot.exerciseKey]?.equipment === 'barbell';
  const out: DraftSet[] = [];
  for (const [pct, reps] of [[0.55, 5], [0.85, 3]] as const) {
    const x = barbell ? Math.round((load * pct) / 10) * 10 : dumbbellFloor(load * pct, profile.dumbbellRackKg);
    if (x == null || x >= load - EPS || (barbell && x <= profile.barKg + EPS) || out.some((s) => Math.abs(s.load - x) < EPS)) continue;
    out.push({ kind: 'warmup', load: x, unit: 'kg', reps, effort: 'easy' });
  }
  return out;
}

/**
 * E13: the wrist ladder. Mon and Fri (and Wed at home): 3 sets at the rung's reps (15 → 12 → 10 → 8 → 6 by plan
 * week, one rung back per flare-up), 3 s up / 3 s down, effort `care`; from week 13 2 × 8 once a week (Fri).
 * During a flare-up (3–7 days after a morning elbow score ≥ baseline + 2): isometric holds, effort `easy`.
 */
function prescribeWristLadder(slot: ProgramSlot, ctx: SlotContext, ladder: WristLadder): DraftExercise | null {
  const dose = wristLadderDose(ladder, ctx.week.weekNo, ctx.dayKey, ctx.state.wristLadder?.rungOffset, ctx.state.wristLadder?.earned);
  if (!dose) return null;
  // Heavy-slow: the weight goes up when the rung's reps drop and the last rung was completed; within a rung it stays.
  const last = ctx.state.wristLadder?.last;
  const load = last && dose.reps < last.reps && last.allHit ? last.next : (ctx.state.currentLoads[slot.exerciseKey] ?? slot.startLoad);
  const shell = exerciseShell(slot, ctx);
  if (isometricOn(ctx.state, ctx.date)) {
    const [a, b] = ladder.isometric.holdSec;
    return {
      ...shell,
      sets: Array.from({ length: ladder.isometric.sets }, (): DraftSet => ({
        kind: 'timed', load, unit: slot.unit, reps: null, durationSec: b, note: `Hold ${a}–${b} s, palm down, mid-range.`, effort: 'easy',
      })),
      notes: ['Flare-up step: isometric holds for 3–7 days, then the ladder restarts one rung lower.', ...shell.notes],
    };
  }
  const maintain = ctx.week.weekNo >= ladder.maintainFromWeek;
  return {
    ...shell,
    sets: Array.from({ length: dose.sets }, (): DraftSet => ({
      kind: 'working', load, unit: slot.unit, reps: dose.reps, repRange: [dose.reps, dose.reps], effort: 'care',
    })),
    notes: [maintain ? `Maintenance: ${dose.sets} × ${dose.reps}, once a week.` : ladder.stepRule
      ? `Ladder: ${dose.sets} × ${dose.reps}. Next rung (fewer reps, next dumbbell) once every set is clean, pain ≤ ${ladder.stepRule.maxPain}/10 and the next morning no worse than ${ladder.stepRule.morningRise} over usual.`
      : `Ladder: ${dose.sets} × ${dose.reps}. Same weight until the reps drop to the next rung; then the next dumbbell up.`, ...shell.notes],
  };
}

/**
 * E13: the ladder's sets and reps on a day (lifting or the home day), or null when the ladder is not on it.
 * R2-15: with a step rule, the rung is the lower of the week schedule and `earned` (rungs earned by clean sessions).
 */
export function wristLadderDose(ladder: WristLadder, weekNo: number, dayKey: DayKey, rungOffset = 0,
  earned?: number): { sets: number; reps: number } | null {
  if (weekNo >= ladder.maintainFromWeek) {
    return dayKey === ladder.maintain.dayKey ? { sets: ladder.maintain.sets, reps: ladder.maintain.reps } : null;
  }
  if (!(ladder.dayKeys as readonly DayKey[]).includes(dayKey) && dayKey !== ladder.homeDayKey) return null;
  let i = 0;
  ladder.rungs.forEach((r, k) => { if (r.fromWeek <= weekNo) i = k; });
  if (ladder.stepRule && earned != null) i = Math.min(i, earned);
  const rung = ladder.rungs[Math.max(0, i - Math.max(0, rungOffset))]!;
  return { sets: ladder.sets, reps: rung.reps };
}

function isometricOn(state: PlanState, date: string): boolean {
  const w = state.wristLadder;
  return !!w?.isometricFrom && !!w.isometricUntil && date >= w.isometricFrom && date <= w.isometricUntil;
}

function prescribeMain(slot: ProgramSlot, ctx: SlotContext): DraftExercise {
  const lift = slot.mainLift;
  if (!lift) throw new Error(`Main slot ${slot.exerciseKey} has no mainLift`);
  const sets = lift === 'squat' || lift === 'deadlift' ? tmLiftSets(lift, ctx) : stepLiftSets(lift, ctx);
  const shell = exerciseShell(slot, ctx);
  const heavyFinish = sets.some((s) => s.kind === 'rep_out' || s.kind === 'top');
  const stuck = (lift === 'incline_db_press' || lift === 'weighted_pullup') && TRAINING_TYPES.has(ctx.week.type)
    ? ctx.state.normalReps?.[lift] : undefined;
  const notes = [
    ...shell.notes,
    ...(sets.some((s) => s.calibration) && ctx.week.type !== 'calibration' ? ['Back after 4+ weeks off: one calibration rep-out at 75% of your last TM.'] : []),
    ...(stuck ? [`Stuck at 6–9 reps: normal sets of ${stuck} until the load goes up.`] : []),
    ...painNotes(slot, ctx),
  ];
  return { ...shell, sets, notes, ...(heavyFinish ? { restBeforeRepOutSec: ctx.program.repOutRestSec } : {}) };
}

function working(load: number, reps: number, pctTm?: number): DraftSet {
  return { kind: 'working', load, unit: 'kg', reps, ...(pctTm !== undefined ? { pctTm } : {}), effort: 'controlled' };
}
function repOut(load: number, target: number | undefined, note: string, pctTm?: number): DraftSet {
  return {
    kind: 'rep_out', load, unit: 'kg', reps: null,
    ...(target !== undefined ? { target } : {}), ...(pctTm !== undefined ? { pctTm } : {}), note, effort: 'max',
  };
}

/** E12: the first session after ≥ 10 days off caps a rep-out with a target at target + 2. */
function capped(set: DraftSet, ctx: SlotContext): DraftSet {
  if (!ctx.capRepOuts || set.target == null) return set;
  const cap = set.target + (ctx.program.restart?.capPlusReps ?? 2);
  return { ...set, capReps: cap, note: `${set.note ? `${set.note} ` : ''}Stop at ${cap} even if more are there.` };
}

function tmLiftSets(lift: TmLiftKey, ctx: SlotContext): DraftSet[] {
  const { program, week, state, profile } = ctx;
  const ramp = (load: number, test = false) => warmupRamp(lift, load, profile.barKg, { test }).map(easy);

  if (week.type === 'calibration') {
    const load = program.calibrationLoads[lift];
    return [...ramp(load), { ...repOut(load, undefined, 'One set to your last clean rep. Sets your training max.'), calibration: true }];
  }
  if (week.type === 'test') {
    const goal = program.goals[lift];
    return [...ramp(goal.load, true), repOut(goal.load, goal.reps, 'PR test.')];
  }
  // E3: back after ≥ 4 weeks off → a calibration rep-out at 75% of the last TM (provisional-TM rules).
  const recal = state.recalibrate?.[lift];
  if (recal != null) {
    return [...ramp(recal), { ...repOut(recal, undefined, 'Calibration rep-out: one set to your last clean rep. It resets the training max.'), calibration: true }];
  }

  const row = program.mainLifts[lift].byWeekType[week.type];
  if (!row) throw new Error(`No ${lift} scheme for week type ${week.type}`);
  const tm = state.trainingMaxes[lift];
  if (tm === undefined) throw new Error(`Training max for ${lift} is required in week ${week.weekNo}`);
  const load = roundBarbell(tm * row.pctTm, profile.barbellStepKg);
  const addSet = state.addMainLiftSet?.[lift] === true && row.repOutTarget !== null && !ctx.firstWeekBack;
  const out = [...ramp(load)];

  if (lift === 'deadlift' && row.sets === 0) {
    out.push(capped(repOut(load, row.repOutTarget ?? undefined, 'Top set: rep-out, reset every rep.', row.pctTm), ctx));
    // R1-07: behind at a checkpoint → 1–2 back-off sets × 3–5 at 80% of that day's top-set load.
    if (addSet) {
      const fb = program.mainLiftFallbacks?.deadlift ?? { pctOfTop: 0.8, sets: 2, reps: 5, repRange: [3, 5] as [number, number] };
      const backoff = roundBarbell(load * fb.pctOfTop);
      for (let i = 0; i < fb.sets; i++) {
        out.push({
          kind: 'backoff', load: backoff, unit: 'kg', reps: fb.reps, repRange: [fb.repRange[0], fb.repRange[1]], effort: 'controlled',
          note: i === 0 ? `Back-off: ${fb.repRange[0]}–${fb.repRange[1]} reps, stop at ${fb.reps}.` : 'Second back-off set: optional on a bad day.',
        });
      }
    }
    return out;
  }

  // The squat's checkpoint fallback is the light Friday squat (lightSquat), not an extra Monday set.
  const normalSets = cutMainSets(lift, ctx, row.sets);
  for (let i = 0; i < normalSets; i++) {
    out.push(lift === 'deadlift' && row.reps === 1 && row.repOutTarget === null
      ? { kind: 'top', load, unit: 'kg', reps: 1, pctTm: row.pctTm, note: 'Single, no rep-out.', effort: 'controlled' }
      : working(load, row.reps, row.pctTm));
  }
  if (row.repOutTarget !== null) out.push(capped(repOut(load, row.repOutTarget, 'Rep-out at the same load.', row.pctTm), ctx));
  return out;
}

function cutMainSets(lift: MainLiftKey, ctx: SlotContext, n: number): number {
  const slot = ctx.program.days.flatMap((d) => d.slots).find((s) => s.mainLift === lift);
  return slot ? cutSets(slot, ctx, n) : n;
}

/** R1-07: the light Friday squat (2 × 3 at 75% TM) when the squat is behind at a checkpoint, else null. */
function lightSquat(ctx: SlotContext): DraftExercise | null {
  const { program, week, state, profile } = ctx;
  const fb = program.mainLiftFallbacks?.squat;
  const tm = state.trainingMaxes.squat;
  if (!fb || fb.dayKey !== ctx.dayKey || state.addMainLiftSet?.squat !== true || !TRAINING_TYPES.has(week.type)
    || ctx.firstWeekBack || tm === undefined) return null;
  const slot = program.days.flatMap((d) => d.slots).find((s) => s.mainLift === 'squat');
  if (!slot) return null;
  const load = roundBarbell(tm * fb.pctTm, profile.barbellStepKg);
  const shell = exerciseShell(slot, ctx);
  return {
    ...shell,
    sets: [...warmupRamp('squat', load, profile.barKg).map(easy), ...Array.from({ length: fb.sets }, () => working(load, fb.reps, fb.pctTm))],
    notes: [`Checkpoint fallback: light squat, ${fb.sets} × ${fb.reps} at ${Math.round(fb.pctTm * 100)}% TM. Fast, clean reps.`],
  };
}

function stepLiftSets(lift: StepLiftKey, ctx: SlotContext): DraftSet[] {
  const { program, week, state, profile } = ctx;
  const def = program.mainLifts[lift];
  const ramp = (load: number) => warmupRamp(lift, load, profile.barKg, { rack: profile.dumbbellRackKg, beltStepKg: profile.beltStepKg }).map(easy);

  if (week.type === 'calibration') {
    const load = program.calibrationLoads[lift];
    return [...ramp(load), repOut(load, def.repOutTarget, 'One set to your last clean rep. Sets next week\'s load.')];
  }
  if (week.type === 'test') {
    const goal = program.goals[lift];
    return [...ramp(goal.load), repOut(goal.load, goal.reps, 'PR test.')];
  }

  const current = state.currentLoads[lift] ?? program.calibrationLoads[lift];
  // Default 8: deload and taper are 3 × 5 one step lighter, no rep-out.
  if (week.type === 'deload' || week.type === 'taper') {
    const light = stepLiftLoad(lift, current, -1, profile);
    return [...ramp(light), ...Array.from({ length: def.lightSets }, () => working(light, def.lightReps))];
  }
  const reps = state.normalReps?.[lift] ?? def.reps;
  const normalSets = cutMainSets(lift, ctx, def.sets + (state.addMainLiftSet?.[lift] === true && !ctx.firstWeekBack ? 1 : 0));
  return [
    ...ramp(current),
    ...Array.from({ length: normalSets }, () => working(current, reps)),
    capped(repOut(current, def.repOutTarget, 'Rep-out at the same load.'), ctx),
  ];
}
