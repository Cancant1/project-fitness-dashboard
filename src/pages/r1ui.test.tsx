// Light render tests for the R1 UI (docs/R1_BUILD.md Part U): effort badges, pairs, pain feedback, capped
// rep-outs and timed holds in the logger; the minimum-session start; the Thursday and Wednesday conditioning inputs;
// the check-in habit meter. A real LocalStore on fake IndexedDB; no network.
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { StoreContext } from "../data/context";
import { LocalStore } from "../data/local";
import type { Sync } from "../data/sync";
import type { Program } from "../data/types";
import { savePainCheck } from "../coach";
import { prescribeDay } from "../plan/engine";
import { PLAN, PLAN_KEY, ensurePlanExercises } from "../plan/bridge";
import { planRef, startWorkout } from "../plan/workout";
import type { PlanState } from "../plan/types";
import { CheckinPage } from "./CheckinPage";
import { TodayPage } from "./TodayPage";
import { TrainPage } from "./TrainPage";
import { WorkoutPage } from "./WorkoutPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STATE: PlanState = { trainingMaxes: { squat: 140, deadlift: 200 }, currentLoads: {} };
let local: LocalStore;
let program: Program;
let root: Root | null = null;
let host: HTMLElement;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 19, 9, 0)); // Monday of week 1
  local = new LocalStore(`r1ui-${crypto.randomUUID()}`);
  await local.open();
  await ensurePlanExercises(local);
  program = (await local.save("programs", { name: "Strength Return Plan", start_date: PLAN.weeks[0]!.startDate, weeks: PLAN.weeks.length, status: "active", rules: { key: PLAN_KEY }, goals: [], notes: null }))[0] as Program;
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

async function render(ui: ReactNode, path = "/") {
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StoreContext.Provider value={{ local, sync: {} as Sync }}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/workout/:sessionId" element={<WorkoutPage />} />
            <Route path="*" element={ui} />
          </Routes>
        </MemoryRouter>
      </StoreContext.Provider>
    );
  });
}

const click = async (el: Element | null | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => { (el as HTMLElement).click(); });
};
const button = (text: string | RegExp, scope: ParentNode = document) =>
  [...scope.querySelectorAll("button")].find((b) => (typeof text === "string" ? b.textContent?.trim() === text : text.test(b.textContent ?? "")));
async function until(check: () => boolean) {
  for (let i = 0; i < 200 && !check(); i++) await act(() => new Promise((r) => setTimeout(r, 10)));
}
/** Taps "Next: …" until the logger shows `name`. */
async function goTo(name: string) {
  const has = () => (host.querySelector("h1")?.textContent ?? "").toLowerCase().includes(name.toLowerCase());
  for (let i = 0; i < 20 && !has(); i++) await click(button(/^Next:/, host));
  expect(has()).toBe(true);
}

async function startDay(weekNo: number, dayKey: Parameters<typeof prescribeDay>[2], state: PlanState, date: string) {
  const ids = await ensurePlanExercises(local);
  const day = prescribeDay(PLAN, weekNo, dayKey, state, undefined);
  return startWorkout(local, program, day, ids, date);
}

