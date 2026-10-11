import { STRENGTH_RETURN_PLAN as P } from './strengthReturn';
import {
  DEFAULT_EQUIPMENT,
  bodyweightRateCheck,
  checkpointStatus,
  dayForDate,
  doubleProgression,
  dumbbellStep,
  e1rm,
  extraSetTargets,
  incrementAfterRepOut,
  nextTrainingMax,
  platesPerSide,
  prescribeDay,
  prescribeWeek,
  progressionStep,
  pullupStep,
  reduceTrainingMax,
  rideMinutes,
  roundBarbell,
  roundsNextWeek,
  shiftAfterMissedWeek,
  tmChangePercent,
  trainingMaxFromSet,
  warmupRamp,
  weekForDate,
} from './engine';
import type { PlanState, PrescribedExercise, PrescribedSet, RideRule } from './types';

const STATE: PlanState = {
  trainingMaxes: { squat: 140, deadlift: 200 },
  currentLoads: { incline_db_press: 22.5, weighted_pullup: 5 },
};

const ex = (week: number, day: Parameters<typeof prescribeDay>[2], key: string, state = STATE): PrescribedExercise => {
  const e = prescribeDay(P, week, day, state).exercises.find((x) => x.exerciseKey === key);
  if (!e) throw new Error(`${key} not prescribed in week ${week} ${day}`);
  return e;
};
const shape = (sets: PrescribedSet[]) => sets.map((s) => [s.kind, s.load, s.reps]);
const notWarmup = (sets: PrescribedSet[]) => sets.filter((s) => s.kind !== 'warmup');
const weekTotal = (week: number, state = STATE) => prescribeWeek(P, week, state).reduce((n, d) => n + d.workingSetCount, 0);

describe('training max', () => {
  it('TM = load × (1 + reps/30), floored to 2.5 — plan example 100 × 12 → 140', () => {
    expect(trainingMaxFromSet(100, 12)).toBe(140);
    expect(trainingMaxFromSet(140, 5)).toBe(162.5); // 163.33
    expect(trainingMaxFromSet(100, 5)).toBe(115); // 116.67
  });

  it('e1rm is Epley for 1–12 reps only', () => {
    expect(e1rm(100, 12)).toBeCloseTo(140);
    expect(e1rm(145, 5)).toBeCloseTo(169.17, 2);
    expect(e1rm(100, 13)).toBeNull();
    expect(e1rm(100, 0)).toBeNull();
  });

  it('change table', () => {
    expect([-5, -2, -1, 0, 1, 2, 3, 7].map(tmChangePercent)).toEqual([-5, -5, -2, 1, 2, 3, 4, 4]);
  });

  it('nextTrainingMax floors to 2.5 (default 2)', () => {
    expect(nextTrainingMax(140, 8, 10)).toBe(132.5); // −5% → 133
    expect(nextTrainingMax(140, 9, 10)).toBe(135); // −2% → 137.2
    expect(nextTrainingMax(140, 10, 10)).toBe(140); // +1% → 141.4: floor keeps the TM
    expect(nextTrainingMax(140, 11, 10)).toBe(142.5); // +2% → 142.8
    expect(nextTrainingMax(140, 12, 10)).toBe(142.5); // +3% → 144.2
    expect(nextTrainingMax(140, 15, 10)).toBe(145); // +4% → 145.6
    expect(nextTrainingMax(200, 7, 7)).toBe(200); // +1% → 202: below 250 kg a hit target never moves a floored TM
    expect(nextTrainingMax(200, 8, 7)).toBe(202.5); // +2% → 204
  });

  it('nextTrainingMax can reproduce the plan page (nearest)', () => {
    expect(nextTrainingMax(140, 10, 10, 'nearest')).toBe(142.5);
    expect(nextTrainingMax(140, 15, 10, 'nearest')).toBe(145);
  });

  it('missed two weeks or more: −5%', () => {
    expect(reduceTrainingMax(150)).toBe(142.5);
  });
});

