// Plan engine types. Pure data shapes: no I/O, no framework.
// Loads are numbers in the slot's unit: kg for barbell/dumbbell/belt, lb for most cable stacks,
// 0 with unit 'bodyweight' for unloaded bodyweight work. Pull-up loads are the ADDED kg.

export type WeekType = 'calibration' | 'A' | 'B' | 'C' | 'D' | 'deload' | 'taper' | 'test';
export type SlotRole = 'main' | 'compound' | 'isolation' | 'shoulder';
/** 'timed' = an isometric hold (wrist ladder flare-up step): durationSec instead of reps. */
export type SetKind = 'warmup' | 'working' | 'rep_out' | 'top' | 'backoff' | 'failure' | 'timed';
/**
 * How hard a set goes (E1, "tell me where to go max and where not"); labels in effort.ts.
 * max = rep-out to a stop sign · controlled = stop at the prescribed reps · failure = isolation to failure ·
 * stop_sign = isolation that ends at the first stop sign (elbow irritable, bad days, first week back) ·
 * easy = warm-ups, shoulder care, isometric holds · care = the wrist ladder.
 */
export type Effort = 'max' | 'controlled' | 'failure' | 'stop_sign' | 'easy' | 'care';
export type Unit = 'kg' | 'lb' | 'bodyweight';
export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'cable_pair' | 'bodyweight' | 'belt';
/** What the load number refers to. */
export type LoadBasis = 'total' | 'per_hand' | 'per_arm' | 'per_leg' | 'added';

export type MainLiftKey = 'squat' | 'deadlift' | 'incline_db_press' | 'weighted_pullup';
export type TmLiftKey = 'squat' | 'deadlift';
export type StepLiftKey = 'incline_db_press' | 'weighted_pullup';

export type LiftingDayKey = 'lower_a' | 'upper_a' | 'lower_b' | 'upper_b';
export type ConditioningDayKey = 'easy_ride' | 'boxing' | 'rounds';
export type DayKey = LiftingDayKey | ConditioningDayKey;
/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Muscle =
  | 'quads' | 'glutes' | 'adductors' | 'hamstrings' | 'calves' | 'abs'
  | 'chest' | 'back' | 'front_delts' | 'side_delts' | 'rear_delts'
  | 'biceps' | 'triceps' | 'forearms' | 'rotator_cuff' | 'serratus';

// ---------- programme definition (data) ----------

export interface Checkpoint {
  id: string;
  name: string;
  /** Checked at the END of this week (its Sunday). */
  weekNo: number;
  date: string;
  squatTm: number;
  deadliftTm: number;
  bodyweight7d: number;
}

export interface ProgramWeek {
  weekNo: number;
  /** Monday, ISO yyyy-mm-dd. */
  startDate: string;
  type: WeekType;
  label: string;
  notes: string[];
  /** Weeks 15–17: −1 set on isolation slots (never below 1). */
  isolationSetDelta?: number;
  /** A–D weeks 8–17 (not the deloads): the checkpoint-1 extra sets apply if checkpoint 1 was met. */
  extraSetsEligible?: boolean;
  /** A full rest week: every day is rest (week 10, England, DECISIONS 24 Oct 2026). */
  rest?: boolean;
  checkpoint?: Checkpoint;
  /** Set by shiftAfterMissedWeek. */
  missed?: boolean;
  repeatOf?: number;
  /** A training week turned into a deload by a coach adjustment (deload_now). */
  earlyDeload?: boolean;
  /** A deload turned into a training week (skip_deload: week 5 or 6 was missed). */
  deloadSkipped?: boolean;
}

export interface AccessoryScheme {
  sets: number;
  repRange: [number, number];
  /** Last set is a rep-out (stop signs) instead of stopping at the top of the range. */
  lastSetRepOut: boolean;
  /** Every set goes to true failure. */
  toFailure: boolean;
  /**
   * Set 1 decides the next load (DECISIONS 2026-10-28): later failure sets lose 30–40% of set 1's reps, so they are
   * fatigue, not a test. Only on failure isolation whose next step is small (≤ +25%). See `firstSetProgression`.
   */
  firstSet?: boolean;
}

