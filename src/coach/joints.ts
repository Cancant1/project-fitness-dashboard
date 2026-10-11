// §4.6 Joints: the pain rule from Part 1.
// 1. An ache during a set is fine. 2. Sharp pain, or pain that changes form, ends that exercise for the day.
// 3. Sore the next morning, or worse at the next session: one step down the swap list for 2 weeks.

import type { PainCheck } from "../data/types";
import { addDays, fmtShortDate } from "../lib/format";
import { isoWeekday } from "../plan/engine";
import { nextSwap, swapLabel } from "../plan/swaps";
import { WEEKDAY, cap, exerciseLabel, lcFirst, sig, siteName, weekBounds, type AreaResult, type WeekCtx } from "./common";
import type { CoachData } from "./data";
import type { DailyCue, Signal } from "./types";

const siteWhy = (site: string): Signal["why"] =>
  site.includes("elbow") ? ["J-ELBOW"] : site.includes("shoulder") ? ["J-SHOULDER"] : [];

const hurt = (p: PainCheck) => p.during_set === "ache" || p.during_set === "sharp";

/** Distinct sessions (or days, for checks without a session) with an ache or sharp pain, per site. */
function sessionsWithPain(checks: readonly PainCheck[]): Map<string, { sessions: Set<string>; sharp: number }> {
  const m = new Map<string, { sessions: Set<string>; sharp: number }>();
  for (const p of checks) {
    if (!hurt(p)) continue;
    const e = m.get(p.site) ?? { sessions: new Set<string>(), sharp: 0 };
    e.sessions.add(p.session_id ?? p.date);
    if (p.during_set === "sharp") e.sharp++;
    m.set(p.site, e);
  }
  return m;
}

export function jointsRules(ctx: WeekCtx): AreaResult {
  const { data } = ctx;
  const out: Signal[] = [];
  const upTo = data.pain.filter((p) => p.date <= ctx.asOf);

  // joints.swap: sore next morning or worse at the next session, last 14 days, no swap running.
  const since = addDays(ctx.asOf, -13);
  const latestByKey = new Map<string, PainCheck>();
  for (const p of upTo) {
    if (p.date < since || !p.exercise_id || !(p.next_morning === "sore" || p.worse_than_last === true)) continue;
    const key = data.keyOf.get(p.exercise_id) ?? p.exercise_id;
    latestByKey.set(key, p);
  }
  for (const [key, p] of latestByKey) {
    const running = data.adjustments.some((a) => a.data.kind === "swap" && a.data.exerciseKey === key && a.data.until >= ctx.asOf);
    if (running) continue;
    const name = lcFirst(exerciseLabel(data, key, p.exercise_id));
    const site = cap(siteName(p.site));
    const word = p.next_morning === "sore" ? "sore" : "worse";
    const to = nextSwap(key, p.site);
    const why: Signal["why"] = ["J-PAINRULE", "J-SWAPS", ...siteWhy(p.site)];
    if (to) {
      const until = addDays(p.date, 14);
      out.push(sig(`joints.swap.${key}`, "joints", "act", `Swap to ${swapLabel(to)}`,
        `${site} ${word} after ${name}. Swap to ${swapLabel(to)} for 2 weeks (until ${fmtShortDate(until)}).`, why,
        { action: { kind: "swap", exerciseKey: key, to, until } }));
    } else {
      out.push(sig(`joints.swap.${key}`, "joints", "watch", `${site} ${word}, no swap`,
        `${site} ${word} after ${name}. It has no swap on the list: go lighter there next time.`, why));
    }
  }

  // joints.sharp: any sharp pain this week (the latest per site).
  const week = upTo.filter((p) => p.date >= ctx.from);
  const sharpBySite = new Map<string, PainCheck>();
  for (const p of week) if (p.during_set === "sharp") sharpBySite.set(p.site, p);
  for (const [site, p] of sharpBySite) {
    const name = lcFirst(exerciseLabel(data, p.exercise_id ? data.keyOf.get(p.exercise_id) : undefined, p.exercise_id));
    out.push(sig(`joints.sharp.${site}`, "joints", "watch", "Sharp pain logged",
      `Sharp pain in ${siteName(site)} during ${name} on ${WEEKDAY[isoWeekday(p.date) - 1]}. That exercise stopped for the day — right call.`,
      ["J-PAINRULE", ...siteWhy(site)]));
  }

  // joints.trend: sessions with an ache this week vs the average of the 3 weeks before (plan weeks only).
  const now = sessionsWithPain(week);
  const prevWeeks = data.plan.weeks.filter((w) => w.weekNo < ctx.weekNo && w.weekNo >= ctx.weekNo - 3);
  const prev = prevWeeks.map((w) => { const { from, to } = weekBounds(w); return sessionsWithPain(upTo.filter((p) => p.date >= from && p.date <= to)); });
  if (now.size === 0) {
    out.push(sig("joints.trend", "joints", "good", "No joint complaints", "No joint complaints.", ["J-PAINRULE"]));
  } else {
    for (const [site, e] of now) {
      const k = e.sessions.size;
      const avg = prev.length ? prev.reduce((s, m) => s + (m.get(site)?.sessions.size ?? 0), 0) / prev.length : 0;
      if (k >= 2 && k > avg) {
        out.push(sig(`joints.trend.${site}`, "joints", "watch", `${cap(siteName(site))} aches rising`,
          `${cap(siteName(site))} aches are more frequent (${k} sessions this week).`, ["J-PAINRULE", ...siteWhy(site)],
          { metric: { label: "Sessions with an ache", value: String(k), target: avg.toFixed(1) } }));
      }
    }
  }

  return { signals: out, numbers: { pain: [...now].map(([site, e]) => ({ site, sessions: e.sessions.size, sharp: e.sharp })) } };
}

/** Shown in the Joints detail only. */
export const JOINT_RED_FLAGS: Signal = sig("joints.redflags", "joints", "info", "When to see someone",
  "See a GP or fysiotherapeut sooner for: numbness or tingling, swelling, pain at night, weakness, or pain that started with a pop. A fysio needs no referral.",
  ["J-REDFLAGS"]);

/**
 * joints.prompt (morning, before 12:00): an ache or sharp pain logged yesterday or at the last session,
 * with next_morning still empty. Sharp first. Answer with answerPainCheck().
 */
export function painPromptCue(data: CoachData, today: string, nowHour: number): DailyCue | null {
  if (nowHour >= 12) return null;
  const yesterday = addDays(today, -1);
  const lastSession = data.sessions.filter((s) => s.date < today && s.status === "completed").at(-1)?.date;
  const open = data.pain.filter((p) => (p.date === yesterday || p.date === lastSession) && hurt(p) && p.next_morning == null);
  if (!open.length) return null;
  const p = [...open].sort((a, b) => Number(b.during_set === "sharp") - Number(a.during_set === "sharp") || b.created_at.localeCompare(a.created_at))[0]!;
  const key = p.exercise_id ? data.keyOf.get(p.exercise_id) : undefined;
  const what = p.exercise_id ? lcFirst(exerciseLabel(data, key, p.exercise_id)) : "your last session";
  const when = p.date === yesterday ? "yesterday" : `on ${WEEKDAY[isoWeekday(p.date) - 1]}`;
  return {
    id: "joints.prompt", tone: "warm",
    text: `${cap(siteName(p.site))} after ${what} ${when}: how is it this morning?`,
    prompt: { kind: "pain_next_morning", painCheckId: p.id, options: ["normal", "sore"] }
  };
}