describe('load steps', () => {
  const rack = DEFAULT_EQUIPMENT.dumbbellRackKg;

  it('rack is 2–20 by 2, then 22.5–50 by 2.5', () => {
    expect(rack).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40, 42.5, 45, 47.5, 50]);
  });

  it('dumbbellStep walks the rack and stops at the ends', () => {
    expect(dumbbellStep(22.5, 1)).toBe(25);
    expect(dumbbellStep(20, 1)).toBe(22.5);
    expect(dumbbellStep(22.5, -1)).toBe(20);
    expect(dumbbellStep(18, -1)).toBe(16);
    expect(dumbbellStep(21, 1)).toBe(22.5);
    expect(dumbbellStep(21, -1)).toBe(20);
    expect(dumbbellStep(50, 1)).toBe(50);
    expect(dumbbellStep(2, -1)).toBe(2);
    expect(dumbbellStep(25, 0)).toBe(25);
  });

  it('pullupStep is ±2.5 kg, never below bodyweight', () => {
    expect(pullupStep(5, 1)).toBe(7.5);
    expect(pullupStep(2.5, -1)).toBe(0);
    expect(pullupStep(0, -1)).toBe(0);
  });

  it('roundBarbell floors to 2.5', () => {
    expect(roundBarbell(101.5)).toBe(100);
    expect(roundBarbell(169.99999999999997)).toBe(170);
  });

  it('incrementAfterRepOut: ≥10 up, 6–9 same, ≤5 down', () => {
    expect(incrementAfterRepOut('incline_db_press', 22.5, 10)).toEqual({ load: 25, direction: 1 });
    expect(incrementAfterRepOut('incline_db_press', 22.5, 9)).toEqual({ load: 22.5, direction: 0 });
    expect(incrementAfterRepOut('incline_db_press', 22.5, 6)).toEqual({ load: 22.5, direction: 0 });
    expect(incrementAfterRepOut('incline_db_press', 22.5, 5)).toEqual({ load: 20, direction: -1 });
    expect(incrementAfterRepOut('weighted_pullup', 5, 11)).toEqual({ load: 7.5, direction: 1 });
    expect(incrementAfterRepOut('weighted_pullup', 0, 4)).toEqual({ load: 0, direction: -1 });
  });

  it('doubleProgression adds the smallest step only when every set hit the top', () => {
    expect(doubleProgression([{ load: 35, reps: 20 }, { load: 35, reps: 20 }], [12, 20], 5)).toEqual({ load: 40, increased: true });
    expect(doubleProgression([{ load: 40, reps: 15 }, { load: 40, reps: 13 }], [10, 15], 5)).toEqual({ load: 40, increased: false });
    expect(doubleProgression([{ load: 25, reps: 10 }, { load: 25, reps: 10 }, { load: 25, reps: 11 }], [6, 10], rack))
      .toEqual({ load: 27.5, increased: true });
    expect(doubleProgression([{ load: 80, reps: 10 }, { load: 80, reps: null }], [6, 10], 2.5)).toEqual({ load: 80, increased: false });
    expect(doubleProgression([{ load: 0, reps: 15 }], [10, 15], 0)).toEqual({ load: 0, increased: false });
    expect(doubleProgression([], [8, 12], 5)).toBeNull();
  });

  it('progressionStep follows the equipment profile', () => {
    expect(progressionStep('cable', 'lb')).toBe(5);
    expect(progressionStep('cable', 'lb', { ...DEFAULT_EQUIPMENT, cableStepLb: 2.5 })).toBe(2.5);
    expect(progressionStep('cable', 'kg')).toBe(2.5);
    expect(progressionStep('cable_pair', 'kg')).toBe(5);
    expect(progressionStep('barbell', 'kg')).toBe(2.5);
    expect(progressionStep('dumbbell', 'kg')).toBe(rack);
    expect(progressionStep('bodyweight', 'bodyweight')).toBe(0);
  });
});

describe('plates', () => {
  it('100 kg = 20 + 20 per side', () => {
    expect(platesPerSide(100)).toEqual({ perSide: [20, 20], loadedKg: 100, shortfallKg: 0, belowBar: false });
  });
  it('uses the 1.25s and reports a shortfall', () => {
    expect(platesPerSide(142.5).perSide).toEqual([20, 20, 20, 1.25]);
    expect(platesPerSide(117.5).perSide).toEqual([20, 20, 5, 2.5, 1.25]);
    expect(platesPerSide(101)).toMatchObject({ perSide: [20, 20], loadedKg: 100, shortfallKg: 1 });
    expect(platesPerSide(20).perSide).toEqual([]);
    expect(platesPerSide(15).belowBar).toBe(true);
  });
});

