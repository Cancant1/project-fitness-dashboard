import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it } from "vitest";
import { App } from "../../app/App";
import { AppStoreProvider } from "../../app/AppStore";
import { openRepsDatabase, saveSnapshot } from "../../data/db";
import { migrateLegacySources } from "../../data/migrate";

beforeEach(async () => {
  localStorage.clear(); const snapshot = await migrateLegacySources({ clientId: "food-test" });
  snapshot.foodEntries = []; snapshot.foods = [{ id: "apple", createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-08T00:00:00Z", name: "Test apple", servings: [{ id: "one", label: "each", amount: 1, unit: "each" }], kcalPerServing: 80, proteinPerServing: 1, carbsPerServing: 20, fatPerServing: 0, verified: true, favorite: false, archived: false }];
  await saveSnapshot(snapshot, "Test seed");
});
afterEach(cleanup);

it("removes a selected food with minus, adds once confirmed, and saves normal quantities", async () => {
  render(<MemoryRouter initialEntries={["/nutrition"]}><AppStoreProvider><App /></AppStoreProvider></MemoryRouter>);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Add food", exact: true }));
  await user.click(screen.getByRole("button", { name: /Test apple/ }));
  for (let i = 0; i < 4; i++) await user.click(screen.getByRole("button", { name: "Decrease" }));
  expect(screen.getByRole("button", { name: "Add items" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: /Test apple/ }));
  await user.click(screen.getByRole("button", { name: "Add 1 item" }));
  await user.click(await screen.findByRole("button", { name: "Edit Test apple" }));
  const input = screen.getByRole("spinbutton", { name: "Quantity" });
  await user.clear(input); await user.type(input, "2");
  expect(input).toBeValid();
  await user.click(within(screen.getByRole("dialog", { name: "Edit food entry" })).getByRole("button", { name: "Save changes" }));
  await waitFor(async () => {
    const saved = (await (await openRepsDatabase()).get("snapshots", "current"))!;
    expect(saved.foodEntries).toHaveLength(1); expect(saved.foodEntries[0].quantity).toBe(2); expect(saved.foodEntries[0].kcal).toBe(160);
  });
});
