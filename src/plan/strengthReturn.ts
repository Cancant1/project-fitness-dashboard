// The Strength Return Plan (docs/plan/Strength_Return_Plan.md + .html) as data.
// 20 weeks from Mon 12 Oct 2026; PR test week 22–28 Feb 2027.

import type {
  AccessoryScheme,
  Checkpoint,
  ExerciseDefinition,
  LoadBasis,
  ProgramDay,
  ProgramDefinition,
  ProgramSlot,
  ProgramWeek,
  Unit,
  WeekType,
} from './types';

// ---------- exercises ----------

const EXERCISES: ExerciseDefinition[] = [
  { key: 'squat', name: 'Back squat', equipment: 'barbell', muscles: ['quads', 'glutes', 'adductors'] },
  { key: 'romanian_deadlift', name: 'Romanian deadlift', equipment: 'barbell', muscles: ['hamstrings', 'glutes'] },
  { key: 'lying_db_hamstring_curl', name: 'Lying DB hamstring curl, flat bench', equipment: 'dumbbell', muscles: ['hamstrings'] },
  { key: 'cable_leg_extension', name: 'Cable leg extension, backrest reclined', equipment: 'cable', muscles: ['quads'] },
  { key: 'cable_calf_raise', name: 'Calf raise, cable bar', equipment: 'cable_pair', muscles: ['calves'] },
  { key: 'kneeling_cable_crunch', name: 'Kneeling cable crunch', equipment: 'cable', muscles: ['abs'] },
  { key: 'cable_lateral_raise', name: 'Single-arm cable lateral raise', equipment: 'cable', muscles: ['side_delts'] },
  { key: 'cross_body_triceps_extension', name: 'Cross-body cable triceps extension', equipment: 'cable', muscles: ['triceps'] },
  { key: 'cable_external_rotation', name: 'Cable external rotation at your side', equipment: 'cable', muscles: ['rotator_cuff'] },
  { key: 'prone_y_raise', name: 'Prone Y-raise', equipment: 'dumbbell', muscles: ['rotator_cuff', 'rear_delts'] },
  { key: 'cable_serratus_punch', name: 'Cable serratus punch', equipment: 'cable', muscles: ['serratus'] },
  { key: 'face_pull', name: 'Face pull, rope', equipment: 'cable', muscles: ['rear_delts', 'rotator_cuff'] },
  { key: 'incline_db_press', name: 'Incline DB press, neutral grip', equipment: 'dumbbell', muscles: ['chest', 'front_delts', 'triceps'] },
  { key: 'weighted_pullup', name: 'Weighted pull-up, neutral grip', equipment: 'belt', muscles: ['back', 'biceps'] },
  { key: 'seated_cable_row', name: 'Seated cable row, neutral handle', equipment: 'cable', muscles: ['back', 'biceps'] },
  { key: 'chest_cable_flye', name: 'Chest-height cable flye', equipment: 'cable', muscles: ['chest'] },
  { key: 'bayesian_curl', name: 'Bayesian curl', equipment: 'cable', muscles: ['biceps'] },
  { key: 'overhead_cable_triceps_extension', name: 'Single-arm overhead cable triceps extension', equipment: 'cable', muscles: ['triceps'] },
  { key: 'deadlift', name: 'Deadlift', equipment: 'barbell', muscles: ['glutes', 'hamstrings', 'back'] },
  { key: 'bulgarian_split_squat', name: 'Bulgarian split squat', equipment: 'dumbbell', muscles: ['quads', 'glutes', 'adductors'] },
  { key: 'seated_cable_leg_curl', name: 'Seated cable leg curl, one leg at a time', equipment: 'cable', muscles: ['hamstrings'] },
  { key: 'hanging_knee_raise', name: 'Hanging knee raise', equipment: 'bodyweight', muscles: ['abs'] },
  // His gym's preacher substitute (DECISIONS 2026-10-11 evening): same loads, cable, lb.
  { key: 'preacher_curl', name: 'Kneeling cable curl, elbow on knee (preacher-style)', equipment: 'cable', muscles: ['biceps'] },
  { key: 'wrist_extension', name: 'Slow wrist extension', equipment: 'dumbbell', muscles: ['forearms'] },
  { key: 'barbell_row', name: 'Barbell or Pendlay row', equipment: 'barbell', muscles: ['back', 'rear_delts', 'biceps'] },
  { key: 'db_bench_press', name: 'DB bench press, neutral grip', equipment: 'dumbbell', muscles: ['chest', 'triceps', 'front_delts'] },
  { key: 'lat_pulldown', name: 'Lat pulldown, neutral handle', equipment: 'cable', muscles: ['back', 'biceps'] },
  { key: 'cable_rear_delt_fly', name: 'Cable rear delt fly', equipment: 'cable', muscles: ['rear_delts'] },
  { key: 'underhand_cable_curl', name: 'Underhand cable curl', equipment: 'cable', muscles: ['biceps'] },
  { key: 'reverse_grip_pushdown', name: 'Reverse-grip pushdown', equipment: 'cable', muscles: ['triceps'] },
  // Saturday's curl and pushdown from 17 Oct 2026 (DECISIONS): the straight-bar underhand versions bothered the
  // pinky side of the right wrist. The two above stay for history and as alternatives.
  { key: 'single_arm_cable_curl', name: 'Single-arm cable curl, D-handle', equipment: 'cable', muscles: ['biceps'] },
  { key: 'rope_pushdown', name: 'Rope pushdown', equipment: 'cable', muscles: ['triceps'] },
  // Not a default: an alternative to the Saturday cable curl once the elbow is at 0–3 for 4 weeks (E23).
  { key: 'incline_hammer_curl', name: 'Seated high-incline hammer curl', equipment: 'dumbbell', muscles: ['biceps', 'forearms'] },
];

