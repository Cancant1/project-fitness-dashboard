import { useMemo } from "react";
import type { TrainingMax } from "../../data/types";
import { rolling7, sessionBests } from "../../lib/analysis";
import { addDays, daysBetween, fmtShortDate, fmtShortDateYear } from "../../lib/format";
import { PLAN } from "../../plan/bridge";
import type { ProgramWeek, WeekType } from "../../plan/types";
import { LIFTS, type LiftDef, type TrainingIndex } from "./data";
import { fmtKg, fmtSet, fmtWhen } from "./ui";

export interface NowValue { value: number | null; caption: string; fromPlan: boolean }

/** Latest training-max row per exercise id (squat/deadlift TM; incline/pull-up working load). */
export function latestMaxRows(maxes: readonly TrainingMax[]): Map<string, TrainingMax> {
  const m = new Map<string, TrainingMax>();
  for (const r of maxes) {
    const cur = m.get(r.exercise_id);
    if (!cur || r.effective_date > cur.effective_date || (r.effective_date === cur.effective_date && r.created_at > cur.created_at)) m.set(r.exercise_id, r);
  }
  return m;
}

/** "Now" per lift: the latest training max once the plan runs, else the best of the last 8 weeks of data. */
export function useNow(idx: TrainingIndex, maxes: readonly TrainingMax[], planActive: boolean): Map<string, NowValue> {
  return useMemo(() => {
    const out = new Map<string, NowValue>();
    const latest = latestMaxRows(maxes);
    for (const lift of LIFTS) {
      const id = idx.ids.get(lift.key);
      const tm = id ? latest.get(id) : undefined;
      if (planActive && tm) {
        const what = lift.key === "squat" || lift.key === "deadlift" ? "Training max" : lift.key === "incline_db_press" ? "Working load per hand" : "Working load, added";
        out.set(lift.key, { value: Number(tm.value_kg), caption: `${what}, set ${fmtShortDate(tm.effective_date)}`, fromPlan: true });
        continue;
      }
      const bests = id ? sessionBests(idx.byExercise.get(id) ?? [], lift.metric) : [];
      if (!bests.length || !idx.lastDate) {
        out.set(lift.key, { value: null, caption: "Not logged yet", fromPlan: false });
        continue;
      }
      const from = addDays(idx.lastDate, -55);
      const recent = bests.filter((b) => b.date >= from);
      if (recent.length) {
        const best = recent.reduce((a, b) => (b.value > a.value ? b : a));
        out.set(lift.key, { value: best.value, caption: `Best ${lift.metricLabel}, 8 weeks to ${fmtShortDate(idx.lastDate)} · ${fmtSet(best.set)}`, fromPlan: false });
      } else {
        const last = bests[bests.length - 1]!;
        out.set(lift.key, { value: last.value, caption: `Last logged ${fmtWhen(last.date, last.confidence)} · ${fmtSet(last.set)}`, fromPlan: false });
      }
    }
    return out;
  }, [idx, maxes, planActive]);
}

export function GoalStrip({ now, bodyweight }: { now: Map<string, NowValue>; bodyweight: { date: string; value: number }[] }) {
  const bw = useMemo(() => rolling7(bodyweight).at(-1) ?? null, [bodyweight]);
  const [lo, hi] = PLAN.nutrition.targetBodyweightKg;
  return (
    <section className="card stat-strip" aria-label="Goals for the test week">
      {LIFTS.map((lift) => <GoalStat key={lift.key} lift={lift} now={now.get(lift.key)} />)}
      <div className="stat">
        <span className="row-sub">Bodyweight</span>
        <span className="stat-value">{bw ? fmtKg(bw.value) : "—"}<small> kg</small></span>
        <span className="row-sub">Goal {lo}–{hi} kg</span>
        <BodyweightTrack value={bw?.value ?? null} lo={lo} hi={hi} />
        <span className="row-sub" style={{ fontSize: 12 }}>{bw ? `7-day average, ${fmtShortDateYear(bw.date)}` : "No weigh-ins yet"}</span>
      </div>
    </section>
  );
}

