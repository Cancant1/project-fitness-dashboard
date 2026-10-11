// The programme-specific part of Progress. Shown only while a programme runs (or as a compact card before it starts).
// Goals, weeks and checkpoints come from the programme definition (PLAN), not from this file.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { TrainingMax } from "../../data/types";
import { planWeekOf, regainCurve, rolling7, sessionBests } from "../../lib/analysis";
import { addDays, daysBetween, fmtShortDate } from "../../lib/format";
import { PLAN } from "../../plan/bridge";
import { LIFTS, type TrainingIndex } from "./data";
import { GoalStrip, WeeksStrip, latestMaxRows, useNow } from "./Goals";
import { LIFT_OPTIONS, type LiftKey } from "./LiftHistory";
import { Plot, type PlotDot, type PlotMarker } from "./Plot";
import { Panel, Segmented, Swatch, fmtKg, fmtSet, twoCol } from "./ui";

export const PLAN_END = addDays(PLAN.weeks[PLAN.weeks.length - 1]!.startDate, 6);

export function UpcomingProgramme({ today }: { today: string }) {
  const days = daysBetween(today, PLAN.startDate);
  return (
    <section className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="row-sub" style={{ fontWeight: 600 }}>Upcoming programme</span>
        <span className="chip chip-accent">{days <= 1 ? (days === 1 ? "Starts tomorrow" : "Starts today") : `Starts in ${days} days`}</span>
      </div>
      <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.2 }}>{PLAN.name}</span>
      <p className="row-sub" style={{ fontSize: 15 }}>
        {PLAN.weeks.length} weeks from Mon {fmtShortDate(PLAN.startDate)}, test week {fmtShortDate(PLAN.weeks[PLAN.weeks.length - 1]!.startDate)}.
        {" "}{LIFTS.map((l) => `${l.label} ${l.goalText}`).join(" · ")}.
      </p>
      <Link to="/plan" className="btn btn-tinted btn-sm" style={{ alignSelf: "flex-start", height: 44, borderRadius: 22 }}>Open the plan</Link>
    </section>
  );
}

export function CurrentProgramme({ idx, maxes, bodyweight, today }: {
  idx: TrainingIndex; maxes: TrainingMax[]; bodyweight: { date: string; value: number }[]; today: string;
}) {
  const now = useNow(idx, maxes, true);
  return (
    <section className="section" style={{ gap: 12 }}>
      <div className="section-row">
        <h2 className="section-label" style={{ margin: 0 }}>Current programme · {PLAN.name}</h2>
        <Link to="/plan" style={{ fontSize: 13, fontWeight: 600, minHeight: 44, display: "inline-flex", alignItems: "center" }}>Plan</Link>
      </div>
      <GoalStrip now={now} bodyweight={bodyweight} />
      <WeeksStrip today={today} />
      <div style={twoCol}>
        <PlanChart idx={idx} maxes={maxes} />
        <CheckpointCard idx={idx} maxes={maxes} bodyweight={bodyweight} today={today} />
      </div>
    </section>
  );
}

