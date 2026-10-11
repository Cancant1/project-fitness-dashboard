import type { SetRow } from "../data/types";

// Sets that must not feed PRs or progress figures (CLAUDE.md + the doubtful_* flags in data/).
const EXCLUDE = ["load_outlier_check", "load_missing", "interpreted", "multi_load", "session_marked_discarded"];

export function isFlagged(s: Pick<SetRow, "flags">): boolean {
  return s.flags.some((f) => EXCLUDE.includes(f) || f.startsWith("doubtful"));
}

/** Epley estimated 1RM, only for 1–12 reps. */
export function e1rm(loadKg: number | null, reps: number | null): number | null {
  if (loadKg == null || reps == null || reps < 1 || reps > 12 || loadKg <= 0) return null;
  return reps === 1 ? loadKg : loadKg * (1 + reps / 30);
}

/** Sets that count for strength figures: completed, not warm-up, not flagged. */
export function countsForStrength(s: SetRow): boolean {
  return s.completed && s.kind !== "warmup" && !isFlagged(s) && s.load_kg != null && s.reps != null;
}
