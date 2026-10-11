import { describe, expect, it } from "vitest";
import { migrateLegacySources } from "../data/migrate";
import { csvCell, measurementsCsv, nutritionCsv, trainingCsv } from "./export";

describe("portable CSV exports", () => {
  it("quotes commas, quotes, and newlines safely", () => {
    expect(csvCell('One, "two"\nthree')).toBe('"One, ""two""\nthree"');
  });

  it("exports canonical identifiers and preserved records", async () => {
    const snapshot = await migrateLegacySources({ clientId: "test" });
    expect(trainingCsv(snapshot)).toContain("session_id,date,title,status");
    expect(nutritionCsv(snapshot)).toContain("entry_id,date,time,meal");
    expect(measurementsCsv(snapshot)).toContain("measurement_id,date,type,value");
    expect(trainingCsv(snapshot).endsWith("\r\n")).toBe(true);
  });
});
