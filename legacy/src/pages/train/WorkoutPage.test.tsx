import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../../app/App";
import { AppStoreProvider } from "../../app/AppStore";
import { openRepsDatabase, saveSnapshot } from "../../data/db";
import { mergeSnapshots } from "../../data/github";
import { migrateLegacySources } from "../../data/migrate";
import { createSessionFromPlan } from "../../domain/factories";
import type { RepsSnapshot } from "../../domain/types";

let snapshot: RepsSnapshot;
let sessionId: string;
beforeEach(async () => {
  localStorage.clear(); snapshot = await migrateLegacySources({ clientId: "workout-test" });
  const stamp = new Date().toISOString();
  snapshot.exercises = ["Bench", "Row", "Squat"].map((name) => ({ id: name, name, aliases: [], movement: "Other", muscles: [], equipment: [], defaultUnit: "kg", compound: true, cues: [], substitutions: [], archived: false, source: "manual", createdAt: stamp, updatedAt: stamp }));
  const session = createSessionFromPlan(snapshot.profiles[0].id, undefined, "Test workout");
  snapshot.sessions = [session]; sessionId = session.id;
  await saveSnapshot(snapshot, "Test seed");
});
afterEach(cleanup);
async function openWorkout() {
  render(<MemoryRouter initialEntries={[`/train/live/${sessionId}`]}><AppStoreProvider><App /></AppStoreProvider></MemoryRouter>);
  await screen.findByRole("heading", { name: "Test workout" });
  return userEvent.setup();
}
async function add(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getAllByRole("button", { name: "Add exercise", exact: true })[0]);
  await user.click(within(screen.getByRole("dialog", { name: "Add an exercise" })).getByRole("button", { name: new RegExp(name) }));
}
async function storedSession() { return (await (await openRepsDatabase()).get("snapshots", "current"))!.sessions.find((item) => item.id === sessionId)!; }

describe("workout editing and final actions", () => {
  it("flushes a newly added exercise when navigating before autosave", async () => {
    const user = await openWorkout(); await add(user, "Bench");
    await user.click(screen.getByRole("button", { name: "Back to Train", exact: true }));
    await screen.findByRole("heading", { name: "Your training workspace" });
    await waitFor(async () => expect((await storedSession()).performances[0]?.exerciseNameSnapshot).toBe("Bench"));
  });

  it("adds and replaces exercises without transferring logged results or touching another exercise", async () => {
    const user = await openWorkout(); await add(user, "Bench"); await add(user, "Row");
    await waitFor(async () => expect((await storedSession()).performances).toHaveLength(2));
    const remote = structuredClone((await (await openRepsDatabase()).get("snapshots", "current"))!);
    await user.type(screen.getByLabelText("Set 1 load"), "45");
    await user.click(screen.getByRole("button", { name: "Exercise actions" }));
    await user.click(screen.getByRole("button", { name: "Replace exercise", exact: true }));
    await user.click(within(screen.getByRole("dialog", { name: "Replace exercise" })).getByRole("button", { name: /Squat/ }));
    const confirm = screen.getByRole("dialog", { name: "Replace exercise and reset its sets?" });
    await user.click(within(confirm).getByRole("button", { name: "Replace exercise" }));
    expect(screen.getByRole("heading", { name: "Squat" })).toBeInTheDocument();
    expect(screen.getByLabelText("Set 1 load")).toHaveValue("");
    await waitFor(async () => {
      const session = await storedSession();
      expect(session.performances.map((item) => item.exerciseNameSnapshot)).toEqual(["Bench", "Squat"]);
      expect(session.performances[1].sets.every((set) => !set.completed && set.load == null)).toBe(true);
      const saved = (await (await openRepsDatabase()).get("snapshots", "current"))!;
      const merged = mergeSnapshots(saved, remote, "test");
      expect(merged.sessions.find((item) => item.id === sessionId)!.performances.map((item) => item.exerciseNameSnapshot)).toEqual(["Bench", "Squat"]);
    });
  });
  it("discards after confirmation and cannot resurrect through a delayed autosave or reload", async () => {
    const user = await openWorkout(); await add(user, "Bench");
    await user.type(screen.getByLabelText("Set 1 load"), "25");
    await user.click(screen.getByRole("button", { name: "Finish", exact: true }));
    await user.click(screen.getByRole("button", { name: "Discard draft", exact: true }));
    await user.click(within(screen.getByRole("dialog", { name: "Discard this workout draft?" })).getByRole("button", { name: "Discard draft" }));
    await screen.findByRole("heading", { name: "Your training workspace" });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
    expect((await storedSession()).status).toBe("discarded"); expect((await storedSession()).deletedAt).toBeTruthy();
    cleanup();
    render(<MemoryRouter initialEntries={[`/train/live/${sessionId}`]}><AppStoreProvider><App /></AppStoreProvider></MemoryRouter>);
    expect(await screen.findByText("Workout not found")).toBeInTheDocument();
  });
  it("finishes with the latest edits and is not overwritten by draft autosave", async () => {
    const user = await openWorkout(); await add(user, "Bench");
    await user.click(screen.getByRole("button", { name: "Finish", exact: true }));
    await user.clear(screen.getByLabelText("Workout name")); await user.type(screen.getByLabelText("Workout name"), "Finished test");
    await user.click(screen.getByRole("button", { name: "Finish & save" }));
    await screen.findByRole("heading", { name: "Finished test" });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });
    expect((await storedSession()).status).toBe("completed"); expect((await storedSession()).title).toBe("Finished test");
  });
});
