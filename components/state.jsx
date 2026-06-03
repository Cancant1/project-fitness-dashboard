/* global React */
// App-wide state — profiles, macro targets per day. Persisted to localStorage.
const { createContext, useState, useEffect, useContext, useRef } = React;

const PHASES = {
  "cut-1":      { label: "Aggressive cut · -1.0 kg/wk",   rate: -1.0,  kcalDelta: -1100 },
  "cut-0.75":   { label: "Hard cut · -0.75 kg/wk",        rate: -0.75, kcalDelta: -825  },
  "cut-0.5":    { label: "Standard cut · -0.5 kg/wk",     rate: -0.5,  kcalDelta: -550  },
  "cut-0.25":   { label: "Mini cut · -0.25 kg/wk",        rate: -0.25, kcalDelta: -275  },
  "maintain":   { label: "Maintain",                       rate: 0,     kcalDelta: 0     },
  "bulk-0.25":  { label: "Lean bulk · +0.25 kg/wk",       rate: 0.25,  kcalDelta: 275   },
  "bulk-0.5":   { label: "Standard bulk · +0.5 kg/wk",    rate: 0.5,   kcalDelta: 550   },
  "bulk-0.75":  { label: "Hard bulk · +0.75 kg/wk",       rate: 0.75,  kcalDelta: 825   },
  "bulk-1":     { label: "Aggressive bulk · +1.0 kg/wk",  rate: 1.0,   kcalDelta: 1100  }
};

const STORE_KEY = "reps-app-state-v1";
const SYNC_CONFIG_KEY = "reps-github-sync-config-v1";
const SYNC_META_KEY = "reps-github-sync-meta-v1";
const SYNC_APP_ID = "reps-dashboard";
const SYNC_SCHEMA_VERSION = 1;

const DAY_KEYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const DEFAULT_PROGRESSION_RULES = {
  compound: {
    label: "Compound",
    trigger: "first_set_top_final_in_range",
    incrementKg: 2.5,
    incrementLbs: 5,
    repDropWarningPct: 30
  },
  hypertrophy: {
    label: "Hypertrophy",
    trigger: "all_sets_top",
    incrementKg: 2.5,
    incrementLbs: 5,
    repDropWarningPct: 30
  },
  safety: {
    label: "Safety",
    trigger: "hold_if_final_drops",
    incrementKg: 0,
    incrementLbs: 0,
    repDropWarningPct: 30
  }
};
const PROGRESSION_RULE_TRIGGERS = ["first_set_top_final_in_range", "all_sets_top", "hold_if_final_drops"];

function progressionRulesWithDefaults(rules = {}) {
  return Object.fromEntries(Object.entries(DEFAULT_PROGRESSION_RULES).map(([key, defaults]) => {
    const current = rules?.[key] || {};
    const trigger = PROGRESSION_RULE_TRIGGERS.includes(current.trigger) ? current.trigger : defaults.trigger;
    return [key, {
      ...defaults,
      ...current,
      trigger,
      label: String(current.label || defaults.label).trim() || defaults.label,
      incrementKg: Number.isFinite(Number(current.incrementKg)) ? Number(current.incrementKg) : defaults.incrementKg,
      incrementLbs: Number.isFinite(Number(current.incrementLbs)) ? Number(current.incrementLbs) : defaults.incrementLbs,
      repDropWarningPct: Number.isFinite(Number(current.repDropWarningPct)) ? Number(current.repDropWarningPct) : defaults.repDropWarningPct
    }];
  }));
}

const DEFAULT_STATE = {
  activeProfileId: "local",
  profiles: [
    {
      id: "local",
      name: "Profile",
      birthday: "",
      unit: "kg",
      hasHistory: false,
      macros: {
        Mon: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Tue: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Wed: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Thu: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Fri: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Sat: { kcal: 2700, protein: 180, carbs: 280, fat: 85 },
        Sun: { kcal: 2700, protein: 180, carbs: 280, fat: 85 }
      },
      preset: "maintain",
      phase: "maintain",
      targetWeight: null,
      maintenanceKcal: 2700,
      progressionRules: progressionRulesWithDefaults(),
      foodByDate: {},        // { "2026-05-21": [{id, product, kcal, protein, amount}, ...] }
      customExercises: [],   // { id, name, group, equipment, unit, notes }
      hiddenExercises: []    // historical exercise names hidden from the database view
    }
  ]
};

const PRESETS = {
  cut: {
    label: "Cut",
    desc: "Lower kcal training days, deeper deficit on rest",
    macros: {
      Mon: { kcal: 2400, protein: 180, carbs: 230, fat: 75 },
      Tue: { kcal: 2400, protein: 180, carbs: 230, fat: 75 },
      Wed: { kcal: 2400, protein: 180, carbs: 230, fat: 75 },
      Thu: { kcal: 2400, protein: 180, carbs: 230, fat: 75 },
      Fri: { kcal: 2400, protein: 180, carbs: 230, fat: 75 },
      Sat: { kcal: 2000, protein: 160, carbs: 180, fat: 65 },
      Sun: { kcal: 1800, protein: 160, carbs: 160, fat: 60 }
    }
  },
  maintain: {
    label: "Maintain",
    desc: "Even targets across the week",
    macros: Object.fromEntries(DAY_KEYS.map(d => [d, { kcal: 2700, protein: 180, carbs: 280, fat: 85 }]))
  },
  bulk: {
    label: "Bulk",
    desc: "Surplus on training days",
    macros: {
      Mon: { kcal: 3200, protein: 200, carbs: 350, fat: 90 },
      Tue: { kcal: 3200, protein: 200, carbs: 350, fat: 90 },
      Wed: { kcal: 3200, protein: 200, carbs: 350, fat: 90 },
      Thu: { kcal: 3000, protein: 190, carbs: 320, fat: 85 },
      Fri: { kcal: 3200, protein: 200, carbs: 350, fat: 90 },
      Sat: { kcal: 2800, protein: 180, carbs: 280, fat: 85 },
      Sun: { kcal: 2700, protein: 180, carbs: 270, fat: 85 }
    }
  }
};

