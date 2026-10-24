// §4.1 Consistency and P-HABITS (E21): sessions per week (floor 2, minimum sessions count), missed weeks
// (move on, R1-01), long breaks (TM −5% / recalibrate), missed twice in a row, comebacks, the habit meter and
// streaks; the floor cue and the if-then cues for Today.

import { daysBetween } from "../lib/format";
import { addDays, isoWeekday, weekForDate } from "../plan/engine";
import type { DayKey, ProgramDefinition, ProgramWeek } from "../plan/types";
import { sessionsIn, sig, tmAt, weekBounds, type AreaResult, type WeekCtx } from "./common";
import type { CoachData } from "./data";
import type { DailyCue, Signal } from "./types";

/** Longest run of weeks with 3+ sessions since 2023 (the plan's data findings). */
export const LONGEST_STREAK_SINCE_2023 = 14;
/** P-HABITS: about 6 weeks at ≥ 4 sessions a week makes a gym habit (R-KAUSHAL-2015). */
export const HABIT_WEEKS = 6;
export const HABIT_SESSIONS = 4;
/** P-ADHERENCE (R1-02): the floor in a bad week; minimum sessions count. */
export const FLOOR_SESSIONS = 2;
/** R1-01: a missed week 5 or 6 replaces this deload (weeks 10, 18 and 19 stay fixed). */
export const SKIPPABLE_DELOAD_WEEK = 7;

export const isMinimumSession = (s: { legacy_ref: Record<string, unknown> }): boolean =>
  (s.legacy_ref as { plan?: { minimum?: boolean } } | undefined)?.plan?.minimum === true;

/** Lifting days of a plan week (the test week has no Upper B: no main lift, no accessories). */
export function liftingDayKeys(plan: ProgramDefinition, week: ProgramWeek): DayKey[] {
  const rule = plan.weekTypeRules[week.type];
  return plan.days.filter((d) => d.kind === "lifting" && (rule.includeAccessories || d.slots.some((s) => s.role === "main"))).map((d) => d.key);
}

export interface PlannedDay { date: string; dayKey: DayKey; week: ProgramWeek; done: boolean }

/**
 * Planned lifting dates of the adjusted plan dated ≤ `to` (deload weeks left out: they are light, and week 10 allows
 * rest). A day is done when a completed plan session is dated that day.
 */
