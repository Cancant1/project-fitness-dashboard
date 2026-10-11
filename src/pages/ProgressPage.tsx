import { useState } from "react";
import { Link } from "react-router-dom";
import { useRows } from "../data/store";
import { todayIso } from "../lib/format";
import { PLAN, activeProgram } from "../plan/bridge";
import type { MainLiftKey } from "../plan/types";
import { Card, PageHead } from "../ui/kit";
import { BodyweightCard, ConsistencyCard, LiftTile, MusclesCard, PLAN_END, ProgrammeCard } from "./progress/cards";
import { useBodyweight, useTraining } from "./progress/data";
import { metricName } from "./progress/format";
import { useLiftTrends } from "./progress/lifts";
import { RangeControl, TrendChart, hasEstimated, useRange } from "./progress/TrendChart";
import "./progress/progress.css";

/** Progress: am I getting stronger? Four lifts up top, one chart, then muscles, consistency and bodyweight. */
export function ProgressPage() {
  const idx = useTraining();
  const bodyweight = useBodyweight();
  const programs = useRows("programs");
  const maxes = useRows("training_maxes");
  const today = todayIso();
  const trends = useLiftTrends(idx, today);
  const [liftKey, setLiftKey] = useState<MainLiftKey>("squat");
  const [range, setRange] = useRange("1y");

  const program = activeProgram(programs);
  const running = !!program && today >= PLAN.startDate && today <= PLAN_END;
  const upcoming = !running && today < PLAN.startDate;
  const t = trends.find((x) => x.lift.key === liftKey) ?? trends[0]!;
  const sets = t.id ? idx.byExercise.get(t.id) ?? [] : [];

  return (
    <main className="page pg">
      <PageHead eyebrow={`${idx.sessions.length} workouts`} title="Progress">
        <Link to="/records" className="k-pill k-pill-plain pg-head-link">Records</Link>
      </PageHead>

      <div className="k-grid-4">
        {trends.map((x) => <LiftTile key={x.lift.key} t={x} on={x.lift.key === liftKey} onSelect={() => setLiftKey(x.lift.key)} />)}
      </div>

      <div className="k-dash">
        <div className="k-col">
          <Card className="pg-hero">
            <div className="pg-hero-head">
              <div className="pg-hero-title">
                <h2>{t.lift.label}</h2>
                <span className="k-muted">{range === "all" ? "best per month" : "best per session"} · {metricName(t.lift.metric)}</span>
              </div>
              <RangeControl value={range} onChange={setRange} />
            </div>
            <TrendChart trend={t} sets={sets} range={range} today={today} height={260} label={`${t.lift.label} over time`} />
            <div className="pg-legend">
              <span><i className="pg-sw" /> {t.lift.label}</span>
              <span><i className="pg-sw pg-sw-dash pg-sw-warm" /> Lifetime best</span>
              {hasEstimated(t, range, today) && <span><i className="pg-sw pg-sw-ring" /> est. date</span>}
              {range === "all" && <span><i className="pg-sw pg-sw-band" /> blocks</span>}
            </div>
          </Card>
          <BodyweightCard idx={idx} bodyweight={bodyweight} />
        </div>

        <div className="k-col">
          {(running || upcoming) && <ProgrammeCard idx={idx} maxes={maxes} today={today} />}
          <MusclesCard idx={idx} today={today} />
          <ConsistencyCard idx={idx} today={today} />
        </div>
      </div>
    </main>
  );
}
