// "How it works": a grid of small cards, one line each; the detail opens in a Sheet.
// Every number comes from PLAN or docs/plan/Strength_Return_Plan.md.

import { useState, type ReactNode } from "react";
import { fmtNum, fmtShortDate } from "../../lib/format";
import { nextTrainingMax, tmChangePercent, trainingMaxFromSet } from "../../plan/engine";
import { PLAN } from "../../plan/bridge";
import type { TmPercentRow, WeekType } from "../../plan/types";
import { Label } from "../../ui/kit";
import { Sheet } from "../../ui/Sheet";
import { ChevronDown } from "../../ui/icons";
import { EXAMPLE_TMS, TYPE_NAME, fmtPct, fmtRest } from "./planView";
import { Flag } from "./WeekRibbon";

interface Topic { key: string; title: string; glyph: ReactNode; line: string; warm?: boolean; Body: () => ReactNode }

const weeksOf = (f: (t: WeekType) => boolean) => PLAN.weeks.filter((w) => f(w.type)).map((w) => w.weekNo);
const cps = PLAN.weeks.flatMap((w) => (w.checkpoint ? [w.checkpoint] : []));

const TOPICS: Topic[] = [
  { key: "types", title: "Week types", glyph: "A–D", line: "Load and reps per week", Body: WeekTypes },
  { key: "repout", title: "Rep-outs & stop signs", glyph: "8+", line: "Last set, clean reps only", warm: true, Body: StopSigns },
  { key: "tm", title: "Training max", glyph: "TM", line: "Rep-outs move it", Body: TrainingMax },
  { key: "step", title: "Incline & pull-up", glyph: "±1", line: "Rep-out sets next load", Body: StepLifts },
  { key: "dp", title: "Double progression", glyph: "↑", line: "Top of range, add load", Body: SetEnds },
  { key: "rest", title: "Rest", glyph: "3′", line: "Mains 3 min, isolation 90 s", Body: Rest },
  { key: "pain", title: "Pain rule", glyph: "!", line: "Elbow and shoulder", warm: true, Body: PainRule },
  { key: "bad", title: "Bad weeks", glyph: "↺", line: "Missed or busy weeks", Body: BadWeeks },
  { key: "cp", title: "Checkpoints", glyph: <Flag />, line: `End of weeks ${cps.map((c) => c.weekNo).join(" and ")}`, warm: true, Body: Checkpoints },
  { key: "deload", title: "Deload & taper", glyph: "↓", line: `Weeks ${weeksOf((t) => t === "deload" || t === "taper").join(", ")}`, Body: Deloads },
  { key: "food", title: "Food", glyph: "kcal", line: `${PLAN.nutrition.kcal.toLocaleString("en-GB")} kcal, protein 2 g/kg`, Body: Food },
  { key: "cardio", title: "Conditioning", glyph: "♡", line: "Ride, boxing, rounds", Body: Conditioning },
];

export function HowItWorks() {
  const [open, setOpen] = useState<Topic | null>(null);
  return (
    <section>
      <Label>How it works</Label>
      <div className="k-grid-2 pl-how-grid">
        {TOPICS.map((t) => (
          <button key={t.key} type="button" className="k-card pl-how" onClick={() => setOpen(t)}>
            <span className={`pl-how-icon${t.warm ? " warm" : ""}`} aria-hidden="true">{t.glyph}</span>
            <span className="pl-how-title">{t.title}</span>
            <span className="pl-how-line">{t.line}</span>
          </button>
        ))}
      </div>
      {open && (
        <Sheet title={open.title} onClose={() => setOpen(null)}>
          <div className="pl-rule"><open.Body /></div>
        </Sheet>
      )}
    </section>
  );
}

// ---------- the detail ----------

const TYPES: WeekType[] = ["calibration", "A", "B", "C", "D", "deload", "taper", "test"];

function squatCell(type: WeekType): string {
  if (type === "calibration") return `Rep-out at ${PLAN.calibrationLoads.squat} kg`;
  if (type === "test") return `Rep-out at ${PLAN.goals.squat.load} kg, target ${PLAN.goals.squat.reps}`;
  const r = PLAN.mainLifts.squat.byWeekType[type];
  if (!r) return "—";
  return `${fmtPct(r.pctTm)} · ${r.sets} × ${r.reps}${r.repOutTarget != null ? ` + rep-out, target ${r.repOutTarget}` : ", no rep-out"}`;
}

