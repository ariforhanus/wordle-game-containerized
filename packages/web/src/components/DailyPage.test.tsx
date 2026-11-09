import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DailyPage from "./DailyPage";
import { ToastProvider } from "./Toast";
import { dailyGameApi } from "@wordle/api";
import type { DailyGame } from "@wordle/api";

const locale = vi.hoisted(() => ({ language: "en" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: locale }),
}));
vi.mock("@wordle/api", async (original) => ({
  ...(await original<typeof import("@wordle/api")>()),
  isAuthenticated: () => true,
  dailyGameApi: { start: vi.fn(), guess: vi.fn(), load: vi.fn() },
}));
const initial: DailyGame = {
  id: "test-game",
  date: "2026-11-09",
  language: "en",
  status: "playing",
  elapsedMs: 1000,
  guesses: [],
  answer: null,
  score: null,
};
function mount() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <DailyPage />
      </ToastProvider>
    </MemoryRouter>,
  );
}
function typeWord() {
  for (const key of "apple") fireEvent.keyDown(window, { key });
}
afterEach(cleanup);
beforeEach(() => {
  locale.language = "en";
  vi.clearAllMocks();
  vi.mocked(dailyGameApi.start).mockResolvedValue(initial);
});
describe("server-authoritative daily play", () => {
  it("only starts after an explicit click, never on visit, language switch, or remount", async () => {
    const view = mount();
    await screen.findByText("daily.startResume");
    expect(dailyGameApi.start).not.toHaveBeenCalled();
    locale.language = "tr";
    view.rerender(
      <MemoryRouter>
        <ToastProvider>
          <DailyPage />
        </ToastProvider>
      </MemoryRouter>,
    );
    await screen.findByText("daily.startResume");
    expect(dailyGameApi.start).not.toHaveBeenCalled();
    expect(dailyGameApi.guess).not.toHaveBeenCalled();
    expect(dailyGameApi.load).not.toHaveBeenCalled();
    view.unmount();
    mount();
    expect(dailyGameApi.start).not.toHaveBeenCalled();
    vi.mocked(dailyGameApi.start).mockResolvedValue({
      ...initial,
      language: "tr",
    });
    fireEvent.click(screen.getByText("daily.startResume"));
    await screen.findByText("2026-11-09");
    expect(dailyGameApi.start).toHaveBeenCalledExactlyOnceWith("tr");
  });

  it("retains the same turn after a lost response and retries without inventing a result", async () => {
    vi.mocked(dailyGameApi.guess).mockRejectedValueOnce(new Error("offline"));
    vi.mocked(dailyGameApi.guess).mockResolvedValueOnce({
      ...initial,
      status: "won",
      answer: "APPLE",
      score: 9800,
      guesses: [{ guess: "APPLE", statuses: Array(5).fill("correct") }],
    });
    mount();
    fireEvent.click(screen.getByText("daily.startResume"));
    await screen.findByText("2026-11-09");
    typeWord();
    fireEvent.keyDown(window, { key: "Enter" });
    await screen.findByRole("alert");
    expect(screen.queryByText("daily.confirmedScore")).toBeNull();
    fireEvent.click(screen.getByText("daily.retry"));
    await screen.findByText("daily.confirmedScore");
    expect(dailyGameApi.guess).toHaveBeenNthCalledWith(
      1,
      "test-game",
      "APPLE",
      1,
    );
    expect(dailyGameApi.guess).toHaveBeenNthCalledWith(
      2,
      "test-game",
      "APPLE",
      1,
    );
  });
  it("resumes server feedback and refreshes a conflicting turn", async () => {
    const { ApiError } = await import("@wordle/api");
    vi.mocked(dailyGameApi.guess).mockRejectedValue(new ApiError(409, {}));
    vi.mocked(dailyGameApi.load).mockResolvedValue({
      ...initial,
      guesses: [{ guess: "CIGAR", statuses: Array(5).fill("absent") }],
    });
    mount();
    fireEvent.click(screen.getByText("daily.startResume"));
    await screen.findByText("2026-11-09");
    typeWord();
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() =>
      expect(dailyGameApi.load).toHaveBeenCalledWith("test-game"),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
