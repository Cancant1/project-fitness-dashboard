// Light render tests for the coach UI: the Check-in page, its area sheet, the Apply confirm step, and the
// check-in row on Today. A real LocalStore on fake IndexedDB; no network (sync is never run).
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreContext } from "../../data/context";
import { LocalStore } from "../../data/local";
import type { Sync } from "../../data/sync";
import type { TableName, Tables } from "../../data/types";
import { World, dayIn, monday } from "../../coach/testkit";
import { addDays, todayIso } from "../../lib/format";
import { adjustmentsOf } from "../../plan/adjustments";
import { PLAN, PLAN_KEY, activeProgram, ensurePlanExercises } from "../../plan/bridge";
import { CheckinPage } from "../CheckinPage";
import { TodayPage } from "../TodayPage";
import { ApplyButton } from "./coachUi";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VERDICTS = /On track|Watch|Adjust|Too early/;
let local: LocalStore;
let root: Root | null = null;
let host: HTMLElement;

beforeEach(async () => {
  local = new LocalStore(`render-${crypto.randomUUID()}`);
  await local.open();
  await ensurePlanExercises(local);
  await local.save("programs", { name: "Strength Return Plan", start_date: PLAN.weeks[0]!.startDate, weeks: PLAN.weeks.length, status: "active", rules: { key: PLAN_KEY }, goals: [], notes: null });
  const today = todayIso();
  await local.save("body_measurements", Array.from({ length: 21 }, (_, i) => ({
    date: addDays(today, -i), kind: "weight" as const, value: 74 + i * 0.02, unit: "kg" as const, source: "app", note: null
  })));
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

async function render(ui: ReactNode) {
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StoreContext.Provider value={{ local, sync: {} as Sync }}>
        <MemoryRouter>{ui}</MemoryRouter>
      </StoreContext.Provider>
    );
  });
}

const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); });
};

/** Waits (up to 2 s) for the async IndexedDB writes behind a tap. */
async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await act(() => new Promise((r) => setTimeout(r, 10)));
}

describe("Check-in page", () => {
  it("shows the week, a verdict, this week's actions and all eight areas", async () => {
    await render(<CheckinPage />);
    expect(host.querySelector(".ci-verdict")?.textContent).toMatch(VERDICTS);
    expect(host.querySelector(".ci-headline")?.textContent).toMatch(/\./);
    expect(host.querySelectorAll(".ci-tile")).toHaveLength(8);
    for (const a of ["Consistency", "Strength", "Muscle", "Body", "Fuel", "Joints", "Recovery", "Conditioning"]) {
      expect(host.textContent).toContain(a);
    }
    expect(host.textContent).toContain("This week");
    expect(host.textContent).toContain("Bodyweight");
    expect(host.textContent).toContain("Training max");
  });

  it("a tile opens its sheet; Joints adds the red flags", async () => {
    await render(<CheckinPage />);
    const joints = [...host.querySelectorAll(".ci-tile")].find((t) => t.textContent?.includes("Joints"));
    await click(joints);
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("Joints");
    expect(dialog?.textContent).toContain("When to see someone");
    expect(dialog?.querySelector(".ci-why summary")?.textContent).toContain("Why");
    expect(dialog?.textContent).toContain("J-REDFLAGS");
  });
});

