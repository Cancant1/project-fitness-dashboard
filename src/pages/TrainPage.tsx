import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import type { Exercise, Unit } from "../data/types";
import { addDays, fmtLongDate, fmtNum, fmtShortDate, fmtShortDateYear, todayIso } from "../lib/format";
import { dayForDate, prescribeDay } from "../plan/engine";
import { PLAN, ensurePlanExercises } from "../plan/bridge";
import { startFreeWorkout, startWorkout } from "../plan/workout";
import type { LiftingDayKey, PrescribedDay } from "../plan/types";
import { Sheet } from "../ui/Sheet";
import { ChevronRight, PlayIcon, PlusIcon } from "../ui/icons";
import { TYPE_NAME, fmtRange, usePlanContext, weekEnd, type PlanContext } from "./plan/planView";
import "./plan/plan.css";

const LIFTING_DAYS: [LiftingDayKey, string][] = [["lower_a", "Lower A"], ["upper_a", "Upper A"], ["lower_b", "Lower B"], ["upper_b", "Upper B"]];

export function TrainPage() {
  const { local } = useStore();
  const navigate = useNavigate();
  const sessions = useRows("sessions");
  const ctx = usePlanContext();
  const today = todayIso();
  const inProgress = sessions.find((s) => s.status === "in_progress");
  const [busy, setBusy] = useState(false);

  async function free() {
    setBusy(true);
    const id = await startFreeWorkout(local, today);
    setBusy(false);
    navigate(`/workout/${id}`);
  }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{fmtLongDate(today)}</p>
          <h1 className="large-title">Workouts</h1>
        </div>
      </header>

      <div className="plan-cols even">
        <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
          {inProgress && (
            <Link to={`/workout/${inProgress.id}`} className="card card-pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, color: "var(--fg)" }}>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span className="row-sub">Workout in progress</span>
                <span style={{ fontWeight: 600 }}>{inProgress.title ?? "Workout"}</span>
              </span>
              <span className="btn btn-primary btn-sm" style={{ height: 44, borderRadius: 22 }}>Continue</span>
            </Link>
          )}

          <NextWorkout ctx={ctx} blocked={!!inProgress} />

          <section className="section">
            <h2 className="section-label">Start something else</h2>
            {ctx.program && <PlanDayPicker ctx={ctx} blocked={!!inProgress} />}
            <div className="card card-pad" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>Empty workout</span>
                <span className="row-sub">No plan; add exercises as you go.</span>
              </span>
              <button className="btn btn-tinted" style={{ height: 44, fontSize: 15, flex: "none" }} disabled={busy || !!inProgress} onClick={() => void free()}>
                <PlusIcon /> Start
              </button>
            </div>
            {inProgress && <p className="row-sub" style={{ margin: "0 4px" }}>Finish or discard the workout in progress first.</p>}
          </section>

          <RecentWorkouts />
        </div>

        <ExerciseLibrary />
      </div>
    </main>
  );
}

