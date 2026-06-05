/* global React, RepsData, RepsIcons, RepsState */
const { useState: useRecipeState, useMemo: useRecipeMemo } = React;
const RI = RepsIcons;

function recipeClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function recipeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function recipeRound(value, decimals = 0) {
  const n = recipeNumber(value);
  const scale = 10 ** decimals;
  return Math.round(n * scale) / scale;
}

function recipeKcal(value) {
  return Math.round(recipeNumber(value)).toLocaleString();
}

function recipeMacro(value, decimals = 1) {
  const n = recipeRound(value, decimals);
  return Number.isInteger(n) ? String(n) : n.toFixed(decimals);
}

function recipeSlug(value) {
  return String(value || "recipe")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || `recipe-${Date.now().toString(36)}`;
}

function recipeDefaultSelections(recipe = {}) {
  const selections = { ...(recipe.selections || {}) };
  (recipe.groups || []).forEach(group => {
    if (!selections[group.id]) selections[group.id] = group.options?.[0]?.id || "";
  });
  return selections;
}

function recipeSelectedOption(group = {}, selections = {}) {
  return (group.options || []).find(option => option.id === selections[group.id]) || group.options?.[0] || null;
}

function recipeDefaultAmounts(recipe = {}, selections = {}) {
  const amounts = {};
  (recipe.groups || []).forEach(group => {
    const option = recipeSelectedOption(group, selections);
    amounts[group.id] = recipeNumber(option?.amount, 0);
  });
  return amounts;
}

function recipeOptionMacros(option = {}, amount = 0, servings = 1) {
  const factor = (recipeNumber(amount) * recipeNumber(servings, 1)) / 100;
  return {
    kcal: recipeNumber(option.kcalPer100) * factor,
    protein: recipeNumber(option.proteinPer100) * factor,
    carbs: recipeNumber(option.carbsPer100) * factor,
    fat: recipeNumber(option.fatPer100) * factor
  };
}

