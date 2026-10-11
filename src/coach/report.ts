// Entry points: weeklyReport (Check-in page, check-in script) and dailyCues (Today page). §3, §5.

import { addDays, fmtShortDate } from "../lib/format";
import type { Adjustment, CoachAction } from "../plan/adjustments";
import { isoWeekday, weekForDate } from "../plan/engine";
import { bodyRules, photosCue, waistDueCue } from "./body";
import { lcFirst as lc, weekContext, type AreaResult, type WeekCtx } from "./common";
import { conditioningRules } from "./conditioning";
import { consistencyRules, floorCue, habitCues } from "./consistency";
import type { CoachData } from "./data";
import { fuelRules, proteinCue, sessionFuelCue } from "./fuel";
import { JOINT_RED_FLAGS, elbowMonthlyCue, jointsRules, painPromptCue } from "./joints";
import { muscleRules } from "./muscle";
import { ALCOHOL_NOTE, CAFFEINE_NOTE, lightsOutCue, recoveryRules } from "./recovery";
import { strengthRules } from "./strength";
import { AREAS, type DailyCue, type Signal, type Verdict, type WeekNumbers, type WeeklyReport } from "./types";

/** Rule ids in priority order (most important first). A signal id matches its rule id or "rule.subject". */
export const PRIORITY: readonly string[] = [
  "joints.swap", "joints.cut_sets", "consistency.long_break", "consistency.missed_week", "strength.checkpoint", "strength.misses",
  "joints.trend", "body.rate", "fuel.kcal", "body.waist", "fuel.protein", "recovery.sleep", "consistency.sessions",
  "consistency.missed_twice", "muscle.volume", "muscle.overreach",
  "strength.tm", "strength.repout", "strength.checkpoint_ahead", "strength.step_pace", "strength.step",
  "joints.sharp", "fuel.logging", "body.weighins", "body.path", "body.photos", "fuel.tdee", "recovery.sleep_lifting",
  "recovery.energy", "consistency.comeback", "consistency.habit", "joints.alternative", "conditioning.gassed",
  "muscle.progress", "muscle.effort", "muscle.by_muscle", "muscle.variety", "strength.calibration", "consistency.streak",
  "conditioning.week", "recovery.resting_hr", "recovery.hrv"
];

export function priorityOf(id: string): number {
  const i = PRIORITY.findIndex((p) => id === p || id.startsWith(`${p}.`));
  return i < 0 ? PRIORITY.length : i;
}

const byPriority = (a: Signal, b: Signal) => priorityOf(a.id) - priorityOf(b.id);

/** The current plan week of `today` (null before the plan or after it). */
export function currentWeekNo(data: CoachData, today: string): number | null {
  return weekForDate(data.plan, today)?.weekNo ?? null;
}

/** The last plan week that is complete on `today` (Sunday counts), or null. */
export function lastCompleteWeekNo(data: CoachData, today: string): number | null {
  const done = data.plan.weeks.filter((w) => addDays(w.startDate, 6) <= today);
  return done.at(-1)?.weekNo ?? null;
}

/** The applied adjustment that matches a suggested action, if any. */
export function findApplied(action: CoachAction, adjustments: readonly Adjustment[], ctx: { asOf: string; lastSession: string | null }): Adjustment | undefined {
  return adjustments.find((a) => {
    const d = a.data;
    switch (action.kind) {
      case "kcal": return d.kind === "kcal" && d.from === action.from && d.delta === action.delta;
      case "deload_now": return d.kind === "deload_now" && d.weekNo === action.weekNo;
      case "repeat_week": return d.kind === "repeat_week" && d.missedWeekNo === action.missedWeekNo;
      case "skip_deload": return d.kind === "skip_deload" && d.weekNo === action.weekNo;
      case "tm_reduce": return d.kind === "tm_reduce" && ctx.lastSession != null && a.created.slice(0, 10) >= ctx.lastSession;
      case "recalibrate": return d.kind === "recalibrate" && ctx.lastSession != null && a.created.slice(0, 10) >= ctx.lastSession;
      case "extra_sets": return d.kind === "extra_sets" && d.fromWeek === action.fromWeek
        && [...d.muscles].sort().join() === [...action.muscles].sort().join();
      case "main_lift_set": return d.kind === "main_lift_set" && d.fromWeek === action.fromWeek;
      case "swap": return d.kind === "swap" && d.exerciseKey === action.exerciseKey && d.to === action.to && d.until >= ctx.asOf;
      case "cut_sets": return d.kind === "cut_sets" && d.exerciseKey === action.exerciseKey && d.until >= ctx.asOf;
    }
  });
}

