import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AppStoreProvider, useAppStore } from "../app/AppStore";
import { SettingsPage } from "./SettingsPage";
import { migrateLegacySources } from "../data/migrate";
import { hasPendingSync, listBackups, loadOrInitializeSnapshot, openRepsDatabase, saveSnapshot } from "../data/db";
import * as github from "../data/github";

vi.mock("../data/github", async (original) => ({ ...await original<typeof import("../data/github")>(), fetchRemote: vi.fn(), putRemote: vi.fn() }));
afterEach(cleanup);
let store: ReturnType<typeof useAppStore>;
function CaptureStore() { store = useAppStore(); return <SettingsPage />; }

it("recovers Mario and Connie, switches their editable details, and persists the selected profile", async () => {
  localStorage.clear();
  github.saveSyncConfig({ ...github.defaultSyncConfig(), autoSync: false });
  await loadOrInitializeSnapshot("test");
  const fresh = await migrateLegacySources({ clientId: "test" });
  await saveSnapshot(fresh, "Test fixture");
  await (await openRepsDatabase()).clear("backups");
  const view = render(<AppStoreProvider><MemoryRouter initialEntries={["/settings/profile"]}><Routes><Route path="/settings/:section" element={<CaptureStore />} /></Routes></MemoryRouter></AppStoreProvider>);
  await screen.findByLabelText("Active profile");
  const old = await migrateLegacySources({ clientId: "test", repsV1: { profiles: [{ id: "local", name: "Mario" }, { id: "connie", name: "Connie" }], activeProfileId: "local" } });
  await act(async () => { await store.importSnapshot(old, "recover"); });
  expect(screen.getByLabelText("Display name")).toHaveValue("Mario");
  expect(await listBackups()).toHaveLength(1);
  await userEvent.selectOptions(screen.getByLabelText("Active profile"), "connie");
  await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Connie"));
  expect(await hasPendingSync()).toBe(true);
  view.unmount();
  render(<AppStoreProvider><MemoryRouter initialEntries={["/settings/profile"]}><Routes><Route path="/settings/:section" element={<CaptureStore />} /></Routes></MemoryRouter></AppStoreProvider>);
  await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveValue("Connie"));
});
