// Plan engine: pure functions over a ProgramDefinition. No I/O, no clock.
// Rules cite docs/plan/Strength_Return_Plan.md; defaults for its ambiguities are in docs/REBUILD_PLAN.md §2.

import type {
  Checkpoint,
  ConditioningRule,
  DayKey,
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
  WeekTypeRule,
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

// ---------- step lifts and accessories ----------

export interface StepResult {
  load: number;
  direction: -1 | 0 | 1;
}

/** Incline DB / pull-up after a rep-out: ≥10 next step up, 6–9 same, ≤5 one step lighter. */
export function incrementAfterRepOut(lift: StepLiftKey, load: number, cleanReps: number,
  profile: EquipmentProfile = DEFAULT_EQUIPMENT,
  rule: Pick<StepLiftDefinition, 'stepUpAtReps' | 'stepDownAtReps'> = { stepUpAtReps: 10, stepDownAtReps: 5 }): StepResult {
  const direction: -1 | 0 | 1 = cleanReps >= rule.stepUpAtReps ? 1 : cleanReps <= rule.stepDownAtReps ? -1 : 0;
  return { load: stepLiftLoad(lift, load, direction, profile), direction };
}

function stepLiftLoad(lift: StepLiftKey, load: number, dir: -1 | 0 | 1, profile: EquipmentProfile): number {
  return lift === 'incline_db_press'
    ? dumbbellStep(load, dir, profile.dumbbellRackKg)
    : pullupStep(load, dir, profile.beltStepKg);
}

export interface LoggedSet {
  load: number;
  reps: number | null;
}

/**
 * Double progression: when every set reached the top of the range, add the smallest step next session.
 * `step` is an increment, or a list of available loads (dumbbell rack).
 */
export function doubleProgression(lastSets: readonly LoggedSet[], repRange: readonly [number, number],
  step: number | readonly number[]): { load: number; increased: boolean } | null {
  if (lastSets.length === 0) return null;
  const load = Math.max(...lastSets.map((s) => s.load));
  const allTop = lastSets.every((s) => s.reps !== null && s.reps >= repRange[1]);
  if (!allTop) return { load, increased: false };
  const next = typeof step === 'number'
    ? round2(load + step)
    : ([...step].sort((a, b) => a - b).find((w) => w > load + 0.01) ?? load);
  return { load: next, increased: next > load };
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
 * Dumbbells have no "empty bar" step and round down to the rack; the pull-up starts with a
 * bodyweight set and works on the added load. Steps that round onto the bar, onto an earlier
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

  const round = (x: number): number | null =>
    lift === 'incline_db_press' ? dumbbellFloor(x, rack)
      : lift === 'weighted_pullup' ? floorTo(x, beltStep)
        : roundBarbell(x);

  const out: PrescribedSet[] = [];
  const add = (load: number, reps: number, note?: string): void => {
    out.push({ kind: 'warmup', load, unit: 'kg', reps, ...(note ? { note } : {}) });
  };
  if (lift === 'squat' && !singles) add(barKg, 8, 'Empty bar');
  if (lift === 'weighted_pullup' && workingLoadKg > 0) add(0, 5, 'Bodyweight');

  for (const [pct, reps] of steps) {
    const load = round(workingLoadKg * pct);
    if (load === null || load >= workingLoadKg - EPS) continue;
    if (isBarbell && load <= barKg + EPS) continue;
    if (lift === 'weighted_pullup' && load <= 0) continue;
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
  const weeks = [
    ...program.weeks.filter((w) => w.weekNo < missedWeekNo),
    { ...missedWithoutCheckpoint, missed: true },
    repeat,
    ...program.weeks.filter((w) => w.weekNo > missedWeekNo).map(later),
  ];
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

function prescribeConditioning(rule: ConditioningRule, week: ProgramWeek, state: PlanState): PrescribedConditioning {
  switch (rule.kind) {
    case 'ride':
      return { kind: 'ride', minutes: rideMinutes(rule, week.weekNo) };
    case 'boxing':
      return { kind: 'boxing', minutes: rule.minutes };
    case 'rounds': {
      const base = { kind: 'rounds' as const, workSec: rule.workSec, easySec: rule.easySec, warmupMin: rule.warmupMin };
      // "Skip Sunday rounds in the week of the PR test." / "In deload weeks … do half the rounds."
      if (week.type === 'test') return { ...base, rounds: 0, skipped: true };
      const planned = state.sundayRounds ?? rule.startRounds;
      return { ...base, rounds: week.type === 'deload' ? Math.ceil(planned / 2) : planned };
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
      const slotIndex = day.slots.findIndex((s) => s.role === role && !s.rehab
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

interface SlotContext {
  program: ProgramDefinition;
  week: ProgramWeek;
  rule: WeekTypeRule;
  state: PlanState;
  profile: EquipmentProfile;
  extraSets: number;
  dayHasMain: boolean;
}

export function prescribeDay(program: ProgramDefinition, weekNo: number, dayKey: DayKey, state: PlanState,
  profile: EquipmentProfile = DEFAULT_EQUIPMENT): PrescribedDay {
  const week = getWeek(program, weekNo);
  const day = getDay(program, dayKey);
  const base = {
    programId: program.id,
    weekNo,
    weekType: week.type,
    weekLabel: week.label,
    date: addDays(week.startDate, day.weekday - 1),
    dayKey,
    weekday: day.weekday,
    title: day.title,
    notes: [...day.notes],
  };

  if (day.kind === 'conditioning' && day.conditioning) {
    const conditioning = prescribeConditioning(day.conditioning, week, state);
    return { ...base, kind: conditioning.skipped ? 'rest' : 'conditioning', exercises: [], conditioning, workingSetCount: 0 };
  }

  const rule = program.weekTypeRules[week.type];
  const isTrainingWeek = rule.accessorySetCap === null;
  const targets = week.extraSetsEligible && isTrainingWeek ? extraSetTargets(program, state.extraSetsMuscles ?? []) : [];
  const dayHasMain = day.slots.some((s) => s.role === 'main');

  const exercises = day.slots.flatMap((slot, i) => {
    const extraSets = targets.filter((t) => t.dayKey === dayKey && t.slotIndex === i).length;
    const ex = prescribeSlot(slot, { program, week, rule, state, profile, extraSets, dayHasMain });
    return ex ? [ex] : [];
  }).map((ex, i) => ({ ...ex, order: i + 1 }));

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

/** Working sets excluding warm-ups and the shoulder-care block. */
export function countWorkingSets(exercises: readonly PrescribedExercise[]): number {
  return exercises
    .filter((e) => e.role !== 'shoulder')
    .reduce((n, e) => n + e.sets.filter((s) => s.kind !== 'warmup').length, 0);
}

function prescribeSlot(slot: ProgramSlot, ctx: SlotContext): PrescribedExercise | null {
  if (slot.role === 'main') return prescribeMain(slot, ctx);
  // Test week: "No accessories." The shoulder block stays only as preparation before a main lift.
  if (!ctx.rule.includeAccessories && !(slot.role === 'shoulder' && ctx.dayHasMain)) return null;
  return prescribeAccessory(slot, ctx);
}

function exerciseShell(slot: ProgramSlot, ctx: SlotContext): Omit<PrescribedExercise, 'sets'> {
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
    restSec: slot.restSec ?? ctx.program.restSecByRole[slot.role],
    notes: [...slot.notes],
  };
}

function accessorySetCount(slot: ProgramSlot, ctx: SlotContext): number {
  const written = slot.scheme?.sets ?? 0;
  if (slot.role === 'shoulder' || slot.rehab) return written;
  let n = written;
  // Default 4: weeks 15–17 take one set off isolation slots only, never below 1.
  if (slot.role === 'isolation' && ctx.week.isolationSetDelta) n = Math.max(1, n + ctx.week.isolationSetDelta);
  if (ctx.rule.accessorySetCap !== null) n = Math.min(n, ctx.rule.accessorySetCap);
  return n + ctx.extraSets;
}

function prescribeAccessory(slot: ProgramSlot, ctx: SlotContext): PrescribedExercise {
  const scheme = slot.scheme;
  if (!scheme) throw new Error(`Slot ${slot.exerciseKey} has no scheme`);
  const isShoulder = slot.role === 'shoulder';
  const n = accessorySetCount(slot, ctx);
  const toFailure = scheme.toFailure && ctx.rule.accessoryToFailure;
  const lastRepOut = scheme.lastSetRepOut && ctx.rule.compoundRepOut;
  const load = ctx.state.currentLoads[slot.exerciseKey] ?? slot.startLoad;
  const unit = slot.unit;

  const sets: PrescribedSet[] = Array.from({ length: n }, (_, i): PrescribedSet => {
    const repRange: [number, number] = [scheme.repRange[0], scheme.repRange[1]];
    if (lastRepOut && i === n - 1) return { kind: 'rep_out', load, unit, reps: null, repRange, note: 'Rep-out: stop at a stop sign.' };
    if (toFailure) return { kind: 'failure', load, unit, reps: null, repRange };
    return { kind: 'working', load, unit, reps: scheme.repRange[1], repRange };
  });

  const shell = exerciseShell(slot, ctx);
  const ruleNote = !isShoulder && !slot.rehab ? ctx.rule.accessoryNote : undefined;
  const extraNote = ctx.extraSets > 0 ? `+${ctx.extraSets} set for a lagging muscle (checkpoint 1 met).` : undefined;
  return {
    ...shell,
    sets,
    ...(lastRepOut ? { restBeforeRepOutSec: shell.restSec } : {}),
    notes: [...shell.notes, ...(ruleNote ? [ruleNote] : []), ...(extraNote ? [extraNote] : [])],
  };
}

function prescribeMain(slot: ProgramSlot, ctx: SlotContext): PrescribedExercise {
  const lift = slot.mainLift;
  if (!lift) throw new Error(`Main slot ${slot.exerciseKey} has no mainLift`);
  const sets = lift === 'squat' || lift === 'deadlift' ? tmLiftSets(lift, ctx) : stepLiftSets(lift, ctx);
  const shell = exerciseShell(slot, ctx);
  const heavyFinish = sets.some((s) => s.kind === 'rep_out' || s.kind === 'top');
  return { ...shell, sets, ...(heavyFinish ? { restBeforeRepOutSec: ctx.program.repOutRestSec } : {}) };
}

function working(load: number, reps: number, pctTm?: number): PrescribedSet {
  return { kind: 'working', load, unit: 'kg', reps, ...(pctTm !== undefined ? { pctTm } : {}) };
}
function repOut(load: number, target: number | undefined, note: string, pctTm?: number): PrescribedSet {
  return {
    kind: 'rep_out', load, unit: 'kg', reps: null,
    ...(target !== undefined ? { target } : {}), ...(pctTm !== undefined ? { pctTm } : {}), note,
  };
}

function tmLiftSets(lift: TmLiftKey, ctx: SlotContext): PrescribedSet[] {
  const { program, week, state, profile } = ctx;
  const ramp = (load: number, test = false) => warmupRamp(lift, load, profile.barKg, { test });

  if (week.type === 'calibration') {
    const load = program.calibrationLoads[lift];
    return [...ramp(load), repOut(load, undefined, 'One set to your last clean rep. Sets your training max.')];
  }
  if (week.type === 'test') {
    const goal = program.goals[lift];
    return [...ramp(goal.load, true), repOut(goal.load, goal.reps, 'PR test.')];
  }

  const row = program.mainLifts[lift].byWeekType[week.type];
  if (!row) throw new Error(`No ${lift} scheme for week type ${week.type}`);
  const tm = state.trainingMaxes[lift];
  if (tm === undefined) throw new Error(`Training max for ${lift} is required in week ${week.weekNo}`);
  const load = roundBarbell(tm * row.pctTm, profile.barbellStepKg);
  const addSet = state.addMainLiftSet?.[lift] === true && row.repOutTarget !== null;
  const out = [...ramp(load)];

  if (lift === 'deadlift' && row.sets === 0) {
    out.push(repOut(load, row.repOutTarget ?? undefined, 'Top set: rep-out, reset every rep.', row.pctTm));
    // Checkpoint fallback for the deadlift: "one set of 5 at 85% of that day's top load".
    if (addSet) out.push({ kind: 'backoff', load: roundBarbell(load * 0.85), unit: 'kg', reps: 5, note: 'Back-off set.' });
    return out;
  }

  const normalSets = row.sets + (addSet ? 1 : 0);
  for (let i = 0; i < normalSets; i++) {
    out.push(lift === 'deadlift' && row.reps === 1 && row.repOutTarget === null
      ? { kind: 'top', load, unit: 'kg', reps: 1, pctTm: row.pctTm, note: 'Single, no rep-out.' }
      : working(load, row.reps, row.pctTm));
  }
  if (row.repOutTarget !== null) out.push(repOut(load, row.repOutTarget, 'Rep-out at the same load.', row.pctTm));
  return out;
}

function stepLiftSets(lift: StepLiftKey, ctx: SlotContext): PrescribedSet[] {
  const { program, week, state, profile } = ctx;
  const def = program.mainLifts[lift];
  const ramp = (load: number) => warmupRamp(lift, load, profile.barKg, { rack: profile.dumbbellRackKg, beltStepKg: profile.beltStepKg });

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
  const normalSets = def.sets + (state.addMainLiftSet?.[lift] === true ? 1 : 0);
  return [
    ...ramp(current),
    ...Array.from({ length: normalSets }, () => working(current, def.reps)),
    repOut(current, def.repOutTarget, 'Rep-out at the same load.'),
  ];
}
