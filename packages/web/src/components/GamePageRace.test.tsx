import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { GameState } from "@wordle/engine";
import { wordApi } from "@wordle/api";
import GamePage from "./GamePage";

const translation = vi.hoisted(() => ({ t: (key: string) => key, i18n: { language: "en" } }));
const toast = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), info: vi.fn(), toast: vi.fn(), success: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => translation }));
vi.mock("@wordle/api", () => ({ wordApi: { getRandomWord: vi.fn() } }));
vi.mock("./Toast", () => ({ useToast: () => toast }));
vi.mock("./Confetti", () => ({ default: () => null }));
vi.mock("./HowToPlayModal", () => ({ default: () => null }));
vi.mock("./Keyboard", () => ({ default: () => null }));
vi.mock("./Board", () => ({ default: ({ state }: { state: GameState }) => (
  <div className="board" tabIndex={0}>
    <output data-testid="answer">{state.answer}</output>
    <output data-testid="definition">{state.definition}</output>
    <output data-testid="language">{state.lang}</output>
    <output data-testid="guesses">{state.guesses.length}</output>
  </div>
) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const dictionary = (text: string) => ({ ok: true, text: async () => text }) as Response;
const fetcher = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  translation.i18n.language = "en";
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValue(dictionary("APPLE\nCIGAR"));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount() {
  const element = () => <MemoryRouter><GamePage /></MemoryRouter>;
  const view = render(element());
  return { ...view, language: (lang: string) => { translation.i18n.language = lang; view.rerender(element()); } };
}
type Word = { word: string; definition: string };

it("keeps the latest answer/definition/dictionary when old-language responses arrive last", async () => {
  const oldWord = deferred<Word>(), newWord = deferred<Word>();
  const oldList = deferred<Response>(), newList = deferred<Response>();
  vi.mocked(wordApi.getRandomWord).mockReturnValueOnce(oldWord.promise).mockReturnValueOnce(newWord.promise);
  fetcher.mockReturnValueOnce(oldList.promise).mockReturnValueOnce(newList.promise);
  const view = mount();
  view.language("tr");
  await act(async () => {
    newWord.resolve({ word: "incir", definition: "current hint" });
    newList.resolve(dictionary("incir\nkalem"));
  });
  expect(screen.getByTestId("answer").textContent).toBe("İNCİR");
  await act(async () => {
    oldWord.resolve({ word: "APPLE", definition: "obsolete hint" });
    oldList.resolve(dictionary("APPLE\nCIGAR"));
  });
  expect(screen.getByTestId("answer").textContent).toBe("İNCİR");
  expect(screen.getByTestId("definition").textContent).toBe("current hint");
  expect(screen.getByTestId("language").textContent).toBe("tr");
  for (const key of "kalem") fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: "Enter" });
  expect(screen.getByTestId("guesses").textContent).toBe("1");
  expect(toast.warning).not.toHaveBeenCalled();
});

it("ignores obsolete errors/finally while the current offline fallback is still loading", async () => {
  const oldWord = deferred<Word>(), newWord = deferred<Word>();
  const oldList = deferred<Response>(), newList = deferred<Response>();
  vi.mocked(wordApi.getRandomWord).mockReturnValueOnce(oldWord.promise).mockReturnValueOnce(newWord.promise);
  fetcher.mockReturnValueOnce(oldList.promise).mockReturnValueOnce(newList.promise);
  fetcher.mockRejectedValue(new Error("No other language fallback is permitted"));
  const view = mount(); view.language("tr");
  await act(async () => { oldWord.reject(new Error("obsolete")); oldList.reject(new Error("obsolete")); });
  expect(screen.getByRole("status")).toBeTruthy();
  expect(toast.error).not.toHaveBeenCalled();
  await act(async () => newWord.reject(new Error("offline")));
  expect(screen.getByRole("status")).toBeTruthy();
  await act(async () => newList.resolve(dictionary("incir")));
  expect(screen.getByTestId("answer").textContent).toBe("İNCİR");
  expect(screen.getByTestId("definition").textContent).toBe("");
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/words_en_possible.txt", "/words_tr_possible.txt"]);
  expect(toast.error).not.toHaveBeenCalled();
});

it("retries a current load failure and never falls back to an English game under a Turkish keyboard", async () => {
  translation.i18n.language = "tr";
  vi.mocked(wordApi.getRandomWord).mockRejectedValue(new Error("offline"));
  fetcher.mockResolvedValueOnce({ ok: false } as Response).mockResolvedValueOnce(dictionary("incir"));
  mount();
  await screen.findByRole("alert");
  expect(screen.queryByTestId("answer")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "a11y.retry" }));
  await screen.findByTestId("answer");
  expect(screen.getByTestId("answer").textContent).toBe("İNCİR");
  expect(toast.error).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/words_tr_possible.txt", "/words_tr_possible.txt"]);
});

