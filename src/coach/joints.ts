// §4.6 Joints: the pain rule on a 0–10 scale (E14, J-PAINRULE). Old rows (none/ache/sharp, normal/sore) still count.
// During: 0–3 go · 4–5 hold the load · ≥ 6 or sharp: stop that exercise today.
// Next morning ≥ the site's usual + 2 (or the old "sore"), or worse at the next session: one step down the swap
// list for 2 weeks, with a start load (R1-17). Morning scores rising 2 weeks running: cut that exercise's sets by
// a third. Aches rising 2 weeks running: take the deload early (R1-06).

import type { PainCheck } from "../data/types";
import { addDays, fmtNum, fmtShortDate } from "../lib/format";
import { swapHistory } from "../plan/bridge";
import { isoWeekday } from "../plan/engine";
import {
  ELBOW_MONTHLY_SITE, PAIN_HOLD, duringScore, hurtDuring, isElbowSite, isMorningFlare, isSharp, morningBaseline
} from "../plan/pain";
import { nextSwap, swapLabel, swapStartLoad } from "../plan/swaps";
import { TRAINING_WEEK, WEEKDAY, bw7, cap, exerciseLabel, lcFirst, sig, siteName, weekBounds, type AreaResult, type WeekCtx } from "./common";
import type { CoachData } from "./data";
import type { DailyCue, Signal } from "./types";

const siteWhy = (site: string): Signal["why"] =>
  site.includes("elbow") ? ["J-ELBOW"] : site.includes("shoulder") ? ["J-SHOULDER"] : [];

/** The red flags in one line, appended to a cut-sets message. */
export const RED_FLAG_REMINDER = "Red flags (numbness or tingling, swelling, night pain, weakness after a pop, a locking elbow): see a GP within days.";

/** Distinct sessions (or days, for checks without a session) with pain during the set (≥ 1/10 or the old ache/sharp), per site. */
function sessionsWithPain(checks: readonly PainCheck[]): Map<string, { sessions: Set<string>; sharp: number }> {
  const m = new Map<string, { sessions: Set<string>; sharp: number }>();
  for (const p of checks) {
    if (!hurtDuring(p)) continue;
    const e = m.get(p.site) ?? { sessions: new Set<string>(), sharp: 0 };
    e.sessions.add(p.session_id ?? p.date);
    if (isSharp(p)) e.sharp++;
    m.set(p.site, e);
  }
  return m;
}

/** Why a check calls for a swap: a morning flare (≥ usual + 2), the old "sore", or worse than last time. */
function swapReason(p: PainCheck, all: readonly PainCheck[]): string | null {
  if (p.morning_score != null) {
    if (isMorningFlare(p, all)) return `at ${p.morning_score}/10 the morning after`;
  } else if (p.next_morning === "sore") return "sore after";
  return p.worse_than_last === true ? "worse after" : null;
}

