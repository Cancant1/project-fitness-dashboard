import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Dumbbell,
  History,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  SkipForward,
  StickyNote,
  TimerReset,
  Trash2,
  X
} from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { Button, DecimalInput, EmptyState, Field, IconButton, Modal, ProgressBar } from "../../components/ui";
import { discardWorkoutDraft } from "../../domain/factories";
import type { ExercisePerformance, RepsSnapshot, SetResult, SetType, Tombstone, WorkoutSession } from "../../domain/types";
import { deepClone, epley, formatShortDate, nowIso, searchExercise, sessionVolume, todayIso, uid } from "../../domain/utils";

function persistRemovals(state: RepsSnapshot, removals: Tombstone[]) {
  for (const item of removals) {
    if (!state.tombstones.some((existing) => existing.entityType === item.entityType && existing.entityId === item.entityId)) state.tombstones.push(item);
  }
}

const formatElapsed = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export function WorkoutPage() {
  const { sessionId } = useParams();
  const { snapshot, mutate } = useAppStore();
  const navigate = useNavigate();
  const stored = snapshot?.sessions.find((session) => session.id === sessionId && !session.deletedAt);
  const [draft, setDraft] = useState<WorkoutSession | null>(() => stored ? deepClone(stored) : null);
  const [exerciseIndex, setExerciseIndex] = useState(() => Math.max(0, stored?.performances.findIndex((item) => item.sets.some((set) => !set.completed)) ?? 0));
  const [addOpen, setAddOpen] = useState(false);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [replacementChoice, setReplacementChoice] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [restLeft, setRestLeft] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [savedState, setSavedState] = useState("Saved locally");
  const [discarding, setDiscarding] = useState(false);
  const hydratedId = useRef<string | null>(stored?.id || null);
  const autosaveTimer = useRef<number | null>(null);
  const discardingRef = useRef(false);
  const removedEntitiesRef = useRef<Tombstone[]>([]);
  const latestDraftRef = useRef(draft);
  latestDraftRef.current = draft;
  useEffect(() => () => {
    const latest = latestDraftRef.current;
    if (!latest || discardingRef.current) return;
    // Navigation can happen before the debounce expires. Flush the last edit.
    void mutate("Saved workout before leaving", (state) => {
      persistRemovals(state, removedEntitiesRef.current);
      const index = state.sessions.findIndex((session) => session.id === latest.id);
      if (index >= 0 && !state.sessions[index].deletedAt &&
        !state.tombstones.some((item) => item.entityType === "session" && item.entityId === latest.id) &&
        (state.sessions[index].status !== "completed" || latest.status === "completed")) {
        state.sessions[index] = { ...deepClone(latest), updatedAt: nowIso() };
      }
    }).catch(() => { /* The shared save-error banner reports persistence errors. */ });
  }, [mutate]);

  useEffect(() => {
    if (!stored || hydratedId.current === stored.id) return;
    hydratedId.current = stored.id;
    setDraft(deepClone(stored));
  }, [stored]);

  useEffect(() => {
    if (!draft) return;
    const isLive = draft.status === "inProgress" && draft.actualDate === todayIso() && snapshot?.settings.workoutTimerEnabled === true;
    if (!isLive) {
      setElapsed(Math.max(0, (draft.durationMinutes || 0) * 60));
      return;
    }
    const start = Date.parse(draft.startedAt || draft.createdAt);
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [draft?.id, draft?.status, draft?.actualDate, draft?.startedAt, draft?.durationMinutes, snapshot?.settings.workoutTimerEnabled]);

  useEffect(() => {
    if (snapshot?.settings.restTimerEnabled !== true) {
      setRestLeft(0);
      return;
    }
    if (restLeft <= 0) return;
    const timer = window.setInterval(() => setRestLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [restLeft > 0, snapshot?.settings.restTimerEnabled]);

  useEffect(() => {
    if (!draft || draft.id !== stored?.id || discardingRef.current) return;
    setSavedState("Saving…");
    autosaveTimer.current = window.setTimeout(() => {
      if (discardingRef.current) return;
      void mutate("Autosaved active workout", (state) => {
        persistRemovals(state, removedEntitiesRef.current);
        const index = state.sessions.findIndex((session) => session.id === draft.id);
        const next = { ...deepClone(draft), updatedAt: nowIso() } as WorkoutSession;
        if (index >= 0 && !state.sessions[index].deletedAt &&
          !state.tombstones.some((item) => item.entityType === "session" && item.entityId === draft.id) &&
          (state.sessions[index].status !== "completed" || draft.status === "completed")) state.sessions[index] = next;
      }).then(() => setSavedState(navigator.onLine ? "Saved locally" : "Offline · saved"))
        .catch(() => setSavedState("Not saved · retry the edit"));
    }, 420);
    return () => {
      if (autosaveTimer.current != null) window.clearTimeout(autosaveTimer.current);
    };
  }, [draft, stored?.id, mutate]);

  if (!snapshot || !draft) {
    return <div className="workout-missing"><EmptyState icon={<Dumbbell />} title="Workout not found" description="It may have been deleted or is not available in this profile." action={<Button onClick={() => navigate("/train")}>Back to Train</Button>} /></div>;
  }

  const current = draft.performances[exerciseIndex];
  const effortMode = snapshot.settings.preferredRpeMode;
  const effortLabel = effortMode === "rir" ? "RIR" : effortMode === "both" ? "RPE / RIR" : effortMode === "off" ? "Effort hidden" : "RPE";
  const completedSets = draft.performances.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0);
  const totalSets = draft.performances.reduce((sum, item) => sum + item.sets.length, 0);
  const previousSessions = snapshot.sessions.filter((session) => session.profileId === draft.profileId && session.id !== draft.id && session.status === "completed" && !session.deletedAt && session.actualDate < draft.actualDate).sort((a, b) => b.actualDate.localeCompare(a.actualDate));
  const previous = current ? previousSessions.map((session) => ({ session, performance: session.performances.find((item) => item.exerciseId === current.exerciseId) })).find((item) => item.performance) : undefined;
  const filteredExercises = searchExercise(snapshot.exercises.filter((exercise) => !exercise.deletedAt && !exercise.archived), query).slice(0, 30);

  const updatePerformance = (updater: (performance: ExercisePerformance) => void) => {
    setDraft((value) => {
      if (!value) return value;
      const next = deepClone(value);
      const performance = next.performances[exerciseIndex];
      if (!performance) return next;
      updater(performance);
      performance.updatedAt = nowIso();
      return next;
    });
  };

  const updateSet = (setId: string, patch: Partial<SetResult>) => updatePerformance((performance) => {
    const set = performance.sets.find((item) => item.id === setId);
    if (!set) return;
    Object.assign(set, patch, { updatedAt: nowIso() });
  });

  const completeSet = (set: SetResult) => {
    const nextCompleted = !set.completed;
    const stamp = nowIso();
    setDraft((value) => {
      if (!value) return value;
      const next = deepClone(value);
      const result = next.performances[exerciseIndex]?.sets.find((item) => item.id === set.id);
      if (!result) return next;
      Object.assign(result, { completed: nextCompleted, completedAt: nextCompleted ? stamp : undefined, updatedAt: stamp });
      if (nextCompleted && next.status === "draft" && next.actualDate === todayIso()) {
        next.status = "inProgress";
        next.startedAt = stamp;
      }
      return next;
    });
    if (nextCompleted && snapshot.settings.restTimerEnabled === true) setRestLeft(snapshot.settings.restSeconds);
  };

  const addSet = () => updatePerformance((performance) => {
    const last = performance.sets.at(-1);
    const stamp = nowIso();
    performance.sets.push({
      id: uid("set"), createdAt: stamp, updatedAt: stamp, source: "manual", index: performance.sets.length + 1,
      type: "working", load: last?.load ?? null, unit: last?.unit || "kg", reps: null, rpe: null, rir: null, completed: false,
      prescription: last?.prescription
    });
  });

  const removeSet = (setId: string) => updatePerformance((performance) => {
    const deletedAt = nowIso();
    removedEntitiesRef.current.push({ entityType: "set", entityId: setId, deletedAt, revision: deletedAt });
    performance.sets = performance.sets.filter((set) => set.id !== setId).map((set, index) => ({ ...set, index: index + 1 }));
  });

  const openPicker = (replacementId: string | null = null) => {
    setReplaceId(replacementId); setQuery(""); setMoreOpen(false); setAddOpen(true);
  };

  const addExercise = (exerciseId: string, confirmed = false) => {
    const replacedIndex = replaceId ? draft.performances.findIndex((item) => item.id === replaceId) : -1;
    const replaced = draft.performances[replacedIndex];
    if (replaced && !confirmed && replaced.sets.some((set) => set.completed || set.reps != null || set.durationMinutes != null || set.load != null || set.note)) {
      setAddOpen(false); setReplacementChoice(exerciseId); return;
    }
    const exercise = snapshot.exercises.find((item) => item.id === exerciseId);
    if (!exercise) return;
    const stamp = nowIso();
    if (replaced) removedEntitiesRef.current.push({ entityType: "performance", entityId: replaced.id, deletedAt: stamp, revision: stamp });
    const performance: ExercisePerformance = {
      id: uid("performance"), createdAt: stamp, updatedAt: stamp, source: "manual", exerciseId: exercise.id,
      exerciseNameSnapshot: exercise.name, order: replacedIndex >= 0 ? replacedIndex : draft.performances.length, movement: exercise.movement,
      prescription: { targetSets: 3, targetReps: "8–12" },
      sets: Array.from({ length: 3 }, (_, index) => ({ id: uid("set"), createdAt: stamp, updatedAt: stamp, source: "manual", index: index + 1, type: "working", load: null, unit: exercise.defaultUnit, reps: null, rpe: null, rir: null, completed: false, prescription: { targetReps: "8–12", targetUnit: exercise.defaultUnit } }))
    };
    setDraft((value) => value ? { ...value, performances: replacedIndex >= 0
      ? value.performances.map((item) => item.id === replaceId ? performance : item)
      : [...value.performances, performance] } : value);
    setExerciseIndex(replacedIndex >= 0 ? replacedIndex : draft.performances.length);
    setReplaceId(null); setReplacementChoice(null);
    setAddOpen(false);
    setQuery("");
  };

  const moveExercise = (direction: -1 | 1) => {
    const target = exerciseIndex + direction;
    if (target < 0 || target >= draft.performances.length) return;
    setDraft((value) => {
      if (!value) return value;
      const next = deepClone(value);
      [next.performances[exerciseIndex], next.performances[target]] = [next.performances[target], next.performances[exerciseIndex]];
      next.performances.forEach((item, index) => { item.order = index; });
      return next;
    });
    setExerciseIndex(target);
  };

  const removeExercise = () => {
    if (current) {
      const deletedAt = nowIso();
      removedEntitiesRef.current.push({ entityType: "performance", entityId: current.id, deletedAt, revision: deletedAt });
    }
    setDraft((value) => value ? { ...value, performances: value.performances.filter((_, index) => index !== exerciseIndex).map((item, index) => ({ ...item, order: index })) } : value);
    setExerciseIndex((value) => Math.max(0, Math.min(value, draft.performances.length - 2)));
    setMoreOpen(false);
  };

  const finish = async () => {
    if (discardingRef.current) return;
    discardingRef.current = true; setFinishing(true);
    if (autosaveTimer.current != null) window.clearTimeout(autosaveTimer.current);
    const completedAt = nowIso();
    const measuredDuration = snapshot.settings.workoutTimerEnabled === true ? Math.max(1, Math.round(elapsed / 60)) : undefined;
    const durationMinutes = Number(draft.durationMinutes) || measuredDuration;
    const finished = { ...draft, status: "completed" as const, completedAt, durationMinutes, updatedAt: completedAt };
    try {
      await mutate("Finished workout", (state) => {
        persistRemovals(state, removedEntitiesRef.current);
        const index = state.sessions.findIndex((session) => session.id === draft.id);
        if (index >= 0) state.sessions[index] = finished;
        if (draft.plannedWorkoutId) {
          const plan = state.plannedWorkouts.find((item) => item.id === draft.plannedWorkoutId);
          if (plan) { plan.status = "completed"; plan.updatedAt = completedAt; }
        }
      });
      navigate(`/train/session/${draft.id}`);
    } catch {
      discardingRef.current = false; setFinishing(false); setSavedState("Finish failed · try again");
    }
  };

  const discard = async () => {
    if (discardingRef.current || draft.status === "completed") return;
    discardingRef.current = true;
    setDiscarding(true);
    if (autosaveTimer.current != null) window.clearTimeout(autosaveTimer.current);
    const deletedAt = nowIso();
    try {
      await mutate("Discarded workout", (state) => { discardWorkoutDraft(state, draft.id, deletedAt); });
      navigate("/train", { replace: true });
    } catch {
      discardingRef.current = false;
      setDiscarding(false);
      setSavedState("Discard failed · try again");
    }
  };

  const suggestion = (() => {
    if (!previous?.performance || !current) return null;
    const completed = previous.performance.sets.filter((set) => set.completed && set.reps != null);
    if (!completed.length) return null;
    const best = completed.reduce((winner, set) => epley(set.load ?? 0, set.reps ?? 0) > epley(winner.load ?? 0, winner.reps ?? 0) ? set : winner);
    const targetTop = Number(String(current.prescription?.targetReps || "").match(/(\d+)\D*$/)?.[1] || 0);
    const hitTop = targetTop > 0 && completed.every((set) => (set.reps ?? 0) >= targetTop);
    const increment = best.unit === "lb" ? 5 : 2.5;
    return { text: hitTop ? `Add ${increment} ${best.unit}` : "Repeat and add reps", detail: hitTop ? `All prior sets reached ${targetTop}+ reps.` : `Previous best: ${best.load ?? "—"} ${best.unit} × ${best.reps}.`, load: hitTop ? (best.load ?? 0) + increment : best.load };
  })();

  const applySuggestion = () => {
    if (!suggestion?.load) return;
    updatePerformance((performance) => performance.sets.forEach((set) => { if (!set.completed) set.load = suggestion.load; }));
  };

  const isLiveWorkout = draft.status === "inProgress" && draft.actualDate === todayIso();
  const showWorkoutTimer = isLiveWorkout && snapshot.settings.workoutTimerEnabled === true;
  const sessionModeLabel = draft.status === "completed" ? "Editing completed session" : draft.actualDate < todayIso() ? "Logging a past workout" : draft.status === "draft" ? "Workout draft" : "Workout in progress";

  return (
    <div className="workout-page">
      <header className="workout-top">
        <div className="workout-top-left"><IconButton label="Back to Train" onClick={() => navigate("/train")}><ArrowLeft /></IconButton><div><span className="eyebrow">{sessionModeLabel}</span><h1>{draft.title}</h1><small>{formatShortDate(draft.actualDate, true)} · {savedState}</small></div></div>
        <div className="workout-timers">{showWorkoutTimer && <span><Clock3 />{formatElapsed(elapsed)}</span>}{snapshot.settings.restTimerEnabled === true && restLeft > 0 && <button onClick={() => setRestLeft(0)}><TimerReset />Rest {formatElapsed(restLeft)}<X /></button>}</div>
        <Button variant="primary" onClick={() => setFinishOpen(true)}><CheckCircle2 />Finish</Button>
      </header>
      <ProgressBar value={completedSets} max={Math.max(totalSets, 1)} label="Workout completion" />

      <div className="workout-layout">
        <aside className="exercise-rail">
          <div className="rail-title"><span>Exercises</span><small>{completedSets}/{totalSets} sets</small></div>
          <div className="exercise-nav-list">{draft.performances.map((performance, index) => {
            const done = performance.sets.length > 0 && performance.sets.every((set) => set.completed);
            return <button key={performance.id} className={`${index === exerciseIndex ? "active" : ""} ${done ? "done" : ""}`.trim()} onClick={() => setExerciseIndex(index)}><span>{done ? <Check /> : index + 1}</span><span><strong>{performance.exerciseNameSnapshot}</strong><small>{performance.sets.filter((set) => set.completed).length}/{performance.sets.length} sets</small></span><ChevronDown /></button>;
          })}</div>
          <Button variant="ghost" onClick={() => openPicker()}><Plus />Add exercise</Button>
        </aside>

        <section className="exercise-workspace">
          {current ? <>
            <header className="exercise-workspace-head">
              <div><span className={`movement-dot ${current.movement.toLowerCase()}`} /><div><span className="eyebrow">Exercise {exerciseIndex + 1} of {draft.performances.length} · {current.movement}</span><h2>{current.exerciseNameSnapshot}</h2><p>{current.prescription?.targetSets ? `${current.prescription.targetSets} sets` : ""}{current.prescription?.targetReps ? ` · ${current.prescription.targetReps} reps` : ""}{current.prescription?.note ? ` · ${current.prescription.note}` : ""}</p></div></div>
              <div><IconButton label="Move exercise up" disabled={exerciseIndex === 0} onClick={() => moveExercise(-1)}><ArrowUp /></IconButton><IconButton label="Move exercise down" disabled={exerciseIndex === draft.performances.length - 1} onClick={() => moveExercise(1)}><ArrowDown /></IconButton><IconButton label="Exercise actions" onClick={() => setMoreOpen(true)}><MoreHorizontal /></IconButton></div>
            </header>

            {suggestion && <div className="progression-suggestion"><span><RotateCcw /></span><div><strong>{suggestion.text}</strong><small>{suggestion.detail}</small></div><Button className="small" variant="soft" onClick={applySuggestion}>Apply</Button></div>}

            <div className="set-table">
              <div className="set-table-head"><span>Set</span><span>Previous</span><span>Load</span><span>Reps</span><span>{effortLabel}</span><span>Done</span></div>
              {current.sets.map((set, index) => {
                const previousSet = previous?.performance?.sets[index];
                return <div key={set.id} className={`set-row-v2 ${set.completed ? "completed" : ""}`}>
                  <button className={`set-type ${set.type}`} onClick={() => { const types: SetType[] = ["working", "warmup", "drop", "amrap", "failure", "timed"]; updateSet(set.id, { type: types[(types.indexOf(set.type) + 1) % types.length] }); }} title={`Set type: ${set.type}`}><b>{set.type === "warmup" ? "W" : set.type === "drop" ? "D" : set.type === "amrap" ? "A" : set.index}</b><small>{set.type === "working" ? "work" : set.type}</small></button>
                  <button className="previous-set" disabled={!previousSet} onClick={() => previousSet && updateSet(set.id, { load: previousSet.load, unit: previousSet.unit, reps: previousSet.reps })}><strong>{previousSet?.load ?? "—"} {previousSet?.load != null ? previousSet.unit : ""}</strong><small>{previousSet?.reps != null ? `× ${previousSet.reps}` : "No prior set"}</small></button>
                  <label className="set-input load"><span className="sr-only">Set {set.index} load</span><DecimalInput aria-label={`Set ${set.index} load`} value={set.load} onValueChange={(load) => updateSet(set.id, { load })} /><select aria-label={`Set ${set.index} unit`} value={set.unit} onChange={(event) => updateSet(set.id, { unit: event.target.value as SetResult["unit"] })}><option value="kg">kg</option><option value="lb">lb</option><option value="bodyweight">BW</option><option value="assisted">assist</option><option value="min">min</option></select></label>
                  <label className="set-input"><span className="sr-only">Set {set.index} reps</span><input inputMode="numeric" value={set.reps ?? ""} placeholder={set.prescription?.targetReps || "reps"} onChange={(event) => updateSet(set.id, { reps: event.target.value === "" ? null : Number(event.target.value) })} /></label>
                  {effortMode === "off" ? <span className="set-effort-off" aria-label={`Effort hidden for set ${set.index}`}>—</span> : effortMode === "both" ? <label className="set-input effort dual" data-label="RPE / RIR"><span className="sr-only">Set {set.index} RPE and RIR</span><DecimalInput aria-label={`Set ${set.index} RPE`} value={set.rpe} placeholder="RPE" onValueChange={(rpe) => updateSet(set.id, { rpe })} /><DecimalInput aria-label={`Set ${set.index} RIR`} value={set.rir} placeholder="RIR" onValueChange={(rir) => updateSet(set.id, { rir })} /></label> : <label className="set-input effort" data-label={effortLabel}><span className="sr-only">Set {set.index} {effortLabel}</span><DecimalInput aria-label={`Set ${set.index} ${effortLabel}`} value={effortMode === "rir" ? set.rir : set.rpe} placeholder="—" onValueChange={(value) => updateSet(set.id, effortMode === "rir" ? { rir: value } : { rpe: value })} /></label>}
                  <button className="set-complete" aria-label={`${set.completed ? "Mark incomplete" : "Complete"} set ${set.index}`} aria-pressed={set.completed} onClick={() => completeSet(set)}>{set.completed ? <Check /> : <span />}</button>
                  <div className="set-row-detail"><input value={set.note || ""} onChange={(event) => updateSet(set.id, { note: event.target.value })} placeholder="Optional set note" aria-label={`Set ${set.index} note`} /><IconButton label={`Remove set ${set.index}`} onClick={() => removeSet(set.id)}><Trash2 /></IconButton></div>
                </div>;
              })}
              <button className="add-set-button" onClick={addSet}><Plus />Add set</button>
            </div>

            <div className="exercise-note"><StickyNote /><input value={current.note || ""} onChange={(event) => updatePerformance((performance) => { performance.note = event.target.value; })} placeholder="Exercise note or cue…" aria-label="Exercise note" /></div>
            <div className="exercise-mobile-nav"><Button disabled={exerciseIndex === 0} onClick={() => setExerciseIndex((value) => Math.max(0, value - 1))}><ArrowLeft />Previous</Button><Button variant="primary" disabled={exerciseIndex === draft.performances.length - 1} onClick={() => setExerciseIndex((value) => Math.min(draft.performances.length - 1, value + 1))}>Next<ArrowRight /></Button></div>
          </> : <EmptyState icon={<Dumbbell />} title="Add your first exercise" description="Build an ad-hoc workout without losing the draft." action={<Button variant="primary" onClick={() => openPicker()}><Plus />Add exercise</Button>} />}
        </section>

        <aside className="workout-context">
          <div className="context-card"><span className="context-title"><History />Previous</span>{previous?.performance ? <><strong>{formatShortDate(previous.session.actualDate)}</strong><div className="previous-sets-list">{previous.performance.sets.filter((set) => set.completed).map((set) => <span key={set.id}><b>{set.load ?? "—"} {set.unit}</b><small>× {set.reps ?? "—"} · {set.rpe ? `RPE ${set.rpe}` : "no RPE"}</small></span>)}</div></> : <p>No earlier performance for this exercise.</p>}</div>
          {snapshot.settings.restTimerEnabled === true && <div className="context-card"><span className="context-title"><Clock3 />Rest timer</span><strong>{restLeft ? formatElapsed(restLeft) : `${Math.round(snapshot.settings.restSeconds / 60)}:00`}</strong><div className="rest-actions"><Button className="small" variant={restLeft ? "soft" : "default"} onClick={() => setRestLeft(restLeft ? 0 : snapshot.settings.restSeconds)}>{restLeft ? <Pause /> : <Play />}{restLeft ? "Pause" : "Start"}</Button><Button className="small" variant="ghost" onClick={() => setRestLeft((value) => value + 30)}>+30s</Button></div></div>}
          <PlateCalculator load={current?.sets.find((set) => set.load != null)?.load ?? 0} unit={current?.sets.find((set) => set.load != null)?.unit || "kg"} />
        </aside>
      </div>

      <Modal open={addOpen} title={replaceId ? "Replace exercise" : "Add an exercise"} onClose={() => { setAddOpen(false); setReplaceId(null); setQuery(""); }} className="exercise-picker-modal">
        <div className="picker-search"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search movements, muscles, equipment…" /></div>
        <div className="exercise-picker-list">{!filteredExercises.length && <p>No matching exercises. Try another name.</p>}{filteredExercises.map((exercise) => <button key={exercise.id} onClick={() => addExercise(exercise.id)}><span className={`movement-icon ${exercise.movement.toLowerCase()}`}><Dumbbell /></span><span><strong>{exercise.name}</strong><small>{exercise.movement} · {exercise.defaultUnit}</small></span><Plus /></button>)}</div>
      </Modal>

      <Modal open={moreOpen} title={current?.exerciseNameSnapshot || "Exercise actions"} onClose={() => setMoreOpen(false)}>
        <div className="mobile-more-list">
          <button onClick={() => openPicker()}><Plus />Add exercise<ArrowRight /></button>
          <button onClick={() => openPicker(current?.id || null)}><RotateCcw />Replace exercise<ArrowRight /></button>
          <button onClick={() => { updatePerformance((item) => { item.skipped = !item.skipped; }); setMoreOpen(false); }}><SkipForward />{current?.skipped ? "Include exercise" : "Skip exercise"}<ArrowRight /></button>
          <button onClick={() => { setMoreOpen(false); }}><Calculator />Plate calculator<ArrowRight /></button>
          <button onClick={removeExercise} className="danger-row"><Trash2 />Remove from workout<ArrowRight /></button>
        </div>
      </Modal>

      <Modal open={finishOpen} title="Finish workout" onClose={() => setFinishOpen(false)} className="finish-modal">
        <div className="modal-body finish-summary">
          <div className="finish-metrics"><span><strong>{completedSets}/{totalSets}</strong><small>sets complete</small></span><span><strong>{draft.performances.length}</strong><small>exercises</small></span><span><strong>{Math.round(sessionVolume(draft)).toLocaleString()}</strong><small>kg volume</small></span><span><strong>{draft.durationMinutes || (snapshot.settings.workoutTimerEnabled === true ? Math.max(1, Math.round(elapsed / 60)) : "—")}</strong><small>minutes</small></span></div>
          {completedSets < totalSets && <div className="finish-warning">{totalSets - completedSets} set{totalSets - completedSets === 1 ? " is" : "s are"} incomplete. They remain preserved as incomplete in the session.</div>}
          <div className="field-grid"><Field label="Workout name"><input value={draft.title} onChange={(event) => setDraft((value) => value ? { ...value, title: event.target.value } : value)} /></Field><Field label="Workout date"><input type="date" max={todayIso()} value={draft.actualDate} onChange={(event) => setDraft((value) => value ? { ...value, actualDate: event.target.value } : value)} /></Field><Field label="Duration (minutes)"><input type="number" min="1" step="1" value={draft.durationMinutes ?? ""} placeholder={snapshot.settings.workoutTimerEnabled === true ? String(Math.max(1, Math.round(elapsed / 60))) : "Optional"} onChange={(event) => setDraft((value) => value ? { ...value, durationMinutes: event.target.value === "" ? undefined : Number(event.target.value) } : value)} /></Field><Field label="Session RPE"><DecimalInput min={1} max={10} step={0.5} value={draft.sessionRpe} onValueChange={(sessionRpe) => setDraft((value) => value ? { ...value, sessionRpe } : value)} /></Field><Field label="Energy"><input type="number" min="1" max="10" value={draft.energy ?? ""} onChange={(event) => setDraft((value) => value ? { ...value, energy: event.target.value === "" ? null : Number(event.target.value) } : value)} /></Field></div>
          <Field label="Session notes"><textarea value={draft.notes || ""} onChange={(event) => setDraft((value) => value ? { ...value, notes: event.target.value } : value)} placeholder="What mattered today?" /></Field>
        </div>
          <div className="modal-footer finish-actions">{draft.status !== "completed" ? <Button variant="danger" disabled={discarding || finishing} onClick={() => { setFinishOpen(false); setConfirmDiscard(true); }}>{discarding ? "Discarding…" : "Discard draft"}</Button> : <span />}<span /><Button variant="default" onClick={() => setFinishOpen(false)}>Keep editing</Button><Button variant="primary" disabled={finishing || discarding} onClick={() => void finish()}><CheckCircle2 />Finish & save</Button></div>
      </Modal>
      <Modal open={confirmDiscard} title="Discard this workout draft?" onClose={() => !discarding && setConfirmDiscard(false)}>
        <div className="modal-body"><p>This removes the draft from your active workouts. Completed workout history is kept.</p></div>
        <div className="modal-footer"><Button disabled={discarding} onClick={() => setConfirmDiscard(false)}>Keep draft</Button><Button variant="danger" disabled={discarding} onClick={() => void discard()}>{discarding ? "Discarding…" : "Discard draft"}</Button></div>
      </Modal>
      <Modal open={!!replacementChoice} title="Replace exercise and reset its sets?" onClose={() => { setReplacementChoice(null); setReplaceId(null); }}>
        <div className="modal-body"><p>The selected exercise’s recorded sets will be cleared. Your other exercises and routine are kept.</p></div>
        <div className="modal-footer"><Button onClick={() => { setReplacementChoice(null); setReplaceId(null); }}>Cancel</Button><Button variant="primary" onClick={() => replacementChoice && addExercise(replacementChoice, true)}>Replace exercise</Button></div>
      </Modal>
    </div>
  );
}

function PlateCalculator({ load, unit }: { load: number; unit: SetResult["unit"] }) {
  const [bar, setBar] = useState(unit === "lb" ? 45 : 20);
  const plateUnit = unit === "lb" ? "lb" : "kg";
  const available = unit === "lb" ? [45, 35, 25, 10, 5, 2.5] : [25, 20, 15, 10, 5, 2.5, 1.25];
  let perSide = Math.max(0, (load - bar) / 2);
  const plates: Array<{ plate: number; count: number }> = [];
  for (const plate of available) {
    const count = Math.floor((perSide + .0001) / plate);
    if (count) { plates.push({ plate, count }); perSide -= plate * count; }
  }
  return <div className="context-card plate-card"><span className="context-title"><Calculator />Plate calculator</span><label>Bar <input type="number" value={bar} onChange={(event) => setBar(Number(event.target.value))} /> {plateUnit}</label><div className="plate-stack">{load > 0 ? plates.length ? plates.map((item) => <span key={item.plate} style={{ height: `${30 + item.plate}px` }}><b>{item.plate}</b><small>×{item.count}</small></span>) : <small>Bar only</small> : <small>Enter a load to calculate.</small>}</div>{perSide > .01 && <small className="plate-remainder">Unmatched {perSide.toFixed(2)} {plateUnit} per side</small>}</div>;
}
