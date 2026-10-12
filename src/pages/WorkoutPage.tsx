import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import type { Exercise, PainCheck, SetRow } from "../data/types";
import { fmtNum, parseDecimal, toKg } from "../lib/format";
import { STEP_RULES, incrementAfterRepOut, platesPerSide, trainingMaxAfterRepOut } from "../plan/engine";
import { STACK_LABEL, STACK_OF, pinLabel, weightsFor } from "../plan/equipment";
import { PLAN, activeProgram, equipmentFrom, latestMaxes, usePlan, usePlanIds } from "../plan/bridge";
import { EFFORT_SHORT, EFFORT_TONE, effortLabel, loggedEffort } from "../plan/effort";
import { duringScore, painAction, type PainAction } from "../plan/pain";
import { addExerciseToSession, finishWorkout, maxUpdates, nextExercisePosition, planRef, type PlanSetRef } from "../plan/workout";
import type { Effort, EquipmentProfile, StepLiftKey } from "../plan/types";
import { saveSessionEnergy, savePainCheck } from "../coach";
import { Segmented } from "../ui/kit";
import { Sheet } from "../ui/Sheet";
import { CheckIcon, ChevronDown, ChevronLeft, ChevronRight, MinusIcon, PlayIcon, PlusIcon } from "../ui/icons";
import "../ui/kit.css";
import "./workout.css";

interface Block {
  position: number; exerciseId: string; name: string; sets: SetRow[];
  /** Plan ref of the first working set (or the first set); undefined in a free workout. */
  ref?: PlanSetRef;
  /** How hard the exercise goes (E1); null for exercises outside the plan. */
  effort: Effort | null;
}

/** "warm" | "plain" | "accent" | "muted" for an effort. */
const toneOf = (e: Effort) => EFFORT_TONE[e];

