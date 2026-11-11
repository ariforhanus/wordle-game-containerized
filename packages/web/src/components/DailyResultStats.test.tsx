import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { scoreApi, type UserStats } from "@wordle/api";
import { statsFixture } from "../../tests/fixtures/stats";
import DailyResultStats from "./DailyResultStats";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@wordle/api", () => ({ scoreApi: { getMyStats: vi.fn() } }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(scoreApi.getMyStats).mockResolvedValue(statsFixture());
});
afterEach(cleanup);
it("shows the selected language's streak and distribution rather than global or other-language values", async () => {
  render(<DailyResultStats language="tr" gameId="fixture-game" />);
  const region = await screen.findByRole("region", {
    name: "daily.languageStats",
  });
  await screen.findByText("profile.guessDistribution");
  expect(region.textContent).toContain("profile.currentStreak: 0");
  expect(region.textContent).toContain("profile.bestStreak: 2");
  expect(scoreApi.getMyStats).toHaveBeenCalledExactlyOnceWith("tr");
  expect(region.querySelectorAll(".gd-count")[1].textContent).toBe("2");
});
it("ignores a late response for the previous selected language", async () => {
  let resolve!: (stats: UserStats) => void;
  vi.mocked(scoreApi.getMyStats).mockImplementation((lang) =>
    lang === "en"
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve(statsFixture("tr")),
  );
  const view = render(<DailyResultStats language="en" gameId="fixture-game" />);
  view.rerender(<DailyResultStats language="tr" gameId="fixture-game" />);
  await screen.findByText("profile.guessDistribution");
  await act(async () => resolve(statsFixture("en")));
  expect(screen.getByRole("region").textContent).toContain(
    "profile.currentStreak: 0",
  );
});
it("retries unavailable stats independently of the already saved game result", async () => {
  vi.mocked(scoreApi.getMyStats).mockRejectedValueOnce(new Error("offline"));
  render(<DailyResultStats language="en" gameId="fixture-game" />);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByText("daily.retryStatus"));
  await screen.findByText("profile.guessDistribution");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(scoreApi.getMyStats).toHaveBeenCalledTimes(2);
});
