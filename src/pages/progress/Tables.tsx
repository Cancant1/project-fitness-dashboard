import { useMemo } from "react";
import { blockComparison, confidenceLabel, periodBests, sessionBests, yearKey, type SessionBest } from "../../lib/analysis";
import { fmtNum, fmtShortDate, fmtShortDateYear } from "../../lib/format";
import { LIFTS, type TrainingIndex } from "./data";
import { Panel, fmtKg, fmtMonthYear, fmtSet } from "./ui";

/** Best e1RM per calendar year per main lift (pull-up: heaviest added load on 5+ reps). */
export function BestByYear({ idx }: { idx: TrainingIndex }) {
  const data = useMemo(() => {
    const perLift = LIFTS.map((lift) => {
      const id = idx.ids.get(lift.key);
      return new Map(periodBests(sessionBests(id ? idx.byExercise.get(id) ?? [] : [], lift.metric), yearKey).map((b) => [b.period, b]));
    });
    const years = [...new Set(perLift.flatMap((m) => [...m.keys()]))].sort();
    return { perLift, years };
  }, [idx]);

  return (
    <Panel title="Best by year" sub="Squat, deadlift and incline DB as e1RM (incline per hand); pull-up as added kg on 5+ reps">
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr><th>Year</th>{LIFTS.map((l) => <th key={l.key} className="n">{l.label}</th>)}</tr>
          </thead>
          <tbody>
            {data.years.map((y) => (
              <tr key={y}>
                <td className="num" style={{ fontWeight: 600 }}>{y}</td>
                {LIFTS.map((l, i) => <td key={l.key} className="n"><Cell b={data.perLift[i]!.get(y)} added={l.metric === "added5"} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.years.length && <p className="muted">No main-lift sets yet.</p>}
      <p className="row-sub">"est." marks a best from a sheet with estimated dates; the year can still be off near New Year.</p>
    </Panel>
  );
}

function Cell({ b, added }: { b: (SessionBest & { period: string }) | undefined; added: boolean }) {
  if (!b) return <span className="muted">—</span>;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end" }}>
      <span style={{ fontWeight: 600 }}>{added && b.value > 0 ? "+" : ""}{fmtKg(b.value)}</span>
      <span className="row-sub" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtSet(b.set)}{b.confidence === "estimated" ? " · est." : ""}</span>
    </span>
  );
}

const BLOCK_LIFTS = [
  { key: "squat", label: "Squat" },
  { key: "deadlift", label: "Deadlift" },
  { key: "incline_db_press", label: "Incline DB" },
  { key: "barbell_row", label: "Row" }
] as const;

/** Per programme block: best e1RM of the first two sessions vs the last two, per lift. */
export function BlockTable({ idx }: { idx: TrainingIndex }) {
  const rows = useMemo(() => {
    const ids = BLOCK_LIFTS.map((l) => idx.ids.get(l.key) ?? `missing:${l.key}`);
    return { ids, list: blockComparison(idx.work, idx.sessions, ids).reverse() };
  }, [idx]);

  return (
    <Panel title="Every block, start to finish" sub="Best e1RM in the first two vs the last two sessions of each block (flagged sets left out)">
      <div className="table-wrap">
        <table className="data" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Block</th><th>Dates</th><th className="n">Sessions</th><th className="n">Sets / session</th>
              {BLOCK_LIFTS.map((l) => <th key={l.key} className="n">{l.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.list.map((b) => (
              <tr key={b.source}>
                <td style={{ fontWeight: 500 }}>{b.label}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {b.confidence === "exact" ? `${fmtShortDate(b.first)} – ${fmtShortDateYear(b.last)}` : monthRange(b.first, b.last)}
                  {b.confidence !== "exact" && <span className="row-sub" style={{ display: "block", fontSize: 12 }}>{confidenceLabel(b.confidence)}</span>}
                </td>
                <td className="n">{b.sessions}</td>
                <td className="n">{fmtNum(b.setsPerSession, 0)}</td>
                {rows.ids.map((id) => {
                  const v = b.lifts.get(id);
                  if (!v) return <td key={id} className="n muted">—</td>;
                  const d = v.end - v.start;
                  return (
                    <td key={id} className="n" style={{ whiteSpace: "nowrap" }}>
                      {fmtNum(v.start, 0)} → <span style={{ fontWeight: 600 }}>{fmtNum(v.end, 0)}</span>
                      <span style={{ display: "block", fontSize: 12, color: d > 0.5 ? "var(--good)" : d < -0.5 ? "var(--bad)" : "var(--fg2)" }}>{d >= 0 ? "+" : "−"}{fmtNum(Math.abs(d), 0)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function monthRange(a: string, z: string): string {
  const x = fmtMonthYear(a), y = fmtMonthYear(z);
  return x === y ? x : `${x} – ${y}`;
}
