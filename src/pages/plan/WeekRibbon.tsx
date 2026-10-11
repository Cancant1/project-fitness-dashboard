import { useMemo } from "react";
import { PLAN } from "../../plan/bridge";
import type { ProgramDefinition } from "../../plan/types";
import { TYPE_NAME, fmtRange, phaseOf, weekEnd, weekIntensity } from "./planView";

const month = new Intl.DateTimeFormat("en-GB", { month: "short" });

/** Month labels: the first week, then every week that contains a 1st. */
function monthsOf(plan: ProgramDefinition) {
  return plan.weeks.flatMap((w, i) => {
    const start = new Date(`${w.startDate}T12:00:00`);
    const end = new Date(`${weekEnd(w)}T12:00:00`);
    if (i === 0) return [{ col: 1, label: month.format(start) }];
    if (start.getDate() === 1) return [{ col: i + 1, label: month.format(start) }];
    return end.getMonth() !== start.getMonth() ? [{ col: i + 1, label: month.format(end) }] : [];
  });
}

/** Bar height 0..1: squat %TM mapped from 55–100% onto 16–100% of the track; calibration a short neutral bar. */
function height(pct: number | null): number {
  if (pct == null) return 0.3;
  return 0.16 + 0.84 * Math.max(0, (pct - 0.55) / 0.45);
}

export function Flag() {
  return (
    <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true">
      <path d="M1.6 11.2V1.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M2.2 1.2h6.6L7 3.7l1.8 2.5H2.2z" fill="currentColor" />
    </svg>
  );
}

/**
 * The block at a glance: one bar per week, height = intensity, colour = phase. Checkpoints are red flags,
 * the current week is raised with a red dot, the selected week has a filled number.
 * Pass the adjusted programme (a repeated week adds a bar); defaults to PLAN.
 */
export function WeekRibbon({ plan = PLAN, selected, onSelect, nowWeekNo, compact = false }: {
  plan?: ProgramDefinition; selected: number; onSelect: (weekNo: number) => void; nowWeekNo: number | null; compact?: boolean;
}) {
  const months = useMemo(() => monthsOf(plan), [plan]);
  const last = plan.weeks.length - 1;
  // plan.css lays out 20 columns; a repeated week (coach adjustment) adds one.
  const cols = { gridTemplateColumns: `repeat(${plan.weeks.length}, minmax(0, 1fr))` };
  function onKey(e: React.KeyboardEvent) {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = Math.min(last, Math.max(0, selected + d));
    onSelect(n);
    (e.currentTarget.querySelectorAll("button")[n] as HTMLButtonElement | undefined)?.focus();
  }
  return (
    <div className={`pl-ribbon${compact ? " is-compact" : ""}`}>
      <div className="pl-rib-cols" role="group" aria-label="Weeks" onKeyDown={onKey} style={cols}>
        {plan.weeks.map((w) => {
          const cls = ["pl-rib", phaseOf(w.type), w.weekNo === nowWeekNo ? "now" : ""].join(" ");
          return (
            <button key={w.weekNo} type="button" className={cls} aria-pressed={w.weekNo === selected}
              tabIndex={w.weekNo === selected ? 0 : -1}
              title={`Week ${w.weekNo} · ${TYPE_NAME[w.type]} · ${fmtRange(w.startDate, weekEnd(w))}`}
              aria-label={`Week ${w.weekNo}, ${TYPE_NAME[w.type]}, ${fmtRange(w.startDate, weekEnd(w))}${w.checkpoint ? `, ${w.checkpoint.name}` : ""}${w.weekNo === nowWeekNo ? ", this week" : ""}`}
              onClick={() => onSelect(w.weekNo)}>
              <span className="pl-rib-flag">{w.checkpoint && <Flag />}</span>
              <span className="pl-rib-track"><span className="pl-rib-bar" style={{ height: `${height(weekIntensity(w.type)) * 100}%` }} /></span>
              <span className="pl-rib-dot" />
              <span className="pl-rib-no">{w.weekNo}</span>
            </button>
          );
        })}
      </div>
      {!compact && (
        <div className="pl-rib-months" aria-hidden="true" style={cols}>
          {months.map((m) => <span key={m.col} style={{ gridColumn: m.col }}>{m.label}</span>)}
        </div>
      )}
    </div>
  );
}

/** Three swatches and a flag: what the colours mean. */
export function RibbonLegend() {
  return (
    <div className="pl-legend" aria-hidden="true">
      <span><i className="training" />Training</span>
      <span><i className="light" />Deload</span>
      <span><i className="test" />PR test</span>
      <span className="pl-legend-flag"><Flag />Checkpoint</span>
    </div>
  );
}
