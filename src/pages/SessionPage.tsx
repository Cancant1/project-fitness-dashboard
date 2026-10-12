import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import type { SetRow } from "../data/types";
import { fmtLongDate, fmtNum } from "../lib/format";
import { countsForStrength, e1rm, isFlagged } from "../lib/analysis";
import { Card, PageHead, Stat } from "../ui/kit";
import { ChevronLeft, PlayIcon } from "../ui/icons";
import "./session.css";

const KIND_NAME: Partial<Record<SetRow["kind"], string>> = { warmup: "Warm-up", rep_out: "Rep-out", top: "Top set", backoff: "Back-off", failure: "To failure", drop: "Drop set" };

/** One past session: date + title, four numbers, then every exercise as a card of set chips. */
export function SessionPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const { local } = useStore();
  const sessions = useRows("sessions");
  const sets = useRows("sets");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exercises = useRows("exercises");
  const annotations = useRows("annotations");
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

  const summary = useMemo(() => {
    const work = blocks.flatMap((b) => b.rows).filter((s) => s.kind !== "warmup");
    let volume = 0;
    let top: { value: number; exerciseId: string } | null = null;
    for (const s of work) {
      if (s.completed && !isFlagged(s) && s.load_kg != null && s.load_kg > 0 && s.reps) volume += s.load_kg * s.reps;
      if (!countsForStrength(s)) continue;
      const v = e1rm(Number(s.load_kg), s.reps);
      if (v && (!top || v > top.value)) top = { value: v, exerciseId: s.exercise_id };
    }
    return { sets: work.length, volume, top };
  }, [blocks]);

  if (!session) return <main className="page"><p className="k-empty" style={{ height: 200 }}>Not on this device</p></main>;

  const duration = session.duration_min ?? (session.started_at && session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60000) : null);
  const tiles = [
    <Stat key="s" size="md" label="Sets" value={summary.sets} />,
    <Stat key="v" size="md" label="Volume" value={fmtNum(summary.volume, 0)} unit="kg" />,
    duration != null && duration > 0 ? <Stat key="d" size="md" label="Duration" value={duration} unit="min" /> : null,
    summary.top ? (
      <Stat key="t" size="md" label="Top e1RM" value={fmtNum(summary.top.value, 0)} unit="kg"
        sub={<span className="s-ellipsis">{shortName(names.get(summary.top.exerciseId) ?? "")}</span>} />
    ) : null
  ].filter(Boolean);
  const title = session.title || session.source.replace(/^sheet:/, "");

  return (
    <main className="page session">
      <button className="btn btn-plain s-back" onClick={() => navigate(-1)}><ChevronLeft /> Back</button>
      <PageHead eyebrow={fmtLongDate(session.date)} title={title} />
      {session.date_confidence !== "exact" && (
        <details className="s-basis">
          <summary>{session.date_confidence === "estimated" ? "Date estimated" : "Week known"}</summary>
          {session.date_basis && <p>{session.date_basis}</p>}
        </details>
      )}

      {session.status === "in_progress" && (
        <Link className="btn btn-primary s-continue" to={`/workout/${session.id}`}><PlayIcon /> Continue workout</Link>
      )}

      <div className={`k-grid-${tiles.length === 4 ? 4 : tiles.length === 3 ? 3 : 2} s-tiles`}>
        {tiles.map((t, i) => <Card key={i} className="s-tile">{t}</Card>)}
      </div>

      <div className="s-exercises">
        {blocks.map((b, i) => {
          const notes = b.rows.map((s) => s.note).filter(Boolean);
          const work = b.rows.filter((s) => s.kind !== "warmup").length;
          return (
            <Card key={i} className="s-ex">
              <div className="s-ex-head">
                <h2>{names.get(b.exerciseId) ?? b.rows[0]?.exercise_as_logged ?? "Exercise"}</h2>
                <span className="k-muted k-num">{work}</span>
              </div>
              <div className="s-chips">
                {b.rows.map((s) => (
                  <span key={s.id} className={`s-chip ${s.kind} ${isFlagged(s) ? "flagged" : ""} ${s.completed ? "" : "skipped"}`}
                    title={[KIND_NAME[s.kind], isFlagged(s) ? `check: ${s.flags.join(", ")}` : null, s.completed ? null : "not done"].filter(Boolean).join(" · ") || undefined}>
                    {chipText(s)}
                  </span>
                ))}
              </div>
              {notes.length > 0 && <p className="s-note">{notes.join(" · ")}</p>}
              {annotations.filter((a) => a.kind === "note" && a.session_id === sessionId && a.exercise_id === b.exerciseId).map((a) => (
                <p key={a.id} className="s-note">Note: {a.text}</p>
              ))}
            </Card>
          );
        })}
      </div>

      {session.notes && <p className="s-notes">{session.notes}</p>}

      {session.source === "app" && (confirmDelete ? (
        <div className="s-delete-confirm" role="group" aria-label="Delete this workout?">
          <span>Delete this workout and the training max it set?</span>
          <button className="btn btn-plain" onClick={() => setConfirmDelete(false)}>Keep</button>
          <button className="btn btn-primary" onClick={async () => {
            // Training maxes set from this session's sets go too, or the deleted session would still move the plan.
            const ids = new Set(local.all("sets").filter((x) => x.session_id === session.id).map((x) => x.id));
            const tms = local.all("training_maxes").filter((m) => m.source_set_id != null && ids.has(m.source_set_id)).map((m) => m.id);
            if (tms.length) await local.remove("training_maxes", tms);
            await local.remove("sessions", [session.id]);
            navigate("/history");
          }}>Delete</button>
        </div>
      ) : (
        <button className="btn btn-plain s-delete" onClick={() => setConfirmDelete(true)}>Delete workout</button>
      ))}
    </main>
  );
}

/** "100 × 5", "BW+10 × 8", "BW−20 × 6", "12 min", "45 s". */
function chipText(s: SetRow): string {
  const reps = s.reps != null ? ` × ${fmtNum(s.reps)}` : "";
  if (s.unit === "min") return `${fmtNum(s.load)} min`;
  if (s.unit === "reps") return s.reps != null ? `${fmtNum(s.reps)} reps` : "—";
  if (s.unit === "bodyweight") {
    const add = s.load ? (s.load > 0 ? `+${fmtNum(s.load)}` : `−${fmtNum(-s.load)}`) : "";
    return `BW${add}${reps}`;
  }
  if (s.load == null) return s.duration_s ? `${fmtNum(s.duration_s)} s` : reps ? `${fmtNum(s.reps)} reps` : "—";
  return `${fmtNum(s.load)}${s.unit === "lb" ? " lb" : ""}${reps}`;
}

const shortName = (n: string) => n.split(",")[0]!.split("(")[0]!.trim();
