import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import { addDays, fmtLongDate, fmtNum, fmtShortDate, fmtShortDateYear, todayIso } from "../lib/format";
import { startFreeWorkout } from "../plan/workout";
import type { LiftingDayKey } from "../plan/types";
import { Card, Label, Pill, Segmented } from "../ui/kit";
import { Sheet } from "../ui/Sheet";
import { ChevronRight, PlayIcon, PlusIcon } from "../ui/icons";
import { SetMaxSheet, type Lift } from "./plan/MaxesPanel";
import { StartPlanSheet } from "./plan/StartPlanSheet";
import { DayBody, MINIMUM_LABEL, StartDay, StartOptions } from "./plan/WeekDetail";
import { WeekRibbon } from "./plan/WeekRibbon";
import {
  DAY_SHORT, LIFTING_DAYS, TYPE_NAME, currentWeek, dayDef, fmtRange, headlineLifts, mainSummary, nextPlanned, shortName, tryDay, tryMinimum,
  usePlanContext, weekEnd, type PlanContext
} from "./plan/planView";
import "./plan/plan.css";
import "./train.css";

/** Workouts: start something, or find a session. */
export function TrainPage() {
  const { local } = useStore();
  const navigate = useNavigate();
  const sessions = useRows("sessions");
  const ctx = usePlanContext();
  const today = todayIso();
  const inProgress = sessions.find((s) => s.status === "in_progress");
  const next = useMemo(() => nextPlanned(sessions, ctx.program, today, ctx.plan), [sessions, ctx.program, today, ctx.plan]);
  const tileWeek = next?.week.weekNo ?? currentWeek(today, ctx.plan)?.week.weekNo ?? 0;
  const [picking, setPicking] = useState<LiftingDayKey | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [setting, setSetting] = useState<Lift | null>(null);
  const [busy, setBusy] = useState(false);
  const askMax = () => setSetting(ctx.state.trainingMaxes.squat == null ? "squat" : "deadlift");

  async function free() {
    setBusy(true);
    const id = await startFreeWorkout(local, today);
    setBusy(false);
    navigate(`/workout/${id}`);
  }

  return (
    <main className="page train">
      <header className="k-head">
        <div>
          <p className="k-eyebrow">{fmtLongDate(today)}</p>
          <h1 className="k-title">Workouts</h1>
        </div>
        <div className="k-head-actions">
          <Link to="/exercises" className="btn btn-tinted tr-head-btn">Exercises</Link>
        </div>
      </header>

      <div className="k-dash">
        <div className="k-col">
          {inProgress ? (
            <Card tone="hero" className="tr-hero">
              <div className="tr-hero-top"><Pill tone="plain">In progress</Pill></div>
              <h2 className="tr-hero-title">{inProgress.title ?? "Workout"}</h2>
              <Link to={`/workout/${inProgress.id}`} className="btn tr-hero-btn"><PlayIcon /> Continue</Link>
            </Card>
          ) : next ? (
            <NextHero next={next} ctx={ctx} today={today} onStartPlan={() => setConfirm(true)} onSetMax={askMax} />
          ) : (
            <Card className="tr-done"><span className="k-stat-label">Strength Return Plan</span><span className="tr-done-v">Complete</span></Card>
          )}

          <section>
            <Label action={<Link to="/plan">Plan</Link>}>Other days</Label>
            <div className="k-grid-4">
              {LIFTING_DAYS.map((k) => <DayTile key={k} dayKey={k} weekNo={tileWeek} ctx={ctx} onOpen={() => setPicking(k)} />)}
            </div>
          </section>

          <button type="button" className="btn btn-tinted tr-empty" disabled={busy || !!inProgress} onClick={() => void free()}>
            <PlusIcon /> Empty workout
          </button>
        </div>

        <div className="k-col">
          <Recent />
        </div>
      </div>

      {picking && (
        <DaySheet dayKey={picking} initialWeek={tileWeek} ctx={ctx} onClose={() => setPicking(null)}
          onStartPlan={() => { setPicking(null); setConfirm(true); }} onSetMax={() => { setPicking(null); askMax(); }} />
      )}
      {confirm && <StartPlanSheet onClose={() => setConfirm(false)} />}
      {setting && <SetMaxSheet initial={setting} ctx={ctx} onClose={() => setSetting(null)} />}
    </main>
  );
}

/** The next planned workout: day, main lift and load, one button. */
function NextHero({ next, ctx, today, onStartPlan, onSetMax }: {
  next: NonNullable<ReturnType<typeof nextPlanned>>; ctx: PlanContext; today: string; onStartPlan: () => void; onSetMax: () => void;
}) {
  const day = tryDay(next.week.weekNo, next.day.key, ctx.preview, ctx.equipment, ctx.plan);
  const main = day ? headlineLifts(day)[0] : undefined;
  const s = main && day ? mainSummary(main, ctx.preview.trainingMaxes, day.weekType === "calibration" || day.weekType === "test") : null;
  const when = next.date === today ? "Today" : next.date === addDays(today, 1) ? "Tomorrow" : `${DAY_SHORT[next.day.weekday - 1]} ${fmtShortDate(next.date)}`;

  return (
    <Card tone="hero" className="tr-hero">
      <div className="tr-hero-top">
        <Pill tone="plain">{when}</Pill>
        <Pill tone="plain">Week {next.week.weekNo} · {TYPE_NAME[next.week.type]}</Pill>
      </div>
      <div className="tr-hero-body">
        <div className="tr-hero-id">
          <h2 className="tr-hero-title">{next.day.title}</h2>
          {main && s && <span className="tr-hero-sub">{shortName(main)} · {[s.scheme, s.repOut].filter(Boolean).join(" + ")}</span>}
        </div>
        {s && <span className="tr-hero-load">{s.loadText}<small>kg</small></span>}
      </div>
      <div className="tr-hero-action">
        <StartOptions weekNo={next.week.weekNo} dayKey={next.day.key} ctx={ctx} onStartPlan={onStartPlan} onSetMax={onSetMax}
          label={next.date === today ? "Start workout" : "Start early"} />
      </div>
    </Card>
  );
}

