import { useMemo, useState } from "react";
import { useRows, useStore } from "../data/store";
import type { Food, FoodEntry, Meal, SavedMeal } from "../data/types";
import { addDays, fmtLongDate, fmtNum, parseDecimal, todayIso } from "../lib/format";
import { dayTotals, targetFor } from "../lib/nutrition";
import { Sheet } from "../ui/Sheet";
import { ChevronLeft, ChevronRight, PlusIcon } from "../ui/icons";

const MEALS: { key: Meal; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snacks", label: "Snacks" },
  { key: "other", label: "Other" }
];

// "Your day" from the Strength Return Plan (Food section). Fat is not given there, so it stays empty.
const PLAN_DAY: { name: string; meal: Meal; kcal: number; protein: number; carbs: number }[] = [
  { name: "Jumbo skyr vanille 500 ml + banana", meal: "breakfast", kcal: 470, protein: 49, carbs: 69 },
  { name: "AH sausage roll + 500 g magere kwark", meal: "lunch", kcal: 558, protein: 46, carbs: 43 },
  { name: "Apple or pear", meal: "snacks", kcal: 80, protein: 0, carbs: 19 },
  { name: "Winegums ~40 g (pre-session)", meal: "snacks", kcal: 135, protein: 2, carbs: 30 },
  { name: "Bulk shake, 2 scoops in water", meal: "snacks", kcal: 228, protein: 44, carbs: 5 },
  { name: "25 g unsalted nuts + fruit", meal: "snacks", kcal: 235, protein: 6, carbs: 23 }
];

function mealForNow(): Meal {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 17 ? "snacks" : h < 21 ? "dinner" : "snacks";
}

