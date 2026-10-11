// Plan engine types. Pure data shapes: no I/O, no framework.
// Loads are numbers in the slot's unit: kg for barbell/dumbbell/belt, lb for most cable stacks,
// 0 with unit 'bodyweight' for unloaded bodyweight work. Pull-up loads are the ADDED kg.

export type WeekType = 'calibration' | 'A' | 'B' | 'C' | 'D' | 'deload' | 'taper' | 'test';
export type SlotRole = 'main' | 'compound' | 'isolation' | 'shoulder';
export type SetKind = 'warmup' | 'working' | 'rep_out' | 'top' | 'backoff' | 'failure';
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
  /** Weeks 8–9: extra sets for lagging muscles if checkpoint 1 was met. */
  extraSetsEligible?: boolean;
  checkpoint?: Checkpoint;
  /** Set by shiftAfterMissedWeek. */
  missed?: boolean;
  repeatOf?: number;
}

export interface AccessoryScheme {
  sets: number;
  repRange: [number, number];
  /** Last set is a rep-out (stop signs) instead of stopping at the top of the range. */
  lastSetRepOut: boolean;
  /** Every set goes to true failure. */
  toFailure: boolean;
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
}
export type ConditioningRule = RideRule | BoxingRule | RoundsRule;

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
  bodyweightRate: { minKgPerWeek: number; maxKgPerWeek: number; adjustKcal: number; fromWeek: number };
  nutrition: { kcal: number; proteinG: number; fatG: number; carbsG: number; targetBodyweightKg: [number, number] };
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
  /** After checkpoint 1 is met: muscles that get +1 set in extra-set weeks (8–9). */
  extraSetsMuscles?: readonly Muscle[];
  /** Behind at a checkpoint: add one normal set (deadlift: a back-off set). */
  addMainLiftSet?: Partial<Record<MainLiftKey, boolean>>;
  /** This week's planned Sunday rounds (before deload halving). */
  sundayRounds?: number;
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
}
