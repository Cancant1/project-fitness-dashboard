// Shared pieces for the rule modules: the week being judged, set/session lookups, number formatting.

import type { Session, SetRow, TrainingMax } from "../data/types";
import { isFlagged } from "../lib/analysis";
import { addDays, fmtNum, mondayOf } from "../lib/format";
import { bodyweight7d } from "../lib/nutrition";
import { PLAN } from "../plan/bridge";
import { getWeek, prescribeWeek } from "../plan/engine";
import type { MainLiftKey, PlanState, PrescribedDay, ProgramWeek, TmLiftKey, WeekType } from "../plan/types";
import { planRef } from "../plan/workout";
import type { CoachData } from "./data";
import type { EvidenceId } from "./evidence";
import type { Area, Signal, Status, WeekNumbers } from "./types";

export interface AreaResult {
  signals: Signal[];
  numbers: Partial<WeekNumbers>;
}

/** The plan week a report judges. */
export interface WeekCtx {
  data: CoachData;
  week: ProgramWeek;
  weekNo: number;
  /** Monday and Sunday. */
  from: string;
  to: string;
  today: string;
  /** min(today, Sunday): the last day that counts. */
  asOf: string;
  /** From the week's Sunday on. */
  complete: boolean;
  /** The adjusted week, prescribed from the current state (calibration loads where no TM exists yet). */
  days: PrescribedDay[];
  /** Completed plan sessions dated Monday … asOf. */
  sessions: Session[];
  /** Their completed, non-warm-up, non-timed, unflagged sets. */
  sets: SetRow[];
}

export function weekBounds(week: ProgramWeek): { from: string; to: string } {
  return { from: week.startDate, to: addDays(week.startDate, 6) };
}

/** Engine state that can always prescribe (calibration loads stand in for missing TMs). */
function prescribable(state: PlanState): PlanState {
  return {
    ...state,
    trainingMaxes: { squat: state.trainingMaxes.squat ?? PLAN.calibrationLoads.squat, deadlift: state.trainingMaxes.deadlift ?? PLAN.calibrationLoads.deadlift }
  };
}

export function weekContext(data: CoachData, weekNo: number, today: string): WeekCtx {
  const week = getWeek(data.plan, weekNo);
  const { from, to } = weekBounds(week);
  const asOf = today < to ? today : to;
  let days: PrescribedDay[] = [];
  try {
    days = prescribeWeek(data.plan, weekNo, prescribable(data.state), data.equipment);
  } catch {
    days = [];
  }
  const sessions = sessionsIn(data, from, asOf);
  return { data, week, weekNo, from, to, today, asOf, complete: today >= to, days, sessions, sets: workSets(data, sessions) };
}

export function sessionsIn(data: CoachData, from: string, to: string): Session[] {
  return data.planSessions.filter((s) => s.date >= from && s.date <= to);
}

/** Completed, non-warm-up, non-timed, unflagged sets of these sessions. */
export function workSets(data: CoachData, sessions: readonly Session[]): SetRow[] {
  return sessions.flatMap((s) => (data.setsBySession.get(s.id) ?? [])
    .filter((x) => x.completed && x.kind !== "warmup" && x.kind !== "timed" && !isFlagged(x)));
}

/** Plan exercise key of a set (its plan ref, else its exercise). */
export function keyOfSet(data: CoachData, s: SetRow): string | undefined {
  return planRef(s)?.exerciseKey ?? data.keyOf.get(s.exercise_id);
}

const CARE = new Set(PLAN.days.flatMap((d) => d.slots).filter((s) => s.role === "shoulder" || s.rehab).map((s) => s.exerciseKey));

/** Shoulder block and wrist extensions: care work, never counted as working sets. */
export const isCareKey = (key: string | undefined): boolean => key != null && CARE.has(key);

export const weekTypeOfSession = (s: Session): WeekType | undefined =>
  (s.legacy_ref as { plan?: { weekType?: WeekType } } | undefined)?.plan?.weekType;

export const TRAINING_WEEK = new Set<WeekType>(["A", "B", "C", "D"]);

export const LIFT_NAME: Record<MainLiftKey, string> = { squat: "Squat", deadlift: "Deadlift", incline_db_press: "Incline DB", weighted_pullup: "Pull-up" };

/** "Romanian deadlift", "Seated cable row": the plan name before the comma, else the exercise row's name. */
export function exerciseLabel(data: CoachData, key: string | undefined, exerciseId?: string | null): string {
  const def = key ? PLAN.exercises[key] : undefined;
  if (def) return def.name.split(",")[0]!;
  const e = exerciseId ? data.exercises.get(exerciseId) : undefined;
  return e?.name ?? "that exercise";
}

// ---------- training maxes ----------

export function tmRows(data: CoachData, lift: MainLiftKey): TrainingMax[] {
  const id = data.ids.get(lift);
  return id ? data.maxes.filter((m) => m.exercise_id === id) : [];
}

/** Latest row dated ≤ date (≥ the plan start when `planOnly`). */
export function tmRowAt(data: CoachData, lift: MainLiftKey, date: string, planOnly = true): TrainingMax | undefined {
  return tmRows(data, lift).filter((m) => m.effective_date <= date && (!planOnly || m.effective_date >= data.start)).at(-1);
}

export function tmAt(data: CoachData, lift: TmLiftKey, date: string): number | null {
  const r = tmRowAt(data, lift, date);
  return r ? Number(r.value_kg) : null;
}

// ---------- bodyweight ----------

/** 7-day average of the plan-period weigh-ins up to `date` (bodyweight7d). */
export const bw7 = (data: CoachData, date: string): number | null => bodyweight7d(data.measurements, date);

// ---------- dates ----------

/** The Monday after the week containing `date`. */
export const nextMonday = (date: string): string => addDays(mondayOf(date), 7);

export const WEEKDAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ---------- numbers as the UI shows them ----------

export const round1 = (x: number) => Math.round(x * 10) / 10;
export const near25 = (x: number) => Math.round(x / 2.5) * 2.5;
/** Loads and training maxes: as logged (2.5 kg steps). */
export const fmtLoad = (x: number) => fmtNum(x, 2);
/** Bodyweight: 0.1 kg. */
export const fmtBw = (x: number) => fmtNum(round1(x), 1);
/** kcal to 10. */
export const fmtKcal = (x: number) => fmtNum(Math.round(x / 10) * 10, 0);
/** Protein to 1 g. */
export const fmtG = (x: number) => fmtNum(Math.round(x), 0);
export const signed = (x: number, text: string) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${text}`;
export const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export function sig(id: string, area: Area, status: Status, title: string, message: string, why: EvidenceId[],
  extra: Partial<Pick<Signal, "metric" | "action">> = {}): Signal {
  return { id, area, status, title, message, why, ...extra };
}

/** Upper-case the first letter ("right elbow" → "Right elbow"). */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Lower-case the first letter, unless the first word is an acronym: "Incline DB press" → "incline DB press", "TM up" stays. */
export const lcFirst = (s: string) => (s.length > 1 && /[A-Z]/.test(s[1]!) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** "right_elbow" → "right elbow". */
export const siteName = (site: string) => site.replace(/_/g, " ").trim();
