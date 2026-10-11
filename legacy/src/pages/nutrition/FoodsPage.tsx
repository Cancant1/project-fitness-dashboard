import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Archive, ArrowLeft, Bookmark, Edit3, Plus, Search, Star } from "lucide-react";
import { useAppStore } from "../../app/AppStore";
import { Button, Card, EmptyState, Field, Modal, PageHeader } from "../../components/ui";
import type { FoodDefinition } from "../../domain/types";
import { activeProfile, nowIso, uid } from "../../domain/utils";

export function FoodsPage() {
  const { snapshot, mutate } = useAppStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<FoodDefinition | "new" | null>(null);
  if (!snapshot) return null;
  const profile = activeProfile(snapshot);
  const foods = useMemo(() => snapshot.foods.filter((food) => !food.deletedAt && food.archived === archived && (!favorites || food.favorite) && (!query.trim() || `${food.name} ${food.brand || ""} ${food.category || ""}`.toLowerCase().includes(query.trim().toLowerCase()))).sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name)), [snapshot.foods, query, favorites, archived]);
  const duplicates = useMemo(() => {
    const counts = new Map<string, number>(); snapshot.foods.filter((item) => !item.deletedAt).forEach((item) => counts.set(item.name.trim().toLowerCase(), (counts.get(item.name.trim().toLowerCase()) || 0) + 1)); return counts;
  }, [snapshot.foods]);
  const savedMeals = snapshot.savedMeals.filter((item) => item.profileId === profile.id && !item.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
  const toggleFavorite = async (food: FoodDefinition) => mutate("Changed food favorite", (draft) => { const item = draft.foods.find((value) => value.id === food.id); if (item) { item.favorite = !item.favorite; item.updatedAt = nowIso(); } });
  const toggleArchive = async (food: FoodDefinition) => mutate(food.archived ? "Restored food" : "Archived food", (draft) => { const item = draft.foods.find((value) => value.id === food.id); if (item) { item.archived = !item.archived; item.updatedAt = nowIso(); } });
  const archiveMeal = async (id: string) => mutate("Archived saved meal", (draft) => { const item = draft.savedMeals.find((value) => value.id === id); if (item) { item.deletedAt = nowIso(); item.updatedAt = item.deletedAt; draft.tombstones.push({ entityType: "savedMeal", entityId: id, deletedAt: item.deletedAt, revision: item.updatedAt }); } });
  const save = async (form: HTMLFormElement) => {
    const currentEditing = editing;
    if (!currentEditing) return;
    const data = new FormData(form); const name = String(data.get("name") || "").trim(); if (!name) return; const stamp = nowIso();
    const values = { name, brand: String(data.get("brand") || "").trim(), category: String(data.get("category") || "").trim(), kcalPerServing: Number(data.get("kcal")) || 0, proteinPerServing: Number(data.get("protein")) || 0, carbsPerServing: data.get("carbs") === "" ? null : Number(data.get("carbs")), fatPerServing: data.get("fat") === "" ? null : Number(data.get("fat")), servings: [{ id: currentEditing === "new" ? uid("serving") : currentEditing.servings[0]?.id || uid("serving"), label: String(data.get("serving") || "serving"), amount: 1, unit: String(data.get("serving") || "serving") }] };
    await mutate(currentEditing === "new" ? "Created food" : "Updated food", (draft) => {
      if (currentEditing === "new") draft.foods.push({ id: uid("food"), createdAt: stamp, updatedAt: stamp, source: "manual", profileId: profile.id, verified: false, favorite: false, archived: false, ...values });
      else { const item = draft.foods.find((value) => value.id === currentEditing.id); if (item) Object.assign(item, values, { updatedAt: stamp }); }
    }); setEditing(null);
  };
  return <div className="page foods-page">
    <PageHeader eyebrow="Nutrition · Library" title="Food library" description="Clean food definitions with stable IDs, verified sources, and preserved historical snapshots." actions={<><Button onClick={() => navigate("/nutrition")}><ArrowLeft />Diary</Button><Button variant="primary" onClick={() => setEditing("new")}><Plus />New food</Button></>} />
    {savedMeals.length > 0 && <Card className="saved-meals-card"><div className="card-header"><div><h2>Saved meals</h2><small>Reusable bundles created from diary meal groups</small></div><Bookmark /></div><div className="saved-meal-library">{savedMeals.map((meal) => <div key={meal.id}><Bookmark /><span><strong>{meal.name}</strong><small>{meal.items.length} items · {Math.round(meal.items.reduce((sum, item) => sum + item.kcal, 0))} kcal · {Math.round(meal.items.reduce((sum, item) => sum + item.protein, 0))} g protein</small></span><Button className="small" variant="ghost" onClick={() => void archiveMeal(meal.id)}><Archive />Archive</Button></div>)}</div></Card>}
    <Card className="library-card"><div className="library-toolbar"><label className="search-field"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search food, brand, category…" /></label><Button className="small" variant={favorites ? "soft" : "default"} onClick={() => setFavorites((value) => !value)}><Star />Favorites</Button><Button className="small" variant={archived ? "soft" : "default"} onClick={() => setArchived((value) => !value)}><Archive />{archived ? "Archived" : "Current"}</Button></div>
    {foods.length ? <div className="food-library-grid">{foods.map((food) => <article key={food.id} className="food-library-item"><button className={`favorite-button ${food.favorite ? "active" : ""}`} aria-label={`${food.favorite ? "Remove" : "Add"} favorite`} onClick={() => void toggleFavorite(food)}><Star /></button><div><span className="eyebrow">{food.category || "Food"}</span><h3>{food.name}</h3><p>{food.brand || food.sourceLabel || "Custom entry"}{(duplicates.get(food.name.toLowerCase()) || 0) > 1 ? <span className="duplicate-badge">Separate source</span> : null}</p></div><div className="food-numbers"><strong>{Math.round(food.kcalPerServing)}<small> kcal</small></strong><span>{Math.round(food.proteinPerServing)}P · {Math.round(food.carbsPerServing || 0)}C · {Math.round(food.fatPerServing || 0)}F</span><small>per {food.servings[0]?.label || "serving"}</small></div><div className="food-item-actions"><Button className="small" onClick={() => setEditing(food)}><Edit3 />Edit</Button><Button className="small" variant="ghost" onClick={() => void toggleArchive(food)}><Archive />{food.archived ? "Restore" : "Archive"}</Button></div></article>)}</div> : <EmptyState icon={<Search />} title="No foods found" description="Try a different filter or create a reusable food definition." action={<Button variant="primary" onClick={() => setEditing("new")}>New food</Button>} />}</Card>
    <Modal open={!!editing} title={editing === "new" ? "New food" : "Edit food"} onClose={() => setEditing(null)}>{editing && <form onSubmit={(event) => { event.preventDefault(); void save(event.currentTarget); }}><div className="modal-body form-grid"><Field label="Food name"><input required name="name" defaultValue={editing === "new" ? "" : editing.name} /></Field><Field label="Brand"><input name="brand" defaultValue={editing === "new" ? "" : editing.brand || ""} /></Field><Field label="Category"><input name="category" defaultValue={editing === "new" ? "" : editing.category || ""} /></Field><Field label="Serving label"><input name="serving" defaultValue={editing === "new" ? "1 serving" : editing.servings[0]?.label || "1 serving"} /></Field><Field label="Calories"><input required name="kcal" type="number" min="0" step="0.1" defaultValue={editing === "new" ? "" : editing.kcalPerServing} /></Field><Field label="Protein (g)"><input required name="protein" type="number" min="0" step="0.1" defaultValue={editing === "new" ? "" : editing.proteinPerServing} /></Field><Field label="Carbs (g)"><input name="carbs" type="number" min="0" step="0.1" defaultValue={editing === "new" ? "" : editing.carbsPerServing ?? ""} /></Field><Field label="Fat (g)"><input name="fat" type="number" min="0" step="0.1" defaultValue={editing === "new" ? "" : editing.fatPerServing ?? ""} /></Field></div><div className="modal-footer"><Button type="button" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="primary">Save food</Button></div></form>}</Modal>
  </div>;
}
