// §4.2 Strength: training maxes against the plan line, rep-outs, missed rep-outs, checkpoints,
// provisional TMs and the step lifts (incline DB, weighted pull-up).

import type { SetRow, TrainingMax } from "../data/types";
import { addDays, fmtNum, fmtShortDate } from "../lib/format";
import {
  PROVISIONAL_REPS, checkpointStatus, dumbbellStep, incrementAfterRepOut, isoWeekday, tmChangePercent, trainingMaxAfterRepOut,
  trainingMaxFromSet, weekForDate
} from "../plan/engine";
import type { MainLiftKey, ProgramDefinition, StepLiftKey, TmLiftKey } from "../plan/types";
import { planRef } from "../plan/workout";
import {
  LIFT_NAME, TRAINING_WEEK, bw7, fmtBw, fmtLoad, near25, nextMonday, plural, sessionsIn, sig, tmAt, tmRowAt, tmRows, weekBounds,
  shortSleepBefore, workSets, type AreaResult, type WeekCtx
} from "./common";
import type { CoachData } from "./data";
import { laggingMuscles } from "./muscle";
import type { Signal, WeekNumbers } from "./types";

const TM_LIFTS: TmLiftKey[] = ["squat", "deadlift"];
const STEP_LIFTS: StepLiftKey[] = ["incline_db_press", "weighted_pullup"];

/** The goal set as a training max: 145 × 5 → 167.5, 205 × 5 → 237.5. */
export function goalTm(plan: ProgramDefinition, lift: TmLiftKey): number {
  return trainingMaxFromSet(plan.goals[lift].load, plan.goals[lift].reps);
}

/**
 * The plan line: straight from the calibration TM (week 0) to checkpoint 1's TM, then checkpoint 2's,
 * then the goal TM in the test week. Deload and taper weeks count toward it.
 */
export function planLine(plan: ProgramDefinition, lift: TmLiftKey, calibrationTm: number, weekNo: number): number {
  const pts: [number, number][] = [[0, calibrationTm]];
  for (const w of plan.weeks) if (w.checkpoint) pts.push([w.checkpoint.weekNo, lift === "squat" ? w.checkpoint.squatTm : w.checkpoint.deadliftTm]);
  pts.push([plan.weeks[plan.weeks.length - 1]!.weekNo, goalTm(plan, lift)]);
  if (weekNo <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [w0, v0] = pts[i - 1]!;
    const [w1, v1] = pts[i]!;
    if (weekNo <= w1) return w1 === w0 ? v1 : v0 + ((v1 - v0) * (weekNo - w0)) / (w1 - w0);
  }
  return pts[pts.length - 1]![1];
}

/** Completed rep-out sets of a main lift among these sets. */
const repOutsOf = (sets: readonly SetRow[], lift: MainLiftKey) =>
  sets.filter((s) => planRef(s)?.mainLift === lift && s.kind === "rep_out" && s.reps != null && s.load != null);

interface RepOutResult { set: SetRow; date: string; weekNo: number | null; load: number; reps: number; target: number | null }

/** Every rep-out of a lift in the plan period up to `asOf`, oldest first. */
function repOutHistory(data: CoachData, lift: MainLiftKey, asOf: string): RepOutResult[] {
  const sessions = data.planSessions.filter((s) => s.date <= asOf);
  return sessions.flatMap((sess) => repOutsOf(workSets(data, [sess]), lift).map((set) => ({
    set, date: sess.date, weekNo: weekForDate(data.plan, sess.date)?.weekNo ?? null, load: Number(set.load), reps: set.reps!,
    target: planRef(set)?.target ?? null
  })));
}

/** The TM row a rep-out wrote, and the TM before it. */
function tmChange(data: CoachData, lift: TmLiftKey, r: RepOutResult): { from: number | null; to: number; row: TrainingMax | null } {
  const rows = tmRows(data, lift);
  const i = rows.findIndex((m) => m.source_set_id === r.set.id);
  if (i >= 0) return { from: i > 0 ? Number(rows[i - 1]!.value_kg) : null, to: Number(rows[i]!.value_kg), row: rows[i]! };
  const prev = rows.filter((m) => m.effective_date < r.date).at(-1);
  const from = prev ? Number(prev.value_kg) : null;
  const calibration = r.weekNo === 0 || from == null || planRef(r.set)?.calibration === true;
  return { from, to: trainingMaxAfterRepOut(r.load, r.reps, { previous: from, target: r.target, calibration, oldBest: data.plan.oldBestE1rm?.[lift] }).tm, row: null };
}

