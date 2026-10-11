// Lifetime view of the main lifts: a summary strip and the monthly-best chart with programme blocks as bands.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { blockLabel, groupBy, monthFromIndex, monthIndex, monthlyBests, sessionBests } from "../../lib/analysis";
import { addDays, fmtShortDate } from "../../lib/format";
import { LIFTS, type TrainingIndex } from "./data";
import { Plot, type PlotBand, type PlotDot, type PlotLine } from "./Plot";
import { Panel, Segmented, Swatch, fmtKg, fmtMonth, fmtMonthYear, fmtSet, fmtWhen } from "./ui";

export type LiftKey = (typeof LIFTS)[number]["key"];
export const LIFT_OPTIONS = LIFTS.map((l) => ({ value: l.key, label: l.label }));

/** Per main lift: best of the last 8 weeks of data and the all-time best from the logs. */
export function LiftSummary({ idx }: { idx: TrainingIndex }) {
  const rows = useMemo(() => LIFTS.map((lift) => {
    const id = idx.ids.get(lift.key);
    const bests = id ? sessionBests(idx.byExercise.get(id) ?? [], lift.metric) : [];
    const from = idx.lastDate ? addDays(idx.lastDate, -55) : "";
    const recent = bests.filter((b) => b.date >= from);
    const pick = (list: typeof bests) => list.reduce<(typeof bests)[number] | null>((a, b) => (!a || b.value > a.value ? b : a), null);
    return { lift, id, recent: pick(recent), allTime: pick(bests), last: bests.at(-1) ?? null };
  }), [idx]);

  return (
    <section className="card stat-strip" aria-label="Main lifts">
      {rows.map(({ lift, id, recent, allTime, last }) => {
        const added = lift.metric === "added5";
        const shown = recent ?? last;
        const body = (
          <>
            <span className="row-sub">{lift.label} · {added ? "added kg, 5+ reps" : "e1RM"}</span>
            <span className="stat-value">{shown ? `${added && shown.value > 0 ? "+" : ""}${fmtKg(shown.value)}` : "—"}<small> kg</small></span>
            <span className="row-sub" style={{ fontSize: 12 }}>
              {recent ? `Last 8 weeks of logs · ${fmtSet(recent.set)}` : last ? `Last logged ${fmtWhen(last.date, last.confidence)}` : "Not logged yet"}
            </span>
            {allTime && (
              <span className="row-sub" style={{ fontSize: 12 }}>
                Best ever <span className="num" style={{ color: "var(--fg)", fontWeight: 600 }}>{added && allTime.value > 0 ? "+" : ""}{fmtKg(allTime.value)}</span> · {fmtWhen(allTime.date, allTime.confidence)}
              </span>
            )}
          </>
        );
        return id ? (
          <Link key={lift.key} to={`/exercise/${id}`} className="stat" style={{ color: "var(--fg)", minHeight: 44 }}>{body}</Link>
        ) : (
          <div key={lift.key} className="stat">{body}</div>
        );
      })}
    </section>
  );
}

/** Best e1RM per month (flagged sets left out), 12 months or all time, programme blocks as bands. */
export function LiftHistoryChart({ idx, today }: { idx: TrainingIndex; today: string }) {
  const [range, setRange] = useState<"12m" | "all">("all");
  const [liftKey, setLiftKey] = useState<LiftKey>("squat");
  const lift = LIFTS.find((l) => l.key === liftKey)!;
  const id = idx.ids.get(liftKey);

  const data = useMemo(() => {
    const list = id ? idx.byExercise.get(id) ?? [] : [];
    const months = monthlyBests(sessionBests(list, lift.metric));
    const nowM = monthIndex(today);
    const firstM = months.length ? monthIndex(months[0]!.period) : nowM;
    const lastM = months.length ? monthIndex(months[months.length - 1]!.period) : nowM;
    const domain: [number, number] = range === "12m" ? [nowM - 11.5, nowM + 0.5] : [firstM - 0.5, Math.max(lastM, firstM + 1) + 0.5];
    const shown = months.filter((m) => monthIndex(m.period) >= domain[0] && monthIndex(m.period) <= domain[1]);

    // Break the line across gaps of more than 3 months (no logs, not zero strength).
    const lines: PlotLine[] = [];
    let seg: { x: number; y: number }[] = [];
    for (const m of shown) {
      const x = monthIndex(m.period);
      if (seg.length && x - seg[seg.length - 1]!.x > 3) { lines.push({ points: seg, color: "var(--accent)" }); seg = []; }
      seg.push({ x, y: m.value });
    }
    if (seg.length) lines.push({ points: seg, color: "var(--accent)" });

    const dots: PlotDot[] = shown.map((m) => ({
      x: monthIndex(m.period), y: m.value, color: "var(--accent)", hollow: m.confidence === "estimated",
      title: `${fmtMonthYear(m.period)} · ${fmtKg(m.value)} kg from ${fmtSet(m.set)}${m.confidence === "estimated" ? " · date estimated" : ""}`
    }));

    // Blocks that include this lift.
    const bands: PlotBand[] = [];
    for (const [source, sets] of groupBy(list, (s) => s.source)) {
      const a = monthIndex(sets[0]!.date), z = monthIndex(sets[sets.length - 1]!.date);
      if (z + 0.45 < domain[0] || a - 0.45 > domain[1]) continue;
      bands.push({ x0: a - 0.45, x1: z + 0.45, label: blockLabel(source), title: `${blockLabel(source)} · ${fmtMonthYear(sets[0]!.date)} – ${fmtMonthYear(sets[sets.length - 1]!.date)}` });
    }
    bands.sort((p, q) => p.x0 - q.x0);

    const xTicks: { x: number; label: string }[] = [];
    for (let m = Math.ceil(domain[0]); m <= domain[1]; m++) {
      const iso = monthFromIndex(m);
      if (range === "all" ? m % 12 === 0 : m % 3 === 0) xTicks.push({ x: m, label: m % 12 === 0 ? iso.slice(0, 4) : fmtMonth(iso) });
    }
    const estimated = shown.some((m) => m.confidence === "estimated");
    return { domain, lines, dots, bands, xTicks, estimated, count: shown.length };
  }, [idx, id, lift, range, today]);

  return (
    <Panel
      title={`${lift.label}, best ${lift.metric === "e1rm" ? "e1RM" : "added load (5+ reps)"} per month`}
      sub={idx.lastDate ? `Logs to ${fmtShortDate(idx.lastDate)} · flagged sets left out` : "Flagged sets left out"}
      right={<Segmented label="Range" value={range} onChange={setRange} options={[{ value: "12m", label: "12 months" }, { value: "all", label: "All time" }]} />}
    >
      <Segmented label="Lift" value={liftKey} onChange={setLiftKey} options={LIFT_OPTIONS} />
      <Plot label={`${lift.label} best per month`} height={260} xDomain={data.domain} lines={data.lines} dots={data.dots} bands={data.bands} xTicks={data.xTicks}
        empty={range === "12m" ? "No sets of this lift in the last 12 months." : "No sets of this lift yet."} />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Swatch color="var(--accent)" label="Best per month" />
        {data.estimated && <Swatch color="var(--accent)" hollow label="Month from estimated dates" />}
        <Swatch color="var(--fg2)" label="Shaded: programme blocks" />
      </div>
    </Panel>
  );
}