it("restarts an identical practice answer and ignores a late Play Again response after a language switch", async () => {
  vi.mocked(wordApi.getRandomWord).mockResolvedValue({ word: "APPLE", definition: "same hint" });
  const view = mount(); await screen.findByTestId("answer");
  async function win() {
    for (const key of "apple") fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: "Enter" });
    await screen.findByRole("dialog", { name: "game.word" });
    fireEvent.click(screen.getByRole("button", { name: "game.playAgain" }));
  }
  await win(); await screen.findByTestId("answer");
  expect(screen.getByTestId("guesses").textContent).toBe("0");
  const nextWord = deferred<Word>();
  vi.mocked(wordApi.getRandomWord).mockReturnValueOnce(nextWord.promise).mockResolvedValueOnce({ word: "incir", definition: "new hint" });
  await win();
  fetcher.mockResolvedValue(dictionary("incir"));
  view.language("tr");
  await screen.findByTestId("answer");
  await act(async () => nextWord.resolve({ word: "CIGAR", definition: "late old-language answer" }));
  expect(screen.getByTestId("answer").textContent).toBe("İNCİR");
  expect(screen.getByTestId("definition").textContent).toBe("new hint");
});

it("discards pending failures after unmount without notifying another screen", async () => {
  const word = deferred<Word>(), list = deferred<Response>();
  vi.mocked(wordApi.getRandomWord).mockReturnValue(word.promise);
  fetcher.mockReturnValueOnce(list.promise).mockRejectedValue(new Error("offline"));
  const view = mount(); view.unmount();
  await act(async () => { word.reject(new Error("obsolete")); list.reject(new Error("obsolete")); });
  expect(toast.error).not.toHaveBeenCalled();
});

it("keeps a newer error visible when an older success finishes later", async () => {
  const oldWord = deferred<Word>(), oldList = deferred<Response>();
  vi.mocked(wordApi.getRandomWord).mockReturnValueOnce(oldWord.promise).mockRejectedValue(new Error("offline"));
  fetcher.mockReturnValueOnce(oldList.promise).mockRejectedValue(new Error("offline"));
  const view = mount(); view.language("tr");
  await screen.findByRole("alert");
  await act(async () => { oldWord.resolve({ word: "APPLE", definition: "obsolete" }); oldList.resolve(dictionary("APPLE")); });
  expect(screen.getByRole("alert").textContent).toBe("game.loadError");
  expect(screen.queryByTestId("answer")).toBeNull();
  expect(toast.error).toHaveBeenCalledTimes(1);
});

it("accepts only the newest of overlapping same-language Play Again requests", async () => {
  vi.mocked(wordApi.getRandomWord).mockResolvedValueOnce({ word: "APPLE", definition: "first" });
  mount(); await screen.findByTestId("answer");
  for (const key of "apple") fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: "Enter" });
  const again = await screen.findByRole("button", { name: "game.playAgain" });
  const older = deferred<Word>(), newer = deferred<Word>();
  vi.mocked(wordApi.getRandomWord).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
  act(() => { again.click(); again.click(); });
  expect(wordApi.getRandomWord).toHaveBeenCalledTimes(3);
  await act(async () => newer.resolve({ word: "CIGAR", definition: "latest" }));
  await act(async () => older.resolve({ word: "APPLE", definition: "older" }));
  expect(screen.getByTestId("answer").textContent).toBe("CIGAR");
  expect(screen.getByTestId("definition").textContent).toBe("latest");
});

it("announces mode toggles once in Strict Mode, outside state updaters", async () => {
  vi.mocked(wordApi.getRandomWord).mockResolvedValue({ word: "APPLE", definition: "hint" });
  render(<StrictMode><MemoryRouter><GamePage /></MemoryRouter></StrictMode>);
  await screen.findByTestId("answer");
  fireEvent.click(screen.getByRole("button", { name: "game.hardMode" }));
  expect(toast.toast).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem("wordle_hard_mode")).toBe("1");
  fireEvent.click(screen.getByRole("button", { name: "game.blindMode" }));
  expect(toast.toast).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "game.blindMode" }));
  expect(toast.info).toHaveBeenCalledTimes(1);
});

it("keeps a valid API answer solvable when the local dictionary version differs", async () => {
  vi.mocked(wordApi.getRandomWord).mockResolvedValue({ word: "APPLE", definition: "hint" });
  fetcher.mockResolvedValue(dictionary("CIGAR"));
  mount(); await screen.findByTestId("answer");
  for (const key of "apple") fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: "Enter" });
  await screen.findByRole("dialog", { name: "game.word" });
  expect(toast.warning).not.toHaveBeenCalled();
});

it.each(["BAD", "12345"])("uses the selected-language fallback for unusable API answer %s", async word => {
  vi.mocked(wordApi.getRandomWord).mockResolvedValue({ word, definition: "unusable hint" });
  fetcher.mockResolvedValue(dictionary("APPLE"));
  mount(); await screen.findByTestId("answer");
  expect(screen.getByTestId("answer").textContent).toBe("APPLE");
  expect(screen.getByTestId("definition").textContent).toBe("");
  expect(toast.error).not.toHaveBeenCalled();
});