describe("Check-in actions", () => {
  afterEach(() => vi.useRealTimers());

  it("sore elbow → Apply the swap → Applied with Undo → Undo brings the suggestion back", async () => {
    // Sunday of week 1; only Date is faked (IndexedDB still needs real timers).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 25, 9, 0));
    const w = new World();
    w.pain(dayIn(1, "upper_a"), "right_elbow", "incline_db_press", { next_morning: "sore" });
    w.weighDaily(monday(1), 7, 74.3, 0.15);
    local = new LocalStore(`render-${crypto.randomUUID()}`);
    await local.open();
    for (const [table, rows] of Object.entries(w.tables) as [TableName, Tables[TableName][]][]) if (rows.length) await local.save(table, rows);

    await render(<CheckinPage />);
    const acts = () => host.querySelector(".ci-acts")!;
    expect(acts().textContent).toContain("Swap to neutral-grip DB bench press");
    expect(host.querySelector(".ci-verdict")?.textContent).toBe("Adjust");
    const joints = [...host.querySelectorAll(".ci-tile")].find((t) => t.textContent?.includes("Joints"));
    expect(joints?.getAttribute("data-status")).toBe("act");

    await click([...acts().querySelectorAll("button")].find((b) => b.textContent === "Apply"));
    expect(acts().textContent).toContain("Swap to neutral-grip DB bench press until 3 Nov");
    await click([...acts().querySelectorAll("button")].find((b) => b.textContent === "Confirm"));
    await until(() => !!acts().textContent?.includes("Applied 25 Oct"));
    expect(acts().textContent).toContain("Applied 25 Oct");
    expect(adjustmentsOf(activeProgram(local.all("programs"))!.rules)).toHaveLength(1);

    await click([...acts().querySelectorAll("button")].find((b) => b.textContent === "Undo"));
    await until(() => !acts().textContent?.includes("Applied"));
    expect(adjustmentsOf(activeProgram(local.all("programs"))!.rules)).toHaveLength(0);
    expect([...acts().querySelectorAll("button")].some((b) => b.textContent === "Apply")).toBe(true);
  });
});

describe("Apply", () => {
  it("needs a second tap, then records the adjustment", async () => {
    const done = vi.fn();
    await render(<ApplyButton action={{ kind: "deload_now", weekNo: 3 }} signalId="strength.misses" today="2026-11-08" onDone={done} />);
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Apply"));
    expect(host.textContent).toContain("Week 3 becomes a deload");
    expect(adjustmentsOf(activeProgram(local.all("programs"))!.rules)).toHaveLength(0);

    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Confirm"));
    await until(() => done.mock.calls.length > 0);
    const list = adjustmentsOf(activeProgram(local.all("programs"))!.rules);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "deload_now", signalId: "strength.misses", data: { kind: "deload_now", weekNo: 3 } });
    expect(done).toHaveBeenCalledWith("Applied · Plan updated.");
  });

  it("Cancel leaves everything as it was", async () => {
    await render(<ApplyButton action={{ kind: "repeat_week", missedWeekNo: 2 }} signalId="consistency.missed_week" today="2026-11-08" />);
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Apply"));
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Cancel"));
    expect(host.textContent).toBe("Apply");
    expect(adjustmentsOf(activeProgram(local.all("programs"))!.rules)).toHaveLength(0);
  });
});

describe("Today", () => {
  it("shows the check-in row with this week's verdict and a sleep field on the weigh-in", async () => {
    await render(<TodayPage />);
    const row = host.querySelector('a.t-checkin[href="/checkin"]');
    expect(row?.textContent).toContain("Check-in");
    expect(row?.textContent).toMatch(VERDICTS);
    expect(host.querySelector('input[placeholder="Slept"]')).toBeTruthy();
  });

  it("asks about yesterday's ache in the morning (0–10); 6 writes morning_score, next_morning sore, and the cue goes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 21, 8, 0)); // Wednesday of week 1, 08:00
    try {
      const w = new World();
      const pain = w.pain(dayIn(1, "upper_a"), "right_elbow", "incline_db_press", { during_set: "ache" });
      local = new LocalStore(`render-${crypto.randomUUID()}`);
      await local.open();
      for (const [table, rows] of Object.entries(w.tables) as [TableName, Tables[TableName][]][]) if (rows.length) await local.save(table, rows);

      await render(<TodayPage />);
      const coach = () => host.querySelector(".t-coach")!;
      expect(coach().textContent).toContain("Right elbow after incline DB press yesterday: how is it this morning (0–10)?");
      await click([...coach().querySelectorAll("button")].find((b) => b.textContent === "6"));
      await until(() => local.get("pain_checks", pain.id)?.next_morning === "sore");
      expect(local.get("pain_checks", pain.id)).toMatchObject({ next_morning: "sore", morning_score: 6 });
      await until(() => !coach().textContent?.includes("how is it this morning"));
      expect(coach().textContent).not.toContain("how is it this morning");
    } finally {
      vi.useRealTimers();
    }
  });
});
