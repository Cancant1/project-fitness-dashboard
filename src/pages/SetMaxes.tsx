import { useState } from "react";
import { useStore } from "../data/store";
import type { Program } from "../data/types";
import { parseDecimal, todayIso } from "../lib/format";
import { trainingMaxFromSet } from "../plan/engine";
import { ensurePlanExercises } from "../plan/bridge";

/** Shown when the plan needs a training max that isn't known yet (calibration skipped or not logged here). */
export function SetMaxes({ message, ids, program }: { message: string; ids: Map<string, string>; program: Program }) {
  const { local } = useStore();
  const [vals, setVals] = useState({ squatLoad: "", squatReps: "", dlLoad: "", dlReps: "" });
  const squat = calc(vals.squatLoad, vals.squatReps);
  const dl = calc(vals.dlLoad, vals.dlReps);

  async function save() {
    const all = await ensurePlanExercises(local);
    const rows = [
      squat != null && { exercise_id: all.get("squat") ?? ids.get("squat"), value_kg: squat },
      dl != null && { exercise_id: all.get("deadlift") ?? ids.get("deadlift"), value_kg: dl }
    ].filter(Boolean) as { exercise_id: string; value_kg: number }[];
    await local.save("training_maxes", rows.map((r) => ({ ...r, program_id: program.id, effective_date: todayIso(), reason: "manual" as const, source_set_id: null, note: "entered from a recent set" })));
  }

  return (
    <section className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600 }}>Training max needed</h2>
      <p className="row-sub" style={{ fontSize: 15 }}>
        {message.includes("squat") || message.includes("deadlift") ? "The calibration rep-outs aren't logged here yet. " : ""}
        Enter your most recent hard set for each lift; the app sets the training max as load × (1 + reps/30), rounded down to 2.5 kg.
      </p>
      {([["Squat", "squatLoad", "squatReps", squat], ["Deadlift", "dlLoad", "dlReps", dl]] as const).map(([label, l, r, tm]) => (
        <div key={label} style={{ display: "grid", gridTemplateColumns: "84px 1fr 1fr", gap: 8, alignItems: "center" }}>
          <span>{label}</span>
          <label className="field"><span className="sr-only">{label} load</span><input inputMode="decimal" placeholder="kg" value={vals[l]} onChange={(e) => setVals({ ...vals, [l]: e.target.value })} /><span className="field-suffix">kg</span></label>
          <label className="field"><span className="sr-only">{label} reps</span><input inputMode="numeric" placeholder="reps" value={vals[r]} onChange={(e) => setVals({ ...vals, [r]: e.target.value })} /><span className="field-suffix">{tm != null ? `→ ${tm}` : "reps"}</span></label>
        </div>
      ))}
      <button className="btn btn-primary" disabled={squat == null && dl == null} onClick={() => void save()}>Save training max</button>
    </section>
  );
}

function calc(load: string, reps: string): number | null {
  const l = parseDecimal(load);
  const r = parseDecimal(reps);
  return l != null && r != null && r >= 1 && r <= 15 ? trainingMaxFromSet(l, r) : null;
}
