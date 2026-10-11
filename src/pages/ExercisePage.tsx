import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { groupBy, repBests, sessionBests, type WorkSet } from "../lib/analysis";
import { addDays, daysBetween, fmtNum, fmtShortDateYear, todayIso } from "../lib/format";
import { ChevronLeft, ChevronRight } from "../ui/icons";
import { useTraining } from "./progress/data";
import { Plot } from "./progress/Plot";
import { Panel, Segmented, Swatch, fmtKg, fmtMonthYear, fmtSet, fmtWhen } from "./progress/ui";

const REPS = Array.from({ length: 15 }, (_, i) => i + 1);
const EPOCH = "2020-01-01";

export function ExercisePage() {
  const { exerciseId = "" } = useParams();
  const navigate = useNavigate();
  const idx = useTraining();
  const today = todayIso();
  const exercise = idx.exerciseById.get(exerciseId);
  const [range, setRange] = useState<"12m" | "all">("all");
  const [showAll, setShowAll] = useState(false);

  const data = useMemo(() => {
    const sets = idx.byExercise.get(exerciseId) ?? [];
    const perSession = sessionBests(sets);
    const best = perSession.reduce<(typeof perSession)[number] | null>((a, b) => (!a || b.value > a.value ? b : a), null);
    const heaviest = sets.filter((s) => !s.flagged && s.loadKg != null && s.reps != null && s.reps > 0)
      .reduce<WorkSet | null>((a, s) => (!a || s.loadKg! > a.loadKg! || (s.loadKg === a.loadKg && s.reps! > a.reps!) ? s : a), null);
    const sessions = [...groupBy(sets, (s) => s.sessionId).values()].reverse();
    const byReps = repBests(sets, REPS, "exact");
    return { sets, perSession, best, heaviest, sessions, byReps };
  }, [idx, exerciseId]);

  const chart = useMemo(() => {
    const from = range === "12m" ? addDays(today, -365) : data.perSession[0]?.date ?? today;
    const pts = data.perSession.filter((p) => p.date >= from);
    const x0 = daysBetween(EPOCH, from);
    const x1 = Math.max(daysBetween(EPOCH, range === "12m" ? today : pts.at(-1)?.date ?? today), x0 + 30);
    const ticks: { x: number; label: string }[] = [];
    const y0 = Number(from.slice(0, 4)), y1 = Number((range === "12m" ? today : pts.at(-1)?.date ?? today).slice(0, 4));
    if (range === "all") {
      for (let y = y0 + 1; y <= y1; y++) ticks.push({ x: daysBetween(EPOCH, `${y}-01-01`), label: String(y) });
    } else {
      for (let i = 0; i <= 12; i += 3) {
        const d = addDays(today, Math.round(-365 + i * 30.4));
        ticks.push({ x: daysBetween(EPOCH, d), label: new Intl.DateTimeFormat("en-GB", { month: "short" }).format(new Date(d + "T12:00:00")) });
      }
    }
    return {
      domain: [x0 - 5, x1 + 5] as [number, number],
      line: pts.map((p) => ({ x: daysBetween(EPOCH, p.date), y: p.value })),
      dots: pts.map((p) => ({
        x: daysBetween(EPOCH, p.date), y: p.value, color: "var(--accent)", hollow: p.confidence === "estimated", r: 3,
        title: `${fmtWhen(p.date, p.confidence)} · ${fmtKg(p.value)} from ${fmtSet(p.set)}`
      })),
      ticks,
      estimated: pts.some((p) => p.confidence === "estimated")
    };
  }, [data, range, today]);

  if (!exercise) return <main className="page"><p className="muted">This exercise isn't on this device.</p></main>;

  const muscles = [exercise.muscle_direct, ...exercise.muscle_indirect].filter(Boolean).join(", ");
  const last = data.sets.at(-1);
  const flaggedCount = data.sets.filter((s) => s.flagged).length;
  const shownSessions = showAll ? data.sessions : data.sessions.slice(0, 15);

  return (
    <main className="page">
      <div>
        <button className="btn btn-plain" style={{ paddingLeft: 0, height: 44 }} onClick={() => navigate(-1)}><ChevronLeft /> Back</button>
      </div>
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <p className="eyebrow">{[exercise.kind === "main" ? "Main lift" : exercise.kind[0]!.toUpperCase() + exercise.kind.slice(1), muscles, exercise.equipment].filter(Boolean).join(" · ")}</p>
        <h1 className="large-title">{exercise.name}</h1>
      </header>

      <section className="card stat-strip">
        <div className="stat">
          <span className="row-sub">Best e1RM</span>
          <span className="stat-value">{data.best ? fmtKg(data.best.value) : "—"}<small> kg</small></span>
          <span className="row-sub" style={{ fontSize: 12 }}>{data.best ? `${fmtSet(data.best.set)} · ${fmtWhen(data.best.date, data.best.confidence)}` : "No loaded sets"}</span>
        </div>
        <div className="stat">
          <span className="row-sub">Heaviest set</span>
          <span className="stat-value">{data.heaviest ? fmtSet(data.heaviest) : "—"}</span>
          <span className="row-sub" style={{ fontSize: 12 }}>{data.heaviest ? fmtWhen(data.heaviest.date, data.heaviest.confidence) : ""}</span>
        </div>
        <div className="stat">
          <span className="row-sub">Sessions</span>
          <span className="stat-value">{data.sessions.length}</span>
          <span className="row-sub" style={{ fontSize: 12 }}>{data.sets.length} sets{flaggedCount ? ` · ${flaggedCount} to check` : ""}</span>
        </div>
        <div className="stat">
          <span className="row-sub">Last done</span>
          <span className="stat-value" style={{ fontSize: 22 }}>{last ? (last.confidence === "estimated" ? fmtMonthYear(last.date) : fmtShortDateYear(last.date)) : "—"}</span>
          <span className="row-sub" style={{ fontSize: 12 }}>{last && last.confidence !== "exact" ? (last.confidence === "estimated" ? "date estimated" : "week known") : ""}</span>
        </div>
      </section>

      <Panel title="e1RM per session" sub="Best set of each session · flagged sets left out"
        right={<Segmented label="Range" value={range} onChange={setRange} options={[{ value: "12m", label: "12 months" }, { value: "all", label: "All time" }]} />}>
        <Plot label={`${exercise.name} e1RM per session`} height={240} xDomain={chart.domain} xTicks={chart.ticks}
          lines={[{ points: chart.line, color: "var(--accent)", width: 1.5 }]} dots={chart.dots}
          empty={range === "12m" ? "Nothing in the last 12 months." : "No loaded sets to estimate from."} />
        {chart.estimated && <Swatch color="var(--accent)" hollow label="Session with an estimated date" />}
      </Panel>

      {data.byReps.size > 0 && (
        <Panel title="Best set per rep count" sub="Heaviest load for exactly that many reps">
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Reps</th><th className="n">Load</th><th className="n">e1RM</th><th>When</th></tr></thead>
              <tbody>
                {REPS.filter((r) => data.byReps.has(r)).map((r) => {
                  const s = data.byReps.get(r)!;
                  return (
                    <tr key={r}>
                      <td className="num">{r}</td>
                      <td className="n" style={{ fontWeight: 600 }}>{fmtSet({ ...s, reps: null })}</td>
                      <td className="n">{s.e1rm != null ? fmtKg(s.e1rm) : "—"}</td>
                      <td><Link to={`/session/${s.sessionId}`}>{fmtWhen(s.date, s.confidence)}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <section className="section">
        <h2 className="section-label">Sessions</h2>
        <div className="list">
          {shownSessions.map((sets) => {
            const first = sets[0]!;
            const ok = sets.filter((s) => !s.flagged && s.loadKg != null);
            const top = (ok.length ? ok : sets).reduce((a, s) => ((s.loadKg ?? -Infinity) > (a.loadKg ?? -Infinity) ? s : a));
            const flagged = sets.some((s) => s.flagged);
            return (
              <Link key={first.sessionId} to={`/session/${first.sessionId}`} className="row" style={{ color: "var(--fg)", padding: "8px 0" }}>
                <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <span className="num" style={{ fontWeight: 600 }}>{fmtSet(top)}</span>
                  <span className="row-sub">{fmtWhen(first.date, first.confidence)} · {sets.length} {sets.length === 1 ? "set" : "sets"}</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
                  {flagged && <span className="chip chip-plain" title="Some sets carry a check flag and are left out of bests">check</span>}
                  <ChevronRight style={{ color: "var(--fg2)" }} />
                </span>
              </Link>
            );
          })}
          {!data.sessions.length && <div className="row muted">Not logged yet.</div>}
        </div>
        {data.sessions.length > shownSessions.length && (
          <button className="btn btn-plain" style={{ alignSelf: "flex-start", height: 44 }} onClick={() => setShowAll(true)}>
            Show all {data.sessions.length} sessions
          </button>
        )}
      </section>
      <p className="row-sub" style={{ margin: "0 4px" }}>{fmtNum(data.sets.length)} working sets in total. Loads in kg; bodyweight lifts show the added load.</p>
    </main>
  );
}