function calculateRecipe(recipe = {}, selections = {}, amounts = {}, servings = 1) {
  const rows = (recipe.groups || []).map(group => {
    const option = recipeSelectedOption(group, selections);
    const amount = recipeNumber(amounts[group.id], recipeNumber(option?.amount, 0));
    const macros = recipeOptionMacros(option || {}, amount, servings);
    return { group, option, amount, macros };
  }).filter(row => row.option);

  const totals = rows.reduce((sum, row) => ({
    kcal: sum.kcal + row.macros.kcal,
    protein: sum.protein + row.macros.protein,
    carbs: sum.carbs + row.macros.carbs,
    fat: sum.fat + row.macros.fat
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });

  return { rows, totals };
}

function recipeLogName(recipe = {}, rows = []) {
  const pieces = rows
    .filter(row => row.group.id === "meat" || row.group.id === "vegetable" || row.group.id === "starch")
    .map(row => row.option?.label)
    .filter(Boolean);
  return `Recipe: ${recipe.name}${pieces.length ? ` (${pieces.join(" · ")})` : ""}`;
}

function emptyRecipeTemplate() {
  return {
    id: `recipe-${Date.now().toString(36)}`,
    name: "New recipe",
    category: "Dinner",
    tags: [],
    servings: 1,
    summary: "",
    selections: {},
    groups: [
      {
        id: "main",
        label: "Main ingredient",
        inputLabel: "grams",
        options: [
          {
            id: "main-option",
            label: "Ingredient",
            item: "Ingredient",
            sourceUrl: "",
            amount: 100,
            amountUnit: "g",
            displayAmount: "100 g",
            nutritionBasis: "per 100 g",
            kcalPer100: 100,
            proteinPer100: 10,
            carbsPer100: 0,
            fatPer100: 0
          }
        ]
      }
    ],
    cooking: {
      equipment: "Electric hob",
      hobNote: RepsState.DEFAULT_HOB_PREFERENCES.note,
      steps: [
        { id: "step-1", title: "Cook", hob: "6", minutes: "10", body: "Add the cooking steps here." }
      ]
    }
  };
}

function RecipeCard({ recipe, onOpen, onEdit, onDelete }) {
  const selections = recipeDefaultSelections(recipe);
  const amounts = recipeDefaultAmounts(recipe, selections);
  const { totals, rows } = calculateRecipe(recipe, selections, amounts, recipe.servings || 1);
  const sources = rows.filter(row => row.option?.sourceUrl).length;
  return (
    <article className="recipe-card">
      <div className="recipe-card-main">
        <div>
          <div className="recipe-card-kicker">{recipe.category || "Recipe"} · {recipe.servings || 1} serving</div>
          <h2>{recipe.name}</h2>
          {recipe.summary && <p>{recipe.summary}</p>}
        </div>
        <div className="recipe-card-actions">
          <button className="btn ghost sm icon-only" type="button" title="Edit recipe" onClick={onEdit}><RI.Edit /></button>
          <button className="btn ghost sm icon-only" type="button" title="Delete recipe" onClick={onDelete}><RI.X /></button>
        </div>
      </div>
      <div className="recipe-card-macros">
        <span><strong>{recipeKcal(totals.kcal)}</strong> kcal</span>
        <span><strong>{recipeMacro(totals.protein)}</strong>g protein</span>
        <span><strong>{recipeMacro(totals.carbs)}</strong>g carbs</span>
        <span><strong>{recipeMacro(totals.fat)}</strong>g fat</span>
      </div>
      <div className="recipe-card-foot">
        <span className="mono muted">{sources} source links</span>
        <button className="btn primary sm" type="button" onClick={onOpen}><RI.Chevron /> Open</button>
      </div>
    </article>
  );
}

function RecipeModal({ recipe, onClose, onLog, onEdit }) {
  const [tab, setTab] = useRecipeState("build");
  const [date, setDate] = useRecipeState(RepsData.TODAY);
  const [servings, setServings] = useRecipeState(recipe.servings || 1);
  const [selections, setSelections] = useRecipeState(() => recipeDefaultSelections(recipe));
  const [amounts, setAmounts] = useRecipeState(() => recipeDefaultAmounts(recipe, recipeDefaultSelections(recipe)));
  const computed = useRecipeMemo(() => calculateRecipe(recipe, selections, amounts, servings), [recipe, selections, amounts, servings]);
  const hob = recipe.cooking?.hobNote || RepsState.DEFAULT_HOB_PREFERENCES.note;

  const selectOption = (group, option) => {
    setSelections(current => ({ ...current, [group.id]: option.id }));
    setAmounts(current => ({ ...current, [group.id]: recipeNumber(option.amount, current[group.id] || 0) }));
  };

  const logMeal = () => {
    const totals = computed.totals;
    onLog(date, {
      product: recipeLogName(recipe, computed.rows),
      amount: recipeNumber(servings, 1),
      kcal: Math.round(totals.kcal),
      protein: recipeRound(totals.protein, 1),
      carbs: recipeRound(totals.carbs, 1),
      fat: recipeRound(totals.fat, 1),
      recipeId: recipe.id,
      source: "recipe",
      recipeSelections: selections
    });
    onClose();
  };

  return (
    <div className="recipe-modal-backdrop" onClick={onClose}>
      <section className="recipe-modal" role="dialog" aria-modal="true" aria-label={recipe.name} onClick={e => e.stopPropagation()}>
        <div className="recipe-modal-head">
          <div>
            <span className="recipe-card-kicker">{recipe.category || "Recipe"}</span>
            <h2>{recipe.name}</h2>
          </div>
          <div className="recipe-modal-actions">
            <button className="btn ghost sm" type="button" onClick={onEdit}><RI.Edit /> Edit</button>
            <button className="btn ghost sm icon-only" type="button" title="Close" onClick={onClose}><RI.X /></button>
          </div>
        </div>

        <div className="recipe-modal-toolbar">
          <div className="recipe-tabs" role="tablist" aria-label="Recipe sections">
            {["build", "ingredients", "cook"].map(id => (
              <button key={id} className={`recipe-tab ${tab === id ? "is-on" : ""}`} type="button" onClick={() => setTab(id)}>
                {id === "build" ? "Build" : id === "ingredients" ? "Ingredients" : "Cook"}
              </button>
            ))}
          </div>
          <label className="recipe-date-control">
            <span>Date</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </label>
          <label className="recipe-serving-control">
            <span>Servings</span>
            <input type="number" min="0.25" step="0.25" value={servings} onChange={e => setServings(e.target.value)} />
          </label>
        </div>

        <div className="recipe-modal-body">
          <aside className="recipe-total-panel">
            <div className="recipe-total-number">{recipeKcal(computed.totals.kcal)}<span>kcal</span></div>
            <div className="recipe-total-grid">
              <span><strong>{recipeMacro(computed.totals.protein)}</strong>g protein</span>
              <span><strong>{recipeMacro(computed.totals.carbs)}</strong>g carbs</span>
              <span><strong>{recipeMacro(computed.totals.fat)}</strong>g fat</span>
            </div>
            <button className="btn primary sm recipe-log-btn" type="button" onClick={logMeal}><RI.Plus /> Log meal</button>
          </aside>

          {tab === "build" && (
            <div className="recipe-build-grid">
              {(recipe.groups || []).map(group => {
                const selected = recipeSelectedOption(group, selections);
                const amount = amounts[group.id] ?? selected?.amount ?? 0;
                return (
                  <section key={group.id} className="recipe-builder-group">
                    <div className="recipe-builder-head">
                      <h3>{group.label}</h3>
                      <span className="mono muted">{group.inputLabel || selected?.amountUnit || "amount"}</span>
                    </div>
                    <div className="recipe-option-row">
                      {(group.options || []).map(option => (
                        <button
                          key={option.id}
                          type="button"
                          className={`recipe-option ${selected?.id === option.id ? "is-on" : ""}`}
                          onClick={() => selectOption(group, option)}>
                          <span>{option.label}</span>
                          <em>{option.displayAmount || `${option.amount}${option.amountUnit || ""}`}</em>
                        </button>
                      ))}
                    </div>
                    <div className="recipe-amount-row">
                      <input
                        type="number"
                        min="0"
                        step={selected?.amountUnit === "ml" ? "2.5" : "5"}
                        value={amount}
                        onChange={e => setAmounts(current => ({ ...current, [group.id]: e.target.value }))}
                      />
                      <span>{selected?.amountUnit || "g"} per serving</span>
                      {selected?.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Jumbo source</a>}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {tab === "ingredients" && (
            <div className="recipe-ingredient-list">
              {computed.rows.map(row => (
                <div key={row.group.id} className="recipe-ingredient-row">
                  <div>
                    <span className="recipe-card-kicker">{row.group.label}</span>
                    <strong>{row.option.item || row.option.label}</strong>
                    <em>{recipeMacro(row.amount * recipeNumber(servings, 1), row.option.amountUnit === "ml" ? 1 : 0)} {row.option.amountUnit || "g"} total · {row.option.nutritionBasis || "per 100"}</em>
                  </div>
                  <div className="recipe-ingredient-macros">
                    <span>{recipeKcal(row.macros.kcal)} kcal</span>
                    <span>{recipeMacro(row.macros.protein)}g protein</span>
                    {row.option.sourceUrl && <a href={row.option.sourceUrl} target="_blank" rel="noreferrer">source</a>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "cook" && (
            <div className="recipe-cook-panel">
              <div className="recipe-hob-note">{hob}</div>
              {(recipe.cooking?.steps || []).map((step, index) => (
                <div key={step.id || index} className="recipe-step">
                  <div className="recipe-step-index mono">{index + 1}</div>
                  <div>
                    <div className="recipe-step-head">
                      <strong>{step.title || `Step ${index + 1}`}</strong>
                      <span className="mono">hob {step.hob || "6"} · {step.minutes || "until done"} min</span>
                    </div>
                    <p>{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RecipeJsonEditorModal({ recipe, onClose, onSave, onDelete }) {
  const isNew = !recipe;
  const initial = recipeClone(recipe || emptyRecipeTemplate());
  const [name, setName] = useRecipeState(initial.name || "");
  const [servings, setServings] = useRecipeState(initial.servings || 1);
  const [text, setText] = useRecipeState(() => JSON.stringify(initial, null, 2));
  const [error, setError] = useRecipeState("");

  const syncHeaderFields = (patch) => {
    try {
      const parsed = JSON.parse(text);
      const next = { ...parsed, ...patch };
      setText(JSON.stringify(next, null, 2));
    } catch (e) {}
  };

  const submit = () => {
    try {
      const parsed = JSON.parse(text);
      const next = {
        ...parsed,
        id: parsed.id || recipe?.id || recipeSlug(name),
        name: name.trim() || parsed.name || "Untitled recipe",
        servings: recipeNumber(servings, parsed.servings || 1)
      };
      if (!Array.isArray(next.groups)) throw new Error("Recipe needs a groups array.");
      onSave(next);
      onClose();
    } catch (e) {
      setError(e.message || "Recipe JSON is invalid.");
    }
  };

  return (
    <div className="recipe-modal-backdrop" onClick={onClose}>
      <section className="recipe-editor-modal" role="dialog" aria-modal="true" aria-label="Recipe editor" onClick={e => e.stopPropagation()}>
        <div className="recipe-modal-head">
          <div>
            <span className="recipe-card-kicker">{isNew ? "New recipe" : "Edit recipe"}</span>
            <h2>{name || "Recipe"}</h2>
          </div>
          <button className="btn ghost sm icon-only" type="button" title="Close" onClick={onClose}><RI.X /></button>
        </div>
        <div className="recipe-editor-fields">
          <label>
            <span>Name</span>
            <input value={name} onChange={e => { setName(e.target.value); syncHeaderFields({ name: e.target.value }); }} />
          </label>
          <label>
            <span>Servings</span>
            <input type="number" min="0.25" step="0.25" value={servings} onChange={e => { setServings(e.target.value); syncHeaderFields({ servings: Number(e.target.value) || 1 }); }} />
          </label>
        </div>
        <textarea className="recipe-json-input" value={text} onChange={e => { setText(e.target.value); setError(""); }} spellCheck="false" />
        {error && <div className="recipe-editor-error">{error}</div>}
        <div className="recipe-editor-actions">
          {!isNew && <button className="btn ghost sm" type="button" onClick={onDelete}><RI.X /> Delete</button>}
          <span></span>
          <button className="btn ghost sm" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary sm" type="button" onClick={submit}><RI.Check /> Save recipe</button>
        </div>
      </section>
    </div>
  );
}

function RecipeImportModal({ onClose, onImport }) {
  const [text, setText] = useRecipeState("");
  const [error, setError] = useRecipeState("");

  const submit = () => {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.recipes) ? parsed.recipes : [parsed];
      if (!list.length) throw new Error("No recipes found.");
      onImport(list);
      onClose();
    } catch (e) {
      setError(e.message || "Import JSON is invalid.");
    }
  };

  return (
    <div className="recipe-modal-backdrop" onClick={onClose}>
      <section className="recipe-editor-modal compact" role="dialog" aria-modal="true" aria-label="Import recipes" onClick={e => e.stopPropagation()}>
        <div className="recipe-modal-head">
          <div>
            <span className="recipe-card-kicker">Private import</span>
            <h2>Import recipes</h2>
          </div>
          <button className="btn ghost sm icon-only" type="button" title="Close" onClick={onClose}><RI.X /></button>
        </div>
        <textarea className="recipe-json-input" value={text} onChange={e => { setText(e.target.value); setError(""); }} placeholder='Paste one recipe, {"recipes":[...]}, or an array of recipes.' spellCheck="false" />
        {error && <div className="recipe-editor-error">{error}</div>}
        <div className="recipe-editor-actions">
          <span></span>
          <button className="btn ghost sm" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary sm" type="button" onClick={submit} disabled={!text.trim()}><RI.Download /> Import</button>
        </div>
      </section>
    </div>
  );
}

function RecipesView() {
  const app = RepsState.useApp();
  const { activeProfile, addFoodEntry, addRecipe, updateRecipe, deleteRecipe, importRecipes } = app;
  const recipes = activeProfile.recipes || [];
  const [activeRecipe, setActiveRecipe] = useRecipeState(null);
  const [editingRecipe, setEditingRecipe] = useRecipeState(null);
  const [showNew, setShowNew] = useRecipeState(false);
  const [showImport, setShowImport] = useRecipeState(false);

  const saveRecipe = (recipe) => {
    if ((activeProfile.recipes || []).some(r => r.id === recipe.id)) updateRecipe(recipe.id, recipe);
    else addRecipe(recipe);
  };

  const removeRecipe = (recipe) => {
    if (!recipe?.id) return;
    if (confirm(`Delete recipe "${recipe.name}"?`)) {
      deleteRecipe(recipe.id);
      if (activeRecipe?.id === recipe.id) setActiveRecipe(null);
      if (editingRecipe?.id === recipe.id) setEditingRecipe(null);
    }
  };

  return (
    <div className="view recipes-view">
      <div className="page-head">
        <div>
          <h1 className="page-title">Recipes</h1>
          <div className="page-sub">Private profile recipes · source-backed macros · hob-aware cooking</div>
        </div>
        <div className="page-actions">
          <button className="btn ghost sm" type="button" onClick={() => setShowImport(true)}><RI.Download /> Import</button>
          <button className="btn primary sm" type="button" onClick={() => setShowNew(true)}><RI.Plus /> New recipe</button>
        </div>
      </div>

      <section className="recipes-command-band">
        <div>
          <span className="recipe-card-kicker">Hob profile</span>
          <strong>{activeProfile.cookingPreferences?.hob?.usualRange || "5-7"} usual range</strong>
          <p>{activeProfile.cookingPreferences?.hob?.note || RepsState.DEFAULT_HOB_PREFERENCES.note}</p>
        </div>
        <span className="chip">{recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}</span>
      </section>

      <div className="recipes-grid">
        {recipes.map(recipe => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onOpen={() => setActiveRecipe(recipe)}
            onEdit={() => setEditingRecipe(recipe)}
            onDelete={() => removeRecipe(recipe)} />
        ))}
        {recipes.length === 0 && (
          <div className="empty">No recipes saved yet.</div>
        )}
      </div>

      {activeRecipe && (
        <RecipeModal
          recipe={activeRecipe}
          onClose={() => setActiveRecipe(null)}
          onEdit={() => setEditingRecipe(activeRecipe)}
          onLog={(date, entry) => addFoodEntry(date, entry)} />
      )}
      {editingRecipe && (
        <RecipeJsonEditorModal
          recipe={editingRecipe}
          onClose={() => setEditingRecipe(null)}
          onSave={saveRecipe}
          onDelete={() => removeRecipe(editingRecipe)} />
      )}
      {showNew && (
        <RecipeJsonEditorModal
          onClose={() => setShowNew(false)}
          onSave={saveRecipe} />
      )}
      {showImport && (
        <RecipeImportModal
          onClose={() => setShowImport(false)}
          onImport={importRecipes} />
      )}
    </div>
  );
}

window.RepsRecipes = RecipesView;
window.RepsRecipeUtils = { calculateRecipe, recipeDefaultSelections, recipeDefaultAmounts };
