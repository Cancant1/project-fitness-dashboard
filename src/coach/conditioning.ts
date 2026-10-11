// §4.8 Conditioning: Wednesday ride, Thursday boxing (+ the "gassed" rating, E22), Sunday rounds against the
// adjusted week.

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
  const ride = p("easy_ride");
  const rounds = p("rounds");

  const rideRows = rows.filter((c) => c.kind === "ride");
  const rideMin = rideRows.reduce((s, c) => s + Number(c.minutes ?? 0), 0);
  const rideTarget = ride?.minutes ?? null;
  const boxingRow = rows.filter((c) => c.kind === "boxing").at(-1);
  const boxing = boxingRow != null;
  const roundsRow = rows.filter((c) => c.kind === "rounds").at(-1);
  const roundsTarget = rounds && !rounds.skipped ? rounds.rounds ?? null : null;
  const rule = data.plan.days.find((d) => d.key === "rounds")?.conditioning as RoundsRule | undefined;
  const roundsDone = roundsRow?.rounds != null ? Number(roundsRow.rounds) : null;
  const roundsNext = roundsDone != null && rule
    ? roundsRow!.first_round_count != null && roundsRow!.last_round_count != null
      ? roundsNextWeek(roundsDone, Number(roundsRow!.first_round_count), Number(roundsRow!.last_round_count), rule.maxRounds, rule.dropOffFraction)
      : Math.min(rule.maxRounds, roundsDone)
    : roundsTarget;

  const done = [rideRows.length > 0 || !ride, boxing || !p("boxing"), roundsRow != null || roundsTarget == null];
  const missing = done.filter((x) => !x).length;
  const bursts = rounds?.burstRounds ? `, ${rounds.burstRounds} burst` : "";
  const text = `Ride ${fmtNum(rideMin, 0)}/${rideTarget ?? "–"} min · boxing ${boxing ? "✓" : "–"} · rounds ${roundsDone ?? "–"}${bursts} (next week ${roundsNext ?? "–"}).`;
  const why: Signal["why"] = ["C-CONCURRENT", "C-ROUNDS"];
  const signals: Signal[] = [];
  if (ctx.days.length) {
    if (missing === 0) signals.push(sig("conditioning.week", "conditioning", "good", "Conditioning done", text, why));
    else if (!ctx.complete) signals.push(sig("conditioning.week", "conditioning", "pending", "Conditioning so far", text, why));
    else signals.push(sig("conditioning.week", "conditioning", "info", missing === 1 ? "One conditioning day missed" : "Conditioning days missed", text, why));
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
    const roundsProgress = (data.state.sundayRounds ?? startRounds) > startRounds;
    const metric = { label: "Gassed (1–5)", value: String(last), series: ratings.map((r) => Number(r.rating)) };
    if (ratings.length >= 2 && last < first) {
      signals.push(sig("conditioning.gassed", "conditioning", "good", "Less gassed", `Gassed ${first} → ${last}: working.`, gWhy, { metric }));
    } else if (ratings.length >= 2 && ctx.weekNo >= PACING_TIP_FROM_WEEK && roundsProgress) {
      signals.push(sig("conditioning.gassed", "conditioning", "info", "Fading may be pacing",
        `Gassed ${first} → ${last}${fade} while the Sunday rounds progress. Fading may be pacing: round 1 at ~80%, breathe out on punches.`, gWhy, { metric }));
    } else {
      signals.push(sig("conditioning.gassed", "conditioning", "info", "Gassed rating", `Gassed ${last}/5${fade}.`, gWhy, { metric }));
    }
  }

  return {
    signals,
    numbers: {
      conditioning: {
        rideMin, rideTarget, boxing, rounds: roundsDone, roundsTarget, roundsNext,
        gassed: boxingRow?.rating != null ? Number(boxingRow.rating) : null,
        fadeRound: boxingRow?.rating != null && boxingRow.rounds != null ? Number(boxingRow.rounds) : null
      }
    }
  };
}
