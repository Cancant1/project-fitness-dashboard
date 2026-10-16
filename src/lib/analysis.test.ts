import type { Session, SetRow } from "../data/types";
import {
  blockComparison, blockLabel, compareSets, confidenceLabel, detectPRs, e1rm, fractionalVolume, goalValue, isFlagged, linearFit,
  metricValue, monthIndex, monthFromIndex, monthlyAverages, monthlyBests, pearson, regainCurve, repBests, rolling7, runningBests, windowBest,
  sessionBests, weeklyCounts, workSets, worstConfidence, type WorkSet
} from "./analysis";

let n = 0;
function session(date: string, extra: Partial<Session> = {}): Session {
  n += 1;
  return {
    id: `s${n}`, user_id: "u", created_at: "", updated_at: "", date, title: null, status: "completed", started_at: null, ended_at: null,
    duration_min: null, program_id: null, program_week_no: null, program_day_id: null, energy: null, notes: null,
    date_confidence: "exact", date_basis: null, source: "reps-v2", legacy_ref: {}, ...extra
  };
}
function set(sessionId: string, exerciseId: string, loadKg: number | null, reps: number | null, extra: Partial<SetRow> = {}): SetRow {
  n += 1;
  return {
    id: `x${n}`, user_id: "u", created_at: "", updated_at: "", session_id: sessionId, exercise_id: exerciseId, exercise_position: 0, set_no: n,
    kind: "working", load: loadKg, unit: "kg", load_kg: loadKg, reps, duration_s: null, rpe: null, target_reps: null, target_load: null,
    completed: true, flags: [], note: null, exercise_as_logged: null, legacy_ref: {}, ...extra
  };
}

describe("existing helpers", () => {
  it("flags and e1RM behave as before", () => {
    expect(isFlagged({ flags: ["multi_load"] })).toBe(true);
    expect(isFlagged({ flags: ["doubtful_160x5"] })).toBe(true);
    expect(isFlagged({ flags: ["outlier_implausible_for_dumbbells_possibly_machine"] })).toBe(true);
    expect(isFlagged({ flags: ["unit_assumed_lb"] })).toBe(false);
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 2);
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 13)).toBeNull();
  });
});

describe("compareSets", () => {
  it("puts warm-ups first, lightest first when they share set_no 0, then the work by set number", () => {
    // Friday 16 Oct 2026: three set_no-0 warm-ups came back as 130, 80, 100.
    const top = set("s", "dl", 140, 12, { kind: "rep_out", set_no: 1 });
    const w130 = set("s", "dl", 130, 1, { kind: "warmup", set_no: 0 });
    const w80 = set("s", "dl", 80, 3, { kind: "warmup", set_no: 0 });
    const w100 = set("s", "dl", 100, 2, { kind: "warmup", set_no: 0 });
    const next = set("s", "bss", 14, 12, { exercise_position: 1, set_no: 1 });
    expect([next, top, w130, w80, w100].sort(compareSets).map((s) => s.load_kg)).toEqual([80, 100, 130, 140, 14]);
  });
});

describe("workSets", () => {
  it("joins live sessions and drops warm-ups, unfinished sets and discarded sessions", () => {
    const a = session("2026-01-05");
    const d = session("2026-01-06", { status: "discarded" });
    const rows = [
      set(a.id, "sq", 100, 5),
      set(a.id, "sq", 60, 8, { kind: "warmup" }),
      set(a.id, "sq", 100, 5, { completed: false }),
      set(a.id, "sq", 200, 5, { flags: ["load_outlier_check"] }),
      set(d.id, "sq", 120, 5)
    ];
    const w = workSets(rows, [a, d]);
    expect(w).toHaveLength(2);
    expect(w[0]!.e1rm).toBeCloseTo(116.67, 2);
    expect(w[1]!.flagged).toBe(true);
    expect(w[1]!.e1rm).toBeNull();
  });
});

describe("e1RM per session and monthly bests", () => {
  const s1 = session("2023-09-11", { date_confidence: "week known" });
  const s2 = session("2023-09-18", { date_confidence: "week known" });
  const s3 = session("2023-10-02", { date_confidence: "week known" });
  const w = workSets([
    set(s1.id, "sq", 120, 5), set(s1.id, "sq", 110, 8),
    set(s2.id, "sq", 125, 5), set(s2.id, "sq", 160, 5, { flags: ["interpreted"] }),
    set(s3.id, "sq", 130, 3)
  ], [s1, s2, s3]);

  it("takes the best non-flagged set per session", () => {
    const b = sessionBests(w);
    expect(b.map((x) => x.sessionId)).toEqual([s1.id, s2.id, s3.id]);
    expect(b[0]!.value).toBeCloseTo(140, 5); // 120 × 5 = 140; 110 × 8 = 139.3
    expect(b[1]!.value).toBeCloseTo(145.83, 2); // the flagged 160 × 5 is ignored
    expect(b[0]!.confidence).toBe("week known");
  });

  it("keeps the highest point per month", () => {
    const m = monthlyBests(sessionBests(w));
    expect(m.map((x) => x.period)).toEqual(["2023-09", "2023-10"]);
    expect(m[0]!.value).toBeCloseTo(145.83, 2);
    expect(m[1]!.value).toBe(143);
  });

  it("month index round-trips", () => {
    expect(monthFromIndex(monthIndex("2023-09-11"))).toBe("2023-09");
    expect(monthIndex("2024-01") - monthIndex("2023-12")).toBe(1);
  });
});

