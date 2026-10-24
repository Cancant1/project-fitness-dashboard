// §4.3 Muscle: weekly working sets, sets per muscle against the good-week reference, accessory progress,
// isolation overshoot.

import type { Exercise, SetRow } from "../data/types";
import { fractionalVolume } from "../lib/analysis";
import { addDays } from "../lib/format";
import { PLAN } from "../plan/bridge";
import { OVERSHOOT_REPS, bigJumpEarned, isBigJump, stepLoad, weekForDate } from "../plan/engine";
import { weightsFor } from "../plan/equipment";
import { VARIETY_NOTE } from "../plan/strengthReturn";
import type { Muscle, ProgramSlot } from "../plan/types";

/** P-RESTART: logged working sets above planned × 1.1 is make-up volume. */
export const OVERREACH_FACTOR = 1.1;
import {
  TRAINING_WEEK, exerciseLabel, fmtLoad, isCareKey, keyOfSet, plural, sessionsIn, sig, weekBounds, weekTypeOfSession, workSets,
  type AreaResult, type WeekCtx
} from "./common";
import type { CoachData } from "./data";
import { REFERENCE, muscleKey } from "./reference";
import type { Signal, WeekNumbers } from "./types";

/** Accessory slots (compounds and isolation; no mains, shoulder block or rehab), one per exercise key. */
const ACCESSORIES: ProgramSlot[] = (() => {
  const seen = new Map<string, ProgramSlot>();
  for (const d of PLAN.days) for (const s of d.slots) {
    if ((s.role === "compound" || s.role === "isolation") && !s.rehab && s.scheme && !seen.has(s.exerciseKey)) seen.set(s.exerciseKey, s);
  }
  return [...seen.values()];
})();

/** R2-09 (24 Oct 2026): horizontal rows count ½ set for the rear delts, as Pelland counts synergists. */
const isHorizontalRow = (name: string) => /\brows?\b/i.test(name) && !/upright/i.test(name);

/** Exercises with muscle names normalised so "side_delts" (plan-created) and "Side delts" (history) match. */
function normalisedExercises(data: CoachData): Map<string, Pick<Exercise, "muscle_direct" | "muscle_indirect">> {
  const m = new Map<string, Pick<Exercise, "muscle_direct" | "muscle_indirect">>();
  for (const [id, e] of data.exercises) {
    const indirect = (e.muscle_indirect ?? []).map(muscleKey);
    if (isHorizontalRow(e.name) && !indirect.includes("rear delts") && muscleKey(e.muscle_direct ?? "") !== "rear delts") indirect.push("rear delts");
    m.set(id, { muscle_direct: e.muscle_direct ? muscleKey(e.muscle_direct) : null, muscle_indirect: indirect });
  }
  return m;
}

/** Fractional sets per reference muscle for these sets (care work excluded), divided by `weeks`. */
export function muscleSets(data: CoachData, sets: readonly SetRow[], weeks = 1): WeekNumbers["muscles"] {
  const counted = sets.filter((s) => !isCareKey(keyOfSet(data, s))).map((s) => ({ exerciseId: s.exercise_id }));
  const vol = fractionalVolume(counted, normalisedExercises(data));
  return REFERENCE.map((r) => {
    const n = (vol.get(muscleKey(r.muscle))?.sets ?? 0) / Math.max(1, weeks);
    return { muscle: r.muscle, key: r.key, sets: n, plan: r.plan, good: r.good, pctOfGood: n / r.good };
  });
}

/**
 * The two muscles furthest below their good-week volume, averaged over the training weeks (A–D)
 * `fromWeek`…`toWeek`. Used by the extra_sets action after checkpoint 1.
 */
export function laggingMuscles(data: CoachData, fromWeek: number, toWeek: number, count = 2): Muscle[] {
  const weeks = data.plan.weeks.filter((w) => w.weekNo >= fromWeek && w.weekNo <= toWeek && TRAINING_WEEK.has(w.type));
  if (!weeks.length) return [];
  const sets = weeks.flatMap((w) => { const { from, to } = weekBounds(w); return workSets(data, sessionsIn(data, from, to)); });
  if (!sets.length) return [];
  return muscleSets(data, sets, weeks.length)
    .sort((a, b) => a.pctOfGood - b.pctOfGood)
    .slice(0, count)
    .map((m) => m.key);
}

