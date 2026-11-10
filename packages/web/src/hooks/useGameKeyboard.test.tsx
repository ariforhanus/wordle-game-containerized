import { afterEach, expect, it } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { useGame } from "./useGame";
afterEach(cleanup);
function Harness() {
  const { state } = useGame({ answer: "APPLE", definition: "", lang: "en", validWords: new Set(["APPLE"]) });
  return <><div className="board" tabIndex={0} /><output data-testid="draft">{state.currentGuess}</output>
    <select aria-label="Language"><option>English</option></select>
    <input aria-label="Input" /><button>Action</button>
    <div role="dialog" aria-label="Modal"><button>Close</button></div>
    <output data-testid="turns">{state.guesses.length}</output></>;
}
it("ignores form/dialog/shortcut input and preserves native control activation", () => {
  render(<Harness />);
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "a" });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "p" });
  fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "l" });
  fireEvent.keyDown(window, { key: "a", ctrlKey: true });
  fireEvent.keyDown(window, { key: "a", isComposing: true });
  expect(screen.getByTestId("draft").textContent).toBe("");
  for (const key of "apple") fireEvent.keyDown(window, { key });
  expect(screen.getByTestId("draft").textContent).toBe("APPLE");
  fireEvent.keyDown(screen.getByRole("button", { name: "Action" }), { key: "Enter" });
  expect(screen.getByTestId("turns").textContent).toBe("0");
  fireEvent.keyDown(screen.getByRole("button", { name: "Action" }), { key: "a" });
  expect(document.activeElement).toBe(document.querySelector(".board"));
});
