export type IsoDate = string;
export type IsoDateTime = string;
export type Unit = "kg" | "lb" | "bodyweight" | "assisted" | "min" | "reps";
export type MovementGroup = "Push" | "Pull" | "Legs" | "Conditioning" | "Other";
export type SessionStatus = "planned" | "draft" | "inProgress" | "completed" | "skipped" | "discarded";
export type SetType = "warmup" | "working" | "drop" | "amrap" | "failure" | "timed";

export interface VersionedEntity {
  id: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt?: IsoDateTime;
  source?: "workbook" | "reps-v1" | "fitness-os-v3" | "manual" | "github" | "seed";
  sourceRef?: string;
}

export interface Profile extends VersionedEntity {
  name: string;
  birthday?: IsoDate;
  preferredUnit: "kg" | "lb";
  locale: string;
  timeZone: string;
  activeRoutineId?: string;
  targetWeight?: number | null;
  trackCarbs: boolean;
  trackFat: boolean;
}

export interface Exercise extends VersionedEntity {
  name: string;
  aliases: string[];
  movement: MovementGroup;
  muscles: string[];
  equipment: string[];
  defaultUnit: Unit;
  compound: boolean;
  cues: string[];
  substitutions: string[];
  archived: boolean;
}

export interface SetPrescription {
  targetReps?: string;
  targetLoad?: number;
  targetUnit?: Unit;
  targetRpe?: number;
  targetRir?: number;
  type?: SetType;
}

export interface SetResult extends VersionedEntity {
  index: number;
  type: SetType;
  load?: number | null;
  unit: Unit;
  reps?: number | null;
  durationMinutes?: number | null;
  rpe?: number | null;
  rir?: number | null;
  note?: string;
  completed: boolean;
  completedAt?: IsoDateTime;
  prescription?: SetPrescription;
  sourceRaw?: unknown;
}

export interface ExercisePerformance extends VersionedEntity {
  exerciseId: string;
  exerciseNameSnapshot: string;
  order: number;
  movement: MovementGroup;
  prescription?: {
    targetSets?: number;
    targetReps?: string;
    note?: string;
  };
  sets: SetResult[];
  note?: string;
  skipped?: boolean;
}

export interface WorkoutSession extends VersionedEntity {
  profileId: string;
  title: string;
  split?: string;
  plannedWorkoutId?: string;
  plannedDate?: IsoDate;
  actualDate: IsoDate;
  status: SessionStatus;
  startedAt?: IsoDateTime;
  completedAt?: IsoDateTime;
  durationMinutes?: number;
  sessionRpe?: number | null;
  energy?: number | null;
  notes?: string;
  programInstanceId?: string;
  blockId?: string;
  returnBlockKey?: string;
  performances: ExercisePerformance[];
}

export interface PlannedExercise {
  id: string;
  exerciseId: string;
  nameSnapshot: string;
  order: number;
  targetSets: number;
  targetReps: string;
  unit: Unit;
  targetLoad?: number;
  note?: string;
}

export interface PlannedWorkout extends VersionedEntity {
  profileId: string;
  routineId?: string;
  programInstanceId?: string;
  blockId?: string;
  date: IsoDate;
  originalDate?: IsoDate;
  title: string;
  split?: string;
  status: "planned" | "moved" | "completed" | "skipped";
  exercises: PlannedExercise[];
  note?: string;
}

export interface RoutineDay {
  id: string;
  day: string;
  title: string;
  focus?: string;
  exercises: PlannedExercise[];
}

export interface RoutineTemplate extends VersionedEntity {
  profileId: string;
  name: string;
  description?: string;
  days: RoutineDay[];
  active?: boolean;
  returnBlockKey?: string;
}

export interface TrainingBlock extends VersionedEntity {
  profileId: string;
  name: string;
  phase?: string;
  startDate: IsoDate;
  endDate?: IsoDate;
  weeks: number;
  goal?: string;
  notes?: string;
  status?: "planned" | "active" | "completed";
}

export interface FoodServing {
  id: string;
  label: string;
  amount: number;
  unit: string;
  grams?: number;
}

export interface FoodDefinition extends VersionedEntity {
  profileId?: string;
  name: string;
  brand?: string;
  category?: string;
  servings: FoodServing[];
  kcalPerServing: number;
  proteinPerServing: number;
  carbsPerServing: number | null;
  fatPerServing: number | null;
  sourceLabel?: string;
  sourceUrl?: string;
  verified: boolean;
  favorite: boolean;
  archived: boolean;
}

export interface FoodLogEntry extends VersionedEntity {
  profileId: string;
  date: IsoDate;
  time?: string;
  meal?: "Breakfast" | "Lunch" | "Dinner" | "Snacks" | "Other";
  foodId?: string;
  nameSnapshot: string;
  servingLabelSnapshot: string;
  quantity: number;
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  note?: string;
}