describe("Logger (Part U)", () => {
  it("shows how hard each exercise goes, tints set badges, and caps the rep-out", async () => {
    const id = await startDay(1, "lower_a", { ...STATE, restart: { capRepOutsFrom: "2026-10-19" } }, "2026-10-19");
    await render(null, `/workout/${id}`);
    await goTo("Squat");
    const effort = host.querySelector(".wk-effort");
    expect(effort?.querySelector(".wk-eff")?.textContent).toBe("Controlled");
    expect(effort?.textContent).toMatch(/Stop at \d+ reps, even if more are there/);
    expect(host.querySelector('.wk-setno[data-tone="plain"]')).toBeTruthy();
    const card = host.querySelector(".repout-card")!;
    expect(card.querySelector('.wk-eff[data-tone="warm"]')?.textContent).toMatch(/^Max/);
    expect(card.textContent).toMatch(/Stop at \d+/);
    expect(card.textContent).toMatch(/Stop at \d+ even if more are there/);
  });

  it("isolation to failure reads as Failure; old rows without an effort are inferred from the set kind", async () => {
    const id = await startDay(1, "lower_a", STATE, "2026-10-19");
    for (const s of local.all("sets").filter((x) => x.session_id === id)) {
      const ref = planRef(s)!;
      const { effort: _e, ...rest } = ref;
      await local.save("sets", { id: s.id, legacy_ref: { plan: rest } });
    }
    await render(null, `/workout/${id}`);
    await goTo("lateral");
    expect(host.querySelector(".wk-effort .wk-eff")?.textContent).toBe("Failure");
    expect(host.querySelector('.wk-setno[data-tone="accent"]')?.textContent).toBe("F");
  });

  it("pairs show A/B with the short rest, and switch on tap", async () => {
    const id = await startDay(1, "upper_a", STATE, "2026-10-20");
    await render(null, `/workout/${id}`);
    await goTo("flye");
    const pair = host.querySelector(".wk-pair")!;
    expect(pair).toBeTruthy();
    expect([...pair.querySelectorAll(".wk-pair-btn b")].map((b) => b.textContent)).toEqual(["A", "B"]);
    expect(pair.textContent).toMatch(/50 s/);
    expect(pair.textContent).toMatch(/75 s after/);
    await click(pair.querySelectorAll(".wk-pair-btn")[1]);
    expect(host.querySelector("h1")?.textContent).toMatch(/Bayesian/i);
  });

  it("pain ≥ 6 shows the stop banner; 4–5 the hold note; the pain sheet saves a 0–10 score", async () => {
    const id = await startDay(1, "lower_a", STATE, "2026-10-19");
    await render(null, `/workout/${id}`);
    await goTo("Squat");
    const squatId = local.all("sets").find((s) => s.session_id === id && planRef(s)?.exerciseKey === "squat")!.exercise_id;

    await act(async () => { await savePainCheck(local, { date: "2026-10-19", site: "right_shoulder", exerciseId: squatId, sessionId: id, score: 4 }); });
    await until(() => !!host.querySelector(".wk-hold"));
    expect(host.querySelector(".wk-hold")?.textContent).toContain("Hold the load next time");

    await click(button("Pain check"));
    const sheet = document.querySelector('[role="dialog"]')!;
    const range = sheet.querySelector<HTMLInputElement>('input[type="range"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(range, "7");
      range.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(sheet.querySelector(".wk-verdict")?.textContent).toBe("Stop this exercise today");
    await click(button("Save", sheet));
    await until(() => !!host.querySelector(".wk-stop"));
    expect(host.querySelector(".wk-stop")?.textContent).toContain("Stop this exercise today");
    expect(local.all("pain_checks").find((p) => p.pain_score === 7)).toMatchObject({ site: "right_elbow", during_set: "ache", session_id: id });
    expect(button("Next exercise", document)).toBeTruthy();
  });

  it("isometric holds show seconds with a countdown button; the deadlift back-off sets have their own group", async () => {
    const iso: PlanState = { ...STATE, wristLadder: { isometricFrom: "2026-10-19", isometricUntil: "2026-10-23" } };
    const mon = await startDay(1, "lower_a", iso, "2026-10-19");
    await render(null, `/workout/${mon}`);
    await goTo("wrist");
    expect(host.querySelectorAll(".wk-timed").length).toBeGreaterThan(0);
    expect(host.querySelector(".wk-timer-btn")?.textContent).toMatch(/\d+ s/);
    act(() => root?.unmount());
    root = null;

    const fri = await startDay(1, "lower_b", { ...STATE, addMainLiftSet: { deadlift: true, squat: true } }, "2026-10-23");
    await render(null, `/workout/${fri}`);
    await goTo("Deadlift");
    expect(host.querySelector('[aria-label="Back-off sets"]')?.textContent).toContain("Back-off");
    await click(button(/^Next:/, host));
    expect(host.textContent).toContain("Light squat");
  });
});

describe("Start options (E2)", () => {
  it("Train's hero offers the minimum session; it starts a session flagged minimum", async () => {
    vi.setSystemTime(new Date(2026, 9, 12, 9, 0)); // Monday of week 0 (calibration: no TM needed)
    await render(<TrainPage />);
    const min = button("Minimum session · 30 min", host);
    expect(button(/Start workout/, host)).toBeTruthy();
    await click(min);
    await until(() => local.all("sessions").some((s) => s.status === "in_progress"));
    const s = local.all("sessions").find((x) => x.status === "in_progress")!;
    expect(s.title).toContain("(minimum)");
    expect((s.legacy_ref as { plan?: { minimum?: boolean } }).plan?.minimum).toBe(true);
  });
});

describe("Conditioning card", () => {
  it("Thursday: Gassed 1–5 and the fade round are saved on the boxing row", async () => {
    vi.setSystemTime(new Date(2026, 9, 22, 9, 0));
    await render(<TodayPage />);
    const card = host.querySelector(".cd")!;
    await click([...card.querySelectorAll(".cd-scale button")].find((b) => b.textContent === "4"));
    const fade = card.querySelector<HTMLInputElement>("#c-fade")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(fade, "3");
      fade.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button("Save boxing", card));
    await until(() => local.all("conditioning").some((c) => c.kind === "boxing"));
    expect(local.all("conditioning").find((c) => c.kind === "boxing")).toMatchObject({ rating: 4, rounds: 3, done: true });
  });

  it("Wednesday: the wrist ladder at home is a done check stored as a conditioning row", async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 9, 0));
    await render(<TodayPage />);
    const home = host.querySelector(".cd-home")!;
    expect(home.textContent).toContain("Wrist ladder at home");
    expect(home.textContent).toContain("3 × 15");
    await click(home.querySelector("button.check"));
    await until(() => local.all("conditioning").some((c) => c.note === "wrist_ladder"));
    expect(local.all("conditioning").find((c) => c.note === "wrist_ladder")).toMatchObject({ kind: "other", done: true, date: "2026-10-21" });
  });

  it("Sunday: the rounds text and finish by 14:00", async () => {
    vi.setSystemTime(new Date(2026, 10, 15, 9, 0)); // Sunday of week 4
    await render(<TodayPage />);
    const card = host.querySelector(".cd")!;
    expect(card.textContent).toContain("burst rounds");
    expect(card.textContent).toContain("Finish by 14:00");
  });
});

describe("Check-in (Part U)", () => {
  it("shows the habit meter", async () => {
    await render(<CheckinPage />);
    expect(host.querySelector(".ci-habit")?.textContent).toContain("Habit");
    expect(host.querySelectorAll(".ci-meter i")).toHaveLength(6);
  });
});