const clone = (value) => JSON.parse(JSON.stringify(value));

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : { ...fallback };
  } catch (e) {
    return { ...fallback };
  }
}

function writeJsonStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
}

function base64EncodeUtf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64DecodeUtf8(value = "") {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function stateEnvelope(state, clientId) {
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    app: SYNC_APP_ID,
    updatedAt: new Date().toISOString(),
    updatedBy: clientId,
    state
  };
}

function syncClientId() {
  return "client-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultSyncConfig() {
  return {
    enabled: false,
    owner: "",
    repo: "",
    branch: "main",
    path: "state/reps-app-state.json",
    token: "",
    clientId: syncClientId()
  };
}

function defaultSyncMeta() {
  return {
    lastRemoteSha: null,
    lastSyncAt: null,
    dirty: false,
    conflict: false
  };
}

function loadSyncConfig() {
  const config = readJsonStorage(SYNC_CONFIG_KEY, defaultSyncConfig());
  return {
    ...defaultSyncConfig(),
    ...config,
    clientId: config.clientId || syncClientId()
  };
}

function loadSyncMeta() {
  return readJsonStorage(SYNC_META_KEY, defaultSyncMeta());
}

const AppContext = createContext(null);

function migrateProfile(p) {
  const defaultMacros = PRESETS.maintain.macros;
  const routines = p.routines && p.routines.length ? p.routines : [];
  const activeRoutineId = p.activeRoutineId && routines.some(r => r.id === p.activeRoutineId)
    ? p.activeRoutineId
    : (routines[0]?.id || null);
  return {
    id: p.id || "local",
    name: p.name || "Profile",
    birthday: p.birthday || "",
    unit: p.unit || "kg",
    hasHistory: p.hasHistory !== undefined ? !!p.hasHistory : false,
    macros: p.macros && p.macros.Mon ? p.macros : structuredClone(defaultMacros),
    preset: p.preset || "maintain",
    phase: p.phase || "maintain",
    targetWeight: p.targetWeight ?? null,
    maintenanceKcal: p.maintenanceKcal ?? 2700,
    progressionRules: progressionRulesWithDefaults(p.progressionRules),
    foodByDate: p.foodByDate || {},
    customExercises: p.customExercises || [],
    hiddenExercises: p.hiddenExercises || [],
    hiddenFoodItems: p.hiddenFoodItems || [],
    customFoodItems: p.customFoodItems || [],
    weightEntries: p.weightEntries || [],
    blockNames: p.blockNames || {},
    blockStartOverrides: p.blockStartOverrides || {},
    blockGoals: p.blockGoals || {},
    hiddenBlockSheets: p.hiddenBlockSheets || [],
    customBlocks: p.customBlocks || [],
    deletedSessionIds: p.deletedSessionIds || [],
    sessionEdits: p.sessionEdits || {},
    loggedSessions: p.loggedSessions || [],
    bodyLedgerFoodsOpen: p.bodyLedgerFoodsOpen !== undefined ? !!p.bodyLedgerFoodsOpen : true,
    // Per-date Log adjustments (persisted overrides on the planned routine):
    //   sessionPlansByDate["2026-05-22"] = { extraExercises, removedKeys, setsByExercise, rpe, notes, status }
    sessionPlansByDate: p.sessionPlansByDate || {},
    // Manual entries that override the derived Daily Log values in Body:
    //   dailyOverrides["2026-05-22"] = { weight?: number|null, kcal?: number|null, protein?: number|null, note?: string }
    // A null field is an explicit blank/unlogged marker that prevents fallback to older sources.
    dailyOverrides: p.dailyOverrides || {},
    // Per-exercise per-date annotations rendered on the Strength chart:
    //   exerciseAnnotations["Incline DB Press"]["2026-05-22"] = { type: "pr"|"deload"|"injury"|"travel"|"sick"|"form_change"|"note", note: string }
    exerciseAnnotations: p.exerciseAnnotations || {},
    // Overrides for historical block durations (in-progress block editing)
    blockWeeksOverride: p.blockWeeksOverride || {},
    exerciseRenames: p.exerciseRenames || {},
    // Routine system
    routines,
    activeRoutineId,
    // Macro visibility
    trackCarbs: p.trackCarbs !== undefined ? p.trackCarbs : true,
    trackFat: p.trackFat !== undefined ? p.trackFat : true
  };
}

function migrateState(rawState = {}) {
  const parsed = rawState || {};
  const profiles = (parsed.profiles && parsed.profiles.length ? parsed.profiles : DEFAULT_STATE.profiles)
    .map(migrateProfile);
  const activeProfileId = profiles.some(p => p.id === parsed.activeProfileId)
    ? parsed.activeProfileId
    : profiles[0]?.id || DEFAULT_STATE.activeProfileId;
  return {
    ...DEFAULT_STATE,
    ...parsed,
    profiles,
    activeProfileId
  };
}

function unwrapRemoteState(payload) {
  if (payload?.app === SYNC_APP_ID && payload?.state) return payload.state;
  if (payload?.profiles) return payload;
  throw new Error("GitHub file does not look like Reps dashboard state.");
}

