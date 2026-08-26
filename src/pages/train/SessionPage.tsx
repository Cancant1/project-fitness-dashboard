import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock3, Dumbbell, Edit3, RotateCcw, Trash2, Trophy } from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { Button, Card, EmptyState, Modal, PageHeader } from "../../components/ui";
import { epley, formatShortDate, nowIso, sessionSetCount, sessionVolume } from "../../domain/utils";

export function SessionPage() {
  const { sessionId } = useParams();
  const { snapshot, mutate } = useAppStore();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const session = snapshot?.sessions.find((item) => item.id === sessionId);
  if (!snapshot || !session) return <div className="page"><EmptyState icon={<Dumbbell />} title="Session not found" description="This workout is not available." action={<Button onClick={() => navigate("/train")}>Back to Train</Button>} /></div>;
  const best = session.performances.flatMap((performance) => performance.sets.filter((set) => set.completed && set.load && set.reps).map((set) => ({ exercise: performance.exerciseNameSnapshot, value: epley(set.load!, set.reps!), set }))).sort((a, b) => b.value - a.value)[0];
  const remove = async () => {
    const deletedAt = nowIso();
    await mutate("Soft-deleted session", (draft) => {
      const target = draft.sessions.find((item) => item.id === session.id);
      if (target) { target.deletedAt = deletedAt; target.updatedAt = deletedAt; }
      draft.tombstones.push({ entityType: "session", entityId: session.id, deletedAt, revision: `${draft.revision + 1}` });
    });
    navigate("/train");
  };
  return <div className="page session-detail-page">
    <PageHeader eyebrow="Completed session" title={session.title} description={`${formatShortDate(session.actualDate, true)}${session.split ? ` · ${session.split}` : ""}`} actions={<><Button onClick={() => navigate("/train")}><ArrowLeft />History</Button><Button onClick={() => navigate(`/train/live/${session.id}`)}><Edit3 />Edit</Button><Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 />Delete</Button></>} />
    <div className="stat-grid"><Card className="stat-card"><span>Completed sets<CheckCircle2 /></span><strong>{sessionSetCount(session)}</strong><small>{session.performances.length} exercises</small></Card><Card className="stat-card"><span>Volume<Dumbbell /></span><strong>{(sessionVolume(session) / 1000).toFixed(1)}k</strong><small>kg × reps</small></Card><Card className="stat-card"><span>Duration<Clock3 /></span><strong>{session.durationMinutes || "—"}</strong><small>{session.durationMinutes ? "minutes" : "not tracked"}</small></Card><Card className="stat-card"><span>Top e1RM<Trophy /></span><strong>{best ? Math.round(best.value) : "—"}</strong><small>{best ? `${best.exercise} · ${best.set.load} ${best.set.unit} × ${best.set.reps}` : "No load data"}</small></Card></div>
    <Card><div className="session-exercise-detail">{session.performances.sort((a, b) => a.order - b.order).map((performance) => <section key={performance.id}><header><span className={`movement-icon ${performance.movement.toLowerCase()}`}><Dumbbell /></span><div><h2>{performance.exerciseNameSnapshot}</h2><small>{performance.prescription?.targetReps ? `Target ${performance.prescription.targetReps}` : performance.movement}</small></div>{performance.skipped && <span className="chip warning">Skipped</span>}</header><div className="session-set-grid">{performance.sets.map((set) => <div key={set.id} className={set.completed ? "completed" : "incomplete"}><span>{set.type === "working" ? `Set ${set.index}` : set.type}</span><strong>{set.load ?? "—"} {set.unit} × {set.reps ?? set.durationMinutes ?? "—"}{set.durationMinutes ? " min" : ""}</strong><small>{set.rpe ? `RPE ${set.rpe}` : set.rir != null ? `${set.rir} RIR` : set.completed ? "Completed" : "Incomplete"}{set.note ? ` · ${set.note}` : ""}</small></div>)}</div>{performance.note && <p>{performance.note}</p>}</section>)}</div></Card>
    {session.notes && <Card className="session-notes-card"><span className="eyebrow">Session notes</span><p>{session.notes}</p></Card>}
    <Modal open={deleteOpen} title="Delete this session?" onClose={() => setDeleteOpen(false)}><div className="modal-body confirm-copy"><p>The session will be hidden and synced as deleted, but remains recoverable from History → Deleted and backups.</p><div><Button onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" onClick={() => void remove()}><Trash2 />Delete session</Button></div></div></Modal>
  </div>;
}

