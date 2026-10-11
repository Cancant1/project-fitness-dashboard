import type { Base, Food, FoodEntry, Meal, NutritionDay, NutritionTarget, SavedMeal } from "../data/types";
import { parseDecimal } from "./format";

// Pure food logic: day totals, targets, ranking, and the one-time "set up your food list" proposal.
// Food entries store totals (macros already multiplied by quantity); foods store one serving.

export type NewFood = Omit<Food, keyof Base>;
export type EntryDraft = Omit<FoodEntry, keyof Base | "date" | "time" | "legacy_ref">;
export type SavedMealDraft = Omit<SavedMeal, keyof Base>;

// ------------------------------------------------------------------ day totals and targets

export interface DayTotals { kcal: number; protein: number; carbs: number | null; fat: number | null; source: "items" | "day" | "none" }

/** Item-level entries win; a typed-in day total (old workbook/app overrides) is the fallback. */
export function dayTotals(date: string, entries: FoodEntry[], days: NutritionDay[]): DayTotals {
  const items = entries.filter((e) => e.date === date);
  if (items.length) return { ...sumEntries(items), source: "items" };
  const day = days.find((d) => d.date === date);
  if (day && (day.kcal != null || day.protein != null)) return { kcal: day.kcal ?? 0, protein: day.protein ?? 0, carbs: day.carbs, fat: day.fat, source: "day" };
  return { kcal: 0, protein: 0, carbs: null, fat: null, source: "none" };
}