/** R1-03: the TM was at or past the old best, so a hit held it and a beat added at most 2.5 kg. */
const isCapped = (data: CoachData, lift: TmLiftKey, from: number | null, diff: number) => {
  const best = data.plan.oldBestE1rm?.[lift];
  return best != null && from != null && from >= best - 1e-9 && diff >= 0;
};

const stepFmt = (lift: StepLiftKey, x: number) => (lift === "weighted_pullup" ? `+${fmtLoad(x)} kg` : `${fmtLoad(x)} kg`);

export function strengthRules(ctx: WeekCtx): AreaResult {
  const { data, week, weekNo } = ctx;
  const plan = data.plan;
  const out: Signal[] = [];
  const numbers: Pick<WeekNumbers, "trainingMax" | "repOuts" | "stepLoads"> = { trainingMax: {}, repOuts: [], stepLoads: {} };

  // ---- squat and deadlift
  for (const lift of TM_LIFTS) {
    const name = LIFT_NAME[lift];
    const rows = tmRows(data, lift).filter((m) => m.effective_date >= data.start);
    const cal = rows[0];
    const cur = tmRowAt(data, lift, ctx.asOf);
    const thisWeek = repOutsOf(ctx.sets, lift);
    // While the week runs and this week's rep-out is still to come, compare with last week's point on the line.
    const lineWeek = !ctx.complete && TRAINING_WEEK.has(week.type) && !thisWeek.length ? Math.max(0, weekNo - 1) : weekNo;
    const line = cal ? planLine(plan, lift, Number(cal.value_kg), lineWeek) : null;
    numbers.trainingMax[lift] = {
      tm: cur ? Number(cur.value_kg) : null, line, calibration: cal ? Number(cal.value_kg) : null,
      provisional: !!cur?.note?.startsWith("provisional")
    };

    // strength.tm.{lift}
    if (cur && line != null) {
      const tm = Number(cur.value_kg);
      const shown = near25(line);
      const metric = { label: `${name} TM`, value: fmtLoad(tm), target: fmtLoad(shown) };
      const why: Signal["why"] = ["P-PROG-TM", "P-CHECKPOINT", "M-REGAIN"];
      if (tm >= line * 0.975 - 1e-9) {
        out.push(sig(`strength.tm.${lift}`, "strength", "good", `${name} on track`, `${name} TM ${fmtLoad(tm)}, plan line ${fmtLoad(shown)}.`, why, { metric }));
      } else if (tm >= line * 0.95 - 1e-9) {
        out.push(sig(`strength.tm.${lift}`, "strength", "watch", `${name} slightly behind`,
          `${name} TM ${fmtLoad(tm)} is ${fmtLoad(shown - tm)} kg under the plan line (${fmtLoad(shown)}).`, why, { metric }));
      } else {
        out.push(sig(`strength.tm.${lift}`, "strength", "act", `${name} behind the line`,
          `${name} TM ${fmtLoad(tm)} is ${fmtLoad(shown - tm)} kg behind. Check sessions, sleep and bodyweight first.`, why, { metric }));
      }
    }

    // strength.repout.{lift} and strength.calibration.{lift}
    const ro = thisWeek.at(-1);
    if (ro) {
      const r: RepOutResult = { set: ro, date: ctx.sessions.find((s) => s.id === ro.session_id)?.date ?? ctx.asOf, weekNo, load: Number(ro.load), reps: ro.reps!, target: planRef(ro)?.target ?? null };
      const change = tmChange(data, lift, r);
      numbers.repOuts.push({ lift, date: r.date, load: r.load, reps: r.reps, target: r.target, tmFrom: change.from, tmTo: change.to, nextLoad: null });
      if (week.type === "calibration" || r.target == null || planRef(ro)?.calibration === true) {
        if (r.reps > PROVISIONAL_REPS) {
          out.push(sig(`strength.calibration.${lift}`, "strength", "info", `${name} TM provisional`,
            `${name} ${fmtLoad(r.load)} × ${r.reps}: past 12 reps the formula is rough, so the TM is provisional (${fmtLoad(change.to)}). The next rep-outs correct it.`,
            ["P-CALIB", "M-E1RM"]));
        } else {
          out.push(sig(`strength.repout.${lift}`, "strength", "info", `${name} TM set`,
            `${name} ${fmtLoad(r.load)} × ${r.reps}: training max ${fmtLoad(change.to)}.`, ["P-CALIB", "P-PROG-TM"]));
        }
      } else {
        const diff = r.reps - r.target;
        const pct = tmChangePercent(diff);
        const head = `${name} ${fmtLoad(r.load)} × ${r.reps} (target ${r.target})`;
        const capped = isCapped(data, lift, change.from, diff);
        const base = capped
          ? `${head}: TM ${change.to === change.from ? `stays ${fmtLoad(change.to)}` : `+${fmtLoad(change.to - change.from!)} kg to ${fmtLoad(change.to)}`} (capped past your old best).`
          : `${head}: TM ${pct > 0 ? "+" : "−"}${Math.abs(pct)}% to ${fmtLoad(change.to)}.`;
        const metric = { label: `${name} rep-out`, value: String(r.reps), target: String(r.target) };
        const why: Signal["why"] = ["P-PROG-TM", "M-E1RM"];
        // E18: a miss after a short night is read in context and doesn't count toward the early-deload rule.
        const short = diff < 0 ? shortSleepBefore(data, r.date) : null;
        const night = short != null
          ? ` ${name} missed after a short night (${fmtNum(short, 1)} h); one-off misses after short nights don't count toward the early-deload rule.` : "";
        if (diff >= 0) out.push(sig(`strength.repout.${lift}`, "strength", "good", `${name} rep-out hit`, base, why, { metric }));
        else if (diff === -1 || short != null) {
          out.push(sig(`strength.repout.${lift}`, "strength", "watch", diff === -1 ? `${name} rep-out one short` : `${name} missed after short night`,
            `${base}${night}`, short != null ? [...why, "C-SLEEP"] : why, { metric }));
        } else out.push(sig(`strength.repout.${lift}`, "strength", "act", `${name} rep-out missed`, `${base} Note anything off: sleep, food, pain.`, why, { metric }));
      }
    }
  }

  const misses = missesSignal(ctx);
  if (misses) out.push(misses);
  out.push(...checkpointSignals(ctx));
  out.push(...checkpointAhead(ctx));

  // ---- incline DB and pull-up
  for (const lift of STEP_LIFTS) {
    const name = LIFT_NAME[lift];
    const def = plan.mainLifts[lift];
    const ro = repOutsOf(ctx.sets, lift).at(-1);
    const current = tmRowAt(data, lift, ctx.asOf);
    const load = current ? Number(current.value_kg) : data.state.currentLoads[lift] ?? plan.calibrationLoads[lift];
    numbers.stepLoads[lift] = load;

    if (ro) {
      const l = Number(ro.load);
      const reps = ro.reps!;
      const r = incrementAfterRepOut(lift, l, reps, data.equipment, def);
      numbers.repOuts.push({ lift, date: ctx.sessions.find((s) => s.id === ro.session_id)?.date ?? ctx.asOf, load: l, reps, target: planRef(ro)?.target ?? def.repOutTarget, tmFrom: null, tmTo: null, nextLoad: week.type === "test" ? null : r.load });
    }
    if (week.type === "test") continue;

    if (ro) {
      const l = Number(ro.load);
      const reps = ro.reps!;
      const r = incrementAfterRepOut(lift, l, reps, data.equipment, def);
      const head = `${name} ${stepFmt(lift, l)} × ${reps}`;
      const why: Signal["why"] = ["P-PROG-STEP"];
      if (r.direction > 0) out.push(sig(`strength.step.${lift}`, "strength", "good", `${name}: step up`, `${head}: next ${stepFmt(lift, r.load)}.`, why));
      else if (r.direction === 0) out.push(sig(`strength.step.${lift}`, "strength", "info", `${name}: same load`, `${head}: same load next week.`, why));
      else out.push(sig(`strength.step.${lift}`, "strength", "watch", `${name}: step down`, `${head}: one step down to ${stepFmt(lift, r.load)}.`, why));
    }

    // strength.step_pace.{lift}
    const history = repOutHistory(data, lift, ctx.asOf);
    if (!history.length) continue;
    const goal = plan.goals[lift].load;
    const steps = stepsTo(lift, load, goal, data.equipment.dumbbellRackKg, data.equipment.beltStepKg);
    const weeksLeft = plan.weeks.filter((w) => w.weekNo > weekNo && TRAINING_WEEK.has(w.type)).length
      + (TRAINING_WEEK.has(week.type) && !ro ? 1 : 0);
    const last4 = history.slice(-4);
    const stuck = last4.length === 4 && last4.every((h) => Math.abs(h.load - last4[0]!.load) < 1e-9 && h.reps < def.stepUpAtReps);
    const why: Signal["why"] = ["P-PROG-STEP"];
    const metric = { label: `${name} steps to goal`, value: String(steps), target: String(weeksLeft) };
    if (stuck) {
      out.push(sig(`strength.step_pace.${lift}`, "strength", "watch", `${name} stuck`, `${name} stuck at ${stepFmt(lift, last4[0]!.load)} for 4 weeks.`, why, { metric }));
    } else if (steps === 0) {
      out.push(sig(`strength.step_pace.${lift}`, "strength", "good", `${name} at goal load`, `${name} is at the goal load (${stepFmt(lift, goal)}).`, why, { metric }));
    } else if (steps <= weeksLeft) {
      out.push(sig(`strength.step_pace.${lift}`, "strength", "good", `${name} on pace`,
        `${steps} ${plural(steps, "step")} to ${stepFmt(lift, goal)}, ${weeksLeft} rep-out ${plural(weeksLeft, "week")} left.`, why, { metric }));
    } else {
      out.push(sig(`strength.step_pace.${lift}`, "strength", "watch", `${name} behind pace`,
        `${steps} ${plural(steps, "step")} to ${stepFmt(lift, goal)} with ${weeksLeft} rep-out ${plural(weeksLeft, "week")} left: behind pace.`, why, { metric }));
    }
  }

  return { signals: out, numbers };
}

