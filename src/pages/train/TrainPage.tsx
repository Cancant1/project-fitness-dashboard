import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ChevronRight, Clock3, Dumbbell, History, ListFilter, Play, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { Button, Card, EmptyState, Field, Modal, PageHeader } from "../../components/ui";
import { createSessionFromPlan, discardWorkoutDraft, plannedFromRoutineDay } from "../../domain/factories";
import { activeProfile, addDays, formatShortDate, nowIso, sessionSetCount, todayIso } from "../../domain/utils";

export function TrainPage() {
  const { snapshot, mutate } = useAppStore();
  const navigate = useNavigate();
  const [startOpen, setStartOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [workoutDate, setWorkoutDate] = useState(todayIso());
  const [query, setQuery] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  if (!snapshot) return null;
  const profile = activeProfile(snapshot);
  const active = snapshot.sessions.find((session) => session.profileId === profile.id && (session.status === "draft" || session.status === "inProgress") && !session.deletedAt);
  const completedPlanIds = new Set(snapshot.sessions.filter((session) => session.status === "completed").map((session) => session.plannedWorkoutId));
  const upcoming = snapshot.plannedWorkouts.filter((plan) => plan.profileId === profile.id && !plan.deletedAt && plan.date >= todayIso() && plan.status !== "skipped" && !completedPlanIds.has(plan.id)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const routines = snapshot.routines.filter((routine) => routine.profileId === profile.id && !routine.deletedAt);
  const sessions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.sessions.filter((session) => session.profileId === profile.id && (showDeleted ? !!session.deletedAt : !session.deletedAt) && session.status === "completed")
      .filter((session) => !needle || `${session.title} ${session.split} ${session.actualDate} ${session.notes} ${session.performances.map((performance) => `${performance.exerciseNameSnapshot} ${performance.note} ${performance.sets.map((set) => set.note).join(" ")}`).join(" ")}`.toLowerCase().includes(needle))
      .sort((a, b) => b.actualDate.localeCompare(a.actualDate));
  }, [snapshot.sessions, profile.id, showDeleted, query]);

  const openStart = (date = todayIso()) => {
    setWorkoutDate(date);
    setStartOpen(true);
  };

  const start = async (plan?: typeof upcoming[number], title?: string, actualDate = workoutDate) => {
    if (active) { navigate(`/train/live/${active.id}`); return; }
    const session = createSessionFromPlan(profile.id, plan, title, actualDate);
    await mutate("Started workout", (draft) => { draft.sessions.push(session); });
    setStartOpen(false);
    navigate(`/train/live/${session.id}`);
  };

  const startRoutineDay = async (routineId: string, dayId: string) => {
    const routine = routines.find((item) => item.id === routineId);
    const day = routine?.days.find((item) => item.id === dayId);
    if (!routine || !day) return;
    const plan = plannedFromRoutineDay(profile.id, routine.id, day, workoutDate);
    const session = createSessionFromPlan(profile.id, plan, undefined, workoutDate);
    await mutate("Started routine workout", (draft) => {
      draft.plannedWorkouts.push(plan);
      draft.sessions.push(session);
    });
    setStartOpen(false);
    navigate(`/train/live/${session.id}`);
  };

  const restore = async (id: string) => {
    await mutate("Restored session", (draft) => {
      const session = draft.sessions.find((item) => item.id === id);
      if (session) { delete session.deletedAt; session.updatedAt = new Date().toISOString(); }
      draft.tombstones = draft.tombstones.filter((item) => !(item.entityType === "session" && item.entityId === id));
    });
  };

  const discardActive = async () => {
    if (!active) return;
    await mutate("Discarded workout draft", (draft) => { discardWorkoutDraft(draft, active.id, nowIso()); });
    setDiscardOpen(false);
  };

  const activeIsLive = active?.status === "inProgress" && active.actualDate === todayIso();
  const activeLabel = activeIsLive ? "Workout in progress" : active?.actualDate && active.actualDate < todayIso() ? "Past workout draft" : "Workout draft";

  return (
    <div className="page train-page">
      <PageHeader eyebrow="Train" title="Your training workspace" description="Start, resume, and review every workout from one place." actions={<><Button onClick={() => navigate("/train/programs")}><CalendarDays />Programs</Button><Button variant="primary" onClick={() => active ? navigate(`/train/live/${active.id}`) : openStart()}><Play />{active ? activeIsLive ? "Resume" : "Open draft" : "Start workout"}</Button></>} />

      {active ? (
        <Card className="train-hero active-workout-card">
          <div><span className="eyebrow">{activeIsLive && <i className="live-dot" />}{activeLabel}</span><h2>{active.title}</h2><p>{formatShortDate(active.actualDate, true)} · {active.performances.length} exercises · {active.performances.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0)} completed sets · saved locally</p></div>
          <div className="train-hero-actions"><Button variant="danger" onClick={() => setDiscardOpen(true)}><Trash2 />Discard draft</Button><Button variant="primary" onClick={() => navigate(`/train/live/${active.id}`)}>{activeIsLive ? "Resume workout" : "Open draft"}<ChevronRight /></Button></div>
        </Card>
      ) : upcoming[0] ? (
        <Card className="train-hero">
          <div><span className="eyebrow">Next scheduled</span><h2>{upcoming[0].title}</h2><p>{formatShortDate(upcoming[0].date, true)} · {upcoming[0].exercises.length} exercises{upcoming[0].note ? ` · ${upcoming[0].note}` : ""}</p></div>
          <Button variant="primary" onClick={() => start(upcoming[0], undefined, todayIso())}>Start session<ChevronRight /></Button>
        </Card>
      ) : (
        <Card className="train-hero"><div><span className="eyebrow">Ready when you are</span><h2>Choose a routine or train empty</h2><p>Nothing scheduled next. Your history stays available below.</p></div><Button variant="primary" onClick={() => openStart()}>Choose workout<ChevronRight /></Button></Card>
      )}

      <div className="train-tools-grid">
        <button onClick={() => openStart()}><span><Plus /></span><strong>Start workout</strong><small>Scheduled, routine, or empty</small></button>
        <button onClick={() => openStart(addDays(todayIso(), -1))}><span><History /></span><strong>Log past workout</strong><small>Choose the actual date before logging</small></button>
        <button onClick={() => navigate("/train/programs")}><span><CalendarDays /></span><strong>Programs</strong><small>{routines.length} routine{routines.length === 1 ? "" : "s"}</small></button>
        <button onClick={() => navigate("/train/exercises")}><span><Dumbbell /></span><strong>Exercises</strong><small>{snapshot.exercises.filter((item) => !item.archived && !item.deletedAt).length} movements</small></button>
      </div>

      <Card className="history-card">
        <div className="card-header history-head"><div><h2>Session history</h2><small>{sessions.length} shown · search includes every note and set</small></div><label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions, exercises, notes…" /></label><button className={`filter-toggle ${showDeleted ? "active" : ""}`} onClick={() => setShowDeleted((value) => !value)}><ListFilter />{showDeleted ? "Deleted" : "Current"}</button></div>
        {sessions.length ? <div className="session-list">{sessions.map((session) => (
          <button key={session.id} className={session.deletedAt ? "deleted" : ""} onClick={() => session.deletedAt ? undefined : navigate(`/train/session/${session.id}`)}>
            <span className="session-date"><b>{new Date(`${session.actualDate}T12:00:00`).getDate()}</b><small>{new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(`${session.actualDate}T12:00:00`))}</small></span>
            <span className="session-copy"><strong>{session.title}</strong><small>{session.performances.length} exercises · {sessionSetCount(session)} sets{session.notes ? ` · ${session.notes}` : ""}</small></span>
            <span className="session-meta"><span className="chip">{session.split || "Workout"}</span>{session.durationMinutes ? <small><Clock3 />{session.durationMinutes} min</small> : null}</span>
            {session.deletedAt ? <Button className="small" variant="soft" onClick={(event) => { event.stopPropagation(); void restore(session.id); }}><RotateCcw />Restore</Button> : <ChevronRight />}
          </button>
        ))}</div> : <EmptyState icon={showDeleted ? <Trash2 /> : <Dumbbell />} title={query ? "No matching sessions" : showDeleted ? "No deleted sessions" : "No completed workouts yet"} description={query ? "Try a date, exercise, split, or note." : "Finish a workout and it will appear here with all historical imports."} action={!showDeleted && !query ? <Button variant="primary" onClick={() => openStart()}>Start workout</Button> : undefined} />}
      </Card>

      <Modal open={startOpen} title="Start a workout" onClose={() => setStartOpen(false)} className="start-modal">
        <div className="modal-body start-options">
          {active && <button className="start-option featured" onClick={() => navigate(`/train/live/${active.id}`)}><span><Play /></span><div><strong>{activeIsLive ? "Resume" : "Open draft"} · {active.title}</strong><small>Your current workout is saved locally.</small></div><ChevronRight /></button>}
          {!active && <Field label="Workout date" hint={workoutDate < todayIso() ? "This will be saved as a past workout, not a live session." : "You can correct this again when finishing."}><input type="date" max={todayIso()} value={workoutDate} onChange={(event) => setWorkoutDate(event.target.value)} /></Field>}
          {upcoming.length > 0 && <div className="option-section"><span className="eyebrow">Scheduled</span>{upcoming.map((plan) => <button key={plan.id} className="start-option" onClick={() => start(plan)}><span><CalendarDays /></span><div><strong>{plan.title}</strong><small>{formatShortDate(plan.date, true)} · {plan.exercises.length} exercises</small></div><ChevronRight /></button>)}</div>}
          {routines.length > 0 && <div className="option-section"><span className="eyebrow">Routine days</span>{routines.flatMap((routine) => routine.days.map((day) => <button key={`${routine.id}-${day.id}`} className="start-option" onClick={() => startRoutineDay(routine.id, day.id)}><span><Dumbbell /></span><div><strong>{day.title}</strong><small>{routine.name} · {day.exercises.length} exercises</small></div><ChevronRight /></button>))}</div>}
          <div className="option-section"><span className="eyebrow">Flexible</span><button className="start-option" onClick={() => start(undefined, "Empty workout")}><span><Plus /></span><div><strong>Empty workout</strong><small>Add exercises as you go.</small></div><ChevronRight /></button></div>
        </div>
      </Modal>

      <Modal open={discardOpen} title="Discard this workout draft?" onClose={() => setDiscardOpen(false)}>
        <div className="modal-body form-stack"><p className="form-note">This removes only the unfinished draft. Your completed workouts, food logs, weight history, and planned workout remain unchanged.</p></div>
        <div className="modal-footer"><Button onClick={() => setDiscardOpen(false)}>Keep draft</Button><Button variant="danger" onClick={() => void discardActive()}><Trash2 />Discard draft</Button></div>
      </Modal>
    </div>
  );
}
