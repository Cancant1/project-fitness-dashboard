import { useMemo, useState } from "react";
import { useRows, useStore } from "../../data/store";
import type { TrainingMax } from "../../data/types";
import { fmtNum, fmtShortDateYear, parseDecimal, todayIso } from "../../lib/format";
import { trainingMaxFromSet } from "../../plan/engine";
import { PLAN, ensurePlanExercises } from "../../plan/bridge";
import { Sheet } from "../../ui/Sheet";
import { EXAMPLE_TMS, LIFT_NAME, type PlanContext } from "./planView";

const LIFTS = ["squat", "deadlift", "incline_db_press", "weighted_pullup"] as const;
type Lift = (typeof LIFTS)[number];
const SHORT: Record<Lift, string> = { squat: "Squat", deadlift: "Deadlift", incline_db_press: "Incline DB", weighted_pullup: "Pull-up" };
const REASON: Record<TrainingMax["reason"], string> = {
  start: "Start", calibration: "Calibration", rep_out: "Rep-out", checkpoint: "Checkpoint", missed_weeks: "Missed weeks", manual: "Manual"
};

const valueText = (lift: Lift, v: number) =>
  lift === "weighted_pullup" ? `+${fmtNum(v)}` : fmtNum(v);

/** Current squat/deadlift TM and incline/pull-up loads, their history, and a manual entry. */
export function MaxesPanel({ ctx }: { ctx: PlanContext }) {
  const maxes = useRows("training_maxes");
  const [setting, setSetting] = useState<Lift | null>(null);

  const liftById = useMemo(() => {
    const m = new Map<string, Lift>();
    for (const l of LIFTS) { const id = ctx.ids.get(l); if (id) m.set(id, l); }
    return m;
  }, [ctx.ids]);

  const history = useMemo(() => maxes
    .filter((m) => liftById.has(m.exercise_id))
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.created_at.localeCompare(a.created_at)), [maxes, liftById]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      <section className="card stat-strip" aria-label="Current training maxes">
        {LIFTS.map((l) => {
          const v = ctx.latest[l];
          const goal = PLAN.goals[l];
          const isTm = l === "squat" || l === "deadlift";
          return (
            <div className="stat" key={l}>
              <span className="row-sub" style={{ fontWeight: 600 }}>{isTm ? `${SHORT[l]} TM` : l === "incline_db_press" ? "Incline DB, each hand" : "Pull-up, added"}</span>
              <span className="stat-value">{v != null ? valueText(l, v) : "—"}<small> kg</small></span>
              <span className="row-sub">
                {v == null ? (isTm ? `Not set · example ${EXAMPLE_TMS[l]}` : `Not set · week 0 uses ${valueText(l, PLAN.calibrationLoads[l])}`) : isTm ? "Training max" : "Working load"}
                {" · "}goal {valueText(l, goal.load)} × {goal.reps}
              </span>
            </div>
          );
        })}
      </section>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-tinted" style={{ height: 44, fontSize: 15 }} onClick={() => setSetting("squat")}>Set manually</button>
      </div>
      <p className="row-sub" style={{ margin: "0 4px", fontSize: 15 }}>
        Week 0 sets the training maxes from your rep-outs; after that each rep-out moves them. Set one by hand only to correct it.
      </p>

      <section className="section">
        <h2 className="section-label">History</h2>
        {history.length ? (
          <div className="list">
            {history.map((m) => {
              const lift = liftById.get(m.exercise_id)!;
              return (
                <div className="row" key={m.id} style={{ padding: "8px 0" }}>
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{LIFT_NAME[lift]}</span>
                    <span className="row-sub">{fmtShortDateYear(m.effective_date)} · {REASON[m.reason]}{m.note ? ` · ${m.note}` : ""}</span>
                  </span>
                  <span className="num" style={{ fontWeight: 600, flex: "none" }}>{valueText(lift, Number(m.value_kg))} kg</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted" style={{ margin: "0 4px", fontSize: 15 }}>Nothing yet.</p>
        )}
      </section>

      {setting && <SetMaxSheet initial={setting} ctx={ctx} onClose={() => setSetting(null)} />}
    </div>
  );
}

function SetMaxSheet({ initial, ctx, onClose }: { initial: Lift; ctx: PlanContext; onClose: () => void }) {
  const { local } = useStore();
  const [lift, setLift] = useState<Lift>(initial);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [setLoad, setSetLoad] = useState("");
  const [setReps, setSetReps] = useState("");
  const [busy, setBusy] = useState(false);
  const isTm = lift === "squat" || lift === "deadlift";

  const v = parseDecimal(value);
  const valid = v != null && (lift === "weighted_pullup" ? v >= 0 && v <= 100 : v > 0 && v <= 400);
  const l = parseDecimal(setLoad);
  const r = parseDecimal(setReps);
  const fromSet = isTm && l != null && r != null && r >= 1 && r <= 12 && Number.isInteger(r) ? trainingMaxFromSet(l, r) : null;
  const current = ctx.latest[lift];

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
    <Sheet title="Set manually" onClose={onClose}>
      <div className="segmented seg-full" role="group" aria-label="Lift">
        {LIFTS.map((x) => (
          <button key={x} aria-pressed={lift === x} onClick={() => { setLift(x); setValue(""); setSetLoad(""); setSetReps(""); }}>{SHORT[x]}</button>
        ))}
      </div>
      <label className="field-label" htmlFor="max-value">
        <span>{isTm ? "Training max" : lift === "incline_db_press" ? "Working load, each hand" : "Added load on the belt"}</span>
        <span className="field">
          <input id="max-value" inputMode="decimal" className="num" style={{ fontWeight: 600 }}
            placeholder={current != null ? String(current).replace(".", ",") : isTm ? String(EXAMPLE_TMS[lift as "squat" | "deadlift"]) : String(PLAN.calibrationLoads[lift]).replace(".", ",")}
            value={value} onChange={(e) => setValue(e.target.value)} />
          <span className="field-suffix">kg</span>
        </span>
      </label>

      {isTm && (
        <div className="field-label">
          <span>Or work it out from a recent set</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="field"><span className="sr-only">Set load</span><input inputMode="decimal" placeholder="Load" value={setLoad} onChange={(e) => setSetLoad(e.target.value)} /><span className="field-suffix">kg</span></label>
            <label className="field"><span className="sr-only">Clean reps</span><input inputMode="numeric" placeholder="Reps" value={setReps} onChange={(e) => setSetReps(e.target.value)} /><span className="field-suffix">reps</span></label>
          </div>
          {fromSet != null && (
            <button className="btn btn-tinted btn-sm" style={{ alignSelf: "flex-start", height: 44 }} onClick={() => setValue(String(fromSet).replace(".", ","))}>
              Use {fmtNum(fromSet)} kg
            </button>
          )}
          <span className="row-sub" style={{ margin: "0 4px" }}>load × (1 + reps ÷ 30), rounded down to 2.5 kg; 1–12 reps.</span>
        </div>
      )}

      <label className="field-label" htmlFor="max-note">
        <span>Note</span>
        <span className="field"><input id="max-note" placeholder="Why (optional)" value={note} onChange={(e) => setNote(e.target.value)} /></span>
      </label>
      <button className="btn btn-primary" disabled={!valid || busy} onClick={() => void save()}>
        Save {valid && v != null ? `${valueText(lift, v)} kg` : ""}
      </button>
      <p className="row-sub">Saved as a manual change dated today. The newest value is the one the plan uses.</p>
    </Sheet>
  );
}
