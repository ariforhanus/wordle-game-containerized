import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
async function register(page: import("@playwright/test").Page) {
  const suffix = Date.now().toString() + Math.floor(Math.random() * 1000);
  await page.goto("/register");
  await page.locator("#reg-username").fill("test_" + suffix);
  await page.locator("#reg-email").fill("test_" + suffix + "@example.com");
  await page.locator("#reg-password").fill("browser-password-123");
  await page.locator("#reg-confirm").fill("browser-password-123");
  await page.locator("#reg-country").selectOption({ index: 1 });
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);
}
async function secondSession(
  page: import("@playwright/test").Page,
  browser: import("@playwright/test").Browser,
) {
  const token = await page.evaluate(() => localStorage.getItem("jwtToken"));
  const profile = await page
    .context()
    .request.get("/api/v1/auth/me", {
      headers: { Authorization: "Bearer " + token },
    });
  expect(profile.status()).toBe(200);
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
    serviceWorkers: "block",
  });
  try {
    const login = await context.request.post("/api/v1/auth/login", {
      data: {
        username: (await profile.json()).username,
        password: "browser-password-123",
      },
    });
    expect(login.status()).toBe(200);
    const sessionToken = String((await login.json()).token);
    await context.addInitScript(
      (token) => localStorage.setItem("jwtToken", token),
      sessionToken,
    );
    return { context, token: sessionToken };
  } catch (error) {
    await context.close();
    throw error;
  }
}

test("daily visits, reloads, language changes and status reads do not start the timer", async ({
  page,
}) => {
  await register(page);
  const starts: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/daily/games"
    )
      starts.push(request.url());
  });
  for (const language of ["en", "tr", "en"]) {
    await page.evaluate(
      (language) => localStorage.setItem("wordle_lang", language),
      language,
    );
    await page.goto("/daily");
    await expect(page.locator(".daily-start-card button")).toBeEnabled();
    const status = await page.evaluate(async (language) => {
      const response = await fetch("/api/v1/daily/status?lang=" + language, {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("jwtToken"),
        },
      });
      return { status: response.status, body: await response.json() };
    }, language);
    expect(status).toEqual({ status: 200, body: { played: false } });
    await page.reload();
    await expect(page.locator(".daily-start-card button")).toBeEnabled();
    await expect(page.locator(".board")).toHaveCount(0);
    await expect(page.locator("#daily-timer-rule")).toContainText(
      language === "tr"
        ? "Süre, Başlat'a bastığında başlar"
        : "The timer starts when you press Start",
    );
    expect(starts).toHaveLength(0);
  }
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/daily/games",
  );
  await page.locator(".daily-start-card button").press("Enter");
  const response = await started;
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    language: "en",
    status: "playing",
    guesses: [],
    answer: null,
  });
  await expect(page.locator(".board")).toBeVisible();
  expect(starts).toHaveLength(1);
});

test("daily timer includes time with the page closed and resumes in a fresh browser context", async ({
  page,
  context,
  browser,
}) => {
  await register(page);
  await page.goto("/daily");
  const startResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/daily/games",
  );
  await page.locator(".daily-start-card button").click();
  const started = await (await startResponse).json();
  await expect(page.locator(".board")).toBeVisible();
  const storageState = await context.storageState();
  await context.setOffline(true);
  await page.close();
  // A real no-page/no-network interval verifies server time, without browser clock mocking.
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const reopened = await browser.newContext({ storageState });
  try {
    const resumedStarts: string[] = [];
    reopened.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/daily/games"
      )
        resumedStarts.push(request.url());
    });
    const nextPage = await reopened.newPage();
    await nextPage.goto("/daily");
    await expect(
      nextPage.getByRole("button", {
        name: "Resume today's game",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(nextPage.locator("#daily-timer-rule")).toContainText(
      "without resetting the timer",
    );
    const resumeResponse = nextPage.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname ===
          "/api/v1/daily/games/" + started.id,
    );
    await nextPage.locator(".daily-start-card button").click();
    const resumed = await (await resumeResponse).json();
    expect(resumed.id).toBe(started.id);
    expect(resumed.elapsedMs - started.elapsedMs).toBeGreaterThanOrEqual(2000);
    expect(resumed.guesses).toEqual(started.guesses);
    await expect(nextPage.locator(".board")).toBeVisible();
    // The displayed timer must use the resumed server baseline, then continue ticking.
    await expect
      .poll(async () => {
        const text = await nextPage.locator(".daily-timer").innerText();
        const [minutes, seconds] = text.split(":").map(Number);
        return minutes * 60 + seconds;
      })
      .toBeGreaterThanOrEqual(Math.floor(resumed.elapsedMs / 1000));
    expect(resumedStarts).toHaveLength(0);
    const token = await nextPage.evaluate(() =>
      localStorage.getItem("jwtToken"),
    );
    const repeated = await reopened.request.post(
      "/api/v1/daily/games?lang=en",
      { headers: { Authorization: "Bearer " + token } },
    );
    expect(repeated.status()).toBe(200);
    const retried = await repeated.json();
    expect(retried.id).toBe(started.id);
    expect(retried.elapsedMs).toBeGreaterThanOrEqual(resumed.elapsedMs);
  } finally {
    await reopened.close();
  }
});

