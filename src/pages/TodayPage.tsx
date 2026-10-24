import { useEffect, useMemo, useState } from "react";
import { useToday } from "../lib/useToday";
import { Link, useNavigate } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import { addDays, fmtLongDate, fmtNum, fmtShortDate, parseDecimal, todayIso } from "../lib/format";
import { bodyweight7d, dayTotals, targetFor } from "../lib/nutrition";
import { countsForStrength, e1rm } from "../lib/analysis";
import { dayForDate, prescribeDay, prescribeMinimum } from "../plan/engine";
import { PLAN, PLAN_KEY, activeProgram, ensurePlanExercises, equipmentFrom, latestMaxes, planState, usePlan, usePlanIds } from "../plan/bridge";
import { planRef, startWorkout } from "../plan/workout";
import { DAY_SHORT, doneSession as sessionForSlot, doneSlots, nextPlanned, tryDay, usePlanContext } from "./plan/planView";
import { DayBody } from "./plan/WeekDetail";
import { sessionDebrief, type Debrief } from "../coach/debrief";
import type { DayKey, PlanState, PrescribedDay } from "../plan/types";
import { Card, Label, Pill, Ring, Sparkline, Stat } from "../ui/kit";
import { Sheet } from "../ui/Sheet";
import { CheckIcon, ChevronRight, PlayIcon } from "../ui/icons";
import { answerPainCheck, currentWeekNo, dailyCues, ensurePlanProteinPerKg, saveElbowMonthly, savePhotosDone, weeklyReport, bodyweightStatus, type BodyweightSide, type DailyCue, type WeeklyReport } from "../coach";
import { useCoachData } from "../coach/hooks";
import { CONDITIONING_KIND, ConditioningCard, isFreeDayNote } from "./ConditioningCard";
import { SetMaxes } from "./SetMaxes";
import { ApplyButton, Dot, VERDICT_TONE, VERDICT_WORD } from "./checkin/coachUi";
import { useToast } from "./food/ui";
import "./today.css";
import "./plan/plan.css";
import { ThemeSwitch } from "../ui/theme";

const DAY_LETTER = ["M", "T", "W", "T", "F", "S", "S"];
const SQUAT_GOAL_E1RM = 145 * (1 + 5 / 30);

