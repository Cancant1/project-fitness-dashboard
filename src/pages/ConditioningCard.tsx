import { useState } from "react";
import { useRows, useStore } from "../data/store";
import type { Conditioning } from "../data/types";
import { fmtNum, parseDecimal } from "../lib/format";
import { getDay, getWeek, prescribeDay } from "../plan/engine";
import { sundayRoundsFrom, usePlan } from "../plan/bridge";
import { wristLadderState } from "../plan/stateRules";
import type { DayKey, PrescribedConditioning } from "../plan/types";
import { saveGassed, saveHomeTask } from "../coach";
import { Card, Pill } from "../ui/kit";
import { CheckIcon } from "../ui/icons";
import "./conditioning.css";

const KIND: Record<string, Conditioning["kind"]> = { easy_ride: "ride", boxing: "boxing", rounds: "rounds" };
type Gassed = 1 | 2 | 3 | 4 | 5;

/** Wed ride (+ the wrist ladder at home), Thu boxing (+ how gassed), Sun rounds (+ burst rounds): what the plan asks and a quick log. */
export function ConditioningCard({ date, dayKey, weekNo, existing }: { date: string; dayKey: DayKey; weekNo: number; existing: Conditioning[] }) {
  const { local } = useStore();
  const plan = usePlan();
  const conditioning = useRows("conditioning");
  const painChecks = useRows("pain_checks");
  const day = getDay(plan, dayKey);
  // Sunday rounds follow the log (roundsNextWeek); the wrist ladder follows the elbow (flare-ups); TMs are irrelevant here.
  const sundayRounds = sundayRoundsFrom(conditioning.filter((c) => c.date < date), plan);
  const wrist = wristLadderState(painChecks.filter((p) => !p.deleted_at), plan);
  const p = prescribeDay(plan, weekNo, dayKey, {
    trainingMaxes: { squat: 1, deadlift: 1 }, currentLoads: {},
    ...(sundayRounds !== undefined ? { sundayRounds } : {}), ...(wrist ? { wristLadder: wrist } : {})
  }).conditioning;
  const kind = KIND[dayKey] ?? "other";
  const logged = existing.find((c) => c.kind === kind && c.done);
  const [f, setF] = useState({
    minutes: p?.minutes ? String(p.minutes) : "", loop: "", rounds: p?.rounds ? String(p.rounds) : "", first: "", last: "",
    fade: logged?.kind === "boxing" && logged.rounds != null ? String(logged.rounds) : ""
  });
  const [gassed, setGassed] = useState<Gassed | null>((logged?.rating as Gassed | null | undefined) ?? null);

  async function save() {
    if (kind === "boxing") {
      if (gassed != null) {
        await saveGassed(local, date, gassed, parseDecimal(f.fade));
        return;
      }
      await local.save("conditioning", { id: logged?.id, date, kind, done: true, note: null, minutes: p?.minutes ?? 45, loop_time_s: null, rounds: null, first_round_count: null, last_round_count: null });
      return;
    }
    await local.save("conditioning", {
      id: logged?.id, date, kind, done: true, note: null,
      minutes: parseDecimal(f.minutes), loop_time_s: f.loop ? Math.round((parseDecimal(f.loop) ?? 0) * 60) : null,
      rounds: parseDecimal(f.rounds), first_round_count: parseDecimal(f.first), last_round_count: parseDecimal(f.last)
    });
  }

  return (
    <Card className="cd" aria-label={day.title}>
      <div className="cd-top">
        <Pill tone="plain">Week {weekNo} · {getWeek(plan, weekNo).label}</Pill>
        {logged && <Pill tone="good"><CheckIcon /> Logged</Pill>}
      </div>
      <h2 className="cd-title">{day.title}</h2>
      <Headline kind={kind} p={p} />

      {kind === "ride" && (
        <>
          <div className="cd-fields">
            <Num id="c-min" label="Minutes" value={f.minutes} onChange={(v) => setF({ ...f, minutes: v })} />
            <Num id="c-loop" label="Loop, min" value={f.loop} onChange={(v) => setF({ ...f, loop: v })} />
          </div>
          {logged?.loop_time_s ? <p className="cd-note">Loop {fmtNum(logged.loop_time_s / 60, 1)} min</p> : null}
        </>
      )}
      {kind === "rounds" && !p?.skipped && (
        <div className="cd-fields cd-fields-3">
          <Num id="c-r" label="Rounds" value={f.rounds} onChange={(v) => setF({ ...f, rounds: v })} />
          <Num id="c-first" label="Round 1 skips" value={f.first} onChange={(v) => setF({ ...f, first: v })} />
          <Num id="c-last" label="Last round" value={f.last} onChange={(v) => setF({ ...f, last: v })} />
        </div>
      )}
      {kind === "boxing" && (
        <section className="cd-gassed" aria-label="Gassed? 1 to 5">
          <span className="cd-q">Gassed?</span>
          <div className="cd-scale" role="group" aria-label="Gassed, 1 fresh to 5 fully gassed">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button key={n} type="button" aria-pressed={gassed === n} onClick={() => setGassed(gassed === n ? null : n)}>{n}</button>
            ))}
          </div>
          <div className="cd-ends" aria-hidden="true"><span>Fresh</span><span>Fully gassed</span></div>
          <label className="cd-fade" htmlFor="c-fade">
            <span>Faded in round</span>
            <span className="field"><input id="c-fade" inputMode="numeric" className="num" placeholder="–" value={f.fade} onChange={(e) => setF({ ...f, fade: e.target.value })} /></span>
          </label>
        </section>
      )}

      {!p?.skipped && (
        <button className="btn btn-primary btn-block cd-save" onClick={() => void save()}>{logged ? "Update" : kind === "boxing" ? "Save boxing" : "Log it"}</button>
      )}

      {p?.homeTasks?.map((t) => <HomeTask key={t.id} date={date} task={t} />)}
    </Card>
  );
}