/** Training max and best set per programme week, the expected squat regain and the checkpoints. */
function PlanChart({ idx, maxes }: { idx: TrainingIndex; maxes: TrainingMax[] }) {
  const [liftKey, setLiftKey] = useState<LiftKey>("squat");
  const lift = LIFTS.find((l) => l.key === liftKey)!;
  const id = idx.ids.get(liftKey);
  const start = PLAN.startDate;
  const weeks = PLAN.weeks.length;

  const data = useMemo(() => {
    const tmRows = maxes.filter((m) => m.exercise_id === id && m.effective_date >= start && m.effective_date <= PLAN_END)
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date) || a.created_at.localeCompare(b.created_at));
    const tm = tmRows.map((m) => ({ x: Math.max(0, planWeekOf(start, m.effective_date)), y: Number(m.value_kg) }));
    const inPlan = (id ? idx.byExercise.get(id) ?? [] : []).filter((s) => s.date >= start && s.date <= PLAN_END);
    const perWeek = new Map<number, ReturnType<typeof sessionBests>[number]>();
    for (const b of sessionBests(inPlan, lift.metric)) {
      const w = Math.floor(planWeekOf(start, b.date));
      const cur = perWeek.get(w);
      if (!cur || b.value > cur.value) perWeek.set(w, b);
    }
    const best: PlotDot[] = [...perWeek].map(([w, b]) => ({ x: w + 0.5, y: b.value, color: "var(--warm)", r: 4, title: `Week ${w}: ${fmtKg(b.value)} from ${fmtSet(b.set)}` }));
    const expected = liftKey === "squat" ? Array.from({ length: weeks * 2 + 1 }, (_, i) => ({ x: i / 2, y: regainCurve(i / 2) })) : [];
    const markers: PlotMarker[] = lift.checkpoints.map((c) => ({ x: planWeekOf(start, c.date) + 1 / 7, y: c.tm, label: `${c.tm}` }));
    return { tm, best, expected, markers };
  }, [idx, maxes, id, lift, liftKey, start, weeks]);

  const tmLabel = liftKey === "squat" || liftKey === "deadlift" ? "Training max" : "Working load";
  const xTicks = [0, 5, 10, 15].map((w) => ({ x: w, label: w === 0 ? `Wk 0 · ${fmtShortDate(start)}` : `Wk ${w}` })).concat([{ x: weeks - 0.5, label: "Test" }]);

  return (
    <Panel title="This programme" sub={`Per programme week · goal ${lift.goalText}${lift.metric === "e1rm" ? ` ≈ ${fmtKg(lift.goal)} e1RM` : ""}`}>
      <Segmented label="Lift" value={liftKey} onChange={setLiftKey} options={LIFT_OPTIONS} />
      <Plot
        label={`${lift.label} in this programme`}
        height={240}
        xDomain={[0, weeks]}
        xTicks={xTicks}
        lines={[
          { points: data.expected, color: "var(--fg2)", dashed: true },
          { points: data.tm, color: "var(--accent)" }
        ]}
        dots={[...data.tm.map((p) => ({ ...p, color: "var(--accent)" })), ...data.best]}
        refs={[{ y: lift.goal, label: `Goal ${lift.metric === "e1rm" ? fmtKg(lift.goal) : `+${lift.goal}`}` }]}
        markers={data.markers}
      />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Swatch color="var(--accent)" label={tmLabel} />
        <Swatch color="var(--warm)" label={lift.metric === "e1rm" ? "Best e1RM that week" : "Best added load, 5+ reps"} />
        {liftKey === "squat" && <Swatch color="var(--fg2)" dashed label="Expected (your 2023 regain rate)" />}
        {lift.checkpoints.length > 0 && <Swatch color="var(--fg)" hollow label="Checkpoint TM" />}
      </div>
    </Panel>
  );
}

type Status = "met" | "behind" | "not yet";
const CHIP: Record<Status, string> = { met: "chip chip-good", behind: "chip chip-warm", "not yet": "chip chip-plain" };

function CheckpointCard({ idx, maxes, bodyweight, today }: { idx: TrainingIndex; maxes: TrainingMax[]; bodyweight: { date: string; value: number }[]; today: string }) {
  const cps = PLAN.weeks.flatMap((w) => (w.checkpoint ? [w.checkpoint] : []));
  const cp = cps.find((c) => c.date >= today) ?? cps[cps.length - 1];
  const latest = latestMaxRows(maxes);
  const tm = (key: string) => {
    const id = idx.ids.get(key);
    const row = id ? latest.get(id) : undefined;
    return row && row.effective_date >= PLAN.startDate ? Number(row.value_kg) : null;
  };
  const bw = rolling7(bodyweight).at(-1)?.value ?? null;
  if (!cp) return null;
  const past = today > cp.date;
  const status = (v: number | null, t: number): Status => (v != null && v >= t - 1e-9 ? "met" : past ? "behind" : "not yet");
  const rows = [
    { label: "Squat training max", value: tm("squat"), target: cp.squatTm },
    { label: "Deadlift training max", value: tm("deadlift"), target: cp.deadliftTm },
    { label: "Bodyweight, 7-day average", value: bw, target: cp.bodyweight7d }
  ];
  const days = daysBetween(today, cp.date);
  return (
    <Panel title={cp.name} sub={`End of week ${cp.weekNo}, Sun ${fmtShortDate(cp.date)}${days > 0 ? ` · in ${days} days` : days === 0 ? " · today" : ""}`}>
      <div className="list" style={{ boxShadow: "none", background: "var(--field)" }}>
        {rows.map((r) => {
          const s = status(r.value, r.target);
          return (
            <div className="row" key={r.label}>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span>{r.label}</span>
                <span className="row-sub"><span className="num">{fmtKg(r.value)}</span> of {fmtKg(r.target)}+ kg</span>
              </span>
              <span className={CHIP[s]}>{s === "met" ? "Met" : s === "behind" ? "Behind" : "Not yet"}</span>
            </div>
          );
        })}
      </div>
      <p className="row-sub">Behind? Check sessions done and bodyweight first. Both on target and still behind: add one normal set to each main lift.</p>
    </Panel>
  );
}