/** Load steps from `load` up to `goal`: the dumbbell rack for incline, 2.5 kg belt steps for the pull-up. */
export function stepsTo(lift: StepLiftKey, load: number, goal: number, rack: readonly number[], beltStep = 2.5): number {
  if (load >= goal - 1e-9) return 0;
  if (lift === "weighted_pullup") return Math.ceil((goal - load) / beltStep - 1e-9);
  let n = 0;
  let x = load;
  while (x < goal - 1e-9 && n < 50) {
    const next = dumbbellStep(x, 1, rack);
    if (next === x) break;
    x = next;
    n++;
  }
  return n;
}

// ---------- strength.misses ----------

/**
 * R1-06 early-deload trigger for a TM lift: its last 2 consecutive rep-outs both ≥ 2 under target, or its last 3
 * consecutive rep-outs all ≥ 1 under (consecutive = only light weeks in between). A miss after a short night
 * (< 6 h, E18) doesn't count: it breaks the run. Returns 2, 3 or null, for the run that fired.
 */
export function earlyDeloadRun(data: CoachData, lift: TmLiftKey, asOf: string, from: string): 2 | 3 | null {
  const h = repOutHistory(data, lift, asOf).filter((r) => r.target != null && r.weekNo != null && planRef(r.set)?.calibration !== true);
  const latest = h.at(-1);
  if (!latest || latest.date < from) return null;
  const deficit = (r: RepOutResult) => (shortSleepBefore(data, r.date) != null ? 0 : r.target! - r.reps);
  const consecutive = (xs: RepOutResult[]) => xs.every((x, i) => i === 0
    || !data.plan.weeks.some((w) => w.weekNo > xs[i - 1]!.weekNo! && w.weekNo < x.weekNo! && TRAINING_WEEK.has(w.type)));
  const two = h.slice(-2);
  if (two.length === 2 && consecutive(two) && two.every((r) => deficit(r) >= 2)) return 2;
  const three = h.slice(-3);
  if (three.length === 3 && consecutive(three) && three.every((r) => deficit(r) >= 1)) return 3;
  return null;
}

