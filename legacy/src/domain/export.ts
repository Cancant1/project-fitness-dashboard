import type { RepsSnapshot } from "./types";

export const csvCell = (value: unknown) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const toCsv = (headers: string[], rows: unknown[][]) => `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;

export function trainingCsv(snapshot: RepsSnapshot) {
  const headers = ["session_id", "date", "title", "status", "planned_date", "duration_minutes", "session_rpe", "energy", "session_notes", "exercise_id", "exercise", "exercise_order", "set_id", "set_index", "set_type", "load", "unit", "reps", "duration_minutes_set", "rpe", "rir", "completed", "set_note"];
  const rows = snapshot.sessions.flatMap((session) => {
    const sessionValues = [session.id, session.actualDate, session.title, session.status, session.plannedDate, session.durationMinutes, session.sessionRpe, session.energy, session.notes];
    const setRows = session.performances.flatMap((performance) => performance.sets.map((set) => [...sessionValues, performance.exerciseId, performance.exerciseNameSnapshot, performance.order + 1, set.id, set.index, set.type, set.load, set.unit, set.reps, set.durationMinutes, set.rpe, set.rir, set.completed, set.note]));
    return setRows.length ? setRows : [[...sessionValues, "", "", "", "", "", "", "", "", "", "", "", "", "", ""]];
  });
  return toCsv(headers, rows);
}

export function nutritionCsv(snapshot: RepsSnapshot) {
  const headers = ["entry_id", "date", "time", "meal", "food_id", "food", "serving", "quantity", "kcal", "protein_g", "carbs_g", "fat_g", "note", "source", "deleted_at"];
  const rows = snapshot.foodEntries.map((entry) => [entry.id, entry.date, entry.time, entry.meal, entry.foodId, entry.nameSnapshot, entry.servingLabelSnapshot, entry.quantity, entry.kcal, entry.protein, entry.carbs, entry.fat, entry.note, entry.source, entry.deletedAt]);
  return toCsv(headers, rows);
}

export function measurementsCsv(snapshot: RepsSnapshot) {
  const headers = ["measurement_id", "date", "type", "value", "unit", "note", "source", "deleted_at"];
  const rows = snapshot.measurements.map((entry) => [entry.id, entry.date, entry.type, entry.value, entry.unit, entry.note, entry.source, entry.deletedAt]);
  return toCsv(headers, rows);
}