/** Sum of entries. Carbs/fat stay null when no entry tracks them. */
export function sumEntries(items: Pick<FoodEntry, "kcal" | "protein" | "carbs" | "fat">[]): { kcal: number; protein: number; carbs: number | null; fat: number | null } {
  const sum = (k: "carbs" | "fat") => (items.some((i) => i[k] != null) ? items.reduce((s, i) => s + (i[k] ?? 0), 0) : null);
  return { kcal: items.reduce((s, i) => s + i.kcal, 0), protein: items.reduce((s, i) => s + i.protein, 0), carbs: sum("carbs"), fat: sum("fat") };
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface DayTarget { kcal: number; protein: number; carbs: number | null; fat: number | null; phase: string | null }

/** Target in force on a date (latest effective_from ≤ date), with a per-weekday kcal/protein override if set. */
export function targetFor(date: string, targets: NutritionTarget[]): DayTarget | null {
  const t = targets.filter((x) => x.effective_from <= date).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  if (!t) return null;
  const wd = WEEKDAYS[new Date(date + "T12:00:00").getDay()]!;
  const o = t.per_weekday?.[wd];
  return { kcal: o?.kcal ?? t.kcal, protein: o?.protein ?? t.protein, carbs: t.carbs || null, fat: t.fat || null, phase: t.phase };
}

// ------------------------------------------------------------------ small helpers

/** Lower case, no accents, punctuation as spaces: "Brocolli (100g)" → "brocolli 100g", "Snackie:" → "snackie". */
export function normName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** "serving" (the old app's default) reads as "1 serving". */
export function servingText(label: string | null | undefined): string {
  const l = (label ?? "").trim();
  return !l || l.toLowerCase() === "serving" ? "1 serving" : l;
}

export const servingOf = (f: Pick<Food, "servings">): string => servingText(f.servings[0]?.label);

/** Meal that fits the clock: breakfast before 11, lunch before 15, dinner 17–21, snacks otherwise. */
export function mealForHour(hour: number): Meal {
  return hour < 11 ? "breakfast" : hour < 15 ? "lunch" : hour < 17 ? "snacks" : hour < 21 ? "dinner" : "snacks";
}

/** Quantity stepper on a 0.5 grid, never below 0.5. */
export function stepQuantity(q: number, delta: number): number {
  return Math.max(0.5, Math.round((q + delta) * 2) / 2);
}

/** A diary entry for `quantity` servings of a food. */
export function entryFromFood(food: Food, quantity: number, meal: Meal): EntryDraft {
  const x = (v: number | null) => (v == null ? null : round1(v * quantity));
  return {
    meal, food_id: food.id, name: food.name, serving_label: servingOf(food), quantity,
    kcal: round1(food.kcal * quantity), protein: round1(food.protein * quantity), carbs: x(food.carbs), fat: x(food.fat), note: null
  };
}

/** New quantity for an entry: macros scale with it (entries hold totals). */
export function rescaleEntry(entry: Pick<FoodEntry, "quantity" | "kcal" | "protein" | "carbs" | "fat">, quantity: number) {
  const f = entry.quantity > 0 ? quantity / entry.quantity : quantity;
  const x = (v: number | null) => (v == null ? null : round1(v * f));
  return { quantity, kcal: round1(entry.kcal * f), protein: round1(entry.protein * f), carbs: x(entry.carbs), fat: x(entry.fat) };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// ------------------------------------------------------------------ ranking

export type AddGroup = "favorite" | "recent" | "all";

/** Last date each food was eaten: by food_id, or by name for entries the old app logged without one. */
export function lastUsedByFood(foods: Food[], entries: FoodEntry[]): Map<string, string> {
  const byName = new Map<string, string>();
  for (const f of foods) if (!f.archived && !byName.has(normName(f.name))) byName.set(normName(f.name), f.id);
  const last = new Map<string, string>();
  for (const e of entries) {
    const id = e.food_id ?? byName.get(normName(e.name));
    if (id && (last.get(id) ?? "") < e.date) last.set(id, e.date);
  }
  return last;
}

function matches(f: Food, needle: string): boolean {
  return !needle || normName(`${f.name} ${f.brand ?? ""} ${f.category ?? ""}`).includes(needle);
}

/** Foods for the Add sheet: favourites, then the most recent, then the rest A–Z. Archived foods never show. */
export function rankFoodsForAdd(foods: Food[], entries: FoodEntry[], query: string, recentCount = 8): { food: Food; group: AddGroup }[] {
  const needle = normName(query);
  const last = lastUsedByFood(foods, entries);
  const live = foods.filter((f) => !f.archived && matches(f, needle));
  const az = (a: Food, b: Food) => a.name.localeCompare(b.name, "nl", { sensitivity: "base" });
  const favs = live.filter((f) => f.favorite).sort(az);
  const recent = live.filter((f) => !f.favorite && last.has(f.id))
    .sort((a, b) => last.get(b.id)!.localeCompare(last.get(a.id)!) || az(a, b))
    .slice(0, needle ? Infinity : recentCount);
  const used = new Set([...favs, ...recent].map((f) => f.id));
  const rest = live.filter((f) => !used.has(f.id)).sort(az);
  return [
    ...favs.map((food) => ({ food, group: "favorite" as const })),
    ...recent.map((food) => ({ food, group: "recent" as const })),
    ...rest.map((food) => ({ food, group: "all" as const }))
  ];
}

/** Food library: favourites first, then A–Z; either the foods in use or the removed (archived) ones. */
export function libraryList(foods: Food[], query: string, removed: boolean): Food[] {
  const needle = normName(query);
  return foods
    .filter((f) => f.archived === removed && matches(f, needle))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, "nl", { sensitivity: "base" }));
}

// ------------------------------------------------------------------ food form

export interface FoodForm { name: string; brand: string; serving: string; kcal: string; protein: string; carbs: string; fat: string }

/** Validates the Add/Edit food form. Accepts Dutch decimal commas. Carbs and fat may stay empty. */
export function parseFoodForm(form: FoodForm): { ok: true; value: Pick<Food, "name" | "brand" | "kcal" | "protein" | "carbs" | "fat"> & { serving: string } } | { ok: false; error: string } {
  const name = form.name.trim();
  if (!name) return { ok: false, error: "Give it a name." };
  const kcal = parseDecimal(form.kcal);
  if (kcal == null || kcal < 0) return { ok: false, error: "Enter the kcal for one serving." };
  const protein = parseDecimal(form.protein);
  if (protein == null || protein < 0) return { ok: false, error: "Enter the protein for one serving." };
  const opt = (s: string) => (s.trim() ? parseDecimal(s) : null);
  const carbs = opt(form.carbs);
  const fat = opt(form.fat);
  if ((form.carbs.trim() && (carbs == null || carbs < 0)) || (form.fat.trim() && (fat == null || fat < 0))) return { ok: false, error: "Carbs and fat must be numbers, or leave them empty." };
  return { ok: true, value: { name, brand: form.brand.trim() || null, serving: form.serving.trim() || "1 serving", kcal, protein, carbs, fat } };
}

export function newFood(v: Pick<Food, "name" | "brand" | "kcal" | "protein" | "carbs" | "fat"> & { serving: string; source?: string; category?: string | null; favorite?: boolean; legacy_ref?: Record<string, unknown> }): NewFood {
  return {
    name: v.name, brand: v.brand, category: v.category ?? null,
    servings: [{ id: "serving-1", label: v.serving, amount: 1, unit: "serving" }],
    kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat,
    favorite: v.favorite ?? false, archived: false, source: v.source ?? "custom", legacy_ref: v.legacy_ref ?? {}
  };
}

// ------------------------------------------------------------------ the plan's food

export interface PlanFoodSpec {
  key: string;
  name: string;
  brand: string | null;
  serving: string;
  kcal: number; protein: number; carbs: number; fat: number;
  /** "plan" = numbers straight from the plan's text; "plan-estimate" = split from a combined line or typical values. */
  source: "plan" | "plan-estimate";
  note: string;
  /** Normalised names of existing foods that are the same thing. */
  matches: string[];
  /** Where it sits in the plan's usual day. */
  usual: { meal: Meal; quantity: number }[];
}

// "Your day" in docs/plan/Strength_Return_Plan.md. Combined lines are split:
//  breakfast 470 kcal / 49 g = skyr 365 / 47.5 + banana 105 / 1.3;
//  lunch 558 / 46 = AH sausage roll 328 / 6.4 (AH label 88 g) + magere kwark 500 g 230 / 39.6;
//  evening 235 / 6 = 25 g nuts 160 / 5.5 + a piece of fruit (pear 80 / 0.5).
export const PLAN_FOODS: PlanFoodSpec[] = [
  { key: "skyr", name: "Jumbo Skyr vanille 500 ml", brand: "Jumbo", serving: "1 tub (500 ml)", kcal: 365, protein: 47.5, carbs: 41.5, fat: 1, source: "plan", note: "Jumbo label.", matches: ["skyr 500ml vanille", "jumbo skyr vanille 500 ml", "jumbo skyr vanille 500ml"], usual: [{ meal: "breakfast", quantity: 1 }] },
  { key: "banana", name: "Banaan", brand: null, serving: "1 medium", kcal: 105, protein: 1.3, carbs: 27, fat: 0.4, source: "plan-estimate", note: "Split from the plan's breakfast line.", matches: ["banaan", "banana"], usual: [{ meal: "breakfast", quantity: 1 }] },
  { key: "sausage-roll", name: "AH saucijzenbroodje", brand: "AH", serving: "1 roll (88 g)", kcal: 328, protein: 6.4, carbs: 25.5, fat: 22, source: "plan", note: "AH label: 373 kcal, 7.3 g protein, 25 g fat per 100 g.", matches: ["ah saucijzenbroodje", "saucijzenbroodje", "ah sausage roll"], usual: [{ meal: "lunch", quantity: 1 }] },
  { key: "kwark", name: "Magere kwark", brand: null, serving: "500 g", kcal: 230, protein: 39.6, carbs: 17.5, fat: 1, source: "plan-estimate", note: "Split from the plan's lunch line. Check your tub.", matches: ["magere kwark", "magere kwark 500 g", "magere kwark 500g"], usual: [{ meal: "lunch", quantity: 1 }] },
  { key: "apple", name: "Appel", brand: null, serving: "1 medium", kcal: 80, protein: 0.3, carbs: 19, fat: 0.2, source: "plan", note: "Typical values.", matches: ["appel", "apple"], usual: [{ meal: "snacks", quantity: 1 }] },
  { key: "pear", name: "Peer", brand: null, serving: "1 medium", kcal: 80, protein: 0.5, carbs: 19, fat: 0.2, source: "plan-estimate", note: "Typical values for a medium pear.", matches: ["peer", "pear"], usual: [{ meal: "snacks", quantity: 1 }] },
  { key: "winegums", name: "Winegums", brand: null, serving: "Handful (40 g)", kcal: 135, protein: 2, carbs: 30, fat: 0.1, source: "plan", note: "Typical values. Check the pack.", matches: ["winegums", "wine gums", "winegums 40 g"], usual: [{ meal: "snacks", quantity: 1 }] },
  { key: "shake", name: "Bulk shake chocolade", brand: "Bulk", serving: "1 scoop in water", kcal: 114, protein: 22, carbs: 2.6, fat: 1.7, source: "plan", note: "Bulk label. The plan's shake is 2 scoops.", matches: ["shake bulk chocolade 1 sc", "bulk shake chocolade", "shake bulk chocolade"], usual: [{ meal: "snacks", quantity: 2 }] },
  { key: "nuts", name: "Ongezouten noten met walnoten", brand: null, serving: "25 g", kcal: 160, protein: 5.5, carbs: 4, fat: 14, source: "plan-estimate", note: "Split from the plan's 'nuts + fruit' line. Typical values.", matches: ["ongezouten noten met walnoten", "ongezouten noten", "unsalted nuts"], usual: [{ meal: "snacks", quantity: 1 }] }
];

/** Foods already in the library that fit the plan's dinner rule (chicken, eggs, legumes, rice, potatoes, vegetables) or fruit. */
export const PLAN_EXTRAS: { match: string; reason: string }[] = [
  { match: "kip 100g", reason: "Dinner protein in the plan" },
  { match: "ei 1", reason: "Eggs: a dinner protein in the plan" },
  { match: "witte bonen in tomatensaus 100g", reason: "Legumes: a dinner protein in the plan" },
  { match: "witte rijst 100g", reason: "Rice for dinner" },
  { match: "aardappelen kruimig 100g", reason: "Potatoes for dinner" },
  { match: "brocolli 100g", reason: "Vegetables for dinner" },
  { match: "kiwi", reason: "Fruit" },
  { match: "mandarijn", reason: "Fruit" }
];

export const PLAN_TARGET_FROM = "2026-10-12";
export const PLAN_DAY_NAME = "Plan: usual day";

export function hasPlanTarget(targets: NutritionTarget[]): boolean {
  return targets.some((t) => t.effective_from === PLAN_TARGET_FROM);
}

export function planTargetRow(): Omit<NutritionTarget, keyof Base> {
  return { effective_from: PLAN_TARGET_FROM, phase: "lean bulk", kcal: 2800, protein: 180, carbs: 310, fat: 80, per_weekday: null, target_weight: 77, note: "Strength Return Plan" };
}

/** The plan's usual day (everything but dinner) as one saved meal; uses your foods where they exist. */
export function planDaySavedMeal(foods: Food[]): SavedMealDraft {
  const live = foods.filter((f) => !f.archived);
  const items: SavedMeal["items"] = [];
  for (const spec of PLAN_FOODS) {
    const food = findByNames(live, spec.matches) ?? findByNames(live, [normName(spec.name)]);
    for (const u of spec.usual) {
      const base = food ? entryFromFood(food, u.quantity, u.meal) : {
        meal: u.meal, food_id: null, name: spec.name, serving_label: spec.serving, quantity: u.quantity,
        kcal: round1(spec.kcal * u.quantity), protein: round1(spec.protein * u.quantity), carbs: round1(spec.carbs * u.quantity), fat: round1(spec.fat * u.quantity), note: null
      };
      items.push({ ...base, legacy_ref: {} });
    }
  }
  return { name: PLAN_DAY_NAME, default_meal: null, position: 0, items };
}

function findByNames(foods: Food[], names: string[]): Food | undefined {
  const set = new Set(names);
  return foods.find((f) => set.has(normName(f.name)));
}

// ------------------------------------------------------------------ "set up your food list"

const DINNER_CATS = new Set(["dinner", "avondeten"]);
const DAYTIME_CATS = new Set(["ontbijt en lunch", "ontbijt", "lunch", "breakfast", "snacks", "snack", "drinks"]);

export const isDinnerCategory = (f: Pick<Food, "category">) => DINNER_CATS.has(normName(f.category ?? ""));

/**
 * Was this entry a dinner? The old app put nearly everything under "Other", so for those:
 * the food's own category decides, and for unknown foods a meal-sized item (≥ 450 kcal and ≥ 20 g protein a serving) counts.
 */
export function isDinnerEntry(e: Pick<FoodEntry, "meal" | "kcal" | "protein" | "quantity">, food?: Pick<Food, "category">): boolean {
  if (e.meal === "dinner") return true;
  if (e.meal && e.meal !== "other") return false;
  const cat = normName(food?.category ?? "");
  if (DINNER_CATS.has(cat)) return true;
  if (DAYTIME_CATS.has(cat)) return false;
  const q = e.quantity > 0 ? e.quantity : 1;
  return e.kcal / q >= 450 && e.protein / q >= 20;
}

export type SetupGroup = "plan" | "dinner" | "dinner-unlogged" | "duplicate" | "other";
export type Decision = "keep" | "archive";

export interface SetupItem {
  key: string;
  foodId: string | null;
  /** Set for foods the setup would create. */
  draft: NewFood | null;
  name: string;
  serving: string;
  kcal: number;
  protein: number;
  decision: Decision;
  group: SetupGroup;
  reason: string;
  /** Favourite it when kept (the plan's daily foods). */
  favorite: boolean;
  estimate: boolean;
  uses: number;
}

const tracked = (f: Food) => (f.carbs ?? 0) + (f.fat ?? 0) > 0;

/** One food per name: the one an entry points to, then the one with carbs/fat filled in, then a favourite, then your own over the catalog's. */
export function pickCanonical(group: Food[], referenced: Set<string>): Food {
  const score = (f: Food) => (referenced.has(f.id) ? 1000 : 0) + (tracked(f) ? 100 : 0) + (f.favorite ? 10 : 0) + (f.source !== "catalog" ? 1 : 0) + (f.archived ? -5 : 0);
  return [...group].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0]!;
}