export function WorkoutPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { local } = useStore();
  const sessions = useRows("sessions");
  const allSets = useRows("sets");
  const exercises = useRows("exercises");
  const maxes = useRows("training_maxes");
  const programs = useRows("programs");
  const profiles = useRows("profiles");
  const painChecks = useRows("pain_checks");
  const session = sessions.find((s) => s.id === sessionId);
  const ids = usePlanIds(exercises);
  const equipment = equipmentFrom(profiles[0]);
  const program = activeProgram(programs);

  const blocks = useMemo<Block[]>(() => {
    const mine = allSets.filter((s) => s.session_id === sessionId)
      .sort((a, b) => a.exercise_position - b.exercise_position || kindOrder(a) - kindOrder(b) || a.set_no - b.set_no || a.created_at.localeCompare(b.created_at));
    const out: Block[] = [];
    for (const s of mine) {
      const last = out[out.length - 1];
      if (last && last.position === s.exercise_position) last.sets.push(s);
      else out.push({ position: s.exercise_position, exerciseId: s.exercise_id, name: s.exercise_as_logged ?? exercises.find((e) => e.id === s.exercise_id)?.name ?? "Exercise", sets: [s], effort: null });
    }
    for (const b of out) {
      const first = b.sets.find((s) => s.kind !== "warmup") ?? b.sets[0]!;
      b.ref = planRef(first) ?? b.sets.map(planRef).find(Boolean);
      b.effort = b.ref ? loggedEffort(first.kind, planRef(first) ?? b.ref) : null;
    }
    return out;
  }, [allSets, sessionId, exercises]);

  const firstOpen = blocks.findIndex((b) => b.sets.some((s) => !s.completed));
  const [index, setIndex] = useState<number | null>(null);
  const i = Math.min(index ?? (firstOpen < 0 ? 0 : firstOpen), Math.max(0, blocks.length - 1));
  const block = blocks[i];
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [pain, setPain] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [adding, setAdding] = useState(false);
  const now = useNow(1000);

  if (!session) return <main className="page"><p className="muted">This workout isn't on this device.</p></main>;

  const elapsed = session.started_at ? Math.max(0, Math.floor((now - Date.parse(session.started_at)) / 1000)) : 0;
  const planInfo = (session.legacy_ref as { plan?: { weekType?: string; dayKey?: string } }).plan;
  const calibration = planInfo?.weekType === "calibration";
  const latest = latestMaxes(maxes, ids);
  const sessionPain = painChecks.filter((p) => p.session_id === session.id && !p.deleted_at);
  const painNow = block ? painFor(sessionPain, block.exerciseId) : null;

  async function update(s: SetRow, patch: Partial<SetRow>) {
    // Merge onto the stored row, not the rendered one: a blur save and the tick can land in the same tap.
    const next = { ...(local.get("sets", s.id) ?? s), ...patch };
    // Timed sets keep minutes in load (as SessionPage shows them) and seconds in duration_s; no load_kg.
    const timed = next.unit === "min";
    await local.save("sets", {
      id: s.id, ...patch, load_kg: timed || next.unit === "reps" ? null : toKg(next.load, next.unit),
      ...(timed ? { duration_s: next.load != null ? Math.round(next.load * 60) : null } : {})
    });
  }

  async function toggle(s: SetRow, extra: Partial<SetRow> = {}) {
    const done = !(local.get("sets", s.id) ?? s).completed;
    await update(s, { ...extra, completed: done });
    const ref = planRef(s);
    if (done && ref?.restSec) setRest({ until: Date.now() + ref.restSec * 1000, total: ref.restSec });
  }

  async function addSet(b: Block) {
    const last = b.sets[b.sets.length - 1]!;
    await local.save("sets", {
      ...last, id: undefined, created_at: undefined, kind: last.kind === "warmup" ? "working" : last.kind === "rep_out" ? "working" : last.kind,
      set_no: Math.max(...b.sets.map((s) => s.set_no)) + 1, completed: false, reps: last.reps, note: null
    });
  }

  const finishUpdates = () => maxUpdates(session, blocks.flatMap((b) => b.sets), ids, maxes, equipment, { painChecks });

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header className="workout-top">
        <button className="btn btn-glass btn-icon" aria-label="Minimise workout" onClick={() => navigate("/")}><ChevronDown /></button>
        <div className="workout-title glass">
          <strong>{session.title}</strong><span className="dot" /><span className="num muted">{clock(elapsed)}</span>
        </div>
        <button className="btn btn-glass btn-sm" style={{ height: 44, borderRadius: 22, color: "var(--accent-text)" }} onClick={() => setFinishing(true)}>Finish</button>
      </header>

      <main className="page" style={{ paddingTop: 12, maxWidth: 640, paddingBottom: "calc(max(var(--safe-bottom), 12px) + 96px)" }}>
        {block ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "0 4px" }}>
              <ProgressDots blocks={blocks} i={i} />
              <PairStrip blocks={blocks} i={i} onSelect={setIndex} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8, marginTop: 4 }}>
                <h1 className="large-title" style={{ minWidth: 0 }}>{block.name}</h1>
                <span className="row-sub" style={{ flex: "none", paddingBottom: 6 }}>{i + 1} of {blocks.length}</span>
              </div>
              <ExerciseSubtitle block={block} dayKey={planInfo?.dayKey} />
              <EffortLine block={block} />
              <LastTime exerciseId={block.exerciseId} sessionId={session.id} date={session.date} />
              {block.effort === "care" && <TempoPendulum />}
              <SwapNote block={block} />
            </div>

            {painNow && <PainBanner pain={painNow} />}

            <BlockSets block={block} calibration={calibration} latest={latest} equipment={equipment} onUpdate={update} onToggle={toggle} />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-glass btn-sm" onClick={() => void addSet(block)}><PlusIcon /> Add set</button>
              <ExerciseNotes block={block} />
              <ExerciseNote sessionId={session.id} date={session.date} exerciseId={block.exerciseId} name={block.name} />
              <button className="btn btn-glass btn-sm" onClick={() => setAdding(true)}><PlusIcon /> Add exercise</button>
            </div>

            {rest && rest.until > now && <RestTimer rest={rest} now={now} onAdd={() => setRest({ until: rest.until + 30_000, total: rest.total + 30 })} onSkip={() => setRest(null)} />}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <button className="btn btn-plain" disabled={i === 0} onClick={() => setIndex(i - 1)}><ChevronLeft /> Previous</button>
              {i < blocks.length - 1
                ? <button className="btn btn-plain" onClick={() => setIndex(i + 1)}>Next: {blocks[i + 1]!.name.split(",")[0]} <ChevronRight /></button>
                : <button className="btn btn-plain" onClick={() => setFinishing(true)}>Finish <ChevronRight /></button>}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <p className="muted">No exercises in this workout yet.</p>
            <button className="btn btn-primary" onClick={() => setAdding(true)}><PlusIcon /> Add exercise</button>
          </div>
        )}
      </main>

      <div className="workout-actions">
        <button className="btn btn-glass" style={{ padding: "0 20px", fontSize: 15 }} onClick={() => setPain(true)}>Pain check</button>
        {block && <PrimaryAction block={block} stopped={painNow?.action === "stop"} onToggle={toggle} onNext={() => i < blocks.length - 1 ? setIndex(i + 1) : setFinishing(true)} />}
      </div>

      {adding && (
        <AddExerciseSheet
          onClose={() => setAdding(false)}
          onPick={async (ex) => {
            await addExerciseToSession(local, session.id, ex, nextExercisePosition(allSets, session.id));
            setIndex(blocks.length);
            setAdding(false);
          }}
        />
      )}
      {pain && <PainSheet sessionId={session.id} exerciseId={block?.exerciseId ?? null} date={session.date} onClose={() => setPain(false)} />}
      {finishing && (
        <FinishSheet
          blocks={blocks}
          updates={finishUpdates()}
          onClose={() => setFinishing(false)}
          onFinish={async (notes, energy) => {
            const sets = blocks.flatMap((b) => b.sets);
            if (notes) await local.save("sessions", { id: session.id, notes });
            if (energy) await saveSessionEnergy(local, session.id, energy);
            await finishWorkout(local, session, sets, finishUpdates(), ids, program);
            navigate(`/session/${session.id}`, { replace: true });
          }}
          onDiscard={async () => {
            await local.save("sessions", { id: session.id, status: "discarded" });
            await local.remove("sessions", [session.id]);
            navigate("/", { replace: true });
          }}
        />
      )}
    </div>
  );
}

function kindOrder(s: SetRow) {
  return s.kind === "warmup" ? 0 : 1;
}

