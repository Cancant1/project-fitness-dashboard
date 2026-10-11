// Row shapes mirror supabase/migrations/*_init.sql. Every row carries the sync columns in Base.

export interface Base {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  server_updated_at?: string;
  deleted_at?: string | null;
}

export type Unit = "kg" | "lb" | "bodyweight" | "min" | "reps";

export interface Profile extends Base {
  display_name: string;
  timezone: string;
  plates_kg: number[];
  bar_kg: number;
  dumbbells_kg: number[];
  cable_step_lb: number;
  settings: Record<string, unknown>;
}

export interface Exercise extends Base {
  name: string;
  aliases: string[];
  equipment: string | null;
  default_unit: Unit;
  kind: "main" | "compound" | "isolation" | "conditioning" | "mobility";
  muscle_direct: string | null;
  muscle_indirect: string[];
  available: boolean;
  cues: string | null;
  archived: boolean;
  legacy_ref: Record<string, unknown>;
}

export interface Program extends Base {
  name: string;
  start_date: string;
  weeks: number;
  status: "draft" | "active" | "completed" | "archived";
  rules: Record<string, unknown>;
  goals: unknown[];
  notes: string | null;
}

export interface TrainingMax extends Base {
  exercise_id: string;
  program_id: string | null;
  effective_date: string;
  value_kg: number;
  reason: "start" | "calibration" | "rep_out" | "checkpoint" | "missed_weeks" | "manual";
  source_set_id: string | null;
  note: string | null;
}

export interface Session extends Base {
  date: string;
  title: string | null;
  status: "planned" | "in_progress" | "completed" | "skipped" | "discarded";
  started_at: string | null;
  ended_at: string | null;
  duration_min: number | null;
  program_id: string | null;
  program_week_no: number | null;
  program_day_id: string | null;
  energy: number | null;
  notes: string | null;
  date_confidence: "exact" | "week known" | "estimated";
  date_basis: string | null;
  source: string;
  legacy_ref: Record<string, unknown>;
}

export type SetKind = "warmup" | "working" | "rep_out" | "top" | "backoff" | "failure" | "drop" | "timed";

export interface SetRow extends Base {
  session_id: string;
  exercise_id: string;
  exercise_position: number;
  set_no: number;
  kind: SetKind;
  load: number | null;
  unit: Unit;
  load_kg: number | null;
  reps: number | null;
  duration_s: number | null;
  rpe: number | null;
  target_reps: string | null;
  target_load: number | null;
  completed: boolean;
  flags: string[];
  note: string | null;
  exercise_as_logged: string | null;
  legacy_ref: Record<string, unknown>;
}

export interface PainCheck extends Base {
  date: string;
  site: string;
  exercise_id: string | null;
  session_id: string | null;
  during_set: "none" | "ache" | "sharp" | null;
  next_morning: "normal" | "sore" | null;
  worse_than_last: boolean | null;
  note: string | null;
}

export interface Conditioning extends Base {
  date: string;
  kind: "ride" | "boxing" | "rounds" | "walk" | "other";
  minutes: number | null;
  loop_time_s: number | null;
  rounds: number | null;
  first_round_count: number | null;
  last_round_count: number | null;
  done: boolean;
  note: string | null;
}

export interface BodyMeasurement extends Base {
  date: string;
  kind: "weight" | "waist" | "other";
  value: number;
  unit: "kg" | "lb" | "cm" | "in";
  note: string | null;
  source: string;
}

export interface Food extends Base {
  name: string;
  brand: string | null;
  category: string | null;
  servings: { id: string; label: string; amount: number; unit: string; grams?: number }[];
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  favorite: boolean;
  archived: boolean;
  source: string;
  legacy_ref: Record<string, unknown>;
}

export type Meal = "breakfast" | "lunch" | "dinner" | "snacks" | "other";

export interface FoodEntry extends Base {
  date: string;
  time: string | null;
  meal: Meal | null;
  food_id: string | null;
  name: string;
  serving_label: string | null;
  quantity: number;
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  note: string | null;
  legacy_ref: Record<string, unknown>;
}

export interface SavedMeal extends Base {
  name: string;
  default_meal: Meal | null;
  items: Omit<FoodEntry, keyof Base | "date" | "time">[];
  position: number;
}

export interface NutritionTarget extends Base {
  effective_from: string;
  phase: string | null;
  kcal: number;
  protein: number;
  carbs: number | null;
  fat: number | null;
  per_weekday: Record<string, { kcal: number; protein: number }> | null;
  target_weight: number | null;
  note: string | null;
}

export interface NutritionDay extends Base {
  date: string;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  note: string | null;
  source: string;
}

export interface Annotation extends Base {
  kind: "pr" | "deload" | "injury" | "travel" | "sick" | "form_change" | "note" | "holiday";
  date: string | null;
  end_date: string | null;
  exercise_id: string | null;
  session_id: string | null;
  text: string;
  status: string | null;
}

export interface Fact extends Base {
  kind: "lifetime_pr" | "injury" | "programming_rule" | "roadmap" | "equipment" | "other";
  title: string;
  value: unknown;
  source: string | null;
}

export interface Tables {
  profiles: Profile;
  exercises: Exercise;
  programs: Program;
  training_maxes: TrainingMax;
  sessions: Session;
  sets: SetRow;
  pain_checks: PainCheck;
  conditioning: Conditioning;
  body_measurements: BodyMeasurement;
  foods: Food;
  food_entries: FoodEntry;
  saved_meals: SavedMeal;
  nutrition_targets: NutritionTarget;
  nutrition_days: NutritionDay;
  annotations: Annotation;
  facts: Fact;
}

export type TableName = keyof Tables;

export const TABLES: TableName[] = [
  "profiles", "exercises", "programs", "training_maxes", "sessions", "sets", "pain_checks",
  "conditioning", "body_measurements", "foods", "food_entries", "saved_meals",
  "nutrition_targets", "nutrition_days", "annotations", "facts"
];

// Push order respects foreign keys.
export const PUSH_ORDER: TableName[] = [
  "profiles", "exercises", "programs", "training_maxes", "sessions", "sets", "pain_checks",
  "conditioning", "body_measurements", "foods", "food_entries", "saved_meals",
  "nutrition_targets", "nutrition_days", "annotations", "facts"
];