describe('warm-ups', () => {
  const loads = (sets: PrescribedSet[]) => sets.map((s) => [s.load, s.reps]);

  it('squat: bar × 8, 50% × 5, 70% × 3, 85% × 1, floored to 2.5', () => {
    expect(loads(warmupRamp('squat', 100))).toEqual([[20, 8], [50, 5], [70, 3], [85, 1]]);
    expect(loads(warmupRamp('squat', 107.5))).toEqual([[20, 8], [52.5, 5], [75, 3], [90, 1]]);
  });

  it('deadlift: 60% × 3, 75% × 2, 90% × 1 of the top set', () => {
    expect(loads(warmupRamp('deadlift', 160))).toEqual([[95, 3], [120, 2], [142.5, 1]]);
    expect(loads(warmupRamp('deadlift', 140))).toEqual([[82.5, 3], [105, 2], [125, 1]]);
  });

  it('test week: singles at 60/75/85% of the goal', () => {
    expect(loads(warmupRamp('squat', 145, 20, { test: true }))).toEqual([[85, 1], [107.5, 1], [122.5, 1]]);
    expect(loads(warmupRamp('deadlift', 205, 20, { test: true }))).toEqual([[122.5, 1], [152.5, 1], [172.5, 1]]);
  });

  it('drops steps that land on the bar or repeat', () => {
    expect(loads(warmupRamp('squat', 40))).toEqual([[20, 8], [27.5, 3], [32.5, 1]]);
  });

  it('incline DB: no bar step, rounded down to the rack', () => {
    expect(loads(warmupRamp('incline_db_press', 22.5))).toEqual([[10, 5], [14, 3], [18, 1]]);
  });

  it('pull-up: bodyweight first, then the added load', () => {
    expect(loads(warmupRamp('weighted_pullup', 20))).toEqual([[0, 5], [10, 5], [12.5, 3], [15, 1]]);
    expect(loads(warmupRamp('weighted_pullup', 5))).toEqual([[0, 5], [2.5, 5]]);
    expect(warmupRamp('weighted_pullup', 0)).toEqual([]);
  });
});

describe('calendar lookups', () => {
  it('weekForDate', () => {
    expect(weekForDate(P, '2026-10-11')).toBeNull();
    expect(weekForDate(P, '2026-10-12')?.weekNo).toBe(0);
    expect(weekForDate(P, '2026-10-18')?.weekNo).toBe(0);
    expect(weekForDate(P, '2026-12-25')?.type).toBe('deload');
    expect(weekForDate(P, '2027-02-28')?.type).toBe('test');
    expect(weekForDate(P, '2027-03-01')).toBeNull();
  });

  it('dayForDate maps the weekday to the session', () => {
    const keys = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']
      .map((d) => dayForDate(P, d)?.day.key);
    expect(keys).toEqual(['lower_a', 'upper_a', 'easy_ride', 'boxing', 'lower_b', 'upper_b', 'rounds']);
    expect(dayForDate(P, '2027-01-19')).toMatchObject({ week: { weekNo: 14 }, day: { key: 'upper_a' } });
    expect(dayForDate(P, '2026-01-01')).toBeNull();
  });

  it('prescribeDay dates the session inside its week', () => {
    expect(prescribeDay(P, 0, 'lower_b', STATE).date).toBe('2026-10-16');
    expect(prescribeDay(P, 19, 'lower_a', STATE).date).toBe('2027-02-22');
  });
});

