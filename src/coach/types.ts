// Coach output shapes (docs/COACH.md §3). Pure data; no React.

import type { Adjustment, CoachAction } from "../plan/adjustments";
import type { MainLiftKey, Muscle, StepLiftKey, TmLiftKey, WeekType } from "../plan/types";
import type { EvidenceId } from "./evidence";

export type { Adjustment, CoachAction };

/**
 * good = on plan · watch = keep an eye on it · act = change something · info = for the record ·
 * pending = needs the full week (the week is still running).
 */
export type Status = "good" | "watch" | "act" | "info" | "pending";
export type Area = "consistency" | "strength" | "muscle" | "body" | "fuel" | "joints" | "recovery" | "conditioning";

export const AREAS: readonly Area[] = ["consistency", "strength", "muscle", "body", "fuel", "joints", "recovery", "conditioning"];

export interface Signal {
  /** Stable rule id + subject, e.g. "body.rate", "strength.tm.squat". */
  id: string;
  area: Area;
  status: Status;
  /** ≤ 6 words, e.g. "Squat on track". */
  title: string;
  /** One or two sentences with his numbers. */
  message: string;
  metric?: { label: string; value: string; target?: string; series?: number[] };
  /** Something he can apply with one tap (applyCoachAction). */
  action?: CoachAction;
  /** Playbook entry ids (evidence.ts). */
  why: EvidenceId[];
  /**
   * Set when the suggested action was already applied: the status then drops to "info", the action is
   * removed and the message ends with "Applied {date}."
   */
  applied?: { adjustmentId: string; created: string };
}

/** The raw metrics behind a weekly report (for the check-in script and detail views). Null = no data. */
export interface WeekNumbers {
  /** Completed plan sessions (minimum sessions count) vs planned lifting days. */
  sessions: { done: number; planned: number; minimum?: number };
  /** P-HABITS: weeks in a row with 4+ sessions (meter n/6), "missed twice in a row" events and comebacks this week. */
  habit?: { weeks: number; target: number; missedTwice: number; comebacks: number };
  workingSets: { done: number; planned: number };
  trainingMax: Partial<Record<TmLiftKey, { tm: number | null; line: number | null; calibration: number | null; provisional: boolean }>>;
  repOuts: { lift: MainLiftKey; date: string; load: number; reps: number; target: number | null; tmFrom: number | null; tmTo: number | null; nextLoad: number | null }[];
  /** Next working load of the step lifts (kg per hand / added kg). */
  stepLoads: Partial<Record<StepLiftKey, number>>;
  /** Fractional sets this week per reference muscle. */
  muscles: { muscle: string; key: Muscle; sets: number; plan: number; good: number; pctOfGood: number }[];
  bodyweight: {
    avg7d: number | null; band: [number, number] | null; weighIns: number;
    /** kg/week from the 28-day least-squares fit (rate weeks only) and its standard error. */
    rate: number | null; rateSe: number | null; rateN: number;
    /** Set when this week's rate check was skipped (e.g. "holiday"). */
    rateSkipped?: string | null;
  };
  waist: { latestCm: number | null; cmPerMonth: number | null };
  /** M-MEASURE photos: a photo week, done, and the next photo Thursday. */
  photos?: { photoWeek: boolean; done: boolean; next: string | null };
  food: {
    daysLogged: number; avgKcal: number | null; targetKcal: number | null;
    avgProtein: number | null; targetProtein: number | null; proteinPerKg: number | null; tdee: number | null;
  };
  /** C-READINESS (info only): 7-day averages against a 60-day baseline. */
  heart?: { restingHr7d: number | null; restingHr60d: number | null; hrv7d: number | null; hrv60d: number | null };
  energy: { rated: number; avg: number | null; prevAvg: number | null };
  /** Sessions with an ache or sharp pain, per site. */
  pain: { site: string; sessions: number; sharp: number }[];
  conditioning: {
    rideMin: number; rideTarget: number | null; boxing: boolean;
    rounds: number | null; roundsTarget: number | null; roundsNext: number | null;
    /** E22: this week's "gassed" rating (1–5) and fade round from the boxing row. */
    gassed?: number | null; fadeRound?: number | null;
  };
}

export type Verdict = "on_track" | "watch" | "adjust" | "too_early";

export interface WeeklyReport {
  weekNo: number;
  weekType: WeekType;
  /** "Week 3" or, while the week runs, "Week 3 so far". */
  label: string;
  /** Monday and Sunday of the plan week. */
  from: string;
  to: string;
  /** True from the week's Sunday on (the plan's checks run on Sunday). */
  complete: boolean;
  verdict: Verdict;
  /** One sentence. */
  headline: string;
  /**
   * The top 3 "act" signals, then signals that carry an action without being "act" (e.g. checkpoint 1 met →
   * extra sets), then the "watch" signals; each group in priority order.
   */
  actions: Signal[];
  /** All signals, grouped by area (AREAS order), priority order within an area. */
  signals: Signal[];
  numbers: WeekNumbers;
  /** Static guidance shown in detail views only (joint red flags, caffeine timing). */
  staticInfo: Signal[];
}

export interface PainPrompt {
  kind: "pain_next_morning";
  painCheckId: string;
  site: string;
  /** The 0–10 scale; answerPainCheck(local, painCheckId, score) writes morning_score (and next_morning). */
  options: readonly number[];
  /** The site's usual morning level (median of the last 14 days, or 0): a score ≥ baseline + 2 suggests a swap. */
  baseline: number;
}

/** Today page, at most 3, in priority order. */
export interface DailyCue {
  id: string;
  tone: "warm" | "plain" | "good";
  text: string;
  /** In-app route to open, e.g. "/checkin", "/weight". */
  to?: string;
  /** One-tap action (applyCoachAction with signalId). */
  action?: CoachAction;
  /** The signal the action comes from. */
  signalId?: string;
  /** The morning pain question (joints.prompt). */
  prompt?: PainPrompt;
  /** E21: offer "Start the minimum session" (prescribeMinimum + startWorkout(..., { minimum: true })). */
  startMinimum?: boolean;
  /** An inline input the cue carries: progress photos done (savePhotosDone), the monthly elbow check (saveElbowMonthly). */
  input?: "photos" | "elbow_monthly";
}
