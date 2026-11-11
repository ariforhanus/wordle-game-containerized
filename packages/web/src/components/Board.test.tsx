import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { GameState } from "@wordle/engine";
import Board from "./Board";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const empty: GameState = {
  answer: "APPLE",
  definition: "",
  guesses: [],
  currentGuess: "",
  status: "playing",
  maxAttempts: 6,
  wordLength: 5,
  lang: "en",
  keyboard: {},
  startedAt: 0,
};
const guessed: GameState = {
  ...empty,
  guesses: [{ guess: "APPLE", statuses: Array(5).fill("correct") }],
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("still reveals the submitted row and finishes its animation", () => {
  const view = render(<Board state={empty} />);
  view.rerender(<Board state={guessed} />);
  expect(view.container.querySelectorAll(".cell-reveal")).toHaveLength(5);
  act(() => vi.advanceTimersByTime(250));
  expect(view.container.querySelectorAll(".cell-correct")).toHaveLength(1);
  act(() => vi.advanceTimersByTime(2000));
  expect(view.container.querySelectorAll(".cell-reveal")).toHaveLength(0);
  expect(view.container.querySelectorAll(".cell-correct")).toHaveLength(5);
});
it("cancels pending reveal work when the player leaves the board", () => {
  const view = render(<Board state={empty} />);
  view.rerender(<Board state={guessed} />);
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.runAllTimers());
});
