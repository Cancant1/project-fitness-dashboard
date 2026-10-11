// The coach's public API (React-free; pages use ./hooks for live data). See docs/COACH.md.

export { coachData, type CoachData, type CoachTables } from "./data";
export {
  weeklyReport, dailyCues, currentWeekNo, lastCompleteWeekNo, verdictOf, headlineOf, findApplied, priorityOf, PRIORITY
} from "./report";
export {
  applyCoachAction, removeAdjustment, answerPainCheck, saveSessionEnergy, saveWaist, saveSleep, type ApplyResult
} from "./apply";
export { applyAdjustments, adjustmentState, adjustmentsOf, swapNote } from "../plan/adjustments";
export { nextSwap, swapLabel, SWAP_CHAINS } from "../plan/swaps";
export { REFERENCE, muscleKey, type MuscleReference } from "./reference";
export { EVIDENCE, type EvidenceId } from "./evidence";
export { expectedBand, BODYWEIGHT_PATH, rateFit, isRateWeek, waistTrend } from "./body";
export { planLine, goalTm, stepsTo } from "./strength";
export { laggingMuscles, muscleSets } from "./muscle";
export { targetOn, measuredTdee, PLAN_MAINTENANCE, PROTEIN_FLOOR_G_PER_KG } from "./fuel";
export { JOINT_RED_FLAGS } from "./joints";
export { CAFFEINE_NOTE } from "./recovery";
export { LONGEST_STREAK_SINCE_2023 } from "./consistency";
export { weekContext, type WeekCtx } from "./common";
export * from "./types";
