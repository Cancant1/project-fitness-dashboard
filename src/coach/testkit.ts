// Synthetic data for the coach tests, built from the real PLAN (start Mon 12 Oct 2026). Test-only.

import type {
  BodyMeasurement, Conditioning, Exercise, FoodEntry, HealthDaily, NutritionTarget, PainCheck, Program, SetRow, Session, TrainingMax
} from "../data/types";
import { toKg } from "../lib/format";
import type { Adjustment, CoachAction } from "../plan/adjustments";
import { HISTORY_NAME, PLAN, PLAN_KEY } from "../plan/bridge";
import { addDays, prescribeDay } from "../plan/engine";
import type { DayKey, LiftingDayKey, MainLiftKey, PlanState, PrescribedExercise, PrescribedSet, WeekType } from "../plan/types";
import type { PlanSetRef } from "../plan/workout";
import { coachData, type CoachData, type CoachTables } from "./data";

let seq = 0;
const stamp = () => `2026-10-01T00:00:${String(Math.floor(seq / 1000) % 60).padStart(2, "0")}.${String(seq % 1000).padStart(3, "0")}Z`;
function base(prefix: string) {
  seq += 1;
  const t = stamp();
  return { id: `${prefix}-${seq}`, user_id: "u1", created_at: t, updated_at: t };
}

export const DAY_OF: Record<DayKey, number> = { lower_a: 1, upper_a: 2, easy_ride: 3, boxing: 4, lower_b: 5, upper_b: 6, rounds: 7 };
/** Monday of plan week n (unadjusted PLAN). */
export const monday = (n: number) => PLAN.weeks[n]!.startDate;
export const sunday = (n: number) => addDays(monday(n), 6);
/** Date of a plan day in week n. */
export const dayIn = (n: number, day: DayKey) => addDays(monday(n), DAY_OF[day] - 1);

export const STATE: PlanState = { trainingMaxes: { squat: 140, deadlift: 200 }, currentLoads: { incline_db_press: 22.5, weighted_pullup: 5 } };

export interface SessionOpts {
  weekNo?: number;
  weekType?: WeekType;
  state?: PlanState;
  energy?: number | null;
  /** Reps for a set; return undefined for the default (prescribed reps, rep-out target, range top). */
  reps?: (ex: PrescribedExercise, set: PrescribedSet, index: number) => number | undefined;
  /** Load override per set. */
  load?: (ex: PrescribedExercise, set: PrescribedSet, index: number) => number | undefined;
  /** Only these exercise keys. */
  only?: string[];
  status?: Session["status"];
}

export class World {
  readonly tables: CoachTables;
  readonly program: Program;
  readonly ids = new Map<string, string>();

  constructor(opts: { started?: boolean } = {}) {
    const exercises: Exercise[] = Object.values(PLAN.exercises).map((def) => {
      const e: Exercise = {
        ...base("ex"), name: HISTORY_NAME[def.key] ?? def.name, aliases: [], equipment: def.equipment, default_unit: "kg", kind: "isolation",
        muscle_direct: def.muscles[0] ?? null, muscle_indirect: def.muscles.slice(1), available: true, cues: null, archived: false,
        legacy_ref: { plan_key: def.key }
      };
      this.ids.set(def.key, e.id);
      return e;
    });
    this.program = {
      ...base("prog"), name: "Strength Return Plan", start_date: PLAN.startDate, weeks: PLAN.weeks.length, status: "active",
      rules: { key: PLAN_KEY }, goals: [], notes: null
    };
    this.tables = {
      programs: opts.started === false ? [] : [this.program], sessions: [], sets: [], exercises, training_maxes: [], body_measurements: [],
      food_entries: [], nutrition_days: [], nutrition_targets: [], pain_checks: [], conditioning: [], health_daily: [], profiles: []
    };
  }

  data(): CoachData {
    return coachData(this.tables);
  }

  /** A completed plan session with every prescribed set done (or as `opts` says). */
  session(date: string, dayKey: LiftingDayKey, opts: SessionOpts = {}): Session {
    const weekNo = opts.weekNo ?? PLAN.weeks.find((w) => date >= w.startDate && date <= addDays(w.startDate, 6))!.weekNo;
    const day = prescribeDay(PLAN, weekNo, dayKey, opts.state ?? STATE);
    const s: Session = {
      ...base("sess"), date, title: day.title, status: opts.status ?? "completed", started_at: `${date}T18:00:00Z`, ended_at: `${date}T19:15:00Z`,
      duration_min: 75, program_id: this.program.id, program_week_no: weekNo, program_day_id: null, energy: opts.energy ?? null, notes: null,
      date_confidence: "exact", date_basis: null, source: "app",
      legacy_ref: { plan: { programKey: PLAN.id, dayKey, weekType: opts.weekType ?? day.weekType, weekLabel: day.weekLabel, notes: [] } }
    };
    this.tables.sessions.push(s);
    for (const ex of day.exercises) {
      if (opts.only && !opts.only.includes(ex.exerciseKey)) continue;
      let n = 0;
      ex.sets.forEach((p, i) => {
        if (p.kind !== "warmup") n += 1;
        const reps = opts.reps?.(ex, p, i) ?? p.reps ?? p.target ?? p.repRange?.[1] ?? 8;
        const load = opts.load?.(ex, p, i) ?? p.load;
        const ref: PlanSetRef = { exerciseKey: ex.exerciseKey, role: ex.role, mainLift: ex.mainLift, group: ex.group, target: p.target, pctTm: p.pctTm, repRange: p.repRange, restSec: 90 };
        this.tables.sets.push({
          ...base("set"), session_id: s.id, exercise_id: this.ids.get(ex.exerciseKey)!, exercise_position: ex.order, set_no: p.kind === "warmup" ? 0 : n,
          kind: p.kind, load, unit: p.unit, load_kg: toKg(load, p.unit), reps, duration_s: null, rpe: null, target_reps: null, target_load: p.load,
          completed: true, flags: [], note: null, exercise_as_logged: ex.name, legacy_ref: { plan: ref }
        });
      });
    }
    return s;
  }

