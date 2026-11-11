import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ToastProvider } from "./Toast";
import ThemedGamePage from "./ThemedGamePage";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "tr" } }) }));
const fetcher = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ words: ["STARK"] }) });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function mount() {
  return render(<MemoryRouter initialEntries={["/themes/marvel"]}><ToastProvider><Routes>
    <Route path="/themes/:themeId" element={<ThemedGamePage />} />
  </Routes></ToastProvider></MemoryRouter>);
}
it("resets an identical next answer and manages modal focus/Tab without changing the English theme keyboard", async () => {
  vi.useFakeTimers();
  let view!: ReturnType<typeof mount>;
  await act(async () => { view = mount(); });
  expect(screen.queryByRole("button", { name: "Ğ", exact: true })).toBeNull();
  for (const key of "stark") fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => vi.advanceTimersByTime(300));
  const dialog = screen.getByRole("dialog", { name: "game.word" });
  const share = screen.getByRole("button", { name: "game.share" });
  expect(document.activeElement).toBe(share);
  const again = screen.getByRole("button", { name: "themes.playAgain" });
  fireEvent.click(again);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(view.container.querySelector(".board-row")?.textContent).toBe("");
  expect(dialog.isConnected).toBe(false);
  for (const key of "stark") fireEvent.keyDown(window, { key });
  fireEvent.keyDown(window, { key: "Enter" });
  await act(async () => vi.advanceTimersByTime(300));
  expect(screen.getByRole("dialog", { name: "game.word" })).toBeTruthy();
});
it.each([{ words: [] }, { words: [null, 123, "BAD", "12345"] }])("shows a retry instead of an unplayable board for invalid/empty theme data", async (words) => {
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => words });
  mount();
  await screen.findByRole("alert");
  expect(screen.queryByRole("grid")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "themes.retry" }));
  await screen.findByRole("grid");
  expect(fetcher).toHaveBeenCalledTimes(2);
});
