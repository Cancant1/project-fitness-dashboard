import { useMemo, useState } from "react";
import { useRows, useStore } from "../../data/store";
import type { TrainingMax } from "../../data/types";
import { fmtNum, fmtShortDateYear, parseDecimal, todayIso } from "../../lib/format";
import { trainingMaxFromSet } from "../../plan/engine";
import { PLAN, ensurePlanExercises } from "../../plan/bridge";
import type { MainLiftKey } from "../../plan/types";
import { Label, Ring, Segmented } from "../../ui/kit";
import { Sheet } from "../../ui/Sheet";
import { ChevronDown } from "../../ui/icons";
import { EXAMPLE_TMS, GOAL_TM, LIFT_NAME, LIFT_SHORT, type PlanContext } from "./planView";
import "./forms.css";

export const LIFTS = ["squat", "deadlift", "incline_db_press", "weighted_pullup"] as const satisfies readonly MainLiftKey[];
export type Lift = (typeof LIFTS)[number];

const REASON: Record<TrainingMax["reason"], string> = {
  start: "Start", calibration: "Calibration", rep_out: "Rep-out", checkpoint: "Checkpoint", missed_weeks: "Missed weeks", manual: "Manual"
};
const isTm = (l: Lift): l is "squat" | "deadlift" => l === "squat" || l === "deadlift";
const valueText = (lift: Lift, v: number) => (lift === "weighted_pullup" ? `+${fmtNum(v)}` : fmtNum(v));
/** What the ring fills towards: the TM that the 5-rep goal implies, or the goal load. */
const goalOf = (l: Lift) => (isTm(l) ? GOAL_TM[l] : PLAN.goals[l].load);

/** Four dials: squat and deadlift TM, incline and pull-up load, each filling towards its goal. Tap one to set it. */
export function MaxesPanel({ ctx, onSet }: { ctx: PlanContext; onSet: (lift: Lift) => void }) {
  return (
    <section>
      <Label action={<button type="button" onClick={() => onSet("squat")}>Set</button>}>Training maxes</Label>
      <div className="k-card pl-maxes">
        {LIFTS.map((l) => {
          const v = ctx.latest[l];
          const goal = goalOf(l);
          const fallback = isTm(l) ? EXAMPLE_TMS[l] : PLAN.calibrationLoads[l];
          return (
            <button key={l} type="button" className="pl-max" onClick={() => onSet(l)} aria-label={`${LIFT_NAME[l]}: ${v != null ? `${valueText(l, v)} kg` : "not set"}. Set`}>
              <Ring value={v != null ? v / goal : 0} size={92} stroke={9} color="var(--chart-1)" label={`${LIFT_SHORT[l]} towards goal`}>
                <span className="k-num pl-max-v">{v != null ? valueText(l, v) : "—"}</span>
                <span className="pl-max-u">kg</span>
              </Ring>
              <span className="pl-max-name">{LIFT_SHORT[l]}{isTm(l) ? " TM" : ""}</span>
              <span className="pl-max-sub">{v != null ? `goal ${valueText(l, goal)}` : `${isTm(l) ? "example" : "start"} ${valueText(l, fallback)}`}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Manual entry (dated today) plus the history of every change. */
export function SetMaxSheet({ initial, ctx, onClose }: { initial: Lift; ctx: PlanContext; onClose: () => void }) {
  const { local } = useStore();
  const maxes = useRows("training_maxes");
  const [lift, setLift] = useState<Lift>(initial);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [setLoad, setSetLoad] = useState("");
  const [setReps, setSetReps] = useState("");
  const [busy, setBusy] = useState(false);
  const tm = isTm(lift);

  const v = parseDecimal(value);
  const valid = v != null && (lift === "weighted_pullup" ? v >= 0 && v <= 100 : v > 0 && v <= 400);
  const l = parseDecimal(setLoad);
  const r = parseDecimal(setReps);
  const fromSet = tm && l != null && r != null && r >= 1 && r <= 12 && Number.isInteger(r) ? trainingMaxFromSet(l, r) : null;
  const current = ctx.latest[lift];

  const history = useMemo(() => {
    const id = ctx.ids.get(lift);
    return maxes.filter((m) => m.exercise_id === id)
      .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.created_at.localeCompare(a.created_at));
  }, [maxes, ctx.ids, lift]);

  async function save() {
    if (!valid || v == null) return;
    setBusy(true);
    const ids = await ensurePlanExercises(local);
    await local.save("training_maxes", {
      exercise_id: ids.get(lift)!, program_id: ctx.program?.id ?? null, effective_date: todayIso(), value_kg: v,
      reason: "manual", source_set_id: null, note: note.trim() || null
    });
    setBusy(false);
    onClose();
  }

  return (
    <Sheet title={tm ? "Training max" : "Working load"} onClose={onClose}>
      <div className="f-seg-full">
        <Segmented label="Lift" value={lift} options={LIFTS.map((x) => ({ value: x, label: LIFT_SHORT[x] }))}
          onChange={(x) => { setLift(x); setValue(""); setSetLoad(""); setSetReps(""); }} />
      </div>
      <label className="f-label" htmlFor="max-value">
        <span>{tm ? "Training max" : lift === "incline_db_press" ? "Each hand" : "Added on the belt"}</span>
        <span className="field">
          <input id="max-value" inputMode="decimal" className="num" style={{ fontWeight: 600 }}
            placeholder={current != null ? String(current).replace(".", ",") : tm ? String(EXAMPLE_TMS[lift]) : String(PLAN.calibrationLoads[lift]).replace(".", ",")}
            value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="field-suffix">kg</span>
        </span>
      </label>

      {tm && (
        <div className="f-label">
          <span>From a recent set</span>
          <div className="f-pair">
            <label className="field"><span className="sr-only">Set load</span><input inputMode="decimal" placeholder="Load" value={setLoad} onChange={(e) => setSetLoad(e.target.value)} /><span className="field-suffix">kg</span></label>
            <label className="field"><span className="sr-only">Clean reps</span><input inputMode="numeric" placeholder="Reps" value={setReps} onChange={(e) => setSetReps(e.target.value)} /><span className="field-suffix">reps</span></label>
          </div>
          {fromSet != null && (
            <button type="button" className="btn btn-tinted f-use" onClick={() => setValue(String(fromSet).replace(".", ","))}>Use {fmtNum(fromSet)} kg</button>
          )}
          <span className="f-hint">load × (1 + reps ÷ 30), down to 2.5 kg</span>
        </div>
      )}

      <label className="f-label" htmlFor="max-note">
        <span>Note</span>
        <span className="field"><input id="max-note" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} /></span>
      </label>
      <button type="button" className="btn btn-primary" disabled={!valid || busy} onClick={() => void save()}>
        Save {valid && v != null ? `${valueText(lift, v)} kg` : ""}
      </button>

      {history.length > 0 && (
        <details className="pl-more">
          <summary>History · {history.length} <ChevronDown style={{ width: 14, height: 14 }} /></summary>
          <div className="k-card f-history k-rows">
            {history.map((m) => (
              <div className="k-row" key={m.id}>
                <span className="k-row-main">
                  <span>{fmtShortDateYear(m.effective_date)}</span>
                  <span>{REASON[m.reason]}{m.note ? ` · ${m.note}` : ""}</span>
                </span>
                <span className="k-num">{valueText(lift, Number(m.value_kg))} kg</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </Sheet>
  );
}
