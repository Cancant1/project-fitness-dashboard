import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import type { SetRow } from "../data/types";
import { fmtNum, parseDecimal, toKg } from "../lib/format";
import { platesPerSide, trainingMaxFromSet, nextTrainingMax } from "../plan/engine";
import { PLAN, activeProgram, equipmentFrom, latestMaxes, usePlanIds } from "../plan/bridge";
import { finishWorkout, maxUpdates, planRef } from "../plan/workout";
import { Sheet } from "../ui/Sheet";
import { CheckIcon, ChevronDown, ChevronLeft, ChevronRight, MinusIcon, PlusIcon } from "../ui/icons";

interface Block { position: number; exerciseId: string; name: string; sets: SetRow[] }

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
      else out.push({ position: s.exercise_position, exerciseId: s.exercise_id, name: s.exercise_as_logged ?? exercises.find((e) => e.id === s.exercise_id)?.name ?? "Exercise", sets: [s] });
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
  const now = useNow(1000);

  if (!session) return <main className="page"><p className="muted">This workout isn't on this device.</p></main>;

  const elapsed = session.started_at ? Math.max(0, Math.floor((now - Date.parse(session.started_at)) / 1000)) : 0;
  const calibration = (session.legacy_ref as { plan?: { weekType?: string } }).plan?.weekType === "calibration";
  const latest = latestMaxes(maxes, ids);

  async function update(s: SetRow, patch: Partial<SetRow>) {
    const next = { ...s, ...patch };
    await local.save("sets", { id: s.id, ...patch, load_kg: toKg(next.load, next.unit) });
  }

  async function toggle(s: SetRow) {
    const done = !s.completed;
    await update(s, { completed: done });
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
              <div className="progress-dots" aria-label={`Exercise ${i + 1} of ${blocks.length}`}>
                {blocks.map((b, n) => <span key={b.position} className={n === i ? "on" : b.sets.every((s) => s.completed) ? "done" : ""} />)}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8, marginTop: 4 }}>
                <h1 className="large-title" style={{ minWidth: 0 }}>{block.name}</h1>
                <span className="row-sub" style={{ flex: "none", paddingBottom: 6 }}>{i + 1} of {blocks.length}</span>
              </div>
              <ExerciseSubtitle block={block} />
            </div>

            <BlockSets block={block} calibration={calibration} latest={latest} equipment={equipment} onUpdate={update} onToggle={toggle} />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-glass btn-sm" onClick={() => void addSet(block)}><PlusIcon /> Add set</button>
              <ExerciseNotes block={block} />
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
          <p className="muted">No exercises in this workout.</p>
        )}
      </main>

      <div className="workout-actions">
        <button className="btn btn-glass" style={{ padding: "0 20px", fontSize: 15 }} onClick={() => setPain(true)}>Pain check</button>
        {block && <PrimaryAction block={block} onToggle={toggle} onNext={() => i < blocks.length - 1 ? setIndex(i + 1) : setFinishing(true)} />}
      </div>

      {pain && <PainSheet sessionId={session.id} exerciseId={block?.exerciseId ?? null} date={session.date} onClose={() => setPain(false)} />}
      {finishing && (
        <FinishSheet
          blocks={blocks}
          updates={maxUpdates(session, blocks.flatMap((b) => b.sets), ids, maxes, equipment)}
          onClose={() => setFinishing(false)}
          onFinish={async (notes) => {
            const sets = blocks.flatMap((b) => b.sets);
            if (notes) await local.save("sessions", { id: session.id, notes });
            await finishWorkout(local, session, sets, maxUpdates(session, sets, ids, maxes, equipment), ids, program);
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

function ExerciseSubtitle({ block }: { block: Block }) {
  const work = block.sets.filter((s) => s.kind !== "warmup");
  const rep = work.find((s) => s.kind === "rep_out");
  const ref = planRef(block.sets[0]!);
  let text = "";
  if (rep && ref?.mainLift) text = `Rep-out at ${fmtNum(rep.load)} ${unitLabel(rep.unit)}. Count clean reps only.`;
  else if (work.length) text = `${work.length} × ${work[0]!.target_reps ?? ""} · ${fmtNum(work[0]!.load)} ${unitLabel(work[0]!.unit)}${work.some((s) => s.kind === "failure") ? " · to failure" : ""}${work.some((s) => s.kind === "rep_out") ? " · last set rep-out" : ""}`;
  return <p style={{ fontSize: 15, lineHeight: "20px", color: "var(--fg2)" }}>{text}</p>;
}

function ExerciseNotes({ block }: { block: Block }) {
  const [open, setOpen] = useState(false);
  const key = planRef(block.sets[0]!)?.exerciseKey;
  const notes = PLAN.days.flatMap((d) => d.slots).find((s) => s.exerciseKey === key)?.notes ?? [];
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

function BlockSets({ block, calibration, latest, equipment, onUpdate, onToggle }: {
  block: Block; calibration: boolean; latest: Partial<Record<string, number>>; equipment: ReturnType<typeof equipmentFrom>;
  onUpdate: (s: SetRow, p: Partial<SetRow>) => Promise<void>; onToggle: (s: SetRow) => Promise<void>;
}) {
  const warmups = block.sets.filter((s) => s.kind === "warmup");
  const work = block.sets.filter((s) => s.kind !== "warmup");
  const repOut = work.find((s) => s.kind === "rep_out" && planRef(s)?.mainLift);
  const normal = work.filter((s) => s !== repOut);
  const isBarbell = ["squat", "deadlift", "romanian_deadlift", "barbell_row"].includes(planRef(block.sets[0]!)?.exerciseKey ?? "");

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
          {normal.map((s) => <SetLine key={s.id} s={s} onUpdate={onUpdate} onToggle={onToggle} />)}
        </section>
      )}

      {repOut && <RepOutCard s={repOut} calibration={calibration} latest={latest} onUpdate={onUpdate} onToggle={onToggle} />}

      {isBarbell && work[0]?.load != null && (
        <p className="row-sub" style={{ margin: "0 4px" }}>{plates(Number((repOut ?? work[work.length - 1]!).load), equipment)}</p>
      )}
    </>
  );
}

function plates(total: number, eq: ReturnType<typeof equipmentFrom>) {
  const p = platesPerSide(total, eq.barKg, eq.platesKg);
  if (p.belowBar) return `Below the ${eq.barKg} kg bar`;
  return `Per side: ${p.perSide.length ? p.perSide.join(" + ") : "nothing"} · bar ${eq.barKg} kg${p.shortfallKg > 0 ? ` · ${fmtNum(p.shortfallKg)} kg short` : ""}`;
}

function SetLine({ s, onUpdate, onToggle }: { s: SetRow; onUpdate: (s: SetRow, p: Partial<SetRow>) => Promise<void>; onToggle: (s: SetRow) => Promise<void> }) {
  const [load, setLoad] = useState(s.load == null ? "" : String(s.load).replace(".", ","));
  const [reps, setReps] = useState(s.reps == null ? "" : String(s.reps));
  useEffect(() => setLoad(s.load == null ? "" : String(s.load).replace(".", ",")), [s.load]);
  useEffect(() => setReps(s.reps == null ? "" : String(s.reps)), [s.reps]);
  const label = s.kind === "failure" ? "F" : s.kind === "rep_out" ? "R" : s.kind === "top" ? "T" : s.kind === "backoff" ? "B" : String(s.set_no);
  return (
    <div className="set-grid">
      <span className="set-no" style={{ color: s.kind === "rep_out" || s.kind === "failure" ? "var(--warm-text)" : undefined }} title={s.kind}>{label}</span>
      <label className="mini-field">
        <span className="sr-only">Load</span>
        <input inputMode="decimal" value={load} onChange={(e) => setLoad(e.target.value)} onBlur={() => void onUpdate(s, { load: parseDecimal(load) })} />
        <span className="field-suffix" style={{ fontSize: 13 }}>{unitLabel(s.unit)}</span>
      </label>
      <label className="mini-field">
        <span className="sr-only">Reps</span>
        <input inputMode="numeric" value={reps} placeholder={s.target_reps ?? (s.kind === "failure" ? "max" : "")}
          onChange={(e) => setReps(e.target.value)} onBlur={() => void onUpdate(s, { reps: parseDecimal(reps) })} />
        <span className="field-suffix" style={{ fontSize: 13 }}>reps</span>
      </label>
      <button className="check" aria-pressed={s.completed} aria-label={`Set ${label} done`}
        onClick={async () => {
          const r = parseDecimal(reps) ?? (s.target_reps ? parseDecimal(s.target_reps.split("–").pop() ?? "") : null);
          if (!s.completed && r != null && s.reps == null) await onUpdate(s, { reps: r, load: parseDecimal(load) });
          await onToggle(s);
        }}>{s.completed && <CheckIcon />}</button>
    </div>
  );
}

function RepOutCard({ s, calibration, latest, onUpdate, onToggle }: {
  s: SetRow; calibration: boolean; latest: Partial<Record<string, number>>;
  onUpdate: (s: SetRow, p: Partial<SetRow>) => Promise<void>; onToggle: (s: SetRow) => Promise<void>;
}) {
  const ref = planRef(s)!;
  const [reps, setReps] = useState<number>(s.reps ?? ref.target ?? 5);
  const [stops, setStops] = useState(false);
  const lift = ref.mainLift!;
  const tmLift = lift === "squat" || lift === "deadlift";
  const tm = tmLift
    ? (calibration || latest[lift] == null ? trainingMaxFromSet(Number(s.load), reps) : nextTrainingMax(latest[lift]!, reps, ref.target ?? 0, "nearest"))
    : null;
  return (
    <section className="repout-card" aria-label="Rep-out set">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="chip chip-warm" style={{ fontSize: 12, letterSpacing: 0.6 }}>REP-OUT{ref.target ? ` · TARGET ${ref.target}` : ""}</span>
        <button className="btn btn-plain btn-sm" onClick={() => setStops(!stops)}>Stop signs</button>
      </div>
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
            <input inputMode="numeric" value={reps} onChange={(e) => setReps(Number(e.target.value.replace(/\D/g, "")) || 0)} />
            <span style={{ fontSize: 11, color: "var(--fg2)" }}>reps</span>
          </label>
          <button aria-label="One rep more" onClick={() => setReps(reps + 1)}><PlusIcon /></button>
        </div>
      </div>
      <div className="row" style={{ borderTop: "1px solid var(--sep)", minHeight: 48 }}>
        <span className="muted">{tmLift ? "New training max" : "Next load"}</span>
        <span className="num" style={{ fontWeight: 700, fontSize: 17 }}>
          {tm != null ? `${fmtNum(tm)} kg` : reps >= 10 ? "one step up" : reps <= 5 ? "one step down" : "same"}
        </span>
      </div>
      <button className={`btn ${s.completed ? "btn-glass" : "btn-warm"} btn-block`} style={{ marginBottom: 12 }}
        onClick={async () => { await onUpdate(s, { reps }); if (!s.completed) await onToggle(s); }}>
        {s.completed ? `Saved · ${s.reps} reps (tap to update)` : "Save Rep-out"}
      </button>
    </section>
  );
}

function PrimaryAction({ block, onToggle, onNext }: { block: Block; onToggle: (s: SetRow) => Promise<void>; onNext: () => void }) {
  const next = block.sets.find((s) => !s.completed && !(s.kind === "rep_out" && planRef(s)?.mainLift));
  const allDone = block.sets.every((s) => s.completed);
  if (allDone) return <button className="btn btn-primary" style={{ flex: 1 }} onClick={onNext}>Next exercise</button>;
  if (!next) return <button className="btn btn-glass" style={{ flex: 1 }} disabled>Log the rep-out above</button>;
  return (
    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void onToggle(next)}>
      Done: {next.kind === "warmup" ? "warm-up" : `set ${next.set_no}`} · {fmtNum(next.load)} {unitLabel(next.unit)} × {next.reps ?? next.target_reps ?? "?"}
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

function PainSheet({ sessionId, exerciseId, date, onClose }: { sessionId: string; exerciseId: string | null; date: string; onClose: () => void }) {
  const { local } = useStore();
  const [site, setSite] = useState("right_elbow");
  const [during, setDuring] = useState<"none" | "ache" | "sharp">("none");
  const [saved, setSaved] = useState(false);
  return (
    <Sheet title="Pain check" onClose={onClose}>
      <div className="segmented" role="group" aria-label="Where">
        {[["right_elbow", "Right elbow"], ["right_shoulder", "Right shoulder"], ["other", "Other"]].map(([k, l]) => (
          <button key={k} aria-pressed={site === k} onClick={() => setSite(k!)}>{l}</button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="During the set">
        {([["none", "Nothing"], ["ache", "Some ache"], ["sharp", "Sharp / form changes"]] as const).map(([k, l]) => (
          <button key={k} aria-pressed={during === k} onClick={() => setDuring(k)}>{l}</button>
        ))}
      </div>
      <p style={{ fontSize: 15 }}>
        {during === "sharp"
          ? "Stop this exercise for today. If it's still sore tomorrow morning, or worse next session, drop one step down the swap list for 2 weeks."
          : during === "ache"
            ? "Some ache is fine. Check tomorrow morning: back to normal means the load was fine."
            : "Good. Keep going."}
      </p>
      <button className="btn btn-primary" disabled={saved} onClick={async () => {
        await local.save("pain_checks", { date, site, exercise_id: exerciseId, session_id: sessionId, during_set: during, next_morning: null, worse_than_last: null, note: null });
        setSaved(true);
        window.setTimeout(onClose, 500);
      }}>{saved ? "Saved" : "Save"}</button>
    </Sheet>
  );
}

function FinishSheet({ blocks, updates, onClose, onFinish, onDiscard }: {
  blocks: Block[]; updates: ReturnType<typeof maxUpdates>; onClose: () => void; onFinish: (notes: string) => Promise<void>; onDiscard: () => Promise<void>;
}) {
  const [notes, setNotes] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const sets = blocks.flatMap((b) => b.sets).filter((s) => s.kind !== "warmup");
  const done = sets.filter((s) => s.completed).length;
  return (
    <Sheet title="Finish workout" onClose={onClose}>
      <div className="list">
        <div className="row"><span>Working sets done</span><span className="num" style={{ fontWeight: 600 }}>{done} of {sets.length}</span></div>
        {updates.map((u) => (
          <div className="row" key={u.lift}><span>{u.label}</span><span className="num" style={{ fontWeight: 600 }}>{u.from != null ? `${fmtNum(u.from)} → ` : ""}{fmtNum(u.to)} kg</span></div>
        ))}
      </div>
      {done < sets.length && <p className="row-sub">Unticked sets stay in the log as not done.</p>}
      <label className="field" style={{ height: "auto", padding: 12 }}>
        <span className="sr-only">Notes</span>
        <textarea rows={3} placeholder="How did it go? (optional)" value={notes} onChange={(e) => setNotes(e.target.value)}
          style={{ border: 0, background: "transparent", width: "100%", resize: "vertical", outline: "none" }} />
      </label>
      <button className="btn btn-primary" onClick={() => void onFinish(notes.trim())}>Save Workout</button>
      {confirmDiscard
        ? <button className="btn btn-glass" style={{ color: "var(--bad)" }} onClick={() => void onDiscard()}>Discard — this removes the workout</button>
        : <button className="btn btn-plain" style={{ color: "var(--bad)" }} onClick={() => setConfirmDiscard(true)}>Discard workout…</button>}
    </Sheet>
  );
}
