import { Link } from "react-router-dom";
import { PLAN } from "../../plan/bridge";
import { ChevronRight } from "../../ui/icons";
import { TYPE_NAME, fmtRange, typeChip, weekEnd } from "./planView";

/** All 20 weeks; tap one to open it. */
export function WeekList({ nowWeekNo, selected }: { nowWeekNo: number | null; selected?: number | null }) {
  return (
    <div className="list" role="list">
      {PLAN.weeks.map((w) => {
        const now = w.weekNo === nowWeekNo;
        return (
          <Link key={w.weekNo} role="listitem" to={{ search: `?week=${w.weekNo}` }} className={`week-row${now ? " is-now" : ""}`}
            aria-current={selected === w.weekNo ? "true" : undefined} aria-label={`Week ${w.weekNo}, ${w.label}, ${fmtRange(w.startDate, weekEnd(w))}`}>
            <span className="week-no" aria-hidden="true">{w.weekNo}</span>
            <span className="week-main">
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{fmtRange(w.startDate, weekEnd(w))}</span>
                <span className="week-chips">
                  <span className={typeChip(w.type)} style={{ height: 22, fontSize: 12 }}>{TYPE_NAME[w.type]}</span>
                  {w.checkpoint && <span className="chip chip-plain" style={{ height: 22, fontSize: 12, boxShadow: "inset 0 0 0 1.5px var(--fg)" , color: "var(--fg)" }}>{w.checkpoint.name}</span>}
                  {now && <span className="chip chip-accent" style={{ height: 22, fontSize: 12 }}>This week</span>}
                </span>
              </span>
              {w.notes[0] && <span className="week-note">{w.notes.join(" ")}</span>}
            </span>
            <ChevronRight style={{ color: "var(--fg2)", flex: "none" }} />
          </Link>
        );
      })}
    </div>
  );
}