test.describe("status-error recovery", () => {
  // WebKit cannot reliably intercept API requests through an active service worker.
  // Separate production-worker tests and the real Start/Resume scenarios keep workers enabled.
  test.use({ serviceWorkers: "block" });
  test("daily status failure offers a read retry without starting a game", async ({
    page,
    context,
  }) => {
    await register(page);
    let starts = 0;
    context.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/daily/games"
      )
        starts++;
    });
    await context.route("**/api/v1/daily/games?lang=*", async (route) => {
      if (route.request().method() === "GET")
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: '{"error":"fixture_unavailable"}',
        });
      else await route.continue();
    });
    await page.goto("/daily");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start today's game", exact: true }),
    ).toHaveCount(0);
    expect(starts).toBe(0);
    await context.unroute("**/api/v1/daily/games?lang=*");
    await page
      .getByRole("button", { name: "Check again", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Start today's game", exact: true }),
    ).toBeEnabled();
    await expect(page.locator("#daily-timer-rule")).toContainText(
      "Time affects your score",
    );
    expect(starts).toBe(0);
  });
});

test("login page supports labels and browser zoom", async ({ page }) => {
  await page.goto("/login");
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    ),
  ).toEqual([]);
  expect(
    await page.locator('meta[name="viewport"]').getAttribute("content"),
  ).not.toContain("user-scalable=no");
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
});
test.describe("network-response recovery", () => {
  // Playwright cannot reliably route requests through active service workers in every engine.
  // Worker cache behavior has separate built-artifact and offline-browser tests below.
  test.use({ serviceWorkers: "block" });
  test("daily turns survive a lost response, reload, and another tab", async ({
    page,
    context,
  }) => {
    await register(page);
    await page.goto("/daily");
    await page.locator(".daily-start-card button").click();
    await expect(page.locator(".board")).toBeVisible();
    const start = await page.evaluate(async () => {
      const r = await fetch("/api/v1/daily/games?lang=en", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + localStorage.getItem("jwtToken"),
        },
      });
      return r.json();
    });
    expect(start.answer).toBeNull();
    let failed = false;
    await context.route("**/daily/games/*/guesses", async (route) => {
      if (!failed) {
        failed = true;
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    // Use on-screen keys too, so the same test exercises the mobile layout.
    for (const letter of "APPLE")
      await page
        .locator(".keyboard")
        .getByRole("button", { name: letter, exact: true })
        .click();
    await page
      .locator(".keyboard")
      .getByRole("button", { name: "ENTER", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Retry guess" }).click();
    await expect(page.locator(".board-row").first()).toHaveText("APPLE");
    await page.reload();
    await page.locator(".daily-start-card button").click();
    await expect(page.locator(".board-row").first()).toHaveText("APPLE");
    const tab = await context.newPage();
    await tab.goto("/daily");
    await tab.locator(".daily-start-card button").click();
    await expect(tab.locator(".board-row").first()).toHaveText("APPLE");
    const result = await page.evaluate(async () => {
      const r = await fetch("/api/v1/auth/me", {
        headers: {
          Authorization: "Bearer " + localStorage.getItem("jwtToken"),
        },
      });
      return r.headers.get("Cache-Control");
    });
    expect(result).toBe("no-store");
  });
});
test.describe("concurrent-session recovery", () => {
  test.use({ serviceWorkers: "block" });
  test("stale Start screens and a lost Start response converge on one game", async ({
    page,
    context,
    browser,
  }) => {
    await register(page);
    await page.goto("/daily");
    await expect(
      page.getByRole("button", { name: "Start today's game", exact: true }),
    ).toBeEnabled();
    const other = await secondSession(page, browser);
    try {
      const tab = await other.context.newPage();
      await tab.goto("/daily");
      await expect(
        tab.getByRole("button", { name: "Start today's game", exact: true }),
      ).toBeEnabled();
      let committed: import("@wordle/api").DailyGame | undefined;
      await context.route("**/api/v1/daily/games?lang=en", async (route) => {
        if (route.request().method() !== "POST" || committed)
          return route.continue();
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        committed = await response.json();
        await route.abort("failed");
      });
      const otherStart = tab.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/v1/daily/games",
      );
      await Promise.all([
        page
          .getByRole("button", { name: "Start today's game", exact: true })
          .click(),
        tab
          .getByRole("button", { name: "Start today's game", exact: true })
          .click(),
      ]);
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(tab.locator(".board")).toBeVisible();
      const started = await (await otherStart).json();
      expect(started.id).toBe(committed!.id);
      const retry = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/v1/daily/games",
      );
      await page
        .getByRole("button", { name: "Start today's game", exact: true })
        .click();
      const resumed = await (await retry).json();
      expect(resumed.id).toBe(started.id);
      expect(resumed.elapsedMs).toBeGreaterThanOrEqual(committed!.elapsedMs);
      await expect(page.locator(".board")).toBeVisible();
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Resume today's game", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Resume today's game", exact: true })
        .click();
      await expect(page.locator(".board")).toBeVisible();
    } finally {
      await other.context.close();
    }
  });

  test("duplicate turns from another login and a lost final response keep one score", async ({
    page,
    context,
    browser,
  }) => {
    await register(page);
    await page.goto("/daily");
    await page.locator(".daily-start-card button").click();
    await expect(page.locator(".board")).toBeVisible();
    const other = await secondSession(page, browser);
    try {
      let terminal: import("@wordle/api").DailyGame | undefined;
      await context.route("**/daily/games/*/guesses", async (route) => {
        const [first, duplicate] = await Promise.all([
          route.fetch(),
          other.context.request.post(route.request().url(), {
            headers: { Authorization: "Bearer " + other.token },
            data: route.request().postDataJSON(),
          }),
        ]);
        expect(first.status()).toBe(200);
        expect(duplicate.status()).toBe(200);
        const accepted = await first.json();
        const repeated = await duplicate.json();
        expect(repeated.id).toBe(accepted.id);
        expect(repeated.guesses).toEqual(accepted.guesses);
        expect(repeated.status).toBe(accepted.status);
        if (accepted.status !== "playing" && !terminal) {
          terminal = accepted;
          expect(repeated).toEqual(accepted);
          await route.abort("failed");
        } else await route.fulfill({ response: first });
      });
      for (const word of [
        "APPLE",
        "CIGAR",
        "REBUT",
        "SISSY",
        "HUMPH",
        "AWAKE",
      ]) {
        await page.keyboard.type(word);
        await page
          .locator(".keyboard")
          .getByRole("button", { name: "ENTER", exact: true })
          .click();
        // A settled UI enables ENTER again, or exposes Retry after the committed final response was lost.
        await expect
          .poll(async () =>
            terminal
              ? "finished"
              : (await page
                    .locator(".keyboard")
                    .getByRole("button", { name: "ENTER", exact: true })
                    .isEnabled())
                ? "ready"
                : "busy",
          )
          .not.toBe("busy");
        if (terminal) break;
      }
      expect(terminal).toBeTruthy();
      await expect(page.getByRole("alert")).toBeVisible();
      await context.unroute("**/daily/games/*/guesses");
      await page
        .getByRole("button", { name: "Retry guess", exact: true })
        .click();
      await expect(page.locator(".result-card")).toContainText(
        terminal!.answer!,
      );
      await expect(page.locator(".result-card")).toContainText(
        String(terminal!.score),
      );
      const replay = await other.context.request.post(
        `/api/v1/daily/games/${terminal!.id}/guesses`,
        {
          headers: { Authorization: "Bearer " + other.token },
          data: {
            guess: terminal!.guesses.at(-1)!.guess,
            attempt: terminal!.guesses.length,
          },
        },
      );
      expect(replay.status()).toBe(200);
      expect(await replay.json()).toEqual(terminal);
      const stats = await other.context.request.get("/api/v1/stats/me", {
        headers: { Authorization: "Bearer " + other.token },
      });
      expect(stats.status()).toBe(200);
      expect((await stats.json()).totalGames).toBe(1);
    } finally {
      await other.context.close();
    }
  });
});

test("revoking all sessions forces a fresh login", async ({
  page,
  context,
}) => {
  await register(page);
  const token = await page.evaluate(() => localStorage.getItem("jwtToken"));
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out of all devices" }).click();
  await expect(page).toHaveURL(/\/login$/);
  const response = await context.request.get("/api/v1/auth/me", {
    headers: { Authorization: "Bearer " + token },
  });
  expect(response.status()).toBe(401);
});

test("verification and password reset use single-use email links", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.E2E_SMTP_CAPTURE_URL,
    "Requires the local SMTP capture fixture",
  );
  await register(page);
  const oldToken = await page.evaluate(() => localStorage.getItem("jwtToken"));
  const profile = await context.request.get("/api/v1/auth/me", {
    headers: { Authorization: "Bearer " + oldToken },
  });
  const email = (await profile.json()).email;
  async function emailLink(kind: string) {
    let link = "";
    await expect
      .poll(async () => {
        const response = await context.request.get(
          process.env.E2E_SMTP_CAPTURE_URL!,
        );
        const messages = await response.json();
        const message = messages
          .filter(
            (m: { to: string; body: string }) =>
              m.to === email && m.body.includes("/" + kind),
          )
          .at(-1);
        link =
          message?.body.match(
            new RegExp("https?://[^\\s]+/" + kind + "#token=[A-Za-z0-9_-]+"),
          )?.[0] ?? "";
        if (link)
          expect(new URL(link).origin).toBe(
            new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000").origin,
          );
        return !!link;
      })
      .toBeTruthy();
    return link;
  }
  await page.goto("/account");
  await page.getByRole("button", { name: "Send verification email" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.goto(await emailLink("verify-email"));
  await page
    .getByRole("heading", { name: "Verify email", exact: true })
    .waitFor();
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const reset = await emailLink("reset-password");
  await page.goto(reset);
  await page.locator("#new-password").fill("replacement-password-123");
  await page.locator("#confirm-password").fill("replacement-password-123");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(
    (
      await context.request.get("/api/v1/auth/me", {
        headers: { Authorization: "Bearer " + oldToken },
      })
    ).status(),
  ).toBe(401);
  const raw = new URL(reset).hash.slice("#token=".length);
  expect(
    (
      await context.request.post("/api/v1/account/reset-password", {
        data: { token: raw, password: "replacement-password-123" },
      })
    ).status(),
  ).toBe(400);
});

test("Turkish daily guesses survive reload with locale-specific letters", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => localStorage.setItem("wordle_lang", "tr"));
  await register(page);
  await page.goto("/daily");
  await page.locator(".daily-start-card button").click();
  await expect(page.locator(".board")).toBeVisible();
  await page.keyboard.type("incir");
  await page
    .locator(".keyboard")
    .getByRole("button", { name: "ENTER", exact: true })
    .click();
  await expect(page.locator(".board-row").first()).toHaveText("İNCİR");
  await page.reload();
  await expect(page.locator(".daily-start-card button")).toBeEnabled();
  await expect(page.locator("#daily-timer-rule")).toContainText(
    /süre sıfırlanmaz|süre ve puan değişmez/,
  );
  await page.locator(".daily-start-card button").click();
  await expect(page.locator(".board-row").first()).toHaveText("İNCİR");
});

