import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import type { FoodEntry, Meal, SavedMeal } from "../data/types";
import { addDays, fmtLongDate, fmtNum, fmtShortDate, todayIso } from "../lib/format";
import {
  PLAN_DAY_NAME, bodyweight7d, dayTotals, foodSetupDone, hasPlanTarget, mealForHour, planDaySavedMeal, planTargetRow, servingText, sumEntries, targetFor,
  type EntryDraft
} from "../lib/nutrition";
import { Bar, Card, Label, PageHead, Pill, Ring } from "../ui/kit";
import { ChevronLeft, ChevronRight, PlusIcon } from "../ui/icons";
import { AddFoodSheet } from "./food/AddFoodSheet";
import { EntrySheet } from "./food/EntrySheet";
import { SavedMealSheet } from "./food/SavedMealSheet";
import { SetupSheet } from "./food/SetupSheet";
import { DateButton, MEALS, RemoveIcon, fmtQty, useToast } from "./food/ui";

const MAIN_MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snacks"];
const dayShort = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Food: what have I eaten vs target. Rings first, meals below, one Add button. Logs go to the day being viewed. */
export function FoodPage() {
  const { local } = useStore();
  const entries = useRows("food_entries");
  const days = useRows("nutrition_days");
  const targets = useRows("nutrition_targets");
  const foods = useRows("foods");
  const saved = useRows("saved_meals");
  const weights = useRows("body_measurements");
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
  const dayBefore = useMemo(() => entries.filter((e) => e.date === addDays(date, -1)), [entries, date]);
  const totals = dayTotals(date, entries, days);
  const target = targetFor(date, targets, bodyweight7d(weights, date));
  const setupDone = foodSetupDone(foods);
  const planTarget = hasPlanTarget(targets);
  const planDay = saved.some((s) => s.name === PLAN_DAY_NAME);
  const savedSorted = useMemo(() => [...saved].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [saved]);
  const isToday = date === today;
  const dayName = isToday ? null : dayShort.format(new Date(date + "T12:00:00")).replace(",", "");

  function goTo(d: string) {
    setDate(d > today ? today : d);
    setEditMode(false);
  }

  async function log(items: (EntryDraft | SavedMeal["items"][number])[]) {
    const time = isToday ? new Date().toTimeString().slice(0, 5) : null;
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
  const copyBefore = !mine.length && dayBefore.length > 0;

  return (
    <main className="page food">
      <PageHead eyebrow={isToday ? fmtLongDate(today) : fmtLongDate(date)} title="Food">
        <nav className="food-days" aria-label="Day">
          <button aria-label="Previous day" onClick={() => goTo(addDays(date, -1))}><ChevronLeft /></button>
          <DateButton value={date} max={today} onChange={goTo} label="Pick a day">{isToday ? "Today" : fmtShortDate(date)}</DateButton>
          <button aria-label="Next day" disabled={date >= today} onClick={() => goTo(addDays(date, 1))}><ChevronRight size={18} /></button>
        </nav>
      </PageHead>

      <div className="food-layout">
        <Card className="food-hero" aria-label="Totals">
          {totals.source === "day" && <span className="food-hero-tag"><Pill>Day total</Pill></span>}
          <div className="food-rings">
            <div className="food-ring">
              <Ring value={target ? totals.protein / target.protein : 0} size={136} stroke={12} color="var(--chart-1)" label="Protein">
                <span className="k-num food-ring-v">{fmtNum(totals.protein, 0)}</span>
                <span className="k-muted food-ring-l">{target ? `of ${fmtNum(target.protein, 0)} g` : "g"}</span>
              </Ring>
              <span className="food-ring-cap">
                Protein
                {target?.proteinPerKg && target.bodyweightKg
                  ? <small>{fmtNum(target.proteinPerKg, 1)} g/kg × {fmtNum(target.bodyweightKg, 1)}</small>
                  : target && <Left value={totals.protein} target={target.protein} unit="g" />}
              </span>
            </div>
            <div className="food-ring">
              <Ring value={target ? totals.kcal / target.kcal : 0} size={136} stroke={12} color="var(--warm)" label="Energy">
                <span className="k-num food-ring-v">{fmtNum(totals.kcal, 0)}</span>
                <span className="k-muted food-ring-l">{target ? `of ${fmtNum(target.kcal, 0)}` : "kcal"}</span>
              </Ring>
              <span className="food-ring-cap">
                Energy
                {target && <Left value={totals.kcal} target={target.kcal} unit="kcal" />}
              </span>
            </div>
          </div>
          <div className="food-macros">
            <Macro label="Carbs" value={totals.carbs} target={target?.carbs ?? null} />
            <Macro label="Fat" value={totals.fat} target={target?.fat ?? null} />
          </div>
        </Card>

        <aside className="food-side">
          <button className="btn btn-primary food-add-main" onClick={() => setAdding(mealForHour(new Date().getHours()))}>
            <PlusIcon /> {dayName ? `Add to ${dayName}` : "Add food"}
          </button>

          <section>
            <Label action={<Link to="/food/library">Foods</Link>}>Quick log</Label>
            {(savedSorted.length > 0 || copyBefore) && (
              <div className="food-chips">
                {copyBefore && (
                  <button className="copy" onClick={() => void logWithUndo(dayBefore, `Copied ${dayBefore.length} items`)}>
                    {isToday ? "Copy yesterday" : "Copy day before"}
                  </button>
                )}
                {savedSorted.map((s) => (
                  <button key={s.id} onClick={() => setOpenSaved(s)}>
                    {s.name}<small>{fmtNum(sumEntries(s.items).kcal, 0)}</small>
                  </button>
                ))}
              </div>
            )}
          </section>

          {(!setupDone || !planTarget || !planDay) && (
            <Card pad={false} className="food-setup k-rows">
              {!setupDone && (
                <div className="k-row">
                  <span className="k-row-main"><span>Food list</span><span>Not reviewed yet</span></span>
                  <button className="btn btn-tinted btn-sm" onClick={() => setSetupOpen(true)}>Review</button>
                </div>
              )}
              {(!planTarget || !planDay) && (
                <div className="k-row">
                  <span className="k-row-main">
                    <span>{planTarget ? "Plan usual day" : "Plan targets"}</span>
                    <span className="num">{!planTarget ? `2,800 kcal · 2 g/kg${!planDay ? " · usual day" : ""}` : "About 1,700 kcal"}</span>
                  </span>
                  <button className="btn btn-tinted btn-sm" onClick={() => void addPlanSetup()}>Add</button>
                </div>
              )}
            </Card>
          )}
        </aside>

        <section className="food-meals" aria-label="Meals">
          <Label action={mine.length > 0 ? (
            <button className="food-label-btn" aria-pressed={removing} onClick={() => setEditMode(!removing)}>{removing ? "Done" : "Edit"}</button>
          ) : undefined}>{dayName ?? "Meals"}</Label>

          {visibleMeals.map(({ key, label }) => {
            const items = mine.filter((e) => (e.meal ?? "other") === key);
            const sum = sumEntries(items);
            return (
              <Card pad={false} key={key} className={`food-meal ${items.length ? "" : "empty"}`}>
                <div className="food-meal-head">
                  <h2>{label}</h2>
                  {items.length > 0 && <span className="food-meal-total"><b>{fmtNum(sum.kcal, 0)}</b> kcal · <span className="num">{fmtNum(sum.protein, 0)}</span> g</span>}
                  {!removing && <button className="food-icon-btn add" aria-label={`Add to ${label}`} onClick={() => setAdding(key)}><PlusIcon /></button>}
                </div>
                {items.length > 0 && (
                  <div className="food-meal-rows">
                    {items.map((e) => (
                      <div className="food-item" key={e.id}>
                        {removing && (
                          <button className="food-icon-btn danger" aria-label={`Remove ${e.name}`} onClick={() => void remove([e])}><RemoveIcon /></button>
                        )}
                        <button className="food-entry" onClick={() => setEditing(e)}>
                          <span className="food-entry-name">{e.name}</span>
                          <span className="food-entry-qty">{e.quantity !== 1 ? `${fmtQty(e.quantity)} × ` : ""}{servingText(e.serving_label)}</span>
                          <span className="food-entry-kcal">{fmtNum(e.kcal, 0)}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </section>
      </div>

      {adding && (
        <AddFoodSheet meal={adding} day={dayName} foods={foods} entries={entries} onClose={closeAdd} onAdd={async (items) => { await log(items); }} />
      )}
      {editing && (
        <EntrySheet entry={editing} onClose={closeEdit}
          onSave={(patch) => void local.save("food_entries", { ...patch, id: editing.id })}
          onRemove={() => void remove([editing])} />
      )}
      {openSaved && (
        <SavedMealSheet meal={openSaved} day={dayName} onClose={closeSaved}
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

/** "412 left" / "120 over" under a ring. */
function Left({ value, target, unit }: { value: number; target: number; unit: string }) {
  const left = target - value;
  return <small className={left < 0 ? "over" : ""}>{left >= 0 ? `${fmtNum(left, 0)} ${unit} left` : `${fmtNum(-left, 0)} ${unit} over`}</small>;
}

function Macro({ label, value, target }: { label: string; value: number | null; target: number | null }) {
  return (
    <div className="food-macro">
      <span className="food-macro-top">
        <span>{label}</span>
        <span><b>{value == null ? "—" : fmtNum(value, 0)}</b>{target ? ` / ${fmtNum(target, 0)}` : ""} g</span>
      </span>
      <Bar value={target && value ? value / target : 0} color={target && value && value > target ? "var(--warm)" : "var(--chart-3)"} height={5} />
    </div>
  );
}
