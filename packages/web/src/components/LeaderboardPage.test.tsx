import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  scoreApi,
  authApi,
  type ScoreResponse,
  type LeaderboardTotal,
} from "@wordle/api";
import LeaderboardPage from "./LeaderboardPage";

const locale = vi.hoisted(() => ({ language: "en" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: locale }),
}));
vi.mock("@wordle/api", async (original) => ({
  ...(await original<typeof import("@wordle/api")>()),
  isAuthenticated: () => true,
  scoreApi: {
    getDailyStatus: vi.fn(),
    getDailyLeaderboard: vi.fn(),
    getWeeklyLeaderboard: vi.fn(),
    getMonthlyLeaderboard: vi.fn(),
  },
  authApi: { getMe: vi.fn() },
}));
const daily: ScoreResponse = {
  id: 1,
  username: "<player>",
  score: 9999,
  attempts: 1,
  durationMs: 0,
  wonAt: "2024-01-15T10:00:00Z",
  word: null,
  currentStreak: 1,
};
const total: LeaderboardTotal = {
  userId: 2,
  username: "collector",
  totalScore: 27000,
  wins: 3,
  lastWinAt: daily.wonAt,
  currentStreak: 3,
};
function tree() {
  return (
    <MemoryRouter>
      <LeaderboardPage />
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  locale.language = "en";
  vi.mocked(scoreApi.getDailyStatus).mockResolvedValue({ played: true });
  vi.mocked(authApi.getMe).mockResolvedValue({
    username: "collector",
    email: "fixture@example.test",
    role: "USER",
    emailVerified: true,
  });
  vi.mocked(scoreApi.getDailyLeaderboard).mockResolvedValue([daily]);
  vi.mocked(scoreApi.getWeeklyLeaderboard).mockResolvedValue([total]);
  vi.mocked(scoreApi.getMonthlyLeaderboard).mockResolvedValue([
    { ...total, totalScore: 90000, wins: 10 },
  ]);
});
afterEach(cleanup);
it("labels daily game scores and renders player names safely as text", async () => {
  const view = render(tree());
  await screen.findByText("leaderboard.dailyScore");
  expect(screen.getByText("<player>")).toBeTruthy();
  expect(view.container.querySelector("player")).toBeNull();
  expect(screen.getByText("9999")).toBeTruthy();
  expect(screen.queryByText("leaderboard.totalPoints")).toBeNull();
  expect(scoreApi.getDailyLeaderboard).toHaveBeenCalledExactlyOnceWith("en");
});
it("distinguishes week/month totals, keeps large totals, and renders one row per returned player", async () => {
  render(tree());
  await screen.findByText("leaderboard.dailyScore");
  fireEvent.click(screen.getByText("game.lbWeekly"));
  await screen.findByText("27000");
  expect(screen.getByText("leaderboard.totalPoints")).toBeTruthy();
  expect(screen.getByText("leaderboard.wins")).toBeTruthy();
  expect(screen.getAllByRole("row")).toHaveLength(2);
  expect(scoreApi.getWeeklyLeaderboard).toHaveBeenCalledExactlyOnceWith("en");
  fireEvent.click(screen.getByText("game.lbMonthly"));
  await screen.findByText("90000");
  expect(screen.getByText("leaderboard.monthlyExplanation")).toBeTruthy();
  expect(scoreApi.getMonthlyLeaderboard).toHaveBeenCalledExactlyOnceWith("en");
});
it("keeps the play-first rule when the selected language has not been played", async () => {
  vi.mocked(scoreApi.getDailyStatus).mockResolvedValue({ played: false });
  render(tree());
  await screen.findByText("daily.playTodayFirst");
  expect(scoreApi.getDailyLeaderboard).not.toHaveBeenCalled();
});
it("shows a retry instead of granting access when the eligibility request fails", async () => {
  vi.mocked(scoreApi.getDailyStatus).mockRejectedValueOnce(
    new Error("offline"),
  );
  render(tree());
  await screen.findByRole("alert");
  expect(scoreApi.getDailyLeaderboard).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("daily.retryStatus"));
  await screen.findByText("leaderboard.dailyScore");
  expect(scoreApi.getDailyStatus).toHaveBeenCalledTimes(2);
});
it("ignores a late response from a previously selected language", async () => {
  let resolve!: (rows: ScoreResponse[]) => void;
  vi.mocked(scoreApi.getDailyLeaderboard).mockImplementation((lang) =>
    lang === "en"
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve([{ ...daily, username: "turkish_player" }]),
  );
  const view = render(tree());
  await waitFor(() =>
    expect(scoreApi.getDailyLeaderboard).toHaveBeenCalledWith("en"),
  );
  locale.language = "tr";
  view.rerender(tree());
  await screen.findByText("turkish_player");
  await act(async () => resolve([{ ...daily, username: "english_player" }]));
  expect(screen.queryByText("english_player")).toBeNull();
  expect(screen.getByText("turkish_player")).toBeTruthy();
});
it("ignores a late weekly response after switching to monthly", async () => {
  let resolve!: (rows: LeaderboardTotal[]) => void;
  vi.mocked(scoreApi.getWeeklyLeaderboard).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = render(tree());
  await screen.findByText("leaderboard.dailyScore");
  fireEvent.click(screen.getByText("game.lbWeekly"));
  await waitFor(() => expect(scoreApi.getWeeklyLeaderboard).toHaveBeenCalled());
  fireEvent.click(screen.getByText("game.lbMonthly"));
  await screen.findByText("90000");
  await act(async () => resolve([total]));
  expect(view.container.textContent).not.toContain("27000");
});
