import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookmarkPlus, Check, ChevronDown, ChevronRight, Copy, Edit3, Flame, Plus, Redo2, Search, Trash2, Utensils, X } from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { Button, Card, EmptyState, Field, Modal, PageHeader, ProgressBar } from "../../components/ui";
import type { FoodDefinition, FoodLogEntry } from "../../domain/types";
import { activeProfile, addDays, foodTotals, formatShortDate, nowIso, todayIso, uid } from "../../domain/utils";

const meals: NonNullable<FoodLogEntry["meal"]>[] = ["Breakfast", "Lunch", "Dinner", "Snacks", "Other"];
type PlateItem = { food: FoodDefinition; quantity: number };

export function NutritionPage() {
  const { snapshot, mutate } = useAppStore();
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? params.date! : todayIso();
  const [addOpen, setAddOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [meal, setMeal] = useState<NonNullable<FoodLogEntry["meal"]>>("Lunch");
  const [plate, setPlate] = useState<PlateItem[]>([]);
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);
  const [saveMealFor, setSaveMealFor] = useState<NonNullable<FoodLogEntry["meal"]> | null>(null);
  const [lastDeleted, setLastDeleted] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    if (searchParams.get("add") === "food") {
      setAddOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  if (!snapshot) return null;
  const profile = activeProfile(snapshot);
  const entries = snapshot.foodEntries.filter((item) => item.profileId === profile.id && item.date === date && !item.deletedAt).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const totals = foodTotals(entries);
  const override = snapshot.nutritionOverrides.find((item) => item.profileId === profile.id && item.date === date && !item.deletedAt);
  const target = snapshot.nutritionTargets.filter((item) => item.profileId === profile.id && !item.deletedAt && item.effectiveFrom <= date && (!item.effectiveTo || item.effectiveTo >= date)).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  const dayKey = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(new Date(`${date}T12:00:00`));
  const dailyTarget = target?.weekdays[dayKey];
  const displayTotals = entries.length ? totals : { kcal: override?.kcal ?? 0, protein: override?.protein ?? 0, carbs: override?.carbs ?? 0, fat: override?.fat ?? 0 };
  const recentIds = snapshot.foodEntries.filter((item) => item.profileId === profile.id && !item.deletedAt && item.foodId).sort((a, b) => b.date.localeCompare(a.date) || (b.time || "").localeCompare(a.time || "")).map((item) => item.foodId!);
  const rankedFoods = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const recency = new Map<string, number>();
    recentIds.forEach((id, index) => { if (!recency.has(id)) recency.set(id, index); });
    return snapshot.foods.filter((food) => !food.archived && !food.deletedAt && (!needle || `${food.name} ${food.brand || ""} ${food.category || ""}`.toLowerCase().includes(needle))).sort((a, b) => Number(b.favorite) - Number(a.favorite) || (recency.get(a.id) ?? 9999) - (recency.get(b.id) ?? 9999) || a.name.localeCompare(b.name)).slice(0, 80);
  }, [snapshot.foods, query, recentIds.join("|")]);

  const openAdd = (forMeal?: FoodLogEntry["meal"]) => {
    setMeal(forMeal || "Lunch");
    setPlate([]);
    setQuery("");
    setAddOpen(true);
  };
  const changePlate = (food: FoodDefinition, delta: number) => setPlate((current) => {
    const existing = current.find((item) => item.food.id === food.id);
    if (!existing && delta > 0) return [...current, { food, quantity: 1 }];
    return current.map((item) => item.food.id === food.id ? { ...item, quantity: Math.max(0, Math.round((item.quantity + delta) * 4) / 4) } : item).filter((item) => item.quantity > 0);
  });
  const addPlate = async () => {
    if (!plate.length) return;
    const stamp = nowIso();
    await mutate("Logged food plate", (draft) => {
      plate.forEach(({ food, quantity }) => draft.foodEntries.push({
        id: uid("food-entry"), createdAt: stamp, updatedAt: stamp, source: "manual", profileId: profile.id, date, time: stamp.slice(11, 16), meal, foodId: food.id, nameSnapshot: food.name, servingLabelSnapshot: food.servings[0]?.label || "serving", quantity, kcal: food.kcalPerServing * quantity, protein: food.proteinPerServing * quantity, carbs: food.carbsPerServing == null ? null : food.carbsPerServing * quantity, fat: food.fatPerServing == null ? null : food.fatPerServing * quantity
      }));
    });
    setAddOpen(false); setPlate([]);
  };
  const addSavedMeal = async (savedMealId: string) => {
    const saved = snapshot.savedMeals.find((item) => item.id === savedMealId);
    if (!saved) return;
    const stamp = nowIso();
    await mutate("Logged saved meal", (draft) => saved.items.forEach((item) => draft.foodEntries.push({ ...item, id: uid("food-entry"), createdAt: stamp, updatedAt: stamp, source: "manual", profileId: profile.id, date, time: stamp.slice(11, 16), meal: saved.defaultMeal || meal })));
  };
  const deleteEntry = async (id: string) => {
    await mutate("Deleted food entry", (draft) => {
      const entry = draft.foodEntries.find((item) => item.id === id);
      if (entry) { entry.deletedAt = nowIso(); entry.updatedAt = entry.deletedAt; draft.tombstones.push({ entityType: "foodEntry", entityId: id, deletedAt: entry.deletedAt, revision: entry.updatedAt }); }
    });
    setLastDeleted(id);
  };
  const undoDelete = async () => {
    if (!lastDeleted) return;
    await mutate("Restored food entry", (draft) => {
      const entry = draft.foodEntries.find((item) => item.id === lastDeleted);
      if (entry) { delete entry.deletedAt; entry.updatedAt = nowIso(); }
      draft.tombstones = draft.tombstones.filter((item) => !(item.entityType === "foodEntry" && item.entityId === lastDeleted));
    });
    setLastDeleted(null);
  };
  const copyYesterday = async () => {
    const yesterday = addDays(date, -1);
    const source = snapshot.foodEntries.filter((item) => item.profileId === profile.id && item.date === yesterday && !item.deletedAt);
    if (!source.length) return;
    const stamp = nowIso();
    await mutate("Copied previous day food", (draft) => source.forEach((item) => draft.foodEntries.push({ ...item, id: uid("food-entry"), date, createdAt: stamp, updatedAt: stamp, source: "manual", sourceRef: `copied:${item.id}` })));
  };
  const saveEntry = async (form: HTMLFormElement) => {
    if (!editing) return;
    const data = new FormData(form);
    const quantity = Math.max(.01, Number(data.get("quantity")) || 1);
    const ratio = quantity / (editing.quantity || 1);
    await mutate("Edited food entry", (draft) => {
      const item = draft.foodEntries.find((entry) => entry.id === editing.id);
      if (item) Object.assign(item, { quantity, meal: String(data.get("meal")) as FoodLogEntry["meal"], kcal: editing.kcal * ratio, protein: editing.protein * ratio, carbs: editing.carbs == null ? null : editing.carbs * ratio, fat: editing.fat == null ? null : editing.fat * ratio, note: String(data.get("note") || ""), updatedAt: nowIso() });
    });
    setEditing(null);
  };
  const saveQuick = async (form: HTMLFormElement) => {
    const data = new FormData(form); const stamp = nowIso();
    await mutate("Quick-added nutrition", (draft) => draft.foodEntries.push({ id: uid("food-entry"), createdAt: stamp, updatedAt: stamp, source: "manual", profileId: profile.id, date, time: stamp.slice(11, 16), meal: String(data.get("meal")) as FoodLogEntry["meal"], nameSnapshot: String(data.get("name") || "Quick add"), servingLabelSnapshot: "manual total", quantity: 1, kcal: Number(data.get("kcal")) || 0, protein: Number(data.get("protein")) || 0, carbs: Number(data.get("carbs")) || null, fat: Number(data.get("fat")) || null }));
    setQuickOpen(false);
  };
  const saveMeal = async (form: HTMLFormElement) => {
    if (!saveMealFor) return;
    const sourceEntries = entries.filter((entry) => (entry.meal || "Other") === saveMealFor);
    if (!sourceEntries.length) return;
    const data = new FormData(form); const stamp = nowIso(); const name = String(data.get("name") || "").trim(); if (!name) return;
    await mutate("Saved reusable meal", (draft) => draft.savedMeals.push({
      id: uid("saved-meal"), createdAt: stamp, updatedAt: stamp, source: "manual", profileId: profile.id, name, defaultMeal: saveMealFor,
      items: sourceEntries.map((entry) => ({ foodId: entry.foodId, nameSnapshot: entry.nameSnapshot, servingLabelSnapshot: entry.servingLabelSnapshot, quantity: entry.quantity, kcal: entry.kcal, protein: entry.protein, carbs: entry.carbs, fat: entry.fat }))
    }));
    setSaveMealFor(null);
  };
  const renderFoodEntry = (entry: FoodLogEntry, chronological = false) => <div key={entry.id} className="food-entry-row">
    <span className="food-entry-check"><Check /></span>
    <span><strong>{entry.nameSnapshot}</strong><small>{chronological ? `${entry.time || "Time unknown"} · ${entry.meal || "Other"} · ` : ""}{entry.quantity} × {entry.servingLabelSnapshot}{entry.note ? ` · ${entry.note}` : ""}</small></span>
    <span className="food-entry-macros"><strong>{Math.round(entry.kcal)} kcal</strong><small>{Math.round(entry.protein)}P{profile.trackCarbs ? ` · ${Math.round(entry.carbs || 0)}C` : ""}{profile.trackFat ? ` · ${Math.round(entry.fat || 0)}F` : ""}</small></span>
    <span className="row-actions"><button aria-label={`Edit ${entry.nameSnapshot}`} onClick={() => setEditing(entry)}><Edit3 /></button><button aria-label={`Delete ${entry.nameSnapshot}`} onClick={() => void deleteEntry(entry.id)}><Trash2 /></button></span>
  </div>;

  return (
    <div className="page nutrition-page">
      <PageHeader eyebrow="Nutrition" title="Food diary" description="A quick, precise daily log with every imported entry preserved." actions={<><Button onClick={() => navigate("/nutrition/foods")}>Food library</Button><Button variant="primary" onClick={() => openAdd()}><Plus />Add food</Button></>} />
      <div className="date-switcher"><Button className="icon-only" aria-label="Previous day" onClick={() => navigate(`/nutrition/${addDays(date, -1)}`)}><ArrowLeft /></Button><button className="date-current" onClick={() => navigate("/nutrition")}><span>{formatShortDate(date, true)}</span><small>{date === todayIso() ? "Today" : "Tap to return to today"}</small></button><Button className="icon-only" aria-label="Next day" disabled={date >= todayIso()} onClick={() => navigate(`/nutrition/${addDays(date, 1)}`)}><ArrowRight /></Button></div>

      <Card className="nutrition-summary-card">
        <div className="calorie-orbit"><div><strong>{Math.round(displayTotals.kcal).toLocaleString()}</strong><span>{dailyTarget ? `of ${dailyTarget.kcal.toLocaleString()} kcal` : "kcal logged"}</span>{dailyTarget && <small>{Math.round(dailyTarget.kcal - displayTotals.kcal).toLocaleString()} remaining</small>}</div><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" /><circle className="value" cx="60" cy="60" r="52" pathLength="100" strokeDasharray={`${dailyTarget?.kcal ? Math.min(100, displayTotals.kcal / dailyTarget.kcal * 100) : 0} 100`} /></svg></div>
        <div className="nutrition-macros"><div><span><b>Protein</b><small>{Math.round(displayTotals.protein)}{dailyTarget ? ` / ${dailyTarget.protein}` : ""} g</small></span>{dailyTarget?.protein != null && <ProgressBar value={displayTotals.protein} max={dailyTarget.protein} label="Protein" tone="protein" />}</div>{profile.trackCarbs && <div><span><b>Carbs</b><small>{Math.round(displayTotals.carbs)}{dailyTarget?.carbs != null ? ` / ${dailyTarget.carbs}` : ""} g</small></span>{dailyTarget?.carbs != null && <ProgressBar value={displayTotals.carbs} max={dailyTarget.carbs || 1} label="Carbs" tone="carbs" />}</div>}{profile.trackFat && <div><span><b>Fat</b><small>{Math.round(displayTotals.fat)}{dailyTarget?.fat != null ? ` / ${dailyTarget.fat}` : ""} g</small></span>{dailyTarget?.fat != null && <ProgressBar value={displayTotals.fat} max={dailyTarget.fat || 1} label="Fat" tone="fat" />}</div>}</div>
        <div className="summary-actions"><Button onClick={() => setQuickOpen(true)}><Flame />Quick add</Button><Button onClick={() => void copyYesterday()} disabled={!snapshot.foodEntries.some((item) => item.profileId === profile.id && item.date === addDays(date, -1) && !item.deletedAt)}><Copy />Copy yesterday</Button><Button onClick={() => navigate("/nutrition/energy")}><ArrowRight />Energy balance</Button></div>
      </Card>

      {snapshot.savedMeals.filter((item) => item.profileId === profile.id && !item.deletedAt).length > 0 && <div className="saved-meal-strip"><span>Saved meals</span>{snapshot.savedMeals.filter((item) => item.profileId === profile.id && !item.deletedAt).map((item) => <button key={item.id} onClick={() => void addSavedMeal(item.id)}><Plus />{item.name}<small>{Math.round(item.items.reduce((sum, entry) => sum + entry.kcal, 0))} kcal</small></button>)}</div>}

      {snapshot.settings.mealView === "time" ? <div className="meal-stack"><Card className="meal-card chronological-card"><header><div className="meal-title static"><span><strong>Chronological diary</strong><small>{entries.length ? `${entries.length} item${entries.length === 1 ? "" : "s"} · ${Math.round(displayTotals.kcal)} kcal` : "Nothing logged"}</small></span></div><Button className="small" variant="ghost" onClick={() => openAdd()}><Plus />Add</Button></header>{entries.length ? <div className="food-entry-list">{entries.map((entry) => renderFoodEntry(entry, true))}</div> : <button className="meal-empty" onClick={() => openAdd()}><Plus /><span><strong>Add your first food</strong><small>Entries will appear here by time</small></span><ChevronRight /></button>}</Card></div> : <div className="meal-stack">{meals.map((mealName) => {
        const mealEntries = entries.filter((entry) => (entry.meal || "Other") === mealName);
        const mealTotals = foodTotals(mealEntries);
        const isCollapsed = collapsed.includes(mealName);
        return <Card key={mealName} className="meal-card"><header><button className="meal-title" onClick={() => setCollapsed((values) => values.includes(mealName) ? values.filter((value) => value !== mealName) : [...values, mealName])}><span><strong>{mealName}</strong><small>{mealEntries.length ? `${Math.round(mealTotals.kcal)} kcal · ${Math.round(mealTotals.protein)} g protein` : "Nothing logged"}</small></span><ChevronDown className={isCollapsed ? "collapsed" : ""} /></button><div className="meal-actions">{mealEntries.length > 0 && <Button className="small" variant="ghost" onClick={() => setSaveMealFor(mealName)}><BookmarkPlus />Save</Button>}<Button className="small" variant="ghost" onClick={() => openAdd(mealName)}><Plus />Add</Button></div></header>{!isCollapsed && (mealEntries.length ? <div className="food-entry-list">{mealEntries.map((entry) => renderFoodEntry(entry))}</div> : <button className="meal-empty" onClick={() => openAdd(mealName)}><Plus /><span><strong>Add {mealName.toLowerCase()}</strong><small>Search, repeat, or quick add</small></span><ChevronRight /></button>)}</Card>;
      })}</div>}

      {lastDeleted && <div className="undo-toast" role="status"><span>Food entry removed</span><button onClick={() => void undoDelete()}><Redo2 />Undo</button><button aria-label="Dismiss" onClick={() => setLastDeleted(null)}><X /></button></div>}

      <Modal open={addOpen} title={`Add to ${meal}`} onClose={() => setAddOpen(false)} className="food-picker-modal">
        <div className="food-picker-head"><label className="search-field"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search foods and brands…" /></label><select aria-label="Meal" value={meal} onChange={(event) => setMeal(event.target.value as typeof meal)}>{meals.map((value) => <option key={value}>{value}</option>)}</select></div>
        <div className="food-picker-body"><div className="food-results">{rankedFoods.map((food) => { const item = plate.find((value) => value.food.id === food.id); return <button key={food.id} className={item ? "selected" : ""} onClick={() => changePlate(food, 1)}><span><strong>{food.name}</strong><small>{food.brand ? `${food.brand} · ` : ""}{food.servings[0]?.label || "serving"}</small></span><span><b>{Math.round(food.kcalPerServing)}</b><small>kcal</small></span>{item ? <Check /> : <Plus />}</button>; })}{!rankedFoods.length && <EmptyState icon={<Search />} title="No foods found" description="Create it in the food library, then it will be available everywhere." action={<Button onClick={() => navigate("/nutrition/foods")}>Open food library</Button>} />}</div>{plate.length > 0 && <aside className="plate-panel"><span className="eyebrow">Your plate</span>{plate.map((item) => <div key={item.food.id}><span><strong>{item.food.name}</strong><small>{Math.round(item.food.kcalPerServing * item.quantity)} kcal</small></span><span className="quantity-stepper"><button aria-label="Decrease" onClick={() => changePlate(item.food, -.25)}>−</button><b>{item.quantity}</b><button aria-label="Increase" onClick={() => changePlate(item.food, .25)}>+</button></span></div>)}<div className="plate-total"><span>Total</span><strong>{Math.round(plate.reduce((sum, item) => sum + item.food.kcalPerServing * item.quantity, 0))} kcal</strong></div></aside>}</div>
        <div className="modal-footer"><Button onClick={() => setAddOpen(false)}>Cancel</Button><Button variant="primary" disabled={!plate.length} onClick={() => void addPlate()}>Add {plate.length || ""} item{plate.length === 1 ? "" : "s"}</Button></div>
      </Modal>

      <Modal open={!!editing} title="Edit food entry" onClose={() => setEditing(null)}>{editing && <form onSubmit={(event) => { event.preventDefault(); void saveEntry(event.currentTarget); }}><div className="modal-body form-grid"><div className="form-intro full"><strong>{editing.nameSnapshot}</strong><small>{Math.round(editing.kcal)} kcal at current quantity</small></div><Field label="Quantity"><input name="quantity" type="number" min="0.01" step="any" defaultValue={editing.quantity} /></Field><Field label="Meal"><select name="meal" defaultValue={editing.meal || "Other"}>{meals.map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Note" className="full"><input name="note" defaultValue={editing.note || ""} /></Field></div><div className="modal-footer"><Button type="button" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="primary">Save changes</Button></div></form>}</Modal>
      <Modal open={quickOpen} title="Quick add totals" onClose={() => setQuickOpen(false)}><form onSubmit={(event) => { event.preventDefault(); void saveQuick(event.currentTarget); }}><div className="modal-body form-grid"><Field label="Label"><input name="name" defaultValue="Quick add" /></Field><Field label="Meal"><select name="meal" defaultValue="Other">{meals.map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Calories"><input required name="kcal" type="number" min="0" /></Field><Field label="Protein (g)"><input required name="protein" type="number" min="0" step="0.1" /></Field><Field label="Carbs (g)"><input name="carbs" type="number" min="0" step="0.1" /></Field><Field label="Fat (g)"><input name="fat" type="number" min="0" step="0.1" /></Field></div><div className="modal-footer"><Button type="button" onClick={() => setQuickOpen(false)}>Cancel</Button><Button type="submit" variant="primary">Add totals</Button></div></form></Modal>
      <Modal open={!!saveMealFor} title="Save reusable meal" onClose={() => setSaveMealFor(null)}>{saveMealFor && <form onSubmit={(event) => { event.preventDefault(); void saveMeal(event.currentTarget); }}><div className="modal-body form-stack"><div className="form-note">This saves the current {saveMealFor.toLowerCase()} as a reusable bundle. Today’s entries remain unchanged.</div><Field label="Meal name"><input autoFocus required name="name" placeholder="e.g. Weekday breakfast" /></Field></div><div className="modal-footer"><Button type="button" onClick={() => setSaveMealFor(null)}>Cancel</Button><Button type="submit" variant="primary"><BookmarkPlus />Save meal</Button></div></form>}</Modal>
    </div>
  );
}
