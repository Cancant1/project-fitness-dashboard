import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, ChevronDown, ChevronUp, Dumbbell, Plus, Search, Star, Trash2, X } from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { Button, Card, EmptyState, Field, Modal, PageHeader } from "../../components/ui";
import type { PlannedExercise, RoutineDay, Unit } from "../../domain/types";
import { activeProfile, nowIso, searchExercise, uid } from "../../domain/utils";

export function ProgramsPage() {
  const { snapshot, mutate } = useAppStore();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [exerciseTarget, setExerciseTarget] = useState<{ routineId: string; dayId: string } | null>(null);
  const [exerciseQuery, setExerciseQuery] = useState("");
  if (!snapshot) return null;
  const profile = activeProfile(snapshot);
  const routines = snapshot.routines.filter((item) => item.profileId === profile.id && !item.deletedAt);

  const setActive = async (id: string) => {
    await mutate("Changed active routine", (draft) => {
      draft.routines.forEach((routine) => {
        if (routine.profileId === profile.id) {
          routine.active = routine.id === id;
          routine.updatedAt = nowIso();
        }
      });
      const target = draft.profiles.find((item) => item.id === profile.id);
      if (target) { target.activeRoutineId = id; target.updatedAt = nowIso(); }
    });
  };

  const createRoutine = async () => {
    if (!name.trim()) return;
    const stamp = nowIso();
    const day: RoutineDay = { id: uid("routine-day"), day: "Day 1", title: "Day 1", exercises: [] };
    await mutate("Created routine", (draft) => {
      draft.routines.push({ id: uid("routine"), createdAt: stamp, updatedAt: stamp, source: "manual", profileId: profile.id, name: name.trim(), days: [day], active: false });
    });
    setName("");
    setCreateOpen(false);
  };

  const archive = async (id: string) => {
    await mutate("Archived routine", (draft) => {
      const routine = draft.routines.find((item) => item.id === id);
      if (!routine) return;
      routine.deletedAt = nowIso();
      routine.updatedAt = routine.deletedAt;
      draft.tombstones.push({ entityType: "routine", entityId: id, deletedAt: routine.deletedAt, revision: routine.updatedAt });
    });
  };
  const addDay = async (routineId: string) => {
    await mutate("Added routine day", (draft) => {
      const routine = draft.routines.find((item) => item.id === routineId); if (!routine) return;
      const number = routine.days.length + 1;
      routine.days.push({ id: uid("routine-day"), day: `Day ${number}`, title: `Day ${number}`, exercises: [] });
      routine.updatedAt = nowIso();
    });
  };
  const removeDay = async (routineId: string, dayId: string) => {
    await mutate("Removed routine day", (draft) => { const routine = draft.routines.find((item) => item.id === routineId); if (routine && routine.days.length > 1) { routine.days = routine.days.filter((day) => day.id !== dayId); routine.updatedAt = nowIso(); } });
  };
  const addExercise = async (exerciseId: string) => {
    if (!exerciseTarget) return;
    const exercise = snapshot.exercises.find((item) => item.id === exerciseId); if (!exercise) return;
    await mutate("Added exercise to routine", (draft) => {
      const routine = draft.routines.find((item) => item.id === exerciseTarget.routineId); const day = routine?.days.find((item) => item.id === exerciseTarget.dayId); if (!routine || !day || day.exercises.some((item) => item.exerciseId === exerciseId)) return;
      day.exercises.push({ id: uid("planned-exercise"), exerciseId, nameSnapshot: exercise.name, order: day.exercises.length, targetSets: 3, targetReps: "8–12", unit: exercise.defaultUnit }); routine.updatedAt = nowIso();
    });
    setExerciseTarget(null); setExerciseQuery("");
  };
  const updateExercise = async (routineId: string, dayId: string, exerciseId: string, patch: Partial<PlannedExercise>) => {
    await mutate("Updated routine exercise", (draft) => { const routine = draft.routines.find((item) => item.id === routineId); const exercise = routine?.days.find((item) => item.id === dayId)?.exercises.find((item) => item.id === exerciseId); if (routine && exercise) { Object.assign(exercise, patch); routine.updatedAt = nowIso(); } });
  };
  const moveExercise = async (routineId: string, dayId: string, exerciseId: string, direction: -1 | 1) => {
    await mutate("Reordered routine exercise", (draft) => { const routine = draft.routines.find((item) => item.id === routineId); const day = routine?.days.find((item) => item.id === dayId); if (!routine || !day) return; const index = day.exercises.findIndex((item) => item.id === exerciseId); const target = index + direction; if (index < 0 || target < 0 || target >= day.exercises.length) return; [day.exercises[index], day.exercises[target]] = [day.exercises[target], day.exercises[index]]; day.exercises.forEach((item, order) => { item.order = order; }); routine.updatedAt = nowIso(); });
  };
  const removeExercise = async (routineId: string, dayId: string, exerciseId: string) => {
    await mutate("Removed routine exercise", (draft) => { const routine = draft.routines.find((item) => item.id === routineId); const day = routine?.days.find((item) => item.id === dayId); if (routine && day) { day.exercises = day.exercises.filter((item) => item.id !== exerciseId).map((item, order) => ({ ...item, order })); routine.updatedAt = nowIso(); } });
  };
  const exerciseChoices = searchExercise(snapshot.exercises.filter((item) => !item.deletedAt && !item.archived), exerciseQuery).slice(0, 40);

  return (
    <div className="page programs-page">
      <PageHeader eyebrow="Train · Programs" title="Programs and routines" description="Reusable training days live here. Activating one never changes historical sessions." actions={<><Button onClick={() => navigate("/train")}><ArrowLeft />Train</Button><Button variant="primary" onClick={() => setCreateOpen(true)}><Plus />New routine</Button></>} />
      {routines.length ? <div className="program-list">{routines.map((routine) => {
        const isExpanded = expanded === routine.id;
        return <Card key={routine.id} className={`program-card ${routine.active ? "active" : ""}`.trim()}>
          <div className="program-summary">
            <span className="program-mark"><CalendarDays /></span>
            <div><div className="title-row"><h2>{routine.name}</h2>{routine.active && <span className="chip success"><Check />Active</span>}</div><p>{routine.description || `${routine.days.length} training day${routine.days.length === 1 ? "" : "s"}`}</p></div>
            <div className="program-actions">{!routine.active && <Button className="small" variant="soft" onClick={() => void setActive(routine.id)}><Star />Make active</Button>}<Button className="small" onClick={() => setExpanded(isExpanded ? null : routine.id)}>{isExpanded ? "Collapse" : "View"}{isExpanded ? <ChevronUp /> : <ChevronDown />}</Button></div>
          </div>
          {isExpanded && <div className="program-days">{routine.days.map((day) => <div key={day.id} className="program-day"><header><div><span className="eyebrow">{day.day}</span><strong>{day.title}</strong>{day.focus && <small>{day.focus}</small>}</div><div className="day-head-actions"><span>{day.exercises.length} exercises</span><Button className="small" variant="ghost" onClick={() => setExerciseTarget({ routineId: routine.id, dayId: day.id })}><Plus />Exercise</Button>{routine.days.length > 1 && <button aria-label={`Remove ${day.title}`} onClick={() => void removeDay(routine.id, day.id)}><X /></button>}</div></header>{day.exercises.length ? <ol>{[...day.exercises].sort((a, b) => a.order - b.order).map((exercise, exerciseIndex) => <li key={exercise.id} className="routine-exercise-row"><span><Dumbbell /></span><div><strong>{exercise.nameSnapshot}</strong><span className="routine-prescription"><label><small>Sets</small><input type="number" min="1" max="20" defaultValue={exercise.targetSets} onBlur={(event) => void updateExercise(routine.id, day.id, exercise.id, { targetSets: Number(event.target.value) || 1 })} /></label><label><small>Reps</small><input defaultValue={exercise.targetReps} onBlur={(event) => void updateExercise(routine.id, day.id, exercise.id, { targetReps: event.target.value || "—" })} /></label><label><small>Load</small><input type="number" min="0" step="0.5" defaultValue={exercise.targetLoad ?? ""} onBlur={(event) => void updateExercise(routine.id, day.id, exercise.id, { targetLoad: event.target.value === "" ? undefined : Number(event.target.value) })} /></label><label><small>Unit</small><select defaultValue={exercise.unit} onChange={(event) => void updateExercise(routine.id, day.id, exercise.id, { unit: event.target.value as Unit })}>{["kg", "lb", "bodyweight", "assisted", "min", "reps"].map((value) => <option key={value}>{value}</option>)}</select></label></span></div><span className="routine-row-actions"><button aria-label="Move up" disabled={exerciseIndex === 0} onClick={() => void moveExercise(routine.id, day.id, exercise.id, -1)}><ArrowUp /></button><button aria-label="Move down" disabled={exerciseIndex === day.exercises.length - 1} onClick={() => void moveExercise(routine.id, day.id, exercise.id, 1)}><ArrowDown /></button><button aria-label="Remove exercise" onClick={() => void removeExercise(routine.id, day.id, exercise.id)}><Trash2 /></button></span></li>)}</ol> : <button className="inline-empty add-inline" onClick={() => setExerciseTarget({ routineId: routine.id, dayId: day.id })}><Plus />Add the first exercise</button>}</div>)}</div>}
          {isExpanded && <div className="program-footer"><Button className="small" onClick={() => void addDay(routine.id)}><Plus />Add day</Button>{!routine.returnBlockKey && <Button className="small" variant="danger" onClick={() => void archive(routine.id)}><Trash2 />Archive routine</Button>}</div>}
        </Card>;
      })}</div> : <Card><EmptyState icon={<CalendarDays />} title="No routines yet" description="Create a routine, or install the guided return program from Plan." action={<Button variant="primary" onClick={() => setCreateOpen(true)}>Create routine</Button>} /></Card>}

      <Modal open={createOpen} title="Create a routine" onClose={() => setCreateOpen(false)}>
        <div className="modal-body form-stack"><Field label="Routine name" hint="You can add exercises when you start its first day."><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Upper / lower" onKeyDown={(event) => event.key === "Enter" && void createRoutine()} /></Field></div>
        <div className="modal-footer"><Button onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="primary" disabled={!name.trim()} onClick={() => void createRoutine()}>Create routine</Button></div>
      </Modal>
      <Modal open={!!exerciseTarget} title="Add exercise to routine" onClose={() => { setExerciseTarget(null); setExerciseQuery(""); }}><div className="picker-search"><Search /><input autoFocus value={exerciseQuery} onChange={(event) => setExerciseQuery(event.target.value)} placeholder="Search movements, muscles, equipment…" /></div><div className="exercise-picker-list">{exerciseChoices.map((exercise) => <button key={exercise.id} onClick={() => void addExercise(exercise.id)}><span className={`movement-icon ${exercise.movement.toLowerCase()}`}><Dumbbell /></span><span><strong>{exercise.name}</strong><small>{exercise.movement} · {exercise.defaultUnit}</small></span><Plus /></button>)}</div></Modal>
    </div>
  );
}
