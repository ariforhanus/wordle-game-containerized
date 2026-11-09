import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { authApi, scoreApi, type UserStats } from "@wordle/api";
import { statsFixture } from "../../tests/fixtures/stats";
import UserPage from "./UserPage";
import { ToastProvider } from "./Toast";
const locale = vi.hoisted(() => ({ language: "en" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, args?: { lang?: string }) =>
      args?.lang ? key + ":" + args.lang : key,
    i18n: locale,
  }),
}));
vi.mock("@wordle/api", async (original) => ({
  ...(await original<typeof import("@wordle/api")>()),
  isAuthenticated: () => true,
  authApi: { getMe: vi.fn() },
  scoreApi: { getMyStats: vi.fn() },
}));
function tree() {
  return (
    <MemoryRouter>
      <ToastProvider>
        <UserPage />
      </ToastProvider>
    </MemoryRouter>
  );
}
function value(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent;
}
beforeEach(() => {
  vi.resetAllMocks();
  locale.language = "en";
  vi.mocked(authApi.getMe).mockResolvedValue({
    username: "collector",
    email: "fixture@example.test",
    role: "USER",
    emailVerified: true,
  });
  vi.mocked(scoreApi.getMyStats).mockImplementation((lang) =>
    Promise.resolve(statsFixture(lang)),
  );
});
afterEach(cleanup);
it("reloads profile streaks for the selected language while preserving the overall score cards", async () => {
  const view = render(tree());
  await screen.findByText("profile.statisticsScope:EN");
  expect(value("profile.currentStreak")).toBe("3");
  expect(value("profile.bestStreak")).toBe("3");
  locale.language = "tr";
  view.rerender(tree());
  await screen.findByText("profile.statisticsScope:TR");
  expect(value("profile.currentStreak")).toBe("0");
  expect(value("profile.bestStreak")).toBe("2");
  expect(value("profile.bestScore")).toBe("9999");
  expect(scoreApi.getMyStats).toHaveBeenNthCalledWith(1, "en");
  expect(scoreApi.getMyStats).toHaveBeenNthCalledWith(2, "tr");
});
it("does not apply a late previous-language response", async () => {
  let resolve!: (stats: UserStats) => void;
  vi.mocked(scoreApi.getMyStats).mockImplementation((lang) =>
    lang === "en"
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve(statsFixture("tr")),
  );
  const view = render(tree());
  await waitFor(() => expect(scoreApi.getMyStats).toHaveBeenCalledWith("en"));
  locale.language = "tr";
  view.rerender(tree());
  await screen.findByText("profile.statisticsScope:TR");
  await act(async () => resolve(statsFixture("en")));
  expect(value("profile.currentStreak")).toBe("0");
});
it("does not label stale English stats as Turkish when the Turkish request fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const view = render(tree());
    await screen.findByText("profile.statisticsScope:EN");
    vi.mocked(scoreApi.getMyStats).mockRejectedValueOnce(new Error("offline"));
    locale.language = "tr";
    view.rerender(tree());
    await screen.findByText("profile.noStats");
    expect(screen.queryByText("profile.currentStreak")).toBeNull();
  } finally {
    log.mockRestore();
  }
});
