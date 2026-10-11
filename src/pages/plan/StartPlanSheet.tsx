import { useState } from "react";
import type { LocalStore } from "../../data/local";
import { useRows, useStore } from "../../data/store";
import { fmtShortDate } from "../../lib/format";
import { PLAN, PLAN_KEY, ensurePlanExercises, findExercise } from "../../plan/bridge";
import { Sheet } from "../../ui/Sheet";

/** Same as TodayPage.startPlan: makes sure the plan's exercises exist, then creates the programme row. */
export async function startPlan(local: LocalStore): Promise<void> {
  await ensurePlanExercises(local);
  await local.save("programs", {
    name: "Strength Return Plan", start_date: PLAN.weeks[0]!.startDate, weeks: PLAN.weeks.length, status: "active",
    rules: { key: PLAN_KEY }, goals: [], notes: null
  });
}

export function StartPlanSheet({ onClose }: { onClose: () => void }) {
  const { local } = useStore();
  const exercises = useRows("exercises");
  const [busy, setBusy] = useState(false);
  const missing = Object.values(PLAN.exercises).filter((d) => !findExercise(exercises, d.key)).length;

  return (
    <Sheet title="Start the plan" onClose={onClose}>
      <div className="k-card k-rows pl-start-facts">
        <div className="k-row"><span className="k-muted">Week 0</span><span className="k-num">Mon {fmtShortDate(PLAN.weeks[0]!.startDate)}</span></div>
        <div className="k-row"><span className="k-muted">Sets your maxes</span><span className="k-num">1 rep-out per lift</span></div>
        <div className="k-row"><span className="k-muted">New exercises</span><span className="k-num">{missing || "None"}</span></div>
      </div>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true);
        await startPlan(local);
        setBusy(false);
        onClose();
      }}>Start the plan</button>
      <button type="button" className="btn btn-plain" onClick={onClose}>Not yet</button>
    </Sheet>
  );
}
