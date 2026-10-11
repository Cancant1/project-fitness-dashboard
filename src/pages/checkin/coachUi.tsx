// Shared coach pieces for the Check-in page and Today: status dots, verdict words, the Apply button with
// an inline confirm step, and the applied state with Undo. The rules live in src/coach (React-free).

import { useState } from "react";
import { useRows, useStore } from "../../data/store";
import { fmtShortDate } from "../../lib/format";
import { activeProgram } from "../../plan/bridge";
import { adjustmentsOf, applyCoachAction, removeAdjustment, swapLabel } from "../../coach";
import type { CoachAction, Signal, Status, Verdict } from "../../coach";
import "./checkin.css";

export const VERDICT_WORD: Record<Verdict, string> = { on_track: "On track", watch: "Watch", adjust: "Adjust", too_early: "Too early" };

/** Dot colour key for a verdict (same scale as signal statuses). */
export const VERDICT_TONE: Record<Verdict, Tone> = { on_track: "good", watch: "watch", adjust: "act", too_early: "info" };

export type Tone = Status | "none" | "warm" | "plain";

/** Small status dot: good = green, watch = soft red, act = red, the rest neutral. */
export function Dot({ tone, size = 10 }: { tone: Tone; size?: number }) {
  return <i className="ci-dot" data-tone={tone} style={{ width: size, height: size }} aria-hidden="true" />;
}

const RANK: Record<Status, number> = { act: 4, watch: 3, good: 2, pending: 1, info: 0 };

/** The status that sums up a group of signals: act > watch > good > pending > info. */
export function worstStatus(signals: readonly Signal[]): Status | "none" {
  if (!signals.length) return "none";
  return signals.reduce<Status>((w, s) => (RANK[s.status] > RANK[w] ? s.status : w), "info");
}

const sign = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
const MUSCLE: Record<string, string> = { side_delts: "side delts", rear_delts: "rear delts", front_delts: "front delts", rotator_cuff: "rotator cuff" };
const LIFT: Record<string, string> = { squat: "squat", deadlift: "deadlift", incline_db_press: "incline DB", weighted_pullup: "pull-up" };

/** What an action changes, in a few words (shown in the confirm step). */
export function actionLabel(a: CoachAction): string {
  switch (a.kind) {
    case "kcal": return `${sign(a.delta)} kcal from ${fmtShortDate(a.from)}`;
    case "deload_now": return `Week ${a.weekNo} becomes a deload`;
    case "extra_sets": return `+1 set: ${a.muscles.map((m) => MUSCLE[m] ?? m).join(", ")}`;
    case "main_lift_set": return `+1 set: ${a.lifts.map((l) => LIFT[l] ?? l).join(", ")}`;
    case "repeat_week": return `Repeat week ${a.missedWeekNo}`;
    case "skip_deload": return `Week ${a.weekNo} becomes a training week`;
    case "tm_reduce": return `Both training maxes −${a.percent}%`;
    case "recalibrate": return "Calibration rep-outs at 75% of your last TM";
    case "swap": return `Swap to ${swapLabel(a.to)} until ${fmtShortDate(a.until)}`;
    case "cut_sets": return `${swapLabel(a.exerciseKey)}: sets −${Math.round(a.fraction * 100)}% until ${fmtShortDate(a.until)}`;
  }
}

/** Kinds whose Apply writes rows (a nutrition target, training maxes) that Undo would not remove. */
const WRITES_ROWS = new Set<CoachAction["kind"]>(["kcal", "tm_reduce"]);

/** "… Applied 12 Oct." → the message without its applied suffix (shown as a pill instead). */
export const withoutApplied = (message: string) => message.replace(/\s*Applied \d{1,2} \w{3,4}\.$/, "");

/**
 * Apply with a second tap: Apply → "+100 kcal from 19 Oct" with Confirm / Cancel. The coach's report
 * re-computes on the write, so the row switches to its applied state by itself; `onDone` gets the toast text.
 */
export function ApplyButton({ action, signalId, today, onDone }: { action: CoachAction; signalId: string; today: string; onDone?: (message: string) => void }) {
  const { local } = useStore();
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  if (step === "idle") {
    return <button type="button" className="btn btn-tinted ci-btn" onClick={() => setStep("confirm")}>Apply</button>;
  }
  return (
    <div className="ci-confirm" role="group" aria-label="Confirm change">
      <span className="ci-confirm-what">{actionLabel(action)}</span>
      <div className="ci-confirm-btns">
        <button type="button" className="btn btn-primary ci-btn" disabled={step === "busy"} onClick={async () => {
          setStep("busy");
          const r = await applyCoachAction(local, action, { signalId, today });
          setStep("idle");
          onDone?.(r.ok ? `Applied · ${r.message}` : r.message);
        }}>Confirm</button>
        <button type="button" className="btn btn-plain ci-btn" disabled={step === "busy"} onClick={() => setStep("idle")}>Cancel</button>
      </div>
    </div>
  );
}

/**
 * The applied state of a signal or adjustment: "Applied 12 Oct" and Undo. Undo also takes back the calorie
 * target or training-max rows an action wrote (see removeAdjustment).
 */
export function AppliedLine({ applied, onDone }: { applied: NonNullable<Signal["applied"]>; onDone?: (message: string) => void }) {
  const { local } = useStore();
  const programs = useRows("programs");
  const [busy, setBusy] = useState(false);
  const program = activeProgram(programs);
  const adj = (program ? adjustmentsOf(program.rules) : []).find((a) => a.id === applied.adjustmentId);
  // Calorie and training-max changes can be undone when they recorded the rows they wrote (older ones can't).
  const undoable = adj != null && (!WRITES_ROWS.has(adj.kind) || (adj.writes?.length ?? 0) > 0);
  return (
    <div className="ci-applied">
      <span className="k-pill k-pill-good">Applied {fmtShortDate(applied.created.slice(0, 10))}</span>
      {undoable && (
        <button type="button" className="btn btn-plain ci-btn" disabled={busy} onClick={async () => {
          setBusy(true);
          const ok = await removeAdjustment(local, applied.adjustmentId);
          setBusy(false);
          onDone?.(ok ? "Undone." : "Already removed.");
        }}>Undo</button>
      )}
    </div>
  );
}
