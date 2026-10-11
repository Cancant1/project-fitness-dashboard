// Helpers for showing the plan: preview state with example training maxes, compact set descriptions,
// week intensity for the ribbon, and "what's next".

import { useMemo, useSyncExternalStore } from "react";
import { useRows } from "../../data/store";
import type { Program, Session } from "../../data/types";
import { addDays as addDaysIso, fmtNum, todayIso } from "../../lib/format";
import { addDays, dayForDate, prescribeDay, prescribeMinimum, prescribeWeek, trainingMaxFromSet, weekForDate } from "../../plan/engine";
import { PLAN, activeProgram, equipmentFrom, latestMaxes, planState, usePlan, usePlanIds } from "../../plan/bridge";
import type {
  DayKey, EquipmentProfile, LiftingDayKey, LoadBasis, MainLiftKey, PlanState, PrescribedDay, PrescribedExercise, PrescribedSet,
  ProgramDay, ProgramDefinition, ProgramWeek, TmLiftKey, WeekType
} from "../../plan/types";

/** The plan page's own defaults, used when no training max is known yet. */
export const EXAMPLE_TMS: Record<TmLiftKey, number> = { squat: 140, deadlift: 200 };

export interface PlanContext {
  /** The adjusted programme (PLAN + accepted coach adjustments): use it for weeks and prescriptions. */
  plan: ProgramDefinition;
  program: Program | undefined;
  ids: Map<string, string>;
  equipment: EquipmentProfile;
  latest: Partial<Record<string, number>>;
  /** Real state from the log (no example values). */
  state: PlanState;
  /** State used to show loads: real values, with example TMs where none exist. */
  preview: PlanState;
  example: Record<TmLiftKey, boolean>;
}

/** Everything the plan screens need, from live rows. */
export function usePlanContext(): PlanContext {
  const programs = useRows("programs");
  const maxes = useRows("training_maxes");
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const exercises = useRows("exercises");
  const profiles = useRows("profiles");
  const conditioning = useRows("conditioning");
  const painChecks = useRows("pain_checks");
  const today = todayIso();
  const ids = usePlanIds(exercises);
  const program = activeProgram(programs);
  const profile = profiles[0];
  const plan = usePlan();

  return useMemo(() => {
    const equipment = equipmentFrom(profile);
    const latest = latestMaxes(maxes, ids);
    const state: PlanState = program
      ? planState({ program, ids, maxes, sessions, sets, equipment, conditioning, plan, painChecks, today })
      : {
        trainingMaxes: {
          ...(latest.squat != null ? { squat: latest.squat } : {}),
          ...(latest.deadlift != null ? { deadlift: latest.deadlift } : {})
        },
        currentLoads: {
          ...(latest.incline_db_press != null ? { incline_db_press: latest.incline_db_press } : {}),
          ...(latest.weighted_pullup != null ? { weighted_pullup: latest.weighted_pullup } : {})
        }
      };
    const example = { squat: state.trainingMaxes.squat == null, deadlift: state.trainingMaxes.deadlift == null };
    const preview: PlanState = {
      ...state,
      trainingMaxes: { squat: state.trainingMaxes.squat ?? EXAMPLE_TMS.squat, deadlift: state.trainingMaxes.deadlift ?? EXAMPLE_TMS.deadlift }
    };
    return { plan, program, ids, equipment, latest, state, preview, example };
  }, [plan, program, ids, maxes, sessions, sets, profile, conditioning, painChecks, today]);
}

