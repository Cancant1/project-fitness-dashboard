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

function recipeCurrency(value, currency = "EUR") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  try {
    return n.toLocaleString("nl-NL", { style: "currency", currency });
  } catch (e) {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function recipeUnitAmount(value, unit = "g") {
  const decimals = unit === "ml" || recipeNumber(value) < 10 ? 1 : 0;
  return `${recipeMacro(value, decimals)} ${unit || ""}`.trim();
}

function recipePackLabel(option = {}) {
  const amount = recipeNumber(option.packAmount, null);
  const unit = option.packUnit || option.amountUnit || "";
  const price = option.packPrice !== undefined && option.packPrice !== null
    ? recipeCurrency(option.packPrice, option.currency || "EUR")
    : "-";
  return amount ? `${recipeUnitAmount(amount, unit)} pack · ${price}` : `Pack · ${price}`;
}

function recipeOptionUsedCost(option = {}, amount = 0, servings = 1) {
  const packAmount = recipeNumber(option.packAmount);
  const packPrice = Number(option.packPrice);
  if (!packAmount || !Number.isFinite(packPrice)) return null;
  return (recipeNumber(amount) * recipeNumber(servings, 1) / packAmount) * packPrice;
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
    const cost = recipeOptionUsedCost(option || {}, amount, servings);
    return { group, option, amount, macros, cost };
  }).filter(row => row.option);

  const totals = rows.reduce((sum, row) => ({
    kcal: sum.kcal + row.macros.kcal,
    protein: sum.protein + row.macros.protein,
    carbs: sum.carbs + row.macros.carbs,
    fat: sum.fat + row.macros.fat,
    cost: sum.cost + recipeNumber(row.cost, 0)
  }), { kcal: 0, protein: 0, carbs: 0, fat: 0, cost: 0 });

  return { rows, totals };
}