function clock(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function unitLabel(u: string) {
  return u === "bodyweight" ? "+kg" : u;
}

// ------------------------------------------------------------------ header pieces

/** One dot per exercise; the members of a pair sit together as one joined group. */
function ProgressDots({ blocks, i }: { blocks: Block[]; i: number }) {
  const groups: { pair?: string; items: { b: Block; n: number }[] }[] = [];
  blocks.forEach((b, n) => {
    const last = groups[groups.length - 1];
    const pair = b.ref?.pair;
    if (pair && last?.pair === pair) last.items.push({ b, n });
    else groups.push({ pair, items: [{ b, n }] });
  });
  const dot = ({ b, n }: { b: Block; n: number }) => <span key={b.position} className={n === i ? "on" : b.sets.every((s) => s.completed) ? "done" : ""} />;
  return (
    <div className="progress-dots" aria-label={`Exercise ${i + 1} of ${blocks.length}`}>
      {groups.map((g, k) => (g.items.length > 1 ? <span key={`pair-${k}`} className="wk-dot-pair">{g.items.map(dot)}</span> : dot(g.items[0]!)))}
    </div>
  );
}

/** P-TIMESAVE: the A/B(/C) members of this exercise's pair, the short rest between them and the rest after. */
function PairStrip({ blocks, i, onSelect }: { blocks: Block[]; i: number; onSelect: (n: number) => void }) {
  const id = blocks[i]?.ref?.pair;
  if (!id) return null;
  const members = blocks.flatMap((b, n) => (b.ref?.pair === id ? [{ b, n }] : []));
  if (members.length < 2) return null;
  const between = members[0]!.b.ref?.restSec;
  const after = members[members.length - 1]!.b.ref?.restSec;
  return (
    <div className="wk-pair" role="group" aria-label="Pair: alternate the sets">
      {members.map(({ b, n }, k) => (
        <Fragment key={b.position}>
          {k > 0 && between != null && <span className="wk-pair-rest" aria-label={`${between} seconds between`}>{between} s</span>}
          <button type="button" className="wk-pair-btn" aria-pressed={n === i} onClick={() => onSelect(n)}>
            <b>{b.ref?.pairLabel ?? String.fromCharCode(65 + k)}</b><span>{b.name.split(",")[0]}</span>
          </button>
        </Fragment>
      ))}
      {after != null && <span className="wk-pair-after">{after} s after</span>}
    </div>
  );
}

function ExerciseSubtitle({ block, dayKey }: { block: Block; dayKey?: string }) {
  const work = block.sets.filter((s) => s.kind !== "warmup");
  const ref = block.ref;
  if (!work.length) return null;
  let text = "";
  if (!ref) {
    text = work[0]!.target_reps == null
      ? (work[0]!.kind === "timed" ? "Timed · minutes" : `${work.length} ${work.length === 1 ? "set" : "sets"} · ${unitLabel(work[0]!.unit)}`)
      : `${work.length} × ${work[0]!.target_reps} · ${fmtNum(work[0]!.load)} ${unitLabel(work[0]!.unit)}`;
  } else {
    const timed = work.filter((s) => s.kind === "timed");
    const normal = work.filter((s) => s.kind === "working" || s.kind === "top" || s.kind === "failure");
    const repOut = work.find((s) => s.kind === "rep_out");
    const backoff = work.filter((s) => s.kind === "backoff");
    const light = ref.mainLift === "squat" && !repOut && dayKey != null && dayKey === PLAN.mainLiftFallbacks?.squat.dayKey;
    const parts: string[] = [];
    if (light) parts.push("Light squat ·");
    if (timed.length) parts.push(`${timed.length} × ${planRef(timed[0]!)?.durationSec ?? ""} s hold`);
    else if (normal.length) parts.push(`${normal.length} × ${normal[0]!.target_reps ?? normal[0]!.reps ?? ""}`);
    if (repOut) parts.push(normal.length ? "+ rep-out" : ref.mainLift === "deadlift" ? "Top set" : "Rep-out");
    if (backoff.length) parts.push(`+ ${backoff.length} back-off`);
    const head = (repOut ?? normal[0] ?? timed[0] ?? work[0])!;
    if (head.load != null && !(head.unit === "bodyweight" && !head.load)) parts.push(`· ${fmtNum(head.load)} ${unitLabel(head.unit)}`);
    text = parts.join(" ");
  }
  return <p style={{ fontSize: 15, lineHeight: "20px", color: "var(--fg2)" }}>{text}</p>;
}

/** How hard this exercise goes (E1): a short pill and a one-line explanation, always visible. */
function EffortLine({ block }: { block: Block }) {
  if (!block.effort) return null;
  const work = block.sets.filter((s) => s.kind !== "warmup");
  const first = work[0];
  const ref = first ? planRef(first) : block.ref;
  const reps = first?.reps ?? (ref?.repRange ? ref.repRange[1] : null);
  // A set that goes differently from the rest (an accessory's last-set rep-out); the main-lift rep-out card and
  // the back-off group carry their own.
  const other = work.filter((s) => s.kind !== "backoff" && !(s.kind === "rep_out" && planRef(s)?.mainLift))
    .map((s) => loggedEffort(s.kind, planRef(s))).find((e) => e !== block.effort);
  return (
    <>
      <EffortTag effort={block.effort} text={effortLabel(block.effort, reps, ref?.capReps)} />
      {other && <EffortTag effort={other} text={`Last set · ${effortLabel(other)}`} />}
    </>
  );
}

/**
 * Slow-tempo guide for the wrist ladder (3 s up, 3 s down): a metronome needle that swings for ever, with the phase
 * and the second counted beside it. Pure CSS swing; the label follows the same clock.
 */
function TempoPendulum() {
  const [start] = useState(() => performance.now());
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setT(performance.now() - start), 100);
    return () => window.clearInterval(id);
  }, [start]);
  const phase = (t % 6000) < 3000 ? "up" : "down";
  const sec = Math.floor((t % 3000) / 1000) + 1;
  return (
    <div className="wk-tempo" role="timer" aria-label="Tempo: 3 seconds up, 3 seconds down">
      <div className="wk-tempo-dial" aria-hidden="true">
        <span className="wk-tempo-arc" />
        <span className="wk-tempo-needle" />
        <span className="wk-tempo-pivot" />
      </div>
      <div className="wk-tempo-text">
        <b>{phase === "up" ? "Lift" : "Lower"}</b>
        <span className="num">{[1, 2, 3].map((n) => <i key={n} data-on={n <= sec}>{n}</i>)}</span>
      </div>
    </div>
  );
}