/** Creatine 5 g a day from this date (DECISIONS, Mario's answers): bodyweight band and rate fit (E16). */
export const CREATINE_START = '2026-10-11';

// ---------- slot builders ----------

const scheme = (sets: number, min: number, max: number, opts: Partial<AccessoryScheme> = {}): AccessoryScheme => ({
  sets,
  repRange: [min, max],
  lastSetRepOut: false,
  toFailure: false,
  ...opts,
});

const main = (exerciseKey: ProgramSlot['exerciseKey'], mainLift: NonNullable<ProgramSlot['mainLift']>,
  startLoad: number, loadBasis: LoadBasis, notes: string[]): ProgramSlot =>
  ({ exerciseKey, role: 'main', mainLift, startLoad, unit: 'kg', loadBasis, notes });

const compound = (exerciseKey: string, s: AccessoryScheme, startLoad: number, unit: Unit, loadBasis: LoadBasis,
  notes: string[], extra: Partial<ProgramSlot> = {}): ProgramSlot =>
  ({ exerciseKey, role: 'compound', scheme: s, startLoad, unit, loadBasis, notes, ...extra });

const isolation = (exerciseKey: string, s: AccessoryScheme, startLoad: number, unit: Unit, loadBasis: LoadBasis,
  notes: string[], extra: Partial<ProgramSlot> = {}): ProgramSlot =>
  ({ exerciseKey, role: 'isolation', scheme: s, startLoad, unit, loadBasis, notes, ...extra });

const failure = (sets: number, min: number, max: number) => scheme(sets, min, max, { toFailure: true });
const repOutLast = (sets: number, min: number, max: number) => scheme(sets, min, max, { lastSetRepOut: true });

// Shoulder care block, Tue and Sat before the first main lift: not failure sets, 45–60 s rest, 3 s down.
// Face pull dropped 13 Oct 2026 (DECISIONS; no specific evidence, K-FACEPULL). Its definition stays for history.
const SHOULDER_BLOCK: ProgramSlot[] = [
  { exerciseKey: 'cable_external_rotation', role: 'shoulder', group: 'shoulder_care', scheme: scheme(2, 12, 15),
    startLoad: 10, unit: 'lb', loadBasis: 'per_arm', // plan said 5 lb; the lightest pin is 10
    notes: ['Single pulley at elbow height, towel between elbow and ribs.', '3 s back. Not to failure.'] },
  { exerciseKey: 'prone_y_raise', role: 'shoulder', group: 'shoulder_care', scheme: scheme(2, 10, 12),
    startLoad: 2, unit: 'kg', loadBasis: 'per_hand',
    notes: ['Adjustable bench at 30–45°. Lie face down on it, chest on the pad, chin just past the top, feet on the floor.',
      'Arms hang straight down, a 2 kg dumbbell in each hand, thumbs pointing up.',
      'Keep the arms straight and raise them forward and up into a Y (10 and 2 o’clock) until they line up with your body.',
      'Start each rep by pulling the shoulder blades down and back. No shrug, neck long. 1 s at the top, 3 s down.',
      'Right shoulder hurts near the top: stop just below that point.'] },
  { exerciseKey: 'cable_serratus_punch', role: 'shoulder', group: 'shoulder_care', scheme: scheme(2, 12, 12),
    startLoad: 10, unit: 'lb', loadBasis: 'per_arm',
    notes: ['One arm at a time. Single pulley at chest height; stand facing away from it, handle in one hand.',
      'Arm straight out in front at shoulder height, elbow locked the whole time.',
      'Reach the handle a few cm further forward by letting the shoulder blade slide around the ribs, then let it slide back.',
      'Small movement. If your elbow bends, you are doing a press. 12 per arm.'] },
];

