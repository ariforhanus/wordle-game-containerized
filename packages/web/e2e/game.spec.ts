import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import en from "../../i18n/locales/en.json" with { type: "json" };
import tr from "../../i18n/locales/tr.json" with { type: "json" };

test.describe("auth throttle recovery", () => {
  test.use({ serviceWorkers: "block" });
  for (const language of ["en", "tr"] as const) {
    for (const mode of ["login", "register"] as const) {
      test(`${mode} explains 429 in ${language} and succeeds only after an explicit retry`, async ({ page }) => {
        let username = "throttle_" + Date.now() + Math.floor(Math.random() * 1000);
        if (mode === "login") {
          await register(page);
          const profile = await page.context().request.get("/api/v1/auth/me", {
            headers: { Authorization: "Bearer " + await page.evaluate(() => localStorage.getItem("jwtToken")) },
          });
          username = (await profile.json()).username;
          await page.evaluate(() => localStorage.removeItem("jwtToken"));
        }
        await page.goto(`/${mode}`);
        await page.evaluate((value) => localStorage.setItem("wordle_lang", value), language);
        await page.reload();
        let requests = 0;
        await page.route(`**/api/v1/auth/${mode}`, (route) => {
          requests++;
          if (requests > 1) return route.continue();
          return route.fulfill({ status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
            contentType: mode === "login" ? "application/json" : "text/html",
            body: mode === "login" ? '{"error":"rate_limited"}' : "<h1>Too Many Requests</h1>" });
        });
        const prefix = mode === "login" ? "login" : "reg";
        await page.locator(`#${prefix}-username`).fill(username);
        await page.locator(`#${prefix}-password`).fill("browser-password-123");
        if (mode === "register") {
          await page.locator("#reg-email").fill(username + "@example.test");
          await page.locator("#reg-confirm").fill("browser-password-123");
          await page.locator("#reg-country").selectOption({ index: 1 });
        }
        await page.locator('button[type="submit"]').click();
        await expect(page.getByRole("alert")).toHaveText((language === "en" ? en : tr).api.rate_limited);
        await expect(page.locator(`#${prefix}-username`)).toHaveValue(username);
        await expect(page.locator(`#${prefix}-password`)).toHaveValue("browser-password-123");
        expect(requests).toBe(1);
        expect(await page.evaluate(() => localStorage.getItem("jwtToken"))).toBeNull();
        await page.locator('button[type="submit"]').click();
        await expect(page).toHaveURL(/\/$/);
        expect(requests).toBe(2);
        expect(await page.evaluate(() => localStorage.getItem("jwtToken"))).toBeTruthy();
      });
    }
  }
});

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
  const profile = await page.context().request.get("/api/v1/auth/me", {
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

test.describe("account deletion and retention disclosure", () => {
  for (const language of ["en", "tr"] as const) {
    test(`explains retention before consent and revokes deleted-account sessions in ${language}`, async ({ page, browser }) => {
      await register(page);
      const token = await page.evaluate(() => localStorage.getItem("jwtToken"));
      const headers = { Authorization: "Bearer " + token };
      const profile = await page.context().request.get("/api/v1/auth/me", { headers });
      const username = (await profile.json()).username;
      const other = await secondSession(page, browser);
      try {
        const answers = await fixtureDailyWords(page.context());
        const start = await page.context().request.post("/api/v1/daily/games?lang=en", { headers });
        expect(start.status()).toBe(200);
        const game = await start.json();
        const win = await page.context().request.post(`/api/v1/daily/games/${game.id}/guesses`, {
          headers, data: { guess: answers.en.word, attempt: 1 },
        });
        expect(win.status()).toBe(200);
        expect((await win.json()).status).toBe("won");
        const unfinished = await page.context().request.post("/api/v1/daily/games?lang=tr", { headers });
        expect(unfinished.status()).toBe(200);
        await page.evaluate((value) => localStorage.setItem("wordle_lang", value), language);
        await page.goto("/account");
        const text = (language === "en" ? en : tr).account;
        await page.locator("summary").filter({ hasText: text.deleteTitle }).click();
        const consent = page.getByRole("checkbox", { name: text.deleteConfirm, exact: true });
        await expect(consent).toHaveAccessibleDescription(
          [text.deleteWarning, text.deleteSecurityRetention, text.deleteBackupRetention].join(" "),
        );
        const remove = page.getByRole("button", { name: text.deleteTitle, exact: true });
        await expect(remove).toBeDisabled();
        for (const theme of ["light", "dark"]) {
          await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
          const scan = await new AxeBuilder({ page }).include(".auth-card").withTags(["wcag2a", "wcag2aa"]).analyze();
          expect(scan.violations).toEqual([]);
        }
        await consent.check();
        await page.locator("#delete-password").fill("wrong-fixture-password");
        await remove.click();
        await expect(page.getByRole("alert")).toHaveText(text.failed);
        expect((await page.context().request.get("/api/v1/auth/me", { headers })).status()).toBe(200);
        await page.locator("#delete-password").fill("browser-password-123");
        await remove.click();
        await expect(page).toHaveURL(/\/login$/);
        expect(await page.evaluate(() => localStorage.getItem("jwtToken"))).toBeNull();
        expect((await page.context().request.get("/api/v1/auth/me", { headers })).status()).toBe(401);
        expect((await other.context.request.get("/api/v1/auth/me", { headers: { Authorization: "Bearer " + other.token } })).status()).toBe(401);
        expect((await page.context().request.post("/api/v1/auth/login", {
          data: { username, password: "browser-password-123" },
        })).status()).toBe(401);
      } finally { await other.context.close(); }
    });
  }
});

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
      await context.route("**/api/v1/daily/games?*", async (route) => {
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

test.describe("midnight rollover", () => {
  test.use({ serviceWorkers: "block" });
  test("a stale puzzle-day Start is rejected by the real server and needs a fresh click", async ({
    page,
    context,
  }) => {
    await register(page);
    let currentDate = "";
    let staleDate = "";
    let reads = 0;
    let starts = 0;
    await context.route("**/api/v1/daily/games?*", async (route) => {
      if (route.request().method() !== "GET") {
        starts++;
        return route.continue();
      }
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const status = await response.json();
      currentDate = status.date;
      reads++;
      if (reads === 1) {
        const previous = new Date(status.date + "T00:00:00Z");
        previous.setUTCDate(previous.getUTCDate() - 1);
        staleDate = previous.toISOString().slice(0, 10);
        // Replay the status a tab could have received before server midnight; POST stays real.
        await route.fulfill({ response, json: { ...status, date: staleDate } });
      } else await route.fulfill({ response });
    });
    await page.goto("/daily");
    await expect(
      page.getByRole("button", { name: "Start today's game", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByText(`Puzzle day: ${staleDate} (Europe/Istanbul)`, {
        exact: true,
      }),
    ).toBeVisible();
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/daily/games",
    );
    await page
      .getByRole("button", { name: "Start today's game", exact: true })
      .click();
    const error = await rejected;
    expect(error.status()).toBe(409);
    expect(await error.json()).toEqual({ error: "day_changed" });
    await expect(
      page.getByText(
        "The game day has changed. Unfinished games from previous days can no longer be played. Review today’s game and press Start when ready.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText(`Puzzle day: ${currentDate} (Europe/Istanbul)`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start today's game", exact: true }),
    ).toBeEnabled();
    expect(starts).toBe(1);
    await expect(page.locator(".board")).toHaveCount(0);
    const accepted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/v1/daily/games",
    );
    await page
      .getByRole("button", { name: "Start today's game", exact: true })
      .click();
    const response = await accepted;
    expect(response.status()).toBe(200);
    expect((await response.json()).date).toBe(currentDate);
    await expect(page.locator(".board")).toBeVisible();
    expect(starts).toBe(2);
  });
});

test("changing the browser clock cannot move an active game to another puzzle day", async ({
  page,
  context,
}) => {
  await register(page);
  await page.goto("/daily");
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/daily/games",
  );
  await page.locator(".daily-start-card button").click();
  const game = await (await started).json();
  await expect(page.locator(".board")).toBeVisible();
  await page.clock.setSystemTime(
    new Date(Date.parse(game.date + "T00:00:00Z") + 86400000 + 1000),
  );
  const response = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        `/api/v1/daily/games/${game.id}/guesses`,
  );
  await page.keyboard.type("apple");
  await page
    .locator(".keyboard")
    .getByRole("button", { name: "ENTER", exact: true })
    .click();
  const saved = await response;
  expect(saved.status()).toBe(200);
  expect(saved.request().postDataJSON()).toEqual({
    guess: "APPLE",
    attempt: 1,
  });
  const result = await saved.json();
  expect(result.id).toBe(game.id);
  expect(result.date).toBe(game.date);
  await expect(page.getByText(game.date, { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Finish before midnight in the game time zone. Unfinished games expire when the day changes and cannot be resumed. Each new day requires an explicit Start.",
      { exact: true },
    ),
  ).toBeVisible();
});

async function fixtureDailyWords(
  context: import("@playwright/test").BrowserContext,
) {
  const login = await context.request.post("/api/v1/auth/login", {
    data: {
      username: process.env.E2E_ADMIN_USERNAME,
      password: process.env.E2E_ADMIN_PASSWORD,
    },
  });
  expect(login.status()).toBe(200);
  const words = await context.request.get("/api/v1/admin/daily-word", {
    headers: { Authorization: "Bearer " + (await login.json()).token },
  });
  expect(words.status()).toBe(200);
  return words.json();
}

test("leaderboard distinguishes real daily scores from one-row period totals", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.E2E_ADMIN_USERNAME || !process.env.E2E_ADMIN_PASSWORD,
    "Requires the isolated E2E bootstrap administrator",
  );
  const answer = (await fixtureDailyWords(context)).en.word;
  expect(answer).toMatch(/^[A-Z]{5}$/);
  await register(page);
  await page.goto("/daily");
  await page.locator(".daily-start-card button").click();
  await expect(page.locator(".board")).toBeVisible();
  await page.keyboard.type(answer);
  await page
    .locator(".keyboard")
    .getByRole("button", { name: "ENTER", exact: true })
    .click();
  await expect(page.locator(".result-card")).toBeVisible();
  await page.goto("/leaderboard");
  await expect(
    page.getByRole("columnheader", { name: "Daily game score", exact: true }),
  ).toBeVisible();
  for (const [period, label] of [
    ["weekly", "Weekly"],
    ["monthly", "Monthly"],
  ]) {
    const loaded = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/leaderboard/" + period,
    );
    await page.getByRole("button", { name: label, exact: true }).click();
    const response = await loaded;
    expect(response.status()).toBe(200);
    const totals = await response.json();
    expect(totals.length).toBeGreaterThan(0);
    expect(
      new Set(totals.map((row: { userId: number }) => row.userId)).size,
    ).toBe(totals.length);
    await expect(
      page.getByRole("columnheader", { name: "Total points", exact: true }),
    ).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(totals.length);
    expect(await page.locator(".lb-score").allTextContents()).toEqual(
      totals.map((row: { totalScore: number }) => String(row.totalScore)),
    );
  }
});