export function TodayPage() {
  const { local } = useStore();
  const navigate = useNavigate();
  const programs = useRows("programs");
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const maxes = useRows("training_maxes");
  const exercises = useRows("exercises");
  const profiles = useRows("profiles");
  const weights = useRows("body_measurements");
  const entries = useRows("food_entries");
  const days = useRows("nutrition_days");
  const targets = useRows("nutrition_targets");
  const conditioning = useRows("conditioning");
  const painChecks = useRows("pain_checks");
  const [busy, setBusy] = useState(false);
  // A plan day opened in a sheet: today's workout (View) or a day of the week strip.
  const [sheet, setSheet] = useState<{ weekNo: number; dayKey: DayKey; date: string } | null>(null);
  const toast = useToast();

  const today = useToday();
  const program = activeProgram(programs);
  // Protein follows bodyweight (2.0 g/kg) on the plan's default target row; a no-op once done.
  useEffect(() => {
    if (program) void ensurePlanProteinPerKg(local, program.start_date);
  }, [local, program, targets]);
  const equipment = equipmentFrom(profiles[0]);
  const ids = usePlanIds(exercises);
  const inProgress = sessions.find((s) => s.status === "in_progress");
  const plan = usePlan();

  const planDate = today < plan.weeks[0]!.startDate ? plan.weeks[0]!.startDate : today;
  const slot = dayForDate(plan, planDate);
  const dayLabel = planDate === today ? "Today" : planDate === addDays(today, 1) ? "Tomorrow" : fmtShortDate(planDate);
  const doneToday = sessions.some((s) => s.date === today && s.status === "completed" && s.program_id === program?.id);
  const { slots } = useMemo(() => doneSlots(sessions, program), [sessions, program]);

  const prescription = useMemo((): { day: PrescribedDay | null; state: PlanState | null; error: string | null } => {
    if (!slot) return { day: null, state: null, error: null };
    try {
      // painChecks and today switch on the elbow/bad-day stop signs, the wrist-ladder holds, the pain hold and the restart cap.
      const state: PlanState = program
        ? planState({ program, ids, maxes, sessions, sets, equipment, conditioning, plan, painChecks, today })
        : { trainingMaxes: {}, currentLoads: {} };
      return { day: prescribeDay(plan, slot.week.weekNo, slot.day.key, state, equipment), state, error: null };
    } catch (e) {
      return { day: null, state: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [program, slot, ids, maxes, sessions, sets, equipment, conditioning, plan, painChecks, today]);

  const bw = bodyweight7d(weights, today);
  const target = targetFor(today, targets, bw);
  const totals = dayTotals(today, entries, days);
  const weighIns = useMemo(() => weights.filter((w) => w.kind === "weight").sort((a, b) => a.date.localeCompare(b.date)), [weights]);
  const weightToday = weighIns.find((w) => w.date === today);

  // The coach: today's cues and this week's verdict (week 0 before the plan, the last week after it).
  const coach = useCoachData();
  const hour = new Date().getHours();
  const cues = useMemo(() => dailyCues(coach, today, hour).filter((c) => c.id !== "checkin.ready"), [coach, today, hour]);
  const lastWeigh = weighIns[weighIns.length - 1]?.date;
  const track = useMemo(() => (lastWeigh && lastWeigh >= addDays(today, -7) ? bodyweightStatus(coach, lastWeigh)?.verdict ?? null : null), [coach, lastWeigh, today]);
  const report = useMemo((): WeeklyReport | null => {
    const n = currentWeekNo(coach, today) ?? (today < coach.start ? 0 : coach.plan.weeks[coach.plan.weeks.length - 1]!.weekNo);
    try { return weeklyReport(coach, n, today); } catch { return null; }
  }, [coach, today]);

  // Squat towards the goal: training max if set, else the best e1RM of the last 8 weeks.
  const squat = useMemo(() => {
    const tm = latestMaxes(maxes, ids).squat;
    if (tm) return { value: tm, source: "training max" };
    const id = ids.get("squat");
    const live = new Map(sessions.filter((s) => s.status === "completed").map((s) => [s.id, s.date]));
    const from = addDays(today, -56);
    let best = 0;
    for (const s of sets) {
      const d = live.get(s.session_id);
      if (s.exercise_id !== id || !d || d < from || !countsForStrength(s)) continue;
      best = Math.max(best, e1rm(Number(s.load_kg), s.reps) ?? 0);
    }
    return best ? { value: best, source: "best of the last 8 weeks" } : null;
  }, [maxes, ids, sessions, sets, today]);

  async function startPlan() {
    setBusy(true);
    await ensurePlanExercises(local);
    await local.save("programs", { name: "Strength Return Plan", start_date: PLAN.weeks[0]!.startDate, weeks: PLAN.weeks.length, status: "active", rules: { key: PLAN_KEY }, goals: [], notes: null });
    setBusy(false);
  }

  async function start(day: PrescribedDay, minimum = false) {
    if (!program) return;
    setBusy(true);
    const all = await ensurePlanExercises(local);
    const run = minimum && prescription.state ? prescribeMinimum(plan, day.weekNo, day.dayKey, prescription.state, equipment) : day;
    const id = await startWorkout(local, program, run, all, today, { minimum });
    setBusy(false);
    navigate(`/workout/${id}`);
  }

  const day = prescription.day;
  const lifts = day?.exercises.filter((e) => e.group !== "shoulder_care") ?? [];

  // Today's session finished: the hero shows what was logged, and "Up next" moves on to the next planned session
  // (otherwise it would show today's day again with next week's loads, already progressed by today's results).
  const doneSession = doneToday ? sessions.find((s) => s.date === today && s.status === "completed" && s.program_id === program?.id) : undefined;
  const doneMain = useMemo(() => {
    if (!doneSession) return null;
    const top = sets.filter((x) => x.session_id === doneSession.id && x.completed && (x.kind === "rep_out" || x.kind === "top") && planRef(x)?.mainLift)
      .sort((a, b) => a.exercise_position - b.exercise_position)[0];
    return top ? { load: Number(top.load), reps: top.reps, added: planRef(top)?.mainLift === "weighted_pullup" } : null;
  }, [doneSession, sets]);
  const next = useMemo(() => {
    if (!doneToday || !program || !prescription.state) return null;
    const n = nextPlanned(sessions, program, addDays(today, 1), plan);
    if (!n) return null;
    try { return { date: n.date, day: prescribeDay(plan, n.week.weekNo, n.day.key, prescription.state, equipment) }; } catch { return null; }
  }, [doneToday, program, prescription.state, sessions, today, plan, equipment]);
  // Debrief: what today's session changed, and the same day next time.
  const debrief = useMemo((): Debrief | null => {
    if (!doneSession || !prescription.state) return null;
    const dayKey = (doneSession.legacy_ref as { plan?: { dayKey?: string } }).plan?.dayKey;
    const weekNo = doneSession.program_week_no;
    if (!dayKey || weekNo == null) return null;
    const sessionSets = sets.filter((x) => x.session_id === doneSession.id);
    const setIds = new Set(sessionSets.map((x) => x.id));
    const keyOf = new Map([...ids].map(([k, id]) => [id, k] as const));
    const tms = maxes.filter((m) => (m.source_set_id && setIds.has(m.source_set_id)) || (m.effective_date === today && m.program_id === program?.id));
    const later = plan.weeks.filter((w) => w.weekNo > weekNo);
    let nextDay: PrescribedDay | null = null;
    let label = "";
    for (const w of later) {
      const d = plan.days.find((x) => x.key === dayKey);
      if (!d) break;
      try {
        const p = prescribeDay(plan, w.weekNo, dayKey as PrescribedDay["dayKey"], prescription.state, equipment);
        if (p.kind !== "lifting" || !p.exercises.length) continue;
        nextDay = p;
        label = fmtShortDate(addDays(w.startDate, d.weekday - 1));
        break;
      } catch { continue; }
    }
    const calibration = (doneSession.legacy_ref as { plan?: { weekType?: string } } | null)?.plan?.weekType === "calibration";
    return sessionDebrief({ sets: sessionSets, maxes: tms, keyOf, next: nextDay, nextDateLabel: label, calibration });
  }, [doneSession, prescription.state, sets, ids, maxes, today, program, plan, equipment]);
  const listDay = next?.day ?? day;
  const listLifts = listDay?.exercises.filter((e) => e.group !== "shoulder_care") ?? [];
  const listLabel = next ? `Up next · ${next.date === addDays(today, 1) ? "Tomorrow" : fmtShortDate(next.date)} · ${next.day.title}` : "Up next";
  const main = lifts[0];
  const mainSet = main?.sets.find((s) => s.kind === "rep_out" || s.kind === "top") ?? main?.sets.find((s) => s.kind !== "warmup");
  const workSets = lifts.reduce((n, e) => n + e.sets.filter((s) => s.kind !== "warmup").length, 0);

  return (
    <main className="page today">
      <header className="k-head">
        <div>
          <p className="k-eyebrow">{fmtLongDate(today)}</p>
          <h1 className="k-title">Today</h1>
        </div>
        <div className="k-head-actions">
          <span className="only-phone"><ThemeSwitch compact /></span>
          {slot && <Link to="/plan" className="k-pill k-pill-plain" style={{ height: 32 }}>Week {slot.week.weekNo}</Link>}
        </div>
      </header>

      <div className="k-dash">
        <div className="k-col">
          {inProgress ? (
            <Card tone="hero" className="today-hero">
              <div className="today-hero-top"><Pill tone="plain">In progress</Pill></div>
              <h2 className="today-hero-title">{inProgress.title}</h2>
              <Link to={`/workout/${inProgress.id}`} className="btn today-hero-btn"><PlayIcon /> Continue</Link>
            </Card>
          ) : slot?.day.kind === "conditioning" ? (
            <ConditioningCard date={planDate} dayKey={slot.day.key} weekNo={slot.week.weekNo} existing={conditioning.filter((c) => c.date === planDate)} />
          ) : prescription.error && program ? (
            <SetMaxes message={prescription.error} ids={ids} program={program} />
          ) : day && day.kind === "lifting" ? (
            <Card tone="hero" className="today-hero">
              <div className="today-hero-top">
                <Pill tone="plain">{dayLabel}</Pill>
                {doneToday && <Pill tone="plain"><CheckIcon /> Done</Pill>}
                {!doneToday && slot && (
                  <button type="button" className="today-hero-view" onClick={() => setSheet({ weekNo: slot.week.weekNo, dayKey: slot.day.key, date: planDate })}>
                    View <ChevronRight />
                  </button>
                )}
              </div>
              <h2 className="today-hero-title">{day.title}</h2>
              {doneToday && doneMain ? (
                <div className="today-hero-main">
                  <span className="k-muted">{main?.name.split(",")[0] ?? "Main lift"} · done</span>
                  <span className="today-hero-load">{doneMain.added ? "+" : ""}{fmtNum(doneMain.load)}<small>kg</small></span>
                  <span className="k-muted">× {doneMain.reps ?? "—"} clean reps</span>
                </div>
              ) : main && mainSet && (
                <div className="today-hero-main">
                  <span className="k-muted">{main.name.split(",")[0]}</span>
                  <span className="today-hero-load">{main.mainLift === "weighted_pullup" ? "+" : ""}{fmtNum(mainSet.load)}<small>kg</small></span>
                  <span className="k-muted">{mainSet.kind === "rep_out" ? (mainSet.target ? `rep-out · target ${mainSet.target}` : "rep-out to your last clean rep") : `${mainSet.reps ?? ""} reps`}</span>
                </div>
              )}
              <div className="today-hero-facts">
                <span><b>{lifts.length}</b> exercises</span>
                <span><b>{workSets}</b> sets</span>
                {day.minutes && <span><b>{day.minutes}</b> min</span>}
              </div>
              {doneSession && (
                <div className="today-hero-starts">
                  <Link to={`/session/${doneSession.id}`} className="btn today-hero-btn">View session</Link>
                </div>
              )}
              {program ? (
                !doneToday && (
                  <div className="today-hero-starts">
                    <button className="btn today-hero-btn" disabled={busy} onClick={() => void start(day)}><PlayIcon /> {planDate === today ? "Start workout" : "Start early"}</button>
                    <button className="btn today-hero-min" disabled={busy} onClick={() => void start(day, true)}>Busy or tired? 30-min minimum</button>
                  </div>
                )
              ) : (
                <button className="btn today-hero-btn" disabled={busy} onClick={() => void startPlan()}>Start the plan</button>
              )}
            </Card>
          ) : (
            <Card><Stat label="Rest day" value="Recover" size="md" /></Card>
          )}

          {debrief && <DebriefCard debrief={debrief} />}

          <CoachCard cues={cues} report={report} today={today} onDone={toast.show}
            onMinimum={program && day?.kind === "lifting" && planDate === today && !doneToday && !inProgress ? () => void start(day, true) : undefined} />

          {slot && (
            <section>
              <Label action={<Link to="/plan">Plan</Link>}>This week</Label>
              <div className="today-week">
                {PLAN.days.slice().sort((a, b) => a.weekday - b.weekday).map((d) => {
                  const date = addDays(slot.week.startDate, d.weekday - 1);
                  // Done by plan slot, not by date: a session moved to another day ticks the day it was planned for.
                  // Lifting: the session logged for this week's day (or an off-plan session on the date); conditioning:
                  // that kind logged anywhere in the week; a free day: a note on that date.
                  const weekEnd = addDays(slot.week.startDate, 6);
                  const done = d.kind === "lifting"
                    ? slots.has(`${slot.week.weekNo}:${d.key}`) || sessions.some((s) => s.date === date && s.status === "completed" && !planDayKey(s))
                    : d.conditioning?.kind === "open"
                      ? conditioning.some((c) => isFreeDayNote(c) && c.date === date)
                      : conditioning.some((c) => c.kind === CONDITIONING_KIND[d.key] && c.done && !c.deleted_at && c.date >= slot.week.startDate && c.date <= weekEnd);
                  const cls = [d.kind === "lifting" ? "lift" : "cardio", date === planDate ? "now" : "", done ? "done" : ""].join(" ");
                  const logged = d.kind === "lifting" ? sessionForSlot(sessions, program, slot.week.weekNo, d.key) : undefined;
                  return (
                    <button key={d.key} type="button" className={`today-day ${cls}`} aria-label={`${DAY_SHORT[d.weekday - 1]} ${d.title}${done ? ", done" : ""}`}
                      onClick={() => logged ? navigate(`/session/${logged.id}`) : setSheet({ weekNo: slot.week.weekNo, dayKey: d.key, date })}>
                      <span className="today-day-letter">{DAY_LETTER[d.weekday - 1]}</span>
                      <span className="today-day-dot">{done ? <CheckIcon /> : Number(date.slice(8))}</span>
                      <span className="today-day-name">{shortName(d.key)}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {listLifts.length > 1 && !inProgress && (
            <section>
              <Label action={slot ? <Link to={`/plan?week=${next?.day.weekNo ?? slot.week.weekNo}`}>All</Link> : undefined}>{listLabel}</Label>
              <Card pad={false} className="today-list k-rows">
                {listLifts.slice(0, 5).map((e) => {
                  const w = e.sets.filter((s) => s.kind !== "warmup");
                  const top = w[w.length - 1];
                  const reps = w[0]?.repRange ? `${w[0].repRange[0]}–${w[0].repRange[1]}` : w[0]?.reps ?? "max";
                  return (
                    <div key={e.exerciseKey} className="k-row today-row">
                      <span className="k-row-main"><span>{e.name.split(",")[0]}</span></span>
                      <span className="k-num">{w.length} × {reps} <span className="k-muted">· {top ? `${e.loadBasis === "added" ? "+" : ""}${fmtNum(top.load)} ${top.unit === "bodyweight" ? "" : top.unit}` : ""}</span></span>
                    </div>
                  );
                })}
              </Card>
            </section>
          )}
        </div>

        <div className="k-col">
          <section>
            <Label action={<Link to="/food">Log food</Link>}>Fuel</Label>
            <Card className="today-rings">
              <Ring value={target ? totals.protein / target.protein : 0} size={112} stroke={11} color="var(--chart-1)" label="Protein today">
                <span className="k-num today-ring-v">{fmtNum(totals.protein, 0)}</span>
                <span className="k-muted today-ring-l">{target ? `of ${fmtNum(target.protein, 0)} g` : "g protein"}</span>
              </Ring>
              <Ring value={target ? totals.kcal / target.kcal : 0} size={112} stroke={11} color="var(--warm)" label="Energy today">
                <span className="k-num today-ring-v">{fmtNum(totals.kcal, 0)}</span>
                <span className="k-muted today-ring-l">{target ? `of ${fmtNum(target.kcal, 0)}` : "kcal"}</span>
              </Ring>
            </Card>
          </section>

          <WeighIn weighIns={weighIns} todayValue={weightToday?.value} bw7={bw} track={track} onSave={async (kg) => {
            await local.save("body_measurements", { id: weightToday?.id, date: today, kind: "weight", value: kg, unit: "kg", source: "app", note: null });
          }} />

          {squat && (
            <Link to="/progress" className="k-card k-pad today-goal">
              <Ring value={squat.value / SQUAT_GOAL_E1RM} size={84} stroke={9} color="var(--warm)" label="Squat towards 145 × 5">
                <span className="k-num" style={{ fontSize: 17 }}>{Math.round((squat.value / SQUAT_GOAL_E1RM) * 100)}%</span>
              </Ring>
              <div className="k-stat">
                <span className="k-stat-label">Squat → 145 × 5</span>
                <span className="k-stat-value" style={{ fontSize: 28 }}>{fmtNum(squat.value, squat.source === "training max" ? 1 : 0)}<small>kg</small></span>
                <span className="k-stat-sub">{squat.source}</span>
              </div>
              <ChevronRight style={{ color: "var(--fg2)", marginLeft: "auto" }} />
            </Link>
          )}
        </div>
      </div>
      {sheet && (
        <PlanDaySheet {...sheet} onClose={() => setSheet(null)}
          day={slot && sheet.weekNo === slot.week.weekNo && sheet.dayKey === slot.day.key ? day : null}
          onStart={program && day?.kind === "lifting" && !doneToday && sheet.date === planDate ? () => { setSheet(null); void start(day); } : undefined}
          startLabel={planDate === today ? "Start workout" : "Start early"} />
      )}
      {toast.node}
    </main>
  );
}

const planDayKey = (s: { legacy_ref: unknown }) => (s.legacy_ref as { plan?: { dayKey?: string } } | null)?.plan?.dayKey;

/**
 * One plan day in a sheet. Lifting: the prescription (the hero's own day when given, so the loads match it).
 * Conditioning: the log card for that date, so a missed tick (boxing yesterday) can be logged afterwards.
 */
function PlanDaySheet({ weekNo, dayKey, date, day, onStart, startLabel, onClose }: {
  weekNo: number; dayKey: DayKey; date: string; day: PrescribedDay | null; onStart?: () => void; startLabel: string; onClose: () => void;
}) {
  const ctx = usePlanContext();
  const conditioning = useRows("conditioning");
  const def = ctx.plan.days.find((d) => d.key === dayKey)!;
  const when = `${DAY_SHORT[def.weekday - 1]} ${fmtShortDate(date)}`;
  if (def.kind === "conditioning") {
    return (
      <Sheet title={when} onClose={onClose}>
        <ConditioningCard date={date} dayKey={dayKey} weekNo={weekNo} existing={conditioning.filter((c) => c.date === date && !c.deleted_at)} />
      </Sheet>
    );
  }
  const p = day ?? tryDay(weekNo, dayKey, ctx.state, ctx.equipment, ctx.plan);
  return (
    <Sheet title={`${def.title} · ${when}`} onClose={onClose}>
      {p && p.kind === "lifting"
        ? <div className="k-card today-sheet-day"><DayBody day={p} ctx={ctx} /></div>
        : <p className="k-muted">No lifting this week.</p>}
      {onStart && <button type="button" className="btn btn-primary" onClick={onStart}><PlayIcon /> {startLabel}</button>}
    </Sheet>
  );
}

/** Today's coach notes (at most 3) and this week's check-in verdict. With no cues it is just the check-in row. */
/** After a finished session: training-max changes, next time's main lift, and every accessory's next step. */
function DebriefCard({ debrief }: { debrief: Debrief }) {
  const { maxes, next, rows, held } = debrief;
  if (!maxes.length && !next && !rows.length) return null;
  const up = rows.filter((r) => r.dir === "up").length;
  const plus = (r: { added?: boolean }) => (r.added ? "+" : "");
  return (
    <section>
      <Label>Debrief</Label>
      <Card className="t-debrief">
        <div className="t-db-top">
          {maxes.map((m) => <Stat key={m.lift} size="lg" label={`${m.lift} training max`} value={fmtNum(m.value, 1)} unit="kg" sub={m.from ?? undefined} tone="warm" />)}
          {next && <Stat size="lg" label={`${next.title} · ${next.date}`} value={`${next.added ? "+" : ""}${fmtNum(next.load, 1)}`} unit="kg" sub={`${next.lift} ${next.scheme}`} />}
        </div>
        {rows.length > 0 && (
          <>
            <div className="t-db-head">
              <span>Next time</span>
              <span>{held ? "Week 0 · held" : up ? `${up} up` : "Same loads"}</span>
            </div>
            <ul className="t-db-rows">
              {rows.map((r) => (
                <li key={r.name} data-dir={r.dir}>
                  <span className="t-db-name">{r.name}{r.hint && <small>{r.hint}</small>}</span>
                  <span className="t-db-load">
                    {r.dir !== "same" && <span className="t-db-from">{plus(r)}{fmtNum(r.from, 1)} →</span>}
                    {plus(r)}{fmtNum(r.to, 1)}<small>{r.unit}</small>
                  </span>
                  <span className="t-db-dir" aria-label={r.dir}>{r.dir === "up" ? "▲" : r.dir === "down" ? "▼" : "="}</span>
                </li>
              ))}
            </ul>
            {held && (
              <details className="t-db-why">
                <summary>Why held</summary>
                <p>Week 0 sets stopped at the top of the range, so week 1 starts at the same weight. From now on, failure sets find the weight.</p>
              </details>
            )}
          </>
        )}
      </Card>
    </section>
  );
}

function CoachCard({ cues, report, today, onDone, onMinimum }: {
  cues: DailyCue[]; report: WeeklyReport | null; today: string; onDone: (m: string) => void; onMinimum?: () => void;
}) {
  if (!cues.length && !report) return null;
  return (
    <Card pad={false} className="t-coach k-rows" aria-label="Coach">
      {cues.map((c) => <CueRow key={c.id} cue={c} today={today} onDone={onDone} onMinimum={onMinimum} />)}
      {report && (
        <Link to="/checkin" className="t-checkin">
          <Dot tone={VERDICT_TONE[report.verdict]} />
          <span className="t-checkin-main">
            <span className="t-checkin-label">Check-in</span>
            <span className="t-checkin-sub">{report.complete ? `Week ${report.weekNo} · ready` : report.label}</span>
          </span>
          <span className="t-checkin-verdict" data-verdict={report.verdict}>{VERDICT_WORD[report.verdict]}</span>
          <ChevronRight style={{ color: "var(--fg2)", flex: "none" }} />
        </Link>
      )}
    </Card>
  );
}

function CueRow({ cue, today, onDone, onMinimum }: { cue: DailyCue; today: string; onDone: (m: string) => void; onMinimum?: () => void }) {
  const { local } = useStore();
  const [busy, setBusy] = useState(false);
  const line = (
    <>
      <Dot tone={cue.tone} />
      <span className="t-cue-text">{cue.text}</span>
      {cue.to && <ChevronRight style={{ color: "var(--fg2)", flex: "none" }} />}
    </>
  );
  const prompt = cue.prompt;
  return (
    <div className="t-cue">
      {cue.to ? <Link to={cue.to} className="t-cue-line">{line}</Link> : <div className="t-cue-line">{line}</div>}
      {prompt && (
        <div className="t-scale" role="group" aria-label="How is it this morning, 0 to 10?">
          {prompt.options.map((o) => (
            // Scores at the site's usual level + 2 or more are tinted: those suggest a swap.
            <button key={o} type="button" data-high={o >= prompt.baseline + 2 || undefined} disabled={busy} onClick={async () => {
              setBusy(true);
              const r = await answerPainCheck(local, prompt.painCheckId, o);
              setBusy(false);
              onDone(r.flare ? "Saved. The check-in suggests a swap." : "Saved. Good.");
            }}>{o}</button>
          ))}
        </div>
      )}
      {cue.input === "photos" && (
        <div className="t-cue-act">
          <button type="button" className="btn btn-tinted ci-btn" disabled={busy} onClick={async () => {
            setBusy(true);
            await savePhotosDone(local, today);
            setBusy(false);
            onDone("Photos marked done.");
          }}><CheckIcon /> Done</button>
        </div>
      )}
      {cue.input === "elbow_monthly" && <ElbowMonthlyInput today={today} onDone={onDone} />}
      {cue.startMinimum && onMinimum && (
        <div className="t-cue-act"><button type="button" className="btn btn-tinted ci-btn" onClick={onMinimum}><PlayIcon /> Start the minimum</button></div>
      )}
      {cue.action && cue.signalId && (
        <div className="t-cue-act"><ApplyButton action={cue.action} signalId={cue.signalId} today={today} onDone={onDone} /></div>
      )}
    </div>
  );
}

const ELBOW_QUESTIONS = [
  { key: "worst", label: "Worst pain this week" },
  { key: "grip", label: "Pain gripping" },
  { key: "daily", label: "Daily tasks" },
] as const;

/** The monthly elbow check: 3 sliders, 0–10 each, saved as one elbow_monthly row (saveElbowMonthly). */
function ElbowMonthlyInput({ today, onDone }: { today: string; onDone: (m: string) => void }) {
  const { local } = useStore();
  const [v, setV] = useState({ worst: 0, grip: 0, daily: 0 });
  const [busy, setBusy] = useState(false);
  return (
    <div className="t-elbow">
      {ELBOW_QUESTIONS.map((q) => (
        <label key={q.key} className="t-elbow-q">
          <span className="t-elbow-label">{q.label}</span>
          <span className="t-elbow-v k-num">{v[q.key]}</span>
          <input type="range" min={0} max={10} step={1} value={v[q.key]} aria-label={`${q.label}, 0 to 10`}
            onChange={(e) => setV({ ...v, [q.key]: Number(e.target.value) })} />
        </label>
      ))}
      <button type="button" className="btn btn-tinted ci-btn" disabled={busy} onClick={async () => {
        setBusy(true);
        await saveElbowMonthly(local, today, v);
        setBusy(false);
        onDone("Elbow check saved.");
      }}>Save</button>
    </div>
  );
}

const TRACK: Record<BodyweightSide, { label: string; tone: "good" | "warm" }> = {
  on: { label: "On track", tone: "good" }, above: { label: "Above target", tone: "warm" }, below: { label: "Below target", tone: "warm" }
};

function WeighIn({ weighIns, todayValue, bw7, track, onSave }: {
  weighIns: { date: string; value: number }[]; todayValue?: number; bw7: number | null; track: BodyweightSide | null;
  onSave: (kg: number) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const recent = weighIns.slice(-30).map((w) => Number(w.value));
  const last = weighIns[weighIns.length - 1];
  async function save() {
    const v = parseDecimal(text);
    if (v == null || v < 30 || v > 250) return;
    await onSave(v);
    setText("");
  }
  return (
    <section>
      <Label action={<Link to="/weight">Trend</Link>}>Weight</Label>
      <Card className="today-weigh">
        <div className="today-weigh-top">
          <div className="k-stat">
            <span className="k-stat-value" style={{ fontSize: 34 }}>{fmtNum(bw7 ?? last?.value ?? null, 1)}<small>kg</small></span>
            <span className="k-stat-sub">{bw7 != null ? "7-day average" : last ? `last weigh-in · ${fmtShortDate(last.date)}` : "no weigh-ins yet"}</span>
            {track && <Link to="/weight" className="today-track"><Pill tone={TRACK[track].tone}>{TRACK[track].label}</Pill></Link>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}><Sparkline data={recent} color="var(--chart-1)" height={44} label="Last 30 weigh-ins" /></div>
        </div>
        <div className="today-weigh-input">
          <label className="field" style={{ flex: 1 }}>
            <span className="sr-only">Weight this morning in kg</span>
            <input inputMode="decimal" className="num" placeholder={todayValue ? `${String(todayValue).replace(".", ",")} today` : "This morning, kg"}
              value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} />
          </label>
          <button className="btn btn-tinted btn-icon" style={{ borderRadius: 14 }} aria-label="Save weight" onClick={() => void save()}><CheckIcon /></button>
        </div>
      </Card>
    </section>
  );
}

function shortName(key: string): string {
  return ({ lower_a: "Lower", upper_a: "Upper", lower_b: "Lower", upper_b: "Upper", easy_ride: "Free", boxing: "Box", rounds: "Free" } as Record<string, string>)[key] ?? key;
}