const LATERAL = (sets: number, pair?: string): ProgramSlot => isolation('cable_lateral_raise', failure(sets, 12, 20), 20, 'lb', 'per_arm',
  ['Slightly in front of the body, to shoulder height, lead with the elbow. Right shoulder pinching: stop a little lower.'],
  { alternatives: ['db_lateral_raise'], ...(pair ? { pair } : {}) });
const LEG_EXTENSION = (sets: number): ProgramSlot => isolation('cable_leg_extension', failure(sets, 12, 20), 30, 'lb', 'per_leg', // June 40 lb −10% → 30 (no 35 pin)
  ['Backrest reclined 30–45°. Knee pain at the bottom: shorten the range.'], { alternatives: ['heel_elevated_goblet_squat'] });
const CALF_RAISE = (pair?: string): ProgramSlot => isolation('cable_calf_raise', failure(2, 10, 15), 250, 'lb', 'total', // 125 + 125 lb ≈ 113 kg (plan 120 kg; no pin for it)
  ['Bar between the two pulleys; knees straight; pause 1–2 s in the stretch. Half reps in the bottom after failure.'],
  { alternatives: ['single_leg_db_calf_raise'], ...(pair ? { pair } : {}) });
const FLYE = (pair?: string): ProgramSlot => isolation('chest_cable_flye', failure(2, 10, 15), 50, 'lb', 'per_arm', // 50 lb per side = the plan's 23 kg
  ['Pulleys at chest height, 1 s pause in the stretch. Right shoulder: stop the stretch a little earlier.'],
  { alternatives: ['low_to_high_cable_flye'], ...(pair ? { pair } : {}) });

// E13 wrist-extension heavy-slow ladder (J-ELBOW, R1-15): Mon and Fri in the gym, Wed at home. Reps by plan week
// come from WRIST_LADDER; the scheme here is the first rung. Care work: not counted as working sets.
const WRIST_LADDER_SLOT: ProgramSlot = isolation('wrist_extension', scheme(3, 15, 15), 4, 'kg', 'per_hand',
  ['Forearm supported, palm down; 3 s up, 3 s down; the last 1–2 reps hard but clean.',
    'Right arm is the priority; do both. Pain rule. No extensor stretching.'], { restSec: 60, rehab: true });

// ---------- days ----------