test("language streaks stay independent in daily results and the profile", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.E2E_ADMIN_USERNAME || !process.env.E2E_ADMIN_PASSWORD,
    "Requires the isolated E2E bootstrap administrator",
  );
  const answers = await fixtureDailyWords(context);
  await register(page);
  await page.goto("/daily");
  await page.locator(".daily-start-card button").click();
  await expect(page.locator(".board")).toBeVisible();
  await page.keyboard.type(answers.en.word);
  await page
    .locator(".keyboard")
    .getByRole("button", { name: "ENTER", exact: true })
    .click();
  const english = page.getByRole("region", {
    name: "EN statistics",
    exact: true,
  });
  await expect(english).toContainText("Current Streak: 1");
  await expect(english).toContainText("Best Streak: 1");
  await page.evaluate(() => localStorage.setItem("wordle_lang", "tr"));
  await page.goto("/daily");
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/daily/games",
  );
  await page.locator(".daily-start-card button").click();
  const game = await (await started).json();
  const token = await page.evaluate(() => localStorage.getItem("jwtToken"));
  const wrong = answers.tr.word === "İNCİR" ? "ELMAS" : "İNCİR";
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await context.request.post(
      `/api/v1/daily/games/${game.id}/guesses`,
      {
        headers: { Authorization: "Bearer " + token },
        data: { guess: wrong, attempt },
      },
    );
    expect(response.status()).toBe(200);
  }
  await page.reload();
  await page.locator(".daily-start-card button").click();
  await expect(page.locator(".board")).toBeVisible();
  await page.keyboard.type(wrong === "İNCİR" ? "incir" : "elmas");
  await page
    .locator(".keyboard")
    .getByRole("button", { name: "ENTER", exact: true })
    .click();
  const turkish = page.getByRole("region", {
    name: "TR istatistikleri",
    exact: true,
  });
  await expect(turkish).toContainText("Mevcut Seri: 0");
  await expect(turkish).toContainText("En İyi Seri: 0");
  await page.goto("/profile");
  await expect(
    page
      .getByText("Mevcut Seri", { exact: true })
      .locator("..")
      .locator(".stat-value-g"),
  ).toHaveText("0");
  await page.evaluate(() => localStorage.setItem("wordle_lang", "en"));
  await page.goto("/profile");
  await expect(
    page
      .getByText("Current Streak", { exact: true })
      .locator("..")
      .locator(".stat-value-g"),
  ).toHaveText("1");
  await expect(
    page
      .getByText("Best Streak", { exact: true })
      .locator("..")
      .locator(".stat-value-g"),
  ).toHaveText("1");
});

