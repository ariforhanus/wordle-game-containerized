import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function worker() {
  const handlers = new Map<string, (event: any) => void>();
  const names = new Set([
    "api-cache",
    "wordle-static-obsolete",
    "workbox-precache-old",
    "unrelated-cache",
  ]);
  const stored: string[] = [];
  const fallback = new Response("offline application shell");
  const caches = {
    keys: vi.fn(async () => [...names]),
    delete: vi.fn(async (key: string) => names.delete(key)),
    open: vi.fn(async (key: string) => {
      names.add(key);
      return {
        addAll: vi.fn(async (files: string[]) => stored.push(...files)),
      };
    }),
    match: vi.fn(async () => fallback),
  };
  const fetch = vi.fn(async () => new Response("network"));
  const self = {
    location: new URL("https://wordle.example/sw.js"),
    addEventListener: (kind: string, handler: any) =>
      handlers.set(kind, handler),
    skipWaiting: vi.fn(async () => undefined),
    clients: { claim: vi.fn(async () => undefined) },
  };
  runInNewContext(
    readFileSync(new URL("../../dist/sw.js", import.meta.url), "utf8"),
    { self, caches, fetch, URL, Response },
  );
  return { handlers, caches, names, stored, fallback, fetch, self };
}
async function lifecycle(run: ReturnType<typeof worker>, event: string) {
  let pending: Promise<unknown> | undefined;
  run.handlers.get(event)!({
    waitUntil: (promise: Promise<unknown>) => {
      pending = promise;
    },
  });
  await pending;
}
describe("the built production service worker", () => {
  it("precaches only explicit public files", async () => {
    const run = worker();
    await lifecycle(run, "install");
    expect(run.stored).toContain("/");
    expect(run.stored).toContain("/words_tr_possible.txt");
    expect(run.stored.some((path) => path.startsWith("/api/"))).toBe(false);
    expect(run.stored.some((path) => path.endsWith(".js"))).toBe(true);
  });
  it("activation removes old versions and private API caches without deleting unrelated caches", async () => {
    const run = worker();
    await lifecycle(run, "install");
    await lifecycle(run, "activate");
    expect(run.names.has("api-cache")).toBe(false);
    expect(run.names.has("wordle-static-obsolete")).toBe(false);
    expect(run.names.has("workbox-precache-old")).toBe(false);
    expect(run.names.has("unrelated-cache")).toBe(true);
    expect(
      [...run.names].filter((key) => key.startsWith("wordle-static-")),
    ).toHaveLength(1);
    expect(run.self.clients.claim).toHaveBeenCalledOnce();
  });
  it.each([
    ["GET", "https://wordle.example/api/v1/auth/me"],
    ["GET", "https://wordle.example/api/v1/daily/status?lang=tr"],
    ["POST", "https://wordle.example/api/v1/daily/games"],
    ["GET", "https://external.example/words_tr_possible.txt"],
    ["GET", "https://wordle.example/not-allowlisted.json"],
  ])("leaves %s %s to the browser without reading caches", (method, url) => {
    const run = worker();
    const respondWith = vi.fn();
    run.handlers.get("fetch")!({
      request: { method, url, mode: "cors" },
      respondWith,
    });
    expect(respondWith).not.toHaveBeenCalled();
    expect(run.caches.match).not.toHaveBeenCalled();
  });
  it("uses the static shell only when navigation fails offline", async () => {
    const run = worker();
    run.fetch.mockRejectedValue(new TypeError("offline"));
    let response: Promise<Response> | undefined;
    run.handlers.get("fetch")!({
      request: {
        method: "GET",
        url: "https://wordle.example/game",
        mode: "navigate",
      },
      respondWith: (pending: Promise<Response>) => {
        response = pending;
      },
    });
    expect(await (await response!).text()).toBe("offline application shell");
    expect(run.caches.match).toHaveBeenCalledWith("/");
  });
});