export function FoodPage() {
  const { local } = useStore();
  const entries = useRows("food_entries");
  const days = useRows("nutrition_days");
  const targets = useRows("nutrition_targets");
  const foods = useRows("foods");
  const saved = useRows("saved_meals");
  const [date, setDate] = useState(todayIso());
  const [adding, setAdding] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [undo, setUndo] = useState<FoodEntry | null>(null);

  const today = todayIso();
  const mine = useMemo(() => entries.filter((e) => e.date === date).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")), [entries, date]);
  const totals = dayTotals(date, entries, days);
  const target = targetFor(date, targets);
  const planTargetMissing = !targets.some((t) => t.effective_from === "2026-10-12");

  async function log(items: Omit<FoodEntry, keyof import("../data/types").Base | "date" | "time" | "legacy_ref">[]) {
    const time = new Date().toTimeString().slice(0, 5);
    await local.save("food_entries", items.map((i) => ({ ...i, date, time, legacy_ref: {} })));
  }

  async function copyYesterday() {
    const prev = entries.filter((e) => e.date === addDays(date, -1));
    await log(prev.map(({ meal, food_id, name, serving_label, quantity, kcal, protein, carbs, fat, note }) => ({ meal, food_id, name, serving_label, quantity, kcal, protein, carbs, fat, note })));
  }

  async function remove(entry: FoodEntry) {
    await local.remove("food_entries", [entry.id]);
    setUndo(entry);
    window.setTimeout(() => setUndo((u) => (u?.id === entry.id ? null : u)), 5000);
  }

  async function addPlanSetup() {
    if (planTargetMissing) {
      await local.save("nutrition_targets", { effective_from: "2026-10-12", phase: "lean bulk", kcal: 2800, protein: 150, carbs: 370, fat: 80, per_weekday: null, target_weight: 77, note: "Strength Return Plan" });
    }
    if (!saved.some((s) => s.name === "Plan: usual day")) {
      await local.save("saved_meals", {
        name: "Plan: usual day", default_meal: null, position: 0,
        items: PLAN_DAY.map((p) => ({ meal: p.meal, food_id: null, name: p.name, serving_label: "1 portion", quantity: 1, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: null, note: null, legacy_ref: {} }))
      });
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{date === today ? "Today" : fmtLongDate(date)}</p>
          <h1 className="large-title">Food</h1>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-glass btn-icon" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><ChevronLeft /></button>
          {date !== today && <button className="btn btn-glass btn-sm" style={{ height: 44, borderRadius: 22 }} onClick={() => setDate(today)}>Today</button>}
          <button className="btn btn-glass btn-icon" aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))}><ChevronRight /></button>
        </div>
      </header>

      <section className="card card-pad" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20 }}>
        <Total label="Energy" value={totals.kcal} target={target?.kcal} unit="kcal" color="var(--fg)" />
        <Total label="Protein" value={totals.protein} target={target?.protein} unit="g" color="var(--accent)" />
        {(totals.carbs != null || totals.fat != null) && (
          <p className="row-sub" style={{ gridColumn: "1 / -1" }}>
            Carbs {fmtNum(totals.carbs, 0)} g · Fat {fmtNum(totals.fat, 0)} g
            {totals.source === "day" && " · day total from your old log"}
          </p>
        )}
      </section>

      {(planTargetMissing || !saved.some((s) => s.name === "Plan: usual day")) && (
        <section className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 15 }}>The plan's food setup: 2,800 kcal and 150 g protein a day from 12 October, and your usual day as one-tap meals.</p>
          <button className="btn btn-tinted btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => void addPlanSetup()}>Add plan targets and usual day</button>
        </section>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(mealForNow())}><PlusIcon /> Add food</button>
        {saved.map((s) => <SavedMealButton key={s.id} meal={s} onLog={(items) => void log(items)} />)}
        {!mine.length && entries.some((e) => e.date === addDays(date, -1)) && (
          <button className="btn btn-glass btn-sm" onClick={() => void copyYesterday()}>Copy yesterday</button>
        )}
      </div>

      {MEALS.map(({ key, label }) => {
        const items = mine.filter((e) => (e.meal ?? "other") === key);
        if (!items.length) return null;
        return (
          <section className="section" key={key}>
            <div className="section-row">
              <h2 className="section-label" style={{ margin: 0 }}>{label}</h2>
              <span className="row-sub num">{fmtNum(items.reduce((s, i) => s + i.kcal, 0), 0)} kcal</span>
            </div>
            <div className="list">
              {items.map((e) => (
                <button key={e.id} className="row" onClick={() => setEditing(e)}
                  style={{ width: "100%", border: 0, background: "transparent", padding: "8px 0", textAlign: "left", cursor: "pointer" }}>
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
                    <span className="row-sub">{e.quantity !== 1 ? `${fmtNum(e.quantity)} × ` : ""}{e.serving_label ?? ""}</span>
                  </span>
                  <span className="num" style={{ textAlign: "right", flex: "none" }}>
                    <span style={{ fontWeight: 600 }}>{fmtNum(e.kcal, 0)}</span>
                    <span className="row-sub"> · {fmtNum(e.protein, 0)} g</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {!mine.length && <p className="muted" style={{ margin: "0 4px" }}>Nothing logged{date === today ? " yet today" : " on this day"}.</p>}

      {adding && <AddFood meal={adding} foods={foods} entries={entries} onClose={() => setAdding(null)} onAdd={(items) => void log(items)} />}
      {editing && <EditEntry entry={editing} onClose={() => setEditing(null)} onSave={(patch) => void local.save("food_entries", { ...patch, id: editing.id })} onDelete={() => { void remove(editing); setEditing(null); }} />}
      {undo && (
        <div className="toast glass" role="status" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          Deleted {undo.name}
          <button className="btn btn-plain btn-sm" onClick={() => { void local.save("food_entries", { id: undo.id, deleted_at: null }); setUndo(null); }}>Undo</button>
        </div>
      )}
    </main>
  );
}

function Total({ label, value, target, unit, color }: { label: string; value: number; target?: number; unit: string; color: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="row-sub">{label}</span>
      <span className="num" style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>
        {fmtNum(value, 0)}<span style={{ fontSize: 15, fontWeight: 500, color: "var(--fg2)" }}>{target ? ` / ${fmtNum(target, 0)}` : ""} {unit}</span>
      </span>
      {target ? <div className="bar"><span style={{ width: `${pct}%`, background: color }} /></div> : <span className="row-sub">No target set</span>}
    </div>
  );
}

function SavedMealButton({ meal, onLog }: { meal: SavedMeal; onLog: (items: SavedMeal["items"]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-glass btn-sm" onClick={() => setOpen(true)}>{meal.name}</button>
      {open && (
        <Sheet title={meal.name} onClose={() => setOpen(false)}>
          <div className="list">
            {meal.items.map((i, n) => (
              <div className="row" key={n}>
                <span>{i.name}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="num row-sub">{fmtNum(i.kcal, 0)} · {fmtNum(i.protein, 0)} g</span>
                  <button className="btn btn-tinted btn-sm" onClick={() => onLog([i])}>Log</button>
                </span>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => { onLog(meal.items); setOpen(false); }}>Log all</button>
        </Sheet>
      )}
    </>
  );
}

function AddFood({ meal, foods, entries, onClose, onAdd }: {
  meal: Meal; foods: Food[]; entries: FoodEntry[]; onClose: () => void;
  onAdd: (items: Omit<FoodEntry, keyof import("../data/types").Base | "date" | "time" | "legacy_ref">[]) => void;
}) {
  const [q, setQ] = useState("");
  const [m, setM] = useState<Meal>(meal);
  const [quick, setQuick] = useState({ name: "", kcal: "", protein: "" });
  const [added, setAdded] = useState(0);

  const ranked = useMemo(() => {
    const lastUsed = new Map<string, string>();
    for (const e of entries) if (e.food_id && (lastUsed.get(e.food_id) ?? "") < e.date) lastUsed.set(e.food_id, e.date);
    const needle = q.trim().toLowerCase();
    return foods
      .filter((f) => !f.archived && (!needle || `${f.name} ${f.brand ?? ""}`.toLowerCase().includes(needle)))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (lastUsed.get(b.id) ?? "").localeCompare(lastUsed.get(a.id) ?? "") || a.name.localeCompare(b.name))
      .slice(0, 40);
  }, [foods, entries, q]);

  function addFood(f: Food) {
    onAdd([{ meal: m, food_id: f.id, name: f.name, serving_label: f.servings[0]?.label ?? "1 portion", quantity: 1, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, note: null }]);
    setAdded((n) => n + 1);
  }

  function addQuick() {
    const kcal = parseDecimal(quick.kcal);
    const protein = parseDecimal(quick.protein) ?? 0;
    if (kcal == null) return;
    onAdd([{ meal: m, food_id: null, name: quick.name.trim() || "Quick add", serving_label: null, quantity: 1, kcal, protein, carbs: null, fat: null, note: null }]);
    setQuick({ name: "", kcal: "", protein: "" });
    setAdded((n) => n + 1);
  }

  return (
    <Sheet title={added ? `Added ${added}` : "Add food"} onClose={onClose}>
      <div className="segmented" role="group" aria-label="Meal" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
        {MEALS.map((x) => <button key={x.key} aria-pressed={m === x.key} onClick={() => setM(x.key)}>{x.label}</button>)}
      </div>
      <label className="field" htmlFor="food-q">
        <span className="sr-only">Search foods</span>
        <input id="food-q" placeholder="Search your foods" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </label>
      <div className="list">
        {ranked.map((f) => (
          <div className="row" key={f.id}>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span>{f.name}{f.favorite ? " ★" : ""}</span>
              <span className="row-sub">{f.servings[0]?.label ?? "1 portion"} · {fmtNum(f.kcal, 0)} kcal · {fmtNum(f.protein, 1)} g protein</span>
            </span>
            <button className="btn btn-tinted btn-icon" aria-label={`Add ${f.name}`} onClick={() => addFood(f)} style={{ borderRadius: 14, flex: "none" }}><PlusIcon /></button>
          </div>
        ))}
        {!ranked.length && <div className="row muted">No food matches. Use quick add below.</div>}
      </div>
      <h3 className="section-label">Quick add</h3>
      <div className="list" style={{ paddingTop: 8, paddingBottom: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        <label className="field" htmlFor="qa-name"><span className="sr-only">Name</span><input id="qa-name" placeholder="What (optional)" value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} /></label>
        <div className="grid-2">
          <label className="field" htmlFor="qa-kcal"><span className="sr-only">kcal</span><input id="qa-kcal" inputMode="decimal" placeholder="kcal" value={quick.kcal} onChange={(e) => setQuick({ ...quick, kcal: e.target.value })} /><span className="field-suffix">kcal</span></label>
          <label className="field" htmlFor="qa-p"><span className="sr-only">Protein</span><input id="qa-p" inputMode="decimal" placeholder="protein" value={quick.protein} onChange={(e) => setQuick({ ...quick, protein: e.target.value })} /><span className="field-suffix">g</span></label>
        </div>
        <button className="btn btn-tinted btn-sm" style={{ alignSelf: "flex-end" }} onClick={addQuick}>Add</button>
      </div>
    </Sheet>
  );
}

function EditEntry({ entry, onClose, onSave, onDelete }: { entry: FoodEntry; onClose: () => void; onSave: (p: Partial<FoodEntry>) => void; onDelete: () => void }) {
  const [qty, setQty] = useState(String(entry.quantity).replace(".", ","));
  const [meal, setMeal] = useState<Meal>(entry.meal ?? "other");
  function save() {
    const q = parseDecimal(qty);
    if (q == null || q <= 0) return;
    const f = q / entry.quantity;
    onSave({ quantity: q, meal, kcal: entry.kcal * f, protein: entry.protein * f, carbs: entry.carbs == null ? null : entry.carbs * f, fat: entry.fat == null ? null : entry.fat * f });
    onClose();
  }
  return (
    <Sheet title={entry.name} onClose={onClose}>
      <div className="segmented" role="group" aria-label="Meal" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
        {MEALS.map((x) => <button key={x.key} aria-pressed={meal === x.key} onClick={() => setMeal(x.key)}>{x.label}</button>)}
      </div>
      <label className="field" htmlFor="e-qty"><span style={{ flex: "none" }}>Servings</span><input id="e-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="num" style={{ textAlign: "right", fontWeight: 600 }} /></label>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-glass" style={{ color: "var(--bad)" }} onClick={onDelete}>Delete</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={save}>Save</button>
      </div>
    </Sheet>
  );
}