test.describe("expired daily games", () => {
  test.use({ serviceWorkers: "block" });
  test("expired daily game returns to Start without starting automatically", async ({ page }) => {
    await register(page);
    let starts = 0;
    let expired = false;
    await page.route("**/api/v1/daily/games?*", async (route) => {
      if (route.request().method() === "POST") {
        starts++;
        return route.continue();
      }
      const response = await route.fetch();
      const status = await response.json();
      if (!expired) return route.fulfill({ response });
      const nextDay = new Date(status.date + "T12:00:00Z");
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      return route.fulfill({ response, json: { ...status, date: nextDay.toISOString().slice(0, 10), state: "not_started", game: null } });
    });
    await page.goto("/daily");
    await page.locator(".daily-start-card button").click();
    await expect(page.locator(".board")).toBeVisible();
    await page.route("**/api/v1/daily/games/*/guesses", async (route) => {
      expired = true;
      await route.fulfill({ status: 410, contentType: "application/json", body: JSON.stringify({ error: "game_expired" }) });
    });
    await page.keyboard.type("apple");
    await page.keyboard.press("Enter");
    await expect(page.locator(".daily-start-card")).toContainText("Unfinished games from previous days can no longer be played");
    await expect(page.getByRole("button", { name: "Start today's game", exact: true })).toBeEnabled();
    await expect(page.locator(".board")).toHaveCount(0);
    expect(starts).toBe(1);
  });
});

