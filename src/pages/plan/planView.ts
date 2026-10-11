// Helpers for showing the plan: preview state with example training maxes, and plain-text set descriptions.

import { useMemo, useSyncExternalStore } from "react";
import { useRows } from "../../data/store";
import type { Program } from "../../data/types";
import { fmtNum } from "../../lib/format";
import { addDays, prescribeWeek, weekForDate } from "../../plan/engine";
import { PLAN, activeProgram, equipmentFrom, latestMaxes, planState, usePlanIds } from "../../plan/bridge";
import type {
  EquipmentProfile, LoadBasis, PlanState, PrescribedDay, PrescribedExercise, PrescribedSet, ProgramWeek, TmLiftKey, WeekType
} from "../../plan/types";

/** The plan page's own defaults, used when no training max is known yet. */
export const EXAMPLE_TMS: Record<TmLiftKey, number> = { squat: 140, deadlift: 200 };

export interface PlanContext {
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
  const ids = usePlanIds(exercises);
  const program = activeProgram(programs);
  const profile = profiles[0];

  return useMemo(() => {
    const equipment = equipmentFrom(profile);
    const latest = latestMaxes(maxes, ids);
    const state: PlanState = program
      ? planState({ program, ids, maxes, sessions, sets, equipment })
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
    return { program, ids, equipment, latest, state, preview, example };
  }, [program, ids, maxes, sessions, sets, profile]);
}

export function weekDays(weekNo: number, ctx: PlanContext): { days: PrescribedDay[]; error: string | null } {
  try {
    return { days: prescribeWeek(PLAN, weekNo, ctx.preview, ctx.equipment), error: null };
  } catch (e) {
    return { days: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** The week containing `today`, or the first week before the plan starts. Null after it ends. */
export function currentWeek(today: string): { week: ProgramWeek; status: "before" | "during" } | null {
  const w = weekForDate(PLAN, today);
  if (w) return { week: w, status: "during" };
  if (today < PLAN.startDate) return { week: PLAN.weeks[0]!, status: "before" };
  return null;
}

export const weekEnd = (w: ProgramWeek) => addDays(w.startDate, 6);

// ---------- text ----------

export const TYPE_NAME: Record<WeekType, string> = {
  calibration: "Calibration", A: "A · 5s", B: "B · 4s", C: "C · 3s", D: "D · 2s", deload: "Deload", taper: "Taper", test: "PR test"
};

export function typeChip(type: WeekType): string {
  if (type === "test") return "chip chip-warm";
  if (type === "deload" || type === "taper" || type === "calibration") return "chip chip-plain";
  return "chip chip-accent";
}

export const LIFT_NAME: Record<string, string> = {
  squat: "Squat", deadlift: "Deadlift", incline_db_press: "Incline DB press", weighted_pullup: "Weighted pull-up"
};

export const ROLE_NAME: Record<PrescribedExercise["role"], string> = {
  main: "Main lift", compound: "Compound", isolation: "Isolation", shoulder: "Shoulder care"
};

const BASIS: Record<LoadBasis, string> = { total: "", per_hand: "each hand", per_arm: "each arm", per_leg: "each leg", added: "added" };

export function fmtPct(p: number): string {
  return `${fmtNum(p * 100, 1)}%`;
}

export function fmtRest(sec: number): string {
  if (sec < 120 && sec % 60 !== 0) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** "100 kg", "+5 kg", "22.5 kg each hand", "Bodyweight". */
export function fmtLoad(load: number, unit: PrescribedSet["unit"], basis: LoadBasis = "total"): string {
  if (unit === "bodyweight") return load ? `BW +${fmtNum(load)} kg` : "Bodyweight";
  if (basis === "added") return load ? `+${fmtNum(load)} ${unit}` : "Bodyweight";
  return `${fmtNum(load)} ${unit}${BASIS[basis] ? ` ${BASIS[basis]}` : ""}`;
}

export interface SetGroup {
  kind: PrescribedSet["kind"];
  count: number;
  scheme: string;
  load: number;
  unit: PrescribedSet["unit"];
  pctTm?: number;
  note?: string;
}

/** Collapses identical consecutive working sets: 3 × 5, then the rep-out on its own line. Warm-ups excluded. */
export function groupSets(ex: PrescribedExercise): SetGroup[] {
  const out: SetGroup[] = [];
  for (const s of ex.sets) {
    if (s.kind === "warmup") continue;
    const scheme = schemeText(s);
    const last = out[out.length - 1];
    if (last && last.kind === s.kind && last.scheme === scheme && last.load === s.load && s.kind !== "rep_out") {
      last.count += 1;
      continue;
    }
    out.push({ kind: s.kind, count: 1, scheme, load: s.load, unit: s.unit, ...(s.pctTm != null ? { pctTm: s.pctTm } : {}), ...(s.note ? { note: s.note } : {}) });
  }
  return out;
}

function schemeText(s: PrescribedSet): string {
  const range = s.repRange ? (s.repRange[0] === s.repRange[1] ? String(s.repRange[0]) : `${s.repRange[0]}–${s.repRange[1]}`) : null;
  switch (s.kind) {
    case "rep_out": return s.target != null ? `Rep-out, target ${s.target}+` : range ? `Rep-out to a stop sign (${range})` : "Rep-out to your last clean rep";
    case "failure": return `${range ?? "max"}, to failure`;
    case "top": return `${s.reps ?? 1}, single`;
    case "backoff": return `${s.reps ?? ""}, back-off`;
    default: return range ?? String(s.reps ?? "");
  }
}

export function groupLabel(g: SetGroup): string {
  if (g.kind === "rep_out") return g.scheme;
  return `${g.count} × ${g.scheme}`;
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