export interface ProgramSlot {
  exerciseKey: string;
  role: SlotRole;
  /** Present on main-lift slots; the scheme then comes from ProgramDefinition.mainLifts. */
  mainLift?: MainLiftKey;
  /** Accessory/shoulder slots. */
  scheme?: AccessoryScheme;
  startLoad: number;
  unit: Unit;
  loadBasis: LoadBasis;
  /** Overrides the role's default rest. */
  restSec?: number;
  notes: string[];
  /** Tendon-care work: keeps its sets in deload/taper/reduced weeks. */
  rehab?: boolean;
  group?: 'shoulder_care';
  /** Curls, triceps extensions and pushdowns (E9): never two in one pair; stop-sign rule while the elbow is irritable. */
  elbowLoading?: boolean;
  /** A compound that opens its pattern for the day: two warm-up sets (≈55% × 5, ≈85% × 3) before the work sets. */
  warmup?: boolean;
  /** P-TIMESAVE pair id: slots of a day with the same id are done alternately (A, B). */
  pair?: string;
  /** Listed equivalents (exercise keys) for the deload variety swap (P-VARIETY, weeks 7 and 10). */
  alternatives?: string[];
  /** Prescribed only when an extra-set target names it (the optional Tuesday rear delt fly). */
  extraOnly?: boolean;
  /** J-PAINRULE trend: sets × (1 − fraction), rounded, at least 1, on days dated from … until. Added by applyAdjustments. */
  setCuts?: { fraction: number; from: string; until: string }[];
}

/** +1 set on this exercise on this day (R1-08 extra sets). */
export interface ExtraSetSlot {
  dayKey: LiftingDayKey;
  exerciseKey: string;
}

/** A fixed extra-set package (P-EXTRASETS, R1-08). */
export interface ExtraSetsPlan {
  muscles: Muscle[];
  targets: ExtraSetSlot[];
}

/** E13: the wrist-extension heavy-slow ladder (J-ELBOW, R1-15). */
export interface WristLadder {
  exerciseKey: string;
  /** Reps per set from this plan week on: 0–1: 15 · 2–3: 12 · 4–5: 10 · 6–8: 8 · 9–12: 6. */
  rungs: { fromWeek: number; reps: number }[];
  sets: number;
  /** Lifting days that carry the ladder (Mon, Fri); an optional home session on `homeDayKey` (Wed until 24 Oct 2026). */
  dayKeys: LiftingDayKey[];
  homeDayKey?: ConditioningDayKey;
  /**
   * R2-15 step rule: a rung is earned when every set of a ladder session reached the rung's reps with pain ≤ this
   * during the set and the next morning ≤ `morningRise` over the elbow baseline. The week schedule (`rungs`) is the
   * earliest a rung can start; without an earned rung the ladder holds.
   */
  stepRule?: { maxPain: number; morningRise: number };
  /** From this week: maintenance, once a week on maintain.dayKey. */
  maintainFromWeek: number;
  maintain: { dayKey: LiftingDayKey; sets: number; reps: number };
  /** Flare-up step: isometric holds instead (palm down, mid-range). */
  isometric: { sets: number; holdSec: [number, number] };
}

export interface RideRule {
  kind: 'ride';
  startMinutes: number;
  /** Stay at startMinutes up to and including this week. */
  holdThroughWeek: number;
  addPerWeek: number;
  maxMinutes: number;
}
export interface BoxingRule { kind: 'boxing'; minutes: number }
export interface RoundsRule {
  kind: 'rounds';
  workSec: number;
  easySec: number;
  warmupMin: number;
  startRounds: number;
  maxRounds: number;
  /** Last round within this fraction of the first → +1 round next week. */
  dropOffFraction: number;
  /** From this plan week, `burstRounds` of the rounds are burst rounds (C-ROUNDS, R1-30). */
  burstFromWeek?: number;
  burstRounds?: number;
  burstWorkSec?: number;
  burstEasySec?: number;
  /** "Finish by 14:00" (~30 h before Monday's squat). */
  finishBy?: string;
}
/** A day with nothing planned (24 Oct 2026: the Wed ride and Sun rounds were dropped): an open box to note what he did. */
export interface OpenRule { kind: 'open' }
export type ConditioningRule = RideRule | BoxingRule | RoundsRule | OpenRule;

export interface ProgramDay {
  key: DayKey;
  weekday: Weekday;
  title: string;
  focus: string;
  kind: 'lifting' | 'conditioning';
  slots: ProgramSlot[];
  conditioning?: ConditioningRule;
  /** Session length in minutes, straight sets / alternating isolation pairs. */
  minutes?: number;
  minutesAlternating?: number;
  notes: string[];
}