test.describe("daily result countdown", () => {
  test.use({ serviceWorkers: "block" });

  async function finishDaily(page: import("@playwright/test").Page) {
    await register(page);
    const answers = await fixtureDailyWords(page.context());
    await page.goto("/daily");
    const started = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/v1/daily/games");
    await page.locator(".daily-start-card button").click();
    const game = await (await started).json();
    const token = await page.evaluate(() => localStorage.getItem("jwtToken"));
    const finished = await page.context().request.post(`/api/v1/daily/games/${game.id}/guesses`, {
      headers: { Authorization: "Bearer " + token }, data: { guess: answers.en.word, attempt: 1 },
    });
    expect(finished.status()).toBe(200);
    expect((await finished.json()).status).toBe("won");
  }

  test("saved result shows the real server countdown independently of the device clock", async ({ page }) => {
    await finishDaily(page);
    await page.reload();
    await page.getByRole("button", { name: "View today's result", exact: true }).click();
    const timer = page.getByRole("timer", { name: "Next daily game" });
    await expect(timer).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(page.getByText("Game time zone: Europe/Istanbul", { exact: true })).toBeVisible();
    const first = await timer.textContent();
    await page.clock.setSystemTime(new Date("2030-01-01T00:00:00Z"));
    await expect(timer).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    const second = await timer.textContent();
    const seconds = (value: string) => value.split(":").reduce((total, part) => total * 60 + Number(part), 0);
    expect(Math.abs(seconds(first!) - seconds(second!))).toBeLessThan(5);
  });

  test("countdown rollover refreshes status only after a click and never auto-Starts", async ({ page }) => {
    await finishDaily(page);
    let starts = 0;
    let nextDay = false;
    await page.route("**/api/v1/daily/games?*", async (route) => {
      if (route.request().method() === "POST") { starts++; return route.continue(); }
      const response = await route.fetch();
      const status = await response.json();
      const boundary = Date.parse(status.nextGameAt);
      if (!nextDay) return route.fulfill({ response, json: { ...status, serverNow: new Date(boundary - 3000).toISOString() } });
      const date = new Date(status.date + "T12:00:00Z");
      date.setUTCDate(date.getUTCDate() + 1);
      return route.fulfill({ response, json: { ...status, date: date.toISOString().slice(0, 10), serverNow: new Date(boundary).toISOString(), nextGameAt: new Date(boundary + 86400000).toISOString(), state: "not_started", game: null } });
    });
    await page.reload();
    await page.getByRole("button", { name: "View today's result", exact: true }).click();
    await expect(page.getByRole("timer", { name: "Next daily game" })).toBeVisible();
    const check = page.getByRole("button", { name: "Check today’s game", exact: true });
    await expect(check).toBeVisible({ timeout: 10000 });
    expect(starts).toBe(0);
    nextDay = true;
    await check.click();
    await expect(page.getByRole("button", { name: "Start today's game", exact: true })).toBeEnabled();
    await expect(page.locator(".board")).toHaveCount(0);
    expect(starts).toBe(0);
  });
});