describe('squat and deadlift loads per week type (TM 140 / 200)', () => {
  // Expected = floor2.5(TM × %TM) from the plan's SQ/DL tables, the same f25 the plan page uses.
  const firstWorkingLoad = (week: number, day: 'lower_a' | 'lower_b', key: string, state = STATE) =>
    notWarmup(ex(week, day, key, state).sets)[0]!.load;

  it.each([
    [1, 'A', 100], [2, 'B', 107.5], [3, 'C', 115], [17, 'D', 122.5], [7, 'deload', 82.5], [18, 'taper', 117.5],
  ])('squat week %i (%s) at TM 140 → %f kg', (week, _type, load) => {
    expect(firstWorkingLoad(week, 'lower_a', 'squat')).toBe(load);
  });

  it.each([
    [1, 'A', 160], [2, 'B', 170], [3, 'C', 180], [17, 'D', 190], [7, 'deload', 140], [18, 'taper', 180],
  ])('deadlift week %i (%s) at TM 200 → %f kg', (week, _type, load) => {
    expect(firstWorkingLoad(week, 'lower_b', 'deadlift')).toBe(load);
  });

  it('swapped TMs (squat 200, deadlift 140)', () => {
    const s: PlanState = { ...STATE, trainingMaxes: { squat: 200, deadlift: 140 } };
    expect([1, 2, 3, 17, 7, 18].map((w) => firstWorkingLoad(w, 'lower_a', 'squat', s))).toEqual([145, 155, 165, 175, 120, 170]);
    expect([1, 2, 3, 17, 7, 18].map((w) => firstWorkingLoad(w, 'lower_b', 'deadlift', s))).toEqual([110, 117.5, 125, 132.5, 97.5, 125]);
  });

  it('A week squat: ramp, 3 × 5, rep-out target 10', () => {
    const sq = ex(1, 'lower_a', 'squat');
    expect(shape(sq.sets)).toEqual([
      ['warmup', 20, 8], ['warmup', 50, 5], ['warmup', 70, 3], ['warmup', 85, 1],
      ['working', 100, 5], ['working', 100, 5], ['working', 100, 5], ['rep_out', 100, null],
    ]);
    expect(sq.sets.at(-1)).toMatchObject({ target: 10, pctTm: 0.725 });
    expect([sq.restSec, sq.restBeforeRepOutSec]).toEqual([180, 240]);
  });

  it('rep-out targets per type: squat 10/8/6/4, deadlift 7/5/3/1', () => {
    const target = (w: number, day: 'lower_a' | 'lower_b', key: string) => ex(w, day, key).sets.find((s) => s.kind === 'rep_out')?.target;
    expect([1, 2, 3, 17].map((w) => target(w, 'lower_a', 'squat'))).toEqual([10, 8, 6, 4]);
    expect([1, 2, 3, 17].map((w) => target(w, 'lower_b', 'deadlift'))).toEqual([7, 5, 3, 1]);
  });

  it('A week deadlift: 60/75/90% ramp then one top-set rep-out', () => {
    const dl = ex(1, 'lower_b', 'deadlift');
    expect(shape(dl.sets)).toEqual([['warmup', 95, 3], ['warmup', 120, 2], ['warmup', 142.5, 1], ['rep_out', 160, null]]);
    expect([dl.restSec, dl.restBeforeRepOutSec]).toEqual([150, 240]);
  });

  it('throws when a TM is missing outside week 0 and the test week', () => {
    expect(() => prescribeDay(P, 1, 'lower_a', { trainingMaxes: {}, currentLoads: {} })).toThrow(/squat/);
    expect(() => prescribeDay(P, 0, 'lower_a', { trainingMaxes: {}, currentLoads: {} })).not.toThrow();
    expect(() => prescribeDay(P, 19, 'lower_b', { trainingMaxes: {}, currentLoads: {} })).not.toThrow();
  });
});

describe('incline DB and pull-up', () => {
  it('training weeks: 3 × 5 + rep-out target 8 at the current load', () => {
    const inc = ex(2, 'upper_a', 'incline_db_press');
    expect(shape(notWarmup(inc.sets))).toEqual([['working', 22.5, 5], ['working', 22.5, 5], ['working', 22.5, 5], ['rep_out', 22.5, null]]);
    expect(inc.sets.at(-1)?.target).toBe(8);
    const pu = ex(2, 'upper_a', 'weighted_pullup');
    expect(pu).toMatchObject({ unit: 'kg', loadBasis: 'added' });
    expect(notWarmup(pu.sets).map((s) => s.load)).toEqual([5, 5, 5, 5]);
  });

  it('deload and taper: 3 × 5 one step lighter, no rep-out (default 8)', () => {
    for (const week of [7, 10, 18]) {
      expect(shape(notWarmup(ex(week, 'upper_a', 'incline_db_press').sets))).toEqual([['working', 20, 5], ['working', 20, 5], ['working', 20, 5]]);
      expect(shape(notWarmup(ex(week, 'upper_a', 'weighted_pullup').sets))).toEqual([['working', 2.5, 5], ['working', 2.5, 5], ['working', 2.5, 5]]);
    }
  });
});

