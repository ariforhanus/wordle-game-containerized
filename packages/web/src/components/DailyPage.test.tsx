import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DailyPage from "./DailyPage";
import { ToastProvider } from "./Toast";
import { dailyGameApi, scoreApi } from "@wordle/api";
import type { DailyGame, DailyGameStatus } from "@wordle/api";
import { statsFixture } from "../../tests/fixtures/stats";

const locale = vi.hoisted(() => ({ language: "en" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: locale }),
}));
vi.mock("@wordle/api", async (original) => ({
  ...(await original<typeof import("@wordle/api")>()),
  isAuthenticated: () => true,
  scoreApi: { getMyStats: vi.fn() },
  dailyGameApi: {
    status: vi.fn(),
    start: vi.fn(),
    guess: vi.fn(),
    load: vi.fn(),
  },
}));
const initial: DailyGame = {
  id: "test-game",
  date: "2024-01-15",
  language: "en",
  status: "playing",
  elapsedMs: 1000,
  guesses: [],
  answer: null,
  score: null,
};
// Fixed calendar fixtures are intentional; tests must not depend on today's machine date.
const nextDay = new Date(`${initial.date}T00:00:00Z`);
nextDay.setUTCDate(nextDay.getUTCDate() + 1);
const NEXT_TEST_DAY = nextDay.toISOString().slice(0, 10);

