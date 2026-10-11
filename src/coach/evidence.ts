// Playbook entry ids used in Signal.why, each with a one-line summary. The full entries live in the
// playbook (docs/playbook/); these lines are only for tooltips and the check-in report.

export const EVIDENCE = {
  // Training
  "P-STRUCT": "Four lifting days (Lower A, Upper A, Lower B, Upper B) around a ride, boxing and Sunday rounds.",
  "P-VOLUME": "72 working sets a week, about 85% of the stimulus of your best weeks; care work is not counted.",
  "P-EFFORT": "No RPE: normal sets stop at the prescribed reps, rep-outs at a stop sign, isolation at failure.",
  "P-PROG-TM": "Squat and deadlift run on a training max that each rep-out moves by −5% … +4%.",
  "P-PROG-STEP": "Incline DB and pull-up: ≥10 reps on the rep-out → one step up, 6–9 same, ≤5 one step down.",
  "P-PROG-DOUBLE": "Accessories: once every set reaches the top of the range, add the smallest load step.",
  "P-PROG-APRE": "Rep-out-last accessories jump by the rep-out reps: +7.5% at range top + 7, +5% at + 2 to + 6.",
  "P-CALIB": "Week 0 rep-outs set the training maxes; past 12 reps the TM is provisional.",
  "P-WEEKTYPES": "Week types A/B/C/D (5s, 4s, 3s, 2s); a missed week is repeated, not skipped.",
  "P-DEADLIFT": "Deadlift: a low-rep ramp, then one heavy top-set rep-out.",
  "P-WARMUP": "Warm-up ramps: squat bar, 50/70/85%; deadlift 60/75/90% of the top set.",
  "P-EXERCISE": "Exercise choices protect the elbow and shoulder: DB pressing, neutral grips, straps.",
  "P-REST-TEMPO": "Mains 3 min (4 before a rep-out), compounds 2–3 min, isolation 90 s.",
  "P-DELOAD": "Deloads are light training, not time off; take one early if rep-outs miss two weeks running.",
  "P-TAPER": "Week 18 tapers into the PR test: less volume, intensity kept.",
  "P-CHECKPOINT": "Checkpoints at weeks 6 and 14 compare both TMs and the bodyweight average with the plan.",
  "P-ADHERENCE": "Showing up decides the block: the floor in a bad week is Lower A + Upper A.",
  "P-EXTRASETS": "Checkpoint 1 met: +1 set for the two most lagging muscles in weeks 8–9.",
  // Nutrition
  "N-SURPLUS": "Lean bulk at 2,800 kcal, about 5–8% over a maintenance of ≈2,600.",
  "N-RATE": "Aim for +0.1–0.25 kg a week on the 7-day average; change calories by 100 kcal at most every 2 weeks.",
  "N-PROTEIN": "Protein about 2.0 g/kg (≈180 g); benefits level off near 1.6 g/kg.",
  "N-CARBS": "Extra calories come from carbs: they fuel the sessions.",
  "N-TDEE": "Maintenance measured from your own intake and weight trend (7,700 kcal per kg).",
  "N-WAIST": "Waist at the navel every 2 weeks: rising >1 cm a month while lifts stall means too much surplus.",
  "N-CREATINE": "Creatine 3–5 g a day.",
  "N-CAFFEINE": "Evening sessions: about 150 mg caffeine or none; 3–6 mg/kg needs ≥12 h before bed.",
  // Recovery and conditioning
  "C-SLEEP": "Sleep 7–9 h; short sleep shows in rep-outs first.",
  "C-CONCURRENT": "Easy riding and boxing next to lifting cost little strength or muscle.",
  "C-ROUNDS": "Sunday rounds: 2 min hard / 1 min easy; add one when the last round is within 10% of the first.",
  "C-SPARRING": "Keep sparring controlled; skip it with a headache, dizziness or fogginess.",
  // Joints
  "J-PAINRULE": "Ache during a set is fine; sharp pain ends the exercise; sore next morning → swap for 2 weeks.",
  "J-SWAPS": "Each painful exercise has a swap list; move one step down it.",
  "J-ELBOW": "Right elbow (outer side): neutral or underhand grips, soft lockouts, wrist extensions.",
  "J-SHOULDER": "Right shoulder (front, collarbone): laterals in front of the body, shorter stretch on flyes and presses.",
  "J-REDFLAGS": "Numbness, swelling, night pain, weakness or a pop: see a GP or fysiotherapeut sooner.",
  // Model
  "M-E1RM": "Estimated 1RM = load × (1 + reps/30), trustworthy up to about 12 reps.",
  "M-REGAIN": "Regaining old strength runs at ≈3% a week, slowing towards the old best.",
  "M-STRENGTH-BW": "About +4 kg squat e1RM per kg of bodyweight in your history.",
  "M-INDIVIDUAL": "Your own log beats population averages; the rules adapt to your numbers.",
} as const;

export type EvidenceId = keyof typeof EVIDENCE;
