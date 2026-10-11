// @vitest-environment node
// Tests for the health-ingest Edge Function's pure module (supabase/functions/health-ingest/parse.ts)
// and the app's token helper (src/lib/ingestToken.ts).
import {
  aggregateSleep, buildIngest, localDate, normaliseStage, parseNumber, parseSleepText, parseWhen, sha256Hex, type SleepSample
} from "../../supabase/functions/health-ingest/parse";
import { hashIngestToken, ingestEndpoint, newIngestToken, toBase64Url } from "./ingestToken";

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());
const NNBSP = String.fromCharCode(0x202f); // iOS's narrow no-break space before AM/PM

describe("normaliseStage", () => {
  it("reads Apple's English names", () => {
    expect(["Asleep", "In Bed", "Awake", "Core", "Deep", "REM"].map(normaliseStage))
      .toEqual(["asleep", "in_bed", "awake", "core", "deep", "rem"]);
  });
  it("reads Dutch names", () => {
    expect(["Slaap", "In bed", "Wakker", "Kern", "Diep", "REM", "Slapend"].map(normaliseStage))
      .toEqual(["asleep", "in_bed", "awake", "core", "deep", "rem", "asleep"]);
  });
  it("reads HealthKit raw names, numbers and odd wordings", () => {
    expect(normaliseStage("HKCategoryValueSleepAnalysisAsleepCore")).toBe("core");
    expect(normaliseStage("asleepREM")).toBe("rem");
    expect(normaliseStage(4)).toBe("deep");
    expect(normaliseStage("Asleep (Unspecified)")).toBe("asleep");
    expect(normaliseStage("  deep sleep ")).toBe("deep");
    expect(normaliseStage("Diepe slaap")).toBe("deep");
    expect(normaliseStage("Steps")).toBeNull();
    expect(normaliseStage("")).toBeNull();
  });
});

