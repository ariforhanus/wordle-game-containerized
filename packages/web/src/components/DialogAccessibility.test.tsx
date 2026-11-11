import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import HowToPlayModal from "./HowToPlayModal";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);
function Harness() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Help</button><HowToPlayModal manualOnly forceOpen={open} onClose={() => setOpen(false)} /></>;
}
it("moves focus into help, traps Tab, suppresses game shortcuts and restores focus on Escape", () => {
  const keyboard = vi.fn();
  window.addEventListener("keydown", keyboard);
  const view = render(<Harness />);
  const trigger = screen.getByRole("button", { name: "Help" });
  trigger.focus(); fireEvent.click(trigger);
  const close = screen.getByRole("button", { name: "game.howGotIt" });
  expect(document.activeElement).toBe(close);
  expect(trigger.hasAttribute("inert")).toBe(true);
  fireEvent.keyDown(close, { key: "Tab" });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: "a" });
  expect(keyboard).not.toHaveBeenCalled();
  fireEvent.keyDown(close, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(trigger.hasAttribute("inert")).toBe(false);
  view.unmount();
  window.removeEventListener("keydown", keyboard);
});
it("keeps help dismissible when optional storage is blocked", () => {
  const blocked = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Help" }));
  fireEvent.click(screen.getByRole("button", { name: "game.howGotIt" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  blocked.mockRestore();
});