export function muscleRules(ctx: WeekCtx): AreaResult {
  const { data } = ctx;
  const out: Signal[] = [];

  // muscle.volume
  const planned = ctx.days.reduce((n, d) => n + d.workingSetCount, 0);
  const done = ctx.sets.filter((s) => !isCareKey(keyOfSet(data, s))).length;
  if (planned > 0) {
    const pct = done / planned;
    const metric = { label: "Working sets", value: String(done), target: String(planned) };
    const why: Signal["why"] = ["P-VOLUME"];
    if (pct >= 0.9) out.push(sig("muscle.volume", "muscle", "good", "Volume on plan", `${done} of ${planned} working sets.`, why, { metric }));
    else if (!ctx.complete) out.push(sig("muscle.volume", "muscle", "pending", "Volume so far", `${done} of ${planned} working sets so far.`, why, { metric }));
    else if (pct >= 0.7) out.push(sig("muscle.volume", "muscle", "watch", "Volume a bit low", `${done} of ${planned} working sets.`, why, { metric }));
    else out.push(sig("muscle.volume", "muscle", "act", "Volume too low", `${done} of ${planned} sets: below the dose that keeps you growing.`, why, { metric }));
  }

  // muscle.overreach (P-RESTART, E12): no make-up volume — the weekly cap is the planned sets + 10%.
  if (planned > 0 && done > planned * OVERREACH_FACTOR + 1e-9) {
    out.push(sig("muscle.overreach", "muscle", "watch", "More sets than planned",
      `${done} working sets against ${planned} planned. Missed sets are gone; the next session is the plan.`, ["P-RESTART", "P-VOLUME"],
      { metric: { label: "Working sets", value: String(done), target: `≤ ${Math.floor(planned * OVERREACH_FACTOR)}` } }));
  }

  // muscle.variety (P-VARIETY, E24): the deload weeks allow up to 2 accessory swaps for a listed equivalent.
  if (ctx.week.notes.includes(VARIETY_NOTE)) {
    out.push(sig("muscle.variety", "muscle", "info", "Variety week", VARIETY_NOTE, ["P-VARIETY"]));
  }

  // muscle.by_muscle
  const muscles = muscleSets(data, ctx.sets);
  if (ctx.sets.length) {
    const series = muscles.map((m) => pct(m.pctOfGood));
    if (!ctx.complete) {
      out.push(sig("muscle.by_muscle", "muscle", "pending", "Sets per muscle", "Sets per muscle are compared on Sunday.", ["P-VOLUME"]));
    } else {
      const low = [...muscles].sort((a, b) => a.pctOfGood - b.pctOfGood).slice(0, 2);
      const text = low.map((m) => `${m.muscle.toLowerCase()} ${fmtLoad(Math.round(m.sets * 10) / 10)} ${plural(m.sets, "set")} (${pct(m.pctOfGood)}%)`).join(", ");
      out.push(sig("muscle.by_muscle", "muscle", "info", "Lowest muscles vs good weeks", `Lowest against your good weeks: ${text}.`,
        ["P-VOLUME", "P-EXTRASETS"], { metric: { label: "% of good-week sets", value: low.map((m) => m.muscle).join(", "), series } }));
    }
  }

  out.push(...progressSignals(ctx));
  out.push(...effortSignals(ctx));
  out.push(...breathSignal(ctx));
  out.push(...lateralDecision(ctx));

  return { signals: out, numbers: { workingSets: { done, planned }, muscles } };
}

// ---------- muscle.progress ----------

interface Point { date: string; load: number; reps: number[]; unit: string }

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** Exercise name short enough for a title (≤ 6 words with its prefix). */
const titleName = (name: string) => name.replace(/^Single-arm /, "");
/** Whole percent, robust to float noise (0.575 → 58). */
const pct = (x: number) => Math.round(x * 100 + 1e-9);