export interface ExerciseDefinition {
  key: string;
  name: string;
  equipment: Equipment;
  /** Primary muscle first. */
  muscles: Muscle[];
}

/** Squat: % of TM, normal sets × reps, then a rep-out at the same load. */
export interface TmPercentRow {
  pctTm: number;
  sets: number;
  reps: number;
  /** null = no rep-out this week type. */
  repOutTarget: number | null;
}
/** Deadlift: sets === 0 means "ramp, then one top-set rep-out"; otherwise sets × reps, no rep-out. */
export type TmRampRow = TmPercentRow;

export interface TmLiftDefinition {
  scheme: 'tm_percent' | 'tm_ramp';
  byWeekType: Partial<Record<WeekType, TmPercentRow>>;
}
export interface StepLiftDefinition {
  scheme: 'load_step';
  sets: number;
  reps: number;
  repOutTarget: number;
  /** Rep-out ≥ this → one step up. */
  stepUpAtReps: number;
  /** Rep-out ≤ this → one step down. */
  stepDownAtReps: number;
  /** Rep-out ≥ this → two steps up (incline 16: +2 dumbbells; pull-up 12: +5 kg). R1-04. */
  doubleStepAtReps?: number;
  /** Stuck: `after` rep-outs in a row at 6–9 reps at one load → the normal sets become reps[0], then reps[1] … */
  stuck?: { after: number; reps: number[] };
  /** Deload/taper: sets × reps one step lighter, no rep-out. */
  lightSets: number;
  lightReps: number;
}

export interface WeekTypeRule {
  includeAccessories: boolean;
  /** Max sets per accessory slot (null = as written). Rehab slots are exempt. */
  accessorySetCap: number | null;
  accessoryToFailure: boolean;
  /** Compound slots end with a rep-out. */
  compoundRepOut: boolean;
  accessoryNote?: string;
}

export interface Goal {
  lift: MainLiftKey;
  load: number;
  reps: number;
  unit: Unit;
  loadBasis: LoadBasis;
}

export interface ProgramDefinition {
  id: string;
  name: string;
  startDate: string;
  weeks: ProgramWeek[];
  days: ProgramDay[];
  exercises: Record<string, ExerciseDefinition>;
  mainLifts: {
    squat: TmLiftDefinition;
    deadlift: TmLiftDefinition;
    incline_db_press: StepLiftDefinition;
    weighted_pullup: StepLiftDefinition;
  };
  weekTypeRules: Record<WeekType, WeekTypeRule>;
  weekTypeLabels: Record<WeekType, string>;
  goals: Record<MainLiftKey, Goal>;
  calibrationLoads: Record<MainLiftKey, number>;
  restSecByRole: Record<SlotRole, number>;
  /** Rest before a main-lift rep-out or deadlift top set. */
  repOutRestSec: number;
  /**
   * Rate checks every 2 weeks from `fromWeek`; the fit uses weigh-ins from `fitFromWeek` on (creatine water,
   * E16), needs `minWeighIns` and drops readings more than `outlierKg` off a first-pass fit.
   */
  bodyweightRate: {
    minKgPerWeek: number; maxKgPerWeek: number; adjustKcal: number; fromWeek: number;
    fitFromWeek?: number; minWeighIns?: number; outlierKg?: number;
    /**
     * R2-14: the expected path is re-anchored at this week's 7-day average (its Sunday): from then on the band is
     * shifted to pass through it. Until then the early jump (glycogen, creatine, gut) reads as expected unless it is
     * more than `earlyAboveKg` over the path.
     */
    anchorWeek?: number; earlyAboveKg?: number;
  };
  nutrition: { kcal: number; proteinG: number; fatG: number; carbsG: number; targetBodyweightKg: [number, number] };
  /** Old-best e1RMs (R1-03): once the TM reaches them a hit holds the TM and a beat adds at most +2.5 kg. */
  oldBestE1rm?: Record<TmLiftKey, number>;
  /** Creatine start (E16): the expected bodyweight band rises by creatineBandKg over the first 4 weeks. */
  creatineStart?: string;
  creatineBandKg?: number;
  /** Date ranges left out of the bodyweight rate fit (England trip). */
  rateExclusions?: { from: string; to: string; label: string }[];
  /** P-TIMESAVE rest inside a pair (between A and B) and after the pair. */
  pairRestSec?: { between: number; after: number };
  /** Checkpoint fallbacks (R1-07): Friday light squat; deadlift back-off sets. */
  mainLiftFallbacks?: {
    squat: { dayKey: LiftingDayKey; beforeExerciseKey: string; pctTm: number; sets: number; reps: number };
    deadlift: { pctOfTop: number; sets: number; reps: number; repRange: [number, number] };
  };
  /** Extra sets at checkpoint 1 (R1-08): arms (fixed) and the optional rear delt set. */
  extraSets?: { arms: ExtraSetsPlan; rearDelt: ExtraSetsPlan };
  wristLadder?: WristLadder;
  /** Plan weeks with a progress-photo reminder (M-MEASURE), Thursday morning. */
  photoWeeks?: number[];
  /** Alternatives that are not in a slot (incline hammer curl), with their own scheme and start load. */
  alternativeSlots?: Record<string, ProgramSlot>;
  /** P-RESTART: rep-out cap after `capAfterDays` off; first week careful after `firstWeekAfterDays`. */
  restart?: { capAfterDays: number; firstWeekAfterDays: number; capPlusReps: number };
}

