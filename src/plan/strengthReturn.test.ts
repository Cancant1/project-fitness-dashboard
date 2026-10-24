import { GYM, weightsFor } from './equipment';
import { STRENGTH_RETURN_PLAN as P } from './strengthReturn';
import { addDays, countWorkingSets, isoWeekday, prescribeDay } from './engine';
import type { LiftingDayKey, PlanState, WeekType } from './types';

const STATE: PlanState = {
  trainingMaxes: { squat: 140, deadlift: 200 },
  currentLoads: { incline_db_press: 22.5, weighted_pullup: 5 },
};

describe('calendar', () => {
  const expected: Array<[string, WeekType]> = [
    ['2026-10-12', 'calibration'], ['2026-10-19', 'A'], ['2026-10-26', 'B'], ['2026-11-02', 'C'],
    ['2026-11-09', 'A'], ['2026-11-16', 'B'], ['2026-11-23', 'C'], ['2026-11-30', 'deload'],
    ['2026-12-07', 'A'], ['2026-12-14', 'B'], ['2026-12-21', 'deload'], ['2026-12-28', 'C'],
    ['2027-01-04', 'A'], ['2027-01-11', 'B'], ['2027-01-18', 'C'], ['2027-01-25', 'B'],
    ['2027-02-01', 'C'], ['2027-02-08', 'D'], ['2027-02-15', 'taper'], ['2027-02-22', 'test'],
  ];

  it('has 20 weeks with the plan dates and types', () => {
    expect(P.weeks).toHaveLength(20);
    expect(P.weeks.map((w) => [w.startDate, w.type])).toEqual(expected);
    expect(P.weeks.map((w) => w.weekNo)).toEqual([...Array(20).keys()]);
  });

  it('starts every week on a Monday, 7 days after the previous one', () => {
    P.weeks.forEach((w, i) => {
      expect(isoWeekday(w.startDate)).toBe(1);
      expect(w.startDate).toBe(addDays(P.startDate, 7 * i));
    });
  });

  it('matches the pacing table date ranges', () => {
    const end = (n: number) => addDays(P.weeks[n]!.startDate, 6);
    expect(end(6)).toBe('2026-11-29');
    expect([P.weeks[7]!.startDate, end(7)]).toEqual(['2026-11-30', '2026-12-06']);
    expect([P.weeks[10]!.startDate, end(10)]).toEqual(['2026-12-21', '2026-12-27']);
    expect([P.weeks[15]!.startDate, end(17)]).toEqual(['2027-01-25', '2027-02-14']);
    expect(end(19)).toBe('2027-02-28');
  });

  it('places checkpoints at the end of weeks 6 and 14 with the plan thresholds', () => {
    const cps = P.weeks.flatMap((w) => (w.checkpoint ? [w.checkpoint] : []));
    expect(cps).toEqual([
      expect.objectContaining({ weekNo: 6, date: '2026-11-29', squatTm: 145, deadliftTm: 210, bodyweight7d: 74.5 }),
      expect.objectContaining({ weekNo: 14, date: '2027-01-24', squatTm: 160, deadliftTm: 225, bodyweight7d: 76 }),
    ]);
    cps.forEach((cp) => expect(addDays(P.weeks[cp.weekNo]!.startDate, 6)).toBe(cp.date));
  });

  it('flags the reduced and extra-set weeks (every A–D week after checkpoint 1 through week 17)', () => {
    expect(P.weeks.filter((w) => w.isolationSetDelta === -1).map((w) => w.weekNo)).toEqual([15, 16, 17]);
    expect(P.weeks.filter((w) => w.extraSetsEligible).map((w) => w.weekNo)).toEqual([8, 9, 11, 12, 13, 14, 15, 16, 17]);
  });
});

