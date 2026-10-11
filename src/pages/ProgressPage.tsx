import { Link } from "react-router-dom";
import { useRows } from "../data/store";
import { fmtShortDateYear, todayIso } from "../lib/format";
import { PLAN, activeProgram } from "../plan/bridge";
import { useBodyweight, useTraining } from "./progress/data";
import { LiftHistoryChart, LiftSummary } from "./progress/LiftHistory";
import { StrengthVsBodyweight, VolumePanel, WeeksTrained } from "./progress/Panels";
import { CurrentProgramme, PLAN_END, UpcomingProgramme } from "./progress/Programme";
import { BestByYear, BlockTable } from "./progress/Tables";
import { twoCol } from "./progress/ui";

/**
 * Progress: lifetime insights first (main lifts over time, volume, frequency, bodyweight, blocks).
 * The running programme gets its own section only while it is active; before it starts, a compact card.
 */
export function ProgressPage() {
  const idx = useTraining();
  const bodyweight = useBodyweight();
  const programs = useRows("programs");
  const maxes = useRows("training_maxes");
  const today = todayIso();

  const program = activeProgram(programs);
  const running = !!program && today >= PLAN.startDate && today <= PLAN_END;
  const upcoming = !running && today < PLAN.startDate;

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{idx.sessions.length} workouts{idx.lastDate ? ` · last ${fmtShortDateYear(idx.lastDate)}` : ""}</p>
          <h1 className="large-title">Progress</h1>
        </div>
        <Link to="/records" className="btn btn-tinted btn-sm" style={{ height: 44, borderRadius: 22, flex: "none" }}>Records</Link>
      </header>

      {running && <CurrentProgramme idx={idx} maxes={maxes} bodyweight={bodyweight} today={today} />}

      <section className="section" style={{ gap: 12 }}>
        {running && <h2 className="section-label">All training</h2>}
        <LiftSummary idx={idx} />
      </section>

      {upcoming && <UpcomingProgramme today={today} />}

      <LiftHistoryChart idx={idx} today={today} />

      <div style={twoCol}>
        <VolumePanel idx={idx} today={today} showPlan={running || upcoming} />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <WeeksTrained idx={idx} today={today} />
          <StrengthVsBodyweight idx={idx} bodyweight={bodyweight} />
        </div>
      </div>

      <BestByYear idx={idx} />
      <BlockTable idx={idx} />
    </main>
  );
}