const DAYS: ProgramDay[] = [
  {
    key: 'lower_a', weekday: 1, title: 'Lower A', focus: 'Squat day', kind: 'lifting', minutes: 75, minutesAlternating: 65,
    notes: ['Lunch walk.'],
    slots: [
      main('squat', 'squat', 100, 'total', ['Safety bars just below your bottom position.', 'About 2 s down, up fast.']),
      compound('romanian_deadlift', repOutLast(3, 6, 10), 80, 'kg', 'total', ['Straps.', '2–3 s down.'], { alternatives: ['db_romanian_deadlift'] }),
      // 12 Oct 2026: his bench can't incline, so flat (prone). The Friday seated cable curl covers the stretched position.
      isolation('lying_db_hamstring_curl', failure(2, 10, 15), 25, 'kg', 'total',
        ['Face down on a flat bench, knees just past the end, dumbbell between your feet.', 'Curl up, 2 s down to a full stretch.'],
        { alternatives: ['seated_cable_leg_curl'], pair: 'mon_1' }),
      LEG_EXTENSION(2),
      // The calf raise uses all the cable stations, so it can't be paired.
      CALF_RAISE(),
      isolation('kneeling_cable_crunch', failure(2, 10, 15), 90, 'lb', 'total', ['Single pulley: 90 lb ≈ 41 kg, the plan’s 40 kg.','Curl ribs to pelvis; hips stay still.'],
        { alternatives: ['hanging_knee_raise'] }),
      LATERAL(2),
      // R1-10: triceps 12–20 (kinder to the elbow, same growth).
      isolation('cross_body_triceps_extension', failure(2, 12, 20), 20, 'lb', 'per_arm',
        ['One arm at a time: pulley on the opposite side at about head height, grab it across your body and extend the arm out to the side.', 'Soft lockout.', 'Front of shoulder/collarbone hurts: switch to rope pushdowns.'],
        { elbowLoading: true, pair: 'mon_1', alternatives: ['rope_pushdown'] }),
      WRIST_LADDER_SLOT,
    ],
  },
  {
    key: 'upper_a', weekday: 2, title: 'Upper A', focus: 'Press and pull-up day', kind: 'lifting', minutes: 80, minutesAlternating: 70,
    notes: ['Lunch walk.', 'Shoulder care block first, about 8 minutes.'],
    slots: [
      ...SHOULDER_BLOCK,
      main('incline_db_press', 'incline_db_press', 22.5, 'per_hand',
        ['Bench ~30°, palms facing. Soft lockout. Right shoulder pinching: stop that side a little higher.']),
      main('weighted_pullup', 'weighted_pullup', 5, 'added',
        ['Neutral grip. Chin over the handles and a full hang count. Shoulders lightly set at the bottom.']),
      compound('seated_cable_row', repOutLast(2, 8, 12), 100, 'lb', 'total', ['Neutral handle.'],
        { restSec: 120, alternatives: ['chest_supported_db_row'] }),
      FLYE(),
      LATERAL(3),
      // Plan said 50 lb (23 kg); 13 Oct 2026 50 lb was too heavy on the return, 40 lb × 12, 12 (DECISIONS).
      isolation('bayesian_curl', failure(2, 8, 12), 40, 'lb', 'per_arm', ['Front of shoulder hurts: switch to preacher curls.'],
        { elbowLoading: true, alternatives: ['preacher_curl'] }),
      isolation('overhead_cable_triceps_extension', failure(2, 12, 20), 20, 'lb', 'per_arm',
        ['Pulley at about shoulder height behind you; face away, elbow up beside your head, slight forward lean, one foot forward.',
          'Hand drops behind your head for a full stretch, then extend up and slightly forward. Elbow stays pointing up.',
          'Rope or wrist cuff, no bar grip. Soft lockout. Elbow complains in the stretch: drop the pulley to navel height.'],
        { elbowLoading: true, alternatives: ['cross_body_triceps_extension'] }),
      // R1-08 optional: +1 rear delt set paired with the flye, only after checkpoint 1 (extra-set weeks).
      isolation('cable_rear_delt_fly', failure(1, 12, 20), 30, 'lb', 'per_arm', ['Optional extra set (checkpoint 1 met). Cables crossed; keep it in the shoulders.'],
        { extraOnly: true }),
    ],
  },
  {
    key: 'easy_ride', weekday: 3, title: 'Easy ride', focus: 'Aerobic base', kind: 'conditioning', slots: [],
    conditioning: { kind: 'ride', startMinutes: 30, holdThroughWeek: 2, addPerWeek: 5, maxMinutes: 45 },
    notes: ['Talking pace: full sentences, nose breathing. Same loop each time; note the loop time.', 'Lunch walk.'],
  },
  {
    key: 'boxing', weekday: 4, title: 'Boxing', focus: 'Boxing class', kind: 'conditioning', slots: [],
    conditioning: { kind: 'boxing', minutes: 45 },
    notes: ['Keep sparring controlled; skip sparring with a headache, dizziness or fogginess.'],
  },
  {
    key: 'lower_b', weekday: 5, title: 'Lower B', focus: 'Deadlift day', kind: 'lifting', minutes: 70, minutesAlternating: 60,
    notes: ['Lunch walk.'],
    slots: [
      // "Ramp sets 2–3 min apart, 4 min before the top set."
      { ...main('deadlift', 'deadlift', 140, 'total',
        ['Low-rep ramp, then one top set. Straps are fine; no mixed grip.', 'Reset every rep from a dead stop, no bounce.']),
        restSec: 150 },
      compound('bulgarian_split_squat', repOutLast(3, 8, 12), 14, 'kg', 'per_hand', ['Straps if grip limits.', '90 s between legs.'],
        { alternatives: ['db_reverse_lunge'] }),
      // June 30 lb −10% → 20 (no 25 pin)
      isolation('seated_cable_leg_curl', failure(2, 10, 15), 20, 'lb', 'per_leg', ['Torso leaning slightly forward, hips bent.'],
        { alternatives: ['lying_db_hamstring_curl'] }),
      LEG_EXTENSION(1),
      CALF_RAISE(),
      isolation('hanging_knee_raise', failure(2, 10, 15), 0, 'bodyweight', 'total',
        ['Curl the pelvis up. Dip handles if grip or elbow bothers you.'], { alternatives: ['kneeling_cable_crunch'], pair: 'fri_1' }),
      LATERAL(2, 'fri_1'),
      // June 50 lb −10% → 40 (no 45 pin). His kneeling single-arm cable curl, upper arm braced on the raised knee.
      isolation('preacher_curl', failure(2, 8, 12), 40, 'lb', 'total',
        ['Upper arm braced on the raised knee, arm in front of the body; full stretch at the bottom with a soft lockout.',
          'No bouncing out of the bottom.'],
        { elbowLoading: true, alternatives: ['bayesian_curl'] }),
      WRIST_LADDER_SLOT,
    ],
  },
  {
    key: 'upper_b', weekday: 6, title: 'Upper B', focus: 'Volume day', kind: 'lifting', minutes: 80, minutesAlternating: 70,
    notes: ['Shoulder care block first, about 8 minutes.'],
    slots: [
      ...SHOULDER_BLOCK,
      compound('barbell_row', repOutLast(3, 6, 10), 70, 'kg', 'total', ['Straps. Elbow flares: try an underhand grip.'],
        { warmup: true, alternatives: ['chest_supported_db_row'] }),
      compound('db_bench_press', repOutLast(3, 6, 10), 25, 'kg', 'per_hand', ['Neutral grip, soft lockout.'],
        { warmup: true, alternatives: ['db_floor_press'] }),
      compound('lat_pulldown', failure(2, 8, 12), 120, 'lb', 'total', ['Neutral handle, full stretch overhead.'],
        { restSec: 120, alternatives: ['single_arm_lat_pulldown'] }),
      FLYE(),
      LATERAL(3),
      // June 40 lb −10% → 30 (no 35 pin)
      isolation('cable_rear_delt_fly', failure(2, 12, 20), 30, 'lb', 'per_arm', ['Cables crossed; keep it in the shoulders.'],
        { alternatives: ['prone_db_rear_delt_raise'] }),
      // 17 Oct 2026: replaces the straight-bar underhand curl (40 lb × 13 two-handed → 20 lb per arm) and the
      // reverse-grip pushdown (80 lb × 20; the rope starts a pin lower).
      isolation('single_arm_cable_curl', failure(2, 8, 12), 20, 'lb', 'per_arm',
        ['D-handle, one arm at a time. Let the wrist turn where it is comfortable: palm up or a little thumb-up.',
          'Soft lockout at the bottom.'],
        { elbowLoading: true, alternatives: ['underhand_cable_curl', 'incline_hammer_curl', 'preacher_curl'] }),
      isolation('rope_pushdown', failure(2, 12, 20), 70, 'lb', 'total', ['Neutral grip; spread the rope at the bottom. Soft lockout.'],
        { elbowLoading: true, alternatives: ['reverse_grip_pushdown'] }),
    ],
  },
  {
    key: 'rounds', weekday: 7, title: 'Rounds', focus: 'Boxing-format intervals', kind: 'conditioning', slots: [],
    conditioning: {
      kind: 'rounds', workSec: 120, easySec: 60, warmupMin: 5, startRounds: 6, maxRounds: 10, dropOffFraction: 0.1,
      // R1-30: from week 4, 2 of the rounds are burst rounds; finish by 14:00 (~30 h before Monday's squat).
      burstFromWeek: 4, burstRounds: 2, burstWorkSec: 5, burstEasySec: 10, finishBy: '14:00',
    },
    notes: ['Jump rope or running. Every round about equal; count skips (or distance) in round 1 and the last round.'],
  },
];