/** "Last time · 12 Oct: 80 × 10 · 80 × 10" for this exercise, from the latest earlier completed session (+ its note). */
function LastTime({ exerciseId, sessionId, date }: { exerciseId: string; sessionId: string; date: string }) {
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const annotations = useRows("annotations");
  const info = useMemo(() => {
    const done = new Map(sessions.filter((x) => x.status === "completed" && x.id !== sessionId && x.date <= date).map((x) => [x.id, x.date]));
    const mine = sets.filter((x) => x.exercise_id === exerciseId && done.has(x.session_id) && x.completed && x.kind !== "warmup" && x.load != null);
    if (!mine.length) return null;
    const lastSession = mine.reduce((a, b) => (done.get(b.session_id)! > done.get(a.session_id)! ? b : a)).session_id;
    const rows = mine.filter((x) => x.session_id === lastSession).sort((a, b) => a.set_no - b.set_no);
    const unit = rows[0]!.unit === "lb" ? " lb" : "";
    const text = rows.map((x) => `${fmtNum(Number(x.load))}${unit} × ${x.reps ?? "–"}`).join(" · ");
    const note = annotations.find((a) => a.kind === "note" && a.session_id === lastSession && a.exercise_id === exerciseId)?.text;
    return { date: done.get(lastSession)!, text, note };
  }, [sessions, sets, annotations, exerciseId, sessionId, date]);
  if (!info) return null;
  const d = new Date(`${info.date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <p className="wk-last">
      <span className="wk-last-label">Last time · {d}</span> {info.text}
      {info.note && <span className="wk-last-note">“{info.note}”</span>}
    </p>
  );
}

function EffortTag({ effort, text }: { effort: Effort; text?: string }) {
  return (
    <div className="wk-effort">
      <span className="wk-eff" data-tone={toneOf(effort)}>{EFFORT_SHORT[effort]}</span>
      {text && <span className="wk-eff-text">{text}</span>}
    </div>
  );
}

/** A coach swap running for this exercise (pain rule): "Swap: … until 3 Nov. Start at 25 kg; …", always visible. */
function SwapNote({ block }: { block: Block }) {
  const key = block.ref?.exerciseKey;
  const plan = usePlan();
  const note = key ? plan.days.flatMap((d) => d.slots).find((s) => s.exerciseKey === key)?.notes.find((n) => n.startsWith("Swap:")) : undefined;
  return note ? <span className="k-pill k-pill-warm k-pill-wrap wk-swap">{note}</span> : null;
}

function ExerciseNotes({ block }: { block: Block }) {
  const [open, setOpen] = useState(false);
  const key = block.ref?.exerciseKey;
  const plan = usePlan();
  const notes = plan.days.flatMap((d) => d.slots).find((s) => s.exerciseKey === key)?.notes ?? [];
  if (!notes.length) return null;
  return (
    <>
      <button className="btn btn-glass btn-sm" onClick={() => setOpen(true)}>Cues</button>
      {open && (
        <Sheet title={block.name} onClose={() => setOpen(false)}>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: 15 }}>
            {notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </Sheet>
      )}
    </>
  );
}

// ------------------------------------------------------------------ pain in this session

interface PainNow { action: Exclude<PainAction, "go">; score: number | null; sharp: boolean }

/** The worst pain check logged on this exercise in this session: stop (≥ 6 or sharp) or hold (4–5); null otherwise. */
function painFor(checks: readonly PainCheck[], exerciseId: string): PainNow | null {
  let out: PainNow | null = null;
  for (const p of checks) {
    if (p.exercise_id !== exerciseId) continue;
    const score = duringScore(p);
    const sharp = p.during_set === "sharp";
    const action = painAction(score, sharp);
    if (action === "go") continue;
    if (!out || (action === "stop" && out.action !== "stop") || (action === out.action && (score ?? 0) > (out.score ?? 0))) out = { action, score, sharp };
  }
  return out;
}

function PainBanner({ pain }: { pain: PainNow }) {
  if (pain.action === "stop") {
    return (
      <section className="wk-stop" role="alert">
        <strong>Stop this exercise today</strong>
        <span>{pain.sharp ? "Sharp pain" : `Pain ${pain.score}/10`}</span>
      </section>
    );
  }
  return <span className="k-pill k-pill-accent wk-hold">Hold the load next time · pain {pain.score}/10</span>;
}

// ------------------------------------------------------------------ sets

function BlockSets({ block, calibration, latest, equipment, onUpdate, onToggle }: {
  block: Block; calibration: boolean; latest: Partial<Record<string, number>>; equipment: EquipmentProfile;
  onUpdate: (s: SetRow, p: Partial<SetRow>) => Promise<void>; onToggle: (s: SetRow, extra?: Partial<SetRow>) => Promise<void>;
}) {
  const warmups = block.sets.filter((s) => s.kind === "warmup");
  const work = block.sets.filter((s) => s.kind !== "warmup");
  const repOut = work.find((s) => s.kind === "rep_out" && planRef(s)?.mainLift);
  const normal = work.filter((s) => s !== repOut && s.kind !== "backoff");
  const backoff = work.filter((s) => s.kind === "backoff");
  const isBarbell = ["squat", "deadlift", "romanian_deadlift", "barbell_row"].includes(block.ref?.exerciseKey ?? "");
  const effortOf = (s: SetRow) => (block.effort ? loggedEffort(s.kind, planRef(s)) : null);

  return (
    <>
      {warmups.length > 0 && (
        <section className="list" aria-label="Warm-up">
          {warmups.map((s, n) => (
            <div className="row" key={s.id} style={{ color: s.completed ? "var(--fg2)" : "var(--fg)" }}>
              <span className="row-sub" style={{ width: 64 }}>{n === 0 ? "Warm-up" : ""}</span>
              <span className="num" style={{ flex: 1, textAlign: "right" }}>{s.unit === "bodyweight" && !s.load ? "BW" : `${fmtNum(s.load)} ${s.unit === "bodyweight" ? "+kg" : s.unit}`}</span>
              <span className="num" style={{ width: 48, textAlign: "right" }}>× {s.reps}</span>
              <button className="check" aria-pressed={s.completed} aria-label={`Warm-up set ${n + 1} done`} onClick={() => void onToggle(s)} style={{ marginLeft: 8 }}>{s.completed && <CheckIcon />}</button>
            </div>
          ))}
        </section>
      )}

      {normal.length > 0 && (
        <section className="list" aria-label="Working sets">
          {normal.map((s) => s.kind === "timed" && planRef(s)
            ? <TimedLine key={s.id} s={s} onUpdate={onUpdate} onToggle={onToggle} />
            : <SetLine key={s.id} s={s} effort={effortOf(s)} onUpdate={onUpdate} onToggle={onToggle} />)}
        </section>
      )}

      {repOut && <RepOutCard key={repOut.id} s={repOut} calibration={calibration} latest={latest} equipment={equipment} onUpdate={onUpdate} onToggle={onToggle} />}

      {backoff.length > 0 && (
        <section className="wk-group" aria-label="Back-off sets">
          <div className="wk-group-head">
            <span className="wk-group-title">Back-off</span>
            <EffortTag effort={effortOf(backoff[0]!) ?? "controlled"} text={backoff.length > 1 ? "2nd set optional" : undefined} />
          </div>
          <div className="list">
            {backoff.map((s) => <SetLine key={s.id} s={s} effort={effortOf(s)} onUpdate={onUpdate} onToggle={onToggle} />)}
          </div>
        </section>
      )}

      <PinPicker block={block} onUpdate={onUpdate} />

      {isBarbell && work[0]?.load != null && (
        <p className="row-sub" style={{ margin: "0 4px" }}>{plates(Number((repOut ?? work[work.length - 1]!).load), equipment)}</p>
      )}
    </>
  );
}

function plates(total: number, eq: EquipmentProfile) {
  const p = platesPerSide(total, eq.barKg, eq.platesKg);
  if (p.belowBar) return `Below the ${eq.barKg} kg bar`;
  return `Per side: ${p.perSide.length ? p.perSide.join(" + ") : "nothing"} · bar ${eq.barKg} kg${p.shortfallKg > 0 ? ` · ${fmtNum(p.shortfallKg)} kg short` : ""}`;
}

const setLabel = (s: SetRow) => (s.kind === "failure" ? "F" : s.kind === "rep_out" ? "R" : s.kind === "top" ? "T" : s.kind === "backoff" ? "B" : s.kind === "timed" ? "H" : String(s.set_no));

/** The set number as a small badge, tinted by how hard the set goes (E1). */
function SetBadge({ s, effort }: { s: SetRow; effort: Effort | null }) {
  return (
    <span className="wk-setno" data-tone={effort ? toneOf(effort) : "plain"} title={effort ? EFFORT_SHORT[effort] : s.kind}
      aria-label={`Set ${setLabel(s)}${effort ? `, ${EFFORT_SHORT[effort]}` : ""}`}>{setLabel(s)}</span>
  );
}

const loadText = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
/** Sets that need the reps he actually got: to failure, or a rep-out. The others are prescribed fixed reps. */
const needsReps = (s: SetRow) => s.kind === "failure" || s.kind === "rep_out";

function SetLine({ s, effort, onUpdate, onToggle }: { s: SetRow; effort: Effort | null; onUpdate: (s: SetRow, p: Partial<SetRow>) => Promise<void>; onToggle: (s: SetRow, extra?: Partial<SetRow>) => Promise<void> }) {
  const [load, setLoad] = useState(loadText(s.load));
  const [reps, setReps] = useState(s.reps == null ? "" : String(s.reps));
  const repsRef = useRef<HTMLInputElement>(null);
  // Follow the stored value, but keep what he is typing ("82," is 82 until the 5 comes).
  useEffect(() => setLoad((prev) => (parseDecimal(prev) === s.load ? prev : loadText(s.load))), [s.load]);
  useEffect(() => setReps((prev) => (parseDecimal(prev) === s.reps ? prev : s.reps == null ? "" : String(s.reps))), [s.reps]);
  const label = setLabel(s);
  // Saved as he types: on iPhone a tapped button doesn't take focus, so a blur save can't be relied on.
  const onLoad = (v: string) => { setLoad(v); const n = parseDecimal(v); if (n != null && n !== s.load) void onUpdate(s, { load: n }); };
  const onReps = (v: string) => {
    setReps(v);
    const n = v.trim() === "" ? null : parseDecimal(v);
    if ((n != null || v.trim() === "") && n !== s.reps) void onUpdate(s, { reps: n == null ? null : Math.round(n) });
  };
  return (
    <div className="set-grid">
      <SetBadge s={s} effort={effort} />
      <label className="mini-field">
        <span className="sr-only">Load</span>
        <input inputMode="decimal" value={load} onChange={(e) => onLoad(e.target.value)}
          onBlur={() => { if (parseDecimal(load) == null) setLoad(loadText(s.load)); }} />
        <span className="field-suffix" style={{ fontSize: 13 }}>{unitLabel(s.unit)}</span>
      </label>
      <label className="mini-field">
        <span className="sr-only">Reps</span>
        <input ref={repsRef} inputMode="numeric" value={reps} placeholder={s.target_reps ?? (s.kind === "failure" ? "max" : "")}
          onChange={(e) => onReps(e.target.value)} />
        <span className="field-suffix" style={{ fontSize: 13 }}>reps</span>
      </label>
      <button className="check" aria-pressed={s.completed} aria-label={`Set ${label} done`}
        onClick={async () => {
          if (s.completed) { await onToggle(s); return; }
          let r = parseDecimal(reps);
          if (r == null) {
            // To failure or a rep-out: the reps are the result, so don't make them up. Ask for them.
            if (needsReps(s)) { repsRef.current?.focus(); return; }
            r = s.target_reps ? parseDecimal(s.target_reps.split("–").pop() ?? "") : null;
          }
          await onToggle(s, { reps: r == null ? null : Math.round(r), load: parseDecimal(load) ?? s.load });
        }}>{s.completed && <CheckIcon />}</button>
    </div>
  );
}

/** An isometric hold (wrist-ladder flare-up step): the hold in seconds with a countdown, or tick it off. */
function TimedLine({ s, onUpdate, onToggle }: { s: SetRow; onUpdate: (s: SetRow, p: Partial<SetRow>) => Promise<void>; onToggle: (s: SetRow, extra?: Partial<SetRow>) => Promise<void> }) {
  const ref = planRef(s);
  const sec = ref?.durationSec ?? s.duration_s ?? 30;
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until == null) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [until]);
  const left = until == null ? sec : Math.max(0, Math.ceil((until - now) / 1000));
  useEffect(() => {
    if (until == null || left > 0) return;
    setUntil(null);
    void (async () => {
      await onUpdate(s, { duration_s: sec });
      if (!s.completed) await onToggle(s);
    })();
  }, [until, left, sec, s, onUpdate, onToggle]);
  const running = until != null;
  return (
    <div className="set-grid wk-timed">
      <SetBadge s={s} effort={loggedEffort(s.kind, ref)} />
      <span className="wk-timed-load num">{s.load ? `${fmtNum(s.load)} ${unitLabel(s.unit)}` : "Hold"}</span>
      <button type="button" className={`btn ${running ? "btn-primary" : "btn-tinted"} wk-timer-btn`} aria-label={running ? `${left} seconds left, tap to stop` : `Start a ${sec} second hold`}
        onClick={() => { if (running) setUntil(null); else { setNow(Date.now()); setUntil(Date.now() + sec * 1000); } }}>
        {!running && <PlayIcon size={12} />}<span>{left} s</span>
      </button>
      <button className="check" aria-pressed={s.completed} aria-label={`Hold ${s.set_no} done`}
        onClick={async () => { if (!s.completed) await onUpdate(s, { duration_s: sec }); await onToggle(s); }}>{s.completed && <CheckIcon />}</button>
    </div>
  );
}

function RepOutCard({ s, calibration, latest, equipment, onUpdate, onToggle }: {
  s: SetRow; calibration: boolean; latest: Partial<Record<string, number>>; equipment: EquipmentProfile;
  onUpdate: (s: SetRow, p: Partial<SetRow>) => Promise<void>; onToggle: (s: SetRow, extra?: Partial<SetRow>) => Promise<void>;
}) {
  const ref = planRef(s)!;
  const cap = ref.capReps;
  const [reps, setReps] = useState<number>(s.reps ?? ref.target ?? 5);
  const [stops, setStops] = useState(false);
  const lift = ref.mainLift!;
  const tmLift = lift === "squat" || lift === "deadlift";
  const tm = tmLift
    ? trainingMaxAfterRepOut(Number(s.load), reps, { previous: latest[lift], target: ref.target, calibration: calibration || ref.calibration === true, oldBest: PLAN.oldBestE1rm?.[lift] }).tm
    : null;
  const nextLoad = !tmLift ? incrementAfterRepOut(lift as StepLiftKey, Number(s.load), reps, equipment, PLAN.mainLifts[lift as StepLiftKey] ?? STEP_RULES[lift as StepLiftKey]).load : null;
  const effort = loggedEffort(s.kind, ref);
  return (
    <section className="repout-card" aria-label="Rep-out set">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div className="wk-ro-tags">
          <span className="wk-eff" data-tone={toneOf(effort)}>{EFFORT_SHORT[effort]}{ref.target ? ` · target ${ref.target}` : ""}</span>
          {cap != null && <span className="k-pill k-pill-warm">Stop at {cap}</span>}
        </div>
        <button className="btn btn-plain btn-sm" onClick={() => setStops(!stops)}>Stop signs</button>
      </div>
      <p className="wk-eff-text">{effortLabel(effort, null, cap)}</p>
      {stops && (
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, color: "var(--fg2)", display: "flex", flexDirection: "column", gap: 4 }}>
          <li>A rep takes about twice as long as rep 1</li>
          <li>Form changes: depth, hips first, back rounds, bar drifts</li>
          <li>More than 2 breaths between reps</li>
        </ul>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span className="big-load">{lift === "weighted_pullup" ? `+${fmtNum(s.load)}` : fmtNum(s.load)}</span>
          <span style={{ fontSize: 17, fontWeight: 600, color: "var(--fg2)" }}>kg</span>
        </div>
        <div className="stepper">
          <button aria-label="One rep fewer" onClick={() => setReps(Math.max(0, reps - 1))}><MinusIcon /></button>
          <label className="stepper-value">
            <span className="sr-only">Clean reps</span>
            <input inputMode="numeric" value={reps} onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, "")) || 0; setReps(cap != null ? Math.min(cap, v) : v); }} />
            <span style={{ fontSize: 11, color: "var(--fg2)" }}>reps</span>
          </label>
          <button aria-label="One rep more" disabled={cap != null && reps >= cap} onClick={() => setReps(cap != null ? Math.min(cap, reps + 1) : reps + 1)}><PlusIcon /></button>
        </div>
      </div>
      <div className="row" style={{ borderTop: "1px solid var(--sep)", minHeight: 48 }}>
        <span className="muted">{tmLift ? "New training max" : "Next load"}</span>
        <span className="num" style={{ fontWeight: 700, fontSize: 17 }}>
          {tm != null ? `${fmtNum(tm)} kg` : nextLoad != null ? `${lift === "weighted_pullup" ? "+" : ""}${fmtNum(nextLoad)} kg` : "same"}
        </span>
      </div>
      <button className={`btn ${s.completed ? "btn-glass" : "btn-warm"} btn-block`} style={{ marginBottom: 12 }}
        onClick={async () => { if (s.completed) await onUpdate(s, { reps }); else await onToggle(s, { reps }); }}>
        {s.completed ? `Saved · ${s.reps} reps (tap to update)` : "Save Rep-out"}
      </button>
    </section>
  );
}

function PrimaryAction({ block, stopped, onToggle, onNext }: { block: Block; stopped: boolean; onToggle: (s: SetRow, extra?: Partial<SetRow>) => Promise<void>; onNext: () => void }) {
  const next = block.sets.find((s) => !s.completed);
  if (!next || stopped) return <button className="btn btn-primary" style={{ flex: 1 }} onClick={onNext}>Next exercise</button>;
  if (next.kind === "rep_out" && planRef(next)?.mainLift) return <button className="btn btn-glass" style={{ flex: 1 }} disabled>Log the rep-out above</button>;
  const sec = planRef(next)?.durationSec;
  if (needsReps(next) && next.reps == null) return <button className="btn btn-glass" style={{ flex: 1 }} disabled>Type the reps for set {next.set_no}</button>;
  const what = next.kind === "warmup" ? "warm-up" : next.kind === "timed" ? `hold ${next.set_no}` : next.kind === "backoff" ? "back-off" : `set ${next.set_no}`;
  const detail = next.kind === "timed"
    ? (sec != null ? ` · ${sec} s` : "")
    : `${next.load != null ? ` · ${fmtNum(next.load)} ${unitLabel(next.unit)}` : ""} × ${next.reps ?? next.target_reps ?? "?"}`;
  return (
    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void onToggle(next)}>
      Done: {what}{detail}
    </button>
  );
}

function RestTimer({ rest, now, onAdd, onSkip }: { rest: { until: number; total: number }; now: number; onAdd: () => void; onSkip: () => void }) {
  const left = Math.max(0, Math.ceil((rest.until - now) / 1000));
  const frac = left / rest.total;
  const C = 2 * Math.PI * 17;
  return (
    <section className="rest" role="timer" aria-label="Rest">
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="17" fill="none" stroke="var(--ink-fg2)" strokeOpacity="0.35" strokeWidth="3" />
        <circle cx="20" cy="20" r="17" fill="none" stroke="var(--ink-fg)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 20 20)" />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <span className="num" style={{ fontSize: 22, fontWeight: 700, lineHeight: "26px" }}>{clock(left)}</span>
        <span style={{ fontSize: 12, color: "var(--ink-fg2)" }}>rest · {clock(rest.total)}</span>
      </div>
      <button className="btn btn-sm" style={{ background: "rgba(127,127,127,0.25)", color: "var(--ink-fg)" }} onClick={onAdd}>+30 s</button>
      <button className="btn btn-sm" style={{ background: "transparent", color: "var(--ink-fg2)" }} onClick={onSkip}>Skip</button>
    </section>
  );
}

// ------------------------------------------------------------------ pain sheet

const SITES = [{ value: "right_elbow", label: "Elbow" }, { value: "right_shoulder", label: "Shoulder" }, { value: "other", label: "Other" }] as const;
type Site = (typeof SITES)[number]["value"];
const VERDICT: Record<PainAction, string> = { go: "Keep going", hold: "Hold the load next time", stop: "Stop this exercise today" };

/** J-PAINRULE 0–10 (E14): where, how much (slider), sharp? The verdict updates as you slide. */
function PainSheet({ sessionId, exerciseId, date, onClose }: { sessionId: string; exerciseId: string | null; date: string; onClose: () => void }) {
  const { local } = useStore();
  const [site, setSite] = useState<Site>("right_elbow");
  const [score, setScore] = useState(0);
  const [sharp, setSharp] = useState(false);
  const [worse, setWorse] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const action = painAction(score, sharp);
  return (
    <Sheet title="Pain check" onClose={onClose}>
      <div className="wk-seg44"><Segmented label="Where" value={site} onChange={setSite} options={SITES.map((s) => ({ value: s.value, label: s.label }))} /></div>
      <section className="wk-pain" aria-label="Pain during the set, 0 to 10">
        <div className="wk-pain-top">
          <span className="wk-pain-v" data-action={action}>{score}<small>/10</small></span>
          <button type="button" className="wk-sharp" aria-pressed={sharp} onClick={() => setSharp(!sharp)}>Sharp</button>
        </div>
        <input type="range" className="wk-range" min={0} max={10} step={1} value={score} aria-label="Pain, 0 to 10"
          onChange={(e) => setScore(Number(e.target.value))} />
        <div className="wk-pain-ends" aria-hidden="true"><span>None</span><span>Worst</span></div>
      </section>
      <p className="wk-verdict" data-action={action} role="status">{VERDICT[action]}</p>
      {(score >= 1 || sharp) && (
        <div className="wk-worse">
          <span>Worse than last time?</span>
          <div className="wk-yn" role="group" aria-label="Worse than last time?">
            <button type="button" aria-pressed={worse === false} onClick={() => setWorse(worse === false ? null : false)}>No</button>
            <button type="button" aria-pressed={worse === true} onClick={() => setWorse(worse === true ? null : true)}>Yes</button>
          </div>
        </div>
      )}
      <button className="btn btn-primary" disabled={saved} onClick={async () => {
        await savePainCheck(local, { date, site, exerciseId, sessionId, score, sharp, worseThanLast: worse });
        setSaved(true);
        window.setTimeout(onClose, 500);
      }}>{saved ? "Saved" : "Save"}</button>
    </Sheet>
  );
}

// ------------------------------------------------------------------ finish

type Energy = 1 | 2 | 3 | 4 | 5;

/**
 * A note per exercise in this session ("felt X", "ask Claude about Y"): one annotations row, kind "note", linked to the
 * session and exercise. Shown on the session page and read at the weekly check-in.
 */
function ExerciseNote({ sessionId, date, exerciseId, name }: { sessionId: string; date: string; exerciseId: string; name: string }) {
  const { local } = useStore();
  const annotations = useRows("annotations");
  const existing = annotations.find((a) => a.kind === "note" && a.session_id === sessionId && a.exercise_id === exerciseId);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const close = () => setOpen(false);
  return (
    <>
      <button className="btn btn-glass btn-sm" onClick={() => { setText(existing?.text ?? ""); setOpen(true); }}>
        {existing ? "Note ✓" : "Note"}
      </button>
      {open && (
        <Sheet title={`Note · ${name}`} onClose={close}>
          <label className="field" style={{ height: "auto", padding: 12 }}>
            <span className="sr-only">Note for {name}</span>
            <textarea rows={4} placeholder="How it felt, setup, questions for the check-in…" value={text} onChange={(e) => setText(e.target.value)}
              style={{ border: 0, background: "transparent", width: "100%", resize: "vertical", outline: "none" }} />
          </label>
          <button className="btn btn-primary" onClick={async () => {
            const t = text.trim();
            if (existing && !t) await local.remove("annotations", [existing.id]);
            else if (t) await local.save("annotations", { ...(existing ? { id: existing.id } : {}), kind: "note", date, end_date: null, exercise_id: exerciseId, session_id: sessionId, text: t, status: "open" });
            close();
          }}>Save note</button>
        </Sheet>
      )}
    </>
  );
}

function FinishSheet({ blocks, updates, onClose, onFinish, onDiscard }: {
  blocks: Block[]; updates: ReturnType<typeof maxUpdates>; onClose: () => void; onFinish: (notes: string, energy: Energy | null) => Promise<void>; onDiscard: () => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [energy, setEnergy] = useState<Energy | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const sets = blocks.flatMap((b) => b.sets).filter((s) => s.kind !== "warmup");
  const done = sets.filter((s) => s.completed).length;
  return (
    <Sheet title="Finish workout" onClose={onClose}>
      <div className="list">
        <div className="row"><span>Working sets done</span><span className="num" style={{ fontWeight: 600 }}>{done} of {sets.length}</span></div>
        {updates.map((u) => (
          <div className="wk-update" key={u.lift}>
            <div className="row"><span>{u.label}</span><span className="num" style={{ fontWeight: 600 }}>{u.from != null && u.from !== u.to ? `${fmtNum(u.from)} → ` : ""}{fmtNum(u.to)} kg</span></div>
            {(u.provisional || u.held || u.capped) && (
              <div className="wk-prov">
                {u.held && <span className="k-pill k-pill-accent">Held · pain 4/10 or more</span>}
                {u.capped && <span className="k-pill k-pill-plain">Capped past your old best</span>}
                {u.provisional && (
                  <>
                    <span className="k-pill k-pill-warm">{u.note && !u.held ? u.note : "provisional (>12 reps)"}</span>
                    <p className="row-sub">Over 12 reps the estimate is rough; the next rep-outs correct it.</p>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {done < sets.length && <p className="row-sub">Unticked sets stay in the log as not done.</p>}
      <section className="wk-feel" aria-label="How did it feel?">
        <span className="wk-feel-q">How did it feel?</span>
        <div className="wk-feel-btns" role="group" aria-label="Session energy, 1 to 5">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <button key={n} type="button" aria-pressed={energy === n} onClick={() => setEnergy(energy === n ? null : n)}>{n}</button>
          ))}
        </div>
        <div className="wk-feel-ends" aria-hidden="true"><span>Drained</span><span>Strong</span></div>
      </section>
      <label className="field" style={{ height: "auto", padding: 12 }}>
        <span className="sr-only">Notes</span>
        <textarea rows={3} placeholder="How did it go? (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
          style={{ border: 0, background: "transparent", width: "100%", resize: "vertical", outline: "none" }} />
      </label>
      <button className="btn btn-primary" disabled={saving} onClick={async () => { if (saving) return; setSaving(true); try { await onFinish(notes.trim(), energy); } finally { setSaving(false); } }}>{saving ? "Saving…" : "Save Workout"}</button>
      {confirmDiscard
        ? <button className="btn btn-glass" style={{ color: "var(--bad)" }} onClick={() => void onDiscard()}>Discard — this removes the workout</button>
        : <button className="btn btn-plain" style={{ color: "var(--bad)" }} onClick={() => setConfirmDiscard(true)}>Discard workout…</button>}
    </Sheet>
  );
}

function AddExerciseSheet({ onClose, onPick }: { onClose: () => void; onPick: (e: Exercise) => Promise<void> }) {
  const exercises = useRows("exercises");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const q = query.trim().toLowerCase();
  const list = exercises
    .filter((e) => !e.archived)
    .filter((e) => !q || `${e.name} ${e.aliases.join(" ")} ${e.muscle_direct ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name));
  return (
    <Sheet title="Add exercise" onClose={onClose}>
      <label className="field" htmlFor="add-ex-q">
        <span className="sr-only">Search exercises</span>
        <input id="add-ex-q" type="search" autoFocus placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {list.length ? (
        <div className="list">
          {list.map((e) => (
            <button key={e.id} className="row" disabled={busy}
              style={{ width: "100%", border: 0, background: "transparent", padding: "8px 0", textAlign: "left", cursor: "pointer" }}
              onClick={async () => { setBusy(true); await onPick(e); }}>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{e.name}</span>
                <span className="row-sub">{[e.equipment, e.default_unit === "min" ? "timed, min" : e.default_unit, e.muscle_direct, !e.available && "not at this gym"].filter(Boolean).join(" · ")}</span>
              </span>
              <PlusIcon style={{ color: "var(--accent-text)", flex: "none" }} />
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">No exercise matches. Add new ones under Workouts.</p>
      )}
    </Sheet>
  );
}

/** Cable exercises: the real pins on that machine's stack around the current load. Tap one to load every open set. */
function PinPicker({ block, onUpdate }: { block: Block; onUpdate: (s: SetRow, p: Partial<SetRow>) => Promise<void> }) {
  const key = block.ref?.exerciseKey ?? "";
  const weights = weightsFor(key);
  const open = block.sets.filter((s) => s.kind !== "warmup" && !s.completed);
  const current = Number((open[0] ?? block.sets[block.sets.length - 1])?.load ?? 0);
  if (!weights || !open.length) return null;
  const at = weights.findIndex((w) => w >= current - 1e-9);
  const i = at < 0 ? weights.length - 1 : at;
  const shown = weights.slice(Math.max(0, i - 2), i + 4);
  const stack = STACK_OF[key]!;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 6 }} aria-label="Weight stack">
      <span className="row-sub" style={{ margin: "0 4px" }}>Pins on {STACK_LABEL[stack]}</span>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {shown.map((w) => (
          <button key={w} className={`btn btn-sm ${Math.abs(w - current) < 1e-9 ? "btn-primary" : "btn-glass"}`}
            style={{ flex: "none", minWidth: 64, height: 40 }}
            aria-pressed={Math.abs(w - current) < 1e-9}
            onClick={() => void Promise.all(open.map((s) => onUpdate(s, { load: w, unit: "lb" })))}>
            {pinLabel(key, w)}
          </button>
        ))}
      </div>
    </section>
  );
}
