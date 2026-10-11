// The blocks of the Progress page. Each answers one small question with one visual.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { REFERENCE } from "../../coach/reference";
import type { TrainingMax } from "../../data/types";
import { fractionalVolume, linearFit, monthlyAverages, monthlyBests, normMuscle, pearson, sessionBests, weeklyCounts } from "../../lib/analysis";
import { addDays, daysBetween, fmtNum, fmtShortDate, fmtShortDateYear, mondayOf } from "../../lib/format";
import { PLAN, latestMaxes, usePlan } from "../../plan/bridge";
import { Bar, Card, Delta, Label, Pill, Radar, Ring, Sparkline, Stat, WeekHeat } from "../../ui/kit";
import { Sheet } from "../../ui/Sheet";
import { Scatter, type ScatterSeries } from "./charts";
import type { TrainingIndex } from "./data";
import { fmtMetric, fmtMonthYear } from "./format";
import type { LiftTrend } from "./lifts";

// ------------------------------------------------------------------ lift tiles

export function LiftTile({ t, on, onSelect }: { t: LiftTrend; on: boolean; onSelect: () => void }) {
  const now = t.now?.value ?? null;
  const best = t.best?.value ?? null;
  const ratio = now != null && best != null && best > 0 ? now / best : 0;
  const unit = t.lift.metric === "added5" && now === 0 ? undefined : t.lift.key === "incline_db_press" ? "kg/hand" : "kg";
  return (
    <button type="button" className={`k-card pg-tile ${on ? "on" : ""}`} aria-pressed={on} onClick={onSelect}>
      <span className="pg-tile-top">
        <span className="pg-tile-name">{t.lift.label}{on && <i className="pg-dot" aria-hidden="true" />}</span>
        <Ring value={ratio} size={42} stroke={5} color="var(--accent)" label={`${t.lift.label}: ${Math.round(ratio * 100)}% of lifetime best`}>
          <span className="pg-tile-pct">{best ? Math.round(ratio * 100) : "–"}</span>
        </Ring>
      </span>
      <Stat size="md" value={fmtMetric(now, t.lift.metric)} unit={unit}
        sub={t.recent
          ? (t.delta != null ? <><Delta value={t.delta} unit=" kg" /> <span className="k-muted">4 wk</span></> : "8-week best")
          : t.now ? `last ${fmtMonthYear(t.now.date)}` : "Not logged"} />
      <span className="pg-tile-spark">
        <Sparkline data={t.spark} height={34} color="var(--chart-1)" label={`${t.lift.label}, monthly best, last 12 months`} />
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ programme

export const PLAN_END = addDays(PLAN.weeks[PLAN.weeks.length - 1]!.startDate, 6);

export function ProgrammeCard({ idx, maxes, today }: { idx: TrainingIndex; maxes: TrainingMax[]; today: string }) {
  const plan = usePlan();
  const weeks = plan.weeks;
  const current = weeks.find((w) => today >= w.startDate && daysBetween(w.startDate, today) < 7) ?? null;
  const daysIn = Math.max(0, daysBetween(PLAN.startDate, today) + 1);
  const until = daysBetween(today, PLAN.startDate);
  const cps = weeks.flatMap((w) => (w.checkpoint ? [w.checkpoint] : []));
  const cp = cps.find((c) => c.date >= today) ?? cps[cps.length - 1];
  const tm = latestMaxes(maxes, idx.ids);
  const status = current ? `Week ${current.weekNo} · ${current.label}` : until === 1 ? "Starts tomorrow" : until === 0 ? "Starts today" : `Starts in ${until} days`;
  return (
    <section>
      <Label>Programme</Label>
      <Link to="/plan" className="k-card k-pad pg-plan">
        <span className="pg-plan-head">
          <span className="pg-plan-name">{PLAN.name}</span>
          <Pill tone={current ? "warm" : "plain"}>{status}</Pill>
        </span>
        <Bar value={current ? daysIn / (weeks.length * 7) : 0} color="var(--warm)" height={5} />
        {cp && (
          <span className="pg-plan-cp">
            {([["Squat", tm.squat, cp.squatTm], ["Deadlift", tm.deadlift, cp.deadliftTm]] as const).map(([name, v, target]) => (
              <span key={name} className="pg-plan-ring">
                <Ring value={v != null ? v / target : 0} size={64} stroke={6} color="var(--warm)" label={`${name} training max ${v ?? "not set"} of ${target}`}>
                  <span className="k-num pg-plan-ring-v">{v != null ? fmtNum(v, 1) : "–"}</span>
                </Ring>
                <span className="k-muted">{name} <span className="k-num">{target}</span></span>
              </span>
            ))}
            <span className="pg-plan-when">
              <span className="k-muted">{cp.name}</span>
              <b>{fmtShortDate(cp.date)}</b>
            </span>
          </span>
        )}
      </Link>
    </section>
  );
}

// ------------------------------------------------------------------ muscles

export function MusclesCard({ idx, today }: { idx: TrainingIndex; today: string }) {
  const [open, setOpen] = useState(false);
  const data = useMemo(() => {
    let to = addDays(mondayOf(today), -1);
    let inWindow = idx.work.filter((s) => s.date > addDays(to, -28) && s.date <= to);
    if (!inWindow.length && idx.lastDate) {
      to = addDays(mondayOf(idx.lastDate), 6);
      inWindow = idx.work.filter((s) => s.date > addDays(to, -28) && s.date <= to);
    }
    const vol = fractionalVolume(inWindow, idx.exerciseById);
    const rows = REFERENCE.map((r) => ({ ...r, perWeek: (vol.get(normMuscle(r.muscle))?.sets ?? 0) / 4 }));
    return { rows, to };
  }, [idx, today]);

  return (
    <section>
      <Label action={<button type="button" onClick={() => setOpen(true)}>Numbers</button>}>Muscles · 4 wks to {fmtShortDate(data.to)}</Label>
      <Card className="pg-radar">
        <button type="button" className="pg-radar-btn" onClick={() => setOpen(true)} aria-label="Show weekly sets per muscle">
          <Radar size={270} label="Weekly sets per muscle, last 4 weeks, against your good weeks"
            axes={data.rows.map((r) => ({ name: r.short, value: r.perWeek / r.good, ref: 1 }))} />
        </button>
        <div className="pg-legend">
          <span><i className="pg-sw" /> Last 4 weeks</span>
          <span><i className="pg-sw pg-sw-dash" /> Good weeks</span>
        </div>
      </Card>
      {open && (
        <Sheet title="Sets per week" onClose={() => setOpen(false)}>
          <Card pad={false} className="k-rows pg-sheet-rows">
            <div className="k-row pg-sheet-head"><span>Muscle</span><span>Now · good · plan</span></div>
            {data.rows.map((r) => (
              <div key={r.muscle} className="k-row">
                <span className="k-row-main"><span>{r.muscle}</span></span>
                <span className="k-num">{fmtNum(r.perWeek, 1)} <span className="k-muted">· {fmtNum(r.good, 1)} · {fmtNum(r.plan, 1)}</span></span>
              </div>
            ))}
          </Card>
          <p className="k-muted pg-foot">Direct sets count 1, indirect ½. Good weeks: weeks with 5+ sessions.</p>
        </Sheet>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ consistency

export function ConsistencyCard({ idx, today }: { idx: TrainingIndex; today: string }) {
  const data = useMemo(() => {
    const sessions = new Map<string, { date: string; exact: boolean }>();
    for (const s of idx.work) if (!sessions.has(s.sessionId)) sessions.set(s.sessionId, { date: s.date, exact: s.confidence === "exact" });
    const list = [...sessions.values()];
    const weeks = weeklyCounts(list.map((d) => d.date), today, 52);
    const first = weeks[0]!.monday;
    return {
      weeks: weeks.map((w) => ({
        key: w.monday, level: Math.min(3, w.count) as 0 | 1 | 2 | 3,
        title: `Week of ${fmtShortDateYear(w.monday)}: ${w.count} session${w.count === 1 ? "" : "s"}`
      })),
      hit: weeks.filter((w) => w.count >= 3).length,
      first,
      uncertain: list.some((d) => d.date >= first && !d.exact)
    };
  }, [idx, today]);

  return (
    <section>
      <Label>Consistency</Label>
      <Card className="pg-heat">
        <div className="pg-heat-top">
          <Stat size="lg" value={data.hit} unit="of 52" sub="weeks with 3+ sessions" />
          {data.uncertain && <Pill>some dates est.</Pill>}
        </div>
        <WeekHeat weeks={data.weeks} label={`Sessions per week, last 52 weeks. 3 or more in ${data.hit} weeks.`} />
        <div className="pg-axis"><span>{fmtMonthYear(data.first)}</span><span>Now</span></div>
      </Card>
    </section>
  );
}

// ------------------------------------------------------------------ strength vs bodyweight

export function BodyweightCard({ idx, bodyweight }: { idx: TrainingIndex; bodyweight: { date: string; value: number }[] }) {
  const series = useMemo(() => {
    const bw = monthlyAverages(bodyweight);
    return ([["squat", "Squat", "var(--chart-1)"], ["deadlift", "Deadlift", "var(--chart-3)"]] as const).map(([key, label, color]) => {
      const id = idx.ids.get(key);
      const pairs = monthlyBests(sessionBests(id ? idx.byExercise.get(id) ?? [] : [])).filter((m) => bw.has(m.period))
        .map((m) => ({ x: bw.get(m.period)!, y: m.value, hollow: m.confidence === "estimated", title: `${fmtMonthYear(m.period)} · ${fmtNum(bw.get(m.period)!, 1)} kg · ${label} ${fmtNum(m.value, 0)}` }));
      const xs = pairs.map((p) => p.x), ys = pairs.map((p) => p.y);
      const ok = pairs.length >= 3;
      return { label, color, points: pairs, fit: ok ? linearFit(xs, ys) : null, r: ok ? pearson(xs, ys) : null } satisfies ScatterSeries & { r: number | null };
    });
  }, [idx, bodyweight]);

  if (!series.some((s) => s.points.length >= 3)) return null;
  return (
    <section>
      <Label>Strength vs bodyweight</Label>
      <Card className="pg-bw">
        <Scatter series={series} height={180} formatX={(x) => `${fmtNum(x, 0)} kg`} label="Monthly best e1RM against that month's average bodyweight" />
        <div className="pg-legend">
          {series.map((s) => (
            <span key={s.label}><i className="pg-sw pg-sw-dot" style={{ background: s.color }} /> {s.label}{s.r != null && <b className="k-num"> r {fmtNum(s.r, 2)}</b>}</span>
          ))}
        </div>
      </Card>
    </section>
  );
}