function githubApiHeaders(config) {
  return {
    Authorization: `Bearer ${String(config.token || "").trim()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function githubContentUrl(config) {
  const owner = encodeURIComponent(String(config.owner || "").trim());
  const repo = encodeURIComponent(String(config.repo || "").trim());
  const path = String(config.path || "").split("/").map(encodeURIComponent).join("/");
  const branch = encodeURIComponent(String(config.branch || "main").trim());
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
}

async function fetchGithubState(config) {
  const res = await fetch(githubContentUrl(config), { headers: githubApiHeaders(config) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub pull failed (${res.status}): ${text.slice(0, 180)}`);
  }
  const file = await res.json();
  const payload = JSON.parse(base64DecodeUtf8(file.content || ""));
  return {
    sha: file.sha,
    envelope: payload,
    state: migrateState(unwrapRemoteState(payload))
  };
}

async function putGithubState(config, state, sha = null) {
  const cleanPath = String(config.path || "state/reps-app-state.json").trim();
  const body = {
    message: `Sync Reps dashboard state ${new Date().toISOString()}`,
    content: base64EncodeUtf8(JSON.stringify(stateEnvelope(state, config.clientId), null, 2)),
    branch: config.branch || "main"
  };
  if (sha) body.sha = sha;
  const url = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...githubApiHeaders(config),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub push failed (${res.status}): ${text.slice(0, 180)}`);
  }
  const result = await res.json();
  return result.content?.sha || null;
}

function isGithubShaWriteError(message = "") {
  return /\(409\)|does not match|\(422\).*sha|\(422\).*missing_field/i.test(String(message || ""));
}

function blockNameFromSheet(sheet = "") {
  return String(sheet || "Workbook block")
    .replace(/[()]/g, "")
    .replace(/^Block\s+/i, "B")
    .trim() || "Workbook block";
}

function foodCatalogKey(product) {
  return String(product || "").trim().toLowerCase();
}

function finiteCatalogNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizedCatalogFoodItem(item = {}, index = 0) {
  const product = String(item.product || item.name || "").trim();
  if (!product) return null;
  const slug = product.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
  return {
    id: item.id || `migrated-food-${slug}-${index}`,
    product,
    kcalPerUnit: finiteCatalogNumber(item.kcalPerUnit ?? item.kcal),
    proteinPerUnit: finiteCatalogNumber(item.proteinPerUnit ?? item.protein),
    carbs: finiteCatalogNumber(item.carbs),
    fat: finiteCatalogNumber(item.fat),
    category: item.category || "Migrated"
  };
}

function materializeEffectiveState(rawState, activeProfileId) {
  const next = migrateState(clone(rawState));
  const idx = next.profiles.findIndex(p => p.id === activeProfileId);
  if (idx < 0 || !window.RepsData) return next;
  const profile = next.profiles[idx];
  const routineDays = clone(
    (profile.routines || []).find(r => r.id === profile.activeRoutineId)?.days ||
    profile.routines?.[0]?.days ||
    window.__DEFAULT_PLANNED_ROUTINE ||
    window.PLANNED_ROUTINE ||
    []
  );
  const routines = (profile.routines || []).length
    ? profile.routines
    : routineDays.length
      ? [{ id: "routine-migrated-default", name: "Push Pull Legs + Boxing", days: routineDays }]
      : [];
  const activeRoutineId = profile.activeRoutineId || routines[0]?.id || null;
  const sessions = (window.RepsData.allSessions?.() || []).map(s => ({
    ...clone(s),
    source: "github-migrated"
  }));
  const weightEntries = (window.RepsData.mergedWeightData?.(profile, null) || []).map(row => ({
    date: row.date,
    weight: row.value,
    note: row.note || ""
  }));
  const dailyOverrides = clone(profile.dailyOverrides || {});
  const foodByDate = profile.foodByDate || {};
  const addMacroOverride = (row, field) => {
    if (!row?.date || row.value == null) return;
    const hasFoodTotal = (foodByDate[row.date] || []).length > 0;
    const existing = dailyOverrides[row.date] || {};
    if (hasFoodTotal || Object.prototype.hasOwnProperty.call(existing, field)) return;
    dailyOverrides[row.date] = { ...existing, [field]: row.value };
  };
  (window.RepsData.mergedNutritionData?.(profile, "kcal", null, false) || []).forEach(row => addMacroOverride(row, "kcal"));
  (window.RepsData.mergedNutritionData?.(profile, "protein", null, false) || []).forEach(row => addMacroOverride(row, "protein"));

  const customFoodItems = clone(profile.customFoodItems || []);
  const foodKeys = new Set(customFoodItems.map(item => foodCatalogKey(item.product)));
  (window.RepsData.foodItems || []).forEach((item, index) => {
    const normalized = normalizedCatalogFoodItem(item, index);
    const key = foodCatalogKey(normalized?.product);
    if (!normalized || !key || foodKeys.has(key)) return;
    customFoodItems.push(normalized);
    foodKeys.add(key);
  });

  const existingBlockIds = new Set((profile.customBlocks || []).map(b => b.id));
  const migratedBlocks = (window.RepsData.blockSummary?.(profile) || []).map(block => {
    const sheet = block.sheet || block.name || "workbook-block";
    const id = `migrated-${String(sheet).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const startDate = profile.blockStartOverrides?.[sheet] || block.weeks?.[0]?.weekStart || window.RepsData.TODAY;
    return {
      id,
      name: profile.blockNames?.[sheet] || blockNameFromSheet(sheet),
      startDate,
      weeks: profile.blockWeeksOverride?.[sheet] || block.weeks?.length || 1,
      goal: profile.blockGoals?.[sheet] || "Migrated from workbook history"
    };
  }).filter(block => block.startDate && !existingBlockIds.has(block.id));

  next.profiles[idx] = {
    ...profile,
    hasHistory: false,
    routines,
    activeRoutineId,
    loggedSessions: sessions,
    deletedSessionIds: [],
    sessionEdits: {},
    weightEntries,
    dailyOverrides,
    customFoodItems,
    customBlocks: [...(profile.customBlocks || []), ...migratedBlocks],
    hiddenBlockSheets: [],
    blockNames: {},
    blockStartOverrides: {},
    blockWeeksOverride: {}
  };
  return next;
}