/** Load up, or (same load) more total reps (mean reps per set when the set count changed). */
function progressed(cur: Point, prev: Point): boolean {
  if (cur.load > prev.load + 1e-9) return true;
  if (cur.load < prev.load - 1e-9) return false;
  return cur.reps.length === prev.reps.length
    ? sum(cur.reps) > sum(prev.reps)
    : sum(cur.reps) / cur.reps.length > sum(prev.reps) / prev.reps.length + 1e-9;
}

function fmtSets(p: Point): string {
  const unit = p.unit === "bodyweight" ? "" : ` ${p.unit}`;
  return p.load === 0 && p.unit === "bodyweight" ? `BW × ${p.reps.join(", ")}` : `${fmtLoad(p.load)}${unit} × ${p.reps.join(", ")}`;
}

function progressSignals(ctx: WeekCtx): Signal[] {
  const { data } = ctx;
  const out: Signal[] = [];
  const recentFrom = addDays(ctx.asOf, -13);
  let tracked = 0;
  let moved = 0;
  const sessions = data.planSessions.filter((s) => s.date <= ctx.asOf
    && TRAINING_WEEK.has(weekTypeOfSession(s) ?? weekForDate(data.plan, s.date)?.type ?? "deload"));
  for (const slot of ACCESSORIES) {
    const id = data.ids.get(slot.exerciseKey);
    if (!id) continue;
    const points: Point[] = [];
    for (const s of sessions) {
      const sets = workSets(data, [s]).filter((x) => x.exercise_id === id && x.load != null && x.reps != null);
      if (!sets.length) continue;
      points.push({ date: s.date, load: Math.max(...sets.map((x) => Number(x.load))), reps: sets.map((x) => x.reps!), unit: sets[0]!.unit });
    }
    if (points.length < 2) continue;
    let lastUp = 0;
    for (let i = 1; i < points.length; i++) if (progressed(points[i]!, points[i - 1]!)) lastUp = i;
    const latest = points[points.length - 1]!;
    if (latest.date >= recentFrom) {
      tracked++;
      if (points.some((p, i) => i > 0 && p.date >= recentFrom && progressed(p, points[i - 1]!))) moved++;
    }
    const stalled = points.length - 1 - lastUp;
    if (stalled >= 3 && latest.date >= recentFrom) {
      const name = exerciseLabel(data, slot.exerciseKey);
      out.push(sig(`muscle.progress.${slot.exerciseKey}`, "muscle", "watch", `Stalled: ${titleName(name)}`,
        `${name} hasn't moved in ${stalled} sessions. Last sets: ${fmtSets(latest)}. Make sure the last set reaches a stop sign.`,
        ["P-PROG-DOUBLE", "P-PROG-APRE", "P-EFFORT"]));
    }
  }
  if (tracked > 0) {
    out.push(sig("muscle.progress", "muscle", "info", "Accessory progress",
      `${moved} of ${tracked} accessories progressed in the last 2 weeks.`, ["P-PROG-DOUBLE", "P-PROG-APRE"],
      { metric: { label: "Accessories progressed", value: String(moved), target: String(tracked) } }));
  }
  return out;
}

// ---------- muscle.lateral_decision (R2-06) ----------

/** R2-06 (DECISIONS 2026-10-24): on this date, cable laterals still held by the jump cap → switch to DB laterals. */
export const LATERAL_DECISION = { date: "2026-11-14", exerciseKey: "cable_lateral_raise", to: "db_lateral_raise" } as const;