describe("parseWhen", () => {
  it("reads ISO 8601 with an offset", () => {
    expect(iso(parseWhen("2026-10-11T07:12:00+02:00"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("2026-10-11T05:12:00Z"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("2026-10-11T07:12:00+0200"))).toBe("2026-10-11T05:12:00.000Z");
  });
  it("reads times without an offset as Amsterdam time (summer and winter)", () => {
    expect(iso(parseWhen("2026-10-11 07:12"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("2026-12-01T07:00:00"))).toBe("2026-12-01T06:00:00.000Z");
    // Clocks go back on 25 Oct 2026 at 03:00 → 02:00.
    expect(iso(parseWhen("2026-10-25 07:00"))).toBe("2026-10-25T06:00:00.000Z");
    expect(iso(parseWhen("2026-10-24 23:30"))).toBe("2026-10-24T21:30:00.000Z");
  });
  it("reads Shortcuts' default English and Dutch formats", () => {
    expect(iso(parseWhen("11 Oct 2026 at 07:12"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("11 okt. 2026 om 07:12"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("11 oktober 2026 om 07:12"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen(`Oct 11, 2026 at 7:12${NNBSP}AM`))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("Oct 10, 2026 at 11:40 PM"))).toBe("2026-10-10T21:40:00.000Z");
    expect(iso(parseWhen("May 3, 2026 at 6:30 AM"))).toBe("2026-05-03T04:30:00.000Z");
    expect(iso(parseWhen("3 maart 2026 06:30"))).toBe("2026-03-03T05:30:00.000Z");
    expect(iso(parseWhen("3 mrt 2026 06:30"))).toBe("2026-03-03T05:30:00.000Z");
    expect(iso(parseWhen("12 Jan 2027 at 12:05 AM"))).toBe("2027-01-11T23:05:00.000Z");
  });
  it("reads numeric dates day-first, US order only with AM/PM", () => {
    expect(iso(parseWhen("11-10-2026 07:12"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("11/10/2026 07.12"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("10/11/2026 7:12 AM"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("25/10/2026 7:12 AM"))).toBe("2026-10-25T06:12:00.000Z");
  });
  it("reads RFC 2822, weekdays and epochs", () => {
    expect(iso(parseWhen("Sun, 11 Oct 2026 07:12:00 +0200"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("Sun, 11 Oct 2026 05:12:00 GMT"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("zo 11 okt 2026 07:12"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("zondag 11 oktober 2026 om 07:12"))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen(1791695520))).toBe("2026-10-11T05:12:00.000Z");
    expect(iso(parseWhen("1791695520000"))).toBe("2026-10-11T05:12:00.000Z");
  });
  it("returns null for what it can't read", () => {
    expect(parseWhen("yesterday")).toBeNull();
    expect(parseWhen("11 Foo 2026 07:12")).toBeNull();
    expect(parseWhen("2026-13-01 07:00")).toBeNull();
    expect(parseWhen("13:00 PM 1-1-2026")).toBeNull();
    expect(parseWhen("")).toBeNull();
    expect(parseWhen(null)).toBeNull();
  });
});

describe("parseSleepText", () => {
  it("reads stage;start;end lines and skips bad ones", () => {
    const text = [
      "Core;2026-10-11T00:10:00+02:00;2026-10-11T01:00:00+02:00",
      "",
      "  Deep ; 11 okt. 2026 om 01:00 ; 11 okt. 2026 om 01:45  ",
      "REM\t2026-10-11 01:45\t2026-10-11 02:15",
      "Snoring;2026-10-11 02:15;2026-10-11 02:30",
      "Core;2026-10-11 03:00",
      "Core;2026-10-11 04:00;2026-10-11 03:00"
    ].join("\r\n");
    const { samples, skipped } = parseSleepText(text);
    expect(samples.map((s) => s.stage)).toEqual(["core", "deep", "rem"]);
    expect(skipped).toHaveLength(3);
    expect(skipped[0]).toMatch(/unknown stage/);
    expect(skipped[1]).toMatch(/expected stage;start;end/);
    expect(skipped[2]).toMatch(/not after start/);
  });
  it("accepts a list of lines (Repeat results without Combine Text)", () => {
    const { samples } = parseSleepText(["Asleep;2026-10-10 23:30;2026-10-11 06:45"]);
    expect(samples).toHaveLength(1);
  });
});

describe("aggregateSleep", () => {
  const at = (t: string) => parseWhen(`2026-10-${t}`)!;
  const s = (stage: SleepSample["stage"], from: string, to: string): SleepSample => ({ stage, start: at(from), end: at(to) });

  it("sums stages; total asleep = core + deep + rem", () => {
    const sum = aggregateSleep([
      s("in_bed", "10 23:00", "11 07:00"),
      s("core", "10 23:20", "11 01:00"),
      s("deep", "11 01:00", "11 02:00"),
      s("awake", "11 02:00", "11 02:10"),
      s("rem", "11 02:10", "11 03:00"),
      s("core", "11 03:00", "11 06:40")
    ])!;
    expect(sum.core_min).toBe(100 + 220);
    expect(sum.deep_min).toBe(60);
    expect(sum.rem_min).toBe(50);
    expect(sum.awake_min).toBe(10);
    expect(sum.total_min).toBe(430);
    expect(sum.in_bed_min).toBe(480);
    expect(sum.date).toBe("2026-10-11");
  });
  it("counts overlapping samples of one stage once (Watch + another app)", () => {
    const sum = aggregateSleep([s("core", "11 00:00", "11 02:00"), s("core", "11 01:00", "11 03:00"), s("deep", "11 03:00", "11 04:00")])!;
    expect(sum.core_min).toBe(180);
    expect(sum.total_min).toBe(240);
  });
  it("uses Asleep when there are no stages (older watches)", () => {
    const sum = aggregateSleep([s("in_bed", "10 23:00", "11 07:00"), s("asleep", "10 23:30", "11 06:30")])!;
    expect(sum.total_min).toBe(420);
    expect(sum.core_min).toBeNull();
    expect(sum.deep_min).toBeNull();
    expect(sum.awake_min).toBeNull();
  });
  it("leaves the total empty when only In Bed was sent", () => {
    const sum = aggregateSleep([s("in_bed", "10 23:00", "11 07:00")])!;
    expect(sum.total_min).toBeNull();
    expect(sum.in_bed_min).toBe(480);
  });
  it("keeps the last night and leaves an earlier nap out", () => {
    const sum = aggregateSleep([s("core", "10 14:00", "10 14:40"), s("core", "10 23:30", "11 06:30")])!;
    expect(sum.total_min).toBe(420);
    expect(sum.used).toBe(1);
    expect(sum.left_out).toBe(1);
  });
  it("dates the night by the local morning it ended", () => {
    // Ends 00:30 Amsterdam time = 22:30 UTC the day before.
    const sum = aggregateSleep([{ stage: "asleep", start: Date.parse("2026-10-10T20:00:00Z"), end: Date.parse("2026-10-10T22:30:00Z") }])!;
    expect(sum.date).toBe("2026-10-11");
  });
  it("returns null without samples", () => {
    expect(aggregateSleep([])).toBeNull();
  });
});

describe("parseNumber", () => {
  it("reads numbers, strings with units and Dutch commas", () => {
    expect(parseNumber(52)).toBe(52);
    expect(parseNumber("52")).toBe(52);
    expect(parseNumber("48,5 ms")).toBe(48.5);
    expect(parseNumber("52 count/min")).toBe(52);
    expect(parseNumber(["61"])).toBe(61);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });
});

describe("buildIngest", () => {
  const NOW = Date.parse("2026-10-11T05:20:00Z");

  it("turns a Shortcuts body (Dutch names, Dutch dates) into a health_daily patch", () => {
    const body = {
      sleep_text: [
        "In bed;10 okt. 2026 om 23:05;11 okt. 2026 om 07:00",
        "Kern;10 okt. 2026 om 23:20;11 okt. 2026 om 01:00",
        "Diep;11 okt. 2026 om 01:00;11 okt. 2026 om 02:00",
        "Wakker;11 okt. 2026 om 02:00;11 okt. 2026 om 02:05",
        "REM;11 okt. 2026 om 02:05;11 okt. 2026 om 03:00",
        "Kern;11 okt. 2026 om 03:00;11 okt. 2026 om 06:50"
      ].join("\n"),
      resting_hr: "52",
      hrv_sdnn_ms: "48,5"
    };
    const r = buildIngest(body, NOW);
    expect(r.date).toBe("2026-10-11");
    expect(r.patch).toEqual({
      sleep_total_min: 100 + 60 + 55 + 230, sleep_deep_min: 60, sleep_rem_min: 55, sleep_core_min: 330, sleep_awake_min: 5,
      resting_hr: 52, hrv_sdnn_ms: 48.5
    });
    expect(r.warnings).toEqual([]);
  });

  it("accepts the structured sleep list and odd key spelling", () => {
    const r = buildIngest({
      "Resting HR ": 55.4,
      Sleep: [{ stage: "Asleep", start: "2026-10-10T23:00:00+02:00", end: "2026-10-11T06:30:00+02:00" }]
    }, NOW);
    expect(r.patch).toMatchObject({ sleep_total_min: 450, resting_hr: 55 });
    expect(r.patch.hrv_sdnn_ms).toBeUndefined();
  });

  it("dates by the sleep end over the given date", () => {
    const r = buildIngest({ date: "2026-10-01", sleep_text: "Core;2026-10-11 00:00;2026-10-11 06:00" }, NOW);
    expect(r.date).toBe("2026-10-11");
  });

  it("uses the given date, else today in Amsterdam, without sleep", () => {
    expect(buildIngest({ date: "2026-10-09", resting_hr: 50 }, NOW).date).toBe("2026-10-09");
    // 23:30 UTC is already the next day in Amsterdam.
    const late = buildIngest({ resting_hr: 50 }, Date.parse("2026-10-10T23:30:00Z"));
    expect(late.date).toBe("2026-10-11");
    expect(late.patch).toEqual({ resting_hr: 50 });
  });

  it("only sets what was sent; ignores out-of-range numbers with a warning", () => {
    const r = buildIngest({ resting_hr: 5, hrv_sdnn_ms: "61 ms" }, NOW);
    expect(r.patch).toEqual({ hrv_sdnn_ms: 61 });
    expect(r.warnings[0]).toMatch(/resting_hr/);
  });

  it("reports skipped sleep lines and a plain-text body", () => {
    const r = buildIngest("Core;2026-10-11 00:00;2026-10-11 06:00\nnonsense", NOW);
    expect(r.patch.sleep_total_min).toBe(360);
    expect(r.warnings.some((w) => /sleep_text/.test(w))).toBe(true);
  });

  it("returns an empty patch for an empty body", () => {
    expect(buildIngest({}, NOW).patch).toEqual({});
    expect(buildIngest(null, NOW).patch).toEqual({});
  });
});

describe("localDate", () => {
  it("formats the Amsterdam date", () => {
    expect(localDate(Date.parse("2026-10-10T22:30:00Z"))).toBe("2026-10-11");
    expect(localDate(Date.parse("2026-12-31T22:59:00Z"))).toBe("2026-12-31");
  });
});

describe("ingest tokens", () => {
  it("makes 43-character base64url tokens", () => {
    const t = newIngestToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newIngestToken()).not.toBe(t);
    expect(toBase64Url(new Uint8Array([251, 255, 191]))).toBe("-_-_");
  });
  it("hashes the same way in the app and the Edge Function", async () => {
    expect(await hashIngestToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const t = newIngestToken();
    expect(await hashIngestToken(t)).toBe(await sha256Hex(t));
  });
  it("builds the endpoint URL", () => {
    expect(ingestEndpoint("https://x.supabase.co/")).toBe("https://x.supabase.co/functions/v1/health-ingest");
    expect(ingestEndpoint(undefined)).toBeNull();
  });
});