function normalizeSessionDay(value) {
  if (window.RepsData?.normalizeDayKey) return window.RepsData.normalizeDayKey(value);
  const key = String(value || "").trim().toLowerCase().slice(0, 3);
  return { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" }[key] || null;
}

function sessionSlotPlannedDate(session = {}) {
  if (window.RepsData?.plannedDateForSession) return window.RepsData.plannedDateForSession(session);
  return session.plannedDate || session.date || null;
}

function sameLoggedSessionSlot(a = {}, b = {}) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  const aPlanned = sessionSlotPlannedDate(a);
  const bPlanned = sessionSlotPlannedDate(b);
  const aDay = normalizeSessionDay(a.routineDay || a.nominalDay || a.day);
  const bDay = normalizeSessionDay(b.routineDay || b.nominalDay || b.day);
  if (aPlanned && bPlanned && aPlanned === bPlanned && (!aDay || !bDay || aDay === bDay)) return true;
  if (a.date && b.date && a.date === b.date && (!aDay || !bDay || aDay === bDay)) return true;
  return false;
}

function stateLoggedSetCount(sets = []) {
  return (sets || []).filter(set =>
    set.weight != null ||
    set.repsNumber != null ||
    set.reps != null ||
    set.durationMinutes ||
    set.duration ||
    set.rpe ||
    set.note
  ).length;
}

function stateSessionSetCount(session = {}) {
  const explicit = Number(session.performedSetCount);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return (session.entries || []).reduce((sum, entry) => sum + stateLoggedSetCount(entry.sets || []), 0);
}

function stateSessionScore(session = {}) {
  return (stateSessionSetCount(session) * 1000) +
    (((session.entries || []).length) * 10) +
    (session.status === "performed" ? 1 : 0);
}

function betterLoggedSession(current, candidate) {
  if (!current) return candidate;
  if (!candidate) return current;
  const currentScore = stateSessionScore(current);
  const candidateScore = stateSessionScore(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;
  const currentTime = Date.parse(current.updatedAt || current.savedAt || current.createdAt || "") || 0;
  const candidateTime = Date.parse(candidate.updatedAt || candidate.savedAt || candidate.createdAt || "") || 0;
  return candidateTime > currentTime ? candidate : current;
}

function routineDaysForProfile(profile = {}) {
  const routines = profile.routines || [];
  const active = routines.find(r => r.id === profile.activeRoutineId) || routines[0];
  return active?.days || [];
}

function plannedExercisesForDay(profile = {}, routineDay = "") {
  const day = normalizeSessionDay(routineDay);
  return (routineDaysForProfile(profile).find(d => d.day === day)?.exercises || []);
}

function planSetCount(plan = {}) {
  return Object.values(plan.setsByExercise || {}).reduce((sum, sets) =>
    sum + (Array.isArray(sets) ? sets.filter(set =>
      set._edited ||
      set._done === true ||
      set._done === false ||
      String(set.weight ?? "").trim() !== "" ||
      String(set.reps ?? "").trim() !== "" ||
      String(set.duration ?? "").trim() !== "" ||
      String(set.rpe ?? "").trim() !== "" ||
      String(set.note ?? "").trim() !== ""
    ).length : 0), 0);
}

function planVisibleExerciseCount(plan = {}, profile = {}, date = "") {
  const routineDay = normalizeSessionDay(plan.routineDay) || (date ? window.RepsData?.dayName?.(date) : null) || "";
  const removed = new Set(plan.removedKeys || []);
  const planned = plannedExercisesForDay(profile, routineDay)
    .map((ex, i) => ({ ...ex, _key: `p-${routineDay}-${i}` }))
    .filter(ex => !removed.has(ex._key));
  const extra = (plan.extraExercises || [])
    .map((ex, i) => ({ ...ex, _key: ex._key || `e-${i}` }))
    .filter(ex => !removed.has(ex._key));
  return planned.length + extra.length;
}

function bestLoggedSessionForPlan(profile = {}, date = "", plan = {}) {
  const plannedDate = plan.plannedDate || date;
  const routineDay = normalizeSessionDay(plan.routineDay);
  return (profile.loggedSessions || []).reduce((best, session) => {
    const sameDate = sessionSlotPlannedDate(session) === plannedDate || session.date === date;
    const sessionDay = normalizeSessionDay(session.routineDay || session.nominalDay || session.day);
    const sameDay = !routineDay || !sessionDay || routineDay === sessionDay;
    if (!sameDate || !sameDay || session.status === "skipped" || stateSessionSetCount(session) <= 0) return best;
    return betterLoggedSession(best, session);
  }, null);
}

function sanitizeProfileForPush(profile = {}) {
  const nextPlans = {};
  for (const [date, plan] of Object.entries(profile.sessionPlansByDate || {})) {
    const logged = bestLoggedSessionForPlan(profile, date, plan);
    if (logged) {
      const visibleExercises = planVisibleExerciseCount(plan, profile, date);
      const loggedExercises = (logged.entries || []).length;
      const sets = planSetCount(plan);
      const loggedSets = stateSessionSetCount(logged);
      if (visibleExercises < loggedExercises || sets < loggedSets) continue;
    }
    nextPlans[date] = plan;
  }
  return { ...profile, sessionPlansByDate: nextPlans };
}

function sanitizeStateForPush(rawState = {}) {
  const next = migrateState(clone(rawState));
  return {
    ...next,
    profiles: (next.profiles || []).map(sanitizeProfileForPush)
  };
}

function mergeByKey(remoteItems = [], localItems = [], keyFn, choose = (_remote, local) => local) {
  const map = new Map();
  (remoteItems || []).forEach((item, index) => {
    const key = keyFn(item, index);
    if (key) map.set(key, item);
  });
  (localItems || []).forEach((item, index) => {
    const key = keyFn(item, index);
    if (!key) return;
    map.set(key, map.has(key) ? choose(map.get(key), item) : item);
  });
  return Array.from(map.values());
}

function mergeFoodByDate(remote = {}, local = {}) {
  const dates = new Set([...Object.keys(remote || {}), ...Object.keys(local || {})]);
  const out = {};
  dates.forEach(date => {
    out[date] = mergeByKey(remote[date] || [], local[date] || [], (item, index) =>
      String(item.id ?? `${item.product || item.name || "food"}:${item.kcal ?? ""}:${item.protein ?? ""}:${item.amount ?? ""}:${index}`)
    );
  });
  return out;
}

function mergeLoggedSessions(remote = [], local = []) {
  return [...(remote || []), ...(local || [])].reduce((list, session) => {
    const index = list.findIndex(existing => sameLoggedSessionSlot(existing, session));
    if (index < 0) return [session, ...list];
    const next = [...list];
    next[index] = betterLoggedSession(next[index], session);
    return next;
  }, []);
}

function mergeProfiles(remoteProfile = {}, localProfile = {}) {
  const merged = { ...remoteProfile, ...localProfile };
  merged.foodByDate = mergeFoodByDate(remoteProfile.foodByDate || {}, localProfile.foodByDate || {});
  merged.dailyOverrides = { ...(remoteProfile.dailyOverrides || {}), ...(localProfile.dailyOverrides || {}) };
  merged.sessionPlansByDate = { ...(remoteProfile.sessionPlansByDate || {}), ...(localProfile.sessionPlansByDate || {}) };
  merged.loggedSessions = mergeLoggedSessions(remoteProfile.loggedSessions || [], localProfile.loggedSessions || []);
  merged.weightEntries = mergeByKey(remoteProfile.weightEntries || [], localProfile.weightEntries || [], item =>
    String(item.id ?? `${item.date}:${item.weight}:${item.note || ""}`)
  );
  merged.customFoodItems = mergeByKey(remoteProfile.customFoodItems || [], localProfile.customFoodItems || [], item =>
    String(item.id || foodCatalogKey(item.product || item.name))
  );
  merged.customExercises = mergeByKey(remoteProfile.customExercises || [], localProfile.customExercises || [], item =>
    String(item.id || item.name)
  );
  merged.hiddenExercises = [...new Set([...(remoteProfile.hiddenExercises || []), ...(localProfile.hiddenExercises || [])])];
  merged.hiddenFoodItems = [...new Set([...(remoteProfile.hiddenFoodItems || []), ...(localProfile.hiddenFoodItems || [])])];
  return sanitizeProfileForPush(merged);
}

function mergeRemoteAndLocalState(remoteState = {}, localState = {}) {
  const remote = migrateState(clone(remoteState));
  const local = sanitizeStateForPush(localState);
  const remoteProfiles = new Map((remote.profiles || []).map(profile => [profile.id, profile]));
  const localProfiles = new Map((local.profiles || []).map(profile => [profile.id, profile]));
  const profileIds = [...new Set([...remoteProfiles.keys(), ...localProfiles.keys()])];
  return migrateState({
    ...remote,
    ...local,
    profiles: profileIds.map(id => {
      const r = remoteProfiles.get(id);
      const l = localProfiles.get(id);
      return r && l ? mergeProfiles(r, l) : sanitizeProfileForPush(l || r);
    })
  });
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      return migrateState(JSON.parse(raw));
    }
  } catch (e) { console.warn("State load failed", e); }
  return migrateState(DEFAULT_STATE);
}

