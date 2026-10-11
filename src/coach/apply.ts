// Applying coach actions and saving the coach's inputs through the LocalStore (docs/COACH.md §7).
// Every write goes through local.save, so it lands in IndexedDB and the outbox and syncs like any edit.

import type { LocalStore } from "../data/local";
import type { Base, NutritionTarget, PainCheck } from "../data/types";
import { planTargetRow } from "../lib/nutrition";
import { adjustmentsOf, type Adjustment, type CoachAction } from "../plan/adjustments";
import { activeProgram, latestMaxes, planIds } from "../plan/bridge";
import { reduceTrainingMax } from "../plan/engine";
import { elbowMonthlyRow, morningAnswer, painCheckRow, type ElbowMonthly } from "../plan/pain";

export interface ApplyResult {
  ok: boolean;
  /** Short text for a toast: what changed, or why nothing did. */
  message: string;
  adjustment?: Adjustment;
}

const sign = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

function sameAction(a: CoachAction, b: CoachAction): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Appends an adjustment to the active programme row's rules.adjustments. */
async function recordAdjustment(local: LocalStore, adj: Adjustment): Promise<boolean> {
  const program = activeProgram(local.all("programs"));
  if (!program) return false;
  const rules = program.rules ?? {};
  await local.save("programs", { id: program.id, rules: { ...rules, adjustments: [...adjustmentsOf(rules), adj] } });
  return true;
}

/**
 * Applies a coach action ("Apply" button):
 * - kcal → a nutrition_targets row effective `from` (next Monday): the current row copied with kcal ± 100
 *   (carbs ± 25 g, per-weekday kcal ± 100); an existing row on that date is updated instead;
 * - tm_reduce → new training_maxes rows for squat and deadlift, −5%, reason missed_weeks, dated `today`;
 * - deload_now, skip_deload, repeat_week (old), extra_sets, main_lift_set, swap, cut_sets, recalibrate → stored for
 *   applyAdjustments / planState.
 * Every applied action is also recorded in programs.rules.adjustments (so the report shows it as applied).
 * Applying the same action twice does nothing the second time.
 */
export async function applyCoachAction(local: LocalStore, action: CoachAction,
  opts: { signalId: string; today: string; now?: string }): Promise<ApplyResult> {
  const program = activeProgram(local.all("programs"));
  const existing = program ? adjustmentsOf(program.rules) : [];
  if (existing.some((a) => sameAction(a.data, action) && (action.kind !== "tm_reduce" || a.created.slice(0, 10) === opts.today))) {
    return { ok: false, message: "Already applied." };
  }
  const adj: Adjustment = {
    id: crypto.randomUUID(), kind: action.kind, created: opts.now ?? new Date().toISOString(), signalId: opts.signalId, data: action
  };

  if (action.kind === "kcal") {
    adj.writes = [await writeKcalTarget(local, action, opts.signalId, opts.today)];
    await recordAdjustment(local, adj);
    return { ok: true, message: `Calories ${sign(action.delta)} from ${action.from}.`, adjustment: adj };
  }

  if (action.kind === "tm_reduce") {
    const ids = planIds(local.all("exercises"));
    const latest = latestMaxes(local.all("training_maxes"), ids);
    const rows = (["squat", "deadlift"] as const).flatMap((lift) => {
      const v = latest[lift];
      const id = ids.get(lift);
      return v != null && id ? [{
        exercise_id: id, program_id: program?.id ?? null, effective_date: opts.today, value_kg: reduceTrainingMax(v, action.percent),
        reason: "missed_weeks" as const, source_set_id: null, note: `−${action.percent}% after a break (from ${v})`
      }] : [];
    });
    if (!rows.length) return { ok: false, message: "No training max to lower yet." };
    const saved = await local.save("training_maxes", rows);
    adj.writes = saved.map((r) => ({ table: "training_maxes" as const, id: r.id }));
    await recordAdjustment(local, adj);
    return { ok: true, message: `Training maxes −${action.percent}%.`, adjustment: adj };
  }

  if (!program) return { ok: false, message: "Start the plan first." };
  await recordAdjustment(local, adj);
  return { ok: true, message: "Plan updated.", adjustment: adj };
}