describe('days', () => {
  it('maps weekdays: Mon Lower A, Tue Upper A, Wed ride, Thu boxing, Fri Lower B, Sat Upper B, Sun rounds', () => {
    const byWeekday = [...P.days].sort((a, b) => a.weekday - b.weekday).map((d) => [d.weekday, d.key, d.title]);
    expect(byWeekday).toEqual([
      [1, 'lower_a', 'Lower A'], [2, 'upper_a', 'Upper A'], [3, 'easy_ride', 'Easy ride'], [4, 'boxing', 'Boxing'],
      [5, 'lower_b', 'Lower B'], [6, 'upper_b', 'Upper B'], [7, 'rounds', 'Rounds'],
    ]);
  });

  it('lists every exercise in plan order', () => {
    const order = (key: string) => P.days.find((d) => d.key === key)!.slots.map((s) => s.exerciseKey);
    expect(order('lower_a')).toEqual(['squat', 'romanian_deadlift', 'lying_db_hamstring_curl', 'cable_leg_extension',
      'cable_calf_raise', 'kneeling_cable_crunch', 'cable_lateral_raise', 'cross_body_triceps_extension', 'wrist_extension']);
    expect(order('upper_a')).toEqual(['incline_db_press', 'weighted_pullup', 'seated_cable_row',
      'chest_cable_flye', 'cable_lateral_raise', 'bayesian_curl', 'overhead_cable_triceps_extension', 'cable_rear_delt_fly']);
    expect(order('lower_b')).toEqual(['deadlift', 'bulgarian_split_squat', 'seated_cable_leg_curl', 'cable_leg_extension',
      'cable_calf_raise', 'hanging_knee_raise', 'cable_lateral_raise', 'preacher_curl', 'wrist_extension']);
    expect(order('upper_b')).toEqual(['barbell_row', 'db_bench_press', 'lat_pulldown', 'chest_cable_flye',
      'cable_lateral_raise', 'cable_rear_delt_fly', 'single_arm_cable_curl', 'bar_pushdown']);
  });

  it('has a definition for every slot exercise', () => {
    P.days.flatMap((d) => d.slots).forEach((s) => expect(P.exercises[s.exerciseKey]?.key).toBe(s.exerciseKey));
  });

  it('puts every start load on equipment that exists in the gym', () => {
    for (const day of P.days) for (const slot of day.slots) {
      if (slot.role === 'main') continue;
      const stack = weightsFor(slot.exerciseKey);
      const def = P.exercises[slot.exerciseKey]!;
      if (stack) expect(stack, `${slot.exerciseKey} ${slot.startLoad} ${slot.unit}`).toContain(slot.startLoad);
      else if (def.equipment === 'dumbbell') expect(GYM.dumbbellsKg, slot.exerciseKey).toContain(slot.startLoad);
      else if (def.equipment === 'barbell') expect(slot.startLoad % 2.5, slot.exerciseKey).toBe(0);
    }
  });

  it('keeps the plan units and start loads (snapped to real pins)', () => {
    const slot = (day: string, key: string) => P.days.find((d) => d.key === day)!.slots.find((s) => s.exerciseKey === key)!;
    const pick = (day: string, key: string) => { const s = slot(day, key); return [s.startLoad, s.unit]; };
    expect(pick('lower_a', 'romanian_deadlift')).toEqual([80, 'kg']);
    expect(pick('lower_a', 'cable_leg_extension')).toEqual([30, 'lb']);
    expect(pick('lower_a', 'cable_calf_raise')).toEqual([250, 'lb']);
    expect(pick('lower_a', 'kneeling_cable_crunch')).toEqual([90, 'lb']);
    expect(pick('lower_a', 'cable_lateral_raise')).toEqual([20, 'lb']);
    expect(pick('upper_a', 'seated_cable_row')).toEqual([100, 'lb']);
    expect(pick('upper_a', 'chest_cable_flye')).toEqual([50, 'lb']);
    expect(pick('upper_a', 'bayesian_curl')).toEqual([40, 'lb']);
    expect(pick('upper_a', 'overhead_cable_triceps_extension')).toEqual([20, 'lb']);
    expect(pick('lower_b', 'bulgarian_split_squat')).toEqual([14, 'kg']);
    expect(pick('lower_b', 'hanging_knee_raise')).toEqual([0, 'bodyweight']);
    expect(pick('lower_b', 'preacher_curl')).toEqual([40, 'lb']);
    expect(pick('upper_b', 'barbell_row')).toEqual([70, 'kg']);
    expect(pick('upper_b', 'lat_pulldown')).toEqual([120, 'lb']);
    expect(pick('upper_b', 'bar_pushdown')).toEqual([80, 'lb']);
    expect(slot('upper_a', 'weighted_pullup').loadBasis).toBe('added');
    expect(slot('upper_a', 'incline_db_press').loadBasis).toBe('per_hand');
  });

  it('marks rep-out compounds and failure isolation as the plan does', () => {
    const repOutLast = P.days.flatMap((d) => d.slots).filter((s) => s.scheme?.lastSetRepOut).map((s) => s.exerciseKey);
    expect(new Set(repOutLast)).toEqual(new Set(['romanian_deadlift', 'seated_cable_row', 'bulgarian_split_squat',
      'barbell_row', 'db_bench_press']));
    const notFailure = P.days.flatMap((d) => d.slots).filter((s) => s.role === 'isolation' && !s.scheme?.toFailure);
    expect(notFailure.map((s) => s.exerciseKey)).toEqual(['wrist_extension', 'wrist_extension']);
    P.days.flatMap((d) => d.slots).filter((s) => s.role === 'shoulder')
      .forEach((s) => expect(s.scheme).toMatchObject({ sets: 2, toFailure: false }));
  });

  it('records the session lengths', () => {
    const len = (k: string) => { const d = P.days.find((x) => x.key === k)!; return [d.minutes, d.minutesAlternating]; };
    expect([len('lower_a'), len('upper_a'), len('lower_b'), len('upper_b')]).toEqual([[75, undefined], [75, undefined], [70, undefined], [75, undefined]]); // no supersets (19 Oct), no shoulder block (23 Oct 2026)
  });
});

