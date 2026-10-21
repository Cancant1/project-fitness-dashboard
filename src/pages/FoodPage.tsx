import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToday } from "../lib/useToday";
import { suggestFoods } from "../lib/suggest";
import { Link } from "react-router-dom";
import { useRows, useStore } from "../data/store";
import type { FoodEntry, Meal, SavedMeal } from "../data/types";
import { addDays, fmtLongDate, fmtNum, fmtShortDate, todayIso } from "../lib/format";
import {
  PLAN_DAY_NAME, bodyweight7d, dayTotals, entryFromFood, foodSetupDone, hasPlanTarget, mealForHour, planTargetRow, servingText, sumEntries, targetFor,
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
  const today = useToday();
  const [date, setDate] = useState(today);
  // Viewing today when the date rolls over (app resumed the next morning): follow it to the new today.
  const shownToday = useRef(today);
  useEffect(() => {
    if (shownToday.current === today) return;
    setDate((d) => (d === shownToday.current ? today : d));
    shownToday.current = today;
  }, [today]);
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
  const savedSorted = useMemo(() => saved.filter((s) => s.name !== PLAN_DAY_NAME).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [saved]);
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

  async function addPlanTarget() {
    const id = (await local.save("nutrition_targets", planTargetRow()))[0]!.id;
    toast.show("Added plan targets", () => void local.remove("nutrition_targets", [id]));
  }

  const suggestions = useMemo(() => (isToday && target && totals.source !== "day"
    ? suggestFoods({ foods, entries, today, left: {
      kcal: target.kcal - totals.kcal, protein: target.protein - totals.protein,
      carbs: target.carbs != null && totals.carbs != null ? target.carbs - totals.carbs : target.carbs,
      fat: target.fat != null && totals.fat != null ? target.fat - totals.fat : target.fat
    } })
    : []), [isToday, target, totals.kcal, totals.protein, totals.carbs, totals.fat, totals.source, foods, entries, today]);

  async function addSuggestion(food: (typeof foods)[number], quantity: number) {
    const rows = await log([entryFromFood(food, quantity, mealForHour(new Date().getHours()))]);
    toast.show(`Logged ${food.name}`, () => void local.remove("food_entries", rows.map((r) => r.id)));
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

          {suggestions.length > 0 && target && (
            <section aria-label="Fits what's left">
              <Label action={<span className="food-left-k"><b>{fmtNum(target.kcal - totals.kcal, 0)}</b> kcal left</span>}>Fits what's left</Label>
              <Card pad={false} className="food-suggest">
                {suggestions.map((x) => (
                  <div className="food-sg" key={x.food.id}>
                    <span className="food-sg-main">
                      <span className="food-sg-name">{x.quantity !== 1 ? `${fmtQty(x.quantity)} × ` : ""}{x.food.name}</span>
                      <MacroLine p={x.protein} c={x.carbs} f={x.fat} />
                    </span>
                    <span className="food-entry-kcal">{fmtNum(x.kcal, 0)}</span>
                    <button className="food-icon-btn add" aria-label={`Log ${x.food.name}`} onClick={() => void addSuggestion(x.food, x.quantity)}><PlusIcon /></button>
                  </div>
                ))}
              </Card>
            </section>
          )}

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

          {(!setupDone || !planTarget) && (
            <Card pad={false} className="food-setup k-rows">
              {!setupDone && (
                <div className="k-row">
                  <span className="k-row-main"><span>Food list</span><span>Not reviewed yet</span></span>
                  <button className="btn btn-tinted btn-sm" onClick={() => setSetupOpen(true)}>Review</button>
                </div>
              )}
              {!planTarget && (
                <div className="k-row">
                  <span className="k-row-main">
                    <span>Plan targets</span>
                    <span className="num">2,800 kcal · 2 g/kg</span>
                  </span>
                  <button className="btn btn-tinted btn-sm" onClick={() => void addPlanTarget()}>Add</button>
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
                  {items.length > 0 && (
                    <span className="food-meal-total"><span><b>{fmtNum(sum.kcal, 0)}</b> kcal</span><MacroLine p={sum.protein} c={sum.carbs} f={sum.fat} /></span>
                  )}
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
                          <span className="food-entry-main">
                            <span className="food-entry-name">{e.name}</span>
                            <span className="food-entry-sub">
                              {(e.quantity !== 1 || !plainServing(e.serving_label)) && (
                                <span className="food-entry-qty">{e.quantity !== 1 ? `${fmtQty(e.quantity)} × ` : ""}{servingText(e.serving_label)}</span>
                              )}
                              <MacroLine p={e.protein} c={e.carbs} f={e.fat} />
                            </span>
                          </span>
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
        <AddFoodSheet meal={adding} day={dayName} today={today} foods={foods} entries={entries} onClose={closeAdd} onAdd={async (items) => { await log(items); }} />
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
      {target != null && value != null && <Left value={value} target={target} unit="g" />}
    </div>
  );
}

/** "1 serving" says nothing: only a real serving ("pot (450 g)") or a quantity other than 1 is shown. */
const plainServing = (label: string | null) => !label || /^(1\s*)?serving$/i.test(label.trim());

/** "45 P · 21 C · 1 F": protein, carbs, fat in grams; untracked ones are left out. */
function MacroLine({ p, c, f }: { p: number; c: number | null; f: number | null }) {
  const parts: [number, string][] = [[p, "P"], ...(c != null ? [[c, "C"] as [number, string]] : []), ...(f != null ? [[f, "F"] as [number, string]] : [])];
  return (
    <span className="food-mline" aria-label={`Protein ${fmtNum(p, 0)} g${c != null ? `, carbs ${fmtNum(c, 0)} g` : ""}${f != null ? `, fat ${fmtNum(f, 0)} g` : ""}`}>
      {parts.map(([v, k]) => <span key={k}>{fmtNum(v, 0)}<i>{k}</i></span>)}
    </span>
  );
}
