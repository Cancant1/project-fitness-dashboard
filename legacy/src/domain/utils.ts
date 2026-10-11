import type {
  Exercise,
  FoodLogEntry,
  MovementGroup,
  Profile,
  RepsSnapshot,
  SetResult,
  Unit,
  WorkoutSession
} from "./types";

export const nowIso = () => new Date().toISOString();

export const todayIso = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

export const uid = (prefix: string) => {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
};

export const slug = (value: unknown) => String(value ?? "")
  .trim()
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 72);

export const safeNumber = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const parseDecimalInput = (value: unknown): number | null => {
  const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const movementFor = (name: unknown, explicit?: unknown): MovementGroup => {
  if (["Push", "Pull", "Legs", "Conditioning", "Other"].includes(String(explicit))) {
    return explicit as MovementGroup;
  }
  const text = String(name ?? "").toLowerCase();
  if (/boxing|cardio|conditioning|run|cycle|bike|rowing machine/.test(text)) return "Conditioning";
  if (/squat|leg|calf|lunge|split squat|romanian|good morning|hamstring/.test(text)) return "Legs";
  if (/press|bench|fly|pushdown|tricep|lateral|dip/.test(text)) return "Push";
  if (/deadlift|row|pull|chin|curl|pulldown|face pull|rear delt/.test(text)) return "Pull";
  return "Other";
};

export const unitFor = (value: unknown, exerciseName = ""): Unit => {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized === "lbs" || normalized === "lb") return "lb";
  if (normalized === "kg") return "kg";
  if (/minute|hour|boxing|cardio/.test(`${normalized} ${exerciseName}`.toLowerCase())) return "min";
  if (/bodyweight|bw/.test(normalized)) return "bodyweight";
  return "kg";
};

export const formatShortDate = (date: string, includeWeekday = false) => {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: includeWeekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: new Date(`${date}T00:00:00`).getFullYear() === new Date().getFullYear() ? undefined : "numeric"
  }).format(new Date(`${date}T00:00:00`));
};

export const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const startOfWeek = (date = todayIso()) => {
  const value = new Date(`${date}T12:00:00Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
};

export const dateRange = (values: string[]) => {
  const dates = values.filter(Boolean).sort();
  return { min: dates[0] ?? null, max: dates.at(-1) ?? null };
};

export const epley = (load: number, reps: number) => reps <= 1 ? load : load * (1 + reps / 30);

export const setHasResult = (set: SetResult) => set.completed || set.reps != null || set.durationMinutes != null;

export const isCompletedSession = (session: WorkoutSession) => session.status === "completed" && !session.deletedAt;

export const sessionSetCount = (session: WorkoutSession) => session.deletedAt ? 0 : session.performances
  .filter((performance) => !performance.deletedAt && !performance.skipped)
  .reduce((sum, performance) => sum + performance.sets.filter((set) => set.completed && !set.deletedAt).length, 0);

// One unit for aggregate volume; time/bodyweight sets have no external load.
export const sessionVolume = (session: WorkoutSession) => session.deletedAt ? 0 : session.performances
  .filter((performance) => !performance.deletedAt && !performance.skipped)
  .reduce((total, performance) => total + performance.sets.reduce((sum, set) => {
    if (!set.completed || set.deletedAt || (set.unit !== "kg" && set.unit !== "lb") ||
      !Number.isFinite(set.load) || !Number.isFinite(set.reps) || (set.load ?? 0) <= 0 || (set.reps ?? 0) <= 0) return sum;
    return sum + set.load! * set.reps! * (set.unit === "lb" ? 0.45359237 : 1);
  }, 0), 0);

export const foodTotals = (entries: FoodLogEntry[]) => entries.reduce((totals, entry) => ({
  kcal: totals.kcal + entry.kcal,
  protein: totals.protein + entry.protein,
  carbs: totals.carbs + (entry.carbs ?? 0),
  fat: totals.fat + (entry.fat ?? 0)
}), { kcal: 0, protein: 0, carbs: 0, fat: 0 });

// The untouched fallback profile can share an ID with the original user's profile.
export const isPlaceholderProfile = (profile: Profile) => profile.id === "local" && profile.name === "Profile" &&
  profile.source === "reps-v1" && profile.createdAt === profile.updatedAt && !profile.birthday && !profile.activeRoutineId;

export const activeProfile = (snapshot: RepsSnapshot) => snapshot.profiles.find(
  (profile) => profile.id === snapshot.settings.activeProfileId && !profile.deletedAt
) ?? snapshot.profiles.find((profile) => !profile.deletedAt) ?? snapshot.profiles[0];

export const exerciseById = (snapshot: RepsSnapshot, id: string) => snapshot.exercises.find((exercise) => exercise.id === id);

export const searchExercise = (exercises: Exercise[], query: string) => {
  const needle = query.trim().toLowerCase();
  if (!needle) return exercises;
  return exercises.filter((exercise) => [exercise.name, ...exercise.aliases, exercise.movement, ...exercise.muscles, ...exercise.equipment]
    .join(" ").toLowerCase().includes(needle));
};

export const deepClone = <T,>(value: T): T => structuredClone(value);

export const hashText = async (value: string) => {
  if (typeof crypto === "undefined" || !crypto.subtle) return `len-${value.length}`;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
