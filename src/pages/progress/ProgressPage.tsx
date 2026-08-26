import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, ChevronRight, Dumbbell, LineChart as LineChartIcon, Scale, Search, Trophy } from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { Bars, LineChart } from "../../components/charts";
import { Card, EmptyState, PageHeader, Segmented } from "../../components/ui";
import { activeProfile, epley, formatShortDate, sessionSetCount, sessionVolume, startOfWeek } from "../../domain/utils";

type ProgressView = "Overview" | "Strength" | "Records" | "Body weight";

export function ProgressPage() {
  const { snapshot } = useAppStore();
  const navigate = useNavigate();
  const [view, setView] = useState<ProgressView>("Overview");
  const [query, setQuery] = useState("");
  if (!snapshot) return null;
  const profile = activeProfile(snapshot);
  const sessions = snapshot.sessions.filter((item) => item.profileId === profile.id && item.status === "completed" && !item.deletedAt).sort((a, b) => a.actualDate.localeCompare(b.actualDate));
  const weights = snapshot.measurements.filter((item) => item.profileId === profile.id && item.type === "weight" && !item.deletedAt).sort((a, b) => a.date.localeCompare(b.date));
  const exerciseStats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sessions: number; sets: number; lastDate: string; best: number; unit: string; bestLoad: number; bestReps: number }>();
    sessions.forEach((session) => session.performances.forEach((performance) => {
      const validSets = performance.sets.filter((set) => (set.reps || 0) > 0 || (set.durationMinutes || 0) > 0);
      if (!validSets.length) return;
      const prior = map.get(performance.exerciseId) || { id: performance.exerciseId, name: performance.exerciseNameSnapshot, sessions: 0, sets: 0, lastDate: session.actualDate, best: 0, unit: validSets[0].unit, bestLoad: 0, bestReps: 0 };
      prior.sessions += 1; prior.sets += validSets.length; prior.lastDate = session.actualDate > prior.lastDate ? session.actualDate : prior.lastDate;
      validSets.forEach((set) => { const estimate = set.load != null && set.reps ? epley(set.load, set.reps) : set.reps || set.durationMinutes || 0; if (estimate > prior.best) { prior.best = estimate; prior.unit = set.unit; prior.bestLoad = set.load || 0; prior.bestReps = set.reps || 0; } });
      map.set(performance.exerciseId, prior);
    })); return [...map.values()].sort((a, b) => b.best - a.best);
  }, [sessions]);
  const weeks = useMemo(() => {
    const map = new Map<string, { sessions: number; volume: number }>(); sessions.slice(-80).forEach((session) => { const week = startOfWeek(session.actualDate); const item = map.get(week) || { sessions: 0, volume: 0 }; item.sessions += 1; item.volume += sessionVolume(session); map.set(week, item); }); return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12);
  }, [sessions]);
  const personalRecords = exerciseStats.filter((item) => item.best > 0).slice(0, 20);
  const lifetimePrs = snapshot.legacyFacts.filter((item) => item.profileId === profile.id && item.type === "lifetime_pr" && !item.deletedAt);
  const last30 = sessions.filter((item) => new Date(item.actualDate).getTime() >= Date.now() - 30 * 864e5);
  const visibleExercises = exerciseStats.filter((item) => !query || item.name.toLowerCase().includes(query.toLowerCase()));

  return <div className="page progress-page">
    <PageHeader eyebrow="Progress" title="Patterns over noise" description="Strength, consistency, records, and body weight—grounded in your full history." actions={<Segmented value={view} label="Progress view" options={["Overview", "Strength", "Records", "Body weight"].map((value) => ({ value: value as ProgressView, label: value }))} onChange={setView} />} />
    {view === "Overview" && <><div className="stat-grid"><Card className="stat-card"><span>Completed workouts<Dumbbell /></span><strong>{sessions.length}</strong><small>{last30.length} in the last 30 days</small></Card><Card className="stat-card"><span>Completed sets<LineChartIcon /></span><strong>{sessions.reduce((sum, item) => sum + sessionSetCount(item), 0).toLocaleString()}</strong><small>across preserved history</small></Card><Card className="stat-card"><span>Tracked movements<Award /></span><strong>{exerciseStats.length}</strong><small>with logged performance</small></Card><Card className="stat-card"><span>Body measurements<Scale /></span><strong>{weights.length}</strong><small>{weights.at(-1) ? `latest ${weights.at(-1)!.value} ${weights.at(-1)!.unit}` : "none yet"}</small></Card></div><div className="content-grid equal"><Card><div className="card-header"><div><h2>Weekly training volume</h2><small>Load × reps · last 12 active weeks</small></div><Dumbbell /></div>{weeks.length ? <Bars data={weeks.map(([week, item]) => ({ label: formatShortDate(week), value: item.volume }))} label="Weekly volume" unit="kg × reps" /> : <EmptyState icon={<Dumbbell />} title="No completed workout data" description="Completed sessions will create a weekly volume view." />}</Card><Card><div className="card-header"><div><h2>Workout frequency</h2><small>Completed sessions per active week</small></div><LineChartIcon /></div>{weeks.length ? <Bars data={weeks.map(([week, item]) => ({ label: formatShortDate(week), value: item.sessions }))} label="Weekly sessions" /> : <EmptyState icon={<LineChartIcon />} title="No frequency trend yet" description="Your weekly rhythm will appear here." />}</Card></div><Card><div className="card-header"><div><h2>Exercise progress</h2><small>Open a movement for its complete set-by-set history</small></div><label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises…" /></label></div><ExerciseRows items={visibleExercises.slice(0, 12)} onOpen={(id) => navigate(`/progress/exercise/${id}`)} /></Card></>}
    {view === "Strength" && <Card><div className="card-header"><div><h2>Strength movements</h2><small>Best estimated performance by movement; units stay separate in detail views</small></div><Dumbbell /></div><div className="library-toolbar"><label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search strength history…" /></label></div><ExerciseRows items={visibleExercises} onOpen={(id) => navigate(`/progress/exercise/${id}`)} /></Card>}
    {view === "Records" && <div className="content-grid equal"><Card><div className="card-header"><div><h2>Calculated records</h2><small>Best estimated 1RM from recorded sets</small></div><Trophy /></div>{personalRecords.length ? <div className="record-list">{personalRecords.map((item, index) => <button key={item.id} onClick={() => navigate(`/progress/exercise/${item.id}`)}><span className="record-rank">{index + 1}</span><span><strong>{item.name}</strong><small>{item.bestLoad} {item.unit} × {item.bestReps || "—"} reps</small></span><b>{item.best.toFixed(1)}<small> e1RM</small></b><ChevronRight /></button>)}</div> : <EmptyState icon={<Trophy />} title="No calculated records yet" description="Complete load-and-rep sets to establish baselines." />}</Card><Card><div className="card-header"><div><h2>Imported lifetime records</h2><small>Preserved facts from the original workbook</small></div><Award /></div>{lifetimePrs.length ? <div className="legacy-fact-list">{lifetimePrs.map((fact) => <div key={fact.id}><Award /><span><strong>{fact.title}</strong><small>{typeof fact.value === "string" ? fact.value : JSON.stringify(fact.value)}</small></span></div>)}</div> : <EmptyState icon={<Award />} title="No separate lifetime records" description="Any records found in the original workbook are preserved here." />}</Card></div>}
    {view === "Body weight" && <Card><div className="card-header"><div><h2>Body-weight history</h2><small>Every imported and newly logged measurement</small></div><Scale /></div>{weights.length >= 2 ? <LineChart data={weights.slice(-90).map((item) => ({ label: formatShortDate(item.date), value: item.value }))} label="Body weight" unit={weights.at(-1)?.unit || profile.preferredUnit} /> : <EmptyState icon={<Scale />} title="Not enough measurements" description="Two weigh-ins are enough to start a trend." />}</Card>}
  </div>;
}

function ExerciseRows({ items, onOpen }: { items: Array<{ id: string; name: string; sessions: number; sets: number; lastDate: string; best: number; unit: string }>; onOpen: (id: string) => void }) {
  if (!items.length) return <EmptyState icon={<Search />} title="No exercise history found" description="Try a different search or complete a workout." />;
  return <div className="progress-exercise-list">{items.map((item) => <button key={item.id} onClick={() => onOpen(item.id)}><span className="exercise-avatar">{item.name.slice(0, 2).toUpperCase()}</span><span><strong>{item.name}</strong><small>{item.sessions} session{item.sessions === 1 ? "" : "s"} · {item.sets} sets · last {formatShortDate(item.lastDate)}</small></span><b>{item.best.toFixed(1)}<small> {item.unit} e1RM</small></b><ChevronRight /></button>)}</div>;
}
