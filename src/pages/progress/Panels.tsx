// Lifetime insight panels: weekly volume per muscle, strength vs bodyweight, weeks trained.

import { useMemo } from "react";
import { fractionalVolume, linearFit, monthlyAverages, monthlyBests, normMuscle, pearson, sessionBests, weeklyCounts } from "../../lib/analysis";
import { addDays, fmtNum, fmtShortDate, fmtShortDateYear, mondayOf } from "../../lib/format";
import type { TrainingIndex } from "./data";
import { Plot, type PlotDot, type PlotLine } from "./Plot";
import { Panel, Swatch, fmtMonthYear, useWidth } from "./ui";

// Weekly fractional sets: average of your good weeks (5+ sessions) and the Strength Return Plan, from the plan page.
const REFERENCE: { muscle: string; good: number; plan: number }[] = [
  { muscle: "Chest", good: 15.8, plan: 11 },
  { muscle: "Back", good: 16.9, plan: 11.5 },
  { muscle: "Quads", good: 11.3, plan: 10 },
  { muscle: "Hamstrings", good: 6.6, plan: 6.0 },
  { muscle: "Biceps", good: 20.0, plan: 11.5 },
  { muscle: "Triceps", good: 17.6, plan: 9.5 },
  { muscle: "Side delts", good: 12.5, plan: 10 },
  { muscle: "Rear delts", good: 3.3, plan: 2 },
  { muscle: "Calves", good: 6.0, plan: 4 }
];

