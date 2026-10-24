// The coach's public API (React-free; pages use ./hooks for live data). See docs/COACH.md.

export { coachData, type CoachData, type CoachTables } from "./data";
export {
  weeklyReport, dailyCues, currentWeekNo, lastCompleteWeekNo, verdictOf, headlineOf, findApplied, priorityOf, PRIORITY
} from "./report";
export {
  applyCoachAction, removeAdjustment, ensurePlanProteinPerKg, answerPainCheck, savePainCheck, saveElbowMonthly, saveGassed,
  savePhotosDone, saveHomeTask, saveSessionEnergy, saveWaist, type ApplyResult
} from "./apply";
export { applyAdjustments, adjustmentState, adjustmentsOf, swapNote } from "../plan/adjustments";
export { nextSwap, swapLabel, swapStartLoad, SWAP_CHAINS, type SwapStartLoad, type SwapHistory } from "../plan/swaps";
export { REFERENCE, muscleKey, type MuscleReference } from "./reference";
export { EVIDENCE, type EvidenceId } from "./evidence";
export {
  expectedBand, pathAnchor, creatineOffset, BODYWEIGHT_PATH, bodyweightStatus, PACE_DAYS, type BodyweightStatus, type BodyweightSide, rateFit, isRateWeek, waistTrend, photoStatus, photosCue, isPhotosRow, WAIST_MIN_READINGS
} from "./body";
export { planLine, goalTm, stepsTo, earlyDeloadRun } from "./strength";
export { laggingMuscles, muscleSets, OVERREACH_FACTOR } from "./muscle";
export { targetOn, measuredTdee, sessionFuelCue, PLAN_MAINTENANCE, PROTEIN_FLOOR_G_PER_KG, TDEE_MIN_DAYS, TDEE_FROM_WEEK } from "./fuel";
export { HOME_TASK_IDS, isFreeDayNote } from "./conditioning";
export { JOINT_RED_FLAGS, RED_FLAG_REMINDER, HAMMER_CURL_AFTER_DAYS, painPromptCue, elbowMonthlyCue } from "./joints";
export { CAFFEINE_NOTE, ALCOHOL_NOTE, heartNumbers, lightsOutCue } from "./recovery";
export {
  LONGEST_STREAK_SINCE_2023, HABIT_WEEKS, HABIT_SESSIONS, FLOOR_SESSIONS, SKIPPABLE_DELOAD_WEEK, habitCues, floorCue, plannedDays,
  liftingDayKeys, isMinimumSession, type PlannedDay
} from "./consistency";
export {
  weekContext, SLEEP_TARGET_BEFORE_LIFTING_H, LIGHTS_OUT_BEFORE_LIFTING, type WeekCtx
} from "./common";
export * from "./types";