const dayMetadata = { date: initial.date, timeZone: "Europe/Istanbul" };
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
  vi.resetAllMocks();
  vi.mocked(scoreApi.getMyStats).mockResolvedValue(statsFixture());
  vi.mocked(dailyGameApi.status).mockResolvedValue({
    ...dayMetadata,
    state: "not_started",
    game: null,
  });
  vi.mocked(dailyGameApi.start).mockResolvedValue(initial);
});
describe("server-authoritative daily play", () => {
  it("only starts after an explicit click, never on visit, language switch, or remount", async () => {
    const view = mount();
    await screen.findByText("daily.start");
    expect(dailyGameApi.start).not.toHaveBeenCalled();
    locale.language = "tr";
    view.rerender(
      <MemoryRouter>
        <ToastProvider>
          <DailyPage />
        </ToastProvider>
      </MemoryRouter>,
    );
    await screen.findByText("daily.start");
    expect(dailyGameApi.start).not.toHaveBeenCalled();
    expect(dailyGameApi.guess).not.toHaveBeenCalled();
    expect(dailyGameApi.load).not.toHaveBeenCalled();
    view.unmount();
    mount();
    await screen.findByText("daily.start");
    expect(dailyGameApi.start).not.toHaveBeenCalled();
    vi.mocked(dailyGameApi.start).mockResolvedValue({
      ...initial,
      language: "tr",
    });
    fireEvent.click(screen.getByText("daily.start"));
    await screen.findByText(initial.date);
    expect(dailyGameApi.start).toHaveBeenCalledExactlyOnceWith(
      "tr",
      initial.date,
    );
  });

  it("resumes from fresh server elapsed time after leaving instead of resetting its timer", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(dailyGameApi.start).mockResolvedValue({
        ...initial,
        elapsedMs: 10000,
      });
      let first!: ReturnType<typeof mount>;
      await act(async () => {
        first = mount();
      });
      await act(async () => fireEvent.click(screen.getByText("daily.start")));
      expect(screen.getByLabelText("daily.elapsed").textContent).toBe("00:10");
      act(() => vi.advanceTimersByTime(3000));
      expect(screen.getByLabelText("daily.elapsed").textContent).toBe("00:13");
      first.unmount();
      expect(vi.getTimerCount()).toBe(0);
      act(() => vi.advanceTimersByTime(120000));
      vi.mocked(dailyGameApi.status).mockResolvedValue({
        ...dayMetadata,
        state: "playing",
        game: initial,
      });
      vi.mocked(dailyGameApi.load).mockResolvedValue({
        ...initial,
        elapsedMs: 133000,
      });
      await act(async () => {
        mount();
      });
      expect(dailyGameApi.start).toHaveBeenCalledTimes(1);
      await act(async () => fireEvent.click(screen.getByText("daily.resume")));
      expect(screen.getByLabelText("daily.elapsed").textContent).toBe("02:13");
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByLabelText("daily.elapsed").textContent).toBe("02:14");
      expect(dailyGameApi.start).toHaveBeenCalledTimes(1);
      expect(dailyGameApi.load).toHaveBeenCalledExactlyOnceWith(initial.id);
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("keeps completed game time frozen after reopening", async () => {
    vi.useFakeTimers();
    try {
      const finished: DailyGame = {
        ...initial,
        elapsedMs: 133000,
        status: "lost",
        answer: "APPLE",
        score: 0,
      };
      vi.mocked(dailyGameApi.status).mockResolvedValue({
        ...dayMetadata,
        state: "finished",
        game: finished,
      });
      vi.mocked(dailyGameApi.load).mockResolvedValue(finished);
      await act(async () => {
        mount();
      });
      await act(async () =>
        fireEvent.click(screen.getByText("daily.viewResult")),
      );
      expect(screen.getByLabelText("daily.elapsed").textContent).toBe("02:13");
      act(() => vi.advanceTimersByTime(120000));
      expect(screen.getByLabelText("daily.elapsed").textContent).toBe("02:13");
    } finally {
      cleanup();
      vi.useRealTimers();
    }
  });

  it("waits for status and explains the timer before allowing an explicit Start", async () => {
    let resolve!: (value: DailyGameStatus) => void;
    vi.mocked(dailyGameApi.status).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mount();
    expect(
      screen
        .getByRole("button", { name: "daily.loading" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(dailyGameApi.start).not.toHaveBeenCalled();
    await act(async () =>
      resolve({ ...dayMetadata, state: "not_started", game: null }),
    );
    expect(screen.getByText("daily.startRule")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "daily.start" })
        .getAttribute("aria-describedby"),
    ).toBe("daily-timer-rule");
    expect(dailyGameApi.start).not.toHaveBeenCalled();
  });

  it("fails closed when status cannot be checked and retries the read without starting", async () => {
    vi.mocked(dailyGameApi.status).mockRejectedValueOnce(new Error("offline"));
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByText("daily.start")).toBeNull();
    expect(dailyGameApi.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("daily.retryStatus"));
    await screen.findByText("daily.startRule");
    expect(dailyGameApi.status).toHaveBeenCalledTimes(2);
    expect(dailyGameApi.start).not.toHaveBeenCalled();
  });

  it("ignores a previous language's late status response", async () => {
    let resolve!: (value: DailyGameStatus) => void;
    vi.mocked(dailyGameApi.status).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const view = mount();
    locale.language = "tr";
    view.rerender(
      <MemoryRouter>
        <ToastProvider>
          <DailyPage />
        </ToastProvider>
      </MemoryRouter>,
    );
    await screen.findByText("daily.startRule");
    await act(async () =>
      resolve({ ...dayMetadata, state: "playing", game: initial }),
    );
    expect(screen.queryByText("daily.resume")).toBeNull();
    expect(screen.getByText("daily.start")).toBeTruthy();
    expect(dailyGameApi.start).not.toHaveBeenCalled();
  });

  it("does not offer a second game for a historical completed score", async () => {
    vi.mocked(dailyGameApi.status).mockResolvedValue({
      ...dayMetadata,
      state: "already_played",
      game: null,
    });
    mount();
    await screen.findByText("daily.alreadyPlayed");
    expect(
      screen
        .getByRole("button", { name: "daily.start" })
        .hasAttribute("disabled"),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "daily.start" }));
    expect(dailyGameApi.start).not.toHaveBeenCalled();
  });

  it("submits only one Start while its response is pending", async () => {
    let resolve!: (game: DailyGame) => void;
    vi.mocked(dailyGameApi.start).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mount();
    const button = await screen.findByRole("button", { name: "daily.start" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(dailyGameApi.start).toHaveBeenCalledExactlyOnceWith(
      "en",
      initial.date,
    );
    expect(button.hasAttribute("disabled")).toBe(true);
    await act(async () => resolve(initial));
    expect(screen.getByText(initial.date)).toBeTruthy();
  });

  it("retries an unconfirmed Start without inventing a game or score", async () => {
    vi.mocked(dailyGameApi.start).mockRejectedValueOnce(
      new Error("response lost"),
    );
    mount();
    fireEvent.click(await screen.findByText("daily.start"));
    await screen.findByRole("alert");
    expect(screen.queryByRole("grid")).toBeNull();
    fireEvent.click(screen.getByText("daily.start"));
    await screen.findByText(initial.date);
    expect(dailyGameApi.start).toHaveBeenNthCalledWith(1, "en", initial.date);
    expect(dailyGameApi.start).toHaveBeenNthCalledWith(2, "en", initial.date);
    expect(screen.queryByText("daily.confirmedScore")).toBeNull();
  });

  it("does not issue another turn while the first guess request is pending", async () => {
    let resolve!: (game: DailyGame) => void;
    vi.mocked(dailyGameApi.guess).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    mount();
    fireEvent.click(await screen.findByText("daily.start"));
    await screen.findByText(initial.date);
    typeWord();
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Enter" });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(dailyGameApi.guess).toHaveBeenCalledExactlyOnceWith(
      initial.id,
      "APPLE",
      1,
    );
    await act(async () =>
      resolve({
        ...initial,
        guesses: [{ guess: "APPLE", statuses: Array(5).fill("absent") }],
      }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(dailyGameApi.guess).toHaveBeenCalledTimes(1);
  });

  it("does not start when an older server omits puzzle-day metadata", async () => {
    vi.mocked(dailyGameApi.status).mockResolvedValue({
      state: "not_started",
      game: null,
    } as DailyGameStatus);
    mount();
    await screen.findByRole("alert");
    expect(screen.queryByText("daily.start")).toBeNull();
    expect(dailyGameApi.start).not.toHaveBeenCalled();
  });

  it("refreshes a stale day and requires a new explicit Start instead of silently starting tomorrow", async () => {
    const { ApiError } = await import("@wordle/api");
    vi.mocked(dailyGameApi.start)
      .mockRejectedValueOnce(new ApiError(409, { error: "day_changed" }))
      .mockResolvedValueOnce({ ...initial, date: NEXT_TEST_DAY });
    vi.mocked(dailyGameApi.status)
      .mockResolvedValueOnce({
        ...dayMetadata,
        state: "not_started",
        game: null,
      })
      .mockResolvedValueOnce({
        ...dayMetadata,
        date: NEXT_TEST_DAY,
        state: "not_started",
        game: null,
      });
    mount();
    fireEvent.click(await screen.findByText("daily.start"));
    await screen.findByText("daily.dayChanged");
    await waitFor(() => expect(dailyGameApi.status).toHaveBeenCalledTimes(2));
    expect(dailyGameApi.start).toHaveBeenCalledExactlyOnceWith(
      "en",
      initial.date,
    );
    expect(screen.queryByText("daily.alreadyPlayed")).toBeNull();
    expect(screen.queryByRole("grid")).toBeNull();
    fireEvent.click(await screen.findByText("daily.start"));
    await screen.findByText(NEXT_TEST_DAY);
    expect(dailyGameApi.start).toHaveBeenNthCalledWith(2, "en", NEXT_TEST_DAY);
  });

  it("keeps the original game ID and puzzle date when the browser clock crosses midnight", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(`${initial.date}T20:59:59Z`));
      await act(async () => {
        mount();
      });
      await act(async () => fireEvent.click(screen.getByText("daily.start")));
      act(() => vi.advanceTimersByTime(2000));
      expect(screen.getByLabelText("daily.elapsed").textContent).toBe("00:03");
      vi.setSystemTime(new Date(`${NEXT_TEST_DAY}T12:00:00Z`));
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByLabelText("daily.elapsed").textContent).toBe("00:04");
      expect(screen.getByText(initial.date)).toBeTruthy();
      expect(screen.getByText("daily.rolloverRule")).toBeTruthy();
      vi.mocked(dailyGameApi.guess).mockResolvedValue({
        ...initial,
        guesses: [{ guess: "APPLE", statuses: Array(5).fill("absent") }],
      });
      typeWord();
      await act(async () => fireEvent.keyDown(window, { key: "Enter" }));
      expect(dailyGameApi.guess).toHaveBeenCalledExactlyOnceWith(
        initial.id,
        "APPLE",
        1,
      );
      expect(dailyGameApi.start).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
      vi.useRealTimers();
    }
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
    fireEvent.click(await screen.findByText("daily.start"));
    await screen.findByText(initial.date);
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
    fireEvent.click(await screen.findByText("daily.start"));
    await screen.findByText(initial.date);
    typeWord();
    fireEvent.keyDown(window, { key: "Enter" });
    await waitFor(() =>
      expect(dailyGameApi.load).toHaveBeenCalledWith("test-game"),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
