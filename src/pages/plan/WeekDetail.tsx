import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRows, useStore } from "../../data/store";
import { fmtNum, fmtShortDate, todayIso } from "../../lib/format";
import { getWeek } from "../../plan/engine";
import { ensurePlanExercises } from "../../plan/bridge";
import { startWorkout } from "../../plan/workout";
import type { DayKey, PrescribedDay, PrescribedExercise, WeekType } from "../../plan/types";
import { Card, Label, Pill } from "../../ui/kit";
import { CheckIcon, ChevronDown, PlayIcon } from "../../ui/icons";
import {
  DAY_SHORT, dayDef, doneSlots, fmtLoadShort, fmtPct, fmtRest, mainSummary, rowSummary, shortName, tryDay, weekDays,
  type PlanContext
} from "./planView";

/** The selected week: four lifting cards, the three conditioning days as chips, notes behind a disclosure. */
export function WeekDays({ weekNo, ctx, onSetMax }: { weekNo: number; ctx: PlanContext; onSetMax: () => void }) {
  const week = getWeek(ctx.plan, weekNo);
  const today = todayIso();
  const sessions = useRows("sessions");
  const { slots } = doneSlots(sessions, ctx.program);
  const { days, error } = weekDays(weekNo, ctx);
  const lifting = days.filter((d) => dayDef(d.dayKey).kind === "lifting");
  const cardio = days.filter((d) => dayDef(d.dayKey).kind === "conditioning");
  const usesTm = week.type !== "calibration" && week.type !== "test";
  const example = usesTm && (ctx.example.squat || ctx.example.deadlift);

  return (
    <section className="pl-week" aria-label={`Week ${weekNo} sessions`}>
      <Label action={example ? <span className="k-pill k-pill-plain" title="No training max yet: loads use squat 140, deadlift 200">Example loads</span> : undefined}>
        Week {weekNo} sessions
      </Label>
      {error && <Card className="pl-error"><span className="k-muted">{error}</span></Card>}
      <div className="pl-days">
        {lifting.map((d) => (
          <DayCard key={d.dayKey} day={d} ctx={ctx} isToday={d.date === today} done={slots.has(`${weekNo}:${d.dayKey}`)} onSetMax={onSetMax} />
        ))}
      </div>
      {cardio.length > 0 && (
        <div className="k-grid-3 pl-chips">
          {cardio.map((d) => <CardioChip key={d.dayKey} day={d} isToday={d.date === today} />)}
        </div>
      )}
      {week.notes.length > 0 && (
        <details className="pl-more pl-week-notes">
          <summary>Week notes <ChevronDown style={{ width: 14, height: 14 }} /></summary>
          <ul>{week.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </details>
      )}
    </section>
  );
}

function DayCard({ day, ctx, isToday, done, onSetMax }: { day: PrescribedDay; ctx: PlanContext; isToday: boolean; done: boolean; onSetMax: () => void }) {
  return (
    <Card className={`pl-day${isToday ? " is-today" : ""}`} aria-label={`${DAY_SHORT[day.weekday - 1]} ${day.title}`}>
      <div className="pl-day-head">
        <div className="pl-day-id">
          <span className="pl-day-when">{isToday && <i className="pl-today-dot" />}{DAY_SHORT[day.weekday - 1]} {fmtShortDate(day.date)}</span>
          <h3 className="pl-day-title">{day.title}</h3>
        </div>
        {done ? <Pill tone="good"><CheckIcon /> Done</Pill>
          : day.kind === "lifting" && <span className="pl-day-sets"><b>{day.workingSetCount}</b> {day.workingSetCount === 1 ? "set" : "sets"}</span>}
      </div>
      {day.kind === "lifting" ? <DayBody day={day} ctx={ctx} /> : <p className="k-muted pl-day-rest">No lifting</p>}
      {day.kind === "lifting" && ctx.program && !done && (
        <StartDay weekNo={day.weekNo} dayKey={day.dayKey} ctx={ctx} onSetMax={onSetMax} primary={isToday} />
      )}
    </Card>
  );
}

/** Main lifts as highlighted blocks, everything else as compact rows, warm-ups and notes behind a disclosure. */
export function DayBody({ day, ctx }: { day: PrescribedDay; ctx: PlanContext }) {
  const fixed = day.weekType === "calibration" || day.weekType === "test";
  const mains = day.exercises.filter((e) => e.role === "main");
  const shoulder = day.exercises.filter((e) => e.group === "shoulder_care");
  const rows = day.exercises.filter((e) => e.role !== "main" && e.group !== "shoulder_care");
  const notes = [...day.notes, ...mains.flatMap((m) => m.notes)];

  return (
    <div className="pl-day-body">
      {mains.map((m) => <MainBlock key={m.exerciseKey} ex={m} ctx={ctx} weekType={day.weekType} />)}
      {(rows.length > 0 || shoulder.length > 0) && (
        <div className="pl-rows">
          {shoulder.length > 0 && (
            <div className="pl-row">
              <span className="pl-row-name">Shoulder care</span>
              <span className="pl-row-scheme">{shoulder.length} × 2</span>
              <span className="pl-row-load k-muted">first</span>
            </div>
          )}
          {rows.map((e) => <Row key={e.exerciseKey} ex={e} />)}
        </div>
      )}
      <details className="pl-more">
        <summary>Warm-up &amp; notes <ChevronDown style={{ width: 14, height: 14 }} /></summary>
        <div className="pl-more-body">
          {mains.map((m) => {
            const s = mainSummary(m, ctx.preview.trainingMaxes, fixed);
            return s.warmups.length > 0 && (
              <div key={m.exerciseKey} className="pl-ramp">
                <span className="pl-ramp-title">{shortName(m)} warm-up · {fmtRest(m.restBeforeRepOutSec ?? m.restSec)} before the {m.mainLift === "deadlift" ? "top set" : "rep-out"}</span>
                {s.warmups.map((w, i) => (
                  <div key={i}><span className="k-muted">{w.note ?? `Warm-up ${i + 1}`}</span><span className="k-num">{fmtLoadShort(w.load, w.unit, m.loadBasis)} × {w.reps}</span></div>
                ))}
              </div>
            );
          })}
          {shoulder.length > 0 && (
            <div className="pl-ramp">
              <span className="pl-ramp-title">Shoulder care · not to failure, 3 s down</span>
              {shoulder.map((e) => {
                const r = rowSummary(e);
                return <div key={e.exerciseKey}><span className="k-muted">{shortName(e)}</span><span className="k-num">{r.scheme} · {r.load}</span></div>;
              })}
            </div>
          )}
          {notes.length > 0 && <ul className="pl-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </div>
      </details>
    </div>
  );
}

function MainBlock({ ex, ctx, weekType }: { ex: PrescribedExercise; ctx: PlanContext; weekType: WeekType }) {
  const calibration = weekType === "calibration";
  const s = mainSummary(ex, ctx.preview.trainingMaxes, calibration || weekType === "test");
  return (
    <div className="pl-main">
      <div className="pl-main-l">
        <span className="pl-main-name">{shortName(ex)}</span>
        <span className="pl-main-scheme">
          {s.scheme}{s.scheme && s.repOut ? " · " : ""}{s.repOut && <b>{s.repOut}</b>}
        </span>
        <SwapPill ex={ex} />
      </div>
      <div className="pl-main-r">
        <span className="pl-main-load">{s.loadText}<small>kg</small></span>
        {weekType === "test" ? <span className="pl-main-pct">goal</span>
          : s.pct != null ? <span className="pl-main-pct">{fmtPct(s.pct)} TM</span>
          : ex.loadBasis === "per_hand" ? <span className="pl-main-pct">each hand</span>
            : calibration && (ex.mainLift === "squat" || ex.mainLift === "deadlift") ? <span className="pl-main-pct">sets TM</span> : null}
      </div>
    </div>
  );
}

function Row({ ex }: { ex: PrescribedExercise }) {
  const r = rowSummary(ex);
  return (
    <div className="pl-row" title={ex.name}>
      <span className="pl-row-name">{shortName(ex)}</span>
      <span className="pl-row-scheme">{r.repOut && <i className="pl-ro-dot" title="Last set is a rep-out" />}{r.scheme}</span>
      <span className="pl-row-load">{r.load}</span>
      <SwapPill ex={ex} />
    </div>
  );
}

/** A running coach swap (pain rule) on this exercise: "Swap: … until 3 Nov". Phase 1 is advisory: the slot stays. */
function SwapPill({ ex }: { ex: PrescribedExercise }) {
  const note = ex.notes.find((n) => n.startsWith("Swap:"));
  return note ? <span className="k-pill k-pill-warm k-pill-wrap pl-swap">{note}</span> : null;
}

function CardioChip({ day, isToday }: { day: PrescribedDay; isToday: boolean }) {
  const c = day.conditioning;
  const value = !c || c.skipped ? "Rest"
    : c.kind === "rounds" ? `${c.rounds} × ${fmtNum((c.workSec ?? 120) / 60)} min`
      : `${c.minutes} min`;
  const name = { easy_ride: "Ride", boxing: "Boxing", rounds: "Rounds" }[day.dayKey as "easy_ride" | "boxing" | "rounds"] ?? day.title;
  return (
    <div className={`k-card pl-chip${isToday ? " is-today" : ""}`}>
      <span className="pl-chip-day">{isToday && <i className="pl-today-dot" />}{DAY_SHORT[day.weekday - 1]}</span>
      <span className="pl-chip-name">{name}</span>
      <span className="pl-chip-val">{value}</span>
    </div>
  );
}

/**
 * Starts a plan day from the REAL state (never example training maxes), logged as today.
 * Without a programme it offers to start the plan; without a training max, to set one.
 */
export function StartDay({ weekNo, dayKey, ctx, onSetMax, onStartPlan, primary = false, label = "Start", onStarted }: {
  weekNo: number; dayKey: DayKey; ctx: PlanContext; onSetMax?: () => void; onStartPlan?: () => void; primary?: boolean; label?: string; onStarted?: () => void;
}) {
  const { local } = useStore();
  const navigate = useNavigate();
  const sessions = useRows("sessions");
  const [busy, setBusy] = useState(false);
  const inProgress = sessions.find((s) => s.status === "in_progress");

  if (inProgress) {
    return <Link to={`/workout/${inProgress.id}`} className="btn btn-tinted pl-start">Continue workout</Link>;
  }
  if (!ctx.program) {
    return onStartPlan ? <button type="button" className="btn btn-primary pl-start" onClick={onStartPlan}>Start the plan</button> : null;
  }
  const real = tryDay(weekNo, dayKey, ctx.state, ctx.equipment, ctx.plan);
  if (!real) {
    return onSetMax ? <button type="button" className="btn btn-tinted pl-start" onClick={onSetMax}>Set training max</button> : null;
  }
  if (real.kind !== "lifting") return null;
  const program = ctx.program;
  return (
    <button type="button" className={`btn ${primary ? "btn-primary" : "btn-tinted"} pl-start`} disabled={busy}
      onClick={async () => {
        setBusy(true);
        const ids = await ensurePlanExercises(local);
        const id = await startWorkout(local, program, real, ids, todayIso());
        setBusy(false);
        onStarted?.();
        navigate(`/workout/${id}`);
      }}>
      <PlayIcon /> {label}
    </button>
  );
}