/** The big number and one line: ride minutes, boxing minutes, or the Sunday rounds with burst rounds and "finish by". */
function Headline({ kind, p }: { kind: Conditioning["kind"]; p: PrescribedConditioning | undefined }) {
  if (kind === "rounds") {
    if (p?.skipped) return <p className="cd-line">No rounds this week</p>;
    return (
      <>
        <div className="cd-big"><span className="k-num">{p?.rounds ?? 6}</span><small>rounds</small></div>
        {p?.text && <p className="cd-line">{p.warmupMin ? `${p.warmupMin} min warm-up, then ` : ""}{p.text}</p>}
        {(p?.burstRounds || p?.finishBy) && (
          <div className="cd-tags">
            {p?.burstRounds ? <Pill tone="warm">{p.burstRounds} burst rounds</Pill> : null}
            {p?.finishBy && <Pill tone="plain">Finish by {p.finishBy}</Pill>}
          </div>
        )}
      </>
    );
  }
  const minutes = p?.minutes ?? (kind === "ride" ? 30 : 45);
  return (
    <>
      <div className="cd-big"><span className="k-num">{minutes}</span><small>min</small></div>
      <p className="cd-line">{kind === "ride" ? "Talking pace, assist off, same loop" : "Controlled sparring; skip with headache"}</p>
    </>
  );
}

/** A home task (Wednesday: the wrist ladder at home) with a done check, stored as a conditioning row (saveHomeTask). */
function HomeTask({ date, task }: { date: string; task: NonNullable<PrescribedConditioning["homeTasks"]>[number] }) {
  const { local } = useStore();
  const conditioning = useRows("conditioning");
  const done = conditioning.some((c) => c.kind === "other" && c.date === date && c.note === task.id && c.done && !c.deleted_at);
  const dose = task.reps != null ? `${task.sets} × ${task.reps}` : task.holdSec ? `${task.sets} × ${task.holdSec[0]}–${task.holdSec[1]} s` : `${task.sets} sets`;
  return (
    <div className="cd-home">
      <span className="cd-home-main">
        <span className="cd-home-title">{task.reps != null ? "Wrist ladder at home" : "Wrist holds at home"}</span>
        <span className="cd-home-sub">{task.reps != null ? "Dumbbell or water bottle" : "Palm down, mid-range"}</span>
      </span>
      <span className="k-num cd-home-dose">{dose}</span>
      <button type="button" className="check cd-check" aria-pressed={done} aria-label={`${task.text}: ${done ? "done" : "not done"}`}
        onClick={() => void saveHomeTask(local, date, task.id, !done)}>{done && <CheckIcon />}</button>
    </div>
  );
}

function Num({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor={id} className="cd-num">
      <span>{label}</span>
      <span className="field"><input id={id} inputMode="decimal" className="num" style={{ fontWeight: 600 }} value={value} onChange={(e) => onChange(e.target.value)} /></span>
    </label>
  );
}