// ---------- calendar ----------

const CHECKPOINT_1: Checkpoint = {
  id: 'cp1', name: 'Checkpoint 1', weekNo: 6, date: '2026-11-29', squatTm: 145, deadliftTm: 210, bodyweight7d: 74.5,
};
// Default 1: the plan's checkpoint table and pacing say end of week 14; the science table says 13.
const CHECKPOINT_2: Checkpoint = {
  id: 'cp2', name: 'Checkpoint 2', weekNo: 14, date: '2027-01-24', squatTm: 160, deadliftTm: 225, bodyweight7d: 76,
};

const WEEK_TYPE_LABELS: Record<WeekType, string> = {
  calibration: 'Calibration', A: 'Week A', B: 'Week B', C: 'Week C', D: 'Week D',
  deload: 'Deload', taper: 'Taper', test: 'PR test',
};

/** E24 / P-VARIETY: at the deloads (weeks 7 and 10). Equivalents are each slot's `alternatives`. */
export const VARIETY_NOTE = 'You may swap up to 2 accessories for a listed equivalent this week (same muscle).';
/**
 * R1-08: the extra sets after checkpoint 1 are fixed (arms), with an optional rear delt set. They run in every
 * A–D week after checkpoint 1 up to and including week 17 (DECISIONS: Mario wants size); never in the deload,
 * taper or test weeks.
 */
