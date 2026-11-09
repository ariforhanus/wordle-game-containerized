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
    expect(starts).toHaveLength(0);
  }
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/v1/daily/games",
  );
  await page.locator(".daily-start-card button").click();
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
    await page.getByRole("button", { name: /Start \/ resume/ }).click();
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
    await page.getByRole("button", { name: /Start \/ resume/ }).click();
    await expect(page.locator(".board-row").first()).toHaveText("APPLE");
    const tab = await context.newPage();
    await tab.goto("/daily");
    await tab.getByRole("button", { name: /Start \/ resume/ }).click();
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
