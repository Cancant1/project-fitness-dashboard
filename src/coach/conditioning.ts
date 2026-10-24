// §4.8 Conditioning: Thursday boxing (+ the "gassed" rating, E22) and the free-day notes (Wed, Sun; the ride and the
// rounds were dropped on 24 Oct 2026). Ride and rounds rules, if a plan still has them, are judged as before.

import { addDays, fmtNum } from "../lib/format";
import { roundsNextWeek } from "../plan/engine";
import type { RoundsRule } from "../plan/types";
import { sig, type AreaResult, type WeekCtx } from "./common";
import type { Signal } from "./types";

/** E22: the gassed trend looks back this many days (6 weeks). */
const GASSED_WINDOW_DAYS = 42;
/** E22: from this plan week an unchanged gassed rating (while the rounds progress) gets the pacing tip. */
const PACING_TIP_FROM_WEEK = 8;

export function conditioningRules(ctx: WeekCtx): AreaResult {
  const { data } = ctx;
  const rows = data.conditioning.filter((c) => c.date >= ctx.from && c.date <= ctx.asOf && c.done);
  const p = (key: string) => ctx.days.find((d) => d.dayKey === key)?.conditioning;
  const ride = p("easy_ride")?.kind === "ride" ? p("easy_ride") : undefined;
  const rounds = p("rounds")?.kind === "rounds" ? p("rounds") : undefined;
  // Free days: an "other" row with his note (home-task ticks carry their task id instead).
  const notes = rows.filter((c) => c.kind === "other" && !!c.note && c.note !== "wrist_ladder");
  const freeMin = notes.reduce((s, c) => s + Number(c.minutes ?? 0), 0);

  const rideRows = rows.filter((c) => c.kind === "ride");
  const rideMin = rideRows.reduce((s, c) => s + Number(c.minutes ?? 0), 0);
  const rideTarget = ride?.minutes ?? null;
  const boxingRow = rows.filter((c) => c.kind === "boxing").at(-1);
  const boxing = boxingRow != null;
  const roundsRow = rows.filter((c) => c.kind === "rounds").at(-1);
  const roundsTarget = rounds && !rounds.skipped ? rounds.rounds ?? null : null;
  const roundsRule = data.plan.days.find((d) => d.key === "rounds")?.conditioning;
  const rule = roundsRule?.kind === "rounds" ? roundsRule as RoundsRule : undefined;
  const roundsDone = roundsRow?.rounds != null ? Number(roundsRow.rounds) : null;
  const roundsNext = roundsDone != null && rule
    ? roundsRow!.first_round_count != null && roundsRow!.last_round_count != null
      ? roundsNextWeek(roundsDone, Number(roundsRow!.first_round_count), Number(roundsRow!.last_round_count), rule.maxRounds, rule.dropOffFraction)
      : Math.min(rule.maxRounds, roundsDone)
    : roundsTarget;

  const done = [rideRows.length > 0 || !ride, boxing || !p("boxing"), roundsRow != null || roundsTarget == null];
  const missing = done.filter((x) => !x).length;
  const bursts = rounds?.burstRounds ? `, ${rounds.burstRounds} burst` : "";
  const freeText = `${notes.length} free-day ${notes.length === 1 ? "note" : "notes"}${freeMin ? ` (${fmtNum(freeMin, 0)} min)` : ""}`;
  const text = ride || rounds
    ? `Ride ${fmtNum(rideMin, 0)}/${rideTarget ?? "–"} min · boxing ${boxing ? "✓" : "–"} · rounds ${roundsDone ?? "–"}${bursts} (next week ${roundsNext ?? "–"}).`
    : `Boxing ${boxing ? "✓" : "–"} · ${freeText}.`;
  const why: Signal["why"] = ride || rounds ? ["C-CONCURRENT", "C-ROUNDS"] : ["C-CONCURRENT"];
  const signals: Signal[] = [];
  if (ctx.days.length) {
    if (missing === 0) signals.push(sig("conditioning.week", "conditioning", "good", ride || rounds ? "Conditioning done" : "Boxing done", text, why));
    else if (!ctx.complete) signals.push(sig("conditioning.week", "conditioning", "pending", "Conditioning so far", text, why));
    else signals.push(sig("conditioning.week", "conditioning", "info", ride || rounds ? (missing === 1 ? "One conditioning day missed" : "Conditioning days missed") : "No boxing this week", text, why));
  }

  // conditioning.gassed (E22): the Thursday "gassed" rating over the last 6 weeks.
  const ratings = data.conditioning
    .filter((c) => c.kind === "boxing" && c.rating != null && c.date <= ctx.asOf && c.date > addDays(ctx.asOf, -GASSED_WINDOW_DAYS))
    .sort((a, b) => a.date.localeCompare(b.date));
  const gWhy: Signal["why"] = ["C-SPARRING", "C-ROUNDS"];
  const lastR = ratings.at(-1);
  if (lastR) {
    const first = Number(ratings[0]!.rating);
    const last = Number(lastR.rating);
    const fade = lastR.rounds != null ? ` (faded in round ${lastR.rounds})` : "";
    const startRounds = rule?.startRounds ?? 6;
    // Without a rounds rule (dropped 24 Oct 2026) an unchanged rating by week 8 is enough for the pacing tip.
    const roundsProgress = rule ? (data.state.sundayRounds ?? startRounds) > startRounds : true;
    const metric = { label: "Gassed (1–5)", value: String(last), series: ratings.map((r) => Number(r.rating)) };
    if (ratings.length >= 2 && last < first) {
      signals.push(sig("conditioning.gassed", "conditioning", "good", "Less gassed", `Gassed ${first} → ${last}: working.`, gWhy, { metric }));
    } else if (ratings.length >= 2 && ctx.weekNo >= PACING_TIP_FROM_WEEK && roundsProgress) {
      signals.push(sig("conditioning.gassed", "conditioning", "info", "Fading may be pacing",
        `Gassed ${first} → ${last}${fade}${rule ? " while the Sunday rounds progress" : ""}. Fading may be pacing: round 1 at ~80%, breathe out on punches.`, gWhy, { metric }));
    } else {
      signals.push(sig("conditioning.gassed", "conditioning", "info", "Gassed rating", `Gassed ${last}/5${fade}.`, gWhy, { metric }));
    }
  }

  return {
    signals,
    numbers: {
      conditioning: {
        rideMin, rideTarget, boxing, rounds: roundsDone, roundsTarget, roundsNext, freeNotes: notes.length, freeMin,
        gassed: boxingRow?.rating != null ? Number(boxingRow.rating) : null,
        fadeRound: boxingRow?.rating != null && boxingRow.rounds != null ? Number(boxingRow.rounds) : null
      }
    }
  };
}
