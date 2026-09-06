import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarRange, Flame, Plus, Scale, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { Bars, LineChart } from "../../components/charts";
import { Button, Card, EmptyState, Field, Modal, PageHeader } from "../../components/ui";
import { activeProfile, addDays, foodTotals, formatShortDate, nowIso, todayIso, uid } from "../../domain/utils";

export function EnergyPage() {
  const { snapshot, mutate } = useAppStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [weightOpen, setWeightOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  useEffect(() => { if (searchParams.get("add") === "weight") { setWeightOpen(true); setSearchParams({}, { replace: true }); } }, [searchParams, setSearchParams]);
  if (!snapshot) return null;
  const profile = activeProfile(snapshot);
  const today = todayIso();
  const weights = snapshot.measurements.filter((item) => item.profileId === profile.id && item.type === "weight" && !item.deletedAt).sort((a, b) => a.date.localeCompare(b.date));
  const currentTarget = snapshot.nutritionTargets.filter((item) => item.profileId === profile.id && !item.deletedAt && item.effectiveFrom <= today && (!item.effectiveTo || item.effectiveTo >= today)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const recentWeights = weights.slice(-30);
  const weightData = recentWeights.map((item) => ({ label: formatShortDate(item.date), value: item.value }));
  const firstWeight = recentWeights[0]?.value;
  const latestWeight = recentWeights.at(-1)?.value;
  const weightDelta = firstWeight != null && latestWeight != null ? latestWeight - firstWeight : null;
  const dailyEnergy = useMemo(() => Array.from({ length: 14 }, (_, index) => addDays(today, index - 13)).map((date) => {
    const entries = snapshot.foodEntries.filter((item) => item.profileId === profile.id && item.date === date && !item.deletedAt);
    const override = snapshot.nutritionOverrides.find((item) => item.profileId === profile.id && item.date === date && !item.deletedAt);
    const kcal = entries.length ? foodTotals(entries).kcal : override?.kcal ?? 0;
    return { label: new Intl.DateTimeFormat("en-GB", { weekday: "narrow", day: "numeric" }).format(new Date(`${date}T12:00:00`)), value: kcal };
  }), [snapshot.foodEntries, snapshot.nutritionOverrides, profile.id, today]);
  const loggedDays = dailyEnergy.filter((day) => day.value > 0);
  const averageEnergy = loggedDays.length ? loggedDays.reduce((sum, day) => sum + day.value, 0) / loggedDays.length : 0;
  const targetDay = currentTarget?.weekdays.Mon;


  const saveWeight = async (form: HTMLFormElement) => {
    const data = new FormData(form); const stamp = nowIso(); const date = String(data.get("date")); const value = Number(data.get("value")); if (!value) return;
    await mutate("Logged body weight", (draft) => {
      const existing = draft.measurements.find((item) => item.profileId === profile.id && item.type === "weight" && item.date === date && !item.deletedAt);
      if (existing) Object.assign(existing, { value, unit: String(data.get("unit")) as "kg" | "lb", note: String(data.get("note") || ""), updatedAt: stamp });
      else draft.measurements.push({ id: uid("measurement"), createdAt: stamp, updatedAt: stamp, source: "manual", profileId: profile.id, date, type: "weight", value, unit: String(data.get("unit")) as "kg" | "lb", note: String(data.get("note") || "") });
    }); setWeightOpen(false);
  };
  const saveTarget = async (form: HTMLFormElement) => {
    const data = new FormData(form); const stamp = nowIso(); const kcal = Number(data.get("kcal")); const protein = Number(data.get("protein")); const carbs = Number(data.get("carbs")) || undefined; const fat = Number(data.get("fat")) || undefined;
    await mutate("Updated nutrition targets", (draft) => {
      const previous = draft.nutritionTargets.filter((item) => item.profileId === profile.id && !item.deletedAt && !item.effectiveTo).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      if (previous && previous.effectiveFrom < today) { previous.effectiveTo = addDays(today, -1); previous.updatedAt = stamp; }
      const sameDay = draft.nutritionTargets.find((item) => item.profileId === profile.id && !item.deletedAt && item.effectiveFrom === today);
      const weekdays = Object.fromEntries(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => [day, { kcal, protein, carbs, fat }]));
      if (sameDay) Object.assign(sameDay, { phase: String(data.get("phase") || "Current"), targetWeight: Number(data.get("targetWeight")) || null, weekdays, updatedAt: stamp });
      else draft.nutritionTargets.push({ id: uid("nutrition-target"), createdAt: stamp, updatedAt: stamp, source: "manual", profileId: profile.id, effectiveFrom: today, phase: String(data.get("phase") || "Current"), targetWeight: Number(data.get("targetWeight")) || null, weekdays });
      const p = draft.profiles.find((item) => item.id === profile.id); if (p) { p.targetWeight = Number(data.get("targetWeight")) || null; p.updatedAt = stamp; }
    }); setTargetOpen(false);
  };

  return <div className="page energy-page">
    <PageHeader eyebrow="Nutrition · Energy" title="Energy and body weight" description="See intake and weight as trends—not isolated daily judgments." actions={<><Button onClick={() => navigate("/nutrition")}><ArrowLeft />Diary</Button><Button onClick={() => setTargetOpen(true)}><Target />Targets</Button><Button variant="primary" onClick={() => setWeightOpen(true)}><Plus />Log weight</Button></>} />
    <div className="stat-grid three"><Card className="stat-card"><span>Latest weight<Scale /></span><strong>{latestWeight != null ? latestWeight.toFixed(1) : "—"}</strong><small>{weights.at(-1) ? `${weights.at(-1)!.unit} · ${formatShortDate(weights.at(-1)!.date)}` : "No measurement yet"}</small></Card><Card className="stat-card"><span>30-point change{weightDelta != null && weightDelta <= 0 ? <TrendingDown /> : <TrendingUp />}</span><strong>{weightDelta == null ? "—" : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}`}</strong><small>{weights.at(-1)?.unit || profile.preferredUnit}</small></Card><Card className="stat-card"><span>14-day intake<Flame /></span><strong>{averageEnergy ? Math.round(averageEnergy).toLocaleString() : "—"}</strong><small>average logged kcal</small></Card></div>
    <div className="content-grid equal"><Card><div className="card-header"><div><h2>Weight trend</h2><small>{recentWeights.length} measurements · raw values preserved</small></div><Scale /></div>{weightData.length >= 2 ? <LineChart data={weightData} label="Body weight" unit={weights.at(-1)?.unit || profile.preferredUnit} /> : <EmptyState icon={<Scale />} title="A trend needs two weigh-ins" description="Add measurements when convenient; gaps are okay." action={<Button onClick={() => setWeightOpen(true)}>Log weight</Button>} />}</Card><Card><div className="card-header"><div><h2>Recent energy</h2><small>Daily intake, including imported total-only days</small></div><Flame /></div>{loggedDays.length ? <Bars data={dailyEnergy} label="Daily calories" unit="kcal" /> : <EmptyState icon={<Flame />} title="No recent energy entries" description="Food entries and imported daily totals will appear here." action={<Button onClick={() => navigate("/nutrition")}>Open diary</Button>} />}</Card></div>
    <Card className="target-banner"><span><CalendarRange /></span><div><span className="eyebrow">Current nutrition phase</span><h2>{currentTarget?.phase || "No phase configured"}</h2><p>{currentTarget && targetDay ? `${targetDay.kcal.toLocaleString()} kcal · ${targetDay.protein} g protein${currentTarget.targetWeight ? ` · target ${currentTarget.targetWeight} ${profile.preferredUnit}` : ""}` : "Set an effective-dated target. Previous targets remain in history."}</p></div><Button onClick={() => setTargetOpen(true)}>Edit targets</Button></Card>
    <Modal open={weightOpen} title="Log body weight" onClose={() => setWeightOpen(false)}><form onSubmit={(event) => { event.preventDefault(); void saveWeight(event.currentTarget); }}><div className="modal-body form-grid"><Field label="Date"><input required name="date" type="date" defaultValue={today} max={today} /></Field><Field label="Unit"><select name="unit" defaultValue={profile.preferredUnit}><option>kg</option><option>lb</option></select></Field><Field label="Weight" className="full"><input autoFocus required name="value" type="number" min="1" step="0.1" defaultValue={latestWeight || ""} /></Field><Field label="Note" className="full"><input name="note" placeholder="Optional context" /></Field></div><div className="modal-footer"><Button type="button" onClick={() => setWeightOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Save weight</Button></div></form></Modal>
    <Modal open={targetOpen} title="Set nutrition targets" onClose={() => setTargetOpen(false)}><form onSubmit={(event) => { event.preventDefault(); void saveTarget(event.currentTarget); }}><div className="modal-body form-grid"><div className="form-note full">A new target starts today. Earlier targets remain attached to their original dates.</div><Field label="Phase"><input name="phase" defaultValue={currentTarget?.phase || "Maintenance"} /></Field><Field label={`Target weight (${profile.preferredUnit})`}><input name="targetWeight" type="number" min="1" step="0.1" defaultValue={currentTarget?.targetWeight || ""} /></Field><Field label="Calories"><input required name="kcal" type="number" min="500" defaultValue={targetDay?.kcal ?? ""} /></Field><Field label="Protein (g)"><input required name="protein" type="number" min="0" defaultValue={targetDay?.protein ?? ""} /></Field><Field label="Carbs (g)"><input name="carbs" type="number" min="0" defaultValue={targetDay?.carbs ?? ""} /></Field><Field label="Fat (g)"><input name="fat" type="number" min="0" defaultValue={targetDay?.fat ?? ""} /></Field></div><div className="modal-footer"><Button type="button" onClick={() => setTargetOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Use from today</Button></div></form></Modal>
  </div>;
}