function lateralDecision(ctx: WeekCtx): Signal[] {
  const { data } = ctx;
  const d = LATERAL_DECISION;
  if (d.date < ctx.from || d.date > ctx.to || ctx.asOf < d.date) return [];
  const why: Signal["why"] = ["P-PROG-DOUBLE", "P-EXERCISE"];
  // Judged on that week's own lateral sets (not today's engine state), so the verdict holds when the report is read later.
  const id = data.ids.get(d.exerciseKey);
  const slot = ACCESSORIES.find((s) => s.exerciseKey === d.exerciseKey);
  const failure = ctx.sets.filter((s) => s.exercise_id === id && s.kind === "failure" && s.reps != null && s.load != null);
  const lastSession = failure.at(-1)?.session_id;
  const sets = failure.filter((s) => s.session_id === lastSession);
  if (!slot?.scheme || !sets.length) {
    return [sig("muscle.lateral_decision", "muscle", "info", "Lateral raise decision",
      "No cable laterals logged this week: decide cable or DB laterals at the check-in.", why)];
  }
  const load = Math.max(...sets.map((s) => Number(s.load)));
  const pins = weightsFor(d.exerciseKey);
  const next = pins ? stepLoad(load, pins, 1) : load;
  const range = slot.scheme.repRange;
  const held = isBigJump(load, next) && !bigJumpEarned(sets.map((s) => ({ load: Number(s.load), reps: s.reps })), range, true);
  if (held) {
    return [sig("muscle.lateral_decision", "muscle", "act", "Switch to DB laterals",
      `Cable laterals are still at ${fmtLoad(load)} lb: the next pin (${fmtLoad(next)} lb) needs a ${range[1] + OVERSHOOT_REPS}-rep average. Switch to DB laterals (1–2 kg steps) from Monday; Claude updates the plan at the check-in.`, why)];
  }
  return [sig("muscle.lateral_decision", "muscle", "good", "Keep the cable laterals",
    `Cable laterals at ${fmtLoad(load)} lb are past the big pin jump: keep them.`, why)];
}

// ---------- muscle.breath (R2-05, D-BREATH-STOP) ----------

/** Sets he tagged "breath" this week: breathing ended them, so they may be short of failure. */
function breathSignal(ctx: WeekCtx): Signal[] {
  const { data } = ctx;
  const tagged = ctx.sets.filter((s) => s.flags?.includes("breath"));
  if (!tagged.length) return [];
  const names = [...new Set(tagged.map((s) => { const k = keyOfSet(data, s); return k ? titleName(exerciseLabel(data, k)) : "a set"; }))];
  return [sig("muscle.breath", "muscle", "info", "Breath ended sets",
    `${tagged.length} ${plural(tagged.length, "set")} ended on breathing (${names.join(", ")}): read as possibly short of failure. Rest until you can talk (up to 2 min); if it keeps happening in range, add load rather than reps.`,
    ["P-EFFORT", "P-REST-TEMPO"])];
}

// ---------- muscle.effort (§6.3 overshoot) ----------

function effortSignals(ctx: WeekCtx): Signal[] {
  const { data } = ctx;
  const out: Signal[] = [];
  for (const slot of ACCESSORIES) {
    if (slot.role !== "isolation" || !slot.scheme?.toFailure) continue;
    const id = data.ids.get(slot.exerciseKey);
    const failure = ctx.sets.filter((s) => s.exercise_id === id && s.kind === "failure" && s.reps != null);
    const lastSession = failure.at(-1)?.session_id;
    const sets = failure.filter((s) => s.session_id === lastSession);
    if (!sets.length) continue;
    const [lo, hi] = slot.scheme.repRange;
    const reps = sets.map((s) => s.reps!);
    if (reps.every((r) => r >= hi + OVERSHOOT_REPS)) {
      const name = exerciseLabel(data, slot.exerciseKey);
      const lowR = Math.min(...reps);
      const highR = Math.max(...reps);
      // The engine decides the step (two steps, or one when the jump cap applies); quote its load, not a rule.
      const load = Math.max(...sets.map((s) => s.load ?? 0));
      const next = data.state.currentLoads[slot.exerciseKey];
      const unit = slot.unit === "bodyweight" ? "" : ` ${slot.unit}`;
      const tail = next != null && next > load ? ` Next time ${fmtLoad(next)}${unit} (from ${fmtLoad(load)}).` : " The load goes up next time.";
      out.push(sig(`muscle.effort.${slot.exerciseKey}`, "muscle", "info", `Above range: ${titleName(name)}`,
        `${name}: ${lowR === highR ? lowR : `${lowR}–${highR}`} reps is above the ${lo}–${hi} range.${tail}`,
        ["P-EFFORT", "P-PROG-DOUBLE"]));
    }
  }
  return out;
}
