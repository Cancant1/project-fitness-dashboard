import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DecimalInput, Modal } from "./ui";

function FocusHarness() {
  const [value, setValue] = useState("");
  return <Modal open title="Search exercises" onClose={() => undefined}><input autoFocus aria-label="Exercise search" value={value} onChange={(event) => setValue(event.target.value)} /></Modal>;
}

function DecimalHarness() {
  const [value, setValue] = useState<number | null>(null);
  return <><DecimalInput aria-label="Set load" value={value} onValueChange={setValue} /><output aria-label="Parsed load">{value ?? "empty"}</output></>;
}

describe("shared form controls", () => {
  it("keeps focus in a controlled modal field while typing", async () => {
    const user = userEvent.setup();
    render(<FocusHarness />);
    const input = screen.getByLabelText("Exercise search");
    await user.type(input, "bench press");
    expect(input).toHaveValue("bench press");
    expect(input).toHaveFocus();
  });

  it("accepts comma and dot decimal loads without exposing NaN", async () => {
    const user = userEvent.setup();
    render(<DecimalHarness />);
    const input = screen.getByLabelText("Set load");
    await user.type(input, "22,5");
    expect(input).toHaveValue("22,5");
    expect(screen.getByLabelText("Parsed load")).toHaveTextContent("22.5");
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "22.5");
    expect(input).toHaveValue("22.5");
    expect(screen.getByLabelText("Parsed load")).toHaveTextContent("22.5");
    expect(input).toHaveFocus();
  });
});