function GoalStat({ lift, now }: { lift: LiftDef; now: NowValue | undefined }) {
  const v = now?.value ?? null;
  const pct = v == null ? 0 : Math.max(0, Math.min(1, v / lift.goal));
  const added = lift.metric === "added5";
  return (
    <div className="stat">
      <span className="row-sub">{lift.label} · {lift.goalText}</span>
      <span className="stat-value">
        {v == null ? "—" : `${added && v > 0 ? "+" : ""}${fmtKg(v)}`}
        <small> / {added ? `+${lift.goal}` : fmtKg(lift.goal)} kg</small>
      </span>
      <span className="row-sub">{added ? "Goal in added kg" : "Goal as e1RM"} · {Math.round(pct * 100)}%</span>
      <div className="bar" aria-hidden="true"><span style={{ width: `${pct * 100}%`, background: pct >= 1 ? "var(--good)" : undefined }} /></div>
      <span className="row-sub" style={{ fontSize: 12 }}>{now?.caption ?? ""}</span>
    </div>
  );
}

/** 70–80 kg track with the target band; the dot is the 7-day average. */
function BodyweightTrack({ value, lo, hi }: { value: number | null; lo: number; hi: number }) {
  const min = 70, max = 80;
  const pos = (v: number) => `${((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100}%`;
  return (
    <div aria-hidden="true" style={{ position: "relative", height: 4, borderRadius: 2, background: "var(--track)" }}>
      <span style={{ position: "absolute", left: pos(lo), width: `${((hi - lo) / (max - min)) * 100}%`, top: 0, bottom: 0, background: "var(--good-tint)", boxShadow: "inset 0 0 0 1px var(--good)", borderRadius: 2 }} />
      {value != null && <span style={{ position: "absolute", left: pos(value), top: -3, width: 10, height: 10, marginLeft: -5, borderRadius: 5, background: "var(--warm)", boxShadow: "0 0 0 2px var(--surface)" }} />}
    </div>
  );
}

// ------------------------------------------------------------------ 20-week strip

const LETTER: Record<WeekType, string> = { calibration: "0", A: "A", B: "B", C: "C", D: "D", deload: "L", taper: "P", test: "T" };

export function currentPlanWeek(today: string): ProgramWeek | null {
  return PLAN.weeks.find((w) => today >= w.startDate && daysBetween(w.startDate, today) < 7) ?? null;
}

export function WeeksStrip({ today }: { today: string }) {
  const current = currentPlanWeek(today);
  const first = PLAN.weeks[0]!;
  const last = PLAN.weeks[PLAN.weeks.length - 1]!;
  const status = current ? `Week ${current.weekNo} of ${last.weekNo} · ${current.label}`
    : today < first.startDate ? `Starts Mon ${fmtShortDate(first.startDate)}` : "Plan finished";
  return (
    <section className="section">
      <div className="section-row">
        <h2 className="section-label" style={{ margin: 0 }}>20 weeks · {status}</h2>
        <span className="row-sub" style={{ fontSize: 12 }}>Test {fmtShortDate(last.startDate)}</span>
      </div>
      <div className="weeks" role="list" aria-label="Plan weeks">
        {PLAN.weeks.map((w) => {
          const cls = [
            current?.weekNo === w.weekNo ? "now" : w.type === "test" ? "test" : w.type === "deload" || w.type === "taper" ? "light" : "",
            w.checkpoint ? "check" : ""
          ].filter(Boolean).join(" ");
          return (
            <div key={w.weekNo} role="listitem" className={cls || undefined} title={`Week ${w.weekNo}, ${fmtShortDate(w.startDate)} · ${w.label}${w.checkpoint ? ` · ${w.checkpoint.name}` : ""}`}>
              {LETTER[w.type]}
            </div>
          );
        })}
      </div>
      <p className="row-sub" style={{ margin: "0 4px", fontSize: 12 }}>
        0 calibration · A 5s · B 4s · C 3s · D 2s · L deload · P taper · T test · outlined: checkpoint
      </p>
    </section>
  );
}