function missesSignal(ctx: WeekCtx): Signal | null {
  const { data, weekNo } = ctx;
  const plan = data.plan;
  const runs = TM_LIFTS.map((lift) => earlyDeloadRun(data, lift, ctx.asOf, ctx.from)).filter((x): x is 2 | 3 => x != null);
  if (!runs.length) return null;
  const why: Signal["why"] = ["P-DELOAD", "N-SURPLUS", "C-SLEEP"];
  const running = runs.includes(2) ? "Rep-outs missed by 2+ reps two weeks running" : "Rep-outs under target three weeks running";

  const before = bw7(data, addDays(ctx.asOf, -14));
  const now = bw7(data, ctx.asOf);
  if (before != null && now != null && now < before) {
    return sig("strength.misses", "strength", "act", "Eat more: +100 kcal",
      `${running} and bodyweight is dropping. Eat first: +100 kcal.`, why,
      { action: { kind: "kcal", delta: 100, from: nextMonday(ctx.asOf) } });
  }
  const nights = data.health.filter((h) => h.date > addDays(ctx.asOf, -7) && h.date <= ctx.asOf && (h.sleep_total_min ?? 0) > 0);
  const sleepH = nights.length >= 4 ? nights.reduce((s, h) => s + h.sleep_total_min!, 0) / nights.length / 60 : null;
  if (sleepH != null && sleepH < 6) {
    return sig("strength.misses", "strength", "watch", "Rep-outs missed, sleep short",
      `${running}. Sleep ${fmtBw(sleepH)} h: fix sleep first.`, why);
  }
  // "Take the deload now": this week if most of it is still ahead (before Thursday), else next week.
  const applied = data.adjustments.find((a) => a.data.kind === "deload_now" && (a.data.weekNo === weekNo || a.data.weekNo === weekNo + 1));
  const target = applied?.data.kind === "deload_now" ? applied.data.weekNo
    : ctx.complete || isoWeekday(ctx.today) >= 4 ? weekNo + 1 : weekNo;
  const tw = plan.weeks.find((w) => w.weekNo === target);
  if (!tw) return null;
  if (!applied && !TRAINING_WEEK.has(tw.type)) {
    if (tw.type !== "deload" && tw.type !== "taper") return null;
    return sig("strength.misses", "strength", "info", `${tw.type === "taper" ? "Taper" : "Deload"} comes next`,
      `${running}. The ${tw.type === "taper" ? "taper" : "deload"} is next week anyway.`, why);
  }
  return sig("strength.misses", "strength", "act", "Take the deload now",
    `${running}. Take the deload now; the plan allows it early.`, why,
    { action: { kind: "deload_now", weekNo: target } });
}

