import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import type { FoodEntry, Meal, SavedMeal } from "../data/types";
import { addDays, fmtLongDate, fmtNum, todayIso } from "../lib/format";
import {
  PLAN_DAY_NAME, dayTotals, foodSetupDone, hasPlanTarget, mealForHour, planDaySavedMeal, planTargetRow, servingText, sumEntries, targetFor,
  type EntryDraft
} from "../lib/nutrition";
import { ChevronLeft, ChevronRight, PlusIcon } from "../ui/icons";
import { AddFoodSheet } from "./food/AddFoodSheet";
import { EntrySheet } from "./food/EntrySheet";
import { SavedMealSheet } from "./food/SavedMealSheet";
import { SetupSheet } from "./food/SetupSheet";
import { FoodStyles, MEALS, RemoveIcon, fmtQty, useToast } from "./food/ui";

const MAIN_MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snacks"];

export function FoodPage() {
  const { local } = useStore();
  const entries = useRows("food_entries");
  const days = useRows("nutrition_days");
  const targets = useRows("nutrition_targets");
  const foods = useRows("foods");
  const saved = useRows("saved_meals");
  const today = todayIso();
  const [date, setDate] = useState(today);
  const [adding, setAdding] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [openSaved, setOpenSaved] = useState<SavedMeal | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const toast = useToast();

  const closeAdd = useCallback(() => setAdding(null), []);
  const closeEdit = useCallback(() => setEditing(null), []);
  const closeSaved = useCallback(() => setOpenSaved(null), []);
  const closeSetup = useCallback(() => setSetupOpen(false), []);

  const mine = useMemo(
    () => entries.filter((e) => e.date === date).sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.created_at.localeCompare(b.created_at)),
    [entries, date]
  );
  const yesterday = useMemo(() => entries.filter((e) => e.date === addDays(date, -1)), [entries, date]);
  const totals = dayTotals(date, entries, days);
  const target = targetFor(date, targets);
  const setupDone = foodSetupDone(foods);
  const planTarget = hasPlanTarget(targets);
  const planDay = saved.some((s) => s.name === PLAN_DAY_NAME);
  const savedSorted = useMemo(() => [...saved].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [saved]);

  function goTo(d: string) {
    setDate(d);
    setEditMode(false);
  }

  async function log(items: (EntryDraft | SavedMeal["items"][number])[]) {
    const time = date === today ? new Date().toTimeString().slice(0, 5) : null;
    return local.save("food_entries", items.map(({ meal, food_id, name, serving_label, quantity, kcal, protein, carbs, fat, note }) => ({
      meal, food_id, name, serving_label, quantity, kcal, protein, carbs, fat, note, date, time, legacy_ref: {}
    })));
  }

  async function logWithUndo(items: SavedMeal["items"], what: string) {
    const rows = await log(items);
    toast.show(what, () => void local.remove("food_entries", rows.map((r) => r.id)));
  }

  async function remove(list: FoodEntry[]) {
    await local.remove("food_entries", list.map((e) => e.id));
    toast.show(list.length === 1 ? `Removed ${list[0]!.name}` : `Removed ${list.length} items`, () =>
      void local.save("food_entries", list.map((e) => ({ id: e.id, deleted_at: null }))));
  }

  async function addPlanSetup() {
    const added: string[] = [];
    let targetId: string | null = null;
    let mealId: string | null = null;
    if (!planTarget) {
      targetId = (await local.save("nutrition_targets", planTargetRow()))[0]!.id;
      added.push("targets");
    }
    if (!planDay) {
      mealId = (await local.save("saved_meals", planDaySavedMeal(foods)))[0]!.id;
      added.push("usual day");
    }
    toast.show(`Added plan ${added.join(" and ")}`, () => {
      if (targetId) void local.remove("nutrition_targets", [targetId]);
      if (mealId) void local.remove("saved_meals", [mealId]);
    });
  }

  const removing = editMode && mine.length > 0;
  const visibleMeals = MEALS.filter((m) => MAIN_MEALS.includes(m.key) || mine.some((e) => (e.meal ?? "other") === m.key));

  return (
    <main className="page">
      <FoodStyles />
      <header className="page-head">
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow">{date === today ? "Today" : fmtLongDate(date)}</p>
          <h1 className="large-title">Food</h1>
        </div>
        <nav aria-label="Day" style={{ display: "flex", gap: 6, flex: "none" }}>
          <button className="btn btn-glass btn-icon" aria-label="Previous day" onClick={() => goTo(addDays(date, -1))}><ChevronLeft /></button>
          {date !== today && <button className="btn btn-glass food-chip" onClick={() => goTo(today)}>Today</button>}
          <button className="btn btn-glass btn-icon" aria-label="Next day" disabled={date >= today} onClick={() => goTo(addDays(date, 1))}><ChevronRight /></button>
        </nav>
      </header>

      <div className="food-layout">
        <section className="card card-pad" style={{ gridArea: "totals", display: "flex", flexDirection: "column", gap: 16 }} aria-label="Totals">
          <div className="grid-2" style={{ gap: 20 }}>
            <Total label="Energy" value={totals.kcal} target={target?.kcal} unit="kcal" color="var(--fg)" />
            <Total label="Protein" value={totals.protein} target={target?.protein} unit="g" color="var(--accent)" />
          </div>
          <p className="row-sub num">
            Carbs {fmtNum(totals.carbs ?? 0, 0)}{target?.carbs ? ` / ${fmtNum(target.carbs, 0)}` : ""} g
            {" · "}Fat {fmtNum(totals.fat ?? 0, 0)}{target?.fat ? ` / ${fmtNum(target.fat, 0)}` : ""} g
            {target?.phase ? ` · ${target.phase}` : ""}
            {totals.source === "day" && " · day total from your old log"}
          </p>
        </section>

        <aside className="food-side" style={{ gridArea: "side" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary" style={{ flex: "1 1 160px" }} onClick={() => setAdding(mealForHour(new Date().getHours()))}>
              <PlusIcon /> Add food
            </button>
            <Link className="btn btn-glass food-chip" style={{ height: 50, borderRadius: 25 }} to="/food/library">Manage foods</Link>
          </div>

          {(savedSorted.length > 0 || (!mine.length && yesterday.length > 0)) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {savedSorted.map((s) => <button key={s.id} className="btn btn-glass food-chip" onClick={() => setOpenSaved(s)}>{s.name}</button>)}
              {!mine.length && yesterday.length > 0 && (
                <button className="btn btn-glass food-chip" onClick={() => void logWithUndo(yesterday, `Copied ${yesterday.length} items from yesterday`)}>
                  Copy yesterday
                </button>
              )}
            </div>
          )}

          {!setupDone && (
            <section className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 style={{ fontSize: 17, fontWeight: 600 }}>Set up your food list</h2>
              <p style={{ fontSize: 15 }} className="muted">
                Keep the plan's foods and your dinners, archive the rest. You check every item first. Nothing is deleted.
              </p>
              <button className="btn btn-tinted food-chip" style={{ alignSelf: "flex-start" }} onClick={() => setSetupOpen(true)}>Review list</button>
            </section>
          )}

          {(!planTarget || !planDay) && (
            <section className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 style={{ fontSize: 17, fontWeight: 600 }}>Plan targets</h2>
              <ul className="muted" style={{ fontSize: 15, margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {!planTarget && <li>From Mon 12 Oct 2026: 2,800 kcal and 150 g protein a day (lean bulk).</li>}
                {!planDay && <li>The plan's usual day (everything but dinner) as a saved meal, about 1,700 kcal.</li>}
              </ul>
              <button className="btn btn-tinted food-chip" style={{ alignSelf: "flex-start" }} onClick={() => void addPlanSetup()}>
                {!planTarget && !planDay ? "Add targets and usual day" : !planTarget ? "Add plan targets" : "Add usual day"}
              </button>
            </section>
          )}
        </aside>

        <div className="food-meals" style={{ gridArea: "meals" }}>
          {mine.length > 0 && (
            <div className="section-row" style={{ alignItems: "center", marginTop: -8, marginBottom: -12 }}>
              <span className="row-sub num">{mine.length} item{mine.length === 1 ? "" : "s"}</span>
              <button className="btn btn-plain btn-sm" style={{ height: 44 }} aria-pressed={removing} onClick={() => setEditMode(!removing)}>
                {removing ? "Done" : "Edit"}
              </button>
            </div>
          )}

          {visibleMeals.map(({ key, label }) => {
            const items = mine.filter((e) => (e.meal ?? "other") === key);
            const sum = sumEntries(items);
            return (
              <section className="section" key={key}>
                <div className="section-row">
                  <h2 className="section-label" style={{ margin: 0 }}>{label}</h2>
                  {items.length > 0 && <span className="row-sub num">{fmtNum(sum.kcal, 0)} kcal · {fmtNum(sum.protein, 0)} g</span>}
                </div>
                <div className="list">
                  {items.map((e) => (
                    <div className="food-item" key={e.id}>
                      {removing && (
                        <button className="food-icon-btn danger" aria-label={`Remove ${e.name}`} onClick={() => void remove([e])}><RemoveIcon /></button>
                      )}
                      <button className="food-row" onClick={() => setEditing(e)}>
                        <span className="food-row-text">
                          <span className="food-ellipsis">{e.name}</span>
                          <span className="row-sub food-ellipsis">{e.quantity !== 1 ? `${fmtQty(e.quantity)} × ` : ""}{servingText(e.serving_label)}</span>
                        </span>
                        <span className="food-row-nums num">
                          <span style={{ fontWeight: 600 }}>{fmtNum(e.kcal, 0)}</span>
                          <span className="row-sub">{fmtNum(e.protein, 1)} g</span>
                        </span>
                      </button>
                    </div>
                  ))}
                  {!removing && (
                    <div className="row">
                      <button className="food-add-row" onClick={() => setAdding(key)}><PlusIcon /> Add to {label}</button>
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          {!mine.length && totals.source === "day" && (
            <p className="muted" style={{ margin: "0 4px", fontSize: 15 }}>Only a day total was logged on this day.</p>
          )}
        </div>
      </div>

      {adding && <AddFoodSheet meal={adding} foods={foods} entries={entries} onClose={closeAdd} onAdd={async (items) => { await log(items); }} />}
      {editing && (
        <EntrySheet entry={editing} onClose={closeEdit}
          onSave={(patch) => void local.save("food_entries", { ...patch, id: editing.id })}
          onRemove={() => void remove([editing])} />
      )}
      {openSaved && (
        <SavedMealSheet meal={openSaved} onClose={closeSaved}
          onLog={(items) => void logWithUndo(items, items.length === 1 ? `Logged ${items[0]!.name}` : `Logged ${openSaved.name}`)}
          onDelete={() => {
            const s = openSaved;
            void local.remove("saved_meals", [s.id]);
            toast.show(`Deleted ${s.name}`, () => void local.save("saved_meals", { id: s.id, deleted_at: null }));
          }} />
      )}
      {setupOpen && <SetupSheet foods={foods} entries={entries} onClose={closeSetup} onApplied={(text, undo) => toast.show(text, undo)} />}
      {toast.node}
    </main>
  );
}

function Total({ label, value, target, unit, color }: { label: string; value: number; target?: number; unit: string; color: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  const left = target ? target - value : 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <span className="row-sub">{label}</span>
      <span className="num" style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1 }}>
        {fmtNum(value, 0)}<span style={{ fontSize: 15, fontWeight: 500, color: "var(--fg2)", letterSpacing: 0 }}> {unit}</span>
      </span>
      {target ? (
        <>
          <div className="bar"><span style={{ width: `${pct}%`, background: left < 0 ? "var(--warm)" : color }} /></div>
          <span className="row-sub num">
            of {fmtNum(target, 0)} · {left >= 0 ? `${fmtNum(left, 0)} left` : `${fmtNum(-left, 0)} over`}
          </span>
        </>
      ) : <span className="row-sub">No target set</span>}
    </div>
  );
}