describe('week shapes', () => {
  it('calibration: one rep-out per main lift at the calibration load; accessories 2 easy sets', () => {
    expect(shape(notWarmup(ex(0, 'lower_a', 'squat').sets))).toEqual([['rep_out', 100, null]]);
    expect(ex(0, 'lower_a', 'squat').sets.at(-1)?.target).toBeUndefined();
    expect(shape(notWarmup(ex(0, 'lower_b', 'deadlift').sets))).toEqual([['rep_out', 140, null]]);
    expect(ex(0, 'upper_a', 'incline_db_press').sets.at(-1)).toMatchObject({ kind: 'rep_out', load: 22.5, target: 8 });
    expect(ex(0, 'upper_a', 'weighted_pullup').sets.at(-1)).toMatchObject({ kind: 'rep_out', load: 5, target: 8 });
    expect(shape(ex(0, 'lower_a', 'romanian_deadlift').sets)).toEqual([['working', 80, 10], ['working', 80, 10]]);
    expect(shape(ex(0, 'upper_a', 'cable_lateral_raise').sets)).toEqual([['working', 20, 20], ['working', 20, 20]]);
    expect(ex(0, 'lower_b', 'cable_leg_extension').sets).toHaveLength(1);
    expect(prescribeWeek(P, 0, STATE).map((d) => d.workingSetCount)).toEqual([15, 12, 0, 0, 16, 16, 0]);
  });

  it('training week: compounds end with a rep-out, isolation goes to failure', () => {
    expect(shape(ex(1, 'lower_a', 'romanian_deadlift').sets)).toEqual([['working', 80, 10], ['working', 80, 10], ['rep_out', 80, null]]);
    expect(shape(ex(1, 'lower_a', 'cable_leg_extension').sets)).toEqual([['failure', 35, null], ['failure', 35, null]]);
    expect(ex(1, 'lower_a', 'cable_leg_extension').unit).toBe('lb');
    expect(shape(ex(1, 'lower_b', 'wrist_extension').sets)).toEqual([['working', 4, 15], ['working', 4, 15]]);
  });

  it('uses the accessory loads from state', () => {
    const s: PlanState = { ...STATE, currentLoads: { ...STATE.currentLoads, romanian_deadlift: 85, cable_lateral_raise: 25 } };
    expect(ex(1, 'lower_a', 'romanian_deadlift', s).sets[0]!.load).toBe(85);
    expect(ex(1, 'upper_b', 'cable_lateral_raise', s).sets[0]).toMatchObject({ load: 25, unit: 'lb' });
  });

  it('deload: mains light with no rep-outs, 1 set per accessory, not to failure', () => {
    const mon = prescribeDay(P, 7, 'lower_a', STATE);
    expect(shape(notWarmup(ex(7, 'lower_a', 'squat').sets))).toEqual([['working', 82.5, 5], ['working', 82.5, 5], ['working', 82.5, 5]]);
    expect(shape(notWarmup(ex(7, 'lower_b', 'deadlift').sets))).toEqual([['working', 140, 3]]);
    mon.exercises.filter((e) => e.role !== 'main').forEach((e) => {
      expect(e.sets).toHaveLength(1);
      expect(e.sets[0]!.kind).toBe('working');
    });
    expect(ex(7, 'upper_a', 'cable_external_rotation').sets).toHaveLength(2); // shoulder care unchanged
    expect(ex(7, 'lower_b', 'wrist_extension').sets).toHaveLength(2); // elbow care unchanged
    expect(prescribeWeek(P, 7, STATE).map((d) => d.workingSetCount)).toEqual([10, 11, 0, 0, 10, 8, 0]);
  });

  it('taper: squat 2 × 2 at 85%, deadlift one single at 90%, no rep-outs', () => {
    expect(shape(notWarmup(ex(18, 'lower_a', 'squat').sets))).toEqual([['working', 117.5, 2], ['working', 117.5, 2]]);
    expect(shape(notWarmup(ex(18, 'lower_b', 'deadlift').sets))).toEqual([['top', 180, 1]]);
    expect(weekTotal(18)).toBe(9 + 11 + 10 + 8);
  });

  it('test week: rep-outs at the goal loads, no accessories, no Sunday rounds', () => {
    const week = prescribeWeek(P, 19, STATE);
    const mon = week[0]!;
    expect(mon.exercises.map((e) => e.exerciseKey)).toEqual(['squat']);
    expect(shape(mon.exercises[0]!.sets)).toEqual([
      ['warmup', 85, 1], ['warmup', 107.5, 1], ['warmup', 122.5, 1], ['rep_out', 145, null],
    ]);
    expect(mon.exercises[0]!.sets.at(-1)?.target).toBe(5);
    const tue = week[1]!;
    expect(tue.exercises.filter((e) => e.role === 'main').map((e) => [e.exerciseKey, e.sets.at(-1)?.load, e.sets.at(-1)?.target]))
      .toEqual([['incline_db_press', 37.5, 8], ['weighted_pullup', 20, 8]]);
    expect(tue.exercises.filter((e) => e.role === 'shoulder')).toHaveLength(4);
    expect(week[4]!.exercises.map((e) => [e.exerciseKey, e.sets.at(-1)?.load])).toEqual([['deadlift', 205]]);
    expect(week[5]).toMatchObject({ kind: 'rest', exercises: [] });
    expect(week[6]).toMatchObject({ kind: 'rest', conditioning: { skipped: true, rounds: 0 } });
    expect(week.map((d) => d.workingSetCount)).toEqual([1, 2, 0, 0, 1, 0, 0]);
  });

  it('weeks 15–17: one set fewer on isolation slots only, never below 1 (default 4)', () => {
    expect(prescribeWeek(P, 15, STATE).map((d) => d.workingSetCount)).toEqual([13, 15, 0, 0, 12, 14, 0]);
    expect(ex(15, 'upper_b', 'cable_lateral_raise').sets).toHaveLength(2);
    expect(ex(15, 'lower_b', 'cable_leg_extension').sets).toHaveLength(1);
    expect(ex(15, 'upper_b', 'barbell_row').sets).toHaveLength(3);
    expect(ex(15, 'upper_b', 'lat_pulldown').sets).toHaveLength(2);
    expect(ex(17, 'lower_a', 'squat').sets.at(-1)).toMatchObject({ load: 122.5, target: 4 });
  });

  it('weekly totals across the block', () => {
    expect([0, 1, 7, 15, 18, 19].map((w) => weekTotal(w))).toEqual([59, 74, 39, 54, 38, 4]);
  });
});