export function weekDays(weekNo: number, ctx: PlanContext): { days: PrescribedDay[]; error: string | null } {
  try {
    return { days: prescribeWeek(ctx.plan, weekNo, ctx.preview, ctx.equipment), error: null };
  } catch (e) {
    return { days: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** prescribeDay that returns null instead of throwing (e.g. no training max yet). Pass the adjusted plan (ctx.plan). */
export function tryDay(weekNo: number, dayKey: DayKey, state: PlanState, equipment: EquipmentProfile, plan: ProgramDefinition = PLAN): PrescribedDay | null {
  try {
    return prescribeDay(plan, weekNo, dayKey, state, equipment);
  } catch {
    return null;
  }
}

/** prescribeMinimum (E2, the ~30 min minimum session) that returns null instead of throwing. */
export function tryMinimum(weekNo: number, dayKey: DayKey, state: PlanState, equipment: EquipmentProfile, plan: ProgramDefinition = PLAN): PrescribedDay | null {
  try {
    return prescribeMinimum(plan, weekNo, dayKey, state, equipment);
  } catch {
    return null;
  }
}

/** The week containing `today`, or the first week before the plan starts. Null after it ends. */
export function currentWeek(today: string, plan: ProgramDefinition = PLAN): { week: ProgramWeek; status: "before" | "during" } | null {
  const w = weekForDate(plan, today);
  if (w) return { week: w, status: "during" };
  if (today < plan.startDate) return { week: plan.weeks[0]!, status: "before" };
  return null;
}

export const weekEnd = (w: ProgramWeek) => addDays(w.startDate, 6);
export const planEnd = (plan: ProgramDefinition = PLAN) => weekEnd(plan.weeks[plan.weeks.length - 1]!);

export const LIFTING_DAYS: LiftingDayKey[] = ["lower_a", "upper_a", "lower_b", "upper_b"];
export const dayDef = (key: DayKey): ProgramDay => PLAN.days.find((d) => d.key === key)!;

// ---------- done / next ----------

/** "weekNo:dayKey" for every completed session of this programme. */
export function doneSlots(sessions: Session[], program: Program | undefined): { slots: Set<string>; dates: Set<string> } {
  const mine = program ? sessions.filter((s) => s.status === "completed" && s.program_id === program.id) : [];
  return {
    dates: new Set(mine.map((s) => s.date)),
    slots: new Set(mine.map((s) => `${s.program_week_no}:${(s.legacy_ref as { plan?: { dayKey?: string } }).plan?.dayKey ?? ""}`))
  };
}

/** First lifting day from today on that isn't done yet. */
export function nextPlanned(sessions: Session[], program: Program | undefined, today: string, plan: ProgramDefinition = PLAN): { date: string; week: ProgramWeek; day: ProgramDay } | null {
  const first = plan.weeks[0]!.startDate;
  const end = planEnd(plan);
  const { slots, dates } = doneSlots(sessions, program);
  for (let d = today < first ? first : today; d <= end; d = addDaysIso(d, 1)) {
    const slot = dayForDate(plan, d);
    if (slot && slot.day.kind === "lifting" && !dates.has(d) && !slots.has(`${slot.week.weekNo}:${slot.day.key}`)) return { date: d, ...slot };
  }
  return null;
}

// ---------- week intensity (the ribbon) ----------

export type Phase = "calibration" | "training" | "light" | "test";

export function phaseOf(type: WeekType): Phase {
  if (type === "calibration") return "calibration";
  if (type === "test") return "test";
  if (type === "deload" || type === "taper") return "light";
  return "training";
}

/** Squat %TM for the week type (A 72.5 … D 87.5, deload 60, taper 85, test 100). Null for calibration. */
export function weekIntensity(type: WeekType): number | null {
  if (type === "calibration") return null;
  if (type === "test") return 1;
  return PLAN.mainLifts.squat.byWeekType[type]?.pctTm ?? null;
}

// ---------- text ----------

export const TYPE_NAME: Record<WeekType, string> = {
  calibration: "Calibration", A: "A · 5s", B: "B · 4s", C: "C · 3s", D: "D · 2s", deload: "Deload", taper: "Taper", test: "PR test"
};

export const LIFT_NAME: Record<string, string> = {
  squat: "Squat", deadlift: "Deadlift", incline_db_press: "Incline DB press", weighted_pullup: "Weighted pull-up"
};
export const LIFT_SHORT: Record<MainLiftKey, string> = { squat: "Squat", deadlift: "Deadlift", incline_db_press: "Incline DB", weighted_pullup: "Pull-up" };
const KEY_SHORT: Record<string, string> = { barbell_row: "Barbell row", db_bench_press: "DB bench", romanian_deadlift: "RDL" };

/** Exercise name for a compact row: the part before the comma. */
export const shortName = (ex: Pick<PrescribedExercise, "name" | "exerciseKey" | "mainLift">): string =>
  (ex.mainLift ? LIFT_SHORT[ex.mainLift] : KEY_SHORT[ex.exerciseKey]) ?? ex.name.split(",")[0]!;

/** The lifts that define a day: its main lifts, else its first compound. */
export function headlineLifts(day: PrescribedDay): PrescribedExercise[] {
  const mains = day.exercises.filter((e) => e.role === "main");
  if (mains.length) return mains;
  const first = day.exercises.find((e) => e.role === "compound");
  return first ? [first] : [];
}

export const GOAL_TM: Record<TmLiftKey, number> = {
  squat: trainingMaxFromSet(PLAN.goals.squat.load, PLAN.goals.squat.reps),
  deadlift: trainingMaxFromSet(PLAN.goals.deadlift.load, PLAN.goals.deadlift.reps)
};

export function fmtPct(p: number): string {
  return `${fmtNum(p * 100, 1)}%`;
}

export function fmtRest(sec: number): string {
  if (sec < 120 && sec % 60 !== 0) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

const BASIS: Record<LoadBasis, string> = { total: "", per_hand: "each hand", per_arm: "each arm", per_leg: "each leg", added: "added" };

/** "100 kg", "+5 kg", "22.5 kg each hand", "Bodyweight". */
export function fmtLoad(load: number, unit: PrescribedSet["unit"], basis: LoadBasis = "total"): string {
  if (unit === "bodyweight") return load ? `BW +${fmtNum(load)} kg` : "Bodyweight";
  if (basis === "added") return load ? `+${fmtNum(load)} ${unit}` : "Bodyweight";
  return `${fmtNum(load)} ${unit}${BASIS[basis] ? ` ${BASIS[basis]}` : ""}`;
}

/** Compact load for a row: "80 kg", "+5 kg", "50 lb", "BW". */
export function fmtLoadShort(load: number, unit: PrescribedSet["unit"], basis: LoadBasis = "total"): string {
  if (unit === "bodyweight" || basis === "added") return load ? `+${fmtNum(load)} kg` : "BW";
  return `${fmtNum(load)} ${unit}`;
}

const rangeText = (r: [number, number]) => (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`);

/** One accessory as "3 × 6–10" with its load; `repOut` when the last set is a rep-out. */
export function rowSummary(ex: PrescribedExercise): { sets: number; scheme: string; load: string; repOut: boolean } {
  const work = ex.sets.filter((s) => s.kind !== "warmup");
  const first = work[0];
  const reps = first?.durationSec != null ? `${first.durationSec} s` : first?.repRange ? rangeText(first.repRange) : first?.reps != null ? String(first.reps) : "max";
  return {
    sets: work.length,
    scheme: `${work.length} × ${reps}`,
    load: first ? fmtLoadShort(first.load, first.unit, ex.loadBasis) : "",
    repOut: work.some((s) => s.kind === "rep_out")
  };
}

/** A main lift: "3 × 4", "rep-out 8+", the working load and %TM. */
export function mainSummary(ex: PrescribedExercise, tms: PlanState["trainingMaxes"], noPct: boolean): {
  load: number; loadText: string; scheme: string; repOut: string | null; pct: number | null; warmups: PrescribedSet[];
} {
  const work = ex.sets.filter((s) => s.kind !== "warmup");
  const normal = work.filter((s) => s.kind === "working" || s.kind === "top");
  const backoff = work.filter((s) => s.kind === "backoff");
  const ro = work.find((s) => s.kind === "rep_out");
  const head = ro ?? normal[0] ?? work[0];
  const load = head?.load ?? 0;
  const parts: string[] = [];
  if (normal.length) parts.push(`${normal.length} × ${normal[0]!.reps ?? ""}`);
  if (backoff.length) parts.push("back-off");
  const pct = noPct ? null : head?.pctTm ?? pctOfTm(ex, load, tms);
  return {
    load,
    loadText: ex.loadBasis === "added" ? (load ? `+${fmtNum(load)}` : "BW") : fmtNum(load),
    scheme: parts.join(" + "),
    repOut: ro ? (ro.target != null ? `rep-out ${ro.target}+` : "rep-out") : null,
    pct,
    warmups: ex.sets.filter((s) => s.kind === "warmup")
  };
}

/** % of TM for a squat/deadlift load; null for other lifts. */
export function pctOfTm(ex: PrescribedExercise, load: number, tms: PlanState["trainingMaxes"]): number | null {
  if (ex.mainLift !== "squat" && ex.mainLift !== "deadlift") return null;
  const tm = tms[ex.mainLift];
  return tm ? load / tm : null;
}

export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dayOnly = new Intl.DateTimeFormat("en-GB", { day: "numeric" });

/** "12–18 Oct", "26 Oct – 1 Nov". */
export function fmtRange(start: string, end: string): string {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  return a.getMonth() === b.getMonth() ? `${dayOnly.format(a)}–${dayMonth.format(b)}` : `${dayMonth.format(a)} – ${dayMonth.format(b)}`;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", fn);
      return () => m.removeEventListener("change", fn);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
