// §4.8 Conditioning: Wednesday ride, Thursday boxing, Sunday rounds against the adjusted week.

import { fmtNum } from "../lib/format";
import { roundsNextWeek } from "../plan/engine";
import type { RoundsRule } from "../plan/types";
import { sig, type AreaResult, type WeekCtx } from "./common";
import type { Signal } from "./types";

export function conditioningRules(ctx: WeekCtx): AreaResult {
  const { data } = ctx;
  const rows = data.conditioning.filter((c) => c.date >= ctx.from && c.date <= ctx.asOf && c.done);
  const p = (key: string) => ctx.days.find((d) => d.dayKey === key)?.conditioning;
  const ride = p("easy_ride");
  const rounds = p("rounds");

  const rideRows = rows.filter((c) => c.kind === "ride");
  const rideMin = rideRows.reduce((s, c) => s + Number(c.minutes ?? 0), 0);
  const rideTarget = ride?.minutes ?? null;
  const boxing = rows.some((c) => c.kind === "boxing");
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
  const text = `Ride ${fmtNum(rideMin, 0)}/${rideTarget ?? "–"} min · boxing ${boxing ? "✓" : "–"} · rounds ${roundsDone ?? "–"} (next week ${roundsNext ?? "–"}).`;
  const why: Signal["why"] = ["C-CONCURRENT", "C-ROUNDS"];
  const signals: Signal[] = [];
  if (ctx.days.length) {
    if (missing === 0) signals.push(sig("conditioning.week", "conditioning", "good", "Conditioning done", text, why));
    else if (!ctx.complete) signals.push(sig("conditioning.week", "conditioning", "pending", "Conditioning so far", text, why));
    else signals.push(sig("conditioning.week", "conditioning", "info", missing === 1 ? "One conditioning day missed" : "Conditioning days missed", text, why));
  }

  return { signals, numbers: { conditioning: { rideMin, rideTarget, boxing, rounds: roundsDone, roundsTarget, roundsNext } } };
}
