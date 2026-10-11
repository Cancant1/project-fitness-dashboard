import { useState } from "react";
import { useStore } from "../data/store";
import type { Conditioning } from "../data/types";
import { fmtNum, parseDecimal } from "../lib/format";
import { getDay, getWeek, prescribeDay } from "../plan/engine";
import { PLAN } from "../plan/bridge";
import type { DayKey } from "../plan/types";
import { CheckIcon } from "../ui/icons";

const KIND: Record<string, Conditioning["kind"]> = { easy_ride: "ride", boxing: "boxing", rounds: "rounds" };

/** Wed ride, Thu boxing, Sun rounds: what the plan asks and a quick log. */
export function ConditioningCard({ date, dayKey, weekNo, existing }: { date: string; dayKey: DayKey; weekNo: number; existing: Conditioning[] }) {
  const { local } = useStore();
  const day = getDay(PLAN, dayKey);
  const p = prescribeDay(PLAN, weekNo, dayKey, { trainingMaxes: { squat: 1, deadlift: 1 }, currentLoads: {} }).conditioning;
  const kind = KIND[dayKey] ?? "other";
  const logged = existing.find((c) => c.kind === kind);
  const [f, setF] = useState({ minutes: p?.minutes ? String(p.minutes) : "", loop: "", rounds: p?.rounds ? String(p.rounds) : "", first: "", last: "" });

  async function save() {
    await local.save("conditioning", {
      id: logged?.id, date, kind, done: true, note: null,
      minutes: parseDecimal(f.minutes), loop_time_s: f.loop ? Math.round((parseDecimal(f.loop) ?? 0) * 60) : null,
      rounds: parseDecimal(f.rounds), first_round_count: parseDecimal(f.first), last_round_count: parseDecimal(f.last)
    });
  }

  const what =
    kind === "ride" ? `${p?.minutes ?? 30} min at talking pace, e-bike assist off or lowest, same flat loop.` :
    kind === "boxing" ? `${p?.minutes ?? 45} min. Keep sparring controlled; skip it with headache, dizziness or fog.` :
    p?.skipped ? "No rounds this week." :
    `${p?.warmupMin ?? 5} min warm-up, then ${p?.rounds ?? 6} rounds of 2 min hard / 1 min easy with the rope.`;

  return (
    <section className="card card-hero">
      <div style={{ padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span className="chip chip-plain">Week {weekNo} · {getWeek(PLAN, weekNo).label}</span>
          {logged && <span className="chip chip-good"><CheckIcon /> Logged</span>}
        </div>
        <span style={{ fontSize: 26, lineHeight: "32px", fontWeight: 700, letterSpacing: -0.3 }}>{day.title}</span>
        <p className="row-sub" style={{ fontSize: 15 }}>{what}</p>
      </div>
      {kind !== "boxing" && !p?.skipped && (
        <div style={{ padding: "0 12px 8px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8 }}>
          {kind === "ride" ? (
            <>
              <Num id="c-min" label="Minutes" value={f.minutes} onChange={(v) => setF({ ...f, minutes: v })} />
              <Num id="c-loop" label="Loop, min" value={f.loop} onChange={(v) => setF({ ...f, loop: v })} />
            </>
          ) : (
            <>
              <Num id="c-r" label="Rounds" value={f.rounds} onChange={(v) => setF({ ...f, rounds: v })} />
              <Num id="c-first" label="Round 1 skips" value={f.first} onChange={(v) => setF({ ...f, first: v })} />
              <Num id="c-last" label="Last round" value={f.last} onChange={(v) => setF({ ...f, last: v })} />
            </>
          )}
        </div>
      )}
      {logged && kind === "ride" && logged.loop_time_s && <p className="row-sub" style={{ padding: "0 12px 8px" }}>Loop {fmtNum(logged.loop_time_s / 60, 1)} min — it should drop over the weeks.</p>}
      {!p?.skipped && (
        <button className="btn btn-primary btn-block hero-btn" onClick={() => void save()}>{logged ? "Update" : kind === "boxing" ? "Mark boxing done" : "Log it"}</button>
      )}
    </section>
  );
}

function Num({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label htmlFor={id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="row-sub" style={{ fontSize: 12 }}>{label}</span>
      <span className="field"><input id={id} inputMode="decimal" className="num" style={{ fontWeight: 600 }} value={value} onChange={(e) => onChange(e.target.value)} /></span>
    </label>
  );
}