function deadliftCell(type: WeekType): string {
  if (type === "calibration") return `Rep-out at ${PLAN.calibrationLoads.deadlift} kg`;
  if (type === "test") return `Rep-out at ${PLAN.goals.deadlift.load} kg, target ${PLAN.goals.deadlift.reps}`;
  const r: TmPercentRow | undefined = PLAN.mainLifts.deadlift.byWeekType[type];
  if (!r) return "—";
  if (r.sets === 0) return `Ramp, top set ${fmtPct(r.pctTm)} · rep-out, target ${r.repOutTarget}`;
  return `${fmtPct(r.pctTm)} · ${r.sets} × ${r.reps}, no rep-out`;
}

function stepCell(type: WeekType): string {
  const d = PLAN.mainLifts.incline_db_press;
  if (type === "calibration") return `Rep-out at ${PLAN.calibrationLoads.incline_db_press} kg / +${PLAN.calibrationLoads.weighted_pullup} kg`;
  if (type === "test") return `Rep-out at ${PLAN.goals.incline_db_press.load} kg / +${PLAN.goals.weighted_pullup.load} kg, target ${PLAN.goals.incline_db_press.reps}`;
  if (type === "deload" || type === "taper") return `${d.lightSets} × ${d.lightReps}, one step lighter`;
  return `${d.sets} × ${d.reps} + rep-out, target ${d.repOutTarget}`;
}

function accessoryCell(type: WeekType): string {
  const r = PLAN.weekTypeRules[type];
  if (!r.includeAccessories) return "None";
  if (r.accessorySetCap === null) return r.accessoryToFailure ? "As written; isolation to failure" : "As written";
  return `${r.accessorySetCap} ${r.accessorySetCap === 1 ? "set" : "sets"}, not to failure`;
}

function WeekTypes() {
  const isolationWeeks = PLAN.weeks.filter((w) => w.isolationSetDelta).map((w) => w.weekNo);
  return (
    <>
      <p className="k-muted">% is of the training max (TM).</p>
      <div className="pl-types">
        {TYPES.map((t) => (
          <div key={t} className="pl-type">
            <div className="pl-type-head"><b>{TYPE_NAME[t]}</b><span className="k-muted">Week{weeksOf((x) => x === t).length > 1 ? "s" : ""} {weeksOf((x) => x === t).join(", ")}</span></div>
            <dl>
              <dt>Squat</dt><dd>{squatCell(t)}</dd>
              <dt>Deadlift</dt><dd>{deadliftCell(t)}</dd>
              <dt>Incline, pull-up</dt><dd>{stepCell(t)}</dd>
              <dt>Accessories</dt><dd>{accessoryCell(t)}</dd>
            </dl>
          </div>
        ))}
      </div>
      <ul>
        <li>Squat: the rep-out uses the same load as the normal sets.</li>
        <li>Deadlift: low-rep ramp (60% × 3, 75% × 2, 90% × 1 of the top set), then one top set to your last clean rep.</li>
        {isolationWeeks.length > 0 && <li>Weeks {isolationWeeks[0]}–{isolationWeeks[isolationWeeks.length - 1]}: one set fewer per isolation exercise.</li>}
        <li>Week 0 accessories: 2 easy sets, stop at the top of the range or 2 reps before failure.</li>
      </ul>
    </>
  );
}