test("native language names persist and mode rules explain daily versus practice", async ({ page }, testInfo) => {
  await page.goto("/game");
  const mobile = await page.getByRole("button", { name: "Menu", exact: true }).isVisible();
  if (mobile) await page.getByRole("button", { name: "Menu", exact: true }).click();
  const language = page.locator(mobile ? "#mobile-nav-menu .language-select" : ".desktop-actions .language-select");
  await expect(language).toBeVisible();
  await expect(language.locator("option")).toHaveText(["English", "Türkçe"]);
  await language.selectOption("tr");
  expect(await page.evaluate(() => localStorage.getItem("wordle_lang"))).toBe("tr");
  if (mobile) await expect(page.getByRole("button", { name: "Menü", exact: true })).toHaveAttribute("aria-expanded", "false");
  const comparison = page.locator(".game-mode-info");
  await comparison.locator("summary").click();
  await expect(comparison).toContainText("Her dilde günde bir sıralamalı oyun");
  await expect(comparison).toContainText("ilk ziyaret bağlantı gerektirir");
  await page.reload();
  await expect(page.locator(".desktop-actions .language-select")).toHaveValue("tr");
  await page.locator(".game-mode-info summary").click();
  await page.screenshot({ path: testInfo.outputPath("language-mode-info.png"), fullPage: true, animations: "disabled" });
  if (mobile) {
    await page.getByRole("button", { name: "Menü", exact: true }).click();
    await expect(language).toBeVisible();
    await expect(language).toHaveValue("tr");
    await page.screenshot({ path: testInfo.outputPath("language-mobile-menu.png"), fullPage: true, animations: "disabled" });
    await language.selectOption("en");
  } else await language.selectOption("en");
  await expect(page.locator(".game-mode-info summary")).toHaveText("Daily or practice?");
  await register(page);
  await page.goto("/daily");
  await page.locator(".game-mode-info summary").click();
  await expect(page.locator(".game-mode-info")).toContainText("A connection is required to start and submit guesses");
  await expect(page.getByRole("button", { name: "Start today's game", exact: true })).toBeEnabled();
  await expect(page.locator(".board")).toHaveCount(0);
});

test.describe("daily reconnect and draft recovery", () => {
  test.use({ serviceWorkers: "block" });
  test("offline typing survives reconnect without an automatic guess", async ({ page, context }) => {
    await register(page);
    const answers = await fixtureDailyWords(context);
    const word = answers.en.word === "APPLE" ? "CIGAR" : "APPLE";
    let writes = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/daily\/games\/[^/]+\/guesses$/.test(new URL(request.url()).pathname)) writes++;
    });
    await page.goto("/daily");
    await page.locator(".daily-start-card button").click();
    await expect(page.locator(".board")).toBeVisible();
    await page.keyboard.type(word.slice(0, 2));
    await expect(page.locator(".board-row").first()).toHaveText(word.slice(0, 2));
    await context.setOffline(true);
    await expect(page.getByText("You are offline.", { exact: false })).toBeVisible();
    await page.keyboard.type(word.slice(2));
    await page.keyboard.press("Enter");
    await expect(page.locator(".board-row").first()).toHaveText(word);
    expect(writes).toBe(0);
    await context.setOffline(false);
    await expect(page.getByText("Saved game refreshed.", { exact: false })).toBeVisible();
    await expect(page.locator(".board-row").first()).toHaveText(word);
    expect(writes).toBe(0);
    const saved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/guesses"));
    await page.locator(".keyboard").getByRole("button", { name: "ENTER", exact: true }).click();
    expect((await (await saved).json()).guesses).toHaveLength(1);
    expect(writes).toBe(1);
    await context.setOffline(true);
    await context.setOffline(false);
    await expect(page.getByText("Saved game refreshed.", { exact: false })).toBeVisible();
    expect(writes).toBe(1);
  });

  test("a committed lost reply is reconciled on reload without resending the pending word", async ({ page, context }) => {
    await register(page);
    const answers = await fixtureDailyWords(context);
    const word = answers.en.word === "APPLE" ? "CIGAR" : "APPLE";
    let writes = 0;
    await context.route("**/daily/games/*/guesses", async (route) => {
      writes++;
      await route.fetch();
      await route.abort("failed");
    });
    await page.goto("/daily");
    await page.locator(".daily-start-card button").click();
    await expect(page.locator(".board")).toBeVisible();
    await page.keyboard.type(word);
    await page.keyboard.press("Enter");
    await expect(page.getByText("This guess has not been confirmed.", { exact: false })).toBeVisible();
    await page.keyboard.press("Backspace");
    await page.keyboard.type("z");
    await expect(page.locator(".board-row").first()).toHaveText(word);
    await page.reload();
    await page.locator(".daily-start-card button").click();
    await expect(page.locator(".board-row").first()).toHaveText(word);
    await expect(page.locator(".board-row").nth(1)).toHaveText("");
    await expect(page.getByText("This guess has not been confirmed.", { exact: false })).toHaveCount(0);
    expect(writes).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem("wordle_daily_draft_en"))).toBeNull();
  });
});

