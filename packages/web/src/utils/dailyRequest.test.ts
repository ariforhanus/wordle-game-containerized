import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { dailyGameApi, get, ApiError } from "@wordle/api";
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each(["guess", "start", "status", "load"])("bounds a stalled daily %s request without retrying", async (operation) => {
  let signal: AbortSignal | undefined;
  const fetcher = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    signal = init?.signal ?? undefined;
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  vi.stubGlobal("fetch", fetcher);
  const promise = operation === "guess" ? dailyGameApi.guess("game", "APPLE", 1) : operation === "start" ? dailyGameApi.start("en") : operation === "load" ? dailyGameApi.load("game") : dailyGameApi.status("en");
  const outcome = promise.catch((error) => error);
  await vi.advanceTimersByTimeAsync(14999);
  expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect((await outcome).name).toBe("AbortError");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it("clears deadlines after success and controlled HTTP failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}"))
    .mockResolvedValueOnce(new Response('{"error":"turn_conflict"}', { status: 409 })));
  await dailyGameApi.status("en");
  expect(vi.getTimerCount()).toBe(0);
  await expect(dailyGameApi.guess("game", "APPLE", 1)).rejects.toBeInstanceOf(ApiError);
  expect(vi.getTimerCount()).toBe(0);
});
it("does not add a deadline to unrelated API calls", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  await get("/unrelated");
  expect(fetcher.mock.calls[0][1].signal).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});