/** Applied actions turn their signal into info ("Applied {date}."); a later duplicate of the same action loses it. */
function settleActions(signals: Signal[], data: CoachData, ctx: WeekCtx): Signal[] {
  const lastSession = data.planSessions.filter((s) => s.date <= ctx.asOf).at(-1)?.date ?? null;
  const seen = new Set<string>();
  return [...signals].sort(byPriority).map((s) => {
    if (!s.action) return s;
    const applied = findApplied(s.action, data.adjustments, { asOf: ctx.asOf, lastSession });
    if (applied) {
      const { action: _a, ...rest } = s;
      return { ...rest, status: "info" as const, message: `${s.message} Applied ${fmtShortDate(applied.created.slice(0, 10))}.`, applied: { adjustmentId: applied.id, created: applied.created } };
    }
    const key = JSON.stringify(s.action);
    if (seen.has(key)) {
      const { action: _a, ...rest } = s;
      return rest;
    }
    seen.add(key);
    return s;
  });
}

const emptyNumbers = (): WeekNumbers => ({
  sessions: { done: 0, planned: 0 },
  workingSets: { done: 0, planned: 0 },
  trainingMax: {},
  repOuts: [],
  stepLoads: {},
  muscles: [],
  bodyweight: { avg7d: null, band: null, weighIns: 0, rate: null, rateSe: null, rateN: 0 },
  waist: { latestCm: null, cmPerMonth: null },
  food: { daysLogged: 0, avgKcal: null, targetKcal: null, avgProtein: null, targetProtein: null, proteinPerKg: null, tdee: null },
  sleep: { nights: 0, avgHours: null },
  energy: { rated: 0, avg: null, prevAvg: null },
  pain: [],
  conditioning: { rideMin: 0, rideTarget: null, boxing: false, rounds: null, roundsTarget: null, roundsNext: null }
});

/** Distinct days Monday … asOf with anything logged (session, weigh-in, food, conditioning, pain, sleep). */
function daysWithData(ctx: WeekCtx): number {
  const { data } = ctx;
  const inWeek = (d: string) => d >= ctx.from && d <= ctx.asOf;
  const dates = new Set<string>();
  for (const s of ctx.sessions) dates.add(s.date);
  for (const m of data.measurements) if (inWeek(m.date)) dates.add(m.date);
  for (const e of data.foodEntries) if (inWeek(e.date)) dates.add(e.date);
  for (const d of data.nutritionDays) if (inWeek(d.date) && (d.kcal ?? 0) > 0) dates.add(d.date);
  for (const c of data.conditioning) if (inWeek(c.date)) dates.add(c.date);
  for (const p of data.pain) if (inWeek(p.date)) dates.add(p.date);
  for (const h of data.health) if (inWeek(h.date)) dates.add(h.date);
  return dates.size;
}


export function verdictOf(weekNo: number, daysOfData: number, signals: readonly Signal[]): Verdict {
  if (weekNo === 0 || daysOfData < 3) return "too_early";
  if (signals.some((s) => s.status === "act")) return "adjust";
  if (signals.filter((s) => s.status === "watch").length >= 2) return "watch";
  return "on_track";
}

/**
 * The one-sentence headline. With `sessions` (E21, P-HABITS) it leads with them: "4 of 4 sessions. Week 3 is on
 * plan. Keep going." ("2 of 4 sessions so far. …" while the week runs).
 */
export function headlineOf(verdict: Verdict, weekNo: number, actions: readonly Signal[], signals: readonly Signal[],
  sessions?: { done: number; planned: number; complete: boolean }): string {
  const lead = sessions && sessions.planned > 0
    ? `${sessions.done} of ${sessions.planned} sessions${sessions.complete ? "" : " so far"}. ` : "";
  return lead + headlineText(verdict, weekNo, actions, signals);
}

function headlineText(verdict: Verdict, weekNo: number, actions: readonly Signal[], signals: readonly Signal[]): string {
  switch (verdict) {
    case "too_early": return `Week ${weekNo}: too early to judge. Log everything.`;
    case "on_track": return `Week ${weekNo} is on plan. Keep going.`;
    case "watch": {
      const first = actions.find((s) => s.status === "watch") ?? signals.find((s) => s.status === "watch");
      return `Mostly on plan. Keep an eye on ${lc(first?.title ?? "the details")}.`;
    }
    case "adjust": {
      const acts = signals.filter((s) => s.status === "act");
      const first = actions.find((s) => s.status === "act") ?? acts[0];
      return `${acts.length} change${acts.length === 1 ? "" : "s"} to make this week: ${lc(first?.title ?? "see below")}.`;
    }
  }
}

