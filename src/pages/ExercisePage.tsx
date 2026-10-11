import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { groupBy } from "../lib/analysis";
import { todayIso } from "../lib/format";
import { ChevronLeft, ChevronRight } from "../ui/icons";
import { Card, Delta, Label, PageHead, Pill, Stat } from "../ui/kit";
import { RepCurve } from "./progress/charts";
import { useTraining } from "./progress/data";
import { fmtLiftSet, fmtMetric, fmtWhen, metricFor, metricName } from "./progress/format";
import { trendOf } from "./progress/lifts";
import { RangeControl, TrendChart, hasEstimated, useRange } from "./progress/TrendChart";
import "./progress/progress.css";

/** The story of one lift: best, trend, rep maxes, recent sessions. */
export function ExercisePage() {
  const { exerciseId = "" } = useParams();
  const navigate = useNavigate();
  const idx = useTraining();
  const today = todayIso();
  const exercise = idx.exerciseById.get(exerciseId);
  const [range, setRange] = useRange("all");
  const [showAll, setShowAll] = useState(false);

  const data = useMemo(() => {
    const sets = idx.byExercise.get(exerciseId) ?? [];
    const metric = metricFor(sets, exerciseId === idx.ids.get("weighted_pullup"));
    const trend = trendOf(sets, metric, sets.at(-1)?.date ?? null, today);
    const sessions = [...groupBy(sets, (s) => s.sessionId).values()].reverse();
    return { sets, metric, trend, sessions };
  }, [idx, exerciseId, today]);

  const back = <button className="btn btn-plain ex-back" onClick={() => navigate(-1)}><ChevronLeft /> Back</button>;
  if (!exercise) return <main className="page pg">{back}<p className="k-empty">Not on this device</p></main>;

  const { trend, metric } = data;
  const fmtSet = (s: Parameters<typeof fmtLiftSet>[0]) => fmtLiftSet(s, metric);
  const best = trend.best;
  const unit = (v: number | undefined) => (metric === "added5" && v === 0 ? undefined : "kg");
  const eyebrow = [exercise.muscle_direct, exercise.equipment].filter(Boolean).join(" · ") || "Exercise";
  const shown = showAll ? data.sessions : data.sessions.slice(0, 8);

  return (
    <main className="page pg ex">
      <div>{back}</div>
      <PageHead eyebrow={eyebrow} title={exercise.name} />

      <div className="k-dash">
        <div className="k-col">
          <Card className="pg-hero">
            <div className="ex-stats">
              <Stat size="xl" tone="warm" value={fmtMetric(best?.value, metric)} unit={best ? unit(best.value) : undefined}
                label={`Best ${metricName(metric)}`}
                sub={best ? <><span className="k-num">{fmtSet(best.set)}</span> · {fmtWhen(best.date, best.confidence)}</> : "No loaded sets"} />
              {trend.now && trend.now !== best && (
                <Stat size="sm" value={fmtMetric(trend.now.value, metric)} unit={unit(trend.now.value)}
                  label={trend.recent ? "Recent" : "Last"}
                  sub={trend.recent ? (trend.delta != null ? <><Delta value={trend.delta} unit=" kg" /> <span className="k-muted">4 wk</span></> : "8-week best") : fmtWhen(trend.now.date, trend.now.confidence)} />
              )}
            </div>
            <div className="pg-hero-head">
              <span className="k-muted">{range === "all" ? "Best per month" : "Best per session"}</span>
              <RangeControl value={range} onChange={setRange} />
            </div>
            <TrendChart trend={trend} sets={data.sets} range={range} today={today} height={240} label={`${exercise.name} over time`} />
            {hasEstimated(trend, range, today) && <div className="pg-legend"><span><i className="pg-sw pg-sw-ring" /> est. date</span></div>}
          </Card>
        </div>

        <div className="k-col">
          {data.sets.some((s) => !s.flagged && s.loadKg != null) && (
            <section>
              <Label>Rep maxes</Label>
              <Card><RepCurve sets={data.sets} metric={metric} caption="Heaviest for N+ reps" height={140} /></Card>
            </section>
          )}

          <section>
            <Label action={!showAll && data.sessions.length > shown.length ? <button type="button" onClick={() => setShowAll(true)}>All {data.sessions.length}</button> : undefined}>
              Sessions
            </Label>
            <Card pad={false} className="k-rows ex-sessions">
              {shown.map((sets) => {
                const first = sets[0]!;
                const ok = sets.filter((s) => !s.flagged && s.loadKg != null);
                const top = (ok.length ? ok : sets).reduce((a, s) => ((s.loadKg ?? -Infinity) > (a.loadKg ?? -Infinity) ? s : a));
                return (
                  <Link key={first.sessionId} to={`/session/${first.sessionId}`} className="k-row ex-row">
                    <span className="k-row-main">
                      <span className="k-num">{fmtSet(top)}</span>
                      <span>{fmtWhen(first.date, first.confidence)} · {sets.length} {sets.length === 1 ? "set" : "sets"}</span>
                    </span>
                    <span className="rec-row-side">
                      {sets.some((s) => s.flagged) && <Pill>check</Pill>}
                      <ChevronRight />
                    </span>
                  </Link>
                );
              })}
              {!data.sessions.length && <div className="k-row k-muted">Not logged yet</div>}
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
