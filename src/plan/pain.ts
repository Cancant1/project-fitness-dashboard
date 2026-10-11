// J-PAINRULE on a 0–10 scale (E14, R1-16). Pure helpers shared by the engine state, the coach and the logger.
// Old rows only have during_set (none/ache/sharp) and next_morning (normal/sore); they keep working.

import type { PainCheck } from '../data/types';
import { addDays } from './engine';

/** During a set: 4–5 → hold the load next time; ≥ 6 (or sharp) → stop that exercise today. */
export const PAIN_HOLD = 4;
export const PAIN_STOP = 6;
/** Next morning: this many points over the site's baseline → swap one step down (and a wrist-ladder flare-up). */
export const MORNING_RISE = 2;
/** The monthly elbow check (3 questions, scores in `note` JSON) is stored under this site. */
export const ELBOW_MONTHLY_SITE = 'elbow_monthly';

export type PainAction = 'go' | 'hold' | 'stop';

/** What the logger does with a during-set score: 0–3 go · 4–5 hold the load · ≥ 6 or sharp: stop the exercise today. */
export function painAction(score: number | null | undefined, sharp = false): PainAction {
  if (sharp || (score ?? 0) >= PAIN_STOP) return 'stop';
  if ((score ?? 0) >= PAIN_HOLD) return 'hold';
  return 'go';
}

/** The legacy column written next to the score: sharp if flagged, else ache for ≥ 1, else none. */
export function duringSetFrom(score: number | null | undefined, sharp = false): NonNullable<PainCheck['during_set']> {
  if (sharp) return 'sharp';
  return (score ?? 0) >= 1 ? 'ache' : 'none';
}

/** The during-set score, 0–10: pain_score, else from the old column (sharp → 6, ache → 2, none → 0). */
export function duringScore(p: Pick<PainCheck, 'during_set'> & { pain_score?: number | null }): number | null {
  if (p.pain_score != null) return Number(p.pain_score);
  if (p.during_set === 'sharp') return PAIN_STOP;
  if (p.during_set === 'ache') return 2;
  if (p.during_set === 'none') return 0;
  return null;
}

/** Sharp flag (or ≥ 6): the exercise was stopped. */
export const isSharp = (p: Pick<PainCheck, 'during_set'> & { pain_score?: number | null }): boolean =>
  p.during_set === 'sharp' || (p.pain_score != null && Number(p.pain_score) >= PAIN_STOP);

/** Any pain during the session (score ≥ 1, or the old ache/sharp). */
export const hurtDuring = (p: Pick<PainCheck, 'during_set'> & { pain_score?: number | null }): boolean => (duringScore(p) ?? 0) >= 1;

export const isElbowSite = (site: string): boolean => site.includes('elbow') && site !== ELBOW_MONTHLY_SITE;

/** The morning a next-morning answer belongs to: the day after the check (the morning score sits on the same row). */
export const morningOf = (p: Pick<PainCheck, 'date'>): string => addDays(p.date, 1);

/**
 * The site's usual morning level: the median of its morning scores on rows dated in the 14 days before `date`
 * (not including it), or 0 when there are none.
 */
export function morningBaseline(checks: readonly PainCheck[], site: string, date: string): number {
  const from = addDays(date, -14);
  const xs = checks.filter((p) => p.site === site && p.morning_score != null && p.date >= from && p.date < date && !p.deleted_at)
    .map((p) => Number(p.morning_score)).sort((a, b) => a - b);
  if (!xs.length) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid]! : (xs[mid - 1]! + xs[mid]!) / 2;
}

/** A morning score ≥ the site's baseline + 2 (J-PAINRULE: swap; J-ELBOW: wrist-ladder flare-up step). */
export function isMorningFlare(p: PainCheck, checks: readonly PainCheck[]): boolean {
  if (p.morning_score == null) return false;
  return Number(p.morning_score) >= morningBaseline(checks, p.site, p.date) + MORNING_RISE;
}

/** The answer to the morning prompt: morning_score plus the legacy next_morning (sore = a flare). */
export function morningAnswer(checks: readonly PainCheck[], check: PainCheck, score: number): Pick<PainCheck, 'next_morning'> & { morning_score: number } {
  const s = Math.max(0, Math.min(10, Math.round(score)));
  const sore = s >= morningBaseline(checks, check.site, check.date) + MORNING_RISE;
  return { morning_score: s, next_morning: sore ? 'sore' : 'normal' };
}

/** A new pain-check row from the logger's 0–10 slider and sharp toggle (writes both the score and during_set). */
export function painCheckRow(input: {
  date: string; site: string; exerciseId?: string | null; sessionId?: string | null; score: number; sharp?: boolean;
  worseThanLast?: boolean | null; note?: string | null;
}): Omit<PainCheck, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'server_updated_at' | 'deleted_at'> {
  const score = Math.max(0, Math.min(10, Math.round(input.score)));
  const during = duringSetFrom(score, input.sharp);
  return {
    date: input.date, site: input.site, exercise_id: input.exerciseId ?? null, session_id: input.sessionId ?? null,
    during_set: during, pain_score: score, morning_score: null, next_morning: null,
    worse_than_last: during === 'none' ? null : input.worseThanLast ?? null, note: input.note ?? null,
  };
}

/** The monthly elbow check (Part U): 3 questions, 0–10 each, stored as a pain_checks row with site elbow_monthly. */
export interface ElbowMonthly { worst: number; grip: number; daily: number }

export function elbowMonthlyRow(date: string, scores: ElbowMonthly): ReturnType<typeof painCheckRow> {
  const clamp = (x: number) => Math.max(0, Math.min(10, Math.round(x)));
  const s = { worst: clamp(scores.worst), grip: clamp(scores.grip), daily: clamp(scores.daily) };
  return {
    date, site: ELBOW_MONTHLY_SITE, exercise_id: null, session_id: null, during_set: null, pain_score: null, morning_score: null,
    next_morning: null, worse_than_last: null, note: JSON.stringify({ kind: 'elbow_monthly', ...s, total: s.worst + s.grip + s.daily }),
  };
}

/** The scores of a monthly elbow row, or null. */
export function elbowMonthlyOf(p: Pick<PainCheck, 'site' | 'note'>): (ElbowMonthly & { total: number }) | null {
  if (p.site !== ELBOW_MONTHLY_SITE || !p.note) return null;
  try {
    const x = JSON.parse(p.note) as Partial<ElbowMonthly>;
    if (typeof x.worst !== 'number' || typeof x.grip !== 'number' || typeof x.daily !== 'number') return null;
    return { worst: x.worst, grip: x.grip, daily: x.daily, total: x.worst + x.grip + x.daily };
  } catch {
    return null;
  }
}