test.describe("game accessibility", () => {
  test.use({ reducedMotion: "reduce", serviceWorkers: "block" });
  async function practice(page: import("@playwright/test").Page) {
    await page.route("**/api/v1/word/random?*", (route) => route.fulfill({ json: { word: "APPLE", definition: "Practice fixture" } }));
    await page.goto("/game");
    await expect(page.locator(".board")).toBeVisible();
  }
  test("feedback has symbols and descriptions, motion is reduced and help owns keyboard focus", async ({ page }) => {
    await practice(page);
    const help = page.getByRole("button", { name: "How To Play", exact: true });
    await help.click();
    const dialog = page.getByRole("dialog", { name: "How To Play", exact: true });
    const close = dialog.getByRole("button", { name: "Got it!", exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.type("apple");
    await expect(page.locator(".board-row").first()).toHaveText("");
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(help).toBeFocused();
    await page.keyboard.type("alley");
    await expect(page.locator(".board")).toBeFocused();
    await page.keyboard.press("Enter");
    const correct = page.getByRole("gridcell", { name: "A: correct position", exact: true });
    await expect(correct).toHaveAttribute("data-feedback-symbol", "✓");
    await expect(page.getByRole("gridcell", { name: "L: in the word, different position", exact: true })).toHaveAttribute("data-feedback-symbol", "•");
    await expect(page.getByRole("gridcell", { name: "L: not in the word", exact: true })).toHaveAttribute("data-feedback-symbol", "×");
    await expect(page.locator(".cell-reveal")).toHaveCount(0);
    await expect(page.locator(".keyboard").getByRole("button", { name: "A", exact: true })).toHaveAccessibleDescription("correct position");
    expect(await correct.evaluate((cell) => getComputedStyle(cell, "::after").content)).toContain("✓");
    const audited = await new AxeBuilder({ page }).include(".app-header").include(".board-container").include(".keyboard").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(audited.violations).toEqual([]);
    for (const theme of ["dark", "light"]) {
      await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
      const ratios = await page.locator(".cell[data-feedback-symbol], .key").evaluateAll((elements) => {
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => {
            const n = value / 255; return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        return elements.map((element) => {
          const style = getComputedStyle(element);
          const a = luminance(style.color), b = luminance(style.backgroundColor);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        });
      });
      expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
    }
    await page.keyboard.type("apple");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Word", exact: true })).toBeVisible();
    await expect(page.locator(".confetti-container")).toHaveCount(0);
  });
  test("small, landscape and enlarged-text layouts keep the board and help reachable", async ({ page }) => {
    for (const size of [{ width: 320, height: 568 }, { width: 736, height: 320 }]) {
      await page.setViewportSize(size);
      await practice(page);
      await page.evaluate(() => document.documentElement.style.fontSize = "200%");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const help = page.getByRole("button", { name: "How To Play", exact: true });
      await help.click();
      const dialog = page.getByRole("dialog", { name: "How To Play", exact: true });
      const bounds = await dialog.boundingBox();
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height);
      await page.keyboard.press("Escape");
      await expect(help).toBeFocused();
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      await menu.click();
      const language = page.locator("#mobile-nav-menu select");
      await language.scrollIntoViewIfNeeded();
      await expect(language).toBeInViewport();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(menu).toBeFocused();
      await page.evaluate(() => document.documentElement.style.fontSize = "");
    }
  });
});

test.describe("existing languages rotation and audited flows", () => {
  test.use({ serviceWorkers: "block", reducedMotion: "reduce" });
  test("persisted daily answers stay stable across reads and independent players", async ({ page, browser }) => {
    await register(page);
    const first = await fixtureDailyWords(page.context());
    const again = await fixtureDailyWords(page.context());
    expect(again.en.word).toBe(first.en.word);
    expect(again.tr.word).toBe(first.tr.word);
    async function play(player: import("@playwright/test").Page) {
      const token = await player.evaluate(() => localStorage.getItem("jwtToken"));
      const headers = { Authorization: "Bearer " + token };
      const before = await player.context().request.get("/api/v1/daily/games?lang=en", { headers });
      expect((await before.json()).state).toBe("not_started");
      const started = await player.context().request.post("/api/v1/daily/games?lang=en", { headers });
      const game = await started.json();
      expect(game.answer).toBeNull();
      const result = await player.context().request.post(`/api/v1/daily/games/${game.id}/guesses`, { headers, data: { guess: first.en.word, attempt: 1 } });
      expect(result.status()).toBe(200);
      expect((await result.json()).status).toBe("won");
      const saved = await player.context().request.get(`/api/v1/daily/games/${game.id}`, { headers });
      expect((await saved.json()).answer).toBe(first.en.word);
    }
    await play(page);
    const other = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", serviceWorkers: "block" });
    try { const player = await other.newPage(); await register(player); await play(player); }
    finally { await other.close(); }
    expect((await fixtureDailyWords(page.context())).en.word).toBe(first.en.word);
  });

  test("themed word failures retry, result traps focus and the same next answer starts a fresh round", async ({ page }) => {
    let unavailable = true;
    await page.route("**/themes/marvel.json", (route) => unavailable
      ? route.fulfill({ status: 503, body: "unavailable" })
      : route.fulfill({ json: { words: ["STARK"] } }));
    await page.goto("/themes/marvel");
    await expect(page.getByRole("alert")).toContainText("Could not load this theme");
    await expect(page.getByRole("grid")).toHaveCount(0);
    unavailable = false;
    await page.getByRole("button", { name: "Retry word list", exact: true }).click();
    await expect(page.getByRole("grid")).toBeVisible();
    for (let round = 0; round < 2; round++) {
      await page.getByRole("grid").click();
      await page.keyboard.type("stark");
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Word", exact: true });
      const share = dialog.getByRole("button", { name: "Share Result", exact: true });
      await expect(share).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(dialog.getByRole("link")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(share).toBeFocused();
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
        for (const hovered of [false, true]) {
          if (hovered) await share.hover();
          else await page.mouse.move(0, 0);
          const scan = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
          expect(scan.violations).toEqual([]);
        }
      }
      await dialog.getByRole("button", { name: "Play Again", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.locator(".board-row").first()).toHaveText("");
    }
  });

  test("account errors focus the named field and security/recovery forms pass scoped accessibility checks", async ({ page }) => {
    await register(page);
    await page.goto("/account");
    await expect(page.locator("#current-password")).toBeVisible();
    let writes = 0;
    page.on("request", (request) => { if (request.method() === "POST") writes++; });
    await page.locator("#current-password").fill("browser-password-123");
    await page.locator("#security-password").fill("new-fixture-password-123");
    await page.locator("#security-confirm").fill("different-fixture-password");
    await page.getByRole("button", { name: "Change password", exact: true }).click();
    await expect(page.locator("#security-confirm")).toBeFocused();
    await expect(page.locator("#security-confirm")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#security-confirm")).toHaveAccessibleDescription(/matching passwords/);
    expect(writes).toBe(0);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
      const scan = await new AxeBuilder({ page }).include(".auth-card").withTags(["wcag2a", "wcag2aa"]).analyze();
      expect(scan.violations).toEqual([]);
    }
    await page.goto("/forgot-password");
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    const scan = await new AxeBuilder({ page }).include(".auth-card").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(scan.violations).toEqual([]);
    expect(writes).toBe(0);
  });
});
