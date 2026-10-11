import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import { fmtLongDate, fmtNum } from "../lib/format";
import { ChevronLeft } from "../ui/icons";
import { isFlagged } from "../lib/analysis";

export function SessionPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { local } = useStore();
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const exercises = useRows("exercises");
  const session = sessions.find((s) => s.id === sessionId);
  const names = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);

  const blocks = useMemo(() => {
    const mine = sets.filter((s) => s.session_id === sessionId).sort((a, b) => a.exercise_position - b.exercise_position || a.set_no - b.set_no);
    const out: { exerciseId: string; rows: typeof mine }[] = [];
    for (const s of mine) {
      const last = out[out.length - 1];
      if (last && last.exerciseId === s.exercise_id) last.rows.push(s);
      else out.push({ exerciseId: s.exercise_id, rows: [s] });
    }
    return out;
  }, [sets, sessionId]);

  if (!session) return <main className="page"><p className="muted">This workout isn't on this device.</p></main>;

  return (
    <main className="page">
      <div>
        <button className="btn btn-plain" style={{ paddingLeft: 0 }} onClick={() => navigate(-1)}><ChevronLeft /> Back</button>
      </div>
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <p className="eyebrow">
          {fmtLongDate(session.date)}
          {session.date_confidence !== "exact" && ` · ${session.date_confidence === "estimated" ? "date estimated" : "week known, day from the sheet"}`}
        </p>
        <h1 className="large-title">{session.title || session.source.replace(/^sheet:/, "")}</h1>
        {session.date_basis && <p className="row-sub">{session.date_basis}</p>}
      </header>
      {session.status === "in_progress" && (
        <Link className="btn btn-primary" to={`/workout/${session.id}`}>Continue Workout</Link>
      )}
      {blocks.map((b, i) => (
        <section className="section" key={i}>
          <h2 className="section-label">{names.get(b.exerciseId) ?? b.rows[0]?.exercise_as_logged ?? "Exercise"}</h2>
          <div className="list">
            {b.rows.map((s) => (
              <div className="row" key={s.id}>
                <span className="muted" style={{ width: 64 }}>{s.kind === "warmup" ? "Warm-up" : s.kind === "rep_out" ? "Rep-out" : s.kind === "top" ? "Top set" : `Set ${s.set_no}`}</span>
                <span className="num" style={{ flex: 1, textAlign: "right", fontWeight: 600 }}>
                  {s.unit === "bodyweight" ? (s.load ? `BW +${fmtNum(s.load)}` : "BW") : s.unit === "min" ? `${fmtNum(s.load)} min` : `${fmtNum(s.load)} ${s.unit}`}
                </span>
                <span className="num" style={{ width: 56, textAlign: "right" }}>{s.reps != null ? `× ${fmtNum(s.reps)}` : ""}</span>
                {isFlagged(s) && <span className="chip chip-plain" title={s.flags.join(", ")}>check</span>}
              </div>
            ))}
          </div>
          {b.rows.some((s) => s.note) && <p className="row-sub" style={{ margin: "0 4px" }}>{b.rows.map((s) => s.note).filter(Boolean).join(" · ")}</p>}
        </section>
      ))}
      {session.notes && <p className="card card-pad" style={{ fontSize: 15 }}>{session.notes}</p>}
      {session.source === "app" && (
        <button className="btn btn-plain" style={{ color: "var(--bad)" }}
          onClick={async () => { await local.remove("sessions", [session.id]); navigate("/history"); }}>
          Delete Workout
        </button>
      )}
    </main>
  );
}