export function plannedDays(data: CoachData, to: string): PlannedDay[] {
  const done = new Set(data.planSessions.map((s) => s.date));
  const out: PlannedDay[] = [];
  for (const week of data.plan.weeks) {
    if (week.type === "deload" || week.startDate > to) continue;
    for (const key of liftingDayKeys(data.plan, week)) {
      const day = data.plan.days.find((d) => d.key === key)!;
      const date = addDays(week.startDate, day.weekday - 1);
      if (date <= to) out.push({ date, dayKey: key, week, done: done.has(date) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** R2-12 (DECISIONS 2026-10-24): after week 4, the planned session lengths come from his logged times (weeks 2–4). */
export const SESSION_LENGTH_WEEKS = [2, 4] as const;

/** Median logged minutes per lifting day over the session-length weeks, once the last of them is complete. */
function sessionLengthSignal(ctx: WeekCtx): Signal | null {
  const { data, weekNo } = ctx;
  if (weekNo !== SESSION_LENGTH_WEEKS[1] || !ctx.complete) return null;
  const [w0, w1] = SESSION_LENGTH_WEEKS;
  const from = data.plan.weeks.find((w) => w.weekNo === w0)?.startDate;
  if (!from) return null;
  const byDay = new Map<string, number[]>();
  for (const s of data.planSessions) {
    if (s.date < from || s.date > ctx.to || s.duration_min == null) continue;
    const key = (s.legacy_ref as { plan?: { dayKey?: string } } | null)?.plan?.dayKey;
    if (!key) continue;
    byDay.set(key, [...(byDay.get(key) ?? []), Number(s.duration_min)]);
  }
  const parts = data.plan.days.filter((d) => d.kind === "lifting" && byDay.has(d.key)).map((d) => {
    const xs = [...byDay.get(d.key)!].sort((a, b) => a - b);
    const mid = Math.floor(xs.length / 2);
    const med = xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
    return `${d.title} ${Math.round(med / 5) * 5} (plan ${d.minutes ?? "–"})`;
  });
  if (!parts.length) return null;
  return sig("consistency.session_length", "consistency", "info", "Session lengths from your log",
    `Logged minutes, weeks ${w0}–${w1}: ${parts.join(" · ")}. These become the planned times at this check-in.`, ["P-TIMESAVE"]);
}

export function consistencyRules(ctx: WeekCtx): AreaResult {
  const { data, week } = ctx;
  const out: Signal[] = [];
  const planned = ctx.days.filter((d) => d.kind === "lifting").length;
  const done = ctx.sessions.length;
  const minimum = ctx.sessions.filter(isMinimumSession).length;

  if (planned > 0) {
    const metric = { label: "Sessions", value: String(done), target: String(planned) };
    const why: Signal["why"] = ["P-ADHERENCE", "P-HABITS", "P-STRUCT"];
    if (done >= planned) {
      out.push(sig("consistency.sessions", "consistency", "good", "All sessions done", `${done} of ${planned} sessions.`, why, { metric }));
    } else if (!ctx.complete) {
      out.push(sig("consistency.sessions", "consistency", "pending", "Sessions so far", `${done} of ${planned} so far.`, why, { metric }));
    } else if (done === planned - 1) {
      out.push(sig("consistency.sessions", "consistency", "watch", "One session missed",
        `${done} of ${planned} sessions. One missed day is fine; two in a row is a trend.`, why, { metric }));
    } else if (done >= FLOOR_SESSIONS) {
      out.push(sig("consistency.sessions", "consistency", "watch", "The floor held",
        `${done} of ${planned} sessions: the floor held. Aim for ${planned} next week.`, [...why, "P-MINIMUM"], { metric }));
    } else {
      // Deload weeks are light, so a short one is a watch (week 10, England, is a rest week with nothing planned).
      out.push(sig("consistency.sessions", "consistency", week.type === "deload" ? "watch" : "act", "Under the floor",
        `${done} of ${planned} sessions. Bad week? The floor is Lower A + Upper A; minimum sessions count.`, [...why, "P-MINIMUM"], { metric }));
    }
  }

  let missedTwice = 0;
  let comebacks = 0;
  if (data.program) {
    // consistency.missed_week (R1-01): move on, never repeat.
    const missed = missedWeek(ctx);
    if (missed) {
      const w = missed.weekNo;
      const deload = data.plan.weeks.find((x) => x.weekNo === SKIPPABLE_DELOAD_WEEK);
      const skip = (w === SKIPPABLE_DELOAD_WEEK - 2 || w === SKIPPABLE_DELOAD_WEEK - 1) && deload && (deload.type === "deload" || deload.deloadSkipped);
      const text = `Week ${w} was missed. No catch-up: carry on with week ${w + 1} as planned. Missed weeks count as an unplanned deload.`;
      out.push(skip
        ? sig("consistency.missed_week", "consistency", "act", `Train through week ${SKIPPABLE_DELOAD_WEEK}`,
          `${text} Train through week ${SKIPPABLE_DELOAD_WEEK} instead of deloading.`, ["P-ADHERENCE", "P-DELOAD"],
          { action: { kind: "skip_deload", weekNo: SKIPPABLE_DELOAD_WEEK } })
        : sig("consistency.missed_week", "consistency", "watch", `Week ${w} missed`, text, ["P-ADHERENCE", "P-DELOAD"]));
    }

    // consistency.long_break: 14–27 days → TM −5%; ≥ 28 days → recalibrate at 75% of the last TM.
    const last = data.planSessions.filter((s) => s.date <= ctx.asOf).at(-1);
    const hasTm = tmAt(data, "squat", ctx.asOf) != null || tmAt(data, "deadlift", ctx.asOf) != null;
    if (last && hasTm && ctx.asOf <= data.end) {
      const d = daysBetween(last.date, ctx.asOf);
      if (d >= 28) {
        out.push(sig("consistency.long_break", "consistency", "act", "Recalibrate after the break",
          `${d} days off. Re-run calibration: rep-out at 75% of your last TM.`, ["P-ADHERENCE", "P-RESTART", "P-CALIB"],
          { action: { kind: "recalibrate" } }));
      } else if (d >= 14) {
        out.push(sig("consistency.long_break", "consistency", "act", "Lower TMs after the break",
          `${d} days off. Lower both training maxes by 5% before the next session.`,
          ["P-PROG-TM", "P-ADHERENCE", "P-RESTART", "M-REGAIN"], { action: { kind: "tm_reduce", percent: 5 } }));
      }
    }

    // consistency.missed_twice and consistency.comeback (P-HABITS), from the planned lifting dates.
    const cutoff = ctx.asOf < ctx.today ? ctx.asOf : addDays(ctx.today, -1);
    const days = plannedDays(data, cutoff).filter((p) => p.date >= data.start);
    const inWeek = (d: string) => d >= ctx.from && d <= ctx.asOf;
    for (let i = 1; i < days.length; i++) {
      if (inWeek(days[i]!.date) && !days[i]!.done && !days[i - 1]!.done) missedTwice++;
    }
    for (const m of days.filter((p) => inWeek(p.date) && !p.done)) {
      if (data.planSessions.some((s) => s.date > m.date && daysBetween(m.date, s.date) <= 2)) comebacks++;
    }
    const wholeWeekMissed = ctx.complete && done === 0;
    if (missedTwice > 0 && !wholeWeekMissed) {
      out.push(sig("consistency.missed_twice", "consistency", "watch", "Missed twice in a row",
        "Missed twice in a row. Next session: just the minimum session if that's all you've got.", ["P-HABITS", "P-MINIMUM"],
        { metric: { label: "Missed twice in a row", value: String(missedTwice), target: "0" } }));
    }
    if (comebacks > 0) {
      out.push(sig("consistency.comeback", "consistency", "good", "Comeback within 48 h",
        "Comeback within 48 h. That's the habit.", ["P-HABITS"]));
    }

    // consistency.habit: complete weeks in a row with 4+ sessions (meter n/6).
    const n = habitWeeks(ctx);
    const metric = { label: "Weeks at 4+ sessions", value: String(n), target: String(HABIT_WEEKS) };
    if (n >= HABIT_WEEKS) {
      out.push(sig("consistency.habit", "consistency", "good", "Habit threshold reached",
        n === HABIT_WEEKS ? `${HABIT_WEEKS} weeks at 4+ sessions: the habit threshold.` : `${n} weeks at 4+ sessions: past the habit threshold.`,
        ["P-HABITS"], { metric }));
    } else {
      out.push(sig("consistency.habit", "consistency", "info", "Habit meter",
        `Habit meter: ${n} of ${HABIT_WEEKS} weeks at 4+ sessions in a row.`, ["P-HABITS"], { metric }));
    }
  }

  const n = streak(ctx);
  if (n >= 2) {
    out.push(sig("consistency.streak", "consistency", "info", `${n} weeks in a row`,
      `${n} weeks in a row with 3+ sessions. Your longest since 2023 was ${LONGEST_STREAK_SINCE_2023}.`, ["P-ADHERENCE"],
      { metric: { label: "Weeks with 3+ sessions", value: String(n), target: String(LONGEST_STREAK_SINCE_2023) } }));
  }

  const length = sessionLengthSignal(ctx);
  if (length) out.push(length);

  return {
    signals: out,
    numbers: {
      sessions: { done, planned, ...(minimum ? { minimum } : {}) },
      ...(data.program ? { habit: { weeks: habitWeeks(ctx), target: HABIT_WEEKS, missedTwice, comebacks } } : {})
    }
  };
}

/**
 * The most recent finished week (this one once complete, else the one before) when it had no plan session,
 * is not a deload (light anyway; week 10 allows rest) and was not handled by an old repeat_week.
 */
function missedWeek(ctx: WeekCtx): ProgramWeek | null {
  const weeks = ctx.data.plan.weeks;
  const candidate = ctx.complete ? ctx.week : weeks.find((w) => w.weekNo === ctx.weekNo - 1);
  if (!candidate || candidate.missed || candidate.type === "deload") return null;
  const { from, to } = weekBounds(candidate);
  return sessionsIn(ctx.data, from, to).length === 0 ? candidate : null;
}

/** Complete weeks in a row with ≥ `min` plan sessions (≥ the planned days in a shorter week), ending with the last complete week. */
function weeksInARow(ctx: WeekCtx, min: number): number {
  const weeks = ctx.data.plan.weeks.filter((w) => w.weekNo < ctx.weekNo || (w.weekNo === ctx.weekNo && ctx.complete));
  let n = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i]!;
    const { from, to } = weekBounds(w);
    const need = Math.min(min, liftingDayKeys(ctx.data.plan, w).length);
    if (sessionsIn(ctx.data, from, to).length >= need) n++;
    else break;
  }
  return n;
}

const streak = (ctx: WeekCtx) => weeksInARow(ctx, 3);
const habitWeeks = (ctx: WeekCtx) => weeksInARow(ctx, HABIT_SESSIONS);

/**
 * consistency.floor: from Friday, no lifting session yet this plan week (not in deload weeks). On Thursday the
 * if-then cue ("Fri = Lower A, Sat = Upper A") covers it.
 */
export function floorCue(data: CoachData, today: string): DailyCue | null {
  if (!data.program) return null;
  const week = weekForDate(data.plan, today);
  if (!week || week.type === "deload" || isoWeekday(today) < 5) return null;
  if (sessionsIn(data, week.startDate, today).length > 0) return null;
  return {
    id: "consistency.floor", tone: "warm", to: "/train",
    text: "No lifting yet this week. Do Lower A today or tomorrow, then Upper A. That's the floor."
  };
}

/** Today's planned lifting day of the adjusted plan (null on other days and in deload weeks when `trainingOnly`). */
function plannedToday(data: CoachData, date: string): { week: ProgramWeek; dayKey: DayKey } | null {
  const week = weekForDate(data.plan, date);
  if (!week) return null;
  const day = data.plan.days.find((d) => d.weekday === isoWeekday(date));
  if (!day || !liftingDayKeys(data.plan, week).includes(day.key)) return null;
  return { week, dayKey: day.key };
}

/**
 * E21 if-then cues (P-HABITS), in this order:
 * 1. a planned lifting day yesterday with no session → "Missed yesterday → …" (not in deload weeks, not once
 *    he has trained today);
 * 2. Thursday with ≤ 1 session this week → "Fri = Lower A, Sat = Upper A. That's the floor." (not in deloads);
 * 3. a lifting day not yet done, and the last 2 sessions felt ≤ 2/5 or last night was < 6 h → the minimum session;
 * 4. after 17:00 on a lifting day with no session started → "Not feeling it? …";
 * 5. Sunday → "Plan the week: which 4 days?".
 */
export function habitCues(data: CoachData, today: string, nowHour: number): DailyCue[] {
  if (!data.program || today < data.start || today > data.end) return [];
  const out: DailyCue[] = [];
  const doneOn = (d: string) => data.planSessions.some((s) => s.date === d);
  const startedToday = data.sessions.some((s) => s.date === today && (s.status === "completed" || s.status === "in_progress"));

  const yesterday = addDays(today, -1);
  const y = plannedToday(data, yesterday);
  if (y && y.week.type !== "deload" && yesterday >= data.start && !doneOn(yesterday) && !doneOn(today)) {
    out.push({ id: "habit.missed_yesterday", tone: "warm", to: "/train",
      text: "Missed yesterday → do it on your next free day (Wed or Sun). No doubling up." });
  }

  const week = weekForDate(data.plan, today);
  if (week && week.type !== "deload" && isoWeekday(today) === 4 && sessionsIn(data, week.startDate, today).length <= 1) {
    out.push({ id: "habit.floor", tone: "warm", to: "/train", text: "Fri = Lower A, Sat = Upper A. That's the floor." });
  }

  const t = plannedToday(data, today);
  if (t && !doneOn(today)) {
    const [a, b] = data.planSessions.filter((s) => s.date < today).slice(-2);
    const lowFeel = !!a && !!b && a.energy != null && b.energy != null && Number(a.energy) <= 2 && Number(b.energy) <= 2;
    if (lowFeel) {
      out.push({ id: "habit.minimum", tone: "warm", to: "/train", text: "Take the minimum session today. It counts.", startMinimum: true });
    }
    if (nowHour >= 17 && !startedToday) {
      out.push({ id: "habit.first_exercise", tone: "plain", to: "/train", text: "Not feeling it? Warm up and do the first exercise, then decide." });
    }
  }

  if (isoWeekday(today) === 7) out.push({ id: "habit.plan_week", tone: "plain", to: "/plan", text: "Plan the week: which 4 days?" });
  return out;
}