const EXTRA_SETS_NOTE = 'If checkpoint 1 was met: +1 set on each curl and triceps exercise on Tue and Sat (optional +1 rear delt fly on Tue).';
const EXTRA: Partial<ProgramWeek> = { extraSetsEligible: true };
const ISO_FEWER = 'One set fewer per isolation exercise.';

const CALENDAR: Array<[string, WeekType, string[], Partial<ProgramWeek>?]> = [
  ['2026-10-12', 'calibration', ['One rep-out at a known load per main lift sets the training maxes.',
    'Accessories: 2 easy sets, stop at the top of the range or 2 reps before failure.']],
  ['2026-10-19', 'A', []],
  ['2026-10-26', 'B', []],
  ['2026-11-02', 'C', []],
  ['2026-11-09', 'A', []],
  ['2026-11-16', 'B', []],
  ['2026-11-23', 'C', ['Checkpoint 1 at the end of this week (29 Nov).'], { checkpoint: CHECKPOINT_1 }],
  ['2026-11-30', 'deload', ['1 set per accessory, not to failure; half the Sunday rounds.', VARIETY_NOTE]],
  ['2026-12-07', 'A', [EXTRA_SETS_NOTE], EXTRA],
  ['2026-12-14', 'B', [EXTRA_SETS_NOTE], EXTRA],
  ['2026-12-21', 'deload', ['England 20–27 Dec. Hotel or local gym: do the deload sessions. No gym: rest and walk a lot.',
    'Eat roughly as usual; keep protein up.', VARIETY_NOTE]],
  ['2026-12-28', 'C', [EXTRA_SETS_NOTE], EXTRA],
  ['2027-01-04', 'A', [EXTRA_SETS_NOTE], EXTRA],
  ['2027-01-11', 'B', [EXTRA_SETS_NOTE], EXTRA],
  ['2027-01-18', 'C', ['Checkpoint 2 at the end of this week (24 Jan).', EXTRA_SETS_NOTE], { checkpoint: CHECKPOINT_2, ...EXTRA }],
  ['2027-01-25', 'B', [ISO_FEWER, EXTRA_SETS_NOTE], { isolationSetDelta: -1, ...EXTRA }],
  ['2027-02-01', 'C', [ISO_FEWER, EXTRA_SETS_NOTE], { isolationSetDelta: -1, ...EXTRA }],
  ['2027-02-08', 'D', [ISO_FEWER, EXTRA_SETS_NOTE], { isolationSetDelta: -1, ...EXTRA }],
  ['2027-02-15', 'taper', ['Squat 2 × 2 at 85% TM, deadlift one single at 90%, no rep-outs. 1 set per accessory.']],
  ['2027-02-22', 'test', ['Rep-outs at 145 kg squat, 205 kg deadlift, 37.5 kg DBs and +20 kg pull-up. No accessories.',
    'Skip Sunday rounds.']],
];