/**
 * The proposal: keep the plan's foods (create missing ones) and every food eaten at dinner (create foods for dinner
 * entries that match nothing); archive the rest. Never deletes. Pure: the caller applies it with setupWrites.
 */
export function proposeFoodSetup(foods: Food[], entries: FoodEntry[]): SetupItem[] {
  const referenced = new Set(entries.map((e) => e.food_id).filter((x): x is string => !!x));
  const groups = new Map<string, Food[]>();
  for (const f of foods) {
    const k = normName(f.name);
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const canonical = new Map<string, Food>(); // normName → food
  const canonicalOf = new Map<string, Food>(); // food id → canonical food
  for (const [k, g] of groups) {
    const c = pickCanonical(g, referenced);
    canonical.set(k, c);
    for (const f of g) canonicalOf.set(f.id, c);
  }

  const items = new Map<string, SetupItem>(); // by key
  const fromFood = (f: Food, over: Partial<SetupItem>): SetupItem => ({
    key: f.id, foodId: f.id, draft: null, name: f.name, serving: servingOf(f), kcal: f.kcal, protein: f.protein,
    decision: "keep", group: "other", reason: "", favorite: false, estimate: f.source === "plan-estimate", uses: 0, ...over
  });

  // 1. The plan's foods.
  for (const spec of PLAN_FOODS) {
    const hit = [...spec.matches, normName(spec.name)].map((n) => canonical.get(n)).find(Boolean);
    if (hit) {
      items.set(hit.id, fromFood(hit, { group: "plan", reason: "In the plan's usual day", favorite: true }));
    } else {
      const draft = newFood({ ...spec, source: spec.source, category: "Plan", favorite: true, legacy_ref: { plan_key: spec.key, plan_note: spec.note } });
      items.set(`new:${spec.key}`, {
        key: `new:${spec.key}`, foodId: null, draft, name: spec.name, serving: spec.serving, kcal: spec.kcal, protein: spec.protein,
        decision: "keep", group: "plan", reason: `New. ${spec.note}`, favorite: true,
        estimate: spec.source === "plan-estimate", uses: 0
      });
    }
  }
  for (const x of PLAN_EXTRAS) {
    const hit = canonical.get(x.match);
    if (hit && !items.has(hit.id)) items.set(hit.id, fromFood(hit, { group: "plan", reason: x.reason }));
  }

  // 2. Dinners: foods eaten at dinner, and new foods for dinner entries that match nothing.
  const custom = foods.filter((f) => f.source !== "catalog" && f.kcal >= 100);
  const dinnerUses = new Map<string, number>();
  const drafts = new Map<string, { entry: FoodEntry; uses: number }>();
  for (const e of entries) {
    const byId = e.food_id ? foods.find((f) => f.id === e.food_id) : undefined;
    let food = byId ? canonicalOf.get(byId.id) : canonical.get(normName(e.name));
    if (!isDinnerEntry(e, food)) continue;
    const q = e.quantity > 0 ? e.quantity : 1;
    // Same kcal and protein as one of your own foods = the same dinner under another name.
    food ??= custom.find((f) => Math.abs(f.kcal - e.kcal / q) < 0.5 && Math.abs(f.protein - e.protein / q) < 0.5);
    if (food) {
      food = canonicalOf.get(food.id) ?? food;
      dinnerUses.set(food.id, (dinnerUses.get(food.id) ?? 0) + 1);
    } else {
      const k = normName(e.name);
      const prev = drafts.get(k);
      drafts.set(k, { entry: !prev || prev.entry.date <= e.date ? e : prev.entry, uses: (prev?.uses ?? 0) + 1 });
    }
  }
  for (const [id, uses] of dinnerUses) {
    const f = foods.find((x) => x.id === id)!;
    const existing = items.get(id);
    if (existing) existing.uses = uses;
    else items.set(id, fromFood(f, { group: "dinner", reason: `Eaten at dinner ${uses}×`, uses }));
  }
  for (const f of foods) {
    const c = canonicalOf.get(f.id)!;
    if (c.id === f.id && f.source !== "catalog" && isDinnerCategory(f) && !items.has(f.id)) {
      items.set(f.id, fromFood(f, { group: "dinner", reason: "Your own dinner" }));
    }
  }
  for (const [k, { entry, uses }] of drafts) {
    const q = entry.quantity > 0 ? entry.quantity : 1;
    const name = entry.name.trim().replace(/[\s:;,.-]+$/, "");
    const r = (v: number | null) => (v == null ? null : round1(v / q));
    const draft = newFood({
      name, brand: null, serving: servingText(entry.serving_label), kcal: round1(entry.kcal / q), protein: round1(entry.protein / q),
      carbs: r(entry.carbs), fat: r(entry.fat), source: "from-dinner", category: "Dinner", legacy_ref: { from_entry_id: entry.id, from_entry_date: entry.date }
    });
    items.set(`new:${k}`, {
      key: `new:${k}`, foodId: null, draft, name, serving: servingText(entry.serving_label), kcal: draft.kcal, protein: draft.protein,
      decision: "keep", group: "dinner", reason: `New, from your log (${uses}×)`, favorite: false, estimate: false, uses
    });
  }

  // 3. Everything else is archived.
  for (const f of foods) {
    if (items.has(f.id)) continue;
    const c = canonicalOf.get(f.id)!;
    if (c.id !== f.id) {
      const twinKept = items.get(c.id)?.decision === "keep";
      items.set(f.id, fromFood(f, { decision: "archive", group: "duplicate", reason: twinKept ? "Same name as one you keep" : "Same name as another food" }));
    } else if (isDinnerCategory(f)) {
      items.set(f.id, fromFood(f, { decision: "archive", group: "dinner-unlogged", reason: "Dinner, not in your 2026 log" }));
    } else {
      items.set(f.id, fromFood(f, { decision: "archive", group: "other", reason: "Not in the plan" }));
    }
  }

  const order: SetupGroup[] = ["plan", "dinner", "dinner-unlogged", "duplicate", "other"];
  const all = [...items.values()];
  const insertion = new Map(all.map((it, n) => [it.key, n]));
  return all.sort((a, b) =>
    order.indexOf(a.group) - order.indexOf(b.group) ||
    (a.group === "plan" ? insertion.get(a.key)! - insertion.get(b.key)! : 0) ||
    b.uses - a.uses ||
    a.name.localeCompare(b.name, "nl", { sensitivity: "base" }));
}

export function setupCounts(items: SetupItem[], decisions: Record<string, Decision> = {}): { keep: number; archive: number; create: number } {
  let keep = 0, archive = 0, create = 0;
  for (const i of items) {
    const d = decisions[i.key] ?? i.decision;
    if (d === "keep") { keep++; if (i.draft) create++; } else if (i.foodId) archive++;
  }
  return { keep, archive, create };
}

/**
 * Rows to write for the chosen decisions. Every existing food gets `legacy_ref.food_setup` ({ at, kept, group }),
 * which is also how the app knows the setup has run. New foods are only created when kept.
 */
export function setupWrites(items: SetupItem[], decisions: Record<string, Decision>, foods: Food[], at: string): { patches: (Partial<Food> & { id: string })[]; creates: NewFood[] } {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const patches: (Partial<Food> & { id: string })[] = [];
  const creates: NewFood[] = [];
  for (const i of items) {
    const keep = (decisions[i.key] ?? i.decision) === "keep";
    const mark = { at, kept: keep, group: i.group };
    if (i.foodId) {
      const f = byId.get(i.foodId);
      if (!f) continue;
      patches.push({ id: f.id, archived: !keep, favorite: keep && i.favorite ? true : f.favorite, legacy_ref: { ...f.legacy_ref, food_setup: mark } });
    } else if (i.draft && keep) {
      creates.push({ ...i.draft, legacy_ref: { ...i.draft.legacy_ref, food_setup: mark } });
    }
  }
  return { patches, creates };
}

/** The setup has run once any food carries its mark, or a plan food exists. */
export function foodSetupDone(foods: Food[]): boolean {
  return foods.some((f) => f.source === "plan" || f.source === "plan-estimate" || (f.legacy_ref != null && "food_setup" in f.legacy_ref));
}
