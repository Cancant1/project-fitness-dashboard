// Weekly fractional sets per muscle: the average of Mario's good weeks (5+ sessions) and the Strength
// Return Plan's figure (from the plan page). Direct sets count 1, indirect ½. History supplies this
// baseline; judgements use only plan-period data.

import type { Muscle } from "../plan/types";

export interface MuscleReference {
  /** Label as stored on history exercises ("Side delts"). */
  muscle: string;
  short: string;
  /** Plan muscle key (extra_sets action, extraSetTargets). */
  key: Muscle;
  good: number;
  plan: number;
}

export const REFERENCE: readonly MuscleReference[] = [
  { muscle: "Chest", short: "Chest", key: "chest", good: 15.8, plan: 11 },
  { muscle: "Back", short: "Back", key: "back", good: 16.9, plan: 11.5 },
  { muscle: "Quads", short: "Quads", key: "quads", good: 11.3, plan: 10 },
  { muscle: "Hamstrings", short: "Hams", key: "hamstrings", good: 6.6, plan: 6.0 },
  { muscle: "Calves", short: "Calves", key: "calves", good: 6.0, plan: 4 },
  { muscle: "Rear delts", short: "Rear delt", key: "rear_delts", good: 3.3, plan: 2 },
  { muscle: "Side delts", short: "Side delt", key: "side_delts", good: 12.5, plan: 10 },
  { muscle: "Triceps", short: "Triceps", key: "triceps", good: 17.6, plan: 9.5 },
  { muscle: "Biceps", short: "Biceps", key: "biceps", good: 20.0, plan: 11.5 }
];

/** "Side delts", "side_delts" and " SIDE DELTS " all → "side delts" (history names vs plan keys). */
export const muscleKey = (m: string): string => m.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