// ---------- strength.checkpoint ----------

const orDash = (x: number | null, f: (v: number) => string) => (x == null ? "–" : f(x));

function checkpointSignals(ctx: WeekCtx): Signal[] {
  const { data, week, weekNo } = ctx;
  const cp = week.checkpoint;
  if (!cp || !ctx.complete) return [];
  const plan = data.plan;
  const index = plan.weeks.filter((w) => w.checkpoint).findIndex((w) => w.weekNo === weekNo) + 1;
  const values = { squatTm: tmAt(data, "squat", ctx.to), deadliftTm: tmAt(data, "deadlift", ctx.to), bodyweight7d: bw7(data, ctx.to) };
  const st = checkpointStatus(plan, weekNo, values);
  if (!st) return [];
  const why: Signal["why"] = ["P-CHECKPOINT"];
  const s = orDash(values.squatTm, fmtLoad);
  const d = orDash(values.deadliftTm, fmtLoad);
  const b = orDash(values.bodyweight7d, fmtBw);
  const metric = { label: cp.name, value: `${s} / ${d} / ${b}`, target: `${fmtLoad(cp.squatTm)} / ${fmtLoad(cp.deadliftTm)} / ${fmtBw(cp.bodyweight7d)}` };

  if (st.met) {
    const fromWeek = plan.weeks.find((w) => w.weekNo > weekNo && w.extraSetsEligible)?.weekNo ?? weekNo + 2;
    const toWeek = plan.weeks.filter((w) => w.extraSetsEligible).at(-1)?.weekNo;
    const head = `${cp.name} met: squat ${s}/${fmtLoad(cp.squatTm)}, deadlift ${d}/${fmtLoad(cp.deadliftTm)}, bodyweight ${b}/${fmtBw(cp.bodyweight7d)}.`;
    const pkg = plan.extraSets;
    if (index !== 1) return [sig("strength.checkpoint", "strength", "good", `${cp.name} met`, head, why, { metric })];
    if (!pkg) {
      // A programme without the fixed package: the two most lagging muscles (the original rule).
      const muscles = laggingMuscles(data, 1, weekNo);
      return [sig("strength.checkpoint", "strength", "good", `${cp.name} met`, head, [...why, "P-EXTRASETS"],
        { metric, ...(muscles.length ? { action: { kind: "extra_sets", muscles, fromWeek } } : {}) })];
    }
    // R1-08: fixed arm package (+2 biceps, +2 triceps a week) and the optional rear delt set as a second action.
    return [
      sig("strength.checkpoint", "strength", "good", `${cp.name} met`,
        `${head} Extra arm work from week ${fromWeek}${toWeek != null && toWeek > fromWeek ? ` through week ${toWeek}` : ""}: +1 set on each curl and triceps exercise on Tue and Sat (+2 biceps and +2 triceps sets a week), in every training week (not the deloads). Arms gain most from extra sets; about 3 min a session.`,
        [...why, "P-EXTRASETS"],
        { metric, action: { kind: "extra_sets", muscles: [...pkg.arms.muscles], fromWeek, targets: pkg.arms.targets.map((t) => ({ ...t })) } }),
      sig("strength.checkpoint.rear_delt", "strength", "info", "Optional rear delt set",
        "Optional: +1 rear delt fly set on Tuesday, right after the flye.", ["P-EXTRASETS"],
        { action: { kind: "extra_sets", muscles: [...pkg.rearDelt.muscles], fromWeek, targets: pkg.rearDelt.targets.map((t) => ({ ...t })) } })
    ];
  }
  if (values.bodyweight7d == null) {
    return [sig("strength.checkpoint", "strength", "act", `${cp.name}: no bodyweight`,
      `${cp.name}: no weigh-ins to judge bodyweight. Weigh in every morning.`, [...why, "N-RATE"], { metric })];
  }
  if (st.advice === "fix_bodyweight_first") {
    return [sig("strength.checkpoint", "strength", "act", `${cp.name} missed: eat more`,
      `${cp.name} missed. Bodyweight ${b} vs ${fmtBw(cp.bodyweight7d)}: fix food first, +100 kcal.`, [...why, "N-SURPLUS"],
      { metric, action: { kind: "kcal", delta: 100, from: nextMonday(ctx.to) } })];
  }
  // Behind on lifts with bodyweight fine: sessions first ("check sessions done and bodyweight first").
  const prevCp = plan.weeks.filter((w) => w.checkpoint && w.weekNo < weekNo).at(-1)?.weekNo ?? 0;
  const span = plan.weeks.filter((w) => w.weekNo > prevCp && w.weekNo <= weekNo);
  const planned = span.reduce((n, w) => n + (w.type === "test" ? 3 : 4), 0);
  const done = span.reduce((n, w) => { const { from, to } = weekBounds(w); return n + sessionsIn(data, from, to).length; }, 0);
  const lifts = st.behind.join(" and ");
  if (done < 0.9 * planned) {
    return [sig("strength.checkpoint", "strength", "act", `${cp.name} missed: sessions first`,
      `${cp.name} missed on ${lifts}. ${done} of ${planned} sessions since week ${prevCp + 1}: get the sessions in first.`,
      [...why, "P-ADHERENCE"], { metric })];
  }
  // R1-07: squat → a light Friday squat; deadlift → back-off sets; incline and pull-up → one more normal set.
  const fb = plan.mainLiftFallbacks;
  const parts = [
    ...(st.behind.includes("squat") ? [fb ? `squat: a light Friday squat, ${fb.squat.sets} × ${fb.squat.reps} at ${Math.round(fb.squat.pctTm * 100)}% TM before the split squats` : "squat: one more normal set"] : []),
    ...(st.behind.includes("deadlift") ? [fb ? `deadlift: 1–${fb.deadlift.sets} back-off sets of ${fb.deadlift.repRange[0]}–${fb.deadlift.repRange[1]} at ${Math.round(fb.deadlift.pctOfTop * 100)}% of the top set` : "deadlift: a back-off set"] : []),
    "incline and pull-up: one more normal set"
  ];
  const text = parts.join("; ");
  return [sig("strength.checkpoint", "strength", "act", `${cp.name} missed: add a set`,
    `${cp.name} missed on ${lifts}. Add work: ${text}.`, [...why, "P-VOLUME", "P-DEADLIFT"],
    { metric, action: { kind: "main_lift_set", lifts: [...st.behind, "incline_db_press", "weighted_pullup"], fromWeek: weekNo + 1 } })];
}