  /** All four lifting days of week n. */
  week(n: number, opts: SessionOpts = {}, days: LiftingDayKey[] = ["lower_a", "upper_a", "lower_b", "upper_b"]): Session[] {
    return days.flatMap((d) => {
      const day = prescribeDay(PLAN, n, d, opts.state ?? STATE);
      return day.kind === "lifting" ? [this.session(dayIn(n, d), d, { weekNo: n, ...opts })] : [];
    });
  }

  /** The rep-out set of a main lift in a session. */
  repOutSet(sessionId: string, lift: MainLiftKey): SetRow | undefined {
    return this.tables.sets.find((s) => s.session_id === sessionId && s.kind === "rep_out" && (s.legacy_ref as { plan?: PlanSetRef }).plan?.mainLift === lift);
  }

  tm(date: string, lift: MainLiftKey, value: number, reason: TrainingMax["reason"] = "rep_out", extra: Partial<TrainingMax> = {}): TrainingMax {
    const row: TrainingMax = {
      ...base("tm"), exercise_id: this.ids.get(lift)!, program_id: this.program.id, effective_date: date, value_kg: value, reason,
      source_set_id: null, note: null, ...extra
    };
    this.tables.training_maxes.push(row);
    return row;
  }

  weigh(date: string, kg: number): BodyMeasurement {
    const row: BodyMeasurement = { ...base("bw"), date, kind: "weight", value: kg, unit: "kg", note: null, source: "app" };
    this.tables.body_measurements.push(row);
    return row;
  }

  /** Daily weigh-ins from `from` for `days` days: kg = start + perWeek × (day / 7) + noise(day). */
  weighDaily(from: string, days: number, start: number, perWeek: number, noise: (i: number) => number = () => 0): void {
    for (let i = 0; i < days; i++) this.weigh(addDays(from, i), Math.round((start + (perWeek * i) / 7 + noise(i)) * 1000) / 1000);
  }

  waist(date: string, cm: number): void {
    this.tables.body_measurements.push({ ...base("waist"), date, kind: "waist", value: cm, unit: "cm", note: null, source: "app" });
  }

  food(date: string, kcal: number, protein: number): FoodEntry {
    const row: FoodEntry = {
      ...base("food"), date, time: null, meal: "other", food_id: null, name: "Day", serving_label: null, quantity: 1, kcal, protein,
      carbs: null, fat: null, note: null, legacy_ref: {}
    };
    this.tables.food_entries.push(row);
    return row;
  }

  target(patch: Partial<NutritionTarget> = {}): NutritionTarget {
    const row: NutritionTarget = {
      ...base("tgt"), effective_from: PLAN.startDate, phase: "lean bulk", kcal: 2800, protein: 150, protein_per_kg: 2.0, carbs: 310, fat: 80,
      per_weekday: null, target_weight: 77, note: null, ...patch
    };
    this.tables.nutrition_targets.push(row);
    return row;
  }

  pain(date: string, site: string, exerciseKey: string | null, patch: Partial<PainCheck> = {}): PainCheck {
    const row: PainCheck = {
      ...base("pain"), date, site, exercise_id: exerciseKey ? this.ids.get(exerciseKey)! : null, session_id: null,
      during_set: "ache", next_morning: null, worse_than_last: null, note: null, ...patch
    };
    this.tables.pain_checks.push(row);
    return row;
  }

  cond(date: string, kind: Conditioning["kind"], patch: Partial<Conditioning> = {}): Conditioning {
    const row: Conditioning = {
      ...base("cond"), date, kind, minutes: null, loop_time_s: null, rounds: null, first_round_count: null, last_round_count: null,
      done: true, note: null, ...patch
    };
    this.tables.conditioning.push(row);
    return row;
  }

  sleep(date: string, hours: number): HealthDaily {
    const row: HealthDaily = {
      ...base("hd"), date, sleep_total_min: Math.round(hours * 60), sleep_deep_min: null, sleep_rem_min: null, sleep_core_min: null,
      sleep_awake_min: null, resting_hr: null, hrv_sdnn_ms: null, source: "manual"
    };
    this.tables.health_daily.push(row);
    return row;
  }

  adjust(action: CoachAction, signalId = "test", created = "2026-10-20T10:00:00Z"): Adjustment {
    seq += 1;
    const adj: Adjustment = { id: `adj-${seq}`, kind: action.kind, created, signalId, data: action };
    const rules = this.program.rules as { adjustments?: Adjustment[] };
    rules.adjustments = [...(rules.adjustments ?? []), adj];
    return adj;
  }
}
