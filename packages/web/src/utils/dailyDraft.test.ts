import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { DailyGame } from "@wordle/api";
import { restoreDailyDraft, saveDailyDraft } from "./dailyDraft";
const game: DailyGame = { id: "draft-fixture", date: "2024-01-15", language: "en", status: "playing", elapsedMs: 0, guesses: [], answer: null, score: null };
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());
it("restores only matching owned game/date/language input, not an API response or answer", () => {
  saveDailyDraft(game, "APP", false);
  expect(restoreDailyDraft(game)).toEqual({ guess: "APP", pending: false });
  const record = JSON.parse(sessionStorage.getItem("wordle_daily_draft_en")!);
  expect(record.answer).toBeUndefined();
  expect(record.elapsedMs).toBeUndefined();
  expect(restoreDailyDraft({ ...game, id: "another-account-game" }).guess).toBe("");
  saveDailyDraft(game, "APP", false);
  expect(restoreDailyDraft({ ...game, date: "2024-01-16" }).guess).toBe("");
});
it("isolates languages and preserves Turkish letters", () => {
  saveDailyDraft(game, "APP", false);
  const turkish = { ...game, id: "turkish-game", language: "tr" };
  saveDailyDraft(turkish, "İNCİR", true);
  expect(restoreDailyDraft(turkish)).toEqual({ guess: "İNCİR", pending: true });
  expect(restoreDailyDraft(game).guess).toBe("APP");
});
it("clears an exact accepted pending turn instead of queueing it for the next turn", () => {
  saveDailyDraft(game, "APPLE", true);
  const updated = { ...game, guesses: [{ guess: "APPLE", statuses: Array(5).fill("absent") }] };
  expect(restoreDailyDraft(updated)).toEqual({ guess: "", pending: false });
  expect(sessionStorage.getItem("wordle_daily_draft_en")).toBeNull();
});
it("retains text as an unsubmitted draft if another session played a different turn", () => {
  saveDailyDraft(game, "APPLE", true);
  const updated = { ...game, guesses: [{ guess: "CIGAR", statuses: Array(5).fill("absent") }] };
  expect(restoreDailyDraft(updated)).toEqual({ guess: "APPLE", pending: false });
});
it("clears drafts for completed games", () => {
  saveDailyDraft(game, "APPLE", true);
  expect(restoreDailyDraft({ ...game, status: "won", answer: "APPLE", score: 9000 }).guess).toBe("");
  expect(sessionStorage.getItem("wordle_daily_draft_en")).toBeNull();
});
it.each(["{", JSON.stringify({ gameId: game.id }), "x".repeat(513)])("ignores corrupt or oversized storage", (raw) => {
  sessionStorage.setItem("wordle_daily_draft_en", raw);
  expect(restoreDailyDraft(game)).toEqual({ guess: "", pending: false });
});
it("storage refusal does not break online play", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  expect(() => saveDailyDraft(game, "APPLE", true)).not.toThrow();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("disabled"); });
  expect(restoreDailyDraft(game).guess).toBe("");
});
