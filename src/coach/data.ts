// Builds the coach's input from the store's rows. Pure: the same function serves the app (useCoachData)
// and the check-in script (rows pulled from Supabase).

import type {
  BodyMeasurement, Conditioning, Exercise, FoodEntry, HealthDaily, NutritionDay, NutritionTarget, PainCheck, Profile,
  Program, SetRow, Session, TrainingMax
} from "../data/types";
import { adjustmentsOf, type Adjustment } from "../plan/adjustments";
import { PLAN, activeProgram, equipmentFrom, latestMaxes, planFor, planIds, planState } from "../plan/bridge";
import { addDays } from "../plan/engine";
import type { EquipmentProfile, PlanState, ProgramDefinition } from "../plan/types";

/** The rows the coach reads, by table name (as useRows / a Supabase select returns them). */
export interface CoachTables {
  programs: Program[];
  sessions: Session[];
  sets: SetRow[];
  exercises: Exercise[];
  training_maxes: TrainingMax[];
  body_measurements: BodyMeasurement[];
  food_entries: FoodEntry[];
  nutrition_days: NutritionDay[];
  nutrition_targets: NutritionTarget[];
  pain_checks: PainCheck[];
  conditioning: Conditioning[];
  health_daily: HealthDaily[];
  /** Equipment (bar, rack); defaults when missing. */
  profiles?: Profile[];
}

export interface CoachData {
  /** The adjusted programme: PLAN with the accepted adjustments folded in. Use it for weeks and prescriptions. */
  plan: ProgramDefinition;
  /** The active programme row, or null before the plan is started. */
  program: Program | null;
  adjustments: Adjustment[];
  /** First and last day of the adjusted plan. Judgements use rows from `start` on (clean slate). */
  start: string;
  end: string;
  /** Plan exercise key → exercise id, and back. */
  ids: Map<string, string>;
  keyOf: Map<string, string>;
  exercises: Map<string, Exercise>;
  equipment: EquipmentProfile;
  /** Engine state now (training maxes, next loads, adjustments, Sunday rounds). */
  state: PlanState;
  /** Every live session (history included), oldest first. */
  sessions: Session[];
  /** Completed sessions of this plan dated ≥ start, oldest first. */
  planSessions: Session[];
  setsBySession: Map<string, SetRow[]>;
  /** All training_maxes rows, oldest first (effective_date, then created_at). */
  maxes: TrainingMax[];
  /** Body measurements dated ≥ start (judgements). */
  measurements: BodyMeasurement[];
  /** All body measurements (baselines, e.g. g/kg before the first plan weigh-in). */
  allMeasurements: BodyMeasurement[];
  /** Food rows dated ≥ start; every nutrition target. */
  foodEntries: FoodEntry[];
  nutritionDays: NutritionDay[];
  targets: NutritionTarget[];
  /** Pain checks, conditioning and health rows dated ≥ start. */
  pain: PainCheck[];
  conditioning: Conditioning[];
  health: HealthDaily[];
}

const live = <T extends { deleted_at?: string | null }>(rows: readonly T[]): T[] => rows.filter((r) => !r.deleted_at);
const byDate = <T extends { date: string; created_at: string }>(a: T, b: T) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at);

const planKeyOf = (s: Session): string | undefined => (s.legacy_ref as { plan?: { programKey?: string } } | undefined)?.plan?.programKey;

export function coachData(t: CoachTables): CoachData {
  const exercisesList = live(t.exercises);
  const ids = planIds(exercisesList);
  const keyOf = new Map<string, string>();
  for (const [key, id] of ids) if (!keyOf.has(id)) keyOf.set(id, key);
  // Duplicates of a plan exercise (same plan_key, another id) still map back to their key.
  for (const e of exercisesList) {
    const k = (e.legacy_ref as { plan_key?: string } | null)?.plan_key;
    if (k && !keyOf.has(e.id)) keyOf.set(e.id, k);
  }
  const program = activeProgram(live(t.programs)) ?? null;
  const adjustments = program ? adjustmentsOf(program.rules) : [];
  const plan = planFor(program);
  const start = plan.startDate;
  const end = addDays(plan.weeks[plan.weeks.length - 1]!.startDate, 6);
  const fromStart = <T extends { date: string }>(rows: readonly T[]) => rows.filter((r) => r.date >= start);

  const sessions = live(t.sessions).sort(byDate);
  const planSessions = sessions.filter((s) => s.status === "completed" && s.date >= start
    && ((program != null && s.program_id === program.id) || planKeyOf(s) === PLAN.id));
  const sets = live(t.sets);
  const setsBySession = new Map<string, SetRow[]>();
  for (const s of sets) {
    const list = setsBySession.get(s.session_id);
    if (list) list.push(s);
    else setsBySession.set(s.session_id, [s]);
  }
  for (const list of setsBySession.values()) list.sort((a, b) => a.exercise_position - b.exercise_position || a.set_no - b.set_no);
  const maxes = live(t.training_maxes).sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.created_at.localeCompare(b.created_at));
  const equipment = equipmentFrom(live(t.profiles ?? [])[0]);
  const conditioning = fromStart(live(t.conditioning)).sort(byDate);

  const state: PlanState = program
    ? planState({ program, ids, maxes, sessions, sets, equipment, conditioning, plan })
    : (() => {
      const latest = latestMaxes(maxes, ids);
      return {
        trainingMaxes: { ...(latest.squat != null ? { squat: latest.squat } : {}), ...(latest.deadlift != null ? { deadlift: latest.deadlift } : {}) },
        currentLoads: {
          ...(latest.incline_db_press != null ? { incline_db_press: latest.incline_db_press } : {}),
          ...(latest.weighted_pullup != null ? { weighted_pullup: latest.weighted_pullup } : {})
        }
      };
    })();

  const allMeasurements = live(t.body_measurements).sort(byDate);
  return {
    plan, program, adjustments, start, end, ids, keyOf,
    exercises: new Map(exercisesList.map((e) => [e.id, e])),
    equipment, state, sessions, planSessions, setsBySession, maxes,
    measurements: fromStart(allMeasurements),
    allMeasurements,
    foodEntries: fromStart(live(t.food_entries)),
    nutritionDays: fromStart(live(t.nutrition_days)),
    targets: live(t.nutrition_targets),
    pain: fromStart(live(t.pain_checks)).sort(byDate),
    conditioning,
    health: fromStart(live(t.health_daily)).sort(byDate)
  };
}
