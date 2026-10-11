import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRows, useStore } from "../../data/store";
import { fmtNum, fmtShortDate, todayIso } from "../../lib/format";
import { getDay, getWeek, prescribeDay } from "../../plan/engine";
import { PLAN, ensurePlanExercises } from "../../plan/bridge";
import { startWorkout } from "../../plan/workout";
import type { PrescribedDay, PrescribedExercise } from "../../plan/types";
import { ChevronDown, ChevronLeft, ChevronRight, PlayIcon } from "../../ui/icons";
import {
  DAY_SHORT, EXAMPLE_TMS, ROLE_NAME, TYPE_NAME, fmtLoad, fmtPct, fmtRange, fmtRest, groupLabel, groupSets, pctOfTm, typeChip,
  weekDays, weekEnd, type PlanContext
} from "./planView";

/** One week: every day with every exercise, set, load and rest. `embedded` drops the back button (desktop column). */
export function WeekDetail({ weekNo, ctx, embedded = false }: { weekNo: number; ctx: PlanContext; embedded?: boolean }) {
  const week = getWeek(PLAN, weekNo);
  const today = todayIso();
  const { days, error } = weekDays(weekNo, ctx);
  const usesTm = week.type !== "calibration" && week.type !== "test";
  const exampleLifts = (["squat", "deadlift"] as const).filter((l) => ctx.example[l]);
  const stepDefault = ctx.state.currentLoads.incline_db_press == null || ctx.state.currentLoads.weighted_pullup == null;
  const prev = weekNo > 0 ? weekNo - 1 : null;
  const next = weekNo < PLAN.weeks.length - 1 ? weekNo + 1 : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
      {!embedded && (
        <Link to={{ search: "" }} className="btn btn-plain" style={{ alignSelf: "flex-start", marginLeft: -8, height: 44 }}><ChevronLeft /> Plan</Link>
      )}
      <header className="page-head" style={{ alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <p className="eyebrow">{fmtRange(week.startDate, weekEnd(week))}</p>
          <h1 className={embedded ? undefined : "large-title"} style={embedded ? { fontSize: 28, fontWeight: 700, letterSpacing: -0.3 } : undefined}>Week {week.weekNo}</h1>
          <div className="week-chips">
            <span className={typeChip(week.type)}>{TYPE_NAME[week.type]}</span>
            {week.checkpoint && <span className="chip chip-plain" style={{ boxShadow: "inset 0 0 0 1.5px var(--fg)", color: "var(--fg)" }}>{week.checkpoint.name} · {fmtShortDate(week.checkpoint.date)}</span>}
            {week.isolationSetDelta ? <span className="chip chip-plain">−1 isolation set</span> : null}
            {week.extraSetsEligible ? <span className="chip chip-plain">Extra sets if checkpoint 1 met</span> : null}
          </div>
        </div>
        <nav style={{ display: "flex", gap: 4, flex: "none" }} aria-label="Other weeks">
          {prev != null
            ? <Link className="btn btn-glass btn-icon" to={{ search: `?week=${prev}` }} aria-label={`Week ${prev}`}><ChevronLeft /></Link>
            : <span className="btn btn-glass btn-icon" aria-hidden="true" style={{ opacity: 0.35 }}><ChevronLeft /></span>}
          {next != null
            ? <Link className="btn btn-glass btn-icon" to={{ search: `?week=${next}` }} aria-label={`Week ${next}`}><ChevronRight style={{ width: 18, height: 18 }} /></Link>
            : <span className="btn btn-glass btn-icon" aria-hidden="true" style={{ opacity: 0.35 }}><ChevronRight style={{ width: 18, height: 18 }} /></span>}
        </nav>
      </header>

      {week.notes.length > 0 && (
        <ul className="list" style={{ margin: 0, padding: "10px 16px 10px 34px", fontSize: 15, display: "flex", flexDirection: "column", gap: 6 }}>
          {week.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

      {usesTm && exampleLifts.length > 0 && (
        <p className="banner">
          <strong>Example loads.</strong>{" "}
          {exampleLifts.map((l) => `${l === "squat" ? "Squat" : "Deadlift"} TM ${EXAMPLE_TMS[l]} kg`).join(", ")} — the plan page's defaults,
          because no training max is set yet. Week 0 sets yours from one rep-out per lift.
        </p>
      )}
      {usesTm && stepDefault && (
        <p className="row-sub" style={{ margin: "0 4px" }}>
          Incline DB and pull-up show {ctx.state.currentLoads.incline_db_press == null ? "the calibration loads (22.5 kg, +5 kg)" : "your last loads"} until week 0 sets them.
          Accessories show start loads until you log them.
        </p>
      )}
      {error && <p className="banner">{error}</p>}

      <div className="plan-days">
        {days.map((d) => <DayCard key={d.dayKey} day={d} ctx={ctx} isToday={d.date === today} />)}
      </div>
      <p className="row-sub" style={{ margin: "0 4px" }}>Loads use your current training maxes and last logged loads; they move as you log rep-outs.</p>
    </div>
  );
}

function DayCard({ day, ctx, isToday }: { day: PrescribedDay; ctx: PlanContext; isToday: boolean }) {
  const def = getDay(PLAN, day.dayKey);
  const shoulder = day.exercises.filter((e) => e.group === "shoulder_care");
  const firstShoulder = day.exercises.findIndex((e) => e.group === "shoulder_care");

  return (
    <section className={`day-card${isToday ? " is-today" : ""}`} aria-label={`${DAY_SHORT[day.weekday - 1]} ${day.title}`}>
      <div className="day-head">
        <div style={{ minWidth: 0 }}>
          <p className="row-sub">{DAY_SHORT[day.weekday - 1]} {fmtShortDate(day.date)}{isToday ? " · today" : ""}</p>
          <h2 className="day-title">{day.title}</h2>
          <p className="row-sub">{def.focus}</p>
        </div>
        {day.kind === "lifting" && (
          <div style={{ textAlign: "right", flex: "none" }}>
            <p className="num" style={{ fontWeight: 600, fontSize: 15 }}>{day.workingSetCount} {day.workingSetCount === 1 ? "set" : "sets"}</p>
            {day.minutes && PLAN.weekTypeRules[day.weekType].accessorySetCap === null && <p className="row-sub">≈ {day.minutes} min{day.minutesAlternating ? ` (${day.minutesAlternating} alternating)` : ""}</p>}
          </div>
        )}
      </div>

      {day.kind === "lifting" && (
        <div>
          {day.exercises.map((ex, i) => ex.group === "shoulder_care"
            ? (i === firstShoulder ? <ShoulderBlock key="shoulder" exercises={shoulder} ctx={ctx} /> : null)
            : <ExerciseItem key={ex.exerciseKey} ex={ex} ctx={ctx} weekType={day.weekType} />)}
        </div>
      )}

      {day.kind !== "lifting" && <ConditioningBody day={day} />}

      {(day.notes.length > 0) && (
        <ul className="ex-notes" style={{ paddingTop: 2 }}>
          {day.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

      {day.kind === "lifting" && ctx.program && <StartDay day={day} ctx={ctx} />}
    </section>
  );
}

function ShoulderBlock({ exercises, ctx }: { exercises: PrescribedExercise[]; ctx: PlanContext }) {
  return (
    <div className="shoulder-block">
      <p className="block-label">Shoulder care block · first, about 10 min · not to failure, 3 s down</p>
      {exercises.map((ex) => <ExerciseItem key={ex.exerciseKey} ex={ex} ctx={ctx} />)}
    </div>
  );
}

function ExerciseItem({ ex, ctx, weekType }: { ex: PrescribedExercise; ctx: PlanContext; weekType?: string }) {
  const groups = groupSets(ex);
  const warmups = ex.sets.filter((s) => s.kind === "warmup");
  const tmLift = ex.mainLift === "squat" || ex.mainLift === "deadlift" ? ex.mainLift : null;
  const tm = tmLift ? ctx.preview.trainingMaxes[tmLift] : undefined;
  const isMain = ex.role === "main";
  const hasRepOut = ex.sets.some((s) => s.kind === "rep_out" || s.kind === "top");

  return (
    <div className="plan-ex">
      <div className="plan-ex-head">
        <span className="plan-ex-name"><span className="plan-ex-order">{ex.order}</span>{ex.name}</span>
        {isMain ? <span className="chip chip-accent" style={{ height: 22, fontSize: 12, flex: "none" }}>Main</span>
          : ex.role !== "shoulder" && <span className="row-sub" style={{ flex: "none" }}>{ROLE_NAME[ex.role]}</span>}
      </div>

      {groups.map((g, i) => {
        const pct = weekType === "calibration" ? null : g.pctTm ?? pctOfTm(ex, g.load, ctx.preview.trainingMaxes);
        return (
          <div key={i} className={`set-line${g.kind === "rep_out" || g.kind === "failure" ? " warm" : ""}`}>
            <span>{groupLabel(g)}</span>
            <span>
              <span className="load">{fmtLoad(g.load, g.unit, ex.loadBasis)}</span>
              {pct != null && <span className="pct">{fmtPct(pct)} TM</span>}
            </span>
          </div>
        );
      })}

      {tmLift && (
        <p className="ex-meta">
          {weekType === "calibration" ? "This rep-out sets your training max." : <>TM <span className="num">{fmtNum(tm)}</span> kg{ctx.example[tmLift] ? " (example)" : ""}</>}
        </p>
      )}
      <p className="ex-meta">
        {ex.mainLift === "deadlift" && hasRepOut ? "Ramp sets" : "Rest"} {fmtRest(ex.restSec)}{ex.mainLift === "deadlift" && hasRepOut ? " apart" : ""}{hasRepOut && ex.restBeforeRepOutSec && ex.restBeforeRepOutSec !== ex.restSec ? `, ${fmtRest(ex.restBeforeRepOutSec)} before the ${ex.mainLift === "deadlift" ? "top set" : "rep-out"}` : ""}
      </p>
      {ex.notes.length > 0 && <ul className="ex-notes">{ex.notes.map((n) => <li key={n}>{n}</li>)}</ul>}

      {warmups.length > 0 && (
        <details className="disclosure">
          <summary>Warm-up ramp · {warmups.length} sets <ChevronDown style={{ width: 14, height: 14 }} /></summary>
          <div className="ramp">
            {warmups.map((w, i) => {
              const pct = weekType === "calibration" ? null : pctOfTm(ex, w.load, ctx.preview.trainingMaxes);
              return (
                <div key={i}>
                  <span className="muted">{w.note && w.note !== fmtLoad(w.load, w.unit, ex.loadBasis) ? w.note : `Warm-up ${i + 1}`}</span>
                  <span><span className="num">{fmtLoad(w.load, w.unit, ex.loadBasis)} × {w.reps}</span>{pct != null && <span className="muted num" style={{ marginLeft: 6 }}>{fmtPct(pct)}</span>}</span>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function ConditioningBody({ day }: { day: PrescribedDay }) {
  const c = day.conditioning;
  const rule = getDay(PLAN, day.dayKey).conditioning;
  if (!c || c.skipped) return <p style={{ fontSize: 15 }}>No session this week.{day.weekType === "test" ? " Skip Sunday rounds in the PR test week." : ""}</p>;
  if (c.kind === "ride") return <p style={{ fontSize: 15 }}><span className="num" style={{ fontWeight: 600 }}>{c.minutes} min</span> easy ride at talking pace: full sentences, nose breathing.</p>;
  if (c.kind === "boxing") return <p style={{ fontSize: 15 }}><span className="num" style={{ fontWeight: 600 }}>{c.minutes} min</span> boxing class.</p>;
  const r = rule?.kind === "rounds" ? rule : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <p style={{ fontSize: 15 }}>
        {c.warmupMin} min warm-up, then <span className="num" style={{ fontWeight: 600 }}>{c.rounds} rounds</span> of {fmtRest(c.workSec ?? 120)} hard / {fmtRest(c.easySec ?? 60)} easy.
      </p>
      {r && (
        <p className="ex-meta">
          {day.weekType === "deload" ? "Deload: half the rounds. " : ""}Starts at {r.startRounds}; last round within {Math.round(r.dropOffFraction * 100)}% of the first → +1 round next week, up to {r.maxRounds}.
        </p>
      )}
    </div>
  );
}

function StartDay({ day, ctx }: { day: PrescribedDay; ctx: PlanContext }) {
  const { local } = useStore();
  const navigate = useNavigate();
  const sessions = useRows("sessions");
  const [busy, setBusy] = useState(false);
  const inProgress = sessions.find((s) => s.status === "in_progress");

  // Start from the real state only: never from example training maxes.
  let real: PrescribedDay | null = null;
  try {
    real = prescribeDay(PLAN, day.weekNo, day.dayKey, ctx.state, ctx.equipment);
  } catch {
    real = null;
  }

  if (inProgress) {
    return <Link to={`/workout/${inProgress.id}`} className="btn btn-glass btn-block" style={{ height: 44, fontSize: 15 }}>Workout in progress · Continue</Link>;
  }
  if (!real) {
    return <Link to={{ search: "?tab=maxes" }} className="btn btn-tinted btn-block" style={{ height: 44, fontSize: 15 }}>Set your training max to start this</Link>;
  }
  const program = ctx.program!;
  return (
    <button className="btn btn-primary btn-block" style={{ height: 44, fontSize: 15 }} disabled={busy}
      onClick={async () => {
        setBusy(true);
        const ids = await ensurePlanExercises(local);
        const id = await startWorkout(local, program, real!, ids, todayIso());
        setBusy(false);
        navigate(`/workout/${id}`);
      }}>
      <PlayIcon /> Start this workout
    </button>
  );
}
