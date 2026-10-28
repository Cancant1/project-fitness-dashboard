// Playbook entry ids used in Signal.why, each with a one-line summary. The full entries live in the
// playbook (docs/playbook/); these lines are only for tooltips and the check-in report.

export const EVIDENCE = {
  // Training
  "P-STRUCT": "Four lifting days (Lower A, Upper A, Lower B, Upper B) around Thursday boxing; Wednesday and Sunday are free.",
  "P-VOLUME": "70 working sets a week, about 85% of the stimulus of your best weeks; care work is not counted.",
  "P-EFFORT": "No RPE: normal sets stop at the prescribed reps, rep-outs at a stop sign, isolation at failure (stop sign while the elbow is irritable or after 2 hard-feeling sessions). A set ended by breathing, not the muscle, may be short of failure.",
  "P-PROG-TM": "Squat and deadlift run on a training max that each rep-out moves by −5% … +4%; past the old best (165 / 235) a hit holds it and a beat adds at most 2.5 kg.",
  "P-PROG-STEP": "Incline DB and pull-up: ≥10 reps → one step up (incline ≥16: two dumbbells; pull-up ≥12: +5 kg), 6–9 same, ≤5 one step down; stuck at 6–9 three times → normal sets of 6, then 7. Pull-ups read on bodyweight + belt.",
  "P-PROG-DOUBLE": "Accessories: once every set reaches the top of the range, add the smallest load step. A first set of 35+ reps (not elbow work) goes up two steps at once.",
  "P-PROG-APRE": "Rep-out-last accessories jump by the rep-out reps: +7.5% at range top + 7, +5% at + 2 to + 6; +5% / +2.5% once back at the last logged load.",
  "P-CALIB": "Week 0 rep-outs set the training maxes; past 12 reps the TM is provisional.",
  "P-WEEKTYPES": "Week types A/B/C/D (5s, 4s, 3s, 2s) for squat and deadlift; loads rise over 3 weeks, then reset at a higher TM.",
  "P-DEADLIFT": "Deadlift: a low-rep ramp, then one heavy top-set rep-out.",
  "P-WARMUP": "Warm-up ramps: squat bar, 50/70/85%; deadlift 60/75/90% of the top set.",
  "P-EXERCISE": "Exercise choices protect the elbow and shoulder: DB pressing, neutral grips, straps.",
  "P-REST-TEMPO": "Mains 3 min (4 before a rep-out), compounds 2–3 min, isolation 90 s; up to 2 min while still out of breath.",
  "P-DELOAD": "Deloads are light training, not time off; take one early after 2 rep-outs ≥2 under, 3 rep-outs ≥1 under, or rising joint aches.",
  "P-TAPER": "Week 18 tapers into the PR test: less volume, intensity kept.",
  "P-CHECKPOINT": "Checkpoints at weeks 6 and 14 compare both TMs and the bodyweight average with the plan; behind: Friday light squat, deadlift back-off sets.",
  "P-ADHERENCE": "Showing up decides the block: the floor is 2 sessions; a missed week is not repeated (it counts as a deload); 2–3 weeks off: TM −5%; 4+: recalibrate.",
  "P-EXTRASETS": "Checkpoint 1 met: +2 biceps and +2 triceps sets a week (one more set on each arm exercise on Tue and Sat); optional +1 rear delt set.",
  "P-MINIMUM": "A ~30-min minimum session (main-lift rep-out + one hard set of 2 accessories) counts as the day's session.",
  "P-TIMESAVE": "Straight sets, no supersets. Short day (past 80 min): the last 2 sets of one cable isolation become 1 drop set.",
  "P-RESTART": "After ≥10 days off the rep-out is capped at target + 2; the first week after ≥2 weeks has no failure or extra sets; missed sets are gone.",
  "P-VARIETY": "At the deloads (weeks 7 and 10) up to 2 accessories may be swapped for a listed equivalent.",
  "P-HABITS": "Habits: sessions first, never miss twice, come back within 48 h, 6 weeks at 4+ sessions; if-then plans for bad days.",
  // Nutrition
  "N-SURPLUS": "Lean bulk at 2,800 kcal, about 5–8% over a maintenance of ≈2,600.",
  "N-RATE": "Aim for +0.1–0.25 kg a week (28-day fit from week 3, ≥20 weigh-ins, autocorrelation-corrected SE); change calories by 100 kcal at most every 2 weeks.",
  "N-PROTEIN": "Protein 2.0 g per kg of bodyweight (≈150 g now; the fixed day gives ≈180 g); benefits level off near 1.6 g/kg.",
  "N-CARBS": "Extra calories come from carbs: they fuel the sessions.",
  "N-TDEE": "Maintenance (as logged) from your own intake and weight trend: ≥24 of 28 days logged, 6,000 kcal per kg, weeks 0–4 left out (creatine).",
  "N-WAIST": "Waist (optional): rising >1 cm a month on the slope of ≥3 readings while lifts stall means too much surplus.",
  "N-CREATINE": "Creatine 5 g a day from 11 Oct 2026: ~+0.7 kg of water on the scale over the first 4 weeks.",
  "N-CAFFEINE": "Normal sessions: no caffeine (≤75 mg); key sessions ~150 mg at 17:15; none after 14:00 otherwise.",
  "N-ALCOHOL": "No alcohol on the evening after lifting or boxing; otherwise ≤2 drinks.",
  // Recovery and conditioning
  "C-SLEEP": "Sleep 7–9 h, ≥7.5 h before lifting days (lights out 23:15); short sleep shows in rep-outs first.",
  "C-READINESS": "Resting HR and HRV are information only (7-day vs 60-day baseline); no HRV-based training rule.",
  "C-CONCURRENT": "Boxing next to lifting costs little strength or muscle; 24 h before the deadlift is enough.",
  "C-ROUNDS": "Sunday rounds: 2 min hard / 1 min easy, +1 when the last is within 10% of the first; 2 burst rounds from week 4; finish by 14:00.",
  "C-SPARRING": "Keep sparring controlled; skip it with a headache, dizziness or fogginess. Fading: round 1 at ~80%, breathe out on punches.",
  // Joints
  "J-PAINRULE": "Pain 0–10: 0–3 go, 4–5 hold the load, ≥6 or sharp stop; next morning ≥2 over your usual → swap for 2 weeks; rising 2 weeks → cut sets.",
  "J-SWAPS": "Each painful exercise has a swap list; move one step down it, starting at 90% of your last load there.",
  "J-ELBOW": "Right elbow (outer side): neutral or underhand grips, soft lockouts, the wrist-extension ladder on Mon and Fri; next rung after a clean session.",
  "J-SHOULDER": "Right shoulder (front, collarbone): laterals in front of the body, shorter stretch on flyes and presses. The care block comes back if the elbow flares or its monthly score rises.",
  "J-REDFLAGS": "Numbness, swelling, night pain, weakness or a pop: see a GP or fysiotherapeut sooner.",
  // Model
  "M-E1RM": "Estimated 1RM = load × (1 + reps/30), trustworthy up to about 12 reps.",
  "M-REGAIN": "Regaining old strength runs at ≈3% a week, slowing towards the old best; past it, ≈0.1–0.2% a week.",
  "M-STRENGTH-BW": "About +4 kg squat e1RM per kg of bodyweight in your history.",
  "M-INDIVIDUAL": "Your own log beats population averages; the rules adapt to your numbers.",
  "M-MEASURE": "Progress photos every 4 weeks plus daily scale weight; no tape, the waist is optional.",
} as const;

export type EvidenceId = keyof typeof EVIDENCE;