/** Fractional sets per muscle per week over the last 4 full weeks (warm-ups excluded). */
export function VolumePanel({ idx, today, showPlan }: { idx: TrainingIndex; today: string; showPlan: boolean }) {
  const data = useMemo(() => {
    let to = addDays(mondayOf(today), -1);
    let from = addDays(to, -27);
    let inWindow = idx.work.filter((s) => s.date >= from && s.date <= to);
    let fallback = false;
    if (!inWindow.length && idx.lastDate) {
      to = addDays(mondayOf(idx.lastDate), 6);
      from = addDays(to, -27);
      inWindow = idx.work.filter((s) => s.date >= from && s.date <= to);
      fallback = true;
    }
    const vol = fractionalVolume(inWindow, idx.exerciseById);
    const rows: { label: string; perWeek: number; good: number | null; plan: number | null }[] = REFERENCE.map((r) => ({
      label: r.muscle, perWeek: (vol.get(normMuscle(r.muscle))?.sets ?? 0) / 4, good: r.good, plan: r.plan
    }));
    const known = new Set(REFERENCE.map((r) => normMuscle(r.muscle)));
    const other = [...vol].filter(([k]) => !known.has(k)).sort((a, b) => b[1].sets - a[1].sets)
      .map(([, v]) => ({ label: v.label, perWeek: v.sets / 4, good: null, plan: null }));
    return { rows: [...rows, ...other], from, to, fallback, sets: inWindow.length };
  }, [idx, today]);

  const scale = Math.max(...data.rows.map((r) => Math.max(r.perWeek, r.good ?? 0, showPlan ? r.plan ?? 0 : 0)), 1) * 1.05;

  return (
    <Panel
      title="Weekly sets per muscle"
      sub={`${data.fallback ? "No sets in the last 4 weeks. Showing" : "Average of"} ${fmtShortDate(data.from)} – ${fmtShortDateYear(data.to)} · direct 1, indirect ½`}
    >
      <div className="list" style={{ boxShadow: "none", background: "var(--field)" }}>
        {data.rows.map((r) => (
          <div key={r.label} style={{ padding: "10px 0", display: "flex", flexDirection: "column", gap: 6, borderTop: r === data.rows[0] ? undefined : "1px solid var(--sep)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 15 }}>
              <span>{r.label}</span>
              <span className="row-sub">
                <span className="num" style={{ color: "var(--fg)", fontWeight: 600 }}>{fmtNum(r.perWeek, 1)}</span>
                {showPlan && r.plan != null && <> · plan {fmtNum(r.plan, 1)}</>}
                {r.good != null && <> · good weeks {fmtNum(r.good, 1)}</>}
              </span>
            </div>
            <div style={{ position: "relative", height: 6, borderRadius: 3, background: "var(--track)" }} aria-hidden="true">
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(r.perWeek / scale) * 100}%`, borderRadius: 3, background: "var(--accent)" }} />
              {r.good != null && <span style={{ position: "absolute", left: `${(r.good / scale) * 100}%`, top: -3, bottom: -3, width: 2, marginLeft: -1, background: "var(--fg2)", borderRadius: 1 }} />}
              {showPlan && r.plan != null && <span style={{ position: "absolute", left: `${(r.plan / scale) * 100}%`, top: -3, bottom: -3, width: 2, marginLeft: -1, background: "var(--warm)", borderRadius: 1 }} />}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Swatch color="var(--accent)" label="Sets per week" />
        <Swatch color="var(--fg2)" label="Good weeks (5+ sessions)" />
        {showPlan && <Swatch color="var(--warm)" label="Plan" />}
      </div>
    </Panel>
  );
}

/** Monthly best squat and deadlift e1RM against that month's average bodyweight (months with both). */
export function StrengthVsBodyweight({ idx, bodyweight }: { idx: TrainingIndex; bodyweight: { date: string; value: number }[] }) {
  const data = useMemo(() => {
    const bw = monthlyAverages(bodyweight);
    const series = (["squat", "deadlift"] as const).map((key) => {
      const id = idx.ids.get(key);
      const months = monthlyBests(sessionBests(id ? idx.byExercise.get(id) ?? [] : []));
      const pairs = months.filter((m) => bw.has(m.period)).map((m) => ({ x: bw.get(m.period)!, y: m.value, period: m.period, estimated: m.confidence === "estimated" }));
      const xs = pairs.map((p) => p.x), ys = pairs.map((p) => p.y);
      return { key, pairs, r: pearson(xs, ys), fit: linearFit(xs, ys) };
    });
    const xs = series.flatMap((s) => s.pairs.map((p) => p.x));
    const domain: [number, number] = xs.length ? [Math.floor(Math.min(...xs) - 0.5), Math.ceil(Math.max(...xs) + 0.5)] : [70, 80];
    return { series, domain };
  }, [idx, bodyweight]);

  const color = { squat: "var(--accent)", deadlift: "var(--warm)" } as const;
  const dots: PlotDot[] = data.series.flatMap((s) => s.pairs.map((p) => ({
    x: p.x, y: p.y, color: color[s.key], hollow: p.estimated, title: `${fmtMonthYear(p.period)} · ${fmtNum(p.x, 1)} kg bodyweight · ${s.key} ${fmtNum(p.y, 1)}`
  })));
  const lines: PlotLine[] = data.series.flatMap((s) => s.fit && s.pairs.length >= 3 ? [{
    points: data.domain.map((x) => ({ x, y: s.fit!.slope * x + s.fit!.intercept })), color: color[s.key], dashed: true, width: 1.5
  }] : []);
  const ticks: { x: number; label: string }[] = [];
  for (let x = data.domain[0]; x <= data.domain[1]; x += data.domain[1] - data.domain[0] > 8 ? 2 : 1) ticks.push({ x, label: `${x} kg` });

  return (
    <Panel title="Strength and bodyweight" sub="Best e1RM per month against that month's average bodyweight">
      <Plot label="Monthly best e1RM against bodyweight" height={240} xDomain={data.domain} xTicks={ticks} dots={dots} lines={lines}
        empty="Needs months with both weigh-ins and squats or deadlifts." />
      <div className="list" style={{ boxShadow: "none", background: "var(--field)" }}>
        {data.series.map((s) => (
          <div className="row" key={s.key}>
            <Swatch color={color[s.key]} label={s.key === "squat" ? "Squat" : "Deadlift"} />
            <span className="row-sub" style={{ textAlign: "right" }}>
              {s.r == null ? "Too few months" : <>
                r = <span className="num" style={{ color: "var(--fg)", fontWeight: 600 }}>{fmtNum(s.r, 2)}</span>
                {s.fit && <> · {s.fit.slope >= 0 ? "+" : ""}{fmtNum(s.fit.slope, 1)} kg per kg</>}
                {" "}· {s.pairs.length} months
              </>}
            </span>
          </div>
        ))}
      </div>
      <p className="row-sub">A correlation, not proof: cuts and breaks moved both at once.</p>
    </Panel>
  );
}

/** Sessions per calendar week over the last 52 weeks. */
export function WeeksTrained({ idx, today }: { idx: TrainingIndex; today: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const data = useMemo(() => {
    const dates = new Map<string, { date: string; exact: boolean }>();
    for (const s of idx.work) if (!dates.has(s.sessionId)) dates.set(s.sessionId, { date: s.date, exact: s.confidence === "exact" });
    const list = [...dates.values()];
    const weeks = weeklyCounts(list.map((d) => d.date), today, 52);
    const first = weeks[0]!.monday;
    const uncertain = list.some((d) => d.date >= first && !d.exact);
    return { weeks, uncertain, hit: weeks.filter((w) => w.count >= 3).length };
  }, [idx, today]);
  const cols = width && width < 560 ? 26 : 52;

  return (
    <Panel title="Weeks trained" sub={<>3+ sessions in <span className="num" style={{ color: "var(--fg)", fontWeight: 600 }}>{data.hit}</span> of 52 weeks</>}>
      <div ref={ref} style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 3 }} role="img"
        aria-label={`Sessions per week, last 52 weeks. 3 or more in ${data.hit} weeks.`}>
        {data.weeks.map((w) => (
          <span key={w.monday} title={`Week of ${fmtShortDateYear(w.monday)}: ${w.count} session${w.count === 1 ? "" : "s"}`}
            style={{
              height: 18, borderRadius: 4,
              background: w.count >= 3 ? "var(--accent)" : w.count > 0 ? "var(--accent-tint)" : "var(--track)",
              boxShadow: w.count > 0 && w.count < 3 ? "inset 0 0 0 1px var(--accent)" : undefined
            }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }} className="row-sub">
        <span>{fmtShortDateYear(data.weeks[0]!.monday)}</span>
        <span>This week</span>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "var(--fg2)" }}>
        <Legend bg="var(--track)" label="None" />
        <Legend bg="var(--accent-tint)" ring label="1–2" />
        <Legend bg="var(--accent)" label="3+" />
      </div>
      {data.uncertain && <p className="row-sub">Some weeks here come from sheets without exact dates.</p>}
    </Panel>
  );
}

function Legend({ bg, ring, label }: { bg: string; ring?: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: bg, boxShadow: ring ? "inset 0 0 0 1px var(--accent)" : undefined }} />
      {label}
    </span>
  );
}