describe('extra sets and checkpoint fallbacks', () => {
  it('places +1 set on the first isolation slot of each lagging muscle (default 7)', () => {
    expect(extraSetTargets(P, ['triceps', 'rear_delts', 'back'])).toEqual([
      { muscle: 'triceps', dayKey: 'lower_a', slotIndex: 7, exerciseKey: 'cross_body_triceps_extension' },
      { muscle: 'rear_delts', dayKey: 'upper_b', slotIndex: 9, exerciseKey: 'cable_rear_delt_fly' },
      { muscle: 'back', dayKey: 'upper_a', slotIndex: 6, exerciseKey: 'seated_cable_row' },
    ]);
  });

  it('applies extra sets only in weeks 8–9', () => {
    const s: PlanState = { ...STATE, extraSetsMuscles: ['triceps', 'rear_delts'] };
    expect(ex(8, 'lower_a', 'cross_body_triceps_extension', s).sets).toHaveLength(3);
    expect(ex(9, 'upper_b', 'cable_rear_delt_fly', s).sets).toHaveLength(3);
    expect(weekTotal(8, s)).toBe(76);
    expect(weekTotal(11, s)).toBe(74);
    expect(weekTotal(7, s)).toBe(39);
  });

  it('adds one normal set to a lagging main lift; deadlift gets a back-off set at 85%', () => {
    const s: PlanState = { ...STATE, addMainLiftSet: { squat: true, deadlift: true, incline_db_press: true } };
    expect(notWarmup(ex(1, 'lower_a', 'squat', s).sets).map((x) => x.kind)).toEqual(['working', 'working', 'working', 'working', 'rep_out']);
    expect(shape(notWarmup(ex(1, 'lower_b', 'deadlift', s).sets))).toEqual([['rep_out', 160, null], ['backoff', 135, 5]]);
    expect(notWarmup(ex(1, 'upper_a', 'incline_db_press', s).sets)).toHaveLength(5);
    expect(notWarmup(ex(7, 'lower_a', 'squat', s).sets)).toHaveLength(3); // not in a deload
  });

  it('checkpointStatus', () => {
    expect(checkpointStatus(P, 5, { squatTm: 150, deadliftTm: 220, bodyweight7d: 75 })).toBeNull();
    expect(checkpointStatus(P, 6, { squatTm: 145, deadliftTm: 210, bodyweight7d: 74.5 })).toMatchObject({ met: true, advice: 'on_track', behind: [] });
    expect(checkpointStatus(P, 14, { squatTm: 155, deadliftTm: 227.5, bodyweight7d: 76.2 }))
      .toMatchObject({ met: false, behind: ['squat'], advice: 'add_main_lift_set_if_sessions_on_target' });
    expect(checkpointStatus(P, 14, { squatTm: 160, deadliftTm: 225, bodyweight7d: 75.5 }))
      .toMatchObject({ met: false, behind: [], advice: 'fix_bodyweight_first', bodyweight: { met: false, threshold: 76 } });
    expect(checkpointStatus(P, 6, { squatTm: 150, deadliftTm: null, bodyweight7d: null }))
      .toMatchObject({ met: false, behind: ['deadlift'], deadlift: { met: null } });
  });
});