export function jointsRules(ctx: WeekCtx): AreaResult {
  const { data } = ctx;
  const out: Signal[] = [];
  const upTo = data.pain.filter((p) => p.date <= ctx.asOf && p.site !== ELBOW_MONTHLY_SITE);

  // joints.swap: last 14 days, no swap running.
  const since = addDays(ctx.asOf, -13);
  const latestByKey = new Map<string, { p: PainCheck; reason: string }>();
  for (const p of upTo) {
    if (p.date < since || !p.exercise_id) continue;
    const reason = swapReason(p, data.pain);
    if (!reason) continue;
    latestByKey.set(data.keyOf.get(p.exercise_id) ?? p.exercise_id, { p, reason });
  }
  let history: ReturnType<typeof swapHistory> | null = null;
  for (const [key, { p, reason }] of latestByKey) {
    const running = data.adjustments.some((a) => a.data.kind === "swap" && a.data.exerciseKey === key && a.data.until >= ctx.asOf);
    if (running) continue;
    const name = lcFirst(exerciseLabel(data, key, p.exercise_id));
    const site = cap(siteName(p.site));
    const usual = p.morning_score != null ? ` (usual ${fmtNum(morningBaseline(data.pain, p.site, p.date), 1)})` : "";
    const to = nextSwap(key, p.site);
    const why: Signal["why"] = ["J-PAINRULE", "J-SWAPS", ...siteWhy(p.site)];
    if (to) {
      const until = addDays(p.date, 14);
      history ??= swapHistory({
        today: ctx.asOf, exercises: [...data.exercises.values()], sessions: data.sessions, sets: [...data.setsBySession.values()].flat(),
        state: data.state, bodyweightKg: bw7(data, ctx.asOf), equipment: data.equipment
      });
      const start = swapStartLoad(key, to, history);
      out.push(sig(`joints.swap.${key}`, "joints", "act", `Swap to ${swapLabel(to)}`,
        `${site} ${reason} ${name}${usual}. Swap to ${swapLabel(to)} for 2 weeks (until ${fmtShortDate(until)}). ${start.text}; first session normal sets only, no rep-out.`, why,
        { action: { kind: "swap", exerciseKey: key, to, until, ...(start.load != null ? { startLoad: start.load, unit: start.unit } : {}) } }));
    } else {
      out.push(sig(`joints.swap.${key}`, "joints", "watch", `${site} pain, no swap`,
        `${site} ${reason} ${name}${usual}. It has no swap on the list: go lighter there next time.`, why));
    }
  }

  // joints.sharp: sharp (or ≥ 6/10) this week, the latest per site.
  const week = upTo.filter((p) => p.date >= ctx.from);
  const sharpBySite = new Map<string, PainCheck>();
  for (const p of week) if (isSharp(p)) sharpBySite.set(p.site, p);
  for (const [site, p] of sharpBySite) {
    const name = lcFirst(exerciseLabel(data, p.exercise_id ? data.keyOf.get(p.exercise_id) : undefined, p.exercise_id));
    const what = p.during_set === "sharp" ? "Sharp pain" : `Pain ${duringScore(p)}/10`;
    out.push(sig(`joints.sharp.${site}`, "joints", "watch", "Sharp pain logged",
      `${what} in ${siteName(site)} during ${name} on ${WEEKDAY[isoWeekday(p.date) - 1]}. That exercise stopped for the day — right call.`,
      ["J-PAINRULE", ...siteWhy(site)]));
  }

  // joints.trend: sessions with pain this week vs the 3 weeks before; rising two weeks running → deload early (R1-06).
  const now = sessionsWithPain(week);
  const prevWeeks = data.plan.weeks.filter((w) => w.weekNo < ctx.weekNo && w.weekNo >= ctx.weekNo - 3);
  const prev = prevWeeks.map((w) => { const { from, to } = weekBounds(w); return { weekNo: w.weekNo, m: sessionsWithPain(upTo.filter((p) => p.date >= from && p.date <= to)) }; });
  if (now.size === 0) {
    out.push(sig("joints.trend", "joints", "good", "No joint complaints", "No joint complaints.", ["J-PAINRULE"]));
  } else {
    for (const [site, e] of now) {
      const k = e.sessions.size;
      const avg = prev.length ? prev.reduce((s, x) => s + (x.m.get(site)?.sessions.size ?? 0), 0) / prev.length : 0;
      const c1 = prev.find((x) => x.weekNo === ctx.weekNo - 1)?.m.get(site)?.sessions.size ?? 0;
      const c2 = prev.find((x) => x.weekNo === ctx.weekNo - 2)?.m.get(site)?.sessions.size ?? 0;
      const metric = { label: "Sessions with pain", value: String(k), target: avg.toFixed(1) };
      const rising2 = k >= 2 && k > c1 && c1 > c2 && prev.some((x) => x.weekNo === ctx.weekNo - 2);
      const target = rising2 ? deloadTarget(ctx) : null;
      if (target != null) {
        out.push(sig(`joints.trend.${site}`, "joints", "act", "Joint aches rising: deload",
          `${cap(siteName(site))} aches rose two weeks running (${c2} → ${c1} → ${k} sessions). Take the deload now; the plan allows it early.`,
          ["J-PAINRULE", "P-DELOAD", ...siteWhy(site)], { metric, action: { kind: "deload_now", weekNo: target } }));
      } else if (k >= 2 && k > avg) {
        out.push(sig(`joints.trend.${site}`, "joints", "watch", `${cap(siteName(site))} aches rising`,
          `${cap(siteName(site))} aches are more frequent (${k} sessions this week).`, ["J-PAINRULE", ...siteWhy(site)], { metric }));
      }
    }
  }

  out.push(...cutSetsSignals(ctx, upTo));
  const block = shoulderBlockBack(ctx, week);
  if (block) out.push(block);
  const alt = hammerCurlOffer(ctx);
  if (alt) out.push(alt);

  return { signals: out, numbers: { pain: [...now].map(([site, e]) => ({ site, sessions: e.sessions.size, sharp: e.sharp })) } };
}

/** The monthly elbow check's total (note JSON { worst, grip, daily, total }), or null. */
function monthlyTotal(p: PainCheck): number | null {
  try {
    const t = (JSON.parse(p.note ?? "{}") as { total?: unknown }).total;
    return typeof t === "number" ? t : null;
  } catch {
    return null;
  }
}

