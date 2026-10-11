import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Dumbbell, MapPin, MoveRight, Plus, ShieldCheck, Sparkles, X } from "lucide-react";
import { useAppStore } from "../app/AppStore";
import { Button, Card, EmptyState, Field, Modal, PageHeader, Segmented } from "../components/ui";
import { installReturnProgram, plannedFromRoutineDay } from "../domain/factories";
import type { PlannedWorkout } from "../domain/types";
import { activeProfile, addDays, formatShortDate, nowIso, startOfWeek, todayIso } from "../domain/utils";

type PlanView = "Calendar" | "Agenda" | "Blocks";

export function PlanPage() {
  const { snapshot, mutate, createCheckpoint } = useAppStore();
  const navigate = useNavigate();
  const [view, setView] = useState<PlanView>("Calendar");
  const [anchor, setAnchor] = useState(() => todayIso().slice(0, 7));
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [editing, setEditing] = useState<PlannedWorkout | null>(null);
  if (!snapshot) return null;
  const profile = activeProfile(snapshot);
  const plans = snapshot.plannedWorkouts.filter((item) => item.profileId === profile.id && !item.deletedAt).sort((a, b) => a.date.localeCompare(b.date));
  const routines = snapshot.routines.filter((item) => item.profileId === profile.id && !item.deletedAt);
  const blocks = snapshot.blocks.filter((item) => item.profileId === profile.id && !item.deletedAt).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const returnInstalled = routines.some((item) => !!item.returnBlockKey);
  const [year, month] = anchor.split("-").map(Number);
  const monthStart = `${anchor}-01`;
  const start = startOfWeek(monthStart);
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(start, index));
  const upcoming = plans.filter((item) => item.date >= todayIso() && item.status !== "skipped").slice(0, 40);
  const completedPlanIds = new Set(snapshot.sessions.filter((item) => item.status === "completed" && item.plannedWorkoutId).map((item) => item.plannedWorkoutId));

  const shiftMonth = (offset: number) => {
    const date = new Date(Date.UTC(year, month - 1 + offset, 1)); setAnchor(date.toISOString().slice(0, 7));
  };
  const schedule = async (form: HTMLFormElement) => {
    const data = new FormData(form); const [routineId, dayId] = String(data.get("day")).split("::"); const routine = routines.find((item) => item.id === routineId); const day = routine?.days.find((item) => item.id === dayId); if (!routine || !day) return;
    const plan = plannedFromRoutineDay(profile.id, routine.id, day, String(data.get("date")));
    plan.note = String(data.get("note") || "");
    await mutate("Scheduled routine day", (draft) => draft.plannedWorkouts.push(plan)); setScheduleOpen(false);
  };
  const saveMove = async (form: HTMLFormElement) => {
    if (!editing) return; const data = new FormData(form); const stamp = nowIso();
    await mutate("Moved planned workout", (draft) => { const item = draft.plannedWorkouts.find((value) => value.id === editing.id); if (item) { item.originalDate ||= item.date; item.date = String(data.get("date")); item.note = String(data.get("note") || ""); item.status = item.date === item.originalDate ? "planned" : "moved"; item.updatedAt = stamp; } }); setEditing(null);
  };
  const skip = async (plan: PlannedWorkout) => mutate("Skipped planned workout", (draft) => { const item = draft.plannedWorkouts.find((value) => value.id === plan.id); if (item) { item.status = item.status === "skipped" ? "planned" : "skipped"; item.updatedAt = nowIso(); } });
  const installReturn = async () => {
    await createCheckpoint("Before installing Return 8-Week program");
    await mutate("Installed Return 8-Week program", (draft) => installReturnProgram(draft, profile.id));
    setReturnOpen(false);
  };

  return <div className="page plan-page">
    <PageHeader eyebrow="Plan" title="Training calendar" description="Plan forward without rewriting what actually happened." actions={<><Segmented value={view} label="Plan view" options={["Calendar", "Agenda", "Blocks"].map((value) => ({ value: value as PlanView, label: value }))} onChange={setView} /><Button variant="primary" onClick={() => setScheduleOpen(true)}><Plus />Schedule</Button></>} />
    {!returnInstalled && <Card className="return-program-callout"><span className="return-spark"><Sparkles /></span><div><span className="eyebrow">Optional guided plan</span><h2>8-Week Return · Wed + Sat</h2><p>A symptom-aware rebuild with a protected holiday gap, prescribed RIR, and explicit starting loads. It is never installed automatically.</p><div className="return-chips"><span><ShieldCheck />Checkpoint first</span><span><CalendarDays />16 sessions</span><span><Dumbbell />Two days per week</span></div></div><Button variant="soft" onClick={() => setReturnOpen(true)}>Review and install<ChevronRight /></Button></Card>}
    {view === "Calendar" && <Card className="calendar-card"><div className="calendar-toolbar"><Button className="icon-only" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft /></Button><div><h2>{new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)))}</h2><button onClick={() => setAnchor(todayIso().slice(0, 7))}>Today</button></div><Button className="icon-only" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight /></Button></div><div className="calendar-weekdays">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{monthDays.map((date) => { const dayPlans = plans.filter((item) => item.date === date); const daySessions = snapshot.sessions.filter((item) => item.profileId === profile.id && item.actualDate === date && item.status === "completed" && !item.deletedAt); return <div key={date} className={`${date.slice(0, 7) !== anchor ? "outside" : ""} ${date === todayIso() ? "today" : ""}`.trim()}><span className="day-number">{new Date(`${date}T12:00:00`).getDate()}</span>{daySessions.map((session) => <button key={session.id} className="calendar-event completed" onClick={() => navigate(`/train/session/${session.id}`)}><Check /><span>{session.title}</span></button>)}{dayPlans.filter((plan) => !completedPlanIds.has(plan.id)).map((plan) => <button key={plan.id} className={`calendar-event ${plan.status}`} onClick={() => setEditing(plan)}><Dumbbell /><span>{plan.title}</span></button>)}</div>; })}</div></Card>}
    {view === "Agenda" && <Card><div className="card-header"><div><h2>Upcoming agenda</h2><small>Planned dates, moves, and skips stay explicit</small></div><CalendarDays /></div>{upcoming.length ? <div className="agenda-list">{upcoming.map((plan) => <div key={plan.id} className={plan.status === "skipped" ? "skipped" : ""}><span className="agenda-date"><b>{new Date(`${plan.date}T12:00:00`).getDate()}</b><small>{new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(`${plan.date}T12:00:00`))}</small></span><span><strong>{plan.title}</strong><small>{plan.exercises.length} exercises{plan.note ? ` · ${plan.note}` : ""}</small></span><span className={`chip ${plan.status}`}>{plan.status}</span><Button className="small" onClick={() => setEditing(plan)}><MoveRight />Move</Button><Button className="small" variant="ghost" onClick={() => void skip(plan)}>{plan.status === "skipped" ? <Check /> : <X />}{plan.status === "skipped" ? "Restore" : "Skip"}</Button></div>)}</div> : <EmptyState icon={<CalendarDays />} title="Nothing planned next" description="Schedule a routine day, while your completed history remains unchanged." action={<Button variant="primary" onClick={() => setScheduleOpen(true)}>Schedule workout</Button>} />}</Card>}
    {view === "Blocks" && <div className="block-grid">{blocks.length ? blocks.map((block) => <Card key={block.id} className="training-block-card"><span className={`block-status ${block.status || "planned"}`}>{block.status || "planned"}</span><span className="block-icon"><MapPin /></span><span className="eyebrow">{block.phase || "Training block"}</span><h2>{block.name}</h2><p>{block.goal || "No goal recorded"}</p><dl><div><dt>Starts</dt><dd>{formatShortDate(block.startDate)}</dd></div><div><dt>Length</dt><dd>{block.weeks} weeks</dd></div>{block.endDate && <div><dt>Ends</dt><dd>{formatShortDate(block.endDate)}</dd></div>}</dl>{block.notes && <small>{block.notes}</small>}</Card>) : <Card><EmptyState icon={<MapPin />} title="No training blocks yet" description="Install the return plan or create routines and schedule days directly." /></Card>}</div>}
    <Modal open={scheduleOpen} title="Schedule a workout" onClose={() => setScheduleOpen(false)}>{routines.some((item) => item.days.length) ? <form onSubmit={(event) => { event.preventDefault(); void schedule(event.currentTarget); }}><div className="modal-body form-stack"><Field label="Routine day"><select name="day">{routines.flatMap((routine) => routine.days.map((day) => <option key={`${routine.id}::${day.id}`} value={`${routine.id}::${day.id}`}>{routine.name} · {day.title}</option>))}</select></Field><Field label="Date"><input name="date" type="date" min={todayIso()} defaultValue={todayIso()} /></Field><Field label="Plan note"><input name="note" placeholder="Optional context or target" /></Field></div><div className="modal-footer"><Button type="button" onClick={() => setScheduleOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Add to calendar</Button></div></form> : <div className="modal-body"><EmptyState icon={<Dumbbell />} title="Create a routine first" description="A scheduled workout is a dated copy of a routine day." action={<Button onClick={() => navigate("/train/programs")}>Open programs</Button>} /></div>}</Modal>
    <Modal open={!!editing} title="Move planned workout" onClose={() => setEditing(null)}>{editing && <form onSubmit={(event) => { event.preventDefault(); void saveMove(event.currentTarget); }}><div className="modal-body form-stack"><div className="form-intro"><strong>{editing.title}</strong><small>Originally {formatShortDate(editing.originalDate || editing.date)}</small></div><Field label="New date"><input name="date" required type="date" defaultValue={editing.date} /></Field><Field label="Plan note"><input name="note" defaultValue={editing.note || ""} /></Field></div><div className="modal-footer"><Button type="button" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="primary">Save date</Button></div></form>}</Modal>
    <Modal open={returnOpen} title="Install 8-Week Return" onClose={() => setReturnOpen(false)}><div className="modal-body return-review"><div className="safety-banner"><ShieldCheck /><span><strong>A local checkpoint is created first.</strong><small>No history, food, weight, or existing plan is edited.</small></span></div><ul><li>16 planned sessions from 26 August to 24 October 2026</li><li>Wednesday and Saturday A/B sessions</li><li>Protected holiday gap from 4–13 October</li><li>Week-by-week RIR and volume progression</li><li>Starting loads remain editable in the workout logger</li></ul></div><div className="modal-footer"><Button onClick={() => setReturnOpen(false)}>Not now</Button><Button variant="primary" onClick={() => void installReturn()}>Create checkpoint and install</Button></div></Modal>
  </div>;
}