describe("pull-up metric", () => {
  it("uses the added load on sets of 5+ reps", () => {
    const s = session("2026-06-24");
    const w = workSets([set(s.id, "pu", 20, 8, { unit: "bodyweight" }), set(s.id, "pu", 25, 3, { unit: "bodyweight" })], [s]);
    expect(metricValue(w[0]!, "added5")).toBe(20);
    expect(metricValue(w[1]!, "added5")).toBeNull();
    expect(sessionBests(w, "added5")[0]!.value).toBe(20);
  });
  it("goal values match the plan page", () => {
    expect(goalValue(145, 5, "e1rm")).toBe(169.2);
    expect(goalValue(205, 5, "e1rm")).toBe(239.2);
    expect(goalValue(37.5, 8, "e1rm")).toBe(47.5);
    expect(goalValue(20, 8, "added5")).toBe(20);
  });
});

describe("rep bests", () => {
  const s1 = session("2024-03-11");
  const s2 = session("2024-03-13");
  const w = workSets([set(s1.id, "dl", 220, 2), set(s1.id, "dl", 200, 6), set(s2.id, "dl", 205, 5), set(s2.id, "dl", 230, 1, { flags: ["load_missing"] })], [s1, s2]);
  it("at least N reps", () => {
    const b = repBests(w, [1, 3, 5], "atLeast");
    expect(b.get(1)!.loadKg).toBe(220);
    expect(b.get(3)!.loadKg).toBe(205);
    expect(b.get(5)!.loadKg).toBe(205);
  });
  it("exactly N reps", () => {
    const b = repBests(w, [1, 2, 5, 6], "exact");
    expect(b.has(1)).toBe(false); // the only single is flagged
    expect(b.get(2)!.loadKg).toBe(220);
    expect(b.get(6)!.loadKg).toBe(200);
  });
});

describe("PR detection", () => {
  it("reports new best e1RM and rep PRs, never the first session or flagged sets", () => {
    const a = session("2026-01-05");
    const b = session("2026-01-12");
    const c = session("2026-01-19");
    const d = session("2026-01-26");
    const w = workSets([
      set(a.id, "sq", 100, 5),
      set(b.id, "sq", 110, 5), // e1RM PR
      set(c.id, "sq", 90, 12), // rep PR at 12 (nothing before at 12+) → no; at ≥5 not heavier → none
      set(c.id, "sq", 200, 5, { flags: ["load_outlier_check"] }),
      set(d.id, "sq", 112.5, 2), set(d.id, "sq", 91, 12) // e1RMs 120 and 127.4 < 128.3 → rep PR; 91 × 12 scores higher
    ], [a, b, c, d]);
    const ev = detectPRs(w);
    expect(ev.map((e) => [e.sessionId, e.kind])).toEqual([[d.id, "reps"], [b.id, "e1rm"]]);
    const e1 = ev.find((e) => e.kind === "e1rm")!;
    expect(e1.value).toBeCloseTo(128.33, 2);
    expect(e1.previous).toBeCloseTo(116.67, 2);
    const rep = ev.find((e) => e.kind === "reps")!;
    expect(rep.reps).toBe(12);
    expect(rep.value).toBe(91);
    expect(rep.previous).toBe(90);
  });
});

describe("fractional volume", () => {
  it("counts direct 1 and indirect 0.5, case-insensitively", () => {
    const ex = new Map([
      ["bench", { muscle_direct: "Chest", muscle_indirect: ["Triceps", "Front delts"] }],
      ["pushdown", { muscle_direct: "triceps", muscle_indirect: [] }],
      ["boxing", { muscle_direct: null, muscle_indirect: [] }]
    ]);
    const v = fractionalVolume([{ exerciseId: "bench" }, { exerciseId: "bench" }, { exerciseId: "pushdown" }, { exerciseId: "boxing" }, { exerciseId: "unknown" }], ex);
    expect(v.get("chest")!.sets).toBe(2);
    expect(v.get("triceps")!.sets).toBe(2);
    expect(v.get("triceps")!.label).toBe("Triceps");
    expect(v.get("front delts")!.sets).toBe(1);
    expect(v.size).toBe(3);
  });
});