/**
 * The report for plan week `weekNo` as of `today`. While the week runs it is labelled "so far" and the
 * rules that need the full week return "pending". Throws for a week the adjusted plan does not have.
 */
export function weeklyReport(data: CoachData, weekNo: number, today: string): WeeklyReport {
  const ctx = weekContext(data, weekNo, today);
  const parts: AreaResult[] = [
    consistencyRules(ctx), strengthRules(ctx), muscleRules(ctx), bodyRules(ctx),
    fuelRules(ctx), jointsRules(ctx), recoveryRules(ctx), conditioningRules(ctx)
  ];
  const settled = settleActions(parts.flatMap((p) => p.signals), data, ctx);
  const signals = [...settled].sort((a, b) => AREAS.indexOf(a.area) - AREAS.indexOf(b.area) || byPriority(a, b));
  const ranked = [...settled].sort(byPriority);
  const actions = [
    ...ranked.filter((s) => s.status === "act").slice(0, 3),
    ...ranked.filter((s) => s.status !== "act" && s.status !== "watch" && s.action),
    ...ranked.filter((s) => s.status === "watch")
  ];
  const numbers = Object.assign(emptyNumbers(), ...parts.map((p) => p.numbers)) as WeekNumbers;
  const verdict = verdictOf(weekNo, daysWithData(ctx), settled);
  return {
    weekNo, weekType: ctx.week.type, label: ctx.complete ? `Week ${weekNo}` : `Week ${weekNo} so far`,
    from: ctx.from, to: ctx.to, complete: ctx.complete,
    verdict, headline: headlineOf(verdict, weekNo, actions, settled, { ...numbers.sessions, complete: ctx.complete }), actions, signals, numbers,
    staticInfo: [JOINT_RED_FLAGS, CAFFEINE_NOTE, ALCOHOL_NOTE]
  };
}

/** The first unapplied "act" signal with an action, this week or last. */
function pendingAction(data: CoachData, weekNo: number, today: string): Signal | null {
  for (const n of [weekNo, weekNo - 1]) {
    if (!data.plan.weeks.some((w) => w.weekNo === n)) continue;
    const hit = weeklyReport(data, n, today).actions.find((s) => s.status === "act" && s.action);
    if (hit) return hit;
  }
  return null;
}

/**
 * Today's cues, at most 3, in priority order (§5, E19–E21):
 * 1. joints.prompt (before 12:00, 0–10) · 2. the if-then cues (habitCues: missed yesterday, Thursday floor,
 * minimum session, first exercise after 17:00, Sunday planning) · 3. a pending coach action ·
 * 4. consistency.floor (Fri–Sun, nothing done) · 5. weigh-in reminder before 11:00 · 6. progress photos (photo weeks,
 * from Thursday) · 7. caffeine / candy (lifting days from 15:00) · 8. protein after 18:00 · 9. the monthly elbow
 * check · 10. waist check due (only while he logs it) · 11. lights out before a lifting day (from 21:00) ·
 * 12. Sunday check-in.
 */
export function dailyCues(data: CoachData, today: string, nowHour: number): DailyCue[] {
  const cues: (DailyCue | null)[] = [];
  const week = weekForDate(data.plan, today);
  cues.push(painPromptCue(data, today, nowHour));
  cues.push(...habitCues(data, today, nowHour));
  if (week && data.program) {
    const s = pendingAction(data, week.weekNo, today);
    if (s?.action) cues.push({ id: `action.${s.id}`, tone: "warm", text: s.message, action: s.action, signalId: s.id, to: "/checkin" });
  }
  cues.push(floorCue(data, today));
  if (nowHour < 11 && !data.allMeasurements.some((m) => m.kind === "weight" && m.date === today)) {
    cues.push({ id: "body.weigh_in", tone: "plain", text: "Weigh in after the first pee.", to: "/weight" });
  }
  cues.push(photosCue(data, today));
  cues.push(sessionFuelCue(data, today, nowHour));
  cues.push(proteinCue(data, today, nowHour));
  cues.push(elbowMonthlyCue(data, today, nowHour));
  cues.push(waistDueCue(data, today));
  cues.push(lightsOutCue(data, today, nowHour));
  if (week && data.program && isoWeekday(today) === 7) {
    cues.push({ id: "checkin.ready", tone: "good", text: `Week ${week.weekNo} check-in is ready.`, to: "/checkin" });
  }
  return cues.filter((c): c is DailyCue => c != null).slice(0, 3);
}
