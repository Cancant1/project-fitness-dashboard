import type { Food, FoodEntry, NutritionDay, NutritionTarget } from "../data/types";
import {
  dayTotals, entryFromFood, foodSetupDone, isDinnerEntry, libraryList, mealForHour, normName, parseFoodForm, pickCanonical,
  bodyweight7d, proposeFoodSetup, rankFoodsForAdd, rescaleEntry, servingText, setupCounts, setupWrites, stepQuantity, targetFor
} from "./nutrition";

const base = { user_id: "u", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", deleted_at: null };

let n = 0;
function food(name: string, over: Partial<Food> = {}): Food {
  return {
    ...base, id: over.id ?? `f${++n}`, name, brand: null, category: null,
    servings: [{ id: "serving-1", label: "serving", amount: 1, unit: "serving" }],
    kcal: 100, protein: 10, carbs: null, fat: null, favorite: false, archived: false, source: "catalog", legacy_ref: {}, ...over
  };
}
function entry(name: string, over: Partial<FoodEntry> = {}): FoodEntry {
  return {
    ...base, id: `e${++n}`, date: "2026-09-01", time: null, meal: "other", food_id: null, name, serving_label: "serving",
    quantity: 1, kcal: 100, protein: 10, carbs: null, fat: null, note: null, legacy_ref: {}, ...over
  };
}
function target(effective_from: string, kcal: number, protein: number, over: Partial<NutritionTarget> = {}): NutritionTarget {
  return { ...base, id: `t${++n}`, effective_from, phase: null, kcal, protein, carbs: null, fat: null, per_weekday: null, target_weight: null, note: null, ...over };
}

describe("day totals", () => {
  it("sums entries and keeps carbs/fat null when untracked", () => {
    const t = dayTotals("2026-09-01", [entry("a", { kcal: 300, protein: 20 }), entry("b", { kcal: 200, protein: 5, carbs: 30 }), entry("c", { date: "2026-09-02" })], []);
    expect(t).toEqual({ kcal: 500, protein: 25, carbs: 30, fat: null, source: "items" });
  });

  it("falls back to an old day total", () => {
    const day: NutritionDay = { ...base, id: "d", date: "2026-02-01", kcal: 2500, protein: 140, carbs: null, fat: null, note: null, source: "workbook" };
    expect(dayTotals("2026-02-01", [], [day]).source).toBe("day");
    expect(dayTotals("2026-02-02", [], [day]).source).toBe("none");
  });
});

describe("targetFor", () => {
  const ts = [target("2026-09-07", 2600, 150), target("2026-10-12", 2800, 150, { carbs: 370, fat: 80, phase: "lean bulk" })];
  it("uses the latest target in force", () => {
    expect(targetFor("2026-10-11", ts)?.kcal).toBe(2600);
    expect(targetFor("2026-10-12", ts)).toMatchObject({ kcal: 2800, protein: 150, carbs: 370, fat: 80 });
    expect(targetFor("2026-01-01", ts)).toBeNull();
  });
  it("applies a weekday override and treats 0 carbs as untracked", () => {
    const t = [target("2026-01-01", 1800, 120, { carbs: 0, per_weekday: { mon: { kcal: 2000, protein: 130 } } })];
    expect(targetFor("2026-10-12", t)).toMatchObject({ kcal: 2000, protein: 130, carbs: null }); // Monday
    expect(targetFor("2026-10-13", t)?.kcal).toBe(1800);
  });
});

describe("helpers", () => {
  it("normalises names", () => {
    expect(normName("Brocolli (100g)")).toBe("brocolli 100g");
    expect(normName("  Snackie (World cup evening): ")).toBe("snackie world cup evening");
    expect(normName("Crème fraîche")).toBe("creme fraiche");
  });
  it("reads the old 'serving' label", () => {
    expect(servingText("serving")).toBe("1 serving");
    expect(servingText("1 tub (500 ml)")).toBe("1 tub (500 ml)");
  });
  it("steps quantity by halves, never below 0.5", () => {
    expect(stepQuantity(1, 0.5)).toBe(1.5);
    expect(stepQuantity(0.5, -0.5)).toBe(0.5);
    expect(stepQuantity(1.3, 0.5)).toBe(2); // snaps to the grid
  });
  it("picks a meal from the clock", () => {
    expect(mealForHour(8)).toBe("breakfast");
    expect(mealForHour(12)).toBe("lunch");
    expect(mealForHour(16)).toBe("snacks");
    expect(mealForHour(19)).toBe("dinner");
    expect(mealForHour(22)).toBe("snacks");
  });
  it("builds and rescales entries", () => {
    const f = food("Shake", { kcal: 114, protein: 22, carbs: 2.6, fat: 1.7 });
    const e = entryFromFood(f, 2, "snacks");
    expect(e).toMatchObject({ food_id: f.id, quantity: 2, kcal: 228, protein: 44, carbs: 5.2, fat: 3.4, serving_label: "1 serving" });
    expect(rescaleEntry({ ...e }, 1)).toMatchObject({ quantity: 1, kcal: 114, protein: 22, carbs: 2.6, fat: 1.7 });
    expect(rescaleEntry({ quantity: 1, kcal: 100, protein: 10, carbs: null, fat: null }, 1.5)).toMatchObject({ kcal: 150, carbs: null });
  });
});

describe("food form", () => {
  const form = { name: " Kwark ", brand: "", serving: "", kcal: "230", protein: "39,6", carbs: "", fat: "0,5" };
  it("accepts comma decimals and optional carbs", () => {
    const r = parseFoodForm(form);
    expect(r).toEqual({ ok: true, value: { name: "Kwark", brand: null, serving: "1 serving", kcal: 230, protein: 39.6, carbs: null, fat: 0.5 } });
  });
  it("rejects missing name, kcal or bad numbers", () => {
    expect(parseFoodForm({ ...form, name: "" }).ok).toBe(false);
    expect(parseFoodForm({ ...form, kcal: "" }).ok).toBe(false);
    expect(parseFoodForm({ ...form, carbs: "abc" }).ok).toBe(false);
  });
});

describe("ranking", () => {
  it("the meal's foods by times logged in the last 30 days (latest first on a tie, also matched by name), then the rest A–Z; never archived", () => {
    const foods = ["Skyr", "Kwark", "Banaan", "Appel", "Pizza", "Zz starred", "Chili"].map((n) => food(n, { id: n.toLowerCase(), favorite: n === "Zz starred" }));
    foods.push(food("Gone", { archived: true }));
    const dinner = (name: string, date: string, over: Partial<FoodEntry> = {}) => entry(name, { food_id: name.toLowerCase(), meal: "dinner", date, ...over });
    const log = [
      ...["2026-10-15", "2026-10-17", "2026-10-18"].map((d) => dinner("Pizza", d)),
      ...["2026-10-02", "2026-10-20"].map((d) => dinner("Chili", d)),
      ...["2026-10-16", "2026-10-21"].map((d) => dinner("Appel", d)),
      dinner("Skyr", "2026-10-21", { food_id: null }), // matched by name
      dinner("Gone", "2026-10-21"),
      dinner("Banaan", "2026-09-21"), // before the 30 days
      ...["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-21"].map((d) => entry("Kwark", { food_id: "kwark", meal: "breakfast", date: d }))
    ];
    const r = rankFoodsForAdd(foods, log, "", "2026-10-21", "dinner");
    expect(r.map((x) => [x.food.name, x.group])).toEqual([
      ["Pizza", "used"], ["Appel", "used"], ["Chili", "used"], ["Skyr", "used"],
      ["Banaan", "all"], ["Kwark", "all"], ["Zz starred", "all"]
    ]);
    expect(rankFoodsForAdd(foods, log, "", "2026-10-21", "breakfast")[0]).toMatchObject({ food: { name: "Kwark" }, group: "used" });
  });
  it("searches name and brand", () => {
    expect(rankFoodsForAdd([food("Skyr", { brand: "Jumbo" }), food("Kwark")], [], "jumbo", "2026-10-21", "dinner").map((x) => x.food.name)).toEqual(["Skyr"]);
  });
  it("lists the library favourites first, then A–Z, in use or removed", () => {
    const foods = [food("b"), food("a"), food("c", { favorite: true }), food("x", { archived: true })];
    expect(libraryList(foods, "", false).map((f) => f.name)).toEqual(["c", "a", "b"]);
    expect(libraryList(foods, "", true).map((f) => f.name)).toEqual(["x"]);
  });
});

describe("dinner detection", () => {
  it("uses the meal, then the food's category, then the size of the item", () => {
    expect(isDinnerEntry({ meal: "dinner", kcal: 100, protein: 1, quantity: 1 })).toBe(true);
    expect(isDinnerEntry({ meal: "lunch", kcal: 900, protein: 50, quantity: 1 })).toBe(false);
    expect(isDinnerEntry({ meal: "other", kcal: 188, protein: 7, quantity: 1 }, { category: "Avondeten" })).toBe(true);
    expect(isDinnerEntry({ meal: "other", kcal: 610, protein: 32, quantity: 1 }, { category: "Ontbijt en lunch" })).toBe(false);
    expect(isDinnerEntry({ meal: "other", kcal: 900, protein: 60, quantity: 1 })).toBe(true);
    expect(isDinnerEntry({ meal: "other", kcal: 860, protein: 4, quantity: 1 })).toBe(false); // 8 beers
    expect(isDinnerEntry({ meal: "other", kcal: 1000, protein: 50, quantity: 2 })).toBe(true); // 500 / 25 a serving
  });
});

describe("pickCanonical", () => {
  it("prefers the referenced food, then the one with carbs/fat", () => {
    const a = food("Chili", { id: "a", source: "reps", carbs: 0, fat: 0 });
    const b = food("Chili", { id: "b", carbs: 105, fat: 45 });
    expect(pickCanonical([a, b], new Set()).id).toBe("b");
    expect(pickCanonical([a, b], new Set(["a"])).id).toBe("a");
  });
});

describe("food setup proposal", () => {
  const skyr = food("Skyr 500ml vanille", { id: "skyr", kcal: 365, protein: 47.5, category: "Ontbijt en lunch" });
  const banaan = food("Banaan", { id: "banaan", kcal: 105, protein: 1.3 });
  const mars = food("Mars bar", { id: "mars", kcal: 200, protein: 2, category: "Snacks" });
  const pizza = food("Pizza (salame)", { id: "pizza", kcal: 835, protein: 32, category: "Avondeten" });
  const kapsalon = food("Kapsalon", { id: "kapsalon", kcal: 1100, protein: 42, category: "Avondeten" });
  const chiliCat = food("Chili con carne", { id: "chili-cat", kcal: 995, protein: 41.4, carbs: 105, fat: 45.4, category: "Avondeten" });
  const chiliMine = food("Chili con carne", { id: "chili-mine", kcal: 995, protein: 41.4, carbs: 0, fat: 0, category: "Dinner", source: "reps" });
  const pancake = food("Pancake: 1 + 2 bacon strips", { id: "pancake", kcal: 167, protein: 7.7, category: "Dinner", source: "reps" });
  const snacky = food("Snacky (World cup night)", { id: "snacky", kcal: 650, protein: 27, category: "Custom", source: "reps" });
  const foods = [skyr, banaan, mars, pizza, kapsalon, chiliCat, chiliMine, pancake, snacky];
  const entries = [
    entry("Pizza (salame)", { kcal: 835, protein: 32 }),
    entry("Chili con carne", { meal: "dinner", food_id: "chili-cat", kcal: 995, protein: 41.4 }),
    entry("Mars bar", { kcal: 200, protein: 2 }),
    entry("3x Pita bread with shoarma meat and veggies", { kcal: 900, protein: 60, carbs: 90, fat: 30, date: "2026-07-01" }),
    entry("3x pita bread with shoarma meat and veggies ", { kcal: 1800, protein: 120, quantity: 2, date: "2026-07-02" }),
    entry("Snackie (World cup evening):", { kcal: 650, protein: 27 }),
    entry("8 beers", { kcal: 860, protein: 4 })
  ];
  const items = proposeFoodSetup(foods, entries);
  const byKey = new Map(items.map((i) => [i.key, i]));

  it("keeps the plan's foods, reusing existing ones and creating the rest", () => {
    expect(byKey.get("skyr")).toMatchObject({ decision: "keep", group: "plan", favorite: true });
    expect(byKey.get("banaan")).toMatchObject({ decision: "keep", group: "plan" });
    const roll = byKey.get("new:sausage-roll")!;
    expect(roll.draft).toMatchObject({ name: "AH saucijzenbroodje", brand: "AH", kcal: 325.6, protein: 6.7, source: "plan", favorite: true });
    expect(byKey.get("new:kwark")!.draft).toMatchObject({ kcal: 230, protein: 39.6, source: "plan-estimate" });
    expect(byKey.has("new:skyr")).toBe(false);
    expect(byKey.has("new:banana")).toBe(false);
    for (const i of items) expect(normName(i.name)).not.toMatch(/\b(vis|zalm|tonijn|garnalen|fish|tuna|salmon|shrimp)\b/);
  });

  it("keeps foods eaten at dinner and the canonical one of duplicates", () => {
    expect(byKey.get("pizza")).toMatchObject({ decision: "keep", group: "dinner", uses: 1 });
    expect(byKey.get("chili-cat")).toMatchObject({ decision: "keep", group: "dinner" });
    expect(byKey.get("chili-mine")).toMatchObject({ decision: "archive", group: "duplicate" });
    expect(byKey.get("pancake")).toMatchObject({ decision: "keep", group: "dinner", reason: "Your own dinner" });
    expect(byKey.get("snacky")).toMatchObject({ decision: "keep", group: "dinner" }); // same kcal/protein, other name
  });

  it("creates one food per new dinner name with macros per serving", () => {
    const pita = items.filter((i) => i.group === "dinner" && i.draft);
    expect(pita).toHaveLength(1);
    expect(pita[0]!.uses).toBe(2);
    expect(pita[0]!.draft).toMatchObject({ name: "3x pita bread with shoarma meat and veggies", kcal: 900, protein: 60, source: "from-dinner", category: "Dinner" });
    expect(items.some((i) => normName(i.name) === "8 beers")).toBe(false);
  });

  it("archives everything else, with unlogged dinners in their own group", () => {
    expect(byKey.get("mars")).toMatchObject({ decision: "archive", group: "other" });
    expect(byKey.get("kapsalon")).toMatchObject({ decision: "archive", group: "dinner-unlogged" });
    expect(items.filter((i) => i.foodId).length).toBe(foods.length);
  });

  it("orders plan, dinners, then archive groups", () => {
    const groups = items.map((i) => i.group);
    expect(groups.indexOf("dinner")).toBeGreaterThan(groups.lastIndexOf("plan"));
    expect(groups.indexOf("other")).toBeGreaterThan(groups.lastIndexOf("dinner-unlogged"));
  });

  it("applies decisions: archives, keeps, creates only kept new foods, never deletes", () => {
    const decisions = { mars: "keep" as const, "new:winegums": "archive" as const };
    const counts = setupCounts(items, decisions);
    const { patches, creates } = setupWrites(items, decisions, foods, "2026-10-11T08:00:00Z");
    expect(patches).toHaveLength(foods.length);
    expect(patches.every((p) => !("deleted_at" in p))).toBe(true);
    expect(patches.find((p) => p.id === "mars")).toMatchObject({ archived: false });
    expect(patches.find((p) => p.id === "kapsalon")).toMatchObject({ archived: true });
    expect(patches.find((p) => p.id === "skyr")).toMatchObject({ archived: false, favorite: true });
    expect(creates.some((c) => c.name === "Winegums")).toBe(false);
    expect(creates.length).toBe(counts.create);
    expect(counts.keep + counts.archive).toBe(items.length - 1); // the archived new food is neither
    const after = foods.map((f) => ({ ...f, ...patches.find((p) => p.id === f.id) })) as Food[];
    expect(foodSetupDone(foods)).toBe(false);
    expect(foodSetupDone(after)).toBe(true);
  });
});

describe("protein that follows bodyweight", () => {
  const base = { id: "t", user_id: "u", created_at: "", updated_at: "", effective_from: "2026-10-12", phase: "lean bulk", kcal: 2800, protein: 150, carbs: 310, fat: 80, per_weekday: null, target_weight: 77, note: null };

  it("uses g/kg × 7-day average when set", () => {
    const t = targetFor("2026-10-20", [{ ...base, protein_per_kg: 2.0 }], 74.2)!;
    expect(t.protein).toBe(148);
    expect(t.proteinPerKg).toBe(2);
    expect(t.bodyweightKg).toBe(74.2);
  });

  it("falls back to the fixed grams without a weigh-in", () => {
    expect(targetFor("2026-10-20", [{ ...base, protein_per_kg: 2.0 }], null)!.protein).toBe(150);
  });

  it("averages the last 7 days of weigh-ins", () => {
    const m = (date: string, value: number) => ({ date, kind: "weight" as const, value, unit: "kg" as const });
    expect(bodyweight7d([m("2026-10-09", 70), m("2026-10-14", 74), m("2026-10-15", 74.4)], "2026-10-16")).toBe(74.2);
    expect(bodyweight7d([m("2026-09-30", 73.8)], "2026-10-16")).toBe(73.8);
    expect(bodyweight7d([m("2026-08-01", 73.8)], "2026-10-16")).toBeNull();
  });
});