function DayTile({ dayKey, weekNo, ctx, onOpen }: { dayKey: LiftingDayKey; weekNo: number; ctx: PlanContext; onOpen: () => void }) {
  const def = dayDef(dayKey);
  const day = tryDay(weekNo, dayKey, ctx.preview, ctx.equipment, ctx.plan);
  const lifts = day && day.kind === "lifting" ? headlineLifts(day).map(shortName).join(" · ") : "Rest";
  return (
    <button type="button" className="k-card tr-tile" onClick={onOpen}>
      <span className="tr-tile-day">{DAY_SHORT[def.weekday - 1]}</span>
      <span className="tr-tile-title">{def.title}</span>
      <span className="tr-tile-lift">{lifts}</span>
      <span className="tr-tile-sets">{day && day.kind === "lifting" ? <><b>{day.workingSetCount}</b> {day.workingSetCount === 1 ? "set" : "sets"}</> : "—"}</span>
    </button>
  );
}

/** Pick a week (defaults to this one) and start that day, logged as today. */
function DaySheet({ dayKey, initialWeek, ctx, onClose, onStartPlan, onSetMax }: {
  dayKey: LiftingDayKey; initialWeek: number; ctx: PlanContext; onClose: () => void; onStartPlan: () => void; onSetMax: () => void;
}) {
  const [weekNo, setWeekNo] = useState(initialWeek);
  const [mode, setMode] = useState<"full" | "minimum">("full");
  const minimum = mode === "minimum";
  const week = ctx.plan.weeks[weekNo]!;
  const day = minimum ? tryMinimum(weekNo, dayKey, ctx.preview, ctx.equipment, ctx.plan) : tryDay(weekNo, dayKey, ctx.preview, ctx.equipment, ctx.plan);
  const now = currentWeek(todayIso(), ctx.plan);
  return (
    <Sheet title={dayDef(dayKey).title} onClose={onClose}>
      <div className="tr-sheet-week">
        <span className="tr-sheet-week-no">Week {weekNo}</span>
        <span className="k-muted">{TYPE_NAME[week.type]} · {fmtRange(week.startDate, weekEnd(week))}</span>
      </div>
      <WeekRibbon compact plan={ctx.plan} selected={weekNo} onSelect={setWeekNo} nowWeekNo={now?.week.weekNo ?? null} />
      <div className="tr-sheet-mode">
        <Segmented label="Session" value={mode} onChange={setMode}
          options={[{ value: "full", label: "Full session" }, { value: "minimum", label: MINIMUM_LABEL }]} />
      </div>
      {day && day.kind === "lifting"
        ? <div className="k-card tr-sheet-day"><DayBody day={day} ctx={ctx} /></div>
        : <p className="k-muted">No lifting this week.</p>}
      <StartDay weekNo={weekNo} dayKey={dayKey} ctx={ctx} onStartPlan={onStartPlan} onSetMax={onSetMax} primary minimum={minimum}
        label={minimum ? `Start the minimum · week ${weekNo}` : `Start week ${weekNo}`} onStarted={onClose} />
    </Sheet>
  );
}

/** The last six workouts as a slim timeline; the bar is relative volume (load × reps). */
function Recent() {
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const year = todayIso().slice(0, 4);
  const recent = useMemo(() => sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => b.date.localeCompare(a.date) || (b.ended_at ?? b.created_at).localeCompare(a.ended_at ?? a.created_at))
    .slice(0, 6), [sessions]);
  const stats = useMemo(() => {
    const ids = new Set(recent.map((s) => s.id));
    const m = new Map<string, { sets: number; volume: number }>();
    for (const s of sets) {
      if (!ids.has(s.session_id) || s.kind === "warmup") continue;
      const v = m.get(s.session_id) ?? { sets: 0, volume: 0 };
      v.sets += 1;
      v.volume += Math.max(0, Number(s.load_kg ?? 0)) * (s.reps ?? 0);
      m.set(s.session_id, v);
    }
    return m;
  }, [recent, sets]);
  const maxVol = Math.max(1, ...[...stats.values()].map((v) => v.volume));

  return (
    <section>
      <Label action={<Link to="/history">History</Link>}>Recent</Label>
      {recent.length ? (
        <Card pad={false} className="tr-recent">
          {recent.map((s) => {
            const st = stats.get(s.id) ?? { sets: 0, volume: 0 };
            const date = s.date.startsWith(year) ? fmtShortDate(s.date) : fmtShortDateYear(s.date);
            return (
              <Link key={s.id} to={`/session/${s.id}`} className="tr-tl">
                <span className="tr-tl-dot" aria-hidden="true" />
                <span className="tr-tl-main">
                  <span className="tr-tl-title">{s.title || s.source.replace(/^sheet:/, "")}</span>
                  <span className="tr-tl-date">{s.date_confidence === "exact" ? "" : "≈ "}{date}</span>
                </span>
                <span className="tr-tl-right">
                  <span className="k-num">{st.sets} <span className="k-muted">sets</span></span>
                  <span className="tr-tl-bar" title={`${fmtNum(st.volume, 0)} kg volume`}><i style={{ width: `${(st.volume / maxVol) * 100}%` }} /></span>
                </span>
                <ChevronRight className="tr-tl-chev" />
              </Link>
            );
          })}
        </Card>
      ) : (
        <Card><span className="k-muted">No workouts yet</span></Card>
      )}
    </section>
  );
}
