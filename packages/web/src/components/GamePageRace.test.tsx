import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
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
  fetcher.mockResolvedValue(dictionary("incir"));
  const view = mount(); view.language("tr");
  await act(async () => { oldWord.reject(new Error("obsolete")); oldList.reject(new Error("obsolete")); });
  expect(screen.getByRole("status")).toBeTruthy();
  expect(toast.error).not.toHaveBeenCalled();
  await act(async () => newWord.reject(new Error("offline")));
  expect(screen.getByRole("status")).toBeTruthy();
  await act(async () => newList.resolve(dictionary("incir")));
  expect(screen.getByTestId("answer").textContent).toBe("İNCİR");
  expect(screen.getByTestId("definition").textContent).toBe("");
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/words_en_possible.txt", "/words_tr_possible.txt", "/words_tr.txt"]);
  expect(toast.error).not.toHaveBeenCalled();
});

it("retries a current load failure and never falls back to an English game under a Turkish keyboard", async () => {
  translation.i18n.language = "tr";
  vi.mocked(wordApi.getRandomWord).mockRejectedValue(new Error("offline"));
  fetcher.mockResolvedValueOnce({ ok: false } as Response)
    .mockResolvedValueOnce(dictionary("incir")).mockResolvedValueOnce(dictionary("incir"));
  mount();
  await screen.findByRole("alert");
  expect(screen.queryByTestId("answer")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "a11y.retry" }));
  await screen.findByTestId("answer");
  expect(screen.getByTestId("answer").textContent).toBe("İNCİR");
  expect(toast.error).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/words_tr_possible.txt", "/words_tr_possible.txt", "/words_tr.txt"]);
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
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/words_en_possible.txt", "/words_en.txt"]);
});

it.each([
  { lang: "en", answers: " apple \r\nAPPLE\nrebut\n12345\nTOOLONG\n", answer: "REBUT", guess: "cigar", winningGuess: "rebut" },
  { lang: "tr", answers: " incir \r\nİNCİR\nırmak\n12345\nTOOLONG\n", answer: "IRMAK", guess: "kalem", winningGuess: "ırmak" },
])("normalizes/deduplicates curated $lang fallback answers while preserving guess-only words", async ({ lang, answers, answer, guess, winningGuess }) => {
  translation.i18n.language = lang;
  vi.mocked(wordApi.getRandomWord).mockRejectedValue(new Error("offline"));
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  fetcher.mockImplementation(async (url: string) => dictionary(url.endsWith("_possible.txt") ? guess : answers));
  mount(); await screen.findByTestId("answer");
  // With duplicate entries left in the array, 0.5 selects the first word instead.
  expect(screen.getByTestId("answer").textContent).toBe(answer);
  for (const key of guess) fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: "Enter" });
  expect(screen.getByTestId("guesses").textContent).toBe("1");
  // The selected answer remains solvable even if absent from the guess fixture.
  for (const key of winningGuess) fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: "Enter" });
  await screen.findByRole("dialog", { name: "game.word" });
  expect(toast.warning).not.toHaveBeenCalled();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([`/words_${lang}_possible.txt`, `/words_${lang}.txt`]);
});

for (const lang of ["en", "tr"]) {
  it.each(["missing", "empty", "malformed", "unreachable"])(`shows retry for a %s ${lang} answer file without selecting guess-only words`, async failure => {
    translation.i18n.language = lang;
    vi.mocked(wordApi.getRandomWord).mockRejectedValue(new Error("offline"));
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("_possible.txt")) return dictionary(lang === "en" ? "CIGAR" : "KALEM");
      if (failure === "unreachable") throw new Error("offline");
      if (failure === "missing") return { ok: false } as Response;
      return dictionary(failure === "empty" ? "\n \r\n" : "<html>Not found</html>\n12345\nTOOLONG");
    });
    mount(); await screen.findByRole("alert");
    expect(screen.queryByTestId("answer")).toBeNull();
    expect(screen.getByRole("button", { name: "a11y.retry" })).toBeTruthy();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([`/words_${lang}_possible.txt`, `/words_${lang}.txt`]);
  });
}

it("recovers through explicit retry after the curated answer file becomes available", async () => {
  vi.mocked(wordApi.getRandomWord).mockRejectedValue(new Error("offline"));
  let available = false;
  fetcher.mockImplementation(async (url: string) => url.endsWith("_possible.txt")
    ? dictionary("CIGAR") : available ? dictionary("APPLE") : { ok: false } as Response);
  mount(); await screen.findByRole("alert");
  available = true;
  fireEvent.click(screen.getByRole("button", { name: "a11y.retry" }));
  await screen.findByTestId("answer");
  expect(screen.getByTestId("answer").textContent).toBe("APPLE");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("does not request or depend on the offline answer file for a valid online answer", async () => {
  vi.mocked(wordApi.getRandomWord).mockResolvedValue({ word: "APPLE", definition: "online hint" });
  fetcher.mockImplementation(async (url: string) => {
    if (!url.endsWith("_possible.txt")) throw new Error("Missing offline answers");
    return dictionary("CIGAR");
  });
  mount(); await screen.findByTestId("answer");
  expect(screen.getByTestId("answer").textContent).toBe("APPLE");
  expect(screen.getByTestId("definition").textContent).toBe("online hint");
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/words_en_possible.txt"]);
  expect(toast.error).not.toHaveBeenCalled();
});

it("ignores a late curated fallback answer after a language switch", async () => {
  vi.mocked(wordApi.getRandomWord).mockRejectedValue(new Error("offline"));
  const oldAnswers = deferred<Response>();
  fetcher.mockImplementation(async (url: string) => {
    if (url === "/words_en.txt") return oldAnswers.promise;
    if (url === "/words_tr.txt") return dictionary("incir");
    return dictionary(url.includes("_en_") ? "CIGAR" : "KALEM");
  });
  const view = mount();
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/words_en.txt"));
  view.language("tr"); await screen.findByTestId("answer");
  await act(async () => oldAnswers.resolve(dictionary("APPLE")));
  expect(screen.getByTestId("answer").textContent).toBe("İNCİR");
  expect(screen.getByTestId("language").textContent).toBe("tr");
  expect(toast.error).not.toHaveBeenCalled();
});
