import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarRange, Flame, Plus, Scale, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { Bars, LineChart } from "../../components/charts";
import { Button, Card, EmptyState, Field, Modal, PageHeader } from "../../components/ui";
import { adaptiveTdee, dailyCalories } from "../../domain/energy";
import { activeProfile, addDays, formatShortDate, nowIso, todayIso, uid } from "../../domain/utils";

export function EnergyPage() {
  const { snapshot, mutate } = useAppStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [weightOpen, setWeightOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [windowDays, setWindowDays] = useState(28);
  const [estimateDate, setEstimateDate] = useState(todayIso);
  const [suggestedKcal, setSuggestedKcal] = useState<number | null>(null);
  useEffect(() => { if (searchParams.get("add") === "weight") { setWeightOpen(true); setSearchParams({}, { replace: true }); } }, [searchParams, setSearchParams]);
  if (!snapshot) return null;
  const profile = activeProfile(snapshot);
  const today = todayIso();
  const weights = snapshot.measurements.filter((item) => item.profileId === profile.id && item.type === "weight" && !item.deletedAt).sort((a, b) => a.date.localeCompare(b.date));
  const currentTarget = snapshot.nutritionTargets.filter((item) => item.profileId === profile.id && !item.deletedAt && item.effectiveFrom <= today && (!item.effectiveTo || item.effectiveTo >= today)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const displayWeights = weights.map((item) => ({ ...item, value: item.value * (item.unit === "lb" ? 0.45359237 : 1) / (profile.preferredUnit === "lb" ? 0.45359237 : 1), unit: profile.preferredUnit }));
  const recentWeights = displayWeights.slice(-30);
  const tdee = adaptiveTdee(snapshot, profile.id, windowDays, estimateDate);
  const energyByDate = dailyCalories(snapshot, profile.id);
  const weightData = recentWeights.map((item) => ({ label: formatShortDate(item.date), value: item.value }));
  const firstWeight = recentWeights[0]?.value;
  const latestWeight = recentWeights.at(-1)?.value;
  const weightDelta = firstWeight != null && latestWeight != null ? latestWeight - firstWeight : null;
  const dailyEnergy = Array.from({ length: 14 }, (_, index) => addDays(today, index - 13)).map((date) => ({
    label: new Intl.DateTimeFormat("en-GB", { weekday: "narrow", day: "numeric" }).format(new Date(`${date}T12:00:00`)),
    value: energyByDate.get(date) ?? 0
  }));
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
    <PageHeader eyebrow="Nutrition · Energy" title="Energy and body weight" description="See intake and weight as trends—not isolated daily judgments." actions={<><Button onClick={() => navigate("/nutrition")}><ArrowLeft />Diary</Button><Button onClick={() => { setSuggestedKcal(null); setTargetOpen(true); }}><Target />Targets</Button><Button variant="primary" onClick={() => setWeightOpen(true)}><Plus />Log weight</Button></>} />
    <div className="stat-grid three"><Card className="stat-card"><span>Latest weight<Scale /></span><strong>{latestWeight != null ? latestWeight.toFixed(1) : "—"}</strong><small>{weights.at(-1) ? `${profile.preferredUnit} · ${formatShortDate(weights.at(-1)!.date)}` : "No measurement yet"}</small></Card><Card className="stat-card"><span>30-point change{weightDelta != null && weightDelta <= 0 ? <TrendingDown /> : <TrendingUp />}</span><strong>{weightDelta == null ? "—" : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)}`}</strong><small>{profile.preferredUnit}</small></Card><Card className="stat-card"><span>14-day intake<Flame /></span><strong>{averageEnergy ? Math.round(averageEnergy).toLocaleString() : "—"}</strong><small>average logged kcal</small></Card></div>
    <Card>
      <div className="card-header"><div><h2>Adaptive TDEE · maintenance calories</h2><small>Estimated daily energy expenditure from your intake and weight trend</small></div><Flame /></div>
      <div className="tdee-controls"><Field label="TDEE window"><select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))}>{[14, 28, 42, 56].map((days) => <option key={days} value={days}>{days} days</option>)}</select></Field><Field label="Estimate as of"><input type="date" required max={today} value={estimateDate} onChange={(event) => { if (event.target.value && event.target.value <= today) setEstimateDate(event.target.value); }} /></Field></div>
      <div className="stat-grid three"><div className="stat-card"><span>Estimated maintenance</span><strong>{tdee.maintenanceKcal == null ? "—" : tdee.maintenanceKcal.toLocaleString()}</strong><small>kcal/day · {tdee.coverage}</small></div><div className="stat-card"><span>Average intake</span><strong>{tdee.avgKcal == null ? "—" : Math.round(tdee.avgKcal).toLocaleString()}</strong><small>{tdee.kcalDays} logged days · excludes the end date</small></div><div className="stat-card"><span>Weight trend</span><strong>{tdee.weeklyRateKg == null ? "—" : `${tdee.weeklyRateKg > 0 ? "+" : ""}${tdee.weeklyRateKg.toFixed(2)}`}</strong><small>kg/week · {tdee.weightDays} weigh-ins over {tdee.spanDays} days</small></div></div>
      <div className="tdee-copy">{!tdee.ready && <p role="status">To calculate this estimate, log {tdee.reason}. Choose an earlier date to review older records.</p>}<p>Average daily intake minus daily weight change × 7,700 kcal/kg, rounded to 25 kcal. Missing food days are excluded, not counted as zero. Imported daily totals override food items on the same date. Partial food logs and water-weight changes can skew the estimate; coverage describes the quantity of records, not their accuracy.</p>{tdee.ready && <Button onClick={() => { setSuggestedKcal(tdee.maintenanceKcal); setTargetOpen(true); }}>Review as calorie target</Button>}</div>
    </Card>
    <div className="content-grid equal"><Card><div className="card-header"><div><h2>Weight trend</h2><small>{recentWeights.length} measurements · raw values preserved</small></div><Scale /></div>{weightData.length >= 2 ? <LineChart data={weightData} label="Body weight" unit={profile.preferredUnit} /> : <EmptyState icon={<Scale />} title="A trend needs two weigh-ins" description="Add measurements when convenient; gaps are okay." action={<Button onClick={() => setWeightOpen(true)}>Log weight</Button>} />}</Card><Card><div className="card-header"><div><h2>Recent energy</h2><small>Daily intake, including imported total-only days</small></div><Flame /></div>{loggedDays.length ? <Bars data={dailyEnergy} label="Daily calories" unit="kcal" /> : <EmptyState icon={<Flame />} title="No recent energy entries" description="Food entries and imported daily totals will appear here." action={<Button onClick={() => navigate("/nutrition")}>Open diary</Button>} />}</Card></div>
    <Card className="target-banner"><span><CalendarRange /></span><div><span className="eyebrow">Current nutrition phase</span><h2>{currentTarget?.phase || "No phase configured"}</h2><p>{currentTarget && targetDay ? `${targetDay.kcal.toLocaleString()} kcal · ${targetDay.protein} g protein${currentTarget.targetWeight ? ` · target ${currentTarget.targetWeight} ${profile.preferredUnit}` : ""}` : "Set an effective-dated target. Previous targets remain in history."}</p></div><Button onClick={() => { setSuggestedKcal(null); setTargetOpen(true); }}>Edit targets</Button></Card>
    <Modal open={weightOpen} title="Log body weight" onClose={() => setWeightOpen(false)}><form onSubmit={(event) => { event.preventDefault(); void saveWeight(event.currentTarget); }}><div className="modal-body form-grid"><Field label="Date"><input required name="date" type="date" defaultValue={today} max={today} /></Field><Field label="Unit"><select name="unit" defaultValue={profile.preferredUnit}><option>kg</option><option>lb</option></select></Field><Field label="Weight" className="full"><input autoFocus required name="value" type="number" min="1" step="0.1" defaultValue={latestWeight || ""} /></Field><Field label="Note" className="full"><input name="note" placeholder="Optional context" /></Field></div><div className="modal-footer"><Button type="button" onClick={() => setWeightOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Save weight</Button></div></form></Modal>
    <Modal open={targetOpen} title="Set nutrition targets" onClose={() => setTargetOpen(false)}><form onSubmit={(event) => { event.preventDefault(); void saveTarget(event.currentTarget); }}><div className="modal-body form-grid"><div className="form-note full">A new target starts today. Earlier targets remain attached to their original dates.</div><Field label="Phase"><input name="phase" defaultValue={currentTarget?.phase || "Maintenance"} /></Field><Field label={`Target weight (${profile.preferredUnit})`}><input name="targetWeight" type="number" min="1" step="0.1" defaultValue={currentTarget?.targetWeight || ""} /></Field><Field label="Calories"><input required name="kcal" type="number" min="500" defaultValue={suggestedKcal ?? targetDay?.kcal ?? ""} /></Field><Field label="Protein (g)"><input required name="protein" type="number" min="0" defaultValue={targetDay?.protein ?? ""} /></Field><Field label="Carbs (g)"><input name="carbs" type="number" min="0" defaultValue={targetDay?.carbs ?? ""} /></Field><Field label="Fat (g)"><input name="fat" type="number" min="0" defaultValue={targetDay?.fat ?? ""} /></Field></div><div className="modal-footer"><Button type="button" onClick={() => setTargetOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Use from today</Button></div></form></Modal>
  </div>;
}