const WEEKS: ProgramWeek[] = CALENDAR.map(([startDate, type, notes, extra], weekNo) => ({
  weekNo,
  startDate,
  type,
  label: WEEK_TYPE_LABELS[type],
  notes,
  ...extra,
}));

// ---------- the programme ----------

export const STRENGTH_RETURN_PLAN: ProgramDefinition = {
  id: 'strength-return-2026',
  name: 'Strength Return Plan',
  startDate: '2026-10-12',
  weeks: WEEKS,
  days: DAYS,
  exercises: Object.fromEntries(EXERCISES.map((e) => [e.key, e])),
  mainLifts: {
    // [%TM, sets, reps, rep-out target] per week type — SQ table in the plan page's script.
    squat: {
      scheme: 'tm_percent',
      byWeekType: {
        A: { pctTm: 0.725, sets: 3, reps: 5, repOutTarget: 10 },
        B: { pctTm: 0.775, sets: 3, reps: 4, repOutTarget: 8 },
        C: { pctTm: 0.825, sets: 3, reps: 3, repOutTarget: 6 },
        D: { pctTm: 0.875, sets: 3, reps: 2, repOutTarget: 4 },
        deload: { pctTm: 0.6, sets: 3, reps: 5, repOutTarget: null },
        taper: { pctTm: 0.85, sets: 2, reps: 2, repOutTarget: null },
      },
    },
    // DL table: sets 0 = 60/75/90% ramp then one top-set rep-out.
    deadlift: {
      scheme: 'tm_ramp',
      byWeekType: {
        A: { pctTm: 0.8, sets: 0, reps: 0, repOutTarget: 7 },
        B: { pctTm: 0.85, sets: 0, reps: 0, repOutTarget: 5 },
        C: { pctTm: 0.9, sets: 0, reps: 0, repOutTarget: 3 },
        D: { pctTm: 0.95, sets: 0, reps: 0, repOutTarget: 1 },
        deload: { pctTm: 0.7, sets: 1, reps: 3, repOutTarget: null },
        taper: { pctTm: 0.9, sets: 1, reps: 1, repOutTarget: null },
      },
    },
    // "3 sets of 5 plus a rep-out at the same load, target 8"; ≥10 up, 6–9 same, ≤5 down.
    // R1-04: incline ≥16 → +2 dumbbells, stuck at 6–9 three times → normal sets 3 × 6, then 3 × 7;
    // pull-up ≥12 → +5 kg.
    incline_db_press: {
      scheme: 'load_step', sets: 3, reps: 5, repOutTarget: 8, stepUpAtReps: 10, stepDownAtReps: 5, lightSets: 3, lightReps: 5,
      doubleStepAtReps: 16, stuck: { after: 3, reps: [6, 7] },
    },
    weighted_pullup: {
      scheme: 'load_step', sets: 3, reps: 5, repOutTarget: 8, stepUpAtReps: 10, stepDownAtReps: 5, lightSets: 3, lightReps: 5,
      doubleStepAtReps: 12,
    },
  },
  weekTypeRules: {
    calibration: { includeAccessories: true, accessorySetCap: 2, accessoryToFailure: false, compoundRepOut: false,
      accessoryNote: 'Easy set: stop at the top of the range or 2 reps before failure.' },
    A: { includeAccessories: true, accessorySetCap: null, accessoryToFailure: true, compoundRepOut: true },
    B: { includeAccessories: true, accessorySetCap: null, accessoryToFailure: true, compoundRepOut: true },
    C: { includeAccessories: true, accessorySetCap: null, accessoryToFailure: true, compoundRepOut: true },
    D: { includeAccessories: true, accessorySetCap: null, accessoryToFailure: true, compoundRepOut: true },
    deload: { includeAccessories: true, accessorySetCap: 1, accessoryToFailure: false, compoundRepOut: false,
      accessoryNote: 'Deload: not to failure.' },
    taper: { includeAccessories: true, accessorySetCap: 1, accessoryToFailure: false, compoundRepOut: false,
      accessoryNote: 'Taper: not to failure.' },
    test: { includeAccessories: false, accessorySetCap: 0, accessoryToFailure: false, compoundRepOut: false },
  },
  weekTypeLabels: WEEK_TYPE_LABELS,
  goals: {
    squat: { lift: 'squat', load: 145, reps: 5, unit: 'kg', loadBasis: 'total' },
    deadlift: { lift: 'deadlift', load: 205, reps: 5, unit: 'kg', loadBasis: 'total' },
    incline_db_press: { lift: 'incline_db_press', load: 37.5, reps: 8, unit: 'kg', loadBasis: 'per_hand' },
    weighted_pullup: { lift: 'weighted_pullup', load: 20, reps: 8, unit: 'kg', loadBasis: 'added' },
  },
  calibrationLoads: { squat: 100, deadlift: 140, incline_db_press: 22.5, weighted_pullup: 5 },
  // Timing table: mains 3 min (4 before a rep-out), other compounds 2–3 min, isolation 90 s, shoulder block 45–60 s.
  restSecByRole: { main: 180, compound: 150, isolation: 90, shoulder: 50 },
  repOutRestSec: 240,
  // Every 2 weeks: < +0.1 kg/wk → +100 kcal; > +0.25 → −100 kcal. Creatine (E16): the fit starts at week 3
  // (Mon 2 Nov), so the first check is week 5; ≥ 20 weigh-ins; readings > 1.5 kg off a first fit are dropped.
  bodyweightRate: { minKgPerWeek: 0.1, maxKgPerWeek: 0.25, adjustKcal: 100, fromWeek: 5, fitFromWeek: 3, minWeighIns: 20, outlierKg: 1.5 },
  nutrition: { kcal: 2800, proteinG: 180, fatG: 80, carbsG: 370, targetBodyweightKg: [76, 78] },
  oldBestE1rm: { squat: 165, deadlift: 235 },
  creatineStart: CREATINE_START,
  creatineBandKg: 0.7,
  rateExclusions: [{ from: '2026-12-20', to: '2027-01-03', label: 'holiday' }],
  pairRestSec: { between: 50, after: 75 },
  mainLiftFallbacks: {
    squat: { dayKey: 'lower_b', beforeExerciseKey: 'bulgarian_split_squat', pctTm: 0.75, sets: 2, reps: 3 },
    deadlift: { pctOfTop: 0.8, sets: 2, reps: 5, repRange: [3, 5] },
  },
  extraSets: {
    arms: {
      muscles: ['triceps', 'biceps'],
      targets: [
        { dayKey: 'upper_a', exerciseKey: 'bayesian_curl' },
        { dayKey: 'upper_a', exerciseKey: 'overhead_cable_triceps_extension' },
        { dayKey: 'upper_b', exerciseKey: 'single_arm_cable_curl' },
        { dayKey: 'upper_b', exerciseKey: 'rope_pushdown' },
      ],
    },
    rearDelt: { muscles: ['rear_delts'], targets: [{ dayKey: 'upper_a', exerciseKey: 'cable_rear_delt_fly' }] },
  },
  wristLadder: {
    exerciseKey: 'wrist_extension',
    rungs: [{ fromWeek: 0, reps: 15 }, { fromWeek: 2, reps: 12 }, { fromWeek: 4, reps: 10 }, { fromWeek: 6, reps: 8 }, { fromWeek: 9, reps: 6 }],
    sets: 3,
    dayKeys: ['lower_a', 'lower_b'],
    homeDayKey: 'easy_ride',
    maintainFromWeek: 13,
    maintain: { dayKey: 'lower_b', sets: 2, reps: 8 },
    isometric: { sets: 5, holdSec: [30, 45] },
  },
  photoWeeks: [0, 4, 8, 12, 16, 19],
  alternativeSlots: {
    // Start load = the last logged one (12 kg × 12, Sep 2026).
    incline_hammer_curl: isolation('incline_hammer_curl', failure(2, 8, 12), 12, 'kg', 'per_hand',
      ['Bench at a high incline, arms hanging behind the body; neutral grip. Only while the elbow stays at 0–3/10.'],
      { elbowLoading: true }),
  },
  restart: { capAfterDays: 10, firstWeekAfterDays: 14, capPlusReps: 2 },
};