test("production Nginx serves security headers and a non-cacheable worker", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.E2E_PRODUCTION,
    "Requires the built frontend served by production Nginx",
  );
  const response = await context.request.get("/login");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-security-policy"]).toContain(
    "object-src 'none'",
  );
  const script = await context.request.get("/sw.js");
  expect(script.status()).toBe(200);
  expect(script.headers()["cache-control"]).toContain("no-cache");
  await page.goto("/login");
  expect(await page.locator("h1").textContent()).toBeTruthy();
});

test("production offline practice keeps every API response out of caches", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.E2E_PRODUCTION,
    "Requires production service-worker registration",
  );
  await page.goto("/game");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.locator(".board")).toBeVisible({ timeout: 20000 });
  const urls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        urls.push(request.url);
    return urls;
  });
  expect(urls.length).toBeGreaterThan(3);
  expect(urls.some((url) => new URL(url).pathname.startsWith("/api/"))).toBe(
    false,
  );
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".board")).toBeVisible();
  expect(
    await page.evaluate(() =>
      fetch("/api/v1/auth/me")
        .then(() => false)
        .catch(() => true),
    ),
  ).toBe(true);
});

test("completed daily games offer a read-only result instead of Start or Resume", async ({
  page,
  context,
}) => {
  await register(page);
  await page.goto("/daily");
  const startResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/daily/games",
  );
  await page.locator(".daily-start-card button").click();
  let saved = await (await startResponse).json();
  const token = await page.evaluate(() => localStorage.getItem("jwtToken"));
  const words = ["APPLE", "CIGAR", "REBUT", "SISSY", "HUMPH", "AWAKE"];
  for (
    let index = 0;
    index < words.length && saved.status === "playing";
    index++
  ) {
    const response = await context.request.post(
      `/api/v1/daily/games/${saved.id}/guesses`,
      {
        headers: { Authorization: "Bearer " + token },
        data: { guess: words[index], attempt: index + 1 },
      },
    );
    expect(response.status()).toBe(200);
    saved = await response.json();
  }
  expect(saved.status).not.toBe("playing");
  let starts = 0;
  context.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/daily/games"
    )
      starts++;
  });
  await page.reload();
  const resultButton = page.getByRole("button", {
    name: "View today's result",
    exact: true,
  });
  await expect(resultButton).toBeEnabled();
  await expect(page.locator("#daily-timer-rule")).toContainText(
    "timer and score will not change",
  );
  await resultButton.click();
  await expect(page.locator(".result-card")).toContainText(saved.answer);
  await expect(page.locator(".result-card")).toContainText(String(saved.score));
  expect(starts).toBe(0);
});