describe('missed week', () => {
  it('repeats the missed week type and shifts the rest by a week (default 6)', () => {
    const shifted = shiftAfterMissedWeek(P, 3);
    expect(shifted.weeks).toHaveLength(21);
    expect(shifted.weeks.map((w) => w.weekNo)).toEqual([...Array(21).keys()]);
    expect(shifted.weeks[3]).toMatchObject({ type: 'C', startDate: '2026-11-02', missed: true });
    expect(shifted.weeks[4]).toMatchObject({ type: 'C', startDate: '2026-11-09', repeatOf: 3 });
    expect(shifted.weeks[4]!.missed).toBeUndefined();
    expect(shifted.weeks[5]).toMatchObject({ type: 'A', startDate: '2026-11-16' });
    expect(shifted.weeks[7]!.checkpoint).toMatchObject({ weekNo: 7, date: '2026-12-06' });
    expect(shifted.weeks[20]).toMatchObject({ type: 'test', startDate: '2027-03-01' });
    expect(P.weeks).toHaveLength(20); // input untouched
    expect(prescribeDay(shifted, 4, 'lower_a', STATE).exercises[0]!.sets.at(-1)).toMatchObject({ load: 115, target: 6 });
  });

  it('moves a checkpoint from a missed week to its repeat', () => {
    const shifted = shiftAfterMissedWeek(P, 6);
    expect(shifted.weeks[6]!.checkpoint).toBeUndefined();
    expect(shifted.weeks[7]).toMatchObject({ type: 'C', checkpoint: { weekNo: 7, date: '2026-12-06' } });
    expect(shifted.weeks[8]).toMatchObject({ type: 'deload', startDate: '2026-12-07' });
  });

  it('rejects unknown weeks', () => {
    expect(() => shiftAfterMissedWeek(P, 25)).toThrow();
  });
});

describe('conditioning and food', () => {
  const ride = P.days.find((d) => d.key === 'easy_ride')!.conditioning as RideRule;

  it('ride: 30 min in weeks 0–2, +5 a week up to 45', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 12].map((w) => rideMinutes(ride, w))).toEqual([30, 30, 30, 35, 40, 45, 45, 45]);
    expect(prescribeDay(P, 3, 'easy_ride', STATE).conditioning).toEqual({ kind: 'ride', minutes: 35 });
    expect(prescribeDay(P, 3, 'boxing', STATE).conditioning).toEqual({ kind: 'boxing', minutes: 45 });
  });

  it('rounds: 6 to start, half in deloads, skipped in the test week', () => {
    expect(prescribeDay(P, 0, 'rounds', STATE).conditioning).toMatchObject({ rounds: 6, workSec: 120, easySec: 60 });
    expect(prescribeDay(P, 7, 'rounds', { ...STATE, sundayRounds: 7 }).conditioning?.rounds).toBe(4);
    expect(prescribeDay(P, 10, 'rounds', STATE).conditioning?.rounds).toBe(3);
  });

  it('roundsNextWeek: +1 when the last round is within 10% of the first, max 10', () => {
    expect(roundsNextWeek(6, 50, 45)).toBe(7);
    expect(roundsNextWeek(6, 50, 44)).toBe(6);
    expect(roundsNextWeek(6, 50, 55)).toBe(7);
    expect(roundsNextWeek(10, 50, 50)).toBe(10);
  });

  it('bodyweightRateCheck: < +0.1 kg/wk → +100, > +0.25 → −100', () => {
    expect(bodyweightRateCheck(74.1, 74.0)).toBe('+100 kcal');
    expect(bodyweightRateCheck(74.2, 74.0)).toBe('keep');
    expect(bodyweightRateCheck(74.5, 74.0)).toBe('keep');
    expect(bodyweightRateCheck(74.6, 74.0)).toBe('-100 kcal');
    expect(bodyweightRateCheck(73.8, 74.0)).toBe('+100 kcal');
  });
});