async function writeKcalTarget(local: LocalStore, action: Extract<CoachAction, { kind: "kcal" }>, signalId: string, today: string): Promise<NonNullable<Adjustment["writes"]>[number]> {
  const targets = local.all("nutrition_targets")
    .filter((t) => t.effective_from <= action.from)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at));
  const current: Omit<NutritionTarget, keyof Base> = targets[0] ?? planTargetRow();
  const d = action.delta;
  const perWeekday = current.per_weekday
    ? Object.fromEntries(Object.entries(current.per_weekday).map(([k, v]) => [k, { ...v, kcal: v.kcal + d }]))
    : null;
  const note = `Coach ${sign(d)} kcal (${signalId}), applied ${today}.`;
  const sameDay = targets[0]?.effective_from === action.from ? targets[0] : undefined;
  const restore = sameDay ? { kcal: sameDay.kcal, carbs: sameDay.carbs, per_weekday: sameDay.per_weekday, note: sameDay.note } : undefined;
  const [row] = await local.save("nutrition_targets", {
    ...(sameDay ? { id: sameDay.id } : {}),
    effective_from: action.from,
    phase: current.phase,
    kcal: Number(current.kcal) + d,
    protein: current.protein,
    protein_per_kg: current.protein_per_kg ?? null,
    carbs: current.carbs != null ? Math.max(0, Number(current.carbs) + d / 4) : null,
    fat: current.fat,
    per_weekday: perWeekday,
    target_weight: current.target_weight,
    note: sameDay?.note ? `${sameDay.note} ${note}` : note
  });
  return { table: "nutrition_targets", id: row!.id, ...(restore ? { restore } : {}) };
}

/**
 * Undo: removes an adjustment from the programme and takes back the rows it wrote (a new calorie target or
 * training-max row is removed; an updated target row gets its previous values back).
 */
export async function removeAdjustment(local: LocalStore, adjustmentId: string): Promise<boolean> {
  const program = activeProgram(local.all("programs"));
  if (!program) return false;
  const list = adjustmentsOf(program.rules);
  const adj = list.find((a) => a.id === adjustmentId);
  if (!adj) return false;
  for (const w of adj.writes ?? []) {
    if (w.restore) await local.save(w.table, { id: w.id, ...w.restore } as never);
    else await local.remove(w.table, [w.id]);
  }
  await local.save("programs", { id: program.id, rules: { ...program.rules, adjustments: list.filter((a) => a.id !== adjustmentId) } });
  return true;
}

/**
 * One-time upgrade: the plan's default target row created before protein_per_kg existed (2,800 kcal, 150 g
 * from the plan start) gets protein_per_kg = 2.0, so protein follows bodyweight (playbook N-PROTEIN). Rows he
 * edited (other numbers) are left alone. Returns true when it wrote.
 */
export async function ensurePlanProteinPerKg(local: LocalStore, planStart: string): Promise<boolean> {
  const row = local.all("nutrition_targets").find((t) => t.effective_from === planStart && t.protein_per_kg == null
    && Number(t.kcal) === 2800 && Number(t.protein) === 150);
  if (!row) return false;
  await local.save("nutrition_targets", { id: row.id, protein_per_kg: 2 });
  return true;
}

// ---------- the coach's inputs ----------

/**
 * Next-morning pain answer, 0–10 (Today prompt, E14): writes pain_checks.morning_score and the legacy
 * next_morning (sore when the score is ≥ the site's usual morning level + 2). Returns what was written; `flare`
 * means the coach will suggest a swap (and the wrist ladder switches to isometric holds for an elbow).
 */
export async function answerPainCheck(local: LocalStore, painCheckId: string, score: number): Promise<{ morning_score: number; next_morning: PainCheck["next_morning"]; flare: boolean }> {
  const all = local.all("pain_checks");
  const check = all.find((p) => p.id === painCheckId);
  const answer = check
    ? morningAnswer(all, check, score)
    : { morning_score: Math.max(0, Math.min(10, Math.round(score))), next_morning: null };
  await local.save("pain_checks", { id: painCheckId, ...answer });
  return { ...answer, flare: answer.next_morning === "sore" };
}

/**
 * A pain check from the logger's 0–10 slider and "sharp" toggle (E14): writes pain_score and during_set.
 * The logger shows "stop this exercise today" when painAction(score, sharp) is "stop" (≥ 6 or sharp).
 */
