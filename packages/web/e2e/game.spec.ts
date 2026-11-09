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
      headers: { Authorization: "Bearer " + localStorage.getItem("jwtToken") },
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
      headers: { Authorization: "Bearer " + localStorage.getItem("jwtToken") },
    });
    return r.headers.get("Cache-Control");
  });
  expect(result).toBe("no-store");
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
            new RegExp(
              "http://localhost:3000/" + kind + "#token=[A-Za-z0-9_-]+",
            ),
          )?.[0] ?? "";
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