/** First lifting day from today on that isn't done yet. */
function NextWorkout({ ctx, blocked }: { ctx: PlanContext; blocked: boolean }) {
  const { local } = useStore();
  const navigate = useNavigate();
  const sessions = useRows("sessions");
  const [busy, setBusy] = useState(false);
  const today = todayIso();
  const program = ctx.program;

  const next = useMemo(() => {
    const first = PLAN.weeks[0]!.startDate;
    const end = weekEnd(PLAN.weeks[PLAN.weeks.length - 1]!);
    // Done = a completed plan session on that date, or one started for that week and day (e.g. done early).
    const mine = sessions.filter((s) => s.status === "completed" && program && s.program_id === program.id);
    const dates = new Set(mine.map((s) => s.date));
    const slots = new Set(mine.map((s) => `${s.program_week_no}:${(s.legacy_ref as { plan?: { dayKey?: string } }).plan?.dayKey ?? ""}`));
    for (let d = today < first ? first : today; d <= end; d = addDays(d, 1)) {
      const slot = dayForDate(PLAN, d);
      if (slot && slot.day.kind === "lifting" && !dates.has(d) && !slots.has(`${slot.week.weekNo}:${slot.day.key}`)) return { date: d, ...slot };
    }
    return null;
  }, [sessions, program, today]);

  if (!program) {
    return (
      <section className="card card-hero">
        <div style={{ padding: "12px 12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="row-sub">Next planned workout</span>
          <span style={{ fontSize: 22, lineHeight: "28px", fontWeight: 700 }}>{PLAN.name} isn't started</span>
          <p className="row-sub" style={{ fontSize: 15 }}>Week 0 starts Mon {fmtShortDate(PLAN.startDate)}. Review it and start it from the Plan page.</p>
        </div>
        <Link to="/plan" className="btn btn-primary btn-block hero-btn">Review the plan</Link>
      </section>
    );
  }
  if (!next) {
    return <section className="card card-pad"><p>No planned workouts left. The plan ended {fmtShortDateYear(weekEnd(PLAN.weeks[PLAN.weeks.length - 1]!))}.</p></section>;
  }

  let day: PrescribedDay | null = null;
  try {
    day = prescribeDay(PLAN, next.week.weekNo, next.day.key, ctx.state, ctx.equipment);
  } catch {
    day = null;
  }
  const when = next.date === today ? "Today" : next.date === addDays(today, 1) ? "Tomorrow" : fmtLongDate(next.date);
  const mains = day?.exercises.filter((e) => e.role === "main").map((e) => e.name.split(",")[0]).join(", ");

  return (
    <section className="card card-hero">
      <div style={{ padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span className="chip chip-accent">Week {next.week.weekNo} · {TYPE_NAME[next.week.type]}</span>
          <span className="row-sub">{when}</span>
        </div>
        <span style={{ fontSize: 26, lineHeight: "32px", fontWeight: 700, letterSpacing: -0.3 }}>{next.day.title}</span>
        <p className="row-sub" style={{ fontSize: 15 }}>
          {day ? `${mains || next.day.focus} · ${day.workingSetCount} sets${day.minutes ? ` · about ${day.minutes} min` : ""}` : "Needs a training max first."}
        </p>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {day ? (
          <button className="btn btn-primary hero-btn" style={{ flex: "1 1 160px" }} disabled={busy || blocked}
            onClick={async () => {
              setBusy(true);
              const ids = await ensurePlanExercises(local);
              const id = await startWorkout(local, program, day!, ids, today);
              setBusy(false);
              navigate(`/workout/${id}`);
            }}>
            <PlayIcon /> {next.date === today ? "Start" : "Start early"}
          </button>
        ) : (
          <Link to="/plan?tab=maxes" className="btn btn-primary hero-btn" style={{ flex: "1 1 160px" }}>Set training max</Link>
        )}
        <Link to={next.date === today ? "/" : `/plan?week=${next.week.weekNo}`} className="btn btn-tinted hero-btn" style={{ flex: "1 1 160px" }}>
          {next.date === today ? "Open Today" : "See the week"}
        </Link>
      </div>
    </section>
  );
}

function PlanDayPicker({ ctx, blocked }: { ctx: PlanContext; blocked: boolean }) {
  const { local } = useStore();
  const navigate = useNavigate();
  const today = todayIso();
  const [weekNo, setWeekNo] = useState(() => Math.max(0, PLAN.weeks.findIndex((w) => today >= w.startDate && today <= weekEnd(w))));
  const [dayKey, setDayKey] = useState<LiftingDayKey>("lower_a");
  const [busy, setBusy] = useState(false);

  let day: PrescribedDay | null = null;
  let error: string | null = null;
  try {
    day = prescribeDay(PLAN, weekNo, dayKey, ctx.state, ctx.equipment);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <span style={{ fontWeight: 600 }}>Start a plan day</span>
      <label className="field select-field" htmlFor="pick-week">
        <span className="sr-only">Week</span>
        <select id="pick-week" value={weekNo} onChange={(e) => setWeekNo(Number(e.target.value))}>
          {PLAN.weeks.map((w) => <option key={w.weekNo} value={w.weekNo}>Week {w.weekNo} · {TYPE_NAME[w.type]} · {fmtRange(w.startDate, weekEnd(w))}</option>)}
        </select>
        <ChevronRight style={{ transform: "rotate(90deg)", color: "var(--fg2)", flex: "none" }} />
      </label>
      <div className="segmented seg-full" role="group" aria-label="Day">
        {LIFTING_DAYS.map(([k, label]) => <button key={k} aria-pressed={dayKey === k} onClick={() => setDayKey(k)}>{label}</button>)}
      </div>
      {day && day.kind === "lifting" ? (
        <p className="row-sub">{day.exercises.length} exercises · {day.workingSetCount} sets{day.minutes ? ` · about ${day.minutes} min` : ""}. Logged as today.</p>
      ) : day ? (
        <p className="row-sub">Nothing to lift on this day this week.</p>
      ) : (
        <p className="row-sub">{error?.includes("Training max") ? "This day needs a training max. Set it on the Plan page." : error}</p>
      )}
      <button className="btn btn-primary" style={{ height: 44, fontSize: 15 }} disabled={!day || day.kind !== "lifting" || busy || blocked}
        onClick={async () => {
          if (!day || !ctx.program) return;
          setBusy(true);
          const ids = await ensurePlanExercises(local);
          const id = await startWorkout(local, ctx.program, day, ids, today);
          setBusy(false);
          navigate(`/workout/${id}`);
        }}>
        <PlayIcon /> Start {LIFTING_DAYS.find(([k]) => k === dayKey)![1]}, week {weekNo}
      </button>
    </div>
  );
}

function RecentWorkouts() {
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const recent = useMemo(() => sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => b.date.localeCompare(a.date) || (b.ended_at ?? b.created_at).localeCompare(a.ended_at ?? a.created_at))
    .slice(0, 10), [sessions]);
  const counts = useMemo(() => {
    const ids = new Set(recent.map((s) => s.id));
    const m = new Map<string, number>();
    for (const s of sets) if (ids.has(s.session_id) && s.kind !== "warmup") m.set(s.session_id, (m.get(s.session_id) ?? 0) + 1);
    return m;
  }, [recent, sets]);

  return (
    <section className="section">
      <div className="section-row">
        <h2 className="section-label" style={{ margin: 0 }}>Recent workouts</h2>
        <Link to="/history" style={{ fontSize: 15, minHeight: 44, display: "inline-flex", alignItems: "center" }}>History</Link>
      </div>
      {recent.length ? (
        <div className="list">
          {recent.map((s) => (
            <Link key={s.id} to={`/session/${s.id}`} className="row" style={{ color: "var(--fg)", padding: "8px 0" }}>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title || s.source.replace(/^sheet:/, "")}</span>
                <span className="row-sub">
                  {fmtShortDateYear(s.date)}{s.date_confidence === "estimated" ? " · date estimated" : s.date_confidence === "week known" ? " · week known" : ""}
                  {" · "}{counts.get(s.id) ?? 0} sets{s.duration_min ? ` · ${fmtNum(s.duration_min, 0)} min` : ""}
                </span>
              </span>
              <ChevronRight style={{ color: "var(--fg2)", flex: "none" }} />
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted" style={{ margin: "0 4px", fontSize: 15 }}>No finished workouts yet.</p>
      )}
    </section>
  );
}

const UNIT_LABEL: Record<Unit, string> = { kg: "kg", lb: "lb", bodyweight: "bodyweight", min: "min", reps: "reps" };
const KIND_LABEL: Record<Exercise["kind"], string> = { main: "Main lift", compound: "Compound", isolation: "Isolation", conditioning: "Conditioning", mobility: "Mobility" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

function ExerciseLibrary() {
  const exercises = useRows("exercises");
  const [query, setQuery] = useState("");
  const [grouped, setGrouped] = useState(false);
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises
      .filter((e) => !e.archived)
      .filter((e) => !q || `${e.name} ${e.aliases.join(" ")} ${e.muscle_direct ?? ""} ${e.equipment ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exercises, query]);

  const groups = useMemo(() => {
    if (!grouped) return [{ label: "", rows: list }];
    const m = new Map<string, Exercise[]>();
    for (const e of list) {
      const k = e.muscle_direct ? cap(e.muscle_direct) : "Other";
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m].sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b))).map(([label, rows]) => ({ label, rows }));
  }, [list, grouped]);

  return (
    <section className="section" style={{ minWidth: 0 }}>
      <div className="section-row">
        <h2 className="section-label" style={{ margin: 0 }}>Exercises · {list.length}</h2>
        <button className="btn btn-plain" style={{ height: 44, fontSize: 15 }} onClick={() => setAdding(true)}><PlusIcon /> New exercise</button>
      </div>
      <label className="field" htmlFor="lib-q">
        <span className="sr-only">Search exercises</span>
        <input id="lib-q" type="search" placeholder="Search name, muscle or equipment" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="segmented seg-full" role="group" aria-label="Order">
        <button aria-pressed={!grouped} onClick={() => setGrouped(false)}>A–Z</button>
        <button aria-pressed={grouped} onClick={() => setGrouped(true)}>By muscle</button>
      </div>
      {groups.map((g) => (
        <div key={g.label || "all"} className="section">
          {g.label && <h3 className="section-label" style={{ marginTop: 8 }}>{g.label}</h3>}
          {g.rows.length > 0 && (
            <div className="list">
              {g.rows.map((e) => (
                <Link key={e.id} to={`/exercise/${e.id}`} className="row lib-row">
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{e.name}</span>
                    <span className="row-sub">
                      {[e.equipment && cap(e.equipment), UNIT_LABEL[e.default_unit], !grouped && e.muscle_direct && cap(e.muscle_direct), !e.available && "not at this gym"].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <ChevronRight style={{ color: "var(--fg2)", flex: "none" }} />
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
      {!list.length && <p className="muted" style={{ margin: "0 4px", fontSize: 15 }}>{query ? "No exercise matches." : "No exercises yet."}</p>}
      {adding && <NewExerciseSheet exercises={exercises} initialName={query.trim()} onClose={() => setAdding(false)} />}
    </section>
  );
}

const EQUIPMENT = ["barbell", "dumbbell", "cable", "machine", "bodyweight", "belt", "kettlebell", "band"];
const MUSCLES = ["quads", "glutes", "adductors", "hamstrings", "calves", "abs", "chest", "back", "front_delts", "side_delts", "rear_delts", "biceps", "triceps", "forearms", "rotator_cuff", "serratus"];

function NewExerciseSheet({ exercises, initialName, onClose }: { exercises: Exercise[]; initialName: string; onClose: () => void }) {
  const { local } = useStore();
  const [name, setName] = useState(initialName);
  const [equipment, setEquipment] = useState("cable");
  const [unit, setUnit] = useState<Unit>("kg");
  const [kind, setKind] = useState<Exercise["kind"]>("isolation");
  const [muscle, setMuscle] = useState("");
  const [busy, setBusy] = useState(false);

  const equipmentOptions = useMemo(() => [...new Set([...EQUIPMENT, ...exercises.map((e) => e.equipment).filter((x): x is string => !!x)])], [exercises]);
  const muscleOptions = useMemo(() => [...new Set([...exercises.map((e) => e.muscle_direct).filter((x): x is string => !!x), ...MUSCLES])].sort(), [exercises]);
  const trimmed = name.trim();
  const duplicate = exercises.find((e) => e.name.trim().toLowerCase() === trimmed.toLowerCase() || e.aliases.some((a) => a.trim().toLowerCase() === trimmed.toLowerCase()));

  async function save() {
    if (!trimmed || duplicate) return;
    setBusy(true);
    await local.save("exercises", {
      name: trimmed, aliases: [], equipment: equipment === "other" ? null : equipment, default_unit: unit, kind,
      muscle_direct: muscle.trim() || null, muscle_indirect: [], available: true, cues: null, archived: false, legacy_ref: {}
    });
    setBusy(false);
    onClose();
  }

  return (
    <Sheet title="New exercise" onClose={onClose}>
      <label className="field-label" htmlFor="ne-name">
        <span>Name</span>
        <span className="field"><input id="ne-name" autoFocus placeholder="Cable Y-raise" value={name} onChange={(e) => setName(e.target.value)} /></span>
      </label>
      {duplicate && <p className="row-sub" style={{ color: "var(--bad)" }}>"{duplicate.name}" already exists.</p>}
      <div className="field-label">
        <span>Logged in</span>
        <div className="segmented seg-full" role="group" aria-label="Default unit">
          {(["kg", "lb", "bodyweight", "min"] as Unit[]).map((u) => <button key={u} aria-pressed={unit === u} onClick={() => setUnit(u)}>{u === "bodyweight" ? "Bodyweight" : u}</button>)}
        </div>
      </div>
      <div className="grid-2">
        <label className="field-label" htmlFor="ne-eq">
          <span>Equipment</span>
          <span className="field select-field">
            <select id="ne-eq" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
              {equipmentOptions.map((x) => <option key={x} value={x}>{cap(x)}</option>)}
              <option value="other">Other</option>
            </select>
          </span>
        </label>
        <label className="field-label" htmlFor="ne-kind">
          <span>Kind</span>
          <span className="field select-field">
            <select id="ne-kind" value={kind} onChange={(e) => setKind(e.target.value as Exercise["kind"])}>
              {(Object.keys(KIND_LABEL) as Exercise["kind"][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </span>
        </label>
      </div>
      <label className="field-label" htmlFor="ne-muscle">
        <span>Main muscle</span>
        <span className="field"><input id="ne-muscle" list="ne-muscles" placeholder="side_delts" value={muscle} onChange={(e) => setMuscle(e.target.value)} /></span>
        <datalist id="ne-muscles">{muscleOptions.map((m) => <option key={m} value={m} />)}</datalist>
      </label>
      <button className="btn btn-primary" disabled={!trimmed || !!duplicate || busy} onClick={() => void save()}>Add exercise</button>
    </Sheet>
  );
}
