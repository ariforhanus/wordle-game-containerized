import { StrictMode, type PropsWithChildren } from "react";
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useGame } from "./useGame";

const strict = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

function game(answer = "APPLE", words = [answer], lang = "en", hardMode = false) {
  const callbacks = { onWin: vi.fn(), onLose: vi.fn(), onInvalidWord: vi.fn(), onHardModeError: vi.fn() };
  const options = { answer, definition: "", validWords: new Set(words), lang, hardMode, ...callbacks };
  return { ...renderHook((props) => useGame(props), { initialProps: options, wrapper: strict }), callbacks, options };
}
function enter(result: ReturnType<typeof game>["result"], word: string) {
  // Typing and submitting may be batched. Handlers must see all queued letters.
  act(() => { for (const letter of word) result.current.addLetter(letter); result.current.submit(); });
}

it("submits one terminal transition/callback in Strict Mode, including repeated Enter", () => {
  const { result, callbacks } = game();
  enter(result, "APPLE");
  act(() => { result.current.submit(); vi.advanceTimersByTime(300); });
  expect(result.current.state.guesses).toHaveLength(1);
  expect(callbacks.onWin).toHaveBeenCalledTimes(1);
  expect(callbacks.onLose).not.toHaveBeenCalled();
});

it("reports invalid guesses once per submit and replaces/cleans the shake timer", () => {
  const { result, callbacks } = game();
  enter(result, "WRONG");
  expect(callbacks.onInvalidWord).toHaveBeenCalledTimes(1);
  expect(result.current.shakeRow).toBe(true);
  act(() => vi.advanceTimersByTime(500));
  act(() => result.current.submit());
  expect(callbacks.onInvalidWord).toHaveBeenCalledTimes(2);
  act(() => vi.advanceTimersByTime(100));
  expect(result.current.shakeRow).toBe(true);
  act(() => vi.advanceTimersByTime(500));
  expect(result.current.shakeRow).toBe(false);
});

it("emits one loss callback on the sixth valid failed guess", () => {
  const { result, callbacks } = game("APPLE", ["APPLE", "CIGAR"]);
  for (let turn = 0; turn < 6; turn++) enter(result, "CIGAR");
  act(() => { result.current.submit(); vi.advanceTimersByTime(300); });
  expect(result.current.state.status).toBe("lost");
  expect(callbacks.onLose).toHaveBeenCalledTimes(1);
  expect(callbacks.onWin).not.toHaveBeenCalled();
});

it("cancels old terminal/error work on a new round, language change and unmount", () => {
  const { result, callbacks, rerender, options, unmount } = game();
  enter(result, "APPLE");
  act(() => result.current.reset("APPLE", ""));
  act(() => vi.advanceTimersByTime(300));
  expect(callbacks.onWin).not.toHaveBeenCalled();
  expect(result.current.state.status).toBe("playing");
  enter(result, "APPLE");
  rerender({ ...options, answer: "İNCİR", lang: "tr", validWords: new Set(["İNCİR"]) });
  act(() => vi.advanceTimersByTime(300));
  expect(callbacks.onWin).not.toHaveBeenCalled();
  enter(result, "İNCİR");
  unmount();
  act(() => vi.runAllTimers());
  expect(callbacks.onWin).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("uses the latest committed callback and dictionary without losing batched edits", () => {
  const { result, callbacks, rerender, options } = game();
  const latest = vi.fn();
  rerender({ ...options, onWin: latest, validWords: new Set(["APPLE", "CIGAR"]) });
  act(() => { result.current.addLetter("x"); result.current.removeLetter(); });
  enter(result, "APPLE");
  act(() => vi.advanceTimersByTime(300));
  expect(result.current.state.currentGuess).toBe("");
  expect(latest).toHaveBeenCalledTimes(1);
  expect(callbacks.onWin).not.toHaveBeenCalled();
});

it("removes an outstanding shake timer on unmount", () => {
  const { result, unmount } = game();
  enter(result, "WRONG");
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("updates the physical keyboard's language even while the status stays playing", () => {
  const { result, rerender, options } = game();
  rerender({ ...options, answer: "İNCİR", lang: "tr", validWords: new Set(["İNCİR"]) });
  act(() => { fireEvent.keyDown(window, { key: "i" }); fireEvent.keyDown(window, { key: "ğ" }); });
  expect(result.current.state.currentGuess).toBe("İĞ");
});

it.each([
  ["EERIE", "LEMON", "LEVER", "en", "LEVEL", "E"], // correct + present + gray E
  ["EAGLE", "LEMON", "LEVER", "en", "LEVEL", "E"], // two yellows, no green E
  ["ZİFİR", "İZMIR", "İZMİR", "tr", "İKİZİ", "İ"], // I cannot stand in for İ
])("enforces revealed multiplicity after %s, retaining the pending guess", (first, rejected, accepted, lang, answer, letter) => {
  const { result, callbacks } = game(answer, [answer, first, rejected, accepted], lang, true);
  enter(result, first);
  expect(result.current.state.guesses).toHaveLength(1);
  enter(result, rejected);
  expect(result.current.state.guesses).toHaveLength(1);
  expect(result.current.state.currentGuess).toBe(rejected);
  expect(callbacks.onHardModeError).toHaveBeenCalledTimes(1);
  expect(callbacks.onHardModeError).toHaveBeenCalledWith(
    `game.hardModeCount|${JSON.stringify({ letter, count: "2" })}`,
  );
  act(() => { for (let i = 0; i < 5; i++) result.current.removeLetter(); });
  enter(result, accepted);
  expect(result.current.state.guesses).toHaveLength(2);
});

it("takes the maximum revealed count across rows, not their sum or gray duplicates", () => {
  const { result, callbacks } = game("LEVEL", ["LEVEL", "EAGLE", "LEVER"], "en", true);
  enter(result, "EAGLE");
  enter(result, "LEVER");
  enter(result, "LEVEL");
  expect(result.current.state.status).toBe("won");
  expect(callbacks.onHardModeError).not.toHaveBeenCalled();
  const other = game("APPLE", ["APPLE", "ALLEY", "AMPLE"], "en", true);
  enter(other.result, "ALLEY");
  enter(other.result, "AMPLE"); // one L meets the one revealed L despite two in ALLEY
  expect(other.result.current.state.guesses).toHaveLength(2);
  expect(other.callbacks.onHardModeError).not.toHaveBeenCalled();
});

it("preserves green positions and the existing yellow-anywhere rule", () => {
  const { result, callbacks } = game("LEVEL", ["LEVEL", "EERIE", "EAGLE", "EEEEE"], "en", true);
  enter(result, "EERIE");
  enter(result, "EAGLE");
  expect(callbacks.onHardModeError).toHaveBeenCalledWith('game.hardModeCorrect|{"pos":"2","letter":"E"}');
  act(() => { for (let i = 0; i < 5; i++) result.current.removeLetter(); });
  enter(result, "EEEEE"); // yellow E is allowed at its old location, as before
  expect(result.current.state.guesses).toHaveLength(2);
});