describe('weekly working sets (normal week; shoulder block and wrist extensions are care work)', () => {
  // The agreed plan (chat export, Part 1): 72 working sets a week. The wrist extension (2 × 15) is elbow care.
  const count = (week: number, day: LiftingDayKey) => prescribeDay(P, week, day, STATE).workingSetCount;

  it('is 19 / 19 / 15 / 19 = 72 in an A week', () => {
    expect([count(1, 'lower_a'), count(1, 'upper_a'), count(1, 'lower_b'), count(1, 'upper_b')]).toEqual([19, 19, 15, 19]);
  });

  it('keeps the wrist extension in the session but out of the count', () => {
    const fri = prescribeDay(P, 1, 'lower_b', STATE).exercises;
    expect(fri.some((e) => e.exerciseKey === 'wrist_extension' && e.rehab)).toBe(true);
    expect(countWorkingSets(fri)).toBe(15);
  });
});

describe('main-lift tables', () => {
  it('squat SQ table', () => {
    expect(P.mainLifts.squat.byWeekType).toEqual({
      A: { pctTm: 0.725, sets: 3, reps: 5, repOutTarget: 10 },
      B: { pctTm: 0.775, sets: 3, reps: 4, repOutTarget: 8 },
      C: { pctTm: 0.825, sets: 3, reps: 3, repOutTarget: 6 },
      D: { pctTm: 0.875, sets: 3, reps: 2, repOutTarget: 4 },
      deload: { pctTm: 0.6, sets: 3, reps: 5, repOutTarget: null },
      taper: { pctTm: 0.85, sets: 2, reps: 2, repOutTarget: null },
    });
  });

  it('deadlift DL table', () => {
    const t = P.mainLifts.deadlift.byWeekType;
    expect([t.A, t.B, t.C, t.D].map((r) => [r!.pctTm, r!.repOutTarget])).toEqual([[0.8, 7], [0.85, 5], [0.9, 3], [0.95, 1]]);
    expect(t.deload).toEqual({ pctTm: 0.7, sets: 1, reps: 3, repOutTarget: null });
    expect(t.taper).toEqual({ pctTm: 0.9, sets: 1, reps: 1, repOutTarget: null });
  });

  it('goals and calibration loads', () => {
    expect(Object.values(P.goals).map((g) => [g.lift, g.load, g.reps])).toEqual([
      ['squat', 145, 5], ['deadlift', 205, 5], ['incline_db_press', 37.5, 8], ['weighted_pullup', 20, 8],
    ]);
    expect(P.calibrationLoads).toEqual({ squat: 100, deadlift: 140, incline_db_press: 22.5, weighted_pullup: 5 });
  });
});