// ---------- strength.checkpoint_ahead ----------

function checkpointAhead(ctx: WeekCtx): Signal[] {
  const { data, week, weekNo } = ctx;
  const plan = data.plan;
  const cps = plan.weeks.filter((w) => w.checkpoint);
  const next = cps.find((w) => w.weekNo - weekNo >= 1 && w.weekNo - weekNo <= 3);
  if (!next?.checkpoint) return [];
  const cp = next.checkpoint;
  const n = cps.indexOf(next) + 1;
  const k = next.weekNo - weekNo;
  const out: Signal[] = [];
  for (const lift of TM_LIFTS) {
    const rows = tmRows(data, lift).filter((m) => m.effective_date >= data.start && m.effective_date <= ctx.asOf);
    const changes: number[] = [];
    for (let i = 1; i < rows.length; i++) if (rows[i]!.reason === "rep_out") changes.push(Number(rows[i]!.value_kg) - Number(rows[i - 1]!.value_kg));
    const last3 = changes.slice(-3);
    const tm = rows.at(-1);
    if (!last3.length || !tm) continue;
    const avg = last3.reduce((a, b) => a + b, 0) / last3.length;
    const doneThisWeek = repOutsOf(ctx.sets, lift).length > 0;
    const left = plan.weeks.filter((w) => w.weekNo > weekNo && w.weekNo <= next.weekNo && TRAINING_WEEK.has(w.type)).length
      + (TRAINING_WEEK.has(week.type) && !doneThisWeek ? 1 : 0);
    const proj = near25(Number(tm.value_kg) + avg * left);
    const needs = lift === "squat" ? cp.squatTm : cp.deadliftTm;
    const name = LIFT_NAME[lift].toLowerCase();
    const metric = { label: `${LIFT_NAME[lift]} projected TM`, value: fmtLoad(proj), target: fmtLoad(needs) };
    if (proj >= needs - 1e-9) {
      out.push(sig(`strength.checkpoint_ahead.${lift}`, "strength", "good", `${LIFT_NAME[lift]} on course`,
        `On course for checkpoint ${n}: ${name} ≈${fmtLoad(proj)} by ${fmtShortDate(cp.date)} (needs ${fmtLoad(needs)}).`, ["P-CHECKPOINT", "P-PROG-TM"], { metric }));
    } else {
      out.push(sig(`strength.checkpoint_ahead.${lift}`, "strength", "watch", `${LIFT_NAME[lift]} short of checkpoint`,
        `Checkpoint ${n} in ${k} ${plural(k, "week")}: ${name} ≈${fmtLoad(proj)}, needs ${fmtLoad(needs)}.`, ["P-CHECKPOINT", "P-PROG-TM"], { metric }));
    }
  }
  return out;
}