function recipeAllIngredientRows(recipe = {}, selections = {}, amounts = {}, servings = 1) {
  return (recipe.groups || []).flatMap(group => {
    const selected = recipeSelectedOption(group, selections);
    return (group.options || []).map(option => {
      const isSelected = selected?.id === option.id;
      const amount = recipeNumber(isSelected ? amounts[group.id] : option.amount, recipeNumber(option.amount, 0));
      const macros = isSelected ? recipeOptionMacros(option, amount, servings) : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      return {
        group,
        option,
        selected: isSelected,
        amount,
        totalAmount: amount * recipeNumber(servings, 1),
        macros,
        cost: isSelected ? recipeOptionUsedCost(option, amount, servings) : null
      };
    });
  });
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
            packAmount: 100,
            packUnit: "g",
            packPrice: 0,
            currency: "EUR",
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
  const sources = (recipe.groups || []).reduce((sum, group) =>
    sum + (group.options || []).filter(option => option.sourceUrl).length, 0);
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
        <span><strong>{recipeCurrency(totals.cost)}</strong> used</span>
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
  const ingredientRows = useRecipeMemo(() => recipeAllIngredientRows(recipe, selections, amounts, servings), [recipe, selections, amounts, servings]);
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
            <span>Multiplier</span>
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
              <span><strong>{recipeCurrency(computed.totals.cost)}</strong> used</span>
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
                      <span>{selected?.amountUnit || "g"} used</span>
                      {selected && <span>{recipePackLabel(selected)}</span>}
                      {selected?.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Jumbo source</a>}
                    </div>
                  </section>
                );
              })}
            </div>
          )}

          {tab === "ingredients" && (
            <div className="recipe-ingredient-list">
              {ingredientRows.map(row => (
                <div key={`${row.group.id}-${row.option.id}`} className={`recipe-ingredient-row ${row.selected ? "is-selected" : ""}`}>
                  <div>
                    <span className="recipe-card-kicker">{row.group.label}{row.selected ? " · selected" : ""}</span>
                    <strong>{row.option.item || row.option.label}</strong>
                    <em>Full pack: {recipePackLabel(row.option)}</em>
                    {row.selected && (
                      <em>
                        Build uses: {recipeUnitAmount(row.totalAmount, row.option.amountUnit || "g")}
                        {row.cost !== null ? ` · ${recipeCurrency(row.cost, row.option.currency || "EUR")}` : ""}
                      </em>
                    )}
                    <em>{row.option.nutritionBasis || "per 100"}</em>
                  </div>
                  <div className="recipe-ingredient-macros">
                    {row.selected ? (
                      <>
                        <span>{recipeKcal(row.macros.kcal)} kcal</span>
                        <span>{recipeMacro(row.macros.protein)}g protein</span>
                      </>
                    ) : (
                      <span>option</span>
                    )}
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

function recipeOptionTemplate(groupId = "ingredient") {
  const slug = recipeSlug(groupId);
  return {
    id: `${slug}-option-${Date.now().toString(36)}`,
    label: "Ingredient",
    item: "Ingredient",
    sourceUrl: "",
    packAmount: 100,
    packUnit: "g",
    packPrice: 0,
    currency: "EUR",
    amount: 100,
    amountUnit: "g",
    displayAmount: "100 g",
    nutritionBasis: "per 100 g",
    kcalPer100: 100,
    proteinPer100: 10,
    carbsPer100: 0,
    fatPer100: 0
  };
}

function recipeGroupTemplate() {
  const id = `group-${Date.now().toString(36)}`;
  return {
    id,
    label: "Ingredient group",
    inputLabel: "grams",
    options: [recipeOptionTemplate(id)]
  };
}

function recipeStepTemplate() {
  return {
    id: `step-${Date.now().toString(36)}`,
    title: "Step",
    hob: "6",
    minutes: "10",
    body: "Add the cooking step."
  };
}

function recipeCleanNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function recipeSanitizeDraft(draft = {}, fallbackId = "") {
  const id = String(draft.id || fallbackId || recipeSlug(draft.name)).trim();
  const groups = (draft.groups || []).map((group, groupIndex) => {
    const groupId = String(group.id || recipeSlug(group.label) || `group-${groupIndex + 1}`).trim();
    const options = (group.options || []).map((option, optionIndex) => {
      const optionId = String(option.id || recipeSlug(option.label || option.item) || `${groupId}-option-${optionIndex + 1}`).trim();
      return {
        ...option,
        id: optionId,
        label: String(option.label || option.item || "Ingredient").trim(),
        item: String(option.item || option.label || "Ingredient").trim(),
        sourceUrl: String(option.sourceUrl || "").trim(),
        packAmount: recipeCleanNumber(option.packAmount, 0),
        packUnit: String(option.packUnit || option.amountUnit || "g").trim(),
        packPrice: recipeCleanNumber(option.packPrice, 0),
        currency: String(option.currency || "EUR").trim() || "EUR",
        amount: recipeCleanNumber(option.amount, 0),
        amountUnit: String(option.amountUnit || option.packUnit || "g").trim(),
        displayAmount: String(option.displayAmount || "").trim(),
        nutritionBasis: String(option.nutritionBasis || "per 100 g").trim(),
        kcalPer100: recipeCleanNumber(option.kcalPer100, 0),
        proteinPer100: recipeCleanNumber(option.proteinPer100, 0),
        carbsPer100: recipeCleanNumber(option.carbsPer100, 0),
        fatPer100: recipeCleanNumber(option.fatPer100, 0)
      };
    }).filter(option => option.id && option.label);
    return {
      ...group,
      id: groupId,
      label: String(group.label || "Ingredient group").trim(),
      inputLabel: String(group.inputLabel || "amount").trim(),
      options
    };
  }).filter(group => group.id && group.options.length);

  const selections = { ...(draft.selections || {}) };
  groups.forEach(group => {
    const selected = selections[group.id];
    if (!group.options.some(option => option.id === selected)) selections[group.id] = group.options[0]?.id || "";
  });

  const cooking = {
    equipment: draft.cooking?.equipment || "Electric hob",
    hobNote: draft.cooking?.hobNote || RepsState.DEFAULT_HOB_PREFERENCES.note,
    steps: (draft.cooking?.steps || []).map((step, index) => ({
      id: String(step.id || `step-${index + 1}`).trim(),
      title: String(step.title || `Step ${index + 1}`).trim(),
      hob: String(step.hob || "").trim(),
      minutes: String(step.minutes || "").trim(),
      body: String(step.body || "").trim()
    })).filter(step => step.title || step.body)
  };

  return {
    ...draft,
    id,
    name: String(draft.name || "Untitled recipe").trim() || "Untitled recipe",
    category: String(draft.category || "Recipes").trim() || "Recipes",
    tags: Array.isArray(draft.tags) ? draft.tags.map(tag => String(tag).trim()).filter(Boolean) : [],
    servings: Math.max(0.25, recipeCleanNumber(draft.servings, 1)),
    summary: String(draft.summary || "").trim(),
    selections,
    groups,
    cooking
  };
}

function RecipeEditorModal({ recipe, onClose, onSave, onDelete }) {
  const isNew = !recipe;
  const [draft, setDraft] = useRecipeState(() => recipeClone(recipe || emptyRecipeTemplate()));
  const [error, setError] = useRecipeState("");

  const setRoot = (patch) => {
    setError("");
    setDraft(current => ({ ...current, ...patch }));
  };

  const updateGroup = (groupIndex, patch) => {
    setError("");
    setDraft(current => ({
      ...current,
      groups: (current.groups || []).map((group, index) => index === groupIndex ? { ...group, ...patch } : group)
    }));
  };

  const updateOption = (groupIndex, optionIndex, patch) => {
    setError("");
    setDraft(current => ({
      ...current,
      groups: (current.groups || []).map((group, index) => {
        if (index !== groupIndex) return group;
        return {
          ...group,
          options: (group.options || []).map((option, optIndex) => optIndex === optionIndex ? { ...option, ...patch } : option)
        };
      })
    }));
  };

  const addGroup = () => {
    setDraft(current => ({ ...current, groups: [...(current.groups || []), recipeGroupTemplate()] }));
  };

  const deleteGroup = (groupIndex) => {
    setDraft(current => ({ ...current, groups: (current.groups || []).filter((_group, index) => index !== groupIndex) }));
  };

  const addOption = (groupIndex) => {
    setDraft(current => ({
      ...current,
      groups: (current.groups || []).map((group, index) => index === groupIndex
        ? { ...group, options: [...(group.options || []), recipeOptionTemplate(group.id)] }
        : group)
    }));
  };

  const deleteOption = (groupIndex, optionIndex) => {
    setDraft(current => ({
      ...current,
      groups: (current.groups || []).map((group, index) => index === groupIndex
        ? { ...group, options: (group.options || []).filter((_option, optIndex) => optIndex !== optionIndex) }
        : group)
    }));
  };

  const updateStep = (stepIndex, patch) => {
    setDraft(current => ({
      ...current,
      cooking: {
        ...(current.cooking || {}),
        steps: (current.cooking?.steps || []).map((step, index) => index === stepIndex ? { ...step, ...patch } : step)
      }
    }));
  };

  const addStep = () => {
    setDraft(current => ({
      ...current,
      cooking: {
        ...(current.cooking || {}),
        steps: [...(current.cooking?.steps || []), recipeStepTemplate()]
      }
    }));
  };

  const deleteStep = (stepIndex) => {
    setDraft(current => ({
      ...current,
      cooking: {
        ...(current.cooking || {}),
        steps: (current.cooking?.steps || []).filter((_step, index) => index !== stepIndex)
      }
    }));
  };

  const submit = () => {
    try {
      const next = recipeSanitizeDraft(draft, recipe?.id || draft.id || recipeSlug(draft.name));
      if (!next.groups.length) throw new Error("Recipe needs at least one ingredient group with one option.");
      onSave(next);
      onClose();
    } catch (e) {
      setError(e.message || "Recipe is invalid.");
    }
  };

  return (
    <div className="recipe-modal-backdrop" onClick={onClose}>
      <section className="recipe-editor-modal" role="dialog" aria-modal="true" aria-label="Recipe editor" onClick={e => e.stopPropagation()}>
        <div className="recipe-modal-head">
          <div>
            <span className="recipe-card-kicker">{isNew ? "New recipe" : "Edit recipe"}</span>
            <h2>{draft.name || "Recipe"}</h2>
          </div>
          <button className="btn ghost sm icon-only" type="button" title="Close" onClick={onClose}><RI.X /></button>
        </div>
        <div className="recipe-editor-body">
          <section className="recipe-edit-section">
            <h3>Recipe</h3>
            <div className="recipe-edit-grid">
              <label>
                <span>Name</span>
                <input value={draft.name || ""} onChange={e => setRoot({ name: e.target.value })} />
              </label>
              <label>
                <span>Category</span>
                <input value={draft.category || ""} onChange={e => setRoot({ category: e.target.value })} />
              </label>
              <label>
                <span>Default multiplier</span>
                <input type="number" min="0.25" step="0.25" value={draft.servings || 1} onChange={e => setRoot({ servings: e.target.value })} />
              </label>
              <label>
                <span>Tags</span>
                <input value={(draft.tags || []).join(", ")} onChange={e => setRoot({ tags: e.target.value.split(",").map(tag => tag.trim()).filter(Boolean) })} />
              </label>
              <label className="span-2">
                <span>Summary</span>
                <textarea value={draft.summary || ""} onChange={e => setRoot({ summary: e.target.value })} />
              </label>
            </div>
          </section>

          <section className="recipe-edit-section">
            <div className="recipe-edit-section-head">
              <h3>Ingredients</h3>
              <button className="btn ghost sm" type="button" onClick={addGroup}><RI.Plus /> Group</button>
            </div>
            {(draft.groups || []).map((group, groupIndex) => (
              <div className="recipe-edit-group" key={`${group.id || "group"}-${groupIndex}`}>
                <div className="recipe-edit-group-head">
                  <strong>{group.label || "Ingredient group"}</strong>
                  <button className="btn ghost sm icon-only" type="button" title="Delete group" onClick={() => deleteGroup(groupIndex)}><RI.X /></button>
                </div>
                <div className="recipe-edit-grid compact">
                  <label>
                    <span>Group id</span>
                    <input value={group.id || ""} onChange={e => updateGroup(groupIndex, { id: e.target.value })} />
                  </label>
                  <label>
                    <span>Group name</span>
                    <input value={group.label || ""} onChange={e => updateGroup(groupIndex, { label: e.target.value })} />
                  </label>
                  <label>
                    <span>Amount label</span>
                    <input value={group.inputLabel || ""} onChange={e => updateGroup(groupIndex, { inputLabel: e.target.value })} />
                  </label>
                </div>

                <div className="recipe-edit-options">
                  {(group.options || []).map((option, optionIndex) => (
                    <div className="recipe-edit-option" key={`${option.id || "option"}-${optionIndex}`}>
                      <div className="recipe-edit-option-head">
                        <strong>{option.label || "Ingredient"}</strong>
                        <button className="btn ghost sm icon-only" type="button" title="Delete option" onClick={() => deleteOption(groupIndex, optionIndex)}><RI.X /></button>
                      </div>
                      <div className="recipe-edit-grid option-grid">
                        <label>
                          <span>Option id</span>
                          <input value={option.id || ""} onChange={e => updateOption(groupIndex, optionIndex, { id: e.target.value })} />
                        </label>
                        <label>
                          <span>Name</span>
                          <input value={option.label || ""} onChange={e => updateOption(groupIndex, optionIndex, { label: e.target.value })} />
                        </label>
                        <label className="span-2">
                          <span>Full pack item</span>
                          <input value={option.item || ""} onChange={e => updateOption(groupIndex, optionIndex, { item: e.target.value })} />
                        </label>
                        <label className="span-2">
                          <span>Supermarket URL</span>
                          <input value={option.sourceUrl || ""} onChange={e => updateOption(groupIndex, optionIndex, { sourceUrl: e.target.value })} />
                        </label>
                        <label>
                          <span>Pack amount</span>
                          <input type="number" min="0" step="0.01" value={option.packAmount ?? ""} onChange={e => updateOption(groupIndex, optionIndex, { packAmount: e.target.value })} />
                        </label>
                        <label>
                          <span>Pack unit</span>
                          <input value={option.packUnit || ""} onChange={e => updateOption(groupIndex, optionIndex, { packUnit: e.target.value })} />
                        </label>
                        <label>
                          <span>Pack price</span>
                          <input type="number" min="0" step="0.01" value={option.packPrice ?? ""} onChange={e => updateOption(groupIndex, optionIndex, { packPrice: e.target.value })} />
                        </label>
                        <label>
                          <span>Currency</span>
                          <input value={option.currency || "EUR"} onChange={e => updateOption(groupIndex, optionIndex, { currency: e.target.value })} />
                        </label>
                        <label>
                          <span>Build amount</span>
                          <input type="number" min="0" step="0.01" value={option.amount ?? ""} onChange={e => updateOption(groupIndex, optionIndex, { amount: e.target.value })} />
                        </label>
                        <label>
                          <span>Build unit</span>
                          <input value={option.amountUnit || ""} onChange={e => updateOption(groupIndex, optionIndex, { amountUnit: e.target.value })} />
                        </label>
                        <label className="span-2">
                          <span>Display amount</span>
                          <input value={option.displayAmount || ""} onChange={e => updateOption(groupIndex, optionIndex, { displayAmount: e.target.value })} />
                        </label>
                        <label>
                          <span>Kcal / 100</span>
                          <input type="number" min="0" step="0.1" value={option.kcalPer100 ?? ""} onChange={e => updateOption(groupIndex, optionIndex, { kcalPer100: e.target.value })} />
                        </label>
                        <label>
                          <span>Protein / 100</span>
                          <input type="number" min="0" step="0.1" value={option.proteinPer100 ?? ""} onChange={e => updateOption(groupIndex, optionIndex, { proteinPer100: e.target.value })} />
                        </label>
                        <label>
                          <span>Carbs / 100</span>
                          <input type="number" min="0" step="0.1" value={option.carbsPer100 ?? ""} onChange={e => updateOption(groupIndex, optionIndex, { carbsPer100: e.target.value })} />
                        </label>
                        <label>
                          <span>Fat / 100</span>
                          <input type="number" min="0" step="0.1" value={option.fatPer100 ?? ""} onChange={e => updateOption(groupIndex, optionIndex, { fatPer100: e.target.value })} />
                        </label>
                        <label className="span-2">
                          <span>Nutrition basis</span>
                          <input value={option.nutritionBasis || ""} onChange={e => updateOption(groupIndex, optionIndex, { nutritionBasis: e.target.value })} />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button className="btn ghost sm recipe-add-option" type="button" onClick={() => addOption(groupIndex)}><RI.Plus /> Option</button>
                </div>
              </div>
            ))}
          </section>

          <section className="recipe-edit-section">
            <div className="recipe-edit-section-head">
              <h3>Cook</h3>
              <button className="btn ghost sm" type="button" onClick={addStep}><RI.Plus /> Step</button>
            </div>
            <div className="recipe-edit-grid">
              <label>
                <span>Equipment</span>
                <input value={draft.cooking?.equipment || ""} onChange={e => setRoot({ cooking: { ...(draft.cooking || {}), equipment: e.target.value } })} />
              </label>
              <label className="span-2">
                <span>Hob note</span>
                <input value={draft.cooking?.hobNote || ""} onChange={e => setRoot({ cooking: { ...(draft.cooking || {}), hobNote: e.target.value } })} />
              </label>
            </div>
            {(draft.cooking?.steps || []).map((step, stepIndex) => (
              <div className="recipe-edit-step" key={`${step.id || "step"}-${stepIndex}`}>
                <div className="recipe-edit-option-head">
                  <strong>{step.title || `Step ${stepIndex + 1}`}</strong>
                  <button className="btn ghost sm icon-only" type="button" title="Delete step" onClick={() => deleteStep(stepIndex)}><RI.X /></button>
                </div>
                <div className="recipe-edit-grid compact">
                  <label>
                    <span>Title</span>
                    <input value={step.title || ""} onChange={e => updateStep(stepIndex, { title: e.target.value })} />
                  </label>
                  <label>
                    <span>Hob</span>
                    <input value={step.hob || ""} onChange={e => updateStep(stepIndex, { hob: e.target.value })} />
                  </label>
                  <label>
                    <span>Minutes</span>
                    <input value={step.minutes || ""} onChange={e => updateStep(stepIndex, { minutes: e.target.value })} />
                  </label>
                  <label className="span-3">
                    <span>Step body</span>
                    <textarea value={step.body || ""} onChange={e => updateStep(stepIndex, { body: e.target.value })} />
                  </label>
                </div>
              </div>
            ))}
          </section>
        </div>
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
        <RecipeEditorModal
          recipe={editingRecipe}
          onClose={() => setEditingRecipe(null)}
          onSave={saveRecipe}
          onDelete={() => removeRecipe(editingRecipe)} />
      )}
      {showNew && (
        <RecipeEditorModal
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
window.RepsRecipeUtils = {
  calculateRecipe,
  recipeDefaultSelections,
  recipeDefaultAmounts,
  recipeAllIngredientRows,
  recipeOptionUsedCost
};
