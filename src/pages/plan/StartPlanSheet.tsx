import { useState } from "react";
import type { LocalStore } from "../../data/local";
import { useRows, useStore } from "../../data/store";
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
      <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: 15 }}>
        <li>Week 0 starts Monday 12 October: one rep-out per main lift sets your training maxes.</li>
        <li>Today and Workouts then show the plan's sessions.</li>
        <li>{missing ? `Adds ${missing} exercise${missing === 1 ? "" : "s"} that are new to this plan to your library.` : "All plan exercises are already in your library."}</li>
      </ul>
      <button className="btn btn-primary" disabled={busy} onClick={async () => {
        setBusy(true);
        await startPlan(local);
        setBusy(false);
        onClose();
      }}>Start the plan</button>
      <button className="btn btn-plain" onClick={onClose}>Not yet</button>
    </Sheet>
  );
}