export async function savePainCheck(local: LocalStore, input: Parameters<typeof painCheckRow>[0]): Promise<PainCheck> {
  const [row] = await local.save("pain_checks", painCheckRow(input));
  return row!;
}

/** The monthly elbow check (3 questions, 0–10 each): a pain_checks row with site elbow_monthly, scores in `note`. */
export async function saveElbowMonthly(local: LocalStore, date: string, scores: ElbowMonthly): Promise<PainCheck> {
  const [row] = await local.save("pain_checks", elbowMonthlyRow(date, scores));
  return row!;
}

/**
 * Thursday boxing "Gassed? 1–5 + the round you faded" (E22): the day's boxing row gets `rating` and `rounds`
 * (= the fade round); without a boxing row that day one is created (done, 45 min).
 */
export async function saveGassed(local: LocalStore, date: string, rating: 1 | 2 | 3 | 4 | 5, fadeRound: number | null): Promise<void> {
  const existing = local.all("conditioning").find((c) => c.kind === "boxing" && c.date === date);
  if (existing) {
    await local.save("conditioning", { id: existing.id, rating, rounds: fadeRound });
    return;
  }
  await local.save("conditioning", {
    date, kind: "boxing", minutes: 45, loop_time_s: null, rounds: fadeRound, first_round_count: null, last_round_count: null,
    rating, done: true, note: null
  });
}

/**
 * A home task on a conditioning day done or not (E13: the Wednesday wrist ladder at home): a conditioning row of
 * kind "other" with note = the task id ("wrist_ladder"), done true. One per task and day: an existing row is updated.
 */
export async function saveHomeTask(local: LocalStore, date: string, taskId: string, done: boolean): Promise<void> {
  const existing = local.all("conditioning").find((c) => c.kind === "other" && c.date === date && c.note === taskId);
  if (existing) {
    await local.save("conditioning", { id: existing.id, done });
    return;
  }
  if (!done) return;
  await local.save("conditioning", {
    date, kind: "other", minutes: null, loop_time_s: null, rounds: null, first_round_count: null, last_round_count: null,
    rating: null, done: true, note: taskId
  });
}

/**
 * Progress photos taken (E20, M-MEASURE): a body_measurements row of kind "other", value 1, note "photos".
 * One "other" row per day (unique per user, date, kind): an existing one that day is updated.
 */
export async function savePhotosDone(local: LocalStore, date: string): Promise<void> {
  const existing = local.all("body_measurements").find((m) => m.kind === "other" && m.date === date);
  await local.save("body_measurements", { ...(existing ? { id: existing.id } : {}), date, kind: "other", value: 1, unit: "cm", source: "app", note: "photos" });
}

/** Session energy 1–5 (finish-workout sheet): writes sessions.energy. */
export async function saveSessionEnergy(local: LocalStore, sessionId: string, energy: 1 | 2 | 3 | 4 | 5): Promise<void> {
  await local.save("sessions", { id: sessionId, energy });
}

/** Waist at the navel in cm. One per day (unique per user, date, kind): an existing entry that day is updated. */
export async function saveWaist(local: LocalStore, date: string, cm: number): Promise<void> {
  const existing = local.all("body_measurements").find((m) => m.kind === "waist" && m.date === date);
  await local.save("body_measurements", { ...(existing ? { id: existing.id } : {}), date, kind: "waist", value: cm, unit: "cm", source: "app", note: existing?.note ?? null });
}

/**
 * Hours slept, dated the morning the night ended. One health_daily row per day (unique per user and date):
 * an existing row (e.g. from the iOS Shortcut) keeps its other fields and source; a new row is source "manual".
 */
export async function saveSleep(local: LocalStore, date: string, hours: number): Promise<void> {
  const existing = local.all("health_daily").find((h) => h.date === date);
  const minutes = Math.round(hours * 60);
  if (existing) {
    await local.save("health_daily", { id: existing.id, sleep_total_min: minutes });
    return;
  }
  await local.save("health_daily", {
    date, sleep_total_min: minutes, sleep_deep_min: null, sleep_rem_min: null, sleep_core_min: null, sleep_awake_min: null,
    resting_hr: null, hrv_sdnn_ms: null, source: "manual"
  });
}
