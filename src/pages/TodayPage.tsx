import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import { addDays, fmtLongDate, fmtNum, fmtShortDate, parseDecimal, todayIso } from "../lib/format";
import { bodyweight7d, dayTotals, targetFor } from "../lib/nutrition";
import { countsForStrength, e1rm } from "../lib/analysis";
import { dayForDate, prescribeDay } from "../plan/engine";
import { PLAN, PLAN_KEY, activeProgram, ensurePlanExercises, equipmentFrom, latestMaxes, planState, usePlanIds } from "../plan/bridge";
import { startWorkout } from "../plan/workout";
import type { PrescribedDay } from "../plan/types";
import { Card, Label, Pill, Ring, Sparkline, Stat } from "../ui/kit";
import { CheckIcon, ChevronRight, PlayIcon } from "../ui/icons";
import { ConditioningCard } from "./ConditioningCard";
import { SetMaxes } from "./SetMaxes";
import "./today.css";
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
  const [busy, setBusy] = useState(false);

  const today = todayIso();
  const program = activeProgram(programs);
  const equipment = equipmentFrom(profiles[0]);
  const ids = usePlanIds(exercises);
  const inProgress = sessions.find((s) => s.status === "in_progress");

  const planDate = today < PLAN.weeks[0]!.startDate ? PLAN.weeks[0]!.startDate : today;
  const slot = dayForDate(PLAN, planDate);
  const dayLabel = planDate === today ? "Today" : planDate === addDays(today, 1) ? "Tomorrow" : fmtShortDate(planDate);
  const doneToday = sessions.some((s) => s.date === today && s.status === "completed" && s.program_id === program?.id);

  const prescription = useMemo((): { day: PrescribedDay | null; error: string | null } => {
    if (!slot) return { day: null, error: null };
    try {
      const state = program ? planState({ program, ids, maxes, sessions, sets, equipment }) : { trainingMaxes: {}, currentLoads: {} };
      return { day: prescribeDay(PLAN, slot.week.weekNo, slot.day.key, state, equipment), error: null };
    } catch (e) {
      return { day: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [program, slot, ids, maxes, sessions, sets, equipment]);

  const bw = bodyweight7d(weights, today);
  const target = targetFor(today, targets, bw);
  const totals = dayTotals(today, entries, days);
  const weighIns = useMemo(() => weights.filter((w) => w.kind === "weight").sort((a, b) => a.date.localeCompare(b.date)), [weights]);
  const weightToday = weighIns.find((w) => w.date === today);

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

  async function start(day: PrescribedDay) {
    if (!program) return;
    setBusy(true);
    const all = await ensurePlanExercises(local);
    const id = await startWorkout(local, program, day, all, today);
    setBusy(false);
    navigate(`/workout/${id}`);
  }

  const day = prescription.day;
  const lifts = day?.exercises.filter((e) => e.group !== "shoulder_care") ?? [];
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
              </div>
              <h2 className="today-hero-title">{day.title}</h2>
              {main && mainSet && (
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
              {program ? (
                !doneToday && <button className="btn today-hero-btn" disabled={busy} onClick={() => void start(day)}><PlayIcon /> {planDate === today ? "Start workout" : "Start early"}</button>
              ) : (
                <button className="btn today-hero-btn" disabled={busy} onClick={() => void startPlan()}>Start the plan</button>
              )}
            </Card>
          ) : (
            <Card><Stat label="Rest day" value="Recover" size="md" /></Card>
          )}

          {slot && (
            <section>
              <Label action={<Link to="/plan">Plan</Link>}>This week</Label>
              <div className="today-week">
                {PLAN.days.slice().sort((a, b) => a.weekday - b.weekday).map((d) => {
                  const date = addDays(slot.week.startDate, d.weekday - 1);
                  const done = sessions.some((s) => s.date === date && s.status === "completed") || conditioning.some((c) => c.date === date && c.done);
                  const cls = [d.kind === "lifting" ? "lift" : "cardio", date === planDate ? "now" : "", done ? "done" : ""].join(" ");
                  return (
                    <div key={d.key} className={`today-day ${cls}`}>
                      <span className="today-day-letter">{DAY_LETTER[d.weekday - 1]}</span>
                      <span className="today-day-dot">{done ? <CheckIcon /> : Number(date.slice(8))}</span>
                      <span className="today-day-name">{shortName(d.key)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {lifts.length > 1 && !inProgress && (
            <section>
              <Label action={slot ? <Link to={`/plan?week=${slot.week.weekNo}`}>All</Link> : undefined}>Up next</Label>
              <Card pad={false} className="today-list k-rows">
                {lifts.slice(0, 5).map((e) => {
                  const w = e.sets.filter((s) => s.kind !== "warmup");
                  const top = w[w.length - 1];
                  const reps = w[0]?.repRange ? `${w[0].repRange[0]}–${w[0].repRange[1]}` : w[0]?.reps ?? "max";
                  return (
                    <div key={e.exerciseKey} className="k-row today-row">
                      <span className="k-row-main"><span>{e.name.split(",")[0]}</span></span>
                      <span className="k-num">{w.length} × {reps} <span className="k-muted">· {top ? `${fmtNum(top.load)} ${top.unit === "bodyweight" ? "" : top.unit}` : ""}</span></span>
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

          <WeighIn weighIns={weighIns} todayValue={weightToday?.value} bw7={bw} onSave={async (v) => {
            await local.save("body_measurements", { id: weightToday?.id, date: today, kind: "weight", value: v, unit: "kg", source: "app", note: null });
          }} />

          {squat && (
            <Link to="/progress" className="k-card k-pad today-goal">
              <Ring value={squat.value / SQUAT_GOAL_E1RM} size={84} stroke={9} color="var(--warm)" label="Squat towards 145 × 5">
                <span className="k-num" style={{ fontSize: 17 }}>{Math.round((squat.value / SQUAT_GOAL_E1RM) * 100)}%</span>
              </Ring>
              <div className="k-stat">
                <span className="k-stat-label">Squat → 145 × 5</span>
                <span className="k-stat-value" style={{ fontSize: 28 }}>{fmtNum(squat.value, 0)}<small>kg</small></span>
                <span className="k-stat-sub">{squat.source}</span>
              </div>
              <ChevronRight style={{ color: "var(--fg2)", marginLeft: "auto" }} />
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

function WeighIn({ weighIns, todayValue, bw7, onSave }: { weighIns: { date: string; value: number }[]; todayValue?: number; bw7: number | null; onSave: (v: number) => Promise<void> }) {
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
  return ({ lower_a: "Lower", upper_a: "Upper", lower_b: "Lower", upper_b: "Upper", easy_ride: "Ride", boxing: "Box", rounds: "Rounds" } as Record<string, string>)[key] ?? key;
}
