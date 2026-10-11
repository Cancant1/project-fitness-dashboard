// "How it works": the plan's rules, every number from PLAN or docs/plan/Strength_Return_Plan.md.

import { fmtNum, fmtShortDate } from "../../lib/format";
import { nextTrainingMax, tmChangePercent, trainingMaxFromSet } from "../../plan/engine";
import { PLAN } from "../../plan/bridge";
import type { TmPercentRow, WeekType } from "../../plan/types";
import { ChevronDown } from "../../ui/icons";
import { EXAMPLE_TMS, TYPE_NAME, fmtPct, fmtRest } from "./planView";

const TYPES: WeekType[] = ["calibration", "A", "B", "C", "D", "deload", "taper", "test"];

export function Overview() {
  return (
    <div className="rules-grid">
      <WeekTypes />
      <TrainingMax />
      <StepLifts />
      <StopSigns />
      <Accessories />
      <Rest />
      <PainRule />
      <BadWeeks />
      <Checkpoints />
      <Deloads />
      <Food />
      <Conditioning />
    </div>
  );
}

function weeksOf(type: WeekType): string {
  const nos = PLAN.weeks.filter((w) => w.type === type).map((w) => w.weekNo);
  return nos.join(", ");
}

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
    <section className="rule-card" style={{ gridColumn: "1 / -1" }}>
      <h3>Week types</h3>
      <p className="row-sub" style={{ fontSize: 15 }}>The week type sets the load and reps on the four main lifts. % is of the training max (TM).</p>
      <div className="table-wrap">
        <table className="data" style={{ minWidth: 720 }}>
          <thead>
            <tr><th>Type</th><th>Weeks</th><th>Squat</th><th>Deadlift</th><th>Incline DB, pull-up</th><th>Accessories</th></tr>
          </thead>
          <tbody>
            {TYPES.map((t) => (
              <tr key={t}>
                <td className="nowrap" style={{ fontWeight: 600 }}>{TYPE_NAME[t]}</td>
                <td className="num">{weeksOf(t)}</td>
                <td>{squatCell(t)}</td>
                <td>{deadliftCell(t)}</td>
                <td>{stepCell(t)}</td>
                <td>{accessoryCell(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        <li>Squat: the rep-out uses the same load as the normal sets.</li>
        <li>Deadlift: low-rep ramp (60% × 3, 75% × 2, 90% × 1 of the top set), then one top set to your last clean rep.</li>
        {isolationWeeks.length > 0 && <li>Weeks {isolationWeeks[0]}–{isolationWeeks[isolationWeeks.length - 1]}: one set fewer per isolation exercise.</li>}
        <li>Week 0 accessories: 2 easy sets, stop at the top of the range or 2 reps before failure.</li>
      </ul>
    </section>
  );
}

function TrainingMax() {
  const target = 8;
  const tm = EXAMPLE_TMS.squat;
  const rows = [-2, -1, 0, 1, 2, 3];
  const label = (d: number) => d <= -2 ? "2 or more below" : d === -1 ? "1 below" : d === 0 ? "Hit the target" : d === 3 ? "3 or more over" : `${d} over`;
  return (
    <section className="rule-card">
      <h3>Training max</h3>
      <p className="formula">TM = load × (1 + clean reps ÷ 30)</p>
      <p>Rounded down to 2.5 kg. Squat 100 kg × 12 clean reps → <span className="num" style={{ fontWeight: 600 }}>{trainingMaxFromSet(100, 12)} kg</span>.</p>
      <p>After each squat or deadlift rep-out the TM moves by how many clean reps you got against the target:</p>
      <div className="table-wrap">
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
      <p className="row-sub">The new TM rounds to the nearest 2.5 kg (as the app does), so hitting the target always moves it.</p>
    </section>
  );
}

function StepLifts() {
  const d = PLAN.mainLifts.incline_db_press;
  return (
    <section className="rule-card">
      <h3>Incline DB and pull-up</h3>
      <p>{d.sets} sets of {d.reps}, then a rep-out at the same load, target {d.repOutTarget}. No TM: the rep-out sets next week's load.</p>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Rep-out clean reps</th><th>Next week</th></tr></thead>
          <tbody>
            <tr><td className="num">{d.stepUpAtReps} or more</td><td>Next dumbbell up, or +2.5 kg on the belt</td></tr>
            <tr><td className="num">{d.stepDownAtReps + 1}–{d.stepUpAtReps - 1}</td><td>Same load</td></tr>
            <tr><td className="num">{d.stepDownAtReps} or fewer</td><td>One step lighter</td></tr>
          </tbody>
        </table>
      </div>
      <p className="row-sub">Dumbbells follow your rack: 2 kg steps up to 20 kg, then 2.5 kg steps to 50 kg.</p>
    </section>
  );
}

function StopSigns() {
  return (
    <section className="rule-card">
      <h3>Stop signs</h3>
      <p>On barbell and pull-up rep-outs, end the set after the rep where any of these happens:</p>
      <ol>
        <li>The rep takes about <strong>twice as long</strong> as your first rep.</li>
        <li>Your <strong>form changes</strong>: depth missed, hips rise first, lower back rounds, or the bar drifts.</li>
        <li>You need <strong>more than 2 breaths</strong> before the next rep.</li>
      </ol>
      <p className="row-sub">Count only clean reps. Squat in the rack with safety bars just below your bottom position; on deadlift rep-outs reset each rep, no bounce.</p>
    </section>
  );
}

function Accessories() {
  return (
    <section className="rule-card">
      <h3>How every set ends</h3>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Set</th><th>Used on</th><th>Ends</th></tr></thead>
          <tbody>
            <tr><td style={{ fontWeight: 600 }}>Normal</td><td>Main lifts, all but the last set</td><td>At the prescribed reps, even if easy</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Rep-out</td><td>Last set of the main lifts, RDL, rows, DB bench, split squat</td><td>At a stop sign; count clean reps</td></tr>
            <tr><td style={{ fontWeight: 600 }}>Failure</td><td>Cable and dumbbell isolation</td><td>When you can't finish a full-range rep</td></tr>
          </tbody>
        </table>
      </div>
      <p><strong>Double progression</strong> for everything except the main lifts: each exercise has a rep range. When every set reaches the top of the range, add the smallest load step next session.</p>
      <p className="row-sub">No RPE anywhere. Shoulder-care sets are never to failure.</p>
    </section>
  );
}

function Rest() {
  const r = PLAN.restSecByRole;
  const overrides = new Map<string, number>();
  for (const d of PLAN.days) for (const s of d.slots) if (s.restSec != null && !overrides.has(s.exerciseKey)) overrides.set(s.exerciseKey, s.restSec);
  return (
    <section className="rule-card">
      <h3>Rest</h3>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Sets</th><th className="n">Rest</th><th>Plan</th></tr></thead>
          <tbody>
            <tr><td>Squat, deadlift, incline DB, pull-up</td><td className="n nowrap">{fmtRest(r.main)}</td><td>3 min; {fmtRest(PLAN.repOutRestSec)} before a rep-out</td></tr>
            <tr><td>Other compounds</td><td className="n nowrap">{fmtRest(r.compound)}</td><td>2–3 min</td></tr>
            <tr><td>Isolation</td><td className="n nowrap">{fmtRest(r.isolation)}</td><td>90 s, or alternate two exercises</td></tr>
            <tr><td>Shoulder care block</td><td className="n nowrap">{fmtRest(r.shoulder)}</td><td>45–60 s</td></tr>
          </tbody>
        </table>
      </div>
      <p className="row-sub">
        Exceptions: {[...overrides].map(([k, s]) => `${k === "deadlift" ? "Deadlift ramp" : PLAN.exercises[k]?.name.split(",")[0]} ${fmtRest(s)}`).join(" · ")}.
      </p>
    </section>
  );
}

function PainRule() {
  return (
    <section className="rule-card">
      <h3>Pain rule (right elbow, right shoulder)</h3>
      <ol>
        <li><strong>During the set:</strong> some ache is fine. Sharp pain, or pain that changes your form, ends that exercise for the day.</li>
        <li><strong>Next morning:</strong> back to normal means the load was fine. Still sore: drop that exercise one step down the swap list for 2 weeks.</li>
        <li><strong>Next session:</strong> worse than last time also means one step down.</li>
      </ol>
      <p><strong>See your GP soon</strong> with numbness or tingling in the hand, swelling or heat, pain that wakes you at night, clear loss of grip strength, or pain that started with a pop.</p>
      <p><strong>Shoulder: GP or fysiotherapeut sooner</strong> if it hurts at night or at rest, you can't lift the arm out to the side, it feels weak, or it started after a fall or a pop.</p>
      <details className="disclosure">
        <summary>Swap list <ChevronDown style={{ width: 14, height: 14 }} /></summary>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Exercise</th><th>Use now</th><th>If it still flares</th></tr></thead>
            <tbody>
              {SWAPS.map(([a, b, c]) => <tr key={a}><td style={{ fontWeight: 600 }}>{a}</td><td>{b}</td><td>{c}</td></tr>)}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

const SWAPS: [string, string, string][] = [
  ["Incline DB press", "Neutral grip, bench about 30°", "Neutral-grip DB bench, then DB floor press"],
  ["Overhead triceps extension", "Single-arm, rope or cuff, soft lockout", "Cross-body extension, then reverse-grip pushdown"],
  ["Bar pushdown", "Reverse (underhand) grip", "Rope pushdown"],
  ["Hammer curl", "Underhand cable curl", "Preacher curl"],
  ["Bayesian curl", "Keep, unless the front of the shoulder hurts", "Preacher curl in both curl slots"],
  ["Weighted pull-up", "Neutral grip", "Neutral-handle lat pulldown as the main lift"],
  ["Barbell or Pendlay row", "Keep, with straps", "Underhand grip, then neutral-handle seated cable row"],
];

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
    <section className="rule-card">
      <h3>Bad weeks</h3>
      <div className="table-wrap">
        <table className="data">
          <tbody>{rows.map(([a, b]) => <tr key={a}><td style={{ fontWeight: 600, width: "40%" }}>{a}</td><td>{b}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="row-sub">Track each week: sessions done (goal 4, floor 2), 7-day bodyweight average, your four training maxes.</p>
    </section>
  );
}

function Checkpoints() {
  const cps = PLAN.weeks.flatMap((w) => (w.checkpoint ? [w.checkpoint] : []));
  return (
    <section className="rule-card">
      <h3>Checkpoints</h3>
      <div className="table-wrap">
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
      <p className="row-sub">Checkpoint 1 met: in weeks 8–9, +1 set for your two most lagging muscles.</p>
    </section>
  );
}

function Deloads() {
  const deloads = PLAN.weeks.filter((w) => w.type === "deload");
  const taper = PLAN.weeks.find((w) => w.type === "taper");
  const sq = PLAN.mainLifts.squat.byWeekType.taper;
  const dl = PLAN.mainLifts.deadlift.byWeekType.taper;
  return (
    <section className="rule-card">
      <h3>Deloads and taper</h3>
      <p>Deloads: weeks {deloads.map((w) => w.weekNo).join(" and ")} ({deloads.map((w) => fmtShortDate(w.startDate)).join(", ")}). Week 10 is the England trip.</p>
      <ol>
        <li><strong>Keep the deload weeks.</strong> Same days and exercises, lighter main lifts, 1 set per accessory, no rep-outs, half the Sunday rounds.</li>
        <li><strong>Take it early if needed:</strong> rep-outs below target two weeks running with sleep and bodyweight fine, or joints ache → swap the next week for the deload.</li>
        <li><strong>Don't push it later</strong> than one extra week, even if you feel great.</li>
      </ol>
      {taper && sq && dl && (
        <p><strong>Taper, week {taper.weekNo}:</strong> squat {sq.sets} × {sq.reps} at {fmtPct(sq.pctTm)} TM, deadlift one single at {fmtPct(dl.pctTm)}, no rep-outs, 1 set per accessory.</p>
      )}
    </section>
  );
}

function Food() {
  const n = PLAN.nutrition;
  const r = PLAN.bodyweightRate;
  return (
    <section className="rule-card">
      <h3>Food</h3>
      <div className="table-wrap">
        <table className="data">
          <tbody>
            <tr><td>Calories</td><td className="n">{n.kcal.toLocaleString("en-GB")} kcal</td><td>Every day, same on rest and training days</td></tr>
            <tr><td>Protein</td><td className="n">{n.proteinG} g</td><td>4 meals of 35–40 g</td></tr>
            <tr><td>Fat</td><td className="n">≈ {n.fatG} g</td><td>About 1 g/kg</td></tr>
            <tr><td>Carbs</td><td className="n">≈ {n.carbsG} g</td><td>The rest; a good share 2–3 h before sessions</td></tr>
            <tr><td>Creatine</td><td className="n">3–5 g</td><td>Every day</td></tr>
          </tbody>
        </table>
      </div>
      <p>Lean bulk: +0.1–0.2 kg a week to {n.targetBodyweightKg[0]}–{n.targetBodyweightKg[1]} kg by the PR test. Weigh in every morning; only the 7-day average counts.</p>
      <p className="row-sub">From week {r.fromWeek}, every 2 weeks: under +{r.minKgPerWeek} kg a week → +{r.adjustKcal} kcal; over +{r.maxKgPerWeek} kg → −{r.adjustKcal} kcal. Weeks 0–2: ignore the water jump. Waist every 2 weeks.</p>
    </section>
  );
}

function Conditioning() {
  const ride = PLAN.days.find((d) => d.key === "easy_ride")?.conditioning;
  const box = PLAN.days.find((d) => d.key === "boxing")?.conditioning;
  const rounds = PLAN.days.find((d) => d.key === "rounds")?.conditioning;
  return (
    <section className="rule-card">
      <h3>Conditioning</h3>
      <ul>
        {ride?.kind === "ride" && <li><strong>Wed ride:</strong> {ride.startMinutes} min in weeks 1–{ride.holdThroughWeek}, then +{ride.addPerWeek} min a week up to {ride.maxMinutes}. Talking pace, same loop; note the loop time.</li>}
        {box?.kind === "boxing" && <li><strong>Thu boxing:</strong> {box.minutes} min. Keep sparring controlled.</li>}
        {rounds?.kind === "rounds" && <li><strong>Sun rounds:</strong> {rounds.warmupMin} min warm-up, then {fmtRest(rounds.workSec)} hard / {fmtRest(rounds.easySec)} easy. Start at {rounds.startRounds}; last round within {Math.round(rounds.dropOffFraction * 100)}% of the first → +1 next week, up to {rounds.maxRounds}. Half in deload weeks, none in the test week.</li>}
      </ul>
    </section>
  );
}
