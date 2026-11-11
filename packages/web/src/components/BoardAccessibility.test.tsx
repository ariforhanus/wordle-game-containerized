import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createGame, type GameState } from "@wordle/engine";
import Board from "./Board";
import Keyboard from "./Keyboard";
import Confetti from "./Confetti";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
let reduce = true;
let listeners: Set<() => void>;
beforeEach(() => {
  vi.useFakeTimers();
  reduce = true; listeners = new Set();
  vi.stubGlobal("matchMedia", () => ({ get matches() { return reduce; }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const played: GameState = { ...createGame("APPLE", "", "en"), guesses: [{ guess: "ALLEY", statuses: ["correct", "present", "absent", "present", "absent"] }] };
it("provides visible symbols and names for each letter status without changing row text", () => {
  const view = render(<Board state={played} />);
  expect(view.container.querySelector(".board-row")?.textContent).toBe("ALLEY");
  expect(screen.getByRole("gridcell", { name: "A: feedback.correct" }).getAttribute("data-feedback-symbol")).toBe("✓");
  expect(view.container.querySelectorAll("[data-feedback-symbol]").length).toBe(5);
  expect(view.container.querySelector("[aria-live=polite]")?.textContent).toContain("L: feedback.present");
});
it("does not leak hidden blind-mode statuses through symbols, labels or announcements", () => {
  const view = render(<Board state={played} blindMode />);
  expect(view.container.querySelectorAll("[data-feedback-symbol]").length).toBe(0);
  expect(screen.getByRole("gridcell", { name: "A: feedback.hidden" })).toBeTruthy();
  expect(view.container.querySelector("[aria-live]")?.textContent).not.toContain("feedback.correct");
  view.rerender(<Board state={{ ...played, status: "lost" }} blindMode />);
  expect(view.container.querySelectorAll("[data-feedback-symbol]").length).toBe(5);
});
it("skips reveal delays and confetti for reduced motion, including live preference changes", () => {
  const view = render(<><Board state={createGame("APPLE", "", "en")} /><Confetti active /></>);
  view.rerender(<><Board state={played} /><Confetti active /></>);
  expect(view.container.querySelector(".cell-reveal")).toBeNull();
  expect(view.container.querySelector(".confetti-container")).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  act(() => { reduce = false; listeners.forEach((listener) => listener()); });
  expect(view.container.querySelector(".confetti-container")).not.toBeNull();
  act(() => { reduce = true; listeners.forEach((listener) => listener()); });
  expect(view.container.querySelector(".confetti-container")).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
it("keeps native letter key names and adds status descriptions, but hides them in blind mode", () => {
  const callbacks = { onKey: vi.fn(), onEnter: vi.fn(), onBackspace: vi.fn() };
  const view = render(<Keyboard keyboard={{ A: "correct" }} {...callbacks} />);
  const key = screen.getByRole("button", { name: "A", exact: true });
  expect(document.getElementById(key.getAttribute("aria-describedby")!)?.textContent).toBe("feedback.correct");
  expect(key.getAttribute("data-feedback-symbol")).toBe("✓");
  view.rerender(<Keyboard keyboard={{ A: "correct" }} blindMode {...callbacks} />);
  expect(key.getAttribute("aria-describedby")).toBeNull();
  expect(key.getAttribute("data-feedback-symbol")).toBeNull();
});