describe("weekly frequency", () => {
  it("counts sessions per Monday-start week, oldest first", () => {
    const w = weeklyCounts(["2026-09-07", "2026-09-08", "2026-09-13", "2026-09-14", "2026-01-01", "2026-09-30"], "2026-09-16", 2);
    expect(w).toEqual([{ monday: "2026-09-07", count: 3 }, { monday: "2026-09-14", count: 1 }]);
  });
});

describe("correlation and fit", () => {
  it("pearson", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 10);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 10);
    expect(pearson([1, 2], [1, 2])).toBeNull();
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
  it("linear fit", () => {
    const f = linearFit([73, 78], [117, 137])!;
    expect(f.slope).toBeCloseTo(4, 10);
    expect(f.intercept).toBeCloseTo(-175, 10);
  });
});

describe("regain curve", () => {
  it("matches the plan's table (S0 117, P 166, k 0.17)", () => {
    expect(regainCurve(0)).toBeCloseTo(117, 10);
    expect(Math.round(regainCurve(2))).toBe(131);
    expect(Math.round(regainCurve(4))).toBe(141);
    expect(Math.round(regainCurve(6))).toBe(148);
    expect(Math.round(regainCurve(10))).toBe(157);
    expect(Math.round(regainCurve(14))).toBe(161);
    expect(Math.round(regainCurve(17))).toBe(163);
  });
});

describe("bodyweight", () => {
  it("rolling 7-day average and monthly means", () => {
    const pts = [{ date: "2026-09-01", value: 74 }, { date: "2026-09-05", value: 73 }, { date: "2026-09-08", value: 72 }];
    const r = rolling7(pts);
    expect(r[1]!.value).toBeCloseTo(73.5, 10);
    expect(r[2]!.value).toBeCloseTo(72.5, 10); // 1 Sep is 7 days before 8 Sep: out of the window
    expect(monthlyAverages(pts).get("2026-09")).toBeCloseTo(73, 10);
  });
});

describe("blocks and labels", () => {
  it("compares first two vs last two sessions per lift", () => {
    const src = "sheet:2023 Reddit PPL #2 (11 Sept)";
    const ss = ["2023-09-11", "2023-09-18", "2023-09-25", "2023-10-02", "2023-10-09"].map((d, i) => session(d, { source: src, date_confidence: i === 4 ? "estimated" : "week known" }));
    const loads = [120, 125, 130, 135, 140];
    const rows = ss.map((s, i) => set(s.id, "sq", loads[i]!, 5));
    rows.push(set(ss[0]!.id, "dl", 180, 5));
    const out = blockComparison(workSets(rows, ss), ss, ["sq", "dl", "row"]);
    expect(out).toHaveLength(1);
    const b = out[0]!;
    expect(b.label).toBe("2023 Reddit PPL #2 (11 Sept)");
    expect(b.sessions).toBe(5);
    expect(b.confidence).toBe("estimated");
    expect(b.first).toBe("2023-09-11");
    expect(b.lifts.get("sq")!.start).toBeCloseTo(125 * (1 + 5 / 30), 6);
    expect(b.lifts.get("sq")!.end).toBeCloseTo(140 * (1 + 5 / 30), 6);
    expect(b.lifts.get("dl")).toBeNull();
    expect(b.lifts.get("row")).toBeNull();
  });
  it("labels", () => {
    expect(blockLabel("reps-v2")).toBe("2026 app log");
    expect(confidenceLabel("exact")).toBe("");
    expect(confidenceLabel("estimated")).toBe("date estimated");
    expect(worstConfidence(["exact", "week known"])).toBe("week known");
  });
});


describe("windows and staircases", () => {
  const pts = [
    { date: "2026-01-01", value: 100 },
    { date: "2026-02-01", value: 110 },
    { date: "2026-02-20", value: 105 },
    { date: "2026-03-01", value: 110 },
    { date: "2026-03-10", value: 120 }
  ];
  it("windowBest takes the best inside the window, edges included", () => {
    expect(windowBest(pts, "2026-03-10", 1)!.value).toBe(120);
    expect(windowBest(pts, "2026-03-09", 9)!.value).toBe(110);
    expect(windowBest(pts, "2026-02-25", 25)!.date).toBe("2026-02-01");
    expect(windowBest(pts, "2025-12-31", 30)).toBeNull();
  });
  it("runningBests keeps only new highs, ties excluded", () => {
    expect(runningBests([...pts].reverse()).map((p) => p.value)).toEqual([100, 110, 120]);
    expect(runningBests([])).toEqual([]);
  });
});
