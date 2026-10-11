import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecimalInput, Modal } from "./ui";

function FocusHarness() {
  const [value, setValue] = useState("");
  return <Modal open title="Search exercises" onClose={() => undefined}><input autoFocus aria-label="Exercise search" value={value} onChange={(event) => setValue(event.target.value)} /></Modal>;
}

function DecimalHarness() {
  const [value, setValue] = useState<number | null>(null);
  return <><DecimalInput aria-label="Set load" value={value} onValueChange={setValue} /><output aria-label="Parsed load">{value ?? "empty"}</output></>;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("shared form controls", () => {
  it("escapes clipped page containers and keeps a short visible viewport", () => {
    const viewport = new EventTarget() as EventTarget & { height: number; width: number; offsetTop: number; offsetLeft: number };
    Object.assign(viewport, { height: 360, width: 390, offsetTop: 44, offsetLeft: 0 });
    vi.stubGlobal("visualViewport", viewport);
    const { unmount } = render(<div style={{ transform: "translateY(0)", overflow: "hidden" }}><Modal open title="Confirm" onClose={() => undefined}><button>Save</button></Modal></div>);
    const scrim = screen.getByRole("dialog").parentElement!;
    expect(scrim.parentElement).toBe(document.body);
    expect(scrim.style.height).toBe("360px"); expect(scrim.style.top).toBe("44px");
    act(() => { viewport.height = 280; viewport.dispatchEvent(new Event("resize")); });
    expect(scrim.style.height).toBe("280px"); expect(document.body.style.overflow).toBe("hidden");
    unmount(); expect(document.body.style.overflow).not.toBe("hidden");
  });

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
