// §4.1 Consistency: sessions per week, the floor, missed weeks, long breaks, streaks.

import { daysBetween } from "../lib/format";
import { isoWeekday, weekForDate } from "../plan/engine";
import type { ProgramWeek } from "../plan/types";
import { sessionsIn, sig, tmAt, weekBounds, type AreaResult, type WeekCtx } from "./common";
import type { CoachData } from "./data";
import type { DailyCue, Signal } from "./types";

/** Longest run of weeks with 3+ sessions since 2023 (the plan's data findings). */
export const LONGEST_STREAK_SINCE_2023 = 14;

export function consistencyRules(ctx: WeekCtx): AreaResult {
  const { data, week } = ctx;
  const out: Signal[] = [];
  const planned = ctx.days.filter((d) => d.kind === "lifting").length;
  const done = ctx.sessions.length;

  if (planned > 0) {
    const metric = { label: "Sessions", value: String(done), target: String(planned) };
    const why: Signal["why"] = ["P-ADHERENCE", "P-STRUCT"];
    if (done >= planned) {
      out.push(sig("consistency.sessions", "consistency", "good", "All sessions done", `${done} of ${planned} sessions.`, why, { metric }));
    } else if (!ctx.complete) {
      out.push(sig("consistency.sessions", "consistency", "pending", "Sessions so far", `${done} of ${planned} so far.`, why, { metric }));
    } else if (done === planned - 1) {
      out.push(sig("consistency.sessions", "consistency", "watch", "One session missed",
        `${done} of ${planned} sessions. One missed day is fine; two in a row is a trend.`, why, { metric }));
    } else {
      // Deload weeks are light (week 10 is the England trip: "No gym: rest and walk a lot"), so a short one is a watch.
      out.push(sig("consistency.sessions", "consistency", week.type === "deload" ? "watch" : "act", "Sessions missed",
        `${done} of ${planned} sessions. Bad week? The floor is Lower A + Upper A.`, why, { metric }));
    }
  }

  if (data.program) {
    const missed = missedWeek(ctx);
    if (missed) {
      out.push(sig("consistency.missed_week", "consistency", "act", `Week ${missed.weekNo} missed`,
        `Week ${missed.weekNo} was missed. Repeat it instead of skipping ahead; everything after moves a week.`,
        ["P-WEEKTYPES", "P-ADHERENCE"], { action: { kind: "repeat_week", missedWeekNo: missed.weekNo } }));
    }

    const last = data.planSessions.filter((s) => s.date <= ctx.asOf).at(-1);
    const hasTm = tmAt(data, "squat", ctx.asOf) != null || tmAt(data, "deadlift", ctx.asOf) != null;
    if (last && hasTm && ctx.asOf <= data.end) {
      const d = daysBetween(last.date, ctx.asOf);
      if (d >= 14) {
        out.push(sig("consistency.long_break", "consistency", "act", "Lower TMs after the break",
          `${d} days off. Lower both training maxes by 5% before the next session.`,
          ["P-PROG-TM", "P-ADHERENCE", "M-REGAIN"], { action: { kind: "tm_reduce", percent: 5 } }));
      }
    }
  }

  const n = streak(ctx);
  if (n >= 2) {
    out.push(sig("consistency.streak", "consistency", "info", `${n} weeks in a row`,
      `${n} weeks in a row with 3+ sessions. Your longest since 2023 was ${LONGEST_STREAK_SINCE_2023}.`, ["P-ADHERENCE"],
      { metric: { label: "Weeks with 3+ sessions", value: String(n), target: String(LONGEST_STREAK_SINCE_2023) } }));
  }

  return { signals: out, numbers: { sessions: { done, planned } } };
}

/**
 * The most recent finished week (this one once complete, else the one before) when it had no plan session,
 * is not a deload (light anyway; week 10 allows rest) and has not been handled (marked missed by a repeat).
 */
function missedWeek(ctx: WeekCtx): ProgramWeek | null {
  const weeks = ctx.data.plan.weeks;
  const candidate = ctx.complete ? ctx.week : weeks.find((w) => w.weekNo === ctx.weekNo - 1);
  if (!candidate || candidate.missed || candidate.type === "deload") return null;
  const { from, to } = weekBounds(candidate);
  return sessionsIn(ctx.data, from, to).length === 0 ? candidate : null;
}

/** Complete weeks with 3+ plan sessions in a row, ending with the last complete week. */
function streak(ctx: WeekCtx): number {
  const weeks = ctx.data.plan.weeks.filter((w) => w.weekNo < ctx.weekNo || (w.weekNo === ctx.weekNo && ctx.complete));
  let n = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const { from, to } = weekBounds(weeks[i]!);
    if (sessionsIn(ctx.data, from, to).length >= 3) n++;
    else break;
  }
  return n;
}

/** consistency.floor: from Thursday, no lifting session yet this plan week (not in deload weeks). */
export function floorCue(data: CoachData, today: string): DailyCue | null {
  if (!data.program) return null;
  const week = weekForDate(data.plan, today);
  if (!week || week.type === "deload" || isoWeekday(today) < 4) return null;
  if (sessionsIn(data, week.startDate, today).length > 0) return null;
  return {
    id: "consistency.floor", tone: "warm", to: "/train",
    text: "No lifting yet this week. Do Lower A today or tomorrow, then Upper A. That's the floor."
  };
}