// ---------- equipment profile ----------

export interface EquipmentProfile {
  barKg: number;
  /** Plate denominations available (pairs), heaviest first not required. */
  platesKg: readonly number[];
  dumbbellRackKg: readonly number[];
  cableStepLb: number;
  cableStepKg: number;
  beltStepKg: number;
  barbellStepKg: number;
}

// ---------- engine input / output ----------

export interface PlanState {
  trainingMaxes: Partial<Record<TmLiftKey, number>>;
  /** Last/next working load per exercise key (incline_db_press, weighted_pullup, accessories). */
  currentLoads: Partial<Record<string, number>>;
  /** After checkpoint 1 is met: muscles that get +1 set in the extra-set weeks (A–D weeks 8–17). */
  extraSetsMuscles?: readonly Muscle[];
  /** Behind at a checkpoint: add one normal set (deadlift: a back-off set). */
  addMainLiftSet?: Partial<Record<MainLiftKey, boolean>>;
  /** This week's planned Sunday rounds (before deload halving). */
  sundayRounds?: number;
  /** R1-08 extra sets: +1 set on each (day, exercise); extraOnly slots appear only when named here. */
  extraSetTargets?: readonly ExtraSetSlot[];
  /** E5 stuck incline: the normal sets' reps (3 × 6, then 3 × 7) until the next load increase. */
  normalReps?: Partial<Record<StepLiftKey, number>>;
  /** E14: pain 4–5/10 last time → hold the load (planState already held it; the engine adds a note). */
  holdLoad?: Partial<Record<string, boolean>>;
  /** Jump cap: the next step is more than +25%, so the load waits until every set reaches `reps` (engine note). */
  /**
   * Jump cap: the next pin and the reps it waits for; `average` = the sets' average (not elbow work), `firstSet` =
   * set 1 only (set-1 lifts), else every set.
   */
  bigJump?: Partial<Record<string, { next: number; reps: number; average?: boolean; firstSet?: boolean }>>;
  /** E3 recalibration (≥ 4 weeks off): load of the next calibration rep-out (75% of the last TM). */
  recalibrate?: Partial<Record<TmLiftKey, number>>;
  /** E9: isolation that ends at the first stop sign instead of failure. */
  effort?: {
    /** Elbow pain ≥ 4/10: elbow-loading isolation on days dated from … until (the check's date + 14 days). */
    elbowIrritableFrom?: string;
    elbowIrritableUntil?: string;
    /** The last 2 sessions felt ≤ 2/5: all isolation in this plan week. */
    lowFeelWeekNo?: number;
  };
  /** E12 restart after a gap. */
  restart?: {
    /** Gap ≥ 10 days on this date: rep-outs with a target on days dated this … +6 are capped at target + 2. */
    capRepOutsFrom?: string;
    /** Gap ≥ 14 days: the first plan week back (no extra sets or main-lift sets, no failure). */
    firstWeekNo?: number;
  };
  /** E13: wrist ladder state. */
  wristLadder?: {
    /** Rungs back (one per flare-up), never before the first rung. */
    rungOffset?: number;
    /** Isometric holds on days dated from … until (3–7 days after a morning flare). */
    isometricFrom?: string;
    isometricUntil?: string;
    /**
     * The last ladder session: its load, the rung's reps, whether every set reached them, and the next dumbbell.
     * Heavy-slow loading: the load goes up when the rung's reps drop (15 → 12 → …), not within a rung.
     */
    last?: { load: number; reps: number; allHit: boolean; next: number };
    /** R2-15: rungs earned so far (index into `rungs`); the dose is the lower of this and the week schedule. */
    earned?: number;
  };
}

