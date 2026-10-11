import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Dumbbell, Gauge, TrendingUp } from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { LineChart } from "../../components/charts";
import { Button, Card, EmptyState, PageHeader } from "../../components/ui";
import { activeProfile, epley, formatShortDate } from "../../domain/utils";

export function ExerciseProgressPage() {
  const { snapshot } = useAppStore();
  const { exerciseId } = useParams();
  const navigate = useNavigate();
  if (!snapshot) return null;
  const profile = activeProfile(snapshot);
  const exercise = snapshot.exercises.find((item) => item.id === exerciseId);
  const history = useMemo(() => snapshot.sessions.filter((item) => item.profileId === profile.id && item.status === "completed" && !item.deletedAt).flatMap((session) => session.performances.filter((performance) => performance.exerciseId === exerciseId).map((performance) => {
    const sets = performance.sets.filter((set) => (set.reps || 0) > 0 || (set.durationMinutes || 0) > 0);
    const bestSet = sets.reduce<typeof sets[number] | null>((best, set) => { const score = set.load != null && set.reps ? epley(set.load, set.reps) : set.reps || set.durationMinutes || 0; const bestScore = best ? (best.load != null && best.reps ? epley(best.load, best.reps) : best.reps || best.durationMinutes || 0) : -1; return score > bestScore ? set : best; }, null);
    return { session, performance, sets, bestSet, best: bestSet ? (bestSet.load != null && bestSet.reps ? epley(bestSet.load, bestSet.reps) : bestSet.reps || bestSet.durationMinutes || 0) : 0, volume: sets.reduce((sum, set) => sum + (set.load || 0) * (set.reps || 0), 0) };
  })).sort((a, b) => a.session.actualDate.localeCompare(b.session.actualDate)), [snapshot.sessions, profile.id, exerciseId]);
  const unit = history.at(-1)?.bestSet?.unit || exercise?.defaultUnit || profile.preferredUnit;
  const best = history.reduce<typeof history[number] | null>((current, item) => !current || item.best > current.best ? item : current, null);
  const latest = history.at(-1);
  return <div className="page exercise-progress-page"><PageHeader eyebrow="Progress · Exercise" title={exercise?.name || history[0]?.performance.exerciseNameSnapshot || "Exercise history"} description={`${exercise?.movement || history[0]?.performance.movement || "Movement"} · all completed appearances`} actions={<Button onClick={() => navigate("/progress")}><ArrowLeft />Progress</Button>} />
    <div className="stat-grid"><Card className="stat-card"><span>Training sessions<CalendarDays /></span><strong>{history.length}</strong><small>{history[0] ? `${formatShortDate(history[0].session.actualDate)}–${formatShortDate(history.at(-1)!.session.actualDate)}` : "No history"}</small></Card><Card className="stat-card"><span>Logged sets<Dumbbell /></span><strong>{history.reduce((sum, item) => sum + item.sets.length, 0)}</strong><small>results and notes preserved</small></Card><Card className="stat-card"><span>Best estimate<TrendingUp /></span><strong>{best ? best.best.toFixed(1) : "—"}</strong><small>{unit} e1RM · {best ? formatShortDate(best.session.actualDate) : "no result"}</small></Card><Card className="stat-card"><span>Latest performance<Gauge /></span><strong>{latest?.bestSet?.load ?? latest?.bestSet?.reps ?? "—"}</strong><small>{latest?.bestSet ? `${latest.bestSet.unit}${latest.bestSet.reps ? ` × ${latest.bestSet.reps}` : ""}` : "no result"}</small></Card></div>
    <Card><div className="card-header"><div><h2>Estimated strength</h2><small>Best set from each completed session</small></div><TrendingUp /></div>{history.length >= 2 ? <LineChart data={history.map((item) => ({ label: formatShortDate(item.session.actualDate), value: item.best }))} label="Estimated 1RM" unit={unit} /> : <EmptyState icon={<TrendingUp />} title="One more session starts a trend" description="This page keeps the existing session visible below." />}</Card>
    <Card><div className="card-header"><div><h2>Complete session history</h2><small>Every set, RPE/RIR value, and note</small></div><Dumbbell /></div>{history.length ? <div className="exercise-history-list">{[...history].reverse().map((item) => <button key={item.performance.id} onClick={() => navigate(`/train/session/${item.session.id}`)}><span className="session-date"><b>{new Date(`${item.session.actualDate}T12:00:00`).getDate()}</b><small>{new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(`${item.session.actualDate}T12:00:00`))}</small></span><span><strong>{item.session.title}</strong><small>{item.sets.length} set{item.sets.length === 1 ? "" : "s"}{item.performance.note ? ` · ${item.performance.note}` : ""}</small><span className="set-summary-line">{item.sets.map((set, index) => <i key={set.id}>{index + 1}: {set.load != null ? `${set.load} ${set.unit}` : set.unit} × {set.reps ?? set.durationMinutes ?? "—"}{set.rpe != null ? ` @${set.rpe}` : set.rir != null ? ` · ${set.rir} RIR` : ""}</i>)}</span></span><b>{item.best.toFixed(1)}<small> e1RM</small></b></button>)}</div> : <EmptyState icon={<Dumbbell />} title="No completed history" description="Once logged, sessions appear here without rewriting exercise snapshots." />}</Card>
  </div>;
}
