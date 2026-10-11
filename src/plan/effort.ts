// E1: how hard each exercise and set goes ("tell me where to go max and where not"). Pure.

import type { Effort, PrescribedExercise, PrescribedSet } from './types';

/** Label templates; `{n}` is the prescribed reps. */
export const EFFORT_LABEL: Record<Effort, string> = {
  max: 'Max set: go until a stop sign; count clean reps',
  controlled: 'Stop at {n} reps, even if more are there',
  failure: 'To failure: last rep you can do with good form',
  stop_sign: 'Hard, but stop at the first stop sign',
  easy: 'Easy: technique, not effort',
  care: 'Slow, 3 s up / 3 s down, last 1–2 reps hard but clean',
};

/** Badge tone for the logger (Part U): max = warm, controlled = plain, failure = accent, care/easy = muted. */
export const EFFORT_TONE: Record<Effort, 'warm' | 'plain' | 'accent' | 'muted'> = {
  max: 'warm', controlled: 'plain', failure: 'accent', stop_sign: 'accent', easy: 'muted', care: 'muted',
};

/** Short badge text. */
export const EFFORT_SHORT: Record<Effort, string> = {
  max: 'Max', controlled: 'Controlled', failure: 'Failure', stop_sign: 'Stop sign', easy: 'Easy', care: 'Care',
};

/** The set's effort: its own, else the exercise's. */
export function setEffort(ex: Pick<PrescribedExercise, 'effort'>, set: Pick<PrescribedSet, 'effort'>): Effort {
  return set.effort ?? ex.effort;
}

/**
 * The label for an effort. `reps` fills "{n}" for controlled sets; without it the label reads
 * "Stop at the prescribed reps, …". A capped rep-out (E12) reads "Stop at {cap} even if more are there".
 */
export function effortLabel(effort: Effort, reps?: number | null, capReps?: number): string {
  if (effort === 'max' && capReps != null) return `${EFFORT_LABEL.max}. Stop at ${capReps} even if more are there`;
  if (effort === 'controlled') return reps != null ? EFFORT_LABEL.controlled.replace('{n}', String(reps)) : 'Stop at the prescribed reps, even if more are there';
  return EFFORT_LABEL[effort];
}

/**
 * The effort of a logged set: its plan ref's `effort` (stored since R1), else inferred from the set kind for
 * older rows: warm-ups and timed holds easy, rep-outs max, failure sets failure, the shoulder block easy, the
 * wrist ladder care, everything else controlled.
 */
export function loggedEffort(kind: string, ref?: { effort?: Effort; role?: string; group?: string; exerciseKey?: string } | null): Effort {
  if (ref?.effort) return ref.effort;
  if (kind === 'warmup' || kind === 'timed') return 'easy';
  if (kind === 'rep_out') return 'max';
  if (kind === 'failure') return 'failure';
  if (ref?.role === 'shoulder' || ref?.group === 'shoulder_care') return 'easy';
  if (ref?.exerciseKey === 'wrist_extension') return 'care';
  return 'controlled';
}