export interface PrescribedSet {
  kind: SetKind;
  load: number;
  unit: Unit;
  /** null = rep-out or failure: go until the stop sign / failure. */
  reps: number | null;
  repRange?: [number, number];
  /** Rep-out target in clean reps. */
  target?: number;
  pctTm?: number;
  note?: string;
  /** Set only where it differs from the exercise's effort (warm-ups, rep-outs). Resolve with setEffort(). */
  effort?: Effort;
  /** E12: stop the rep-out at this many reps even if more are there (first session after ≥ 10 days off). */
  capReps?: number;
  /** Timed set (isometric hold): seconds per hold (the top of the range). */
  durationSec?: number;
  /** A calibration rep-out (week 0, or a recalibration after ≥ 4 weeks off): it sets the TM instead of moving it. */
  calibration?: boolean;
  /** Jump cap: the next pin is a big jump, so the sets aim for this many reps first. */
  aimReps?: number;
  /** Jump cap: `aimReps` is the sets' average, not every set. */
  aimAverage?: boolean;
  /** Jump cap: `aimReps` is for set 1 only (set-1 lifts). */
  aimFirstSet?: boolean;
}

export interface PrescribedExercise {
  order: number;
  exerciseKey: string;
  name: string;
  role: SlotRole;
  mainLift?: MainLiftKey;
  equipment: Equipment;
  unit: Unit;
  loadBasis: LoadBasis;
  group?: 'shoulder_care';
  /** Care work (wrist extensions): not counted as a working set. */
  rehab?: boolean;
  /** How hard this exercise's working sets go (E1). A set with its own `effort` overrides it (setEffort). */
  effort: Effort;
  /** Curl / triceps extension / pushdown (E9). */
  elbowLoading?: boolean;
  /**
   * P-TIMESAVE pair id and position ("A", "B", "C"). Pair members are adjacent in `order`; restSec is then the
   * short rest before the partner's set (A) or the rest after the pair (last member).
   */
  pair?: string;
  pairLabel?: string;
  /** Deload variety equivalents (exercise keys; label them with swapLabel). */
  alternatives?: string[];
  sets: PrescribedSet[];
  restSec: number;
  restBeforeRepOutSec?: number;
  notes: string[];
}

export interface PrescribedConditioning {
  kind: ConditioningRule['kind'];
  minutes?: number;
  rounds?: number;
  workSec?: number;
  easySec?: number;
  warmupMin?: number;
  skipped?: boolean;
  /** Sunday from week 4: how many of the rounds are burst rounds (5 s all-out / 10 s easy for 2 min). */
  burstRounds?: number;
  burstWorkSec?: number;
  burstEasySec?: number;
  /** "14:00": finish the rounds by then. */
  finishBy?: string;
  /** One line for the card, e.g. "8 rounds, of which 2 are burst rounds: …". */
  text?: string;
  notes?: string[];
  /** Home tasks on this day (Wednesday: the wrist ladder). */
  homeTasks?: { id: 'wrist_ladder'; text: string; sets: number; reps: number | null; holdSec?: [number, number] }[];
}

export interface PrescribedDay {
  programId: string;
  weekNo: number;
  weekType: WeekType;
  weekLabel: string;
  date: string;
  dayKey: DayKey;
  weekday: Weekday;
  title: string;
  kind: 'lifting' | 'conditioning' | 'rest';
  exercises: PrescribedExercise[];
  conditioning?: PrescribedConditioning;
  /** Working sets excluding warm-ups and the shoulder-care block. */
  workingSetCount: number;
  minutes?: number;
  minutesAlternating?: number;
  notes: string[];
  /** E2: the minimum session (~30 min). It counts as the day's session. */
  minimum?: boolean;
}