export interface SavedMeal extends VersionedEntity {
  profileId: string;
  name: string;
  defaultMeal?: FoodLogEntry["meal"];
  items: Array<{
    foodId?: string;
    nameSnapshot: string;
    servingLabelSnapshot: string;
    quantity: number;
    kcal: number;
    protein: number;
    carbs: number | null;
    fat: number | null;
  }>;
}

export interface BodyMeasurement extends VersionedEntity {
  profileId: string;
  date: IsoDate;
  type: "weight" | "waist" | "other";
  value: number;
  unit: "kg" | "lb" | "cm" | "in";
  note?: string;
}

export interface NutritionTarget extends VersionedEntity {
  profileId: string;
  effectiveFrom: IsoDate;
  effectiveTo?: IsoDate;
  phase: string;
  targetWeight?: number | null;
  weekdays: Record<string, { kcal: number; protein: number; carbs?: number; fat?: number }>;
}

export interface NutritionOverride extends VersionedEntity {
  profileId: string;
  date: IsoDate;
  kcal?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  note?: string;
}

export interface Annotation extends VersionedEntity {
  profileId: string;
  type: "pr" | "deload" | "injury" | "travel" | "sick" | "form_change" | "note" | "holiday";
  date?: IsoDate;
  endDate?: IsoDate;
  exerciseId?: string;
  sessionId?: string;
  text: string;
  status?: string;
}

export interface LegacyFact extends VersionedEntity {
  profileId: string;
  type: "lifetime_pr" | "programming_rule" | "roadmap" | "profile" | "raw";
  title: string;
  value: unknown;
}

export interface EquipmentProfile extends VersionedEntity {
  profileId: string;
  items: string[];
  platesKg: number[];
  platesLb: number[];
}

export interface Tombstone {
  entityType: string;
  entityId: string;
  deletedAt: IsoDateTime;
  revision: string;
}

export interface AppearanceSettings {
  theme: "system" | "light" | "dark";
  density: "comfortable" | "compact";
}

export interface AppSettings {
  appearance: AppearanceSettings;
  restSeconds: number;
  workoutTimerEnabled?: boolean;
  restTimerEnabled?: boolean;
  preferredRpeMode: "rpe" | "rir" | "both" | "off";
  mealView: "meal" | "time";
  activeProfileId: string;
}

export interface MigrationIssue {
  level: "info" | "warning" | "error";
  source: string;
  message: string;
  sourceRef?: string;
}

export interface MigrationReport {
  id: string;
  createdAt: IsoDateTime;
  sources: Array<{ name: string; present: boolean; checksum?: string }>;
  sourceCounts: Record<string, number>;
  destinationCounts: Record<string, number>;
  dateRanges: Record<string, { min: string | null; max: string | null }>;
  issues: MigrationIssue[];
  unexplainedDrops: number;
}

export interface RepsSnapshot {
  app: "reps";
  schemaVersion: 2;
  snapshotId: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  updatedBy: string;
  revision: number;
  profiles: Profile[];
  exercises: Exercise[];
  sessions: WorkoutSession[];
  plannedWorkouts: PlannedWorkout[];
  routines: RoutineTemplate[];
  blocks: TrainingBlock[];
  foods: FoodDefinition[];
  foodEntries: FoodLogEntry[];
  savedMeals: SavedMeal[];
  measurements: BodyMeasurement[];
  nutritionTargets: NutritionTarget[];
  nutritionOverrides: NutritionOverride[];
  annotations: Annotation[];
  legacyFacts: LegacyFact[];
  equipmentProfiles: EquipmentProfile[];
  tombstones: Tombstone[];
  settings: AppSettings;
  migrationReport?: MigrationReport;
}

export interface GithubSyncConfig {
  enabled: boolean;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
  autoSync: boolean;
  clientId: string;
}

export interface GithubSyncMeta {
  lastRemoteSha: string | null;
  lastSyncAt: string | null;
  lastPushAt: string | null;
  dirty: boolean;
  status: "idle" | "syncing" | "synced" | "offline" | "error";
  message: string;
}

declare global {
  interface Window {
    FITNESS_DATA?: LegacyFitnessData;
    REPS_FOOD_CATALOG?: unknown[];
    PLANNED_ROUTINE?: unknown[];
    __DEFAULT_PLANNED_ROUTINE?: unknown[];
    RepsData?: Record<string, (...args: unknown[]) => unknown> & Record<string, unknown>;
  }
}

export interface LegacyFitnessData {
  metadata?: Record<string, unknown>;
  workouts?: { sessions?: unknown[]; blockSummaries?: unknown[]; exercises?: unknown[]; notableNotes?: unknown[] };
  body?: { daily?: unknown[]; weekly?: unknown[] };
  nutrition?: { foodItems?: unknown[] };
  plan?: { trainingCalendar?: unknown[]; nutritionTargets?: unknown[] };
  stats?: { profile?: string; programmingRules?: unknown[]; lifetimePrs?: unknown[]; rawRows?: unknown[][] };
  summary?: Record<string, unknown>;
}
