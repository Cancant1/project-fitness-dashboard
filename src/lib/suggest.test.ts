import type { Food, FoodEntry } from "../data/types";
import { suggestFoods } from "./suggest";

const base = { user_id: "u", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", deleted_at: null };
const food = (id: string, kcal: number, protein: number, carbs: number | null, fat: number | null, over: Partial<Food> = {}): Food => ({
  ...base, id, name: id, brand: null, category: null, servings: [{ id: "serving-1", label: "serving", amount: 1, unit: "serving" }],
  kcal, protein, carbs, fat, favorite: false, archived: false, source: "label", legacy_ref: {}, ...over
});
let n = 0;
const ate = (f: Food, date = "2026-10-10"): FoodEntry => ({
  ...base, id: `e${++n}`, date, time: null, meal: "snacks", food_id: f.id, name: f.name, serving_label: null, quantity: 1,
  kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, note: null, legacy_ref: {}
});

const kwark = food("kwark", 270, 45, 20.7, 0.9, { servings: [{ id: "serving-1", label: "pot (450 g)", amount: 1, unit: "serving", grams: 450 }] });
const banana = food("banana", 105, 1.3, 27, 0.4);
const nuts = food("nuts", 160, 5, 3, 14);
const burger = food("burger", 807, 54.5, 47.8, 43.9);
const shake = food("shake", 114, 22, 2.6, 1.7);
const never = food("never", 100, 30, 1, 0); // never logged, not a favourite
const foods = [kwark, banana, nuts, burger, shake, never];
const history = [kwark, banana, nuts, burger, shake].map((f) => ate(f));

describe("suggestFoods: fits what's left", () => {
  it("protein short: protein-dense foods he eats, never one that blows the kcal left", () => {
    const s = suggestFoods({ foods, entries: history, today: "2026-10-12", left: { kcal: 600, protein: 50, carbs: 100, fat: 20 } });
    expect(s[0]!.food.id).toBe("kwark");
    expect(s.map((x) => x.food.id)).not.toContain("burger");
    expect(s.map((x) => x.food.id)).toContain("never"); // in his list and protein-dense: in the pool even if never logged
  });
  it("protein met, fat over, carbs left (his 12 Oct evening): carbs, not nuts", () => {
    const s = suggestFoods({ foods, entries: [...history, ate(kwark, "2026-10-12"), ate(burger, "2026-10-12")], today: "2026-10-12", left: { kcal: 326, protein: -36, carbs: 66, fat: -5 } });
    expect(s[0]!.food.id).toBe("banana");
    expect(s.findIndex((x) => x.food.id === "nuts")).not.toBe(0);
  });
  it("only carbs left: a handful of candy from his list (even unlogged), never a protein tub or a fat-heavy food", () => {
    const winegum = food("winegum", 16.3, 0.2, 3.8, 0, { favorite: true });
    const zure = food("zure auto", 17, 0, 4.3, 0); // in his list, never logged
    const skyr2 = food("skyr arla", 319, 39, 37, 0);
    const s = suggestFoods({ foods: [...foods, winegum, zure, skyr2], entries: [...history, ate(winegum, "2026-10-12")], today: "2026-10-12",
      left: { kcal: 326, protein: -36, carbs: 66, fat: -5 } });
    const ids = s.map((x) => x.food.id);
    expect(ids[0]).toBe("winegum");
    expect(s[0]!.quantity).toBe(9); // ≈150 kcal, not one 16 kcal piece
    expect(ids).toContain("zure auto");
    expect(ids).not.toContain("kwark");
    expect(ids).not.toContain("skyr arla");
    expect(ids).not.toContain("nuts");
  });
  it("variety: one of a kind, and identical foods under two names count once", () => {
    const a = food("Skyr Arla Vanille", 319, 39, 37, 0, { favorite: true });
    const b = food("Skyr 500ml", 310, 55, 20, 0.5, { favorite: true });
    const lolly1 = food("Fruitijs sticks citroen", 57, 0, 14.3, 0);
    const lolly2 = food("Jumbo Fruitstick Citroen", 57, 0, 14.3, 0);
    const p = suggestFoods({ foods: [a, b, kwark], entries: [ate(kwark)], today: "2026-10-12", left: { kcal: 900, protein: 50, carbs: 120, fat: 30 } });
    expect(p.filter((x) => x.food.name.startsWith("Skyr"))).toHaveLength(1);
    const c = suggestFoods({ foods: [lolly1, lolly2], entries: [], today: "2026-10-12", left: { kcal: 300, protein: -10, carbs: 60, fat: 0 } });
    expect(c).toHaveLength(1);
  });
  it("a half serving when a whole one runs over; nothing once the day is done", () => {
    const s = suggestFoods({ foods: [kwark], entries: [ate(kwark)], today: "2026-10-12", left: { kcal: 150, protein: 30, carbs: null, fat: null } });
    expect(s[0]).toMatchObject({ quantity: 0.5, kcal: 135, protein: 22.5 });
    expect(suggestFoods({ foods, entries: history, today: "2026-10-12", left: { kcal: 50, protein: 10, carbs: 10, fat: 5 } })).toEqual([]);
  });
});