function TrainingMax() {
  const target = 8;
  const tm = EXAMPLE_TMS.squat;
  const rows = [-2, -1, 0, 1, 2, 3];
  const label = (d: number) => d <= -2 ? "2 or more below" : d === -1 ? "1 below" : d === 0 ? "Hit the target" : d === 3 ? "3 or more over" : `${d} over`;
  return (
    <>
      <p className="pl-formula">TM = load × (1 + clean reps ÷ 30)</p>
      <p>Rounded down to 2.5 kg. Squat 100 kg × 12 clean reps → <b className="k-num">{trainingMaxFromSet(100, 12)} kg</b>.</p>
      <p>After each squat or deadlift rep-out the TM moves by how many clean reps you got against the target:</p>
      <div className="pl-tbl">
        <table className="data">
          <thead><tr><th>Clean reps vs target</th><th className="n">Change</th><th className="n">TM {tm} →</th></tr></thead>
          <tbody>
            {rows.map((d) => {
              const pct = tmChangePercent(d);
              return (
                <tr key={d}>
                  <td>{label(d)}</td>
                  <td className="n">{pct > 0 ? "+" : "−"}{Math.abs(pct)}%</td>
                  <td className="n">{fmtNum(nextTrainingMax(tm, target + d, target, "nearest"))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="k-muted">The new TM rounds to the nearest 2.5 kg (as the app does), so hitting the target always moves it.</p>
    </>
  );
}

function StepLifts() {
  const d = PLAN.mainLifts.incline_db_press;
  return (
    <>
      <p>{d.sets} sets of {d.reps}, then a rep-out at the same load, target {d.repOutTarget}. No TM: the rep-out sets next week's load.</p>
      <div className="pl-tbl">
        <table className="data">
          <thead><tr><th>Rep-out clean reps</th><th>Next week</th></tr></thead>
          <tbody>
            <tr><td className="k-num">{d.stepUpAtReps} or more</td><td>Next dumbbell up, or +2.5 kg on the belt</td></tr>
            <tr><td className="k-num">{d.stepDownAtReps + 1}–{d.stepUpAtReps - 1}</td><td>Same load</td></tr>
            <tr><td className="k-num">{d.stepDownAtReps} or fewer</td><td>One step lighter</td></tr>
          </tbody>
        </table>
      </div>
      <p className="k-muted">Dumbbells follow your rack: 2 kg steps up to 20 kg, then 2.5 kg steps to 50 kg.</p>
    </>
  );
}

function StopSigns() {
  return (
    <>
      <p>The last set of each main lift (and of RDL, rows, DB bench, split squat) is a rep-out. On barbell and pull-up rep-outs, end the set after the rep where any of these happens:</p>
      <ol>
        <li>The rep takes about <strong>twice as long</strong> as your first rep.</li>
        <li>Your <strong>form changes</strong>: depth missed, hips rise first, lower back rounds, or the bar drifts.</li>
        <li>You need <strong>more than 2 breaths</strong> before the next rep.</li>
      </ol>
      <p className="k-muted">Count only clean reps. Squat in the rack with safety bars just below your bottom position; on deadlift rep-outs reset each rep, no bounce.</p>
    </>
  );
}

function SetEnds() {
  return (
    <>
      <p><strong>Double progression</strong> for everything except the main lifts: each exercise has a rep range. When every set reaches the top of the range, add the smallest load step next session.</p>
      <div className="pl-tbl">
        <table className="data">
          <thead><tr><th>Set</th><th>Used on</th><th>Ends</th></tr></thead>
          <tbody>
            <tr><td style={{ fontWeight: 600 }}>Normal</td><td>Main lifts, all but the last set</td><td>At the prescribed reps, even if easy</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Rep-out</td><td>Last set of the main lifts, RDL, rows, DB bench, split squat</td><td>At a stop sign; count clean reps</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Failure</td><td>Cable and dumbbell isolation</td><td>When you can't finish a full-range rep</td></tr>
          </tbody>
        </table>
      </div>
      <p className="k-muted">No RPE anywhere. Shoulder-care sets are never to failure.</p>
    </>
  );
}

function Rest() {
  const r = PLAN.restSecByRole;
  const overrides = new Map<string, number>();
  for (const d of PLAN.days) for (const s of d.slots) if (s.restSec != null && !overrides.has(s.exerciseKey)) overrides.set(s.exerciseKey, s.restSec);
  return (
    <>
      <div className="pl-tbl">
        <table className="data">
          <thead><tr><th>Sets</th><th className="n">Rest</th><th>Plan</th></tr></thead>
          <tbody>
            <tr><td>Squat, deadlift, incline DB, pull-up</td><td className="n">{fmtRest(r.main)}</td><td>3 min; {fmtRest(PLAN.repOutRestSec)} before a rep-out</td></tr>
            <tr><td>Other compounds</td><td className="n">{fmtRest(r.compound)}</td><td>2–3 min</td></tr>
            <tr><td>Isolation</td><td className="n">{fmtRest(r.isolation)}</td><td>90 s</td></tr>
            <tr><td>Shoulder care block</td><td className="n">{fmtRest(r.shoulder)}</td><td>45–60 s</td></tr>
          </tbody>
        </table>
      </div>
      <p className="k-muted">
        Exceptions: {[...overrides].map(([k, s]) => `${k === "deadlift" ? "Deadlift ramp" : PLAN.exercises[k]?.name.split(",")[0]} ${fmtRest(s)}`).join(" · ")}.
      </p>
    </>
  );
}

const SWAPS: [string, string, string][] = [
  ["Incline DB press", "Neutral grip, bench about 30°", "Neutral-grip DB bench, then DB floor press"],
  ["Overhead triceps extension", "Single-arm, rope or cuff, soft lockout", "Cross-body extension, then reverse-grip pushdown"],
  ["Bar pushdown", "Rope pushdown", "No swap: go lighter"],
  ["Hammer curl", "Single-arm cable curl, D-handle", "Preacher curl"],
  ["Bayesian curl", "Keep, unless the front of the shoulder hurts", "Preacher curl in both curl slots"],
  ["Weighted pull-up", "Neutral grip", "Neutral-handle lat pulldown as the main lift"],
  ["Barbell or Pendlay row", "Keep, with straps", "Underhand grip, then neutral-handle seated cable row"],
];

function PainRule() {
  return (
    <>
      <p className="k-muted">Right elbow and right shoulder.</p>
      <ol>
        <li><strong>During the set:</strong> some ache is fine. Sharp pain, or pain that changes your form, ends that exercise for the day.</li>
        <li><strong>Next morning:</strong> back to normal means the load was fine. Still sore: drop that exercise one step down the swap list for 2 weeks.</li>
        <li><strong>Next session:</strong> worse than last time also means one step down.</li>
      </ol>
      <p><strong>See your GP soon</strong> with numbness or tingling in the hand, swelling or heat, pain that wakes you at night, clear loss of grip strength, or pain that started with a pop.</p>
      <p><strong>Shoulder: GP or fysiotherapeut sooner</strong> if it hurts at night or at rest, you can't lift the arm out to the side, it feels weak, or it started after a fall or a pop.</p>
      <details className="pl-more">
        <summary>Swap list <ChevronDown style={{ width: 14, height: 14 }} /></summary>
        <div className="pl-tbl">
          <table className="data">
            <thead><tr><th>Exercise</th><th>Use now</th><th>If it still flares</th></tr></thead>
            <tbody>{SWAPS.map(([a, b, c]) => <tr key={a}><td style={{ fontWeight: 600 }}>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function BadWeeks() {
  const rows: [string, string][] = [
    ["Low motivation or a busy week", "Floor week: Monday and Tuesday only, main lifts plus one accessory each, about 35 min. It counts."],
    ["Missed one session", "Do it the next free day. Week full: drop Saturday first. Never two sessions in one day."],
    ["Missed a whole week", "Repeat that week's type. Don't skip ahead."],
    ["Missed 2 weeks or more", "Lower every TM by 5%, then continue."],
    ["Sick with fever or a chest cold", "Don't train. Come back with a deload week."],
    ["Rep-out below target two weeks running", "Check sleep and your 7-day bodyweight before lowering the TM again."],
    ["Pain on a lift", "Swap to a variation your gym has. Don't push through."],
  ];
  return (
    <>
      <div className="pl-tbl">
        <table className="data">
          <tbody>{rows.map(([a, b]) => <tr key={a}><td style={{ fontWeight: 600, width: "40%" }}>{a}</td><td>{b}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="k-muted">Track each week: sessions done (goal 4, floor 2), 7-day bodyweight average, your four training maxes.</p>
    </>
  );
}

function Checkpoints() {
  return (
    <>
      <div className="pl-tbl">
        <table className="data">
          <thead><tr><th>When</th><th className="n">Squat TM</th><th className="n">Deadlift TM</th><th className="n">Bodyweight 7d</th></tr></thead>
          <tbody>
            {cps.map((c) => (
              <tr key={c.id}>
                <td>End of week {c.weekNo}, {fmtShortDate(c.date)}</td>
                <td className="n">{c.squatTm}+</td>
                <td className="n">{c.deadliftTm}+</td>
                <td className="n">{fmtNum(c.bodyweight7d, 1)}+</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Behind? Check sessions done and bodyweight first. If both are on target and you're still behind, add one normal set to each main lift (deadlift: one set of 5 at 85% of that day's top load).</p>
      <p className="k-muted">Checkpoint 1 met: +1 set on each curl and triceps exercise on Tue and Sat, every training week through week 17.</p>
    </>
  );
}

function Deloads() {
  const deloads = PLAN.weeks.filter((w) => w.type === "deload");
  const taper = PLAN.weeks.find((w) => w.type === "taper");
  const sq = PLAN.mainLifts.squat.byWeekType.taper;
  const dl = PLAN.mainLifts.deadlift.byWeekType.taper;
  return (
    <>
      <p>Deloads: weeks {deloads.map((w) => w.weekNo).join(" and ")} ({deloads.map((w) => fmtShortDate(w.startDate)).join(", ")}). Week 10 is the England trip.</p>
      <ol>
        <li><strong>Keep the deload weeks.</strong> Same days and exercises, lighter main lifts, 1 set per accessory, no rep-outs, half the Sunday rounds.</li>
        <li><strong>Take it early if needed:</strong> rep-outs below target two weeks running with sleep and bodyweight fine, or joints ache → swap the next week for the deload.</li>
        <li><strong>Don't push it later</strong> than one extra week, even if you feel great.</li>
      </ol>
      {taper && sq && dl && (
        <p><strong>Taper, week {taper.weekNo}:</strong> squat {sq.sets} × {sq.reps} at {fmtPct(sq.pctTm)} TM, deadlift one single at {fmtPct(dl.pctTm)}, no rep-outs, 1 set per accessory.</p>
      )}
    </>
  );
}

function Food() {
  const n = PLAN.nutrition;
  const r = PLAN.bodyweightRate;
  return (
    <>
      <div className="pl-tbl">
        <table className="data">
          <tbody>
            <tr><td>Calories</td><td className="n">{n.kcal.toLocaleString("en-GB")} kcal</td><td>Every day, same on rest and training days</td></tr>
            <tr><td>Protein</td><td className="n">2 g/kg</td><td>Of your 7-day average weight (≈150 g now; the fixed day gives ≈180 g); 4+ meals</td></tr>
            <tr><td>Fat</td><td className="n">≈ {n.fatG} g</td><td>About 1 g/kg</td></tr>
            <tr><td>Carbs</td><td className="n">≈ {n.carbsG} g</td><td>The rest; a good share 2–3 h before sessions</td></tr>
            <tr><td>Creatine</td><td className="n">5 g</td><td>Every day (since 11 Oct)</td></tr>
          </tbody>
        </table>
      </div>
      <p>Lean bulk: +0.1–0.2 kg a week to {n.targetBodyweightKg[0]}–{n.targetBodyweightKg[1]} kg by the PR test. Weigh in every morning; only the 7-day average counts.</p>
      <p className="k-muted">From week {r.fromWeek}, every 2 weeks: under +{r.minKgPerWeek} kg a week → +{r.adjustKcal} kcal; over +{r.maxKgPerWeek} kg → −{r.adjustKcal} kcal. Weeks 0–2: ignore the water jump. Waist every 2 weeks.</p>
    </>
  );
}

function Conditioning() {
  const ride = PLAN.days.find((d) => d.key === "easy_ride")?.conditioning;
  const box = PLAN.days.find((d) => d.key === "boxing")?.conditioning;
  const rounds = PLAN.days.find((d) => d.key === "rounds")?.conditioning;
  return (
    <ul>
      {ride?.kind === "ride" && <li><strong>Wed ride:</strong> {ride.startMinutes} min in weeks 1–{ride.holdThroughWeek}, then +{ride.addPerWeek} min a week up to {ride.maxMinutes}. Talking pace, same loop; note the loop time.</li>}
      {box?.kind === "boxing" && <li><strong>Thu boxing:</strong> {box.minutes} min. Keep sparring controlled.</li>}
      {rounds?.kind === "rounds" && <li><strong>Sun rounds:</strong> {rounds.warmupMin} min warm-up, then {fmtRest(rounds.workSec)} hard / {fmtRest(rounds.easySec)} easy. Start at {rounds.startRounds}; last round within {Math.round(rounds.dropOffFraction * 100)}% of the first → +1 next week, up to {rounds.maxRounds}. Half in deload weeks, none in the test week.</li>}
    </ul>
  );
}
