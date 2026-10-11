// React glue for the coach (the rules themselves stay React-free). Import from here in pages;
// scripts import from ./index.

import { useMemo } from "react";
import { useRows } from "../data/context";
import { todayIso } from "../lib/format";
import { coachData, type CoachData } from "./data";
import { currentWeekNo, dailyCues, weeklyReport } from "./report";
import type { DailyCue, WeeklyReport } from "./types";

/** The coach's input from the live store; recomputed when any of its tables changes. */
export function useCoachData(): CoachData {
  const programs = useRows("programs");
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const exercises = useRows("exercises");
  const training_maxes = useRows("training_maxes");
  const body_measurements = useRows("body_measurements");
  const food_entries = useRows("food_entries");
  const nutrition_days = useRows("nutrition_days");
  const nutrition_targets = useRows("nutrition_targets");
  const pain_checks = useRows("pain_checks");
  const conditioning = useRows("conditioning");
  const health_daily = useRows("health_daily");
  const profiles = useRows("profiles");
  const today = todayIso();
  return useMemo(() => coachData({
    programs, sessions, sets, exercises, training_maxes, body_measurements, food_entries, nutrition_days,
    nutrition_targets, pain_checks, conditioning, health_daily, profiles
  }, { today }), [programs, sessions, sets, exercises, training_maxes, body_measurements, food_entries, nutrition_days,
    nutrition_targets, pain_checks, conditioning, health_daily, profiles, today]);
}

/** The report for `weekNo` (default: the current plan week); null outside the plan. */
export function useWeeklyReport(weekNo?: number, today = todayIso()): WeeklyReport | null {
  const data = useCoachData();
  return useMemo(() => {
    const n = weekNo ?? currentWeekNo(data, today);
    if (n == null || !data.plan.weeks.some((w) => w.weekNo === n)) return null;
    return weeklyReport(data, n, today);
  }, [data, weekNo, today]);
}

/** Today's cues (at most 3). `nowHour` defaults to the current local hour. */
export function useDailyCues(today = todayIso(), nowHour = new Date().getHours()): DailyCue[] {
  const data = useCoachData();
  return useMemo(() => dailyCues(data, today, nowHour), [data, today, nowHour]);
}
