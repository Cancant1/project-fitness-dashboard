# Coach: specification

The coach reads what Mario enters (sets, rep-outs, weigh-ins, food, waist, pain checks, conditioning,
session energy; sleep is no longer tracked since 21 Oct 2026) and tells him how he is doing against the Strength Return Plan:
- whether he is on track,
- what to change,
- why.

All messages are hard-coded templates filled with his numbers. Every rule below comes from Part 1 of
`docs/plan/Strength_Return_Plan_chat_export.md` (the agreed plan) or from the science check
(`docs/plan/verification/science_check.md`), unless marked **NEW** (a later, dated decision; see the
playbook's `DECISIONS.md`).

Rules are pure functions in `src/coach/`, unit-tested and free of React. The same engine runs:
- in the app (Today cues, the Check-in page),
- in `scripts/checkin.ts`, which Claude runs at the weekly check-in.

## 1. Inputs

| Input | Where it is entered | Table |
|---|---|---|
| Sets, reps, loads, rep-outs | Workout logger | `sessions`, `sets` |
| Training maxes (squat, deadlift) | Written when a workout is finished | `training_maxes` |
| Morning weight | Weight page / Today | `body_measurements` kind `weight` |
| Waist at the navel, every 2 weeks | Weight page (**NEW** input) | `body_measurements` kind `waist`, unit cm |
| Food | Food page | `food_entries`, `nutrition_days` |
| Nutrition target | Plan default + coach adjustments | `nutrition_targets` |
| Pain during a set (none / ache / sharp) | Pain sheet in the logger | `pain_checks.during_set` |
| Pain next morning (normal / sore) | Today prompt (**NEW**) | `pain_checks.next_morning` |
| Session energy 1–5 | Finish-workout sheet (**NEW**) | `sessions.energy` |
| ~~Sleep hours~~ (removed 21 Oct 2026: not tracked) | — | — |
| Ride, boxing, rounds | Conditioning card | `conditioning` |
| Coach adjustments he accepted | "Apply" buttons (**NEW**) | `programs.rules.adjustments[]` |

**Clean slate.** Judgements use only data from the plan's start date (programme `start_date`, 12 Oct 2026)
onward. History supplies baselines only:
- good-week volume per muscle,
- lifetime bests,
- the regain curve.

## 2. Calendar

- The plan week of a date comes from `weekForDate(program, date)`.
- A check-in week runs Monday to Sunday. The weekly report is for a week number. While that week is still
  running it is labelled "so far", and the rules that need the full week return `pending`.
- Use the adjusted programme (§7), never raw `PLAN`.

## 3. Output shape (`src/coach/types.ts`)

```ts
type Status = "good" | "watch" | "act" | "info" | "pending";
type Area = "consistency" | "strength" | "muscle" | "body" | "fuel" | "joints" | "recovery" | "conditioning";

interface Signal {
  id: string;                 // stable rule id + subject, e.g. "body.rate", "strength.tm.squat"
  area: Area;
  status: Status;
  title: string;              // ≤ 6 words, e.g. "Squat on track"
  message: string;            // one or two sentences with his numbers
  metric?: { label: string; value: string; target?: string; series?: number[] };
  action?: CoachAction;       // something he can apply with one tap
  why: string[];              // playbook entry ids, e.g. ["P-PROG-TM", "R-MANN-2010"]
}

type CoachAction =
  | { kind: "kcal"; delta: 100 | -100; from: string }                 // new nutrition_targets row
  | { kind: "deload_now"; weekNo: number }                            // this week becomes a deload
  | { kind: "extra_sets"; muscles: Muscle[]; fromWeek: number }       // after checkpoint 1 is met
  | { kind: "main_lift_set"; lifts: MainLiftKey[]; fromWeek: number } // behind at a checkpoint
  | { kind: "repeat_week"; missedWeekNo: number }                     // shiftAfterMissedWeek
  | { kind: "tm_reduce"; percent: 5 }                                 // ≥2 weeks off
  | { kind: "swap"; exerciseKey: string; to: string; until: string }; // advisory in phase 1 (§9)

interface WeeklyReport {
  weekNo: number; weekType: WeekType; from: string; to: string; complete: boolean;
  verdict: "on_track" | "watch" | "adjust" | "too_early";
  headline: string;           // one sentence
  actions: Signal[];          // the top 3 "act" signals, then "watch", in priority order
  signals: Signal[];          // all signals, grouped by area
  numbers: WeekNumbers;       // the raw metrics, so the check-in script can print them
}

interface DailyCue {          // Today page, at most 3, in priority order
  id: string; tone: "warm" | "plain" | "good"; text: string; to?: string; action?: CoachAction;
}
```

Entry points:
- `weeklyReport(data, weekNo, today)`
- `dailyCues(data, today)`
- `coachData(tables)`: builds the input from the store's rows.

### Verdict

Each check below is evaluated once, from the top:

| Condition | Verdict |
|---|---|
| Week 0, or fewer than 3 days of data | `too_early` |
| Any `act` signal | `adjust` |
| Two or more `watch` signals | `watch` |
| Otherwise | `on_track` |

**Headline templates:**
- `on_track`: "Week {n} is on plan. Keep going."
- `watch`: "Mostly on plan. Keep an eye on {first watch title, lower-cased}."
- `adjust`: "{n} change{s} to make this week: {first action title, lower-cased}."
- `too_early`: "Week {n}: too early to judge. Log everything."

## 4. Rules by area

`{…}` = filled in. Numbers are rounded the way the UI shows them:
- kg to 0.1 for bodyweight,
- kg to 2.5 for loads,
- kcal to 10,
- protein to 1 g.

### 4.1 Consistency

| id | Rule | Status and message |
|---|---|---|
| `consistency.sessions` | Completed plan sessions this week vs planned lifting days in the adjusted week (4; fewer in the test week). | 4/4 `good` "4 of 4 sessions." · 3 `watch` "3 of 4 sessions. One missed day is fine; two in a row is a trend." · ≤2 with the week complete `act` "{k} of 4 sessions. Bad week? The floor is Lower A + Upper A." · week still running: `pending` "{k} of 4 so far." |
| `consistency.floor` | **Daily cue.** From Thursday, if 0 of the week's lifting sessions are done. | cue (warm): "No lifting yet this week. Do Lower A today or tomorrow, then Upper A. That's the floor." |
| `consistency.missed_week` | A finished plan week with 0 completed plan sessions, for the most recent such week not yet handled by an adjustment. | `act` "Week {w} was missed. Repeat it instead of skipping ahead; everything after moves a week." action `repeat_week`. |
| `consistency.long_break` | ≥14 days since the last completed plan session (while the plan is active). | `act` "{d} days off. Lower both training maxes by 5% before the next session." action `tm_reduce`. |
| `consistency.streak` | Info: run of consecutive complete weeks with ≥3 sessions, from the plan start. | `info` "{n} weeks in a row with 3+ sessions. Your longest since 2023 was 14." |

### 4.2 Strength

**Main lifts with a training max (squat, deadlift).** The plan line is a straight line from the calibration TM
(week 0) to checkpoint 1's TM (week 6), then to checkpoint 2's TM (week 14), then to the goal TM:
- squat goal 145 × 5 → 167.5,
- deadlift goal 205 × 5 → 237.5,

each at week 19. Deload and taper weeks still count toward the line.

| id | Rule | Status and message |
|---|---|---|
| `strength.tm.{lift}` | The latest TM vs the plan line at the current week. | Within 2.5% below it or above: `good` "{Lift} TM {tm}, plan line {line}." · 2.5–5% below: `watch` "{Lift} TM {tm} is {x} kg under the plan line ({line})." · More than 5% below: `act` "{Lift} TM {tm} is {x} kg behind. Check sessions, sleep and bodyweight first." |
| `strength.repout.{lift}` | This week's rep-out: clean reps vs target and the TM change applied. | Hit or over: `good` "{Lift} {load} × {reps} (target {t}): TM {±p}% to {new}." · 1 under: `watch` · ≥2 under: `act` (same template plus "Note anything off: sleep, food, pain."). |
| `strength.misses` | Squat or deadlift rep-out under target in two consecutive weeks (non-deload) **and** bodyweight is not falling. | `act` "Rep-outs missed two weeks running. Take the deload now; the plan allows it early." action `deload_now`. If bodyweight is falling: `act` "Rep-outs missed two weeks running and bodyweight is dropping. Eat first: +100 kcal." action `kcal +100`. |
| `strength.checkpoint` | In a checkpoint week (6, 14) once it is complete: `checkpointStatus()`. | Met: `good` "Checkpoint {n} met: squat {s}/{S}, deadlift {d}/{D}, bodyweight {b}/{B}." action `extra_sets` (two most lagging muscles; §4.3) for checkpoint 1 only. · Behind with bodyweight short: `act` "Checkpoint {n} missed. Bodyweight {b} vs {B}: fix food first, +100 kcal." · Behind with sessions and bodyweight fine: `act` "Checkpoint {n} missed on {lifts}. Add one normal set to each main lift." action `main_lift_set`. |
| `strength.checkpoint_ahead` | 1–3 weeks before a checkpoint: projection = TM + (average TM change per rep-out week over the last 3) × rep-out weeks left. | ≥ target `good` "On course for checkpoint {n}: squat ≈{p} by {date} (needs {S})." · < target `watch` "Checkpoint {n} in {k} weeks: squat ≈{p}, needs {S}." |
| `strength.calibration` | Week 0 or the first rep-out: rep-out over 12 clean reps → provisional TM (§6.2). | `info` "{Lift} {load} × {reps}: past 12 reps the formula is rough, so the TM is provisional ({tm}). The next rep-outs correct it." |

**Step lifts (incline DB, weighted pull-up).**

| id | Rule | Status and message |
|---|---|---|
| `strength.step.{lift}` | Rep-out result and the load change. | ≥10: `good` "{Lift} {load} × {reps}: next {next}." · 6–9: `info` "Same load next week." · ≤5: `watch` "One step down to {next}." |
| `strength.step_pace.{lift}` | Steps left to the goal load (incline 37.5 per hand; pull-up +20) vs rep-out weeks left. | Steps left ≤ weeks left: `good` "{n} steps to {goal}, {w} rep-out weeks left." · Otherwise `watch` "{n} steps to {goal} with {w} rep-out weeks left: behind pace." · No step in the last 4 rep-out weeks: `watch` "{Lift} stuck at {load} for 4 weeks." |

### 4.3 Muscle (hypertrophy)

| id | Rule | Status and message |
|---|---|---|
| `muscle.volume` | Completed working sets this week (not warm-up, not care work) vs the adjusted week's planned working sets (70 in a normal week). | ≥90%: `good` "{k} of {p} working sets." · 70–90%: `watch` · <70% with the week complete: `act` "{k} of {p} sets: below the dose that keeps you growing." |
| `muscle.by_muscle` | Fractional sets per muscle this week vs the plan's per-muscle figure and the good-week reference (`REFERENCE` in `progress/cards.tsx`; move it to `src/coach/reference.ts`). | `info` with a series: the two muscles with the lowest % of good-week volume. Used by the `extra_sets` action. |
| `muscle.progress` | Per accessory exercise (double progression or rep-out last): sessions since the load or total reps last went up. | 3+ sessions without either: `watch` "{Exercise} hasn't moved in {n} sessions. Last sets: {sets}. Make sure the last set reaches a stop sign." · Summary `info` "{m} of {n} accessories progressed in the last 2 weeks." |
| `muscle.effort` | Failure-scheme isolation sets more than 5 reps above the range top on every set. | `info` "{Exercise}: {reps} reps is above the {lo}–{hi} range. The load jumps two steps next time." |

### 4.4 Body (bodyweight and waist)

The expected path is the plan's table, interpolated linearly between its points:

| Date | Expected 7-day average |
|---|---|
| 12 Oct (week 0 start) | 74.0–74.0 |
| 1 Nov | 74.5–75.0 |
| 29 Nov | 74.9–75.8 |
| 24 Jan | 75.7–77.4 |
| 28 Feb | 76.2–78.4 |

| id | Rule | Status and message |
|---|---|---|
| `body.weighins` | Weigh-ins this week. | ≥5 `good` · 3–4 `watch` "Only {k} weigh-ins. The average needs most mornings." · ≤2 `act` "{k} weigh-ins: not enough to judge the bulk." |
| Weight page "On track" (`bodyweightStatus`) | Every day from the plan start, weeks 0–2 included (marked "Early read"): the 7-day average vs the expected band, and the least-squares pace of the last 14 days' weigh-ins (≥ 5 over ≥ 7 days) vs 0.10–0.25 kg/week plus the creatine water expected in those days. Verdict: both inside → on track; one off → that side; one above and one below → on track (already correcting). Information only: calories still change only through `body.rate`. | "On track" / "Above target" (eating a bit much) / "Below target" (room to eat more), also as a pill on Today's weight card. |
| `body.path` | The 7-day average vs the expected band on the week's last day. | Inside: `good` "7-day average {avg} kg, plan range {lo}–{hi}." · Below: `watch` · Above: `watch` (text names the direction). |
| `body.rate` | **Every 2 weeks from week 3**, on weeks 3, 5, 7, 9, 11, 13, 15, 17 (complete): the least-squares slope of all weigh-ins in the last 28 days (≥10 weigh-ins over ≥21 days), in kg/week, with its standard error. Weeks 0–2 are skipped (glycogen and water). Bands: <+0.10 → +100 kcal · +0.10 to +0.25 → keep · >+0.25 → −100 kcal. **Science check A3:** act only when the slope is past the band edge by more than 1 SE; otherwise watch and re-check in 2 weeks. | `act` "Gaining {r} kg/week (target 0.10–0.25). Add 100 kcal of carbs from Monday." action `kcal +100` (or −100 with "Remove 100 kcal."). · Clear but within 1 SE: `watch` "Gaining {r} kg/week, close to the edge. Same calories; re-check in 2 weeks." · In band: `good` "Gaining {r} kg/week: right in the lean-bulk range." · Off weeks: `info` "Next rate check: Sunday {date}." |
| `body.waist` | Waist entries: change per 30 days over the last ≥28 days. Rising >1 cm/month **and** no squat/deadlift TM increase in the same period. | `act` "Waist +{x} cm/month while lifts stall. Remove 100 kcal." action `kcal −100`. · Due (none in 14 days): cue "Waist check due: tape at the navel, morning." |

### 4.5 Fuel (nutrition)

| id | Rule | Status and message |
|---|---|---|
| `fuel.logging` | Days with any food logged this week. | ≥6 `good` · 4–5 `watch` "Food logged on {k} days. The calorie checks need most days." · ≤3 `act` "Food logged on {k} days: can't judge the bulk." |
| `fuel.kcal` | Average kcal on logged days vs the target. | Within ±150: `good` "Average {avg} kcal, target {t}." · Under by >150: `act` "Average {avg} kcal: {gap} under target. The surplus is the point of the block." · Over by >150: `watch`. |
| `fuel.protein` | Average protein (g) and g/kg of the 7-day average bodyweight. Target = `protein_per_kg` × bodyweight (2.0 g/kg), with the plan's fixed day (~180 g) as the natural result. Floor 1.6 g/kg (Morton 2018 breakpoint). | ≥ target − 10 g: `good` "{g} g/day = {gkg} g/kg." · Between the 1.6 g/kg floor and target − 10 g: `watch` · Under the floor: `act` "{g} g/day is {gkg} g/kg, under the 1.6 g/kg that matters. Add the post-session shake or 500 g kwark." |
| `fuel.tdee` | `adaptiveTdee()` over 28 days, when ≥18 intake days and ≥10 weigh-ins. | `info` "Your measured maintenance: ≈{tdee} kcal (plan assumed 2,600). Target {t} = {+x}% over it." If the target is under maintenance + 3%: `watch` "Target is only {x}% over your measured maintenance." |
| `fuel.today` | **Daily cue.** After 18:00, protein so far < target − 40 g. | cue: "{left} g protein to go. Shake or kwark." |

### 4.6 Joints (elbow, shoulder)

The pain rule from Part 1:
1. An ache during a set is fine.
2. Sharp pain, or pain that changes form, ends that exercise for the day.
3. Sore the next morning, or worse at the next session: move that exercise one step down the swap list for 2 weeks.

| id | Rule | Status and message |
|---|---|---|
| `joints.prompt` | **Daily cue (morning).** A pain check from yesterday or the last session with `during_set` = ache or sharp and `next_morning` null. | cue (warm): "{Site} after {exercise} yesterday: how is it this morning?" with buttons Normal / Sore, which write `next_morning`. |
| `joints.swap` | `next_morning` = sore, or `worse_than_last` = true, for an exercise in the last 14 days with no active swap. | `act` "{Site} sore after {exercise}. Swap to {next on the swap list} for 2 weeks (until {date})." action `swap` (advisory in phase 1). |
| `joints.sharp` | Any `sharp` this week. | `watch` "Sharp pain in {site} during {exercise} on {day}. That exercise stopped for the day — right call." |
| `joints.trend` | Sessions with an ache per site, this week vs the last 3 weeks' average. | Rising: `watch` "{Site} aches are more frequent ({k} sessions this week)." · None: `good` "No joint complaints." |
| `joints.redflags` | Static info, shown in the Joints detail only. | "See a GP or fysiotherapeut sooner for: numbness or tingling, swelling, pain at night, weakness, or pain that started with a pop. A fysio needs no referral." |

The swap list (Part 1):
- Incline DB → neutral-grip DB bench → DB floor press.
- Overhead extension → cross-body extension → reverse-grip pushdown.
- Bar pushdown → reverse grip → rope.
- Hammer curl → underhand cable curl → preacher curl.
- Bayesian curl → preacher curl (if the front of the shoulder hurts).
- Pull-up → neutral-handle pulldown.
- Barbell row → underhand grip → seated cable row.

### 4.7 Recovery

| id | Rule | Status and message |
|---|---|---|
| ~~`recovery.sleep`~~ | Removed 21 Oct 2026 with sleep tracking (also `recovery.sleep_lifting`, the short-night flag on rep-outs and the "fix sleep first" branch of `strength.misses`). | — |
| `recovery.energy` | Average session energy (1–5) this week vs the previous 3 weeks. | A drop of ≥1 point with ≥3 rated sessions: `watch` "Sessions feel harder (energy {a} vs {b}). Check sleep and food." |
| `recovery.caffeine` | Static info (science check A1). | "Evening sessions: ~150 mg caffeine or none; the 3–6 mg/kg dose needs ≥12 h before bed." |

### 4.8 Conditioning

| id | Rule | Status and message |
|---|---|---|
| `conditioning.week` | Ride, boxing and rounds done vs prescribed this week. | All `good` · Missing one `info` · Rounds: `roundsNextWeek()`. Message: "Ride {m}/{M} min · boxing {✓/–} · rounds {r} (next week {n})." |

## 5. Daily cues (Today)

Priority, at most 3:
1. `joints.prompt` (morning)
2. a pending coach action (the first `act` signal of the current or previous week)
3. `consistency.floor`
4. a weigh-in reminder before 11:00 if none today ("Weigh in after the first pee.")
5. `fuel.today` (after 18:00)
6. a waist check due
7. on Sundays: "Week {n} check-in is ready." → `/checkin`

## 6. Progression changes in the plan engine

### 6.1 NEW (11 Oct 2026): faster jumps for rep-out-last accessories

This applies to the RDL, seated cable row, Bulgarian split squat, barbell row and DB bench. Previously these used
plain double progression (+1 step when every set reached the top of the range). That stays the rule for normal
sets, but the **rep-out reps** now set the size of the jump (APRE, Mann 2010; the adjustment table of the
10RM APRE protocol):

| Rep-out reps vs range top `hi` | Next load |
|---|---|
| ≥ hi + 7 | +7.5%, at least one step |
| hi + 2 … hi + 6 | +5%, at least one step |
| hi … hi + 1, with every normal set at hi | +1 step (double progression, unchanged) |
| below the range bottom `lo` | −1 step |
| otherwise | same load |

- Round to the nearest available load: barbell 2.5 kg, the dumbbell rack, cable pins (`weightsFor`).
- Example: RDL 80 × 20 → 87.5; × 16 → 92.5 next; × 14 → 97.5; × 12 → 102.5; × 10 → +2.5.

### 6.2 Provisional training max (science check A2)

- A squat or deadlift calibration rep-out (or the first rep-out when there is no TM) with more than 12 clean
  reps sets TM = load × (1 + 12/30), rounded down to 2.5 kg.
- The TM is marked `note: "provisional (>12 reps)"`. The rep-out table then moves it from the next week on.
- This is conservative on purpose: a TM that is too high makes week-1 loads unsafe.

### 6.3 Isolation overshoot

- When every failure set is ≥ hi + 5 reps, the next load is +2 steps instead of +1.

## 7. Adjustments (programs.rules.adjustments)

```ts
interface Adjustment { id: string; kind: CoachAction["kind"]; created: string; signalId: string; data: CoachAction; }
```

- `applyAdjustments(PLAN, adjustments) → ProgramDefinition` folds them into the programme:
  - `repeat_week` → `shiftAfterMissedWeek`.
  - `deload_now` → that week's type becomes `deload` (the later weeks are unchanged; "never push it more than a
    week later" is satisfied because the deload moves earlier).
  - `extra_sets` → `PlanState.extraSetsMuscles`.
  - `main_lift_set` → `PlanState.addMainLiftSet`.
  - `tm_reduce` → writes new `training_maxes` rows (reason `missed_weeks`) at apply time; it is not folded.
  - `kcal` → writes a new `nutrition_targets` row (effective next Monday, `kcal ± 100`, rest copied) at apply time.
  - `swap` → stored; phase 1 shows it in the plan and the workout as a note ("Swap: {to} until {date}").
- `usePlan()` (in `plan/bridge.ts`) returns the adjusted programme. The pages use it instead of `PLAN` for
  prescriptions.
- Sunday rounds: `PlanState.sundayRounds` comes from the last logged rounds via `roundsNextWeek()`.

## 8. Check-in with Claude

- `scripts/checkin.ts`, run with `npx tsx scripts/checkin.ts [--week N] [--out ../docs/checkins]`:
  - pulls Mario's rows read-only with the secret key from `../.env.local` (never printed);
  - runs `weeklyReport()` and writes:
    - `docs/checkins/data/{date}.json` (snapshot; git-ignored),
    - `docs/checkins/{date}-week-{n}.md` (the report: verdict, signals, numbers, open questions).
- The `weekly-checkin` skill (`.claude/skills/weekly-checkin/SKILL.md` in the outer folder) tells Claude to:
  1. run the script,
  2. read the playbook and the last check-in,
  3. discuss the report with Mario,
  4. record decisions in `docs/playbook/DECISIONS.md` and gaps in `GAPS.md`,
  5. apply agreed changes.

## 9. Phase 2 (not built yet)

- In-plan swaps: the substitute exercise replaces the slot, with its own load history.
- Apple Watch sleep, resting HR and HRV through the iOS Shortcut, into `recovery`.
- An e1RM-based week-0 load for the step lifts (incline, pull-up), if Mario agrees.
- Readiness (HRV vs baseline) to suggest a lighter day.

## 10. Research round 1 changes (docs/R1_BUILD.md, Part E; built 11 Oct 2026)

These replace the matching rules above where they differ.

| Rule | Change |
|---|---|
| `consistency.sessions` | Floor = 2 sessions (2 → `watch` "the floor held"; ≤ 1 → `act`). Minimum sessions count. The weekly headline leads with "{k} of {n} sessions." |
| `consistency.missed_week` | Move on, never repeat (`watch`, no action). Week 5 or 6 missed → `act` with `skip_deload` (week 7 becomes a C week). `repeat_week` is only folded for old rows. |
| `consistency.long_break` | 14–27 days → `tm_reduce`; ≥ 28 days → `recalibrate` (next squat/deadlift session: calibration rep-out at 75% of the last TM, provisional rules). |
| `consistency.missed_twice` / `comeback` / `habit` | New (P-HABITS): two planned lifting dates in a row without a session → `watch`; a session within 48 h of a miss → `good`; weeks in a row with 4+ sessions, meter n/6. |
| `strength.repout` | Past the old best (squat 165, deadlift 235) "TM stays / +2.5 kg … (capped past your old best)". A miss after a < 6 h night → `watch` with the short-night line. |
| `strength.misses` | 2 rep-outs in a row ≥ 2 under, or 3 in a row ≥ 1 under; short-night misses don't count. |
| `strength.checkpoint` | Met (cp 1): fixed arm package `extra_sets` with `targets` (+1 set on Bayesian, overhead extension, underhand curl, reverse pushdown) in every A–D week after checkpoint 1 through week 17 (8, 9, 11–17; never deload, taper or test), plus `strength.checkpoint.rear_delt` (optional Tuesday rear delt set). Behind: `main_lift_set` for the lifts behind + incline + pull-up; squat → Friday 2 × 3 at 75% TM, deadlift → 2 back-off sets × 3–5 at 80% of the top set. |
| `muscle.overreach` / `muscle.variety` | New: logged sets > planned × 1.1 → `watch` ("Missed sets are gone…"); deload weeks 7 and 10 → `info` (up to 2 accessory swaps). |
| `body.rate` | Checks from week 5 (fit from week 3, creatine); ≥ 20 weigh-ins; outliers > 1.5 kg dropped; SE corrected for autocorrelation; England 20 Dec – 3 Jan left out ("skipped (holiday)"). |
| `body.path` | Band + creatine water (0 → +0.7 kg over weeks 0–4). |
| `body.waist` | Slope of ≥ 3 readings; the due cue only while he logs it (a waist in 30 days, none in 14). |
| `body.photos` | New: photo weeks 0, 4, 8, 12, 16, 19; Thursday cue until done (`body_measurements` kind `other`, value 1, note `photos`). |
| `fuel.tdee` | "Maintenance (as logged)": ≥ 24 of 28 days, 6,000 kcal/kg, window after week 4. |
| `joints.*` | Pain 0–10 (`pain_score`, `morning_score`): swap when the morning is ≥ the site's 14-day median + 2 (start load in the action); ≥ 6 counts as sharp; aches rising 2 weeks → `deload_now`; morning means rising 2 weeks → `joints.cut_sets` (sets × 2/3 for 2 weeks, red flags); 4 weeks at 0–3 → `joints.alternative` (incline hammer curl). |
| `recovery.*` | `resting_hr` and `hrv` as info only (7-day vs 60-day); the lights-out cue (23:15 before lifting days) stays, sleep itself isn't tracked. |
| `conditioning.gassed` | New: Thursday "gassed" 1–5 trend over 6 weeks; pacing tip from week 8. |
| Daily cues | Pain prompt (0–10) → if-then cues (missed yesterday, Thursday floor, minimum session, first exercise after 17:00, Sunday planning) → pending action → floor (Fri+) → weigh-in → photos → caffeine/candy (from 15:00) → protein → monthly elbow check → waist → lights out → check-in. |