/**
 * R2-16 (DECISIONS 2026-10-23/24): the shoulder care block was dropped; it comes back when the elbow flares (≥ 4/10
 * during a set or a morning flare this week) or the monthly elbow score rises against the previous check. Cuff and
 * shoulder-blade work helped chronic lateral elbow pain in an RCT (Tiryaki 2026). Information for Mario; no auto-change.
 */
function shoulderBlockBack(ctx: WeekCtx, week: readonly PainCheck[]): Signal | null {
  const { data } = ctx;
  const elbow = week.filter((p) => isElbowSite(p.site));
  const flare = elbow.some((p) => (duringScore(p) ?? 0) >= PAIN_HOLD || (p.morning_score != null && isMorningFlare(p, data.pain)));
  const monthly = data.pain.filter((p) => p.site === ELBOW_MONTHLY_SITE && p.date <= ctx.asOf && monthlyTotal(p) != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const [prev, last] = monthly.slice(-2);
  const rising = prev && last && last.date >= ctx.from && monthlyTotal(last)! > monthlyTotal(prev)!;
  if (!flare && !rising) return null;
  const why = rising ? `monthly elbow score up (${monthlyTotal(prev!)} → ${monthlyTotal(last!)})` : "elbow pain at 4/10 or more this week";
  return sig("joints.shoulder_block", "joints", "watch", "Bring back the shoulder block",
    `${cap(why)}. Add the shoulder care block back on Tue and Sat: cable external rotation and serratus punch, 2 × 12–15, not to failure (about 5 min).`,
    ["J-SHOULDER", "J-ELBOW", "J-PAINRULE"]);
}

/**
 * The week a "deload now" goes to: this week if most of it is still ahead (before Thursday), else next week;
 * only a training week (a deload or taper next week anyway → null). An applied deload_now keeps its week.
 */
function deloadTarget(ctx: WeekCtx): number | null {
  const { data, weekNo } = ctx;
  const applied = data.adjustments.find((a) => a.data.kind === "deload_now" && (a.data.weekNo === weekNo || a.data.weekNo === weekNo + 1));
  if (applied?.data.kind === "deload_now") return applied.data.weekNo;
  const target = ctx.complete || isoWeekday(ctx.today) >= 4 ? weekNo + 1 : weekNo;
  const tw = data.plan.weeks.find((w) => w.weekNo === target);
  return tw && TRAINING_WEEK.has(tw.type) ? target : null;
}

/**
 * E14 trend: a site's weekly mean morning score rose two weeks running (three plan weeks, each with a morning
 * score) → cut the sets of the exercise behind the latest morning score by a third for 2 weeks, plus the red flags.
 */
function cutSetsSignals(ctx: WeekCtx, upTo: readonly PainCheck[]): Signal[] {
  const { data } = ctx;
  const out: Signal[] = [];
  const weeks = [ctx.weekNo - 2, ctx.weekNo - 1, ctx.weekNo].map((n) => data.plan.weeks.find((w) => w.weekNo === n));
  if (weeks.some((w) => !w)) return out;
  const sites = new Set(upTo.filter((p) => p.morning_score != null).map((p) => p.site));
  for (const site of sites) {
    const means = weeks.map((w) => {
      const { from, to } = weekBounds(w!);
      const xs = upTo.filter((p) => p.site === site && p.morning_score != null && p.date >= from && p.date <= to).map((p) => Number(p.morning_score));
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    });
    if (means.some((m) => m == null) || !(means[1]! > means[0]! && means[2]! > means[1]!)) continue;
    const latest = upTo.filter((p) => p.site === site && p.morning_score != null && p.exercise_id).at(-1);
    const key = latest?.exercise_id ? data.keyOf.get(latest.exercise_id) : undefined;
    if (!latest || !key) continue;
    const running = data.adjustments.some((a) => a.data.kind === "cut_sets" && a.data.exerciseKey === key && a.data.until >= ctx.asOf);
    if (running) continue;
    const until = addDays(ctx.asOf, 14);
    const name = lcFirst(exerciseLabel(data, key, latest.exercise_id));
    out.push(sig(`joints.cut_sets.${key}`, "joints", "act", `${cap(siteName(site))} mornings rising`,
      `${cap(siteName(site))} mornings rose two weeks running (${means.map((m) => fmtNum(m!, 1)).join(" → ")}/10). Cut ${name} sets by a third until ${fmtShortDate(until)}. ${RED_FLAG_REMINDER}`,
      ["J-PAINRULE", "J-REDFLAGS", ...siteWhy(site)], { action: { kind: "cut_sets", exerciseKey: key, fraction: 1 / 3, until } }));
  }
  return out;
}

/** Days of elbow pain at 0–3 before the incline hammer curl is offered (E23). */
export const HAMMER_CURL_AFTER_DAYS = 28;

/**
 * E23: after 4 weeks of elbow pain at 0–3 (no elbow check at 4/10 or more, no old sharp/sore), offer the seated
 * high-incline hammer curl as an alternative to Saturday's cable curl (info, with a swap action). Not a default.
 */
function hammerCurlOffer(ctx: WeekCtx): Signal | null {
  const { data } = ctx;
  const slot = data.plan.alternativeSlots?.incline_hammer_curl;
  if (!slot || !data.program || ctx.asOf < addDays(data.start, HAMMER_CURL_AFTER_DAYS) || ctx.asOf > data.end) return null;
  const from = addDays(ctx.asOf, -(HAMMER_CURL_AFTER_DAYS - 1));
  const bad = data.pain.some((p) => isElbowSite(p.site) && p.date >= from && p.date <= ctx.asOf
    && (Math.max(duringScore(p) ?? 0, Number(p.morning_score ?? 0)) >= PAIN_HOLD || p.next_morning === "sore"));
  if (bad) return null;
  const [lo, hi] = slot.scheme!.repRange;
  return sig("joints.alternative.single_arm_cable_curl", "joints", "info", "Incline hammer curl allowed",
    `Elbow at 0–3/10 for 4 weeks: the ${swapLabel("incline_hammer_curl")} (start ${slot.startLoad} kg, ${lo}–${hi} reps) may replace the single-arm cable curl on Saturday. Optional; back to the cable curl if the elbow climbs past 3.`,
    ["J-ELBOW", "J-SWAPS", "P-EXERCISE"],
    { action: { kind: "swap", exerciseKey: "single_arm_cable_curl", to: "incline_hammer_curl", until: data.end, startLoad: slot.startLoad, unit: slot.unit } });
}

/**
 * Shown in the Joints detail only (J-REDFLAGS, three tiers). Mario declined a fysio visit; the triggers stay as
 * safety advice.
 */
export const JOINT_RED_FLAGS: Signal = sig("joints.redflags", "joints", "info", "When to see someone",
  "112 or the out-of-hours GP now: sudden severe shoulder pain with chest pain, breathlessness, sweating or nausea; a hot, red, swollen joint with fever. GP within days: weakness after a pop, an elbow that locks or won't straighten, numbness or tingling, pain into the forearm or hand, swelling, or pain at night.",
  ["J-REDFLAGS"]);

const SCALE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/**
 * joints.prompt (morning, before 12:00): pain (≥ 1/10, or the old ache/sharp) logged yesterday or at the last
 * session, with no morning answer yet. Sharp first. Answer 0–10 with answerPainCheck().
 */
export function painPromptCue(data: CoachData, today: string, nowHour: number): DailyCue | null {
  if (nowHour >= 12) return null;
  const yesterday = addDays(today, -1);
  const lastSession = data.sessions.filter((s) => s.date < today && s.status === "completed").at(-1)?.date;
  const open = data.pain.filter((p) => (p.date === yesterday || p.date === lastSession) && p.site !== ELBOW_MONTHLY_SITE && hurtDuring(p)
    && p.next_morning == null && p.morning_score == null);
  if (!open.length) return null;
  const p = [...open].sort((a, b) => Number(isSharp(b)) - Number(isSharp(a)) || b.created_at.localeCompare(a.created_at))[0]!;
  const key = p.exercise_id ? data.keyOf.get(p.exercise_id) : undefined;
  const what = p.exercise_id ? lcFirst(exerciseLabel(data, key, p.exercise_id)) : "your last session";
  const when = p.date === yesterday ? "yesterday" : `on ${WEEKDAY[isoWeekday(p.date) - 1]}`;
  return {
    id: "joints.prompt", tone: "warm",
    text: `${cap(siteName(p.site))} after ${what} ${when}: how is it this morning (0–10)?`,
    prompt: { kind: "pain_next_morning", painCheckId: p.id, site: p.site, options: SCALE, baseline: morningBaseline(data.pain, p.site, p.date) }
  };
}

/** Part U: the monthly elbow check is due when none was logged in the last 28 days (plan running, mornings). */
export function elbowMonthlyCue(data: CoachData, today: string, nowHour: number): DailyCue | null {
  if (!data.program || today < data.start || today > data.end || nowHour >= 12) return null;
  const recent = data.pain.some((p) => p.site === ELBOW_MONTHLY_SITE && p.date > addDays(today, -28) && p.date <= today);
  return recent ? null : {
    id: "joints.elbow_monthly", tone: "plain", input: "elbow_monthly",
    text: "Monthly elbow check: worst pain this week, pain when gripping, trouble with daily tasks (0–10 each)."
  };
}
