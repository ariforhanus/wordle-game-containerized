import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { dailyGameApi, type DailyGameStatus } from "@wordle/api";
import DailyCountdown from "./DailyCountdown";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@wordle/api", () => ({ dailyGameApi: { status: vi.fn(), start: vi.fn() } }));
// Named deterministic fixture; device time must not drive the server calendar.
const DAY = "2024-01-15";
const calendar: DailyGameStatus = { state: "finished", game: null, date: DAY, timeZone: "Europe/Istanbul", serverNow: `${DAY}T20:59:50Z`, nextGameAt: `${DAY}T21:00:00Z` };
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); vi.mocked(dailyGameApi.status).mockResolvedValue(calendar); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function mount(onCheckToday = vi.fn()) {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<DailyCountdown language="en" gameDate={DAY} onCheckToday={onCheckToday} />); });
  return view;
}
it("counts from server time despite device-clock changes and never automatically starts", async () => {
  const check = vi.fn();
  await mount(check);
  expect(screen.getByRole("timer").textContent).toBe("00:00:10");
  vi.setSystemTime(new Date("2030-01-01T00:00:00Z"));
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole("timer").textContent).toBe("00:00:08");
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.queryByRole("timer")).toBeNull();
  expect(check).not.toHaveBeenCalled();
  expect(dailyGameApi.start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("daily.nextGameCheck"));
  expect(check).toHaveBeenCalledTimes(1);
});
it("offers a read-only check immediately when the server day is later than the saved result", async () => {
  vi.mocked(dailyGameApi.status).mockResolvedValue({ ...calendar, date: "2024-01-16", serverNow: "2024-01-15T21:00:01Z", nextGameAt: "2024-01-16T21:00:00Z" });
  await mount();
  expect(screen.getByText("daily.nextGameCheck")).toBeTruthy();
  expect(dailyGameApi.start).not.toHaveBeenCalled();
});
it("retries failures without hiding the saved result and supports a 25-hour server day", async () => {
  vi.mocked(dailyGameApi.status).mockRejectedValueOnce(new Error("offline"));
  await mount();
  expect(screen.getByRole("alert")).toBeTruthy();
  const serverNow = new Date(calendar.serverNow!);
  vi.mocked(dailyGameApi.status).mockResolvedValue({ ...calendar, nextGameAt: new Date(serverNow.getTime() + 25 * 3600000).toISOString() });
  await act(async () => fireEvent.click(screen.getByText("daily.retryStatus")));
  expect(screen.getByRole("timer").textContent).toBe("25:00:00");
});
it("fails closed with missing or invalid server calendar metadata", async () => {
  vi.mocked(dailyGameApi.status).mockResolvedValue({ ...calendar, serverNow: undefined });
  await mount();
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText("daily.nextGameCheck")).toBeNull();
  vi.mocked(dailyGameApi.status).mockResolvedValue({ ...calendar, nextGameAt: calendar.serverNow });
  await act(async () => fireEvent.click(screen.getByText("daily.retryStatus")));
  expect(screen.getByRole("alert")).toBeTruthy();
});
it("resynchronizes after returning to the page without starting another game", async () => {
  await mount();
  vi.mocked(dailyGameApi.status).mockResolvedValue({ ...calendar, date: "2024-01-16" });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(dailyGameApi.status).toHaveBeenCalledTimes(2);
  expect(screen.getByText("daily.nextGameCheck")).toBeTruthy();
  expect(dailyGameApi.start).not.toHaveBeenCalled();
});
it("ignores late previous-language responses and cancels timers on unmount", async () => {
  let resolve!: (value: DailyGameStatus) => void;
  vi.mocked(dailyGameApi.status).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const view = await mount();
  await act(async () => view.rerender(<DailyCountdown language="tr" gameDate={DAY} onCheckToday={vi.fn()} />));
  expect(screen.getByRole("timer").textContent).toBe("00:00:10");
  await act(async () => resolve({ ...calendar, date: "2024-01-16" }));
  expect(screen.getByRole("timer").textContent).toBe("00:00:10");
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