function AppStateProvider({ children }) {
  const [state, setStateRaw] = useState(load);
  const [syncConfig, setSyncConfigState] = useState(loadSyncConfig);
  const [syncMeta, setSyncMetaState] = useState(loadSyncMeta);
  const [syncStatus, setSyncStatus] = useState({ state: "idle", message: "Sync idle" });
  const [syncConflict, setSyncConflict] = useState(null);
  const didMountRef = useRef(false);
  const remoteApplyRef = useRef(false);
  const pushTimerRef = useRef(null);
  const stateRef = useRef(state);
  const syncMetaRef = useRef(syncMeta);
  const pushInFlightRef = useRef(null);

  const setState = (updater) => {
    const base = stateRef.current || state;
    const nextRaw = typeof updater === "function" ? updater(base) : updater;
    const next = migrateState(nextRaw);
    stateRef.current = next;
    setStateRaw(next);
    return next;
  };

  const updateSyncMeta = (updater) => {
    setSyncMetaState(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      syncMetaRef.current = next;
      writeJsonStorage(SYNC_META_KEY, next);
      return next;
    });
  };

  useEffect(() => {
    stateRef.current = state;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (remoteApplyRef.current) {
      remoteApplyRef.current = false;
      return;
    }
    updateSyncMeta(prev => ({ ...prev, dirty: true, conflict: false }));
    if (syncConfig.enabled && syncConfig.token) {
      setSyncStatus({ state: "idle", message: "Local changes saved. Push when done." });
    }
  }, [state]);

  useEffect(() => {
    writeJsonStorage(SYNC_CONFIG_KEY, syncConfig);
  }, [syncConfig]);

  useEffect(() => {
    syncMetaRef.current = syncMeta;
    writeJsonStorage(SYNC_META_KEY, syncMeta);
  }, [syncMeta]);

  const activeProfile = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];

  const updateSyncConfig = (patch) => {
    setSyncConfigState(prev => ({
      ...prev,
      ...patch,
      clientId: patch.clientId || prev.clientId || syncClientId()
    }));
  };

  const disableSync = () => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    setSyncConfigState(prev => ({ ...prev, enabled: false, token: "" }));
    updateSyncMeta(defaultSyncMeta());
    setSyncConflict(null);
    setSyncStatus({ state: "idle", message: "GitHub sync disabled" });
  };

  const replaceState = (nextRaw, options = {}) => {
    const next = migrateState(nextRaw);
    if (options.remoteClean) remoteApplyRef.current = true;
    setState(next);
    if (options.remoteClean) {
      updateSyncMeta(prev => ({ ...prev, dirty: false, conflict: false }));
      setSyncConflict(null);
    }
    return next;
  };

  const exportEffectiveState = () => materializeEffectiveState(state, activeProfile.id);

  const setRemoteCleanState = (nextState, sha, message = "Pulled GitHub state") => {
    remoteApplyRef.current = true;
    stateRef.current = nextState;
    setState(nextState);
    updateSyncMeta(prev => ({
      ...prev,
      lastRemoteSha: sha,
      lastSyncAt: new Date().toISOString(),
      dirty: false,
      conflict: false
    }));
    setSyncConflict(null);
    setSyncStatus({ state: "ok", message });
  };

  const setRemoteMergedDirtyState = (nextState, sha, message = "Pulled GitHub state and kept local edits") => {
    remoteApplyRef.current = true;
    stateRef.current = nextState;
    setState(nextState);
    updateSyncMeta(prev => ({
      ...prev,
      lastRemoteSha: sha,
      lastSyncAt: new Date().toISOString(),
      dirty: true,
      conflict: false
    }));
    setSyncConflict(null);
    setSyncStatus({ state: "ok", message });
  };

  const pullRemoteState = async (options = {}) => {
    const config = options.config || syncConfig;
    if (!config.token) {
      setSyncStatus({ state: "error", message: "Add a GitHub token before pulling." });
      return null;
    }
    try {
      setSyncStatus({ state: "syncing", message: "Pulling GitHub state..." });
      const remote = await fetchGithubState(config);
      if (!remote) {
        setSyncStatus({ state: "ok", message: "No remote state file yet. Push once to create it." });
        return null;
      }
      const remoteState = sanitizeStateForPush(remote.state);
      if (syncMetaRef.current?.dirty && !options.preferRemote) {
        const mergedState = mergeRemoteAndLocalState(remoteState, stateRef.current);
        setRemoteMergedDirtyState(mergedState, remote.sha, "Pull complete. Local changes kept; push to update GitHub.");
      } else {
        setRemoteCleanState(remoteState, remote.sha, "Pull complete. GitHub applied.");
      }
      return remote;
    } catch (e) {
      setSyncStatus({ state: "error", message: e.message || "GitHub pull failed." });
      return null;
    }
  };

  const pushRemoteState = async (options = {}) => {
    if (!options.silent && pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }
    if (pushInFlightRef.current) {
      await pushInFlightRef.current.catch(() => null);
    }
    const config = options.config || syncConfig;
    if (!config.token) {
      if (!options.silent) setSyncStatus({ state: "error", message: "Add a GitHub token before pushing." });
      return null;
    }
    const runPush = async () => {
      if (!options.silent) setSyncStatus({ state: "syncing", message: "Checking GitHub state..." });
      const remote = await fetchGithubState(config);
      let remoteSha = remote?.sha || null;
      let pushState = remote?.state
        ? mergeRemoteAndLocalState(remote.state, stateRef.current)
        : sanitizeStateForPush(stateRef.current);
      if (!options.silent) setSyncStatus({ state: "syncing", message: remote?.state ? "Merging local changes with GitHub..." : "Pushing GitHub state..." });
      let nextSha;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          nextSha = await putGithubState(config, pushState, remoteSha);
          break;
        } catch (e) {
          const isShaConflict = isGithubShaWriteError(e.message);
          if (!isShaConflict || attempt === 2) throw e;
          const latestRemote = await fetchGithubState(config);
          remoteSha = latestRemote?.sha || null;
          pushState = latestRemote?.state
            ? mergeRemoteAndLocalState(latestRemote.state, pushState)
            : sanitizeStateForPush(pushState);
        }
      }
      if (!nextSha) {
        throw new Error("GitHub push failed: no updated file SHA returned.");
      }
      remoteApplyRef.current = true;
      stateRef.current = pushState;
      setState(pushState);
      updateSyncMeta(prev => ({
        ...prev,
        lastRemoteSha: nextSha,
        lastSyncAt: new Date().toISOString(),
        dirty: false,
        conflict: false
      }));
      setSyncConflict(null);
      setSyncStatus({ state: "ok", message: "Push complete. Local changes merged with GitHub." });
      return nextSha;
    };

    const promise = runPush();
    pushInFlightRef.current = promise;
    try {
      return await promise;
    } catch (e) {
      setSyncStatus({ state: "error", message: e.message || "GitHub push failed." });
      return null;
    } finally {
      if (pushInFlightRef.current === promise) pushInFlightRef.current = null;
    }
  };

  const resolveSyncConflict = async (choice) => {
    if (!syncConflict) return;
    if (choice === "remote") await pullRemoteState({ preferRemote: true });
    if (choice === "local") await pushRemoteState();
  };
  const updateProfile = (id, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === id ? { ...p, ...patch } : p)
    }));
  };

  const updateMacros = (id, day, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === id
        ? { ...p, macros: { ...p.macros, [day]: { ...p.macros[day], ...patch } } }
        : p)
    }));
  };

  const setMacroPreset = (id, preset) => {
    const p = PRESETS[preset];
    if (!p) return;
    setState(s => ({
      ...s,
      profiles: s.profiles.map(prof => prof.id === id
        ? { ...prof, macros: structuredClone(p.macros), preset }
        : prof)
    }));
  };

  const addProfile = (name) => {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 24) + "-" + Date.now().toString(36).slice(-4);
    const freshProfile = migrateProfile({
      id,
      name,
      birthday: "",
      unit: "kg",
      hasHistory: false,
      macros: structuredClone(PRESETS.maintain.macros),
      preset: "maintain",
      phase: "maintain",
      foodByDate: {},
      customExercises: [],
      hiddenExercises: [],
      exerciseRenames: {}
    });
    setState(s => ({
      ...s,
      profiles: [...s.profiles, freshProfile],
      activeProfileId: id
    }));
  };

  const setActiveProfile = (id) => setState(s => ({ ...s, activeProfileId: id }));

  const deleteProfile = (id) => {
    setState(s => {
      if (s.profiles.length <= 1) return s;
      const remaining = s.profiles.filter(p => p.id !== id);
      return {
        ...s,
        profiles: remaining,
        activeProfileId: s.activeProfileId === id ? remaining[0].id : s.activeProfileId
      };
    });
  };

  const addFoodEntry = (date, entry) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        foodByDate: {
          ...p.foodByDate,
          [date]: [{ ...entry, id: Date.now() + Math.random() }, ...(p.foodByDate[date] || [])]
        }
      } : p)
    }));
  };

  const removeFoodEntry = (date, id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        foodByDate: {
          ...p.foodByDate,
          [date]: (p.foodByDate[date] || []).filter(f => f.id !== id)
        }
      } : p)
    }));
  };

  const addCustomExercise = (ex) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customExercises: [{ ...ex, id: "custom-" + Date.now() }, ...(p.customExercises || [])]
      } : p)
    }));
  };

  const hideExercise = (name) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        hiddenExercises: [...new Set([...(p.hiddenExercises || []), name])]
      } : p)
    }));
  };

  const unhideExercise = (name) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        hiddenExercises: (p.hiddenExercises || []).filter(n => n !== name)
      } : p)
    }));
  };

  const deleteSession = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        deletedSessionIds: [...new Set([...(p.deletedSessionIds || []), id])]
      } : p)
    }));
  };

  const restoreSession = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        deletedSessionIds: (p.deletedSessionIds || []).filter(x => x !== id)
      } : p)
    }));
  };

  const editSession = (id, patch) => {
    const { _clearSessionPlanDates, ...sessionPatch } = patch || {};
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const raw = (p.loggedSessions || []).find(x => x.id === id);
        const previousEffectiveDate = (p.sessionEdits || {})[id]?.date || raw?.date;
        const nextEffectiveDate = sessionPatch.date || previousEffectiveDate;
        const previousPlannedDate = (p.sessionEdits || {})[id]?.plannedDate || raw?.plannedDate;
        const nextPlannedDate = sessionPatch.plannedDate || previousPlannedDate;
        const datesToClear = new Set([
          raw?.date,
          previousEffectiveDate,
          nextEffectiveDate,
          previousPlannedDate,
          nextPlannedDate,
          ...(_clearSessionPlanDates || [])
        ].filter(Boolean));
        const nextPlans = Object.fromEntries(
          Object.entries(p.sessionPlansByDate || {}).filter(([date]) => !datesToClear.has(date))
        );
        return {
          ...p,
          sessionEdits: {
            ...(p.sessionEdits || {}),
            [id]: { ...((p.sessionEdits || {})[id] || {}), ...sessionPatch }
          },
          sessionPlansByDate: nextPlans
        };
      })
    }));
  };

  const clearSessionEdit = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        sessionEdits: Object.fromEntries(Object.entries(p.sessionEdits || {}).filter(([k]) => k !== id))
      } : p)
    }));
  };

  // Per-date Log adjustments (persisted overrides on the planned routine)
  const updateSessionPlan = (date, patch) => {
    const stampedPatch = { ...(patch || {}), updatedAt: patch?.updatedAt || new Date().toISOString() };
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        sessionPlansByDate: {
          ...(p.sessionPlansByDate || {}),
          [date]: { ...((p.sessionPlansByDate || {})[date] || {}), ...stampedPatch }
        }
      } : p)
    }));
  };

  // Manual daily-log overrides (weight / kcal / protein for any date)
  const updateDailyOverride = (date, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        dailyOverrides: {
          ...(p.dailyOverrides || {}),
          [date]: { ...((p.dailyOverrides || {})[date] || {}), ...patch }
        }
      } : p)
    }));
  };

  const clearDailyOverride = (date, field) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const current = (p.dailyOverrides || {})[date] || {};
        if (!field) {
          // Drop the entire day
          return {
            ...p,
            dailyOverrides: Object.fromEntries(
              Object.entries(p.dailyOverrides || {}).filter(([k]) => k !== date)
            )
          };
        }
        const nextMap = { ...(p.dailyOverrides || {}) };
        nextMap[date] = { ...current, [field]: null };
        return { ...p, dailyOverrides: nextMap };
      })
    }));
  };

  // Per-exercise per-date annotations
  const setExerciseAnnotation = (exerciseName, date, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const all = p.exerciseAnnotations || {};
        const forEx = { ...(all[exerciseName] || {}) };
        forEx[date] = { ...(forEx[date] || {}), ...patch };
        return { ...p, exerciseAnnotations: { ...all, [exerciseName]: forEx } };
      })
    }));
  };

  const clearExerciseAnnotation = (exerciseName, date) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const all = p.exerciseAnnotations || {};
        if (!all[exerciseName] || !all[exerciseName][date]) return p;
        const forEx = { ...all[exerciseName] };
        delete forEx[date];
        const nextAll = { ...all };
        if (Object.keys(forEx).length === 0) delete nextAll[exerciseName];
        else nextAll[exerciseName] = forEx;
        return { ...p, exerciseAnnotations: nextAll };
      })
    }));
  };

  const clearSessionPlan = (date) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        sessionPlansByDate: Object.fromEntries(
          Object.entries(p.sessionPlansByDate || {}).filter(([k]) => k !== date)
        )
      } : p)
    }));
  };

  const addLoggedSession = (session) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        loggedSessions: [session, ...(p.loggedSessions || [])]
      } : p)
    }));
  };

  const removeLoggedSession = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        loggedSessions: (p.loggedSessions || []).filter(x => x.id !== id)
      } : p)
    }));
  };

  const upsertLoggedSession = (session, options = {}) => {
    const stampedSession = {
      ...session,
      updatedAt: session.updatedAt || new Date().toISOString()
    };
    const clearDates = new Set([
      stampedSession.date,
      stampedSession.plannedDate,
      ...(options.clearPlanDates || [])
    ].filter(Boolean));
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const removedIds = new Set();
        const keptSessions = (p.loggedSessions || []).filter(existing => {
          const remove = sameLoggedSessionSlot(existing, stampedSession);
          if (remove && existing.id) removedIds.add(existing.id);
          return !remove;
        });
        const nextEdits = Object.fromEntries(
          Object.entries(p.sessionEdits || {}).filter(([id]) => !removedIds.has(id) && id !== stampedSession.id)
        );
        const nextPlans = Object.fromEntries(
          Object.entries(p.sessionPlansByDate || {}).filter(([date]) => !clearDates.has(date))
        );
        return {
          ...p,
          loggedSessions: [stampedSession, ...keptSessions],
          sessionEdits: nextEdits,
          sessionPlansByDate: nextPlans
        };
      })
    }));
  };

  const addCustomFoodItem = (item) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customFoodItems: [{ ...item, id: "food-" + Date.now() }, ...(p.customFoodItems || [])]
      } : p)
    }));
  };

  const removeCustomFoodItem = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customFoodItems: (p.customFoodItems || []).filter(f => f.id !== id)
      } : p)
    }));
  };

  // Routines
  const addRoutine = (routine) => {
    const id = "routine-" + Date.now().toString(36);
    const newRoutine = { ...routine, id };
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        routines: [...(p.routines || []), newRoutine],
        activeRoutineId: p.activeRoutineId || id
      } : p)
    }));
    return id;
  };

  const updateRoutine = (id, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        routines: (p.routines || []).map(r => r.id === id ? { ...r, ...patch } : r)
      } : p)
    }));
  };

  const deleteRoutine = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        routines: (p.routines || []).filter(r => r.id !== id),
        activeRoutineId: p.activeRoutineId === id
          ? ((p.routines || []).filter(r => r.id !== id)[0]?.id || null)
          : p.activeRoutineId
      } : p)
    }));
  };

  const setActiveRoutine = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? { ...p, activeRoutineId: id } : p)
    }));
  };

  // Custom training blocks
  const addCustomBlock = (block) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customBlocks: [...(p.customBlocks || []), { ...block, id: "block-" + Date.now().toString(36) }]
      } : p)
    }));
  };

  const updateCustomBlock = (id, patch) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customBlocks: (p.customBlocks || []).map(b => b.id === id ? { ...b, ...patch } : b)
      } : p)
    }));
  };

  const deleteCustomBlock = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === s.activeProfileId ? {
        ...p,
        customBlocks: (p.customBlocks || []).filter(b => b.id !== id)
      } : p)
    }));
  };

  const renameExercise = (fromName, toName) => {
    const from = String(fromName || "").trim();
    const to = String(toName || "").trim();
    if (!from || !to || from === to) return;
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => {
        if (p.id !== s.activeProfileId) return p;
        const renames = { ...(p.exerciseRenames || {}) };
        for (const [k, v] of Object.entries(renames)) {
          if (k === from || v === from) renames[k] = to;
        }
        renames[from] = to;
        return {
          ...p,
          exerciseRenames: renames,
          customExercises: (p.customExercises || []).map(ex => ex.name === from ? { ...ex, name: to } : ex),
          hiddenExercises: (p.hiddenExercises || []).map(n => n === from ? to : n)
        };
      })
    }));
  };

  const value = {
    state, setState,
    activeProfile,
    replaceState, exportEffectiveState,
    updateProfile, updateMacros, setMacroPreset,
    addProfile, setActiveProfile, deleteProfile,
    addFoodEntry, removeFoodEntry,
    addCustomFoodItem, removeCustomFoodItem,
    addCustomExercise, hideExercise, unhideExercise,
    deleteSession, restoreSession, editSession, clearSessionEdit,
    addLoggedSession, removeLoggedSession, upsertLoggedSession,
    updateSessionPlan, clearSessionPlan,
    updateDailyOverride, clearDailyOverride,
    setExerciseAnnotation, clearExerciseAnnotation,
    renameExercise,
    addRoutine, updateRoutine, deleteRoutine, setActiveRoutine,
    addCustomBlock, updateCustomBlock, deleteCustomBlock,
    syncConfig, syncMeta, syncStatus, syncConflict,
    updateSyncConfig, disableSync, pullRemoteState, pushRemoteState, resolveSyncConflict,
    PRESETS, PHASES, DAY_KEYS, DEFAULT_PROGRESSION_RULES
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function useApp() { return useContext(AppContext); }

// Today's day-of-week key based on TODAY constant
function todayDayKey() {
  const today = window.RepsData?.TODAY || "2026-05-21";
  return window.RepsData?.dayName(today) || "Thu";
}

function ageFrom(birthday) {
  if (!birthday) return null;
  const today = window.RepsData?.TODAY || new Date().toISOString().slice(0,10);
  const [by, bm, bd] = birthday.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

window.RepsState = { AppStateProvider, useApp, AppContext, todayDayKey, ageFrom, DAY_KEYS, PRESETS, PHASES, DEFAULT_PROGRESSION_RULES, STORE_KEY };
